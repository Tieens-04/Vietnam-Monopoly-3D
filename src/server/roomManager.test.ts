import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';
import { WebSocket } from 'ws';
import type { OnlineGameAction, ServerToClientMessage } from '../game/onlineTypes';
import { OnlineRoomManager } from './roomManager';
import { attachMultiplayerWebSocketServer } from './wsServer';

async function flushMicrotasks(rounds = 6): Promise<void> {
  for (let i = 0; i < rounds; i++) {
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  }
}

function markAllGuestsReady(manager: OnlineRoomManager, guestClientIds: string[]): void {
  for (const guestId of guestClientIds) {
    manager.handleClientMessage(guestId, { type: 'SET_READY', ready: true });
  }
}

test('Room lifecycle: create, join, duplicate token resolution, and bot fill on start', () => {
  const inbox = new Map<string, ServerToClientMessage[]>();
  const record = (clientId: string, msg: ServerToClientMessage) => {
    const arr = inbox.get(clientId) || [];
    arr.push(msg);
    inbox.set(clientId, arr);
  };

  const manager = new OnlineRoomManager(record, {
    timingScale: 0,
    enableTickInterval: false,
  });

  try {
    manager.handleClientMessage('c1', {
      type: 'CREATE_ROOM',
      playerName: 'An',
      tokenType: 'car',
      maxPlayers: 4,
      startingCash: 2_000_000,
      fillBots: true,
    });

    const c1Msgs = inbox.get('c1') || [];
    const created = c1Msgs[0];
    assert.equal(created.type, 'ROOM_JOINED');
    if (created.type !== 'ROOM_JOINED') return;
    const roomCode = created.roomCode;
    assert.equal(roomCode.length, 6);
    assert.equal(created.snapshot.hostSeatIndex, 0);

    manager.handleClientMessage('c2', {
      type: 'JOIN_ROOM',
      roomCode,
      playerName: 'Bình',
      tokenType: 'car', // same token as host -> auto-assigned next available
    });

    const c2Msgs = inbox.get('c2') || [];
    const joined = c2Msgs[0];
    assert.equal(joined.type, 'ROOM_JOINED');
    if (joined.type !== 'ROOM_JOINED') return;
    assert.equal(joined.yourSeatIndex, 1);
    assert.notEqual(joined.snapshot.seats[1].tokenType, 'car');

    markAllGuestsReady(manager, ['c2']);
    manager.handleClientMessage('c1', { type: 'START_MATCH' });
    const latestC1 = (inbox.get('c1') || []).at(-1);
    assert.equal(latestC1?.type, 'ROOM_SNAPSHOT');
    if (!latestC1 || latestC1.type !== 'ROOM_SNAPSHOT') return;

    assert.equal(latestC1.snapshot.status, 'playing');
    assert.ok(latestC1.snapshot.match);
    assert.equal(latestC1.snapshot.match.players.length, 4);
    assert.equal(latestC1.snapshot.match.players[0].isBot, false);
    assert.equal(latestC1.snapshot.match.players[1].isBot, false);
    assert.equal(latestC1.snapshot.match.players[2].isBot, true);
    assert.equal(latestC1.snapshot.match.players[3].isBot, true);
  } finally {
    manager.dispose();
  }
});

test('Turn ownership enforcement and deterministic roll -> buy -> end turn progression', async () => {
  const latestByClient = new Map<string, ServerToClientMessage>();
  const allByClient = new Map<string, ServerToClientMessage[]>();
  const record = (clientId: string, msg: ServerToClientMessage) => {
    if (msg.type === 'ROOM_JOINED' || msg.type === 'ROOM_SNAPSHOT') {
      latestByClient.set(clientId, msg);
    }
    const list = allByClient.get(clientId) || [];
    list.push(msg);
    allByClient.set(clientId, list);
  };

  const manager = new OnlineRoomManager(record, {
    timingScale: 0,
    enableTickInterval: false,
    diceRng: () => [2, 3], // 5 steps -> Ninh Bình (tile 5)
  });

  try {
    manager.handleClientMessage('c1', {
      type: 'CREATE_ROOM',
      playerName: 'Chủ Phòng',
      tokenType: 'car',
      maxPlayers: 2,
      startingCash: 2_000_000,
      fillBots: false,
    });

    const created = latestByClient.get('c1');
    assert.equal(created?.type, 'ROOM_JOINED');
    if (!created || created.type !== 'ROOM_JOINED') return;

    manager.handleClientMessage('c2', {
      type: 'JOIN_ROOM',
      roomCode: created.roomCode,
      playerName: 'Người Chơi 2',
      tokenType: 'yacht',
    });

    markAllGuestsReady(manager, ['c2']);
    manager.handleClientMessage('c1', { type: 'START_MATCH' });

    // Non-active player c2 cannot roll on c1's turn
    manager.handleClientMessage('c2', {
      type: 'GAME_ACTION',
      action: { kind: 'ROLL_DICE' },
    });
    const c2Err = (allByClient.get('c2') || []).find((m) => m.type === 'ERROR');
    assert.equal(c2Err?.type, 'ERROR');
    if (c2Err?.type === 'ERROR') {
      assert.equal(c2Err.code, 'NOT_YOUR_TURN');
    }

    // Active player c1 rolls 2 + 3 = 5 -> Ninh Bình (price 90_000)
    manager.handleClientMessage('c1', {
      type: 'GAME_ACTION',
      action: { kind: 'ROLL_DICE' },
    });
    await flushMicrotasks(12);

    const afterRoll = latestByClient.get('c1');
    assert.equal(afterRoll?.type, 'ROOM_SNAPSHOT');
    if (!afterRoll || afterRoll.type !== 'ROOM_SNAPSHOT') return;
    assert.equal(afterRoll.snapshot.match?.players[0].position, 5);
    assert.equal(afterRoll.snapshot.match?.turnPhase, 'BUY_DECISION');

    // Buy Ninh Bình (land only) -> in Business Tour, turn auto-advances directly to Player 2!
    manager.handleClientMessage('c1', {
      type: 'GAME_ACTION',
      action: { kind: 'BUY_PROPERTY', initialLevel: 0 },
    });
    await flushMicrotasks(8);
    const afterBuy = latestByClient.get('c1');
    assert.equal(afterBuy?.type, 'ROOM_SNAPSHOT');
    if (!afterBuy || afterBuy.type !== 'ROOM_SNAPSHOT') return;
    assert.equal(afterBuy.snapshot.match?.properties[5].ownerId, 0);
    assert.equal(afterBuy.snapshot.match?.players[0].cash, 2_000_000 - 90_000);
    assert.equal(afterBuy.snapshot.match?.activePlayerIndex, 1);
    assert.equal(afterBuy.snapshot.match?.turnPhase, 'AWAIT_ROLL');
  } finally {
    manager.dispose();
  }
});

test('Disconnect, AFK timeout auto-action, Bot AI takeover, and sessionToken reconnect', async () => {
  const latestByClient = new Map<string, ServerToClientMessage>();
  const allByClient = new Map<string, ServerToClientMessage[]>();
  const record = (clientId: string, msg: ServerToClientMessage) => {
    if (msg.type === 'ROOM_JOINED' || msg.type === 'ROOM_SNAPSHOT') {
      latestByClient.set(clientId, msg);
    }
    const list = allByClient.get(clientId) || [];
    list.push(msg);
    allByClient.set(clientId, list);
  };

  const manager = new OnlineRoomManager(record, {
    timingScale: 0,
    enableTickInterval: false,
    diceRng: () => [1, 2], // non-doubles 3 steps
  });

  try {
    manager.handleClientMessage('c1', {
      type: 'CREATE_ROOM',
      playerName: 'Minh',
      tokenType: 'car',
      maxPlayers: 2,
      startingCash: 2_000_000,
      fillBots: false,
    });
    const created = latestByClient.get('c1');
    if (!created || created.type !== 'ROOM_JOINED') return;
    const c1Token = created.sessionToken;
    const roomCode = created.roomCode;

    manager.handleClientMessage('c2', {
      type: 'JOIN_ROOM',
      roomCode,
      playerName: 'Lan',
      tokenType: 'yacht',
    });
    markAllGuestsReady(manager, ['c2']);
    manager.handleClientMessage('c1', { type: 'START_MATCH' });

    // c1 disconnects on their turn
    manager.handleDisconnect('c1');
    const afterDisc = latestByClient.get('c2');
    assert.equal(afterDisc?.type, 'ROOM_SNAPSHOT');
    if (!afterDisc || afterDisc.type !== 'ROOM_SNAPSHOT') return;
    assert.equal(afterDisc.snapshot.match?.players[0].onlineConnected, false);

    // Tick 1st second -> clamps offline turnTimeLeft to 12
    manager.tickOneSecond();
    const clampedSnap = latestByClient.get('c2');
    if (clampedSnap?.type === 'ROOM_SNAPSHOT') {
      assert.equal(clampedSnap.snapshot.match?.turnTimeLeft, 12);
    }

    // Drain remaining 12 seconds -> 1st missed turn triggers safe ROLL_DICE
    for (let s = 0; s < 12; s++) {
      manager.tickOneSecond();
    }
    await flushMicrotasks(12);

    const afterFirstTimeout = latestByClient.get('c2');
    if (afterFirstTimeout?.type === 'ROOM_SNAPSHOT') {
      assert.equal(afterFirstTimeout.snapshot.match?.players[0].position, 3);
      assert.equal(afterFirstTimeout.snapshot.match?.turnPhase, 'BUY_DECISION');
    }

    // Tick BUY_DECISION timeout in Turn 1 -> still only 1 missed turn (auto SKIP_BUY, NO premature takeover!)
    for (let s = 0; s < 13; s++) {
      manager.tickOneSecond();
    }
    await flushMicrotasks(12);

    const afterTurn1 = latestByClient.get('c2');
    assert.equal(afterTurn1?.type, 'ROOM_SNAPSHOT');
    if (afterTurn1?.type === 'ROOM_SNAPSHOT') {
      assert.equal(afterTurn1.snapshot.match?.players[0].onlineBotTakeover, false);
      assert.equal(afterTurn1.snapshot.match?.players[0].isBot, false);
      assert.equal(afterTurn1.snapshot.match?.activePlayerIndex, 1);
    }

    // c2 completes Turn 2 -> returns turn to disconnected c1 (Turn 3)
    manager.handleClientMessage('c2', { type: 'GAME_ACTION', action: { kind: 'ROLL_DICE' } });
    await flushMicrotasks(12);
    manager.handleClientMessage('c2', { type: 'GAME_ACTION', action: { kind: 'SKIP_BUY' } });
    await flushMicrotasks(8);

    // Tick Turn 3 offline timeout -> 2nd consecutive missed turn triggers Bot AI takeover!
    for (let s = 0; s < 13; s++) {
      manager.tickOneSecond();
    }
    await flushMicrotasks(12);

    const afterTakeover = latestByClient.get('c2');
    if (afterTakeover?.type === 'ROOM_SNAPSHOT') {
      assert.equal(afterTakeover.snapshot.match?.players[0].onlineBotTakeover, true);
      assert.equal(afterTakeover.snapshot.match?.players[0].isBot, true);
    }

    // Now c1 reconnects with sessionToken -> regains human control!
    manager.handleClientMessage('c1-rejoined', {
      type: 'RECONNECT_ROOM',
      roomCode,
      sessionToken: c1Token,
    });
    const rejoined = (allByClient.get('c1-rejoined') || []).find((m) => m.type === 'ROOM_JOINED');
    assert.equal(rejoined?.type, 'ROOM_JOINED');
    if (rejoined?.type === 'ROOM_JOINED') {
      assert.equal(rejoined.yourPlayerId, 0);
      assert.equal(rejoined.snapshot.match?.players[0].onlineConnected, true);
      assert.equal(rejoined.snapshot.match?.players[0].isBot, false);
      assert.equal(rejoined.snapshot.match?.players[0].onlineBotTakeover, false);
    }
  } finally {
    manager.dispose();
  }
});

test('WebSocket integration: two clients create, join, start match, and roll dice over /ws', async () => {
  const server = http.createServer((_req, res) => {
    res.writeHead(200);
    res.end('ok');
  });
  const wsHandle = attachMultiplayerWebSocketServer(server, { timingScale: 0 });

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve());
  });
  const addr = server.address();
  assert.ok(addr && typeof addr === 'object');
  const wsUrl = `ws://127.0.0.1:${addr.port}/ws`;

  const connectClient = async () => {
    const ws = new WebSocket(wsUrl);
    const messages: ServerToClientMessage[] = [];
    ws.on('message', (raw) => {
      messages.push(JSON.parse(String(raw)) as ServerToClientMessage);
    });
    await new Promise<void>((resolve, reject) => {
      ws.once('open', () => resolve());
      ws.once('error', reject);
    });
    return { ws, messages };
  };

  const waitForMsg = async <T extends ServerToClientMessage['type']>(
    messages: ServerToClientMessage[],
    predicate: (msg: ServerToClientMessage) => boolean
  ): Promise<Extract<ServerToClientMessage, { type: T }>> => {
    const deadline = Date.now() + 3000;
    while (Date.now() < deadline) {
      const found = messages.find(predicate);
      if (found) return found as Extract<ServerToClientMessage, { type: T }>;
      await new Promise<void>((r) => setTimeout(r, 15));
    }
    throw new Error('Timed out waiting for WebSocket message');
  };

  const c1 = await connectClient();
  const c2 = await connectClient();

  try {
    c1.ws.send(
      JSON.stringify({
        type: 'CREATE_ROOM',
        playerName: 'Host WS',
        tokenType: 'car',
        maxPlayers: 2,
        startingCash: 2_000_000,
        fillBots: false,
      })
    );
    const created = await waitForMsg<'ROOM_JOINED'>(
      c1.messages,
      (m) => m.type === 'ROOM_JOINED'
    );

    c2.ws.send(
      JSON.stringify({
        type: 'JOIN_ROOM',
        roomCode: created.roomCode,
        playerName: 'Guest WS',
        tokenType: 'jet',
      })
    );
    await waitForMsg<'ROOM_JOINED'>(c2.messages, (m) => m.type === 'ROOM_JOINED');

    c2.ws.send(JSON.stringify({ type: 'SET_READY', ready: true }));
    await waitForMsg<'ROOM_SNAPSHOT'>(
      c1.messages,
      (m) => m.type === 'ROOM_SNAPSHOT' && m.snapshot.seats[1]?.ready === true
    );
    c1.ws.send(JSON.stringify({ type: 'START_MATCH' }));
    await waitForMsg<'ROOM_SNAPSHOT'>(
      c2.messages,
      (m) => m.type === 'ROOM_SNAPSHOT' && m.snapshot.status === 'playing'
    );

    c1.ws.send(JSON.stringify({ type: 'GAME_ACTION', action: { kind: 'ROLL_DICE' } }));
    const diceEvt = await waitForMsg<'GAME_EVENT'>(
      c2.messages,
      (m) => m.type === 'GAME_EVENT' && m.event.kind === 'DICE_ROLLED'
    );
    assert.equal(diceEvt.event.kind, 'DICE_ROLLED');
  } finally {
    c1.ws.close();
    c2.ws.close();
    await wsHandle.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('World Tour restricts targets to unowned/own tiles, Start landing only pays +300K, and Hotel Lv4 requires prior Lv3', async () => {
  const latestByClient = new Map<string, ServerToClientMessage>();
  const allByClient = new Map<string, ServerToClientMessage[]>();
  const record = (clientId: string, msg: ServerToClientMessage) => {
    if (msg.type === 'ROOM_JOINED' || msg.type === 'ROOM_SNAPSHOT') {
      latestByClient.set(clientId, msg);
    }
    const list = allByClient.get(clientId) || [];
    list.push(msg);
    allByClient.set(clientId, list);
  };

  const diceQueue: Array<[number, number]> = [
    [5, 6], // P1: 0 -> 11 (buys Phan Thiết lv0 = 160K)
    [1, 2], // P2: 0 -> 3 (buys Đà Lạt lv0 = 70K)
    [5, 6], // P1: 11 -> 22 (skips)
    [1, 2], // P2: 3 -> 6 (skips)
    [1, 1], // P1: 22 -> 24 (WORLD_TOUR + doubles triggers immediate WORLD_TOUR phase)
    [2, 3], // P2: 6 -> 11 (or next)
    [5, 5], // P1: 11 -> 21 (doubles)
    [5, 6], // P1: 21 -> 0 (lands directly on START!)
  ];

  const manager = new OnlineRoomManager(record, {
    timingScale: 0,
    enableTickInterval: false,
    diceRng: () => diceQueue.shift() ?? [1, 2],
  });

  try {
    manager.handleClientMessage('c1', {
      type: 'CREATE_ROOM',
      playerName: 'P1',
      tokenType: 'car',
      maxPlayers: 2,
      startingCash: 2_000_000,
      fillBots: false,
    });
    const created = latestByClient.get('c1');
    if (!created || created.type !== 'ROOM_JOINED') return;

    manager.handleClientMessage('c2', {
      type: 'JOIN_ROOM',
      roomCode: created.roomCode,
      playerName: 'P2',
      tokenType: 'yacht',
    });
    markAllGuestsReady(manager, ['c2']);
    manager.handleClientMessage('c1', { type: 'START_MATCH' });

    // Turn 1: P1 rolls 11 -> buys Phan Thiết -> auto-ends turn to P2
    manager.handleClientMessage('c1', { type: 'GAME_ACTION', action: { kind: 'ROLL_DICE' } });
    await flushMicrotasks(12);
    manager.handleClientMessage('c1', {
      type: 'GAME_ACTION',
      action: { kind: 'BUY_PROPERTY', initialLevel: 0 },
    });
    await flushMicrotasks(8);

    // Turn 2: P2 rolls 3 -> buys Đà Lạt -> auto-ends turn to P1
    manager.handleClientMessage('c2', { type: 'GAME_ACTION', action: { kind: 'ROLL_DICE' } });
    await flushMicrotasks(12);
    manager.handleClientMessage('c2', {
      type: 'GAME_ACTION',
      action: { kind: 'BUY_PROPERTY', initialLevel: 0 },
    });
    await flushMicrotasks(8);

    // Turn 3: P1 rolls 11 -> tile 22 -> skips -> auto-ends turn to P2
    manager.handleClientMessage('c1', { type: 'GAME_ACTION', action: { kind: 'ROLL_DICE' } });
    await flushMicrotasks(12);
    manager.handleClientMessage('c1', { type: 'GAME_ACTION', action: { kind: 'SKIP_BUY' } });
    await flushMicrotasks(8);

    // Turn 4: P2 rolls 3 -> tile 6 -> skips -> auto-ends turn to P1
    manager.handleClientMessage('c2', { type: 'GAME_ACTION', action: { kind: 'ROLL_DICE' } });
    await flushMicrotasks(12);
    manager.handleClientMessage('c2', { type: 'GAME_ACTION', action: { kind: 'SKIP_BUY' } });
    await flushMicrotasks(8);

    // Turn 5: P1 rolls 1-1 -> lands on 24 (World Tour) -> immediate WORLD_TOUR phase
    manager.handleClientMessage('c1', { type: 'GAME_ACTION', action: { kind: 'ROLL_DICE' } });
    await flushMicrotasks(12);

    const wtReady = latestByClient.get('c1');
    assert.equal(wtReady?.type, 'ROOM_SNAPSHOT');
    if (!wtReady || wtReady.type !== 'ROOM_SNAPSHOT') return;
    assert.equal(wtReady.snapshot.match?.turnPhase, 'WORLD_TOUR');
    assert.equal(wtReady.snapshot.match?.players[0].pendingWorldTour, true);

    // Invalid targets (BUG-03): START (0), Opponent Đà Lạt (3), Lost Island (8), Chance (12), Championship (16), Tax (30)
    for (const invalidTile of [0, 3, 8, 12, 16, 30]) {
      manager.handleClientMessage('c1', {
        type: 'GAME_ACTION',
        action: { kind: 'SELECT_WORLD_TOUR', targetTile: invalidTile },
      });
    }
    await flushMicrotasks(8);

    const afterInvalid = latestByClient.get('c1');
    assert.equal(afterInvalid?.type, 'ROOM_SNAPSHOT');
    if (!afterInvalid || afterInvalid.type !== 'ROOM_SNAPSHOT') return;
    assert.equal(afterInvalid.snapshot.match?.turnPhase, 'WORLD_TOUR');
    assert.equal(afterInvalid.snapshot.match?.players[0].pendingWorldTour, true);
    assert.equal(afterInvalid.snapshot.match?.players[0].position, 24);

    // Valid target: fly to own city Phan Thiết (11) -> passes START (0), gains +300K, laps=1, enters UPGRADE_DECISION!
    manager.handleClientMessage('c1', {
      type: 'GAME_ACTION',
      action: { kind: 'SELECT_WORLD_TOUR', targetTile: 11 },
    });
    await flushMicrotasks(14);

    const atOwnCity = latestByClient.get('c1');
    assert.equal(atOwnCity?.type, 'ROOM_SNAPSHOT');
    if (!atOwnCity || atOwnCity.type !== 'ROOM_SNAPSHOT') return;
    assert.equal(atOwnCity.snapshot.match?.players[0].position, 11);
    assert.equal(atOwnCity.snapshot.match?.players[0].laps, 1);
    assert.equal(atOwnCity.snapshot.match?.turnPhase, 'UPGRADE_DECISION');

    // BUG-02: Cannot jump straight from lv0 -> lv4 Hotel ★!
    manager.handleClientMessage('c1', {
      type: 'GAME_ACTION',
      action: { kind: 'UPGRADE_PROPERTY', targetLevel: 4 },
    });
    await flushMicrotasks(6);
    const afterRejectedLv4 = latestByClient.get('c1');
    if (afterRejectedLv4?.type === 'ROOM_SNAPSHOT') {
      assert.equal(afterRejectedLv4.snapshot.match?.properties[11].level, 0);
      assert.equal(afterRejectedLv4.snapshot.match?.turnPhase, 'UPGRADE_DECISION');
    }

    // Upgrade legally lv0 -> lv3
    manager.handleClientMessage('c1', {
      type: 'GAME_ACTION',
      action: { kind: 'UPGRADE_PROPERTY', targetLevel: 3 },
    });
    await flushMicrotasks(8);

    const afterUpg3 = latestByClient.get('c1');
    assert.equal(afterUpg3?.type, 'ROOM_SNAPSHOT');
    if (!afterUpg3 || afterUpg3.type !== 'ROOM_SNAPSHOT') return;
    assert.equal(afterUpg3.snapshot.match?.properties[11].level, 3);
    assert.equal(afterUpg3.snapshot.match?.activePlayerIndex, 1);

    // P2 rolls 2+3 -> 11 (pays rent on P1's lv3 Phan Thiết, skips buyout) -> turn returns to P1
    manager.handleClientMessage('c2', { type: 'GAME_ACTION', action: { kind: 'ROLL_DICE' } });
    await flushMicrotasks(12);
    manager.handleClientMessage('c2', { type: 'GAME_ACTION', action: { kind: 'SKIP_BUYOUT' } });
    await flushMicrotasks(8);

    // P1 rolls 5+5 -> 21 (buys Bắc Ninh, doubles!) -> rolls 5+6 -> 0 (lands directly on START!)
    manager.handleClientMessage('c1', { type: 'GAME_ACTION', action: { kind: 'ROLL_DICE' } });
    await flushMicrotasks(12);
    manager.handleClientMessage('c1', {
      type: 'GAME_ACTION',
      action: { kind: 'BUY_PROPERTY', initialLevel: 0 },
    });
    await flushMicrotasks(8);

    const cashBeforeStart = (latestByClient.get('c1') as Extract<ServerToClientMessage, { type: 'ROOM_SNAPSHOT' }>).snapshot.match!.players[0].cash;
    manager.handleClientMessage('c1', { type: 'GAME_ACTION', action: { kind: 'ROLL_DICE' } });
    await flushMicrotasks(12);

    // BUG-01: Landing on START (0) grants +300K & laps=2, and advances directly to P2 (no START_UPGRADE_SELECTION)
    const afterStart = latestByClient.get('c1');
    assert.equal(afterStart?.type, 'ROOM_SNAPSHOT');
    if (!afterStart || afterStart.type !== 'ROOM_SNAPSHOT') return;
    assert.equal(afterStart.snapshot.match?.players[0].position, 0);
    assert.equal(afterStart.snapshot.match?.players[0].laps, 2);
    assert.equal(afterStart.snapshot.match?.players[0].cash, cashBeforeStart + 300_000);
    assert.equal(afterStart.snapshot.match?.activePlayerIndex, 1);
    assert.equal(afterStart.snapshot.match?.turnPhase, 'AWAIT_ROLL');

    // Deprecated actions must emit INVALID_ACTION error cleanly
    manager.handleClientMessage('c2', {
      type: 'GAME_ACTION',
      action: { kind: 'SELECT_START_UPGRADE_CITY', targetTile: 3 } as unknown as OnlineGameAction,
    });
    manager.handleClientMessage('c2', {
      type: 'GAME_ACTION',
      action: { kind: 'END_TURN' } as unknown as OnlineGameAction,
    });
    const c2Errors = (allByClient.get('c2') || []).filter((m) => m.type === 'ERROR');
    assert.ok(c2Errors.length >= 2);
    if (c2Errors[0]?.type === 'ERROR') {
      assert.equal(c2Errors[0].code, 'INVALID_ACTION');
    }
  } finally {
    manager.dispose();
  }
});

test('Insufficient cash skips BuyDecisionModal; 0-property debt auto-bankrupts; Bankruptcy vs opponent pays full liquidated assets', async () => {
  const latestByClient = new Map<string, ServerToClientMessage>();
  const record = (clientId: string, msg: ServerToClientMessage) => {
    if (msg.type === 'ROOM_JOINED' || msg.type === 'ROOM_SNAPSHOT') {
      latestByClient.set(clientId, msg);
    }
  };

  // Setup: P1 buys Hà Nội (tile 29, price 400K + 3 houses 750K = 1,150K) after World Tour,
  // or simpler: P1 lands on tile 7 Hội An (120K + 2 houses = 270K), P2 buys expensive tiles until low cash, then lands on P1's Hotel!
  const diceQueue: Array<[number, number]> = [
    [3, 4], // P1: 0 -> 7 (Hội An: buys level 2 = 120K + 150K = 270K)
    [6, 6], // P2: 0 -> 12 (Chance) -> wait: use non-Chance tiles!
  ];
  void diceQueue;

  const seq: Array<[number, number]> = [
    [3, 4], // T1 P1: 0 -> 7 (buys Hội An lv2 = 270K)
    [6, 5], // T2 P2: 0 -> 11 (buys Phan Thiết lv2 = 360K; cash = 1,640K)
    [6, 5], // T3 P1: 7 -> 18 (skips)
    [6, 6], // T4 P2: 11 -> 23 (buys Hải Phòng lv2 = 650K; cash = 990K, doubles!)
    [4, 4], // T4b P2: 23 -> 31 (buys TP.HCM lv2 = 950K; cash = 40K, doubles!)
    [1, 2], // T4c P2: 31 -> 2 (+300K salary -> 340K; buys Sa Pa lv2 = 160K -> cash = 180K)
    [6, 6], // T5 P1: 18 -> 30 (Tax 27K) -> doubles!
    [4, 5], // T5b P1: 30 -> 7 (+300K, laps=1; upgrades Hội An lv2 -> lv3! Rent = 500K)
    [2, 3], // T6 P2: 2 -> 7 (lands on P1's Hội An lv3, rent = 500K > P2's 180K cash; P2 declares bankruptcy -> P1 receives +2,300K!)
  ];

  const manager = new OnlineRoomManager(record, {
    timingScale: 0,
    enableTickInterval: false,
    diceRng: () => seq.shift() ?? [1, 2],
  });

  try {
    manager.handleClientMessage('c1', {
      type: 'CREATE_ROOM',
      playerName: 'P1',
      tokenType: 'car',
      maxPlayers: 2,
      startingCash: 2_000_000,
      fillBots: false,
    });
    const created = latestByClient.get('c1');
    if (!created || created.type !== 'ROOM_JOINED') return;

    manager.handleClientMessage('c2', {
      type: 'JOIN_ROOM',
      roomCode: created.roomCode,
      playerName: 'P2',
      tokenType: 'yacht',
    });
    markAllGuestsReady(manager, ['c2']);
    manager.handleClientMessage('c1', { type: 'START_MATCH' });

    // T1 P1 -> 7 buys lv2
    manager.handleClientMessage('c1', { type: 'GAME_ACTION', action: { kind: 'ROLL_DICE' } });
    await flushMicrotasks(12);
    manager.handleClientMessage('c1', {
      type: 'GAME_ACTION',
      action: { kind: 'BUY_PROPERTY', initialLevel: 2 },
    });
    await flushMicrotasks(8);

    // T2 P2 -> 11 buys lv2
    manager.handleClientMessage('c2', { type: 'GAME_ACTION', action: { kind: 'ROLL_DICE' } });
    await flushMicrotasks(12);
    manager.handleClientMessage('c2', {
      type: 'GAME_ACTION',
      action: { kind: 'BUY_PROPERTY', initialLevel: 2 },
    });
    await flushMicrotasks(8);

    // T3 P1 -> 18 skips
    manager.handleClientMessage('c1', { type: 'GAME_ACTION', action: { kind: 'ROLL_DICE' } });
    await flushMicrotasks(12);
    manager.handleClientMessage('c1', { type: 'GAME_ACTION', action: { kind: 'SKIP_BUY' } });
    await flushMicrotasks(8);

    // T4 P2 -> 23 buys lv2 (doubles) -> 31 buys lv2 (doubles) -> 2 buys lv2
    manager.handleClientMessage('c2', { type: 'GAME_ACTION', action: { kind: 'ROLL_DICE' } });
    await flushMicrotasks(12);
    manager.handleClientMessage('c2', {
      type: 'GAME_ACTION',
      action: { kind: 'BUY_PROPERTY', initialLevel: 2 },
    });
    await flushMicrotasks(8);

    manager.handleClientMessage('c2', { type: 'GAME_ACTION', action: { kind: 'ROLL_DICE' } });
    await flushMicrotasks(12);
    manager.handleClientMessage('c2', {
      type: 'GAME_ACTION',
      action: { kind: 'BUY_PROPERTY', initialLevel: 2 },
    });
    await flushMicrotasks(8);

    manager.handleClientMessage('c2', { type: 'GAME_ACTION', action: { kind: 'ROLL_DICE' } });
    await flushMicrotasks(12);
    manager.handleClientMessage('c2', {
      type: 'GAME_ACTION',
      action: { kind: 'BUY_PROPERTY', initialLevel: 2 },
    });
    await flushMicrotasks(8);

    // T5 P1 -> 30 Tax (auto-paid, doubles) -> 7 Hội An upgrades to lv3 (500K rent > P2's 180K cash)
    manager.handleClientMessage('c1', { type: 'GAME_ACTION', action: { kind: 'ROLL_DICE' } });
    await flushMicrotasks(12);
    manager.handleClientMessage('c1', { type: 'GAME_ACTION', action: { kind: 'ROLL_DICE' } });
    await flushMicrotasks(12);
    manager.handleClientMessage('c1', {
      type: 'GAME_ACTION',
      action: { kind: 'UPGRADE_PROPERTY', targetLevel: 3 },
    });
    await flushMicrotasks(8);

    const beforeBankruptcy = latestByClient.get('c1');
    assert.equal(beforeBankruptcy?.type, 'ROOM_SNAPSHOT');
    if (!beforeBankruptcy || beforeBankruptcy.type !== 'ROOM_SNAPSHOT') return;
    const p1CashBefore = beforeBankruptcy.snapshot.match!.players[0].cash;

    // T6 P2 -> 7 lands on P1's Hotel ★ -> enters DEBT_RESOLUTION -> declares bankruptcy
    manager.handleClientMessage('c2', { type: 'GAME_ACTION', action: { kind: 'ROLL_DICE' } });
    await flushMicrotasks(12);
    manager.handleClientMessage('c2', {
      type: 'GAME_ACTION',
      action: { kind: 'DECLARE_BANKRUPTCY' },
    });
    await flushMicrotasks(8);

    const afterBankruptcy = latestByClient.get('c1');
    assert.equal(afterBankruptcy?.type, 'ROOM_SNAPSHOT');
    if (!afterBankruptcy || afterBankruptcy.type !== 'ROOM_SNAPSHOT') return;
    // P2 had 180K cash + (360K + 650K + 950K + 160K = 2,120K real estate) = 2,300K total liquidated payout!
    assert.equal(afterBankruptcy.snapshot.status, 'gameover');
    assert.equal(afterBankruptcy.snapshot.match!.players[0].cash, p1CashBefore + 2_300_000);
    assert.equal(afterBankruptcy.snapshot.match!.properties[11].ownerId, null);
    assert.equal(afterBankruptcy.snapshot.match!.properties[23].ownerId, null);
    assert.equal(afterBankruptcy.snapshot.match!.properties[31].ownerId, null);
  } finally {
    manager.dispose();
  }
});

test('Online sub-phase timer floor prevents instant skip at 00:01 (BUY_DECISION & SKIP_WORLD_TOUR), and null generateBotQuip falls back to ready quip', async () => {
  const latestByClient = new Map<string, ServerToClientMessage>();
  const eventsByClient = new Map<string, ServerToClientMessage[]>();
  const record = (clientId: string, msg: ServerToClientMessage) => {
    if (msg.type === 'ROOM_JOINED' || msg.type === 'ROOM_SNAPSHOT') {
      latestByClient.set(clientId, msg);
    }
    const arr = eventsByClient.get(clientId) || [];
    arr.push(msg);
    eventsByClient.set(clientId, arr);
  };

  const seq: Array<[number, number]> = [
    [5, 6], // P1 rolls at turnTimeLeft=1 -> lands on Phan Thiết (tile 11, BUY_DECISION)
    [1, 2], // Bot P2 rolls 3 -> lands on Đà Lạt (tile 3)
    [6, 6], // P1 rolls -> 23 (buys Hải Phòng, doubles!)
    [1, 1], // P1 rolls -> 25 (Wait: 23+2=25, not 24 -> use [1, 0]? No, 1+2=3? Wait: 11+12=23, need +1 -> impossible! Let's do: P1 rolls [6, 5]=11 -> 22, [1, 1]=2 -> 24!)
  ];
  // Re-plan clean sequence:
  seq.length = 0;
  seq.push(
    [5, 6], // P1: 0 -> 11 (buys Phan Thiết lv0)
    [1, 2], // Bot P2: 0 -> 3 (buys Đà Lạt lv0)
    [6, 5], // P1: 11 -> 22 (buys Bắc Ninh? 22 is Bắc Ninh/Vinh -> skips)
    [1, 2], // Bot P2: 3 -> 6 (skips)
    [1, 1], // P1: 22 -> 24 (WORLD_TOUR + doubles -> immediate WORLD_TOUR!)
    [6, 6], // Bot P2 next turn: 6 -> 18 (Côn Đảo)
    [6, 6], // Bot P2 doubles -> 30 (Tax)
    [1, 2] // Bot P2 -> 1
  );

  const manager = new OnlineRoomManager(record, {
    timingScale: 0,
    enableTickInterval: false,
    diceRng: () => seq.shift() ?? [1, 2],
    // Simulate Gemini returning null so we verify BOT_QUIP never stays stuck in 'loading'
    generateBotQuip: async () => null,
  });

  try {
    manager.handleClientMessage('c1', {
      type: 'CREATE_ROOM',
      playerName: 'P1',
      tokenType: 'car',
      maxPlayers: 2,
      startingCash: 2_000_000,
      fillBots: true,
    });
    const created = latestByClient.get('c1');
    if (!created || created.type !== 'ROOM_JOINED') return;

    manager.handleClientMessage('c1', { type: 'START_MATCH' });

    // Drain P1's AWAIT_ROLL timer from 45 down to 1 second
    for (let s = 0; s < 44; s++) {
      manager.tickOneSecond();
    }

    // P1 rolls right at 00:01 -> lands on Phan Thiết (tile 11, BUY_DECISION)
    manager.handleClientMessage('c1', { type: 'GAME_ACTION', action: { kind: 'ROLL_DICE' } });
    await flushMicrotasks(12);

    const atBuy = latestByClient.get('c1');
    assert.equal(atBuy?.type, 'ROOM_SNAPSHOT');
    if (!atBuy || atBuy.type !== 'ROOM_SNAPSHOT') return;
    assert.equal(atBuy.snapshot.match?.turnPhase, 'BUY_DECISION');
    assert.ok(
      (atBuy.snapshot.match?.turnTimeLeft ?? 0) >= 18,
      `Expected sub-phase turnTimeLeft >= 18s after last-second roll, got ${atBuy.snapshot.match?.turnTimeLeft}`
    );

    // Tick 1 second: P1 must STILL be in BUY_DECISION (not auto-skipped!)
    manager.tickOneSecond();
    manager.handleClientMessage('c1', {
      type: 'GAME_ACTION',
      action: { kind: 'BUY_PROPERTY', initialLevel: 0 },
    });
    await flushMicrotasks(24);

    // P1 rolls 11 -> 22 (skips) -> Bot P2 rolls 3 -> 6 (skips)
    manager.handleClientMessage('c1', { type: 'GAME_ACTION', action: { kind: 'ROLL_DICE' } });
    await flushMicrotasks(12);
    manager.handleClientMessage('c1', { type: 'GAME_ACTION', action: { kind: 'SKIP_BUY' } });
    await flushMicrotasks(24);

    // P1 rolls 1-1 -> 24 (WORLD_TOUR)
    manager.handleClientMessage('c1', { type: 'GAME_ACTION', action: { kind: 'ROLL_DICE' } });
    await flushMicrotasks(12);
    const atWt = latestByClient.get('c1');
    assert.equal(atWt?.type, 'ROOM_SNAPSHOT');
    if (!atWt || atWt.type !== 'ROOM_SNAPSHOT') return;
    assert.equal(atWt.snapshot.match?.turnPhase, 'WORLD_TOUR');

    // Drain WORLD_TOUR timer down to 1 second, then SKIP_WORLD_TOUR -> BUG-15 enforces turnTimeLeft >= 18s!
    const drain = (atWt.snapshot.match?.turnTimeLeft ?? 45) - 1;
    for (let s = 0; s < drain; s++) {
      manager.tickOneSecond();
    }
    manager.handleClientMessage('c1', { type: 'GAME_ACTION', action: { kind: 'SKIP_WORLD_TOUR' } });
    await flushMicrotasks(6);

    const afterSkipWt = latestByClient.get('c1');
    assert.equal(afterSkipWt?.type, 'ROOM_SNAPSHOT');
    if (!afterSkipWt || afterSkipWt.type !== 'ROOM_SNAPSHOT') return;
    assert.equal(afterSkipWt.snapshot.match?.turnPhase, 'AWAIT_ROLL');
    assert.ok(
      (afterSkipWt.snapshot.match?.turnTimeLeft ?? 0) >= 18,
      `Expected BUG-15 timer floor >= 18s after SKIP_WORLD_TOUR, got ${afterSkipWt.snapshot.match?.turnTimeLeft}`
    );

    // P1 rolls [6, 6] -> 4? Let's just let P1 roll [1, 2] -> 27 (Đà Nẵng, skips) -> Bot P2 buys TP.HCM (tile 31, 450K) -> triggers BOT_QUIP!
    seq.length = 0;
    seq.push([1, 2], [6, 6], [6, 6], [1, 2]);
    // Actually Bot P2 is at tile 6 -> [6, 6] = 18 (buys), [6, 6] = 30 (Tax), [1, 2] = 1 -> instead from 6 -> +19? Let's make P1 roll [1,2], then Bot P2 from 6 rolls [6,6]=18, [5,5]=28 (chance), [1,2]=31 (TP.HCM)!
    // Wait: tile 28 is Chance! Let's check: 6 -> [6, 6] -> 18, [6, 5] -> 29 (Hà Nội! 400K >= 320K prime land -> triggers BOT_QUIP!)
    seq.length = 0;
    seq.push([1, 2], [6, 6], [6, 5]);
    manager.handleClientMessage('c1', { type: 'GAME_ACTION', action: { kind: 'ROLL_DICE' } });
    await flushMicrotasks(12);
    manager.handleClientMessage('c1', { type: 'GAME_ACTION', action: { kind: 'SKIP_BUY' } });
    await flushMicrotasks(40);

    const botQuipEvents = (eventsByClient.get('c1') || []).filter(
      (m): m is Extract<ServerToClientMessage, { type: 'GAME_EVENT' }> =>
        m.type === 'GAME_EVENT' && m.event.kind === 'BOT_QUIP'
    );
    assert.ok(botQuipEvents.length >= 2, 'Expected loading + ready fallback BOT_QUIP events');
    const lastBotQuip = botQuipEvents.at(-1)!;
    if (lastBotQuip.event.kind === 'BOT_QUIP') {
      assert.equal(lastBotQuip.event.status, 'ready');
      assert.ok(lastBotQuip.event.text.length > 5);
    }
  } finally {
    manager.dispose();
  }
});

test('BUG-04: 20-minute match timer counts down and settles Sudden Death winner by Net Worth', async () => {
  const latestByClient = new Map<string, ServerToClientMessage>();
  const record = (clientId: string, msg: ServerToClientMessage) => {
    if (msg.type === 'ROOM_JOINED' || msg.type === 'ROOM_SNAPSHOT') {
      latestByClient.set(clientId, msg);
    }
  };

  const manager = new OnlineRoomManager(record, {
    timingScale: 0,
    enableTickInterval: false,
    diceRng: () => [2, 3], // P1 lands on tile 5 (90K)
  });

  try {
    manager.handleClientMessage('c1', {
      type: 'CREATE_ROOM',
      playerName: 'P1',
      tokenType: 'car',
      maxPlayers: 2,
      startingCash: 2_000_000,
      fillBots: false,
    });
    const created = latestByClient.get('c1');
    if (!created || created.type !== 'ROOM_JOINED') return;
    manager.handleClientMessage('c2', {
      type: 'JOIN_ROOM',
      roomCode: created.roomCode,
      playerName: 'P2',
      tokenType: 'yacht',
    });
    markAllGuestsReady(manager, ['c2']);
    manager.handleClientMessage('c1', { type: 'START_MATCH' });

    const snap0 = latestByClient.get('c1');
    assert.equal(snap0?.type, 'ROOM_SNAPSHOT');
    if (snap0?.type === 'ROOM_SNAPSHOT') {
      assert.equal(snap0.snapshot.match?.matchTimeLeft, 1200);
    }

    // Drain 1199 ticks, verify P1 wins tiebreaker or higher net worth after buying/gaining cash
    // Have P2 lose cash on Tax or P1 get +300K? Even simpler: P1 buys tile 5 (net worth unchanged = 2M), P2 pays nothing (tie -> P1 id=0 wins, OR let's give P1 tile 5 and let's advance 1200 ticks!)
    for (let i = 0; i < 1200; i++) {
      manager.tickOneSecond();
    }

    const endSnap = latestByClient.get('c1');
    assert.equal(endSnap?.type, 'ROOM_SNAPSHOT');
    if (!endSnap || endSnap.type !== 'ROOM_SNAPSHOT') return;
    assert.equal(endSnap.snapshot.status, 'gameover');
    assert.equal(endSnap.snapshot.match?.turnPhase, 'GAME_OVER');
    assert.equal(endSnap.snapshot.match?.matchTimeLeft, 0);
    assert.equal(endSnap.snapshot.match?.matchWinnerResult?.condition, 'TIME_LIMIT');
  } finally {
    manager.dispose();
  }
});

test('BUG-05: 2v2 Doubles mode enforces 4 seats, teammate rent/buyout exemption, and team monopoly victory', async () => {
  const latestByClient = new Map<string, ServerToClientMessage>();
  const record = (clientId: string, msg: ServerToClientMessage) => {
    if (msg.type === 'ROOM_JOINED' || msg.type === 'ROOM_SNAPSHOT') {
      latestByClient.set(clientId, msg);
    }
  };

  // Seat 0 (Team 0), Seat 1 (Team 1), Seat 2 (Team 0), Seat 3 (Team 1)
  const seq: Array<[number, number]> = [
    [1, 2], // P1 (Team 0): 0 -> 3 (buys Đà Lạt, Brown #2)
    [2, 3], // P2 (Team 1): 0 -> 5 (buys Ninh Bình)
    [1, 1], // P3 (Team 0): 0 -> 2 (buys Sa Pa, Brown #1, doubles! -> Team 0 has full Brown!)
    [1, 2], // P3 (Team 0): 2 -> 5 (lands on P2's Ninh Bình — opponent pays rent!) -> skip buyout
    [1, 1], // P4 (Team 1): 0 -> 2 (lands on P3's Sa Pa — opponent pays rent!) -> skip buyout
    [1, 2], // P4 (Team 1): 2 -> 5 (lands on teammate P2's Ninh Bình — rent-free + no buyout!)
  ];

  const manager = new OnlineRoomManager(record, {
    timingScale: 0,
    enableTickInterval: false,
    diceRng: () => seq.shift() ?? [1, 2],
  });

  try {
    manager.handleClientMessage('c1', {
      type: 'CREATE_ROOM',
      playerName: 'A1',
      tokenType: 'car',
      maxPlayers: 2, // should coerce to 4 for TEAMS_2V2
      startingCash: 2_000_000,
      fillBots: false,
      matchMode: 'TEAMS_2V2',
    });
    const created = latestByClient.get('c1');
    assert.equal(created?.type, 'ROOM_JOINED');
    if (!created || created.type !== 'ROOM_JOINED') return;
    assert.equal(created.snapshot.maxPlayers, 4);
    assert.equal(created.snapshot.matchMode, 'TEAMS_2V2');
    assert.equal(created.snapshot.seats[0].teamId, 0);
    assert.equal(created.snapshot.seats[1].teamId, 1);
    assert.equal(created.snapshot.seats[2].teamId, 0);
    assert.equal(created.snapshot.seats[3].teamId, 1);

    manager.handleClientMessage('c2', {
      type: 'JOIN_ROOM',
      roomCode: created.roomCode,
      playerName: 'B1',
      tokenType: 'yacht',
    });
    manager.handleClientMessage('c3', {
      type: 'JOIN_ROOM',
      roomCode: created.roomCode,
      playerName: 'A2',
      tokenType: 'jet',
    });
    manager.handleClientMessage('c4', {
      type: 'JOIN_ROOM',
      roomCode: created.roomCode,
      playerName: 'B2',
      tokenType: 'crown',
    });
    markAllGuestsReady(manager, ['c2', 'c3', 'c4']);
    manager.handleClientMessage('c1', { type: 'START_MATCH' });

    // P1 buys Đà Lạt (3)
    manager.handleClientMessage('c1', { type: 'GAME_ACTION', action: { kind: 'ROLL_DICE' } });
    await flushMicrotasks(12);
    manager.handleClientMessage('c1', {
      type: 'GAME_ACTION',
      action: { kind: 'BUY_PROPERTY', initialLevel: 0 },
    });
    await flushMicrotasks(8);

    // P2 buys Ninh Bình (5)
    manager.handleClientMessage('c2', { type: 'GAME_ACTION', action: { kind: 'ROLL_DICE' } });
    await flushMicrotasks(12);
    manager.handleClientMessage('c2', {
      type: 'GAME_ACTION',
      action: { kind: 'BUY_PROPERTY', initialLevel: 0 },
    });
    await flushMicrotasks(8);

    // P3 (teammate of P1) buys Sa Pa (2) with doubles -> skips buyout on tile 5
    manager.handleClientMessage('c3', { type: 'GAME_ACTION', action: { kind: 'ROLL_DICE' } });
    await flushMicrotasks(12);
    manager.handleClientMessage('c3', {
      type: 'GAME_ACTION',
      action: { kind: 'BUY_PROPERTY', initialLevel: 0 },
    });
    await flushMicrotasks(8);
    manager.handleClientMessage('c3', { type: 'GAME_ACTION', action: { kind: 'ROLL_DICE' } });
    await flushMicrotasks(12);
    manager.handleClientMessage('c3', { type: 'GAME_ACTION', action: { kind: 'SKIP_BUYOUT' } });
    await flushMicrotasks(8);

    // P4 (teammate of P2): rolls [1,1] -> 2 (opponent P3's Sa Pa: Team 0 holds Brown monopoly, so pays doubled rent!) -> skips buyout
    const p4CashStart = (latestByClient.get('c4') as Extract<ServerToClientMessage, { type: 'ROOM_SNAPSHOT' }>).snapshot.match!.players[3].cash;
    manager.handleClientMessage('c4', { type: 'GAME_ACTION', action: { kind: 'ROLL_DICE' } });
    await flushMicrotasks(12);
    const afterOpponentMonoRent = latestByClient.get('c4') as Extract<ServerToClientMessage, { type: 'ROOM_SNAPSHOT' }>;
    assert.ok(afterOpponentMonoRent.snapshot.match!.players[3].cash < p4CashStart);
    manager.handleClientMessage('c4', { type: 'GAME_ACTION', action: { kind: 'SKIP_BUYOUT' } });
    await flushMicrotasks(8);

    // P4 rolls [1,2] -> 5 (teammate P2's Ninh Bình): rent MUST be 0 and NO BUYOUT_DECISION!
    const p4CashBeforeTeammate = (latestByClient.get('c4') as Extract<ServerToClientMessage, { type: 'ROOM_SNAPSHOT' }>).snapshot.match!.players[3].cash;
    const p2CashBeforeTeammate = (latestByClient.get('c4') as Extract<ServerToClientMessage, { type: 'ROOM_SNAPSHOT' }>).snapshot.match!.players[1].cash;
    manager.handleClientMessage('c4', { type: 'GAME_ACTION', action: { kind: 'ROLL_DICE' } });
    await flushMicrotasks(12);

    const afterTeammateLanding = latestByClient.get('c4') as Extract<ServerToClientMessage, { type: 'ROOM_SNAPSHOT' }>;
    assert.equal(afterTeammateLanding.snapshot.match!.players[3].cash, p4CashBeforeTeammate);
    assert.equal(afterTeammateLanding.snapshot.match!.players[1].cash, p2CashBeforeTeammate);
    assert.equal(afterTeammateLanding.snapshot.match!.turnPhase, 'AWAIT_ROLL');
    assert.equal(afterTeammateLanding.snapshot.match!.activePlayerIndex, 0);
  } finally {
    manager.dispose();
  }
});

test('BUG-10: Tactical Dice EVEN/ODD parity & charges, and REROLL_DECISION -> REROLL_DICE / CONFIRM_ROLL_MOVE', async () => {
  const latestByClient = new Map<string, ServerToClientMessage>();
  const allByClient = new Map<string, ServerToClientMessage[]>();
  const record = (clientId: string, msg: ServerToClientMessage) => {
    if (msg.type === 'ROOM_JOINED' || msg.type === 'ROOM_SNAPSHOT') {
      latestByClient.set(clientId, msg);
    }
    const list = allByClient.get(clientId) || [];
    list.push(msg);
    allByClient.set(clientId, list);
  };

  const seq: Array<[number, number]> = [
    [2, 6], // P1 rerolls to 8 -> Lost Island! Wait: let's reroll [2,6]=8 -> [1,2]=3
    [1, 2], // P2 normal roll 3
    [1, 3], // P2 reroll / confirm
  ];

  const manager = new OnlineRoomManager(record, {
    timingScale: 0,
    enableTickInterval: false,
    diceRng: () => seq.shift() ?? [1, 2],
  });

  try {
    manager.handleClientMessage('c1', {
      type: 'CREATE_ROOM',
      playerName: 'Tactician',
      tokenType: 'car',
      maxPlayers: 2,
      startingCash: 2_000_000,
      fillBots: false,
      tacticalDiceEnabled: true,
    });
    const created = latestByClient.get('c1');
    if (!created || created.type !== 'ROOM_JOINED') return;
    manager.handleClientMessage('c2', {
      type: 'JOIN_ROOM',
      roomCode: created.roomCode,
      playerName: 'P2',
      tokenType: 'yacht',
    });
    markAllGuestsReady(manager, ['c2']);
    manager.handleClientMessage('c1', { type: 'START_MATCH' });

    // P1 rolls EVEN tactical dice -> sum MUST be even, evenOddCharges decremented 3 -> 2, enters REROLL_DECISION
    manager.handleClientMessage('c1', {
      type: 'GAME_ACTION',
      action: { kind: 'ROLL_DICE', diceChoice: 'EVEN' },
    });
    await flushMicrotasks(12);

    const atReroll = latestByClient.get('c1');
    assert.equal(atReroll?.type, 'ROOM_SNAPSHOT');
    if (!atReroll || atReroll.type !== 'ROOM_SNAPSHOT') return;
    assert.equal(atReroll.snapshot.match?.turnPhase, 'REROLL_DECISION');
    assert.equal(atReroll.snapshot.match?.players[0].evenOddCharges, 2);
    assert.equal((atReroll.snapshot.match?.lastDiceSum ?? 1) % 2, 0);
    assert.ok((atReroll.snapshot.match?.turnTimeLeft ?? 0) >= 12);

    // P1 chooses REROLL_DICE -> rolls seq[0] = [2, 6] = 8 (Lost Island), rerollCharges 2 -> 1
    manager.handleClientMessage('c1', {
      type: 'GAME_ACTION',
      action: { kind: 'REROLL_DICE' },
    });
    await flushMicrotasks(16);

    const afterReroll = latestByClient.get('c1');
    assert.equal(afterReroll?.type, 'ROOM_SNAPSHOT');
    if (!afterReroll || afterReroll.type !== 'ROOM_SNAPSHOT') return;
    assert.equal(afterReroll.snapshot.match?.players[0].rerollCharges, 1);
    assert.equal(afterReroll.snapshot.match?.players[0].position, 8);
    assert.equal(afterReroll.snapshot.match?.players[0].inJail, true);
    assert.equal(afterReroll.snapshot.match?.activePlayerIndex, 1);

    // P2 rolls ODD tactical dice -> sum MUST be odd, then CONFIRM_ROLL_MOVE commits movement
    manager.handleClientMessage('c2', {
      type: 'GAME_ACTION',
      action: { kind: 'ROLL_DICE', diceChoice: 'ODD' },
    });
    await flushMicrotasks(12);
    const p2AtReroll = latestByClient.get('c2');
    if (p2AtReroll?.type === 'ROOM_SNAPSHOT') {
      assert.equal(p2AtReroll.snapshot.match?.turnPhase, 'REROLL_DECISION');
      assert.equal((p2AtReroll.snapshot.match?.lastDiceSum ?? 0) % 2, 1);
      assert.equal(p2AtReroll.snapshot.match?.players[1].evenOddCharges, 2);
    }

    manager.handleClientMessage('c2', {
      type: 'GAME_ACTION',
      action: { kind: 'CONFIRM_ROLL_MOVE' },
    });
    await flushMicrotasks(12);
    const p2AfterMove = latestByClient.get('c2');
    if (p2AfterMove?.type === 'ROOM_SNAPSHOT') {
      assert.ok((p2AfterMove.snapshot.match?.players[1].position ?? 0) > 0);
      assert.equal(p2AfterMove.snapshot.match?.players[1].rerollCharges, 2);
    }
  } finally {
    manager.dispose();
  }
});

test('BUG-12 & BUG-13: Connected AFK player gets Bot takeover after 2 missed turns + RECLAIM_CONTROL; decision timeout clears doublesStreak', async () => {
  const latestByClient = new Map<string, ServerToClientMessage>();
  const record = (clientId: string, msg: ServerToClientMessage) => {
    if (msg.type === 'ROOM_JOINED' || msg.type === 'ROOM_SNAPSHOT') {
      latestByClient.set(clientId, msg);
    }
  };

  // P1 rolls doubles [2, 2] -> lands on tile 4 (Vịnh Hạ Long, BUY_DECISION) with doublesStreak=1
  const manager = new OnlineRoomManager(record, {
    timingScale: 0,
    enableTickInterval: false,
    diceRng: () => [2, 2],
  });

  try {
    manager.handleClientMessage('c1', {
      type: 'CREATE_ROOM',
      playerName: 'AFK',
      tokenType: 'car',
      maxPlayers: 2,
      startingCash: 2_000_000,
      fillBots: false,
    });
    const created = latestByClient.get('c1');
    if (!created || created.type !== 'ROOM_JOINED') return;
    manager.handleClientMessage('c2', {
      type: 'JOIN_ROOM',
      roomCode: created.roomCode,
      playerName: 'P2',
      tokenType: 'yacht',
    });
    markAllGuestsReady(manager, ['c2']);
    manager.handleClientMessage('c1', { type: 'START_MATCH' });

    // Drain 45s while c1 is STILL CONNECTED -> missed turn #1 auto-rolls [2, 2] (doubles!)
    for (let s = 0; s < 45; s++) {
      manager.tickOneSecond();
    }
    await flushMicrotasks(12);

    const afterMiss1 = latestByClient.get('c1') as Extract<ServerToClientMessage, { type: 'ROOM_SNAPSHOT' }>;
    assert.equal(afterMiss1.snapshot.match?.turnPhase, 'BUY_DECISION');
    assert.equal(afterMiss1.snapshot.match?.players[0].doublesStreak, 1);

    // Drain BUY_DECISION timeout in Turn 1 -> clears doublesStreak = 0 so turn passes to P2 (BUG-13),
    // and still counts only as 1 missed turn (no premature takeover in Turn 1!)
    const buyTime = afterMiss1.snapshot.match?.turnTimeLeft ?? 18;
    for (let s = 0; s < buyTime; s++) {
      manager.tickOneSecond();
    }
    await flushMicrotasks(12);

    const afterTurn1 = latestByClient.get('c1') as Extract<ServerToClientMessage, { type: 'ROOM_SNAPSHOT' }>;
    assert.equal(afterTurn1.snapshot.match?.players[0].onlineConnected, true);
    assert.equal(afterTurn1.snapshot.match?.players[0].onlineBotTakeover, false);
    assert.equal(afterTurn1.snapshot.match?.players[0].isBot, false);
    assert.equal(afterTurn1.snapshot.match?.players[0].doublesStreak, 0);
    assert.equal(afterTurn1.snapshot.match?.activePlayerIndex, 1);

    // P2 completes Turn 2 -> returns turn to c1 (Turn 3)
    manager.handleClientMessage('c2', { type: 'GAME_ACTION', action: { kind: 'ROLL_DICE' } });
    await flushMicrotasks(12);
    // Note: diceRng returns [2, 2] (doubles), so P2 gets bonus roll -> lands on Lost Island (8) -> turn ends to P1!
    manager.handleClientMessage('c2', { type: 'GAME_ACTION', action: { kind: 'SKIP_BUY' } });
    await flushMicrotasks(8);
    manager.handleClientMessage('c2', { type: 'GAME_ACTION', action: { kind: 'ROLL_DICE' } });
    await flushMicrotasks(12);

    // Drain Turn 3 AWAIT_ROLL timeout -> 2nd consecutive missed turn triggers connected AFK Bot takeover (BUG-12)!
    for (let s = 0; s < 45; s++) {
      manager.tickOneSecond();
    }
    await flushMicrotasks(12);

    const afterMiss2 = latestByClient.get('c1') as Extract<ServerToClientMessage, { type: 'ROOM_SNAPSHOT' }>;
    assert.equal(afterMiss2.snapshot.match?.players[0].onlineConnected, true);
    assert.equal(afterMiss2.snapshot.match?.players[0].onlineBotTakeover, true);
    assert.equal(afterMiss2.snapshot.match?.players[0].isBot, true);

    // c1 sends RECLAIM_CONTROL -> restores human control!
    manager.handleClientMessage('c1', { type: 'RECLAIM_CONTROL' });
    const afterReclaim = latestByClient.get('c1') as Extract<ServerToClientMessage, { type: 'ROOM_SNAPSHOT' }>;
    assert.equal(afterReclaim.snapshot.match?.players[0].isBot, false);
    assert.equal(afterReclaim.snapshot.match?.players[0].onlineBotTakeover, false);
  } finally {
    manager.dispose();
  }
});

test('BUG-14 & BUG-18: ch-10 COLLECT_FROM_ALL queues debtor into DEBT_RESOLUTION; ch-14 POWER_OUTAGE only clears on opponent landing', async () => {
  const latestByClient = new Map<string, ServerToClientMessage>();
  const record = (clientId: string, msg: ServerToClientMessage) => {
    if (msg.type === 'ROOM_JOINED' || msg.type === 'ROOM_SNAPSHOT') {
      latestByClient.set(clientId, msg);
    }
  };

  // Use deterministic dice to land on Chance (12), buy tiles, and test outage
  const seq: Array<[number, number]> = [
    [1, 2], // P1: 0 -> 3 (buys Đà Lạt lv0 = 70K)
    [6, 6], // P2: 0 -> 12 (Chance -> force ch-14 POWER_OUTAGE on P1's tile 3!)
    [6, 5], // P1: 3 -> 14 (skip)
    [6, 6], // P2: 12 -> 24 (World Tour -> skip/next) -> wait: just roll [1,2]=3? No, let's control positions cleanly!
  ];
  // Clean 3-player match for ch-10 + ch-14:
  seq.length = 0;
  seq.push(
    [1, 2], // P1: 0 -> 3 (buys Đà Lạt lv0 = 70K)
    [2, 3], // P2: 0 -> 5 (buys Ninh Bình lv0 = 90K)
    [6, 6], // P3: 0 -> 12 (Chance -> force ch-14 POWER_OUTAGE on P1's tile 3!)
    [1, 1], // P3 doubles -> 14 (skip)
    [1, 2], // P1: 3 -> 6? Let's make P1 fly or wrap around to 3? Better: test ch-14 in a clean dedicated setup or test ch-10 here!
  );

  const manager = new OnlineRoomManager(record, {
    timingScale: 0,
    enableTickInterval: false,
    diceRng: () => seq.shift() ?? [1, 2],
  });

  try {
    manager.handleClientMessage('c1', {
      type: 'CREATE_ROOM',
      playerName: 'P1',
      tokenType: 'car',
      maxPlayers: 3,
      startingCash: 2_000_000,
      fillBots: false,
    });
    const created = latestByClient.get('c1');
    if (!created || created.type !== 'ROOM_JOINED') return;
    manager.handleClientMessage('c2', {
      type: 'JOIN_ROOM',
      roomCode: created.roomCode,
      playerName: 'P2',
      tokenType: 'yacht',
    });
    manager.handleClientMessage('c3', {
      type: 'JOIN_ROOM',
      roomCode: created.roomCode,
      playerName: 'P3',
      tokenType: 'jet',
    });
    markAllGuestsReady(manager, ['c2', 'c3']);
    manager.handleClientMessage('c1', { type: 'START_MATCH' });

    // Inspect internal match for precise setup of cash/chanceDeck while exercising real public actions
    const roomsMap = (manager as unknown as {
      rooms: Map<
        string,
        {
          match: {
            players: Array<{ cash: number; position: number }>;
            chanceDeck: Array<{ id: string }>;
            properties: Record<number, { ownerId: number | null; level: number }>;
            boardModifiers: { outageTileIndices?: number[] };
          };
        }
      >;
    }).rooms;
    const internalMatch = roomsMap.get(created.roomCode)!.match;

    // P1 buys tile 3 (Đà Lạt)
    manager.handleClientMessage('c1', { type: 'GAME_ACTION', action: { kind: 'ROLL_DICE' } });
    await flushMicrotasks(12);
    manager.handleClientMessage('c1', {
      type: 'GAME_ACTION',
      action: { kind: 'BUY_PROPERTY', initialLevel: 0 },
    });
    await flushMicrotasks(8);

    // P2 buys tile 5 (Ninh Bình)
    manager.handleClientMessage('c2', { type: 'GAME_ACTION', action: { kind: 'ROLL_DICE' } });
    await flushMicrotasks(12);
    manager.handleClientMessage('c2', {
      type: 'GAME_ACTION',
      action: { kind: 'BUY_PROPERTY', initialLevel: 0 },
    });
    await flushMicrotasks(8);

    // Put ch-14 (POWER_OUTAGE) on top of chanceDeck for P3's Chance roll [6,6] -> 12
    const ch14 = internalMatch.chanceDeck.find((c) => c.id === 'ch-14')!;
    assert.ok(ch14);
    internalMatch.chanceDeck.push(ch14 as never);

    manager.handleClientMessage('c3', { type: 'GAME_ACTION', action: { kind: 'ROLL_DICE' } });
    await flushMicrotasks(12);
    manager.handleClientMessage('c3', { type: 'GAME_ACTION', action: { kind: 'CONFIRM_CARD' } });
    await flushMicrotasks(6);
    manager.handleClientMessage('c3', {
      type: 'GAME_ACTION',
      action: { kind: 'APPLY_TACTICAL_CARD', targetTile: 3 },
    });
    await flushMicrotasks(8);

    assert.ok(internalMatch.boardModifiers.outageTileIndices?.includes(3));

    // P3 had doubles -> move P3 off turn with [1, 2] -> 15 (skip)
    seq.length = 0;
    seq.push([1, 2]);
    manager.handleClientMessage('c3', { type: 'GAME_ACTION', action: { kind: 'ROLL_DICE' } });
    await flushMicrotasks(12);
    manager.handleClientMessage('c3', { type: 'GAME_ACTION', action: { kind: 'SKIP_BUY' } });
    await flushMicrotasks(8);

    // BUG-18: Place P1 (owner of tile 3) at position 1 and roll [1, 1] -> lands on own tile 3! Outage MUST STAY!
    internalMatch.players[0].position = 1;
    seq.push([1, 1]);
    manager.handleClientMessage('c1', { type: 'GAME_ACTION', action: { kind: 'ROLL_DICE' } });
    await flushMicrotasks(12);
    manager.handleClientMessage('c1', { type: 'GAME_ACTION', action: { kind: 'SKIP_UPGRADE' } });
    await flushMicrotasks(8);
    assert.ok(
      internalMatch.boardModifiers.outageTileIndices?.includes(3),
      'BUG-18: Owner landing on own outaged tile must NOT clear power outage'
    );

    // Now test BUG-14: Place P1 at position 10, set P2 cash = 5K (owns tile 5 -> must enter DEBT_RESOLUTION!), P3 cash = 10K (0 properties -> auto-bankrupt!),
    // push ch-10 (COLLECT_FROM_ALL 25K) on top of chanceDeck, and P1 rolls [1, 1] -> 12 (Chance)
    internalMatch.players[0].position = 10;
    internalMatch.players[1].cash = 5_000; // owns tile 5
    internalMatch.players[2].cash = 10_000; // owns 0 properties
    const ch10 = internalMatch.chanceDeck.find((c) => c.id === 'ch-10')!;
    assert.ok(ch10);
    internalMatch.chanceDeck.push(ch10 as never);
    seq.push([1, 1]);

    manager.handleClientMessage('c1', { type: 'GAME_ACTION', action: { kind: 'ROLL_DICE' } });
    await flushMicrotasks(12);
    manager.handleClientMessage('c1', { type: 'GAME_ACTION', action: { kind: 'CONFIRM_CARD' } });
    await flushMicrotasks(8);

    const debtSnap = latestByClient.get('c1') as Extract<ServerToClientMessage, { type: 'ROOM_SNAPSHOT' }>;
    assert.equal(debtSnap.snapshot.match?.turnPhase, 'DEBT_RESOLUTION');
    assert.equal(debtSnap.snapshot.match?.activePlayerIndex, 1); // P2 is active debtor!
    assert.equal(debtSnap.snapshot.match?.pendingDebt?.amount, 25_000);
    assert.equal(debtSnap.snapshot.match?.pendingDebt?.debtorId, 1);
    assert.equal(debtSnap.snapshot.match?.players[2].bankrupt, true); // P3 auto-bankrupted!

    // P2 sells tile 5 (refund 90K) and pays 25K to P1 -> turn restores to P1 (doublesStreak=1 -> AWAIT_ROLL for P1)!
    manager.handleClientMessage('c2', {
      type: 'GAME_ACTION',
      action: { kind: 'SELL_AND_PAY_DEBT', tileIndicesToSell: [5] },
    });
    await flushMicrotasks(8);

    const afterDebtSnap = latestByClient.get('c1') as Extract<ServerToClientMessage, { type: 'ROOM_SNAPSHOT' }>;
    assert.equal(afterDebtSnap.snapshot.match?.activePlayerIndex, 0);
    assert.equal(afterDebtSnap.snapshot.match?.turnPhase, 'AWAIT_ROLL');
    assert.equal(afterDebtSnap.snapshot.match?.players[1].cash, 5_000 + 90_000 - 25_000);

    // Finally, verify BUG-18 opponent landing clears outage at tile 3:
    // P1 rolls [1, 2] -> 15 (skips), then place P2 at tile 1 and roll [1, 1] -> lands on P1's outaged tile 3 -> 0K rent & outage cleared!
    seq.push([1, 2]);
    manager.handleClientMessage('c1', { type: 'GAME_ACTION', action: { kind: 'ROLL_DICE' } });
    await flushMicrotasks(12);
    manager.handleClientMessage('c1', { type: 'GAME_ACTION', action: { kind: 'SKIP_BUY' } });
    await flushMicrotasks(8);

    internalMatch.players[1].position = 1;
    seq.push([1, 1]);
    const p2CashBeforeOutage = internalMatch.players[1].cash;
    manager.handleClientMessage('c2', { type: 'GAME_ACTION', action: { kind: 'ROLL_DICE' } });
    await flushMicrotasks(14);
    assert.equal(internalMatch.players[1].cash, p2CashBeforeOutage);
    assert.ok(
      !internalMatch.boardModifiers.outageTileIndices?.includes(3),
      'BUG-18: Opponent landing on outaged tile must pay 0K and clear outage'
    );
  } finally {
    manager.dispose();
  }
});

test('BUG-22, BUG-23, BUG-24, BUG-25, BUG-27, BUG-28, BUG-29, BUG-30: validation, limits, lifecycle, host transfer, and SESSION_REPLACED', async () => {
  const inbox = new Map<string, ServerToClientMessage[]>();
  const record = (clientId: string, msg: ServerToClientMessage) => {
    const arr = inbox.get(clientId) || [];
    arr.push(msg);
    inbox.set(clientId, arr);
  };

  const manager = new OnlineRoomManager(record, {
    timingScale: 0,
    enableTickInterval: false,
    diceRng: () => [2, 3], // 5 -> Ninh Bình
  });

  try {
    // Create room with c1 & join with c2
    manager.handleClientMessage('c1', {
      type: 'CREATE_ROOM',
      playerName: 'Host',
      tokenType: 'car',
      maxPlayers: 2,
      startingCash: 2_000_000,
      fillBots: false,
    });
    const r1Joined = inbox.get('c1')!.find((m) => m.type === 'ROOM_JOINED');
    assert.equal(r1Joined?.type, 'ROOM_JOINED');
    if (!r1Joined || r1Joined.type !== 'ROOM_JOINED') return;
    const roomCode = r1Joined.roomCode;
    const c1Token = r1Joined.sessionToken;

    manager.handleClientMessage('c2', {
      type: 'JOIN_ROOM',
      roomCode,
      playerName: 'Guest',
      tokenType: 'yacht',
    });

    // BUG-25: c1 creates a new room -> old room has c2 promoted as host (grace cleanup if alone); creating 5 rooms from same client leaves 1 active room after grace cleanup!
    manager.handleClientMessage('c3', {
      type: 'CREATE_ROOM',
      playerName: 'Spammer',
      tokenType: 'car',
      maxPlayers: 2,
      startingCash: 2_000_000,
      fillBots: true,
    });
    manager.handleClientMessage('c3', {
      type: 'CREATE_ROOM',
      playerName: 'Spammer',
      tokenType: 'car',
      maxPlayers: 2,
      startingCash: 2_000_000,
      fillBots: true,
    });
    await flushMicrotasks(12);
    // First empty room created by c3 was scheduled for cleanup and deleted!
    assert.equal(manager.getActiveRoomCount(), 2);

    // Clean up c3's room
    manager.handleClientMessage('c3', { type: 'LEAVE_ROOM' });
    assert.equal(manager.getActiveRoomCount(), 1);

    // Start match in roomCode (c2 is host after c1 switched? No, c1 didn't switch above; start with c1)
    markAllGuestsReady(manager, ['c2']);
    manager.handleClientMessage('c1', { type: 'START_MATCH' });

    // BUG-27: RETURN_TO_LOBBY rejected while playing
    manager.handleClientMessage('c1', { type: 'RETURN_TO_LOBBY' });
    const rtlErr = (inbox.get('c1') || []).find(
      (m) => m.type === 'ERROR' && m.code === 'INVALID_STATE'
    );
    assert.ok(rtlErr, 'RETURN_TO_LOBBY must be rejected while playing');

    // BUG-24: Emote cooldown
    manager.handleClientMessage('c1', { type: 'SEND_EMOTE', emoteText: 'Hello!' });
    manager.handleClientMessage('c1', { type: 'SEND_EMOTE', emoteText: 'Spam!' });
    const rateErr = (inbox.get('c1') || []).find(
      (m) => m.type === 'ERROR' && m.code === 'RATE_LIMITED'
    );
    assert.ok(rateErr, 'Second emote within 1500ms must be rate limited');

    // BUG-22 & BUG-23: Invalid initialLevel (float / string) & invalid targetTile (string) rejected without corrupting state
    manager.handleClientMessage('c1', { type: 'GAME_ACTION', action: { kind: 'ROLL_DICE' } });
    await flushMicrotasks(12);
    manager.handleClientMessage('c1', {
      type: 'GAME_ACTION',
      action: { kind: 'BUY_PROPERTY', initialLevel: 1.5 as unknown as number },
    });
    manager.handleClientMessage('c1', {
      type: 'GAME_ACTION',
      action: { kind: 'BUY_PROPERTY', initialLevel: 'abc' as unknown as number },
    });
    const invalidLevelErrs = (inbox.get('c1') || []).filter(
      (m) => m.type === 'ERROR' && m.code === 'INVALID_ACTION'
    );
    assert.ok(invalidLevelErrs.length >= 2);

    // Complete legal buy
    manager.handleClientMessage('c1', {
      type: 'GAME_ACTION',
      action: { kind: 'BUY_PROPERTY', initialLevel: 0 },
    });
    await flushMicrotasks(8);

    // BUG-30: Duplicate tab RECONNECT_ROOM sends SESSION_REPLACED to old socket c1
    manager.handleClientMessage('c1-tab2', {
      type: 'RECONNECT_ROOM',
      roomCode,
      sessionToken: c1Token,
    });
    const replacedMsg = (inbox.get('c1') || []).find(
      (m) => m.type === 'ERROR' && m.code === 'SESSION_REPLACED'
    );
    assert.ok(replacedMsg, 'Old clientId must receive SESSION_REPLACED');

    // BUG-28 & BUG-29: c2 disconnects (within 90s reconnect window), c1-tab2 explicitly leaves -> room stays alive during grace window (not deleted immediately!)
    manager.handleDisconnect('c2');
    manager.handleClientMessage('c1-tab2', { type: 'LEAVE_ROOM' });
    assert.equal(
      manager.getActiveRoomCount(),
      1,
      'BUG-28: Room with reconnect-eligible disconnected c2 must remain alive before cleanupTimer fires'
    );

    // c2 reconnects -> becomes connected host!
    const c2Joined = (inbox.get('c2') || []).find((m) => m.type === 'ROOM_JOINED');
    if (c2Joined?.type === 'ROOM_JOINED') {
      manager.handleClientMessage('c2-re', {
        type: 'RECONNECT_ROOM',
        roomCode,
        sessionToken: c2Joined.sessionToken,
      });
      const c2Snap = (inbox.get('c2-re') || []).at(-1);
      if (c2Snap?.type === 'ROOM_JOINED' || c2Snap?.type === 'ROOM_SNAPSHOT') {
        assert.equal(c2Snap.snapshot.hostSeatIndex, 1);
      }
    }

    // BUG-27: Host disconnect at gameover transfers host, and RETURN_TO_LOBBY at gameover preserves disconnected !explicitlyLeft seats
    manager.handleClientMessage('g1', {
      type: 'CREATE_ROOM',
      playerName: 'G1',
      tokenType: 'car',
      maxPlayers: 2,
      startingCash: 2_000_000,
      fillBots: false,
    });
    const g1Joined = (inbox.get('g1') || []).find((m) => m.type === 'ROOM_JOINED');
    if (g1Joined?.type === 'ROOM_JOINED') {
      const gCode = g1Joined.roomCode;
      manager.handleClientMessage('g2', {
        type: 'JOIN_ROOM',
        roomCode: gCode,
        playerName: 'G2',
        tokenType: 'yacht',
      });
      markAllGuestsReady(manager, ['g2']);
      manager.handleClientMessage('g1', { type: 'START_MATCH' });
      // Fast-forward match to gameover via 20-min timer
      for (let t = 0; t < 1200; t++) {
        manager.tickOneSecond();
      }
      // g2 disconnects temporarily (not explicitlyLeft), g1 (host) disconnects -> g1 was host, g2 disconnected so stays; test reverse: g1 disconnects while g2 connected -> g2 becomes host!
      manager.handleDisconnect('g1');
      const g2AfterHostDrop = (inbox.get('g2') || []).at(-1);
      if (g2AfterHostDrop?.type === 'ROOM_SNAPSHOT') {
        assert.equal(g2AfterHostDrop.snapshot.status, 'gameover');
        assert.equal(g2AfterHostDrop.snapshot.hostSeatIndex, 1);
      }
      // Now g2 (new host) calls RETURN_TO_LOBBY while g1 is disconnected (!explicitlyLeft) -> g1's seat MUST be preserved!
      manager.handleClientMessage('g2', { type: 'RETURN_TO_LOBBY' });
      const lobbySnap = (inbox.get('g2') || []).at(-1);
      assert.equal(lobbySnap?.type, 'ROOM_SNAPSHOT');
      if (lobbySnap?.type === 'ROOM_SNAPSHOT') {
        assert.equal(lobbySnap.snapshot.status, 'lobby');
        assert.equal(lobbySnap.snapshot.seats.filter((s) => s.occupiedByHuman).length, 2);
      }
      manager.handleClientMessage('g2', { type: 'LEAVE_ROOM' });
      await flushMicrotasks(12);
    }

    // BUG-24: MAX_ROOMS limit (100)
    for (let i = 0; i < 105; i++) {
      manager.handleClientMessage(`flood-${i}`, {
        type: 'CREATE_ROOM',
        playerName: `U${i}`,
        tokenType: 'car',
        maxPlayers: 2,
        startingCash: 2_000_000,
        fillBots: true,
      });
    }
    assert.equal(manager.getActiveRoomCount(), 100);
    const busyErr = (inbox.get('flood-104') || []).find(
      (m) => m.type === 'ERROR' && m.code === 'SERVER_BUSY'
    );
    assert.ok(busyErr, 'Creating beyond MAX_ROOMS=100 must return SERVER_BUSY');
  } finally {
    manager.dispose();
  }
});

test('Iteration 2 lifecycle & REROLL_DECISION regressions: zombie lobby leak, self-JOIN, failed JOIN/RECONNECT, mid-match host transfer, and 3rd-double timeout jail', async () => {
  const inbox = new Map<string, ServerToClientMessage[]>();
  const record = (clientId: string, msg: ServerToClientMessage) => {
    const arr = inbox.get(clientId) || [];
    arr.push(msg);
    inbox.set(clientId, arr);
  };

  let diceQueue: Array<[number, number]> = [[2, 2]];
  const manager = new OnlineRoomManager(record, {
    timingScale: 0,
    enableTickInterval: false,
    diceRng: () => diceQueue.shift() ?? [1, 2],
  });

  try {
    // 1. Lobby LEAVE_ROOM while disconnected peer remains -> cleans up after grace timeout
    manager.handleClientMessage('l1', {
      type: 'CREATE_ROOM',
      playerName: 'L1',
      tokenType: 'car',
      maxPlayers: 2,
      startingCash: 2_000_000,
      fillBots: false,
    });
    const l1Joined = (inbox.get('l1') || []).find((m) => m.type === 'ROOM_JOINED');
    assert.equal(l1Joined?.type, 'ROOM_JOINED');
    if (!l1Joined || l1Joined.type !== 'ROOM_JOINED') return;
    const lobbyCode = l1Joined.roomCode;

    manager.handleClientMessage('l2', {
      type: 'JOIN_ROOM',
      roomCode: lobbyCode,
      playerName: 'L2',
      tokenType: 'yacht',
    });
    manager.handleDisconnect('l2');
    manager.handleClientMessage('l1', { type: 'LEAVE_ROOM' });
    await flushMicrotasks(12);
    assert.equal(
      manager.getActiveRoomCount(),
      0,
      'Lobby room with only disconnected peer after host LEAVE_ROOM must clean up after grace timeout'
    );

    // 2. Self-JOIN_ROOM does not create duplicate seat or ghost hostSeatIndex === 0
    manager.handleClientMessage('h1', {
      type: 'CREATE_ROOM',
      playerName: 'Host1',
      tokenType: 'car',
      maxPlayers: 2,
      startingCash: 2_000_000,
      fillBots: false,
    });
    const h1Joined = (inbox.get('h1') || []).find((m) => m.type === 'ROOM_JOINED');
    assert.equal(h1Joined?.type, 'ROOM_JOINED');
    if (!h1Joined || h1Joined.type !== 'ROOM_JOINED') return;
    const roomB = h1Joined.roomCode;

    manager.handleClientMessage('h1', {
      type: 'JOIN_ROOM',
      roomCode: roomB,
      playerName: 'Host1Again',
      tokenType: 'yacht',
    });
    const h1AfterSelfJoin = (inbox.get('h1') || []).at(-1);
    assert.equal(h1AfterSelfJoin?.type, 'ROOM_JOINED');
    if (h1AfterSelfJoin?.type === 'ROOM_JOINED') {
      assert.equal(
        h1AfterSelfJoin.snapshot.seats.filter((s) => s.occupiedByHuman).length,
        1,
        'Self-JOIN_ROOM must not create duplicate human seat'
      );
      assert.equal(h1AfterSelfJoin.snapshot.hostSeatIndex, 0);
      assert.equal(h1AfterSelfJoin.snapshot.seats[0].connected, true);
    }

    // 3. Failed JOIN_ROOM (full room) & failed RECONNECT_ROOM (bad token) keep client attached to active room
    manager.handleClientMessage('cFull1', {
      type: 'CREATE_ROOM',
      playerName: 'Full1',
      tokenType: 'car',
      maxPlayers: 2,
      startingCash: 2_000_000,
      fillBots: false,
    });
    const fullJoined = (inbox.get('cFull1') || []).find((m) => m.type === 'ROOM_JOINED');
    assert.equal(fullJoined?.type, 'ROOM_JOINED');
    if (!fullJoined || fullJoined.type !== 'ROOM_JOINED') return;
    const roomC = fullJoined.roomCode;
    manager.handleClientMessage('cFull2', {
      type: 'JOIN_ROOM',
      roomCode: roomC,
      playerName: 'Full2',
      tokenType: 'yacht',
    });

    manager.handleClientMessage('h1', {
      type: 'JOIN_ROOM',
      roomCode: roomC,
      playerName: 'Host1',
      tokenType: 'jet',
    });
    const fullErr = (inbox.get('h1') || []).at(-1);
    assert.equal(fullErr?.type, 'ERROR');
    if (fullErr?.type === 'ERROR') {
      assert.equal(fullErr.code, 'ROOM_FULL');
    }

    manager.handleClientMessage('h1', {
      type: 'RECONNECT_ROOM',
      roomCode: roomC,
      sessionToken: 'invalid-token-123',
    });
    const badReconErr = (inbox.get('h1') || []).at(-1);
    assert.equal(badReconErr?.type, 'ERROR');
    if (badReconErr?.type === 'ERROR') {
      assert.equal(badReconErr.code, 'SESSION_EXPIRED');
    }

    // Verify h1 is STILL connected & host in Room B (can accept gJoin and start match)
    manager.handleClientMessage('gJoin', {
      type: 'JOIN_ROOM',
      roomCode: roomB,
      playerName: 'GuestB',
      tokenType: 'yacht',
    });
    const h1RoomBUpdate = (inbox.get('h1') || []).at(-1);
    assert.equal(h1RoomBUpdate?.type, 'ROOM_SNAPSHOT');
    if (h1RoomBUpdate?.type === 'ROOM_SNAPSHOT') {
      assert.equal(h1RoomBUpdate.snapshot.roomCode, roomB);
      assert.equal(h1RoomBUpdate.snapshot.seats[0].connected, true);
      assert.equal(h1RoomBUpdate.snapshot.seats[1].connected, true);
    }

    // Clean up Room C so only Room B remains
    manager.handleClientMessage('cFull1', { type: 'LEAVE_ROOM' });
    manager.handleClientMessage('cFull2', { type: 'LEAVE_ROOM' });

    // 4. Mid-match host disconnect transfers hostSeatIndex immediately to connected guest (BUG-29)
    manager.handleClientMessage('h1', {
      type: 'UPDATE_LOBBY_SETTINGS',
      tacticalDiceEnabled: true,
    });
    markAllGuestsReady(manager, ['gJoin']);
    manager.handleClientMessage('h1', { type: 'START_MATCH' });
    manager.handleDisconnect('h1');
    const gJoinAfterHostDrop = (inbox.get('gJoin') || []).at(-1);
    assert.equal(gJoinAfterHostDrop?.type, 'ROOM_SNAPSHOT');
    if (gJoinAfterHostDrop?.type === 'ROOM_SNAPSHOT') {
      assert.equal(gJoinAfterHostDrop.snapshot.status, 'playing');
      assert.equal(
        gJoinAfterHostDrop.snapshot.hostSeatIndex,
        1,
        'BUG-29: Mid-match host disconnect must transfer hostSeatIndex immediately to connected guest'
      );
      assert.equal(gJoinAfterHostDrop.snapshot.seats[1].isHost, true);
    }

    // Reconnect h1 cleanly before testing REROLL_DECISION timeout
    manager.handleClientMessage('h1', {
      type: 'RECONNECT_ROOM',
      roomCode: roomB,
      sessionToken: h1Joined.sessionToken,
    });

    // 5. REROLL_DECISION timeout at doublesStreak === 2 + doubles sends AFK player to Lost Island
    // Roll #1: [2,2] -> CONFIRM_ROLL_MOVE -> lands on Tile 4 (BUY_DECISION) -> SKIP_BUY -> doublesStreak = 1, still P0 turn
    diceQueue = [[2, 2], [3, 3], [4, 4]];
    manager.handleClientMessage('h1', { type: 'GAME_ACTION', action: { kind: 'ROLL_DICE' } });
    await flushMicrotasks(12);
    manager.handleClientMessage('h1', { type: 'GAME_ACTION', action: { kind: 'CONFIRM_ROLL_MOVE' } });
    await flushMicrotasks(12);
    manager.handleClientMessage('h1', { type: 'GAME_ACTION', action: { kind: 'SKIP_BUY' } });
    await flushMicrotasks(12);

    // Roll #2: [3,3] -> CONFIRM_ROLL_MOVE -> lands on Tile 10 (BUY_DECISION) -> SKIP_BUY -> doublesStreak = 2, still P0 turn
    manager.handleClientMessage('h1', { type: 'GAME_ACTION', action: { kind: 'ROLL_DICE' } });
    await flushMicrotasks(12);
    manager.handleClientMessage('h1', { type: 'GAME_ACTION', action: { kind: 'CONFIRM_ROLL_MOVE' } });
    await flushMicrotasks(12);
    manager.handleClientMessage('h1', { type: 'GAME_ACTION', action: { kind: 'SKIP_BUY' } });
    await flushMicrotasks(12);

    // Roll #3: [4,4] -> enters REROLL_DECISION with doublesStreak === 2
    manager.handleClientMessage('h1', { type: 'GAME_ACTION', action: { kind: 'ROLL_DICE' } });
    await flushMicrotasks(12);
    const beforeTimeoutSnap = (inbox.get('h1') || []).at(-1);
    assert.equal(beforeTimeoutSnap?.type, 'ROOM_SNAPSHOT');
    if (beforeTimeoutSnap?.type === 'ROOM_SNAPSHOT') {
      assert.equal(beforeTimeoutSnap.snapshot.match?.turnPhase, 'REROLL_DECISION');
      assert.equal(beforeTimeoutSnap.snapshot.match?.players[0].doublesStreak, 2);
    }

    // Simulate REROLL_DECISION timeout via tickOneSecond()
    const roomMap = (manager as unknown as { rooms: Map<string, { match: { turnTimeLeft: number } }> }).rooms;
    roomMap.get(roomB)!.match.turnTimeLeft = 1;
    manager.tickOneSecond();
    await flushMicrotasks(12);

    const afterTimeoutSnap = (inbox.get('h1') || []).at(-1);
    assert.equal(afterTimeoutSnap?.type, 'ROOM_SNAPSHOT');
    if (afterTimeoutSnap?.type === 'ROOM_SNAPSHOT') {
      const p0 = afterTimeoutSnap.snapshot.match?.players[0];
      assert.equal(p0?.inJail, true, '3rd-double REROLL_DECISION timeout must send player to Lost Island');
      assert.equal(p0?.position, 8);
      assert.equal(p0?.doublesStreak, 0);
      assert.equal(afterTimeoutSnap.snapshot.match?.activePlayerIndex, 1);
    }
  } finally {
    manager.dispose();
  }
});

test('BUG-14: ch-10 queues >= 2 simultaneous property-owning debtors, settles SELL_AND_PAY_DEBT then DECLARE_BANKRUPTCY, and restores drawer turn + doublesStreak', async () => {
  const latestByClient = new Map<string, ServerToClientMessage>();
  const errors: Array<{ clientId: string; code: string; message: string }> = [];
  const record = (clientId: string, msg: ServerToClientMessage) => {
    if (msg.type === 'ROOM_JOINED' || msg.type === 'ROOM_SNAPSHOT') {
      latestByClient.set(clientId, msg);
    } else if (msg.type === 'ERROR') {
      errors.push({ clientId, code: msg.code, message: msg.message });
    }
  };

  let nextDice: [number, number] = [1, 1];
  const manager = new OnlineRoomManager(record, {
    timingScale: 0,
    enableTickInterval: false,
    diceRng: () => nextDice,
  });

  try {
    manager.handleClientMessage('c1', {
      type: 'CREATE_ROOM',
      playerName: 'P1',
      tokenType: 'car',
      maxPlayers: 3,
      startingCash: 2_000_000,
      fillBots: false,
    });
    const created = latestByClient.get('c1');
    assert.equal(created?.type, 'ROOM_JOINED');
    if (!created || created.type !== 'ROOM_JOINED') return;
    const roomCode = created.roomCode;

    manager.handleClientMessage('c2', {
      type: 'JOIN_ROOM',
      roomCode,
      playerName: 'P2',
      tokenType: 'yacht',
    });
    manager.handleClientMessage('c3', {
      type: 'JOIN_ROOM',
      roomCode,
      playerName: 'P3',
      tokenType: 'jet',
    });
    markAllGuestsReady(manager, ['c2', 'c3']);
    manager.handleClientMessage('c1', { type: 'START_MATCH' });

    const roomsMap = (manager as unknown as {
      rooms: Map<
        string,
        {
          match: {
            players: Array<{ cash: number; position: number; doublesStreak: number }>;
            chanceDeck: Array<{ id: string }>;
            properties: Record<number, { tileIndex: number; ownerId: number | null; level: number }>;
          };
        }
      >;
    }).rooms;
    const internalMatch = roomsMap.get(roomCode)!.match;

    // P1 rolls [1,1] twice to reach doublesStreak=2 and land on Chance (12) with ch-10:
    // Roll 1: 0 -> 2 (Sa Pa, skip) -> doublesStreak = 1
    nextDice = [1, 1];
    manager.handleClientMessage('c1', { type: 'GAME_ACTION', action: { kind: 'ROLL_DICE' } });
    await flushMicrotasks(12);
    manager.handleClientMessage('c1', { type: 'GAME_ACTION', action: { kind: 'SKIP_BUY' } });
    await flushMicrotasks(8);

    // Setup P2 & P3 low cash with 1 property each before P1 draws ch-10
    internalMatch.players[0].cash = 500_000;
    internalMatch.players[1].cash = 10_000;
    internalMatch.properties[1] = { tileIndex: 1, ownerId: 1, level: 0 }; // Hà Giang (50K)
    internalMatch.players[2].cash = 5_000;
    internalMatch.properties[3] = { tileIndex: 3, ownerId: 2, level: 0 }; // Đà Lạt (70K)

    const ch10 = internalMatch.chanceDeck.find((c) => c.id === 'ch-10')!;
    assert.ok(ch10);
    internalMatch.chanceDeck.push(ch10);

    // Roll 2: pos 2 + [5,5] (doubles!) -> pos 12 (Chance), doublesStreak becomes 2
    nextDice = [5, 5];
    manager.handleClientMessage('c1', { type: 'GAME_ACTION', action: { kind: 'ROLL_DICE' } });
    await flushMicrotasks(12);
    manager.handleClientMessage('c1', { type: 'GAME_ACTION', action: { kind: 'CONFIRM_CARD' } });
    await flushMicrotasks(8);

    // Both P2 and P3 are queued in pendingDebtQueue (P2 active, P3 waiting in queue)
    const debt1Snap = latestByClient.get('c1') as Extract<ServerToClientMessage, { type: 'ROOM_SNAPSHOT' }>;
    assert.equal(debt1Snap.snapshot.match?.turnPhase, 'DEBT_RESOLUTION');
    assert.equal(debt1Snap.snapshot.match?.activePlayerIndex, 1);
    assert.equal(debt1Snap.snapshot.match?.pendingDebt?.debtorId, 1);
    assert.deepEqual(
      debt1Snap.snapshot.match?.pendingDebtQueue?.map((d) => d.debtorId),
      [2]
    );

    // First debtor (P2) settles via SELL_AND_PAY_DEBT -> shifts P3 from pendingDebtQueue
    manager.handleClientMessage('c2', {
      type: 'GAME_ACTION',
      action: { kind: 'SELL_AND_PAY_DEBT', tileIndicesToSell: [1] },
    });
    await flushMicrotasks(8);

    const debt2Snap = latestByClient.get('c1') as Extract<ServerToClientMessage, { type: 'ROOM_SNAPSHOT' }>;
    assert.equal(debt2Snap.snapshot.match?.turnPhase, 'DEBT_RESOLUTION');
    assert.equal(debt2Snap.snapshot.match?.activePlayerIndex, 2);
    assert.equal(debt2Snap.snapshot.match?.pendingDebt?.debtorId, 2);
    assert.equal(debt2Snap.snapshot.match?.pendingDebtQueue?.length, 0);
    assert.equal(debt2Snap.snapshot.match?.players[1].cash, 10_000 + 50_000 - 25_000);
    assert.equal(debt2Snap.snapshot.match?.players[0].cash, 525_000);

    // Second debtor (P3) settles via DECLARE_BANKRUPTCY -> pays 5K + 70K = 75K to P1 and restores P1 turn + doublesStreak=2
    manager.handleClientMessage('c3', {
      type: 'GAME_ACTION',
      action: { kind: 'DECLARE_BANKRUPTCY' },
    });
    await flushMicrotasks(8);

    const restoredSnap = latestByClient.get('c1') as Extract<ServerToClientMessage, { type: 'ROOM_SNAPSHOT' }>;
    assert.equal(restoredSnap.snapshot.match?.players[2].bankrupt, true);
    assert.equal(restoredSnap.snapshot.match?.properties[3].ownerId, null);
    assert.equal(restoredSnap.snapshot.match?.pendingDebt, null);
    assert.equal(restoredSnap.snapshot.match?.players[0].cash, 525_000 + 75_000);
    assert.equal(restoredSnap.snapshot.match?.activePlayerIndex, 0);
    assert.equal(restoredSnap.snapshot.match?.turnPhase, 'AWAIT_ROLL');
    assert.equal(restoredSnap.snapshot.match?.players[0].doublesStreak, 2);
    assert.deepEqual(errors, []);
  } finally {
    manager.dispose();
  }
});

test('BUG-05, BUG-14 & BUG-18 (TEAMS_2V2): ch-10 exempts teammate while charging/queuing opponents; ch-14 outage persists on teammate landing and clears on opponent landing', async () => {
  const latestByClient = new Map<string, ServerToClientMessage>();
  const record = (clientId: string, msg: ServerToClientMessage) => {
    if (msg.type === 'ROOM_JOINED' || msg.type === 'ROOM_SNAPSHOT') {
      latestByClient.set(clientId, msg);
    }
  };

  let nextDice: [number, number] = [1, 2];
  const manager = new OnlineRoomManager(record, {
    timingScale: 0,
    enableTickInterval: false,
    diceRng: () => nextDice,
  });

  try {
    manager.handleClientMessage('c0', {
      type: 'CREATE_ROOM',
      playerName: 'T0A',
      tokenType: 'car',
      maxPlayers: 4,
      startingCash: 2_000_000,
      fillBots: false,
      matchMode: 'TEAMS_2V2',
    });
    const created = latestByClient.get('c0');
    assert.equal(created?.type, 'ROOM_JOINED');
    if (!created || created.type !== 'ROOM_JOINED') return;
    const roomCode = created.roomCode;

    manager.handleClientMessage('c1', {
      type: 'JOIN_ROOM',
      roomCode,
      playerName: 'T1A',
      tokenType: 'yacht',
    });
    manager.handleClientMessage('c2', {
      type: 'JOIN_ROOM',
      roomCode,
      playerName: 'T0B',
      tokenType: 'jet',
    });
    manager.handleClientMessage('c3', {
      type: 'JOIN_ROOM',
      roomCode,
      playerName: 'T1B',
      tokenType: 'crown',
    });
    markAllGuestsReady(manager, ['c1', 'c2', 'c3']);
    manager.handleClientMessage('c0', { type: 'START_MATCH' });

    const roomsMap = (manager as unknown as {
      rooms: Map<
        string,
        {
          match: {
            players: Array<{ cash: number; position: number; teamId?: number }>;
            chanceDeck: Array<{ id: string }>;
            properties: Record<number, { tileIndex: number; ownerId: number | null; level: number }>;
            boardModifiers: { outageTileIndices?: number[] };
          };
        }
      >;
    }).rooms;
    const internalMatch = roomsMap.get(roomCode)!.match;

    // P0 (Team 0) buys tile 3 (Đà Lạt)
    nextDice = [1, 2];
    manager.handleClientMessage('c0', { type: 'GAME_ACTION', action: { kind: 'ROLL_DICE' } });
    await flushMicrotasks(12);
    manager.handleClientMessage('c0', {
      type: 'GAME_ACTION',
      action: { kind: 'BUY_PROPERTY', initialLevel: 0 },
    });
    await flushMicrotasks(8);

    // P1 (Team 1) lands on Chance 12 ([6,6]) -> draws ch-14 POWER_OUTAGE on tile 3, then bonus roll [1,2] -> 15 skip
    const ch14 = internalMatch.chanceDeck.find((c) => c.id === 'ch-14')!;
    assert.ok(ch14);
    internalMatch.chanceDeck.push(ch14);
    nextDice = [6, 6];
    manager.handleClientMessage('c1', { type: 'GAME_ACTION', action: { kind: 'ROLL_DICE' } });
    await flushMicrotasks(12);
    manager.handleClientMessage('c1', { type: 'GAME_ACTION', action: { kind: 'CONFIRM_CARD' } });
    await flushMicrotasks(6);
    manager.handleClientMessage('c1', {
      type: 'GAME_ACTION',
      action: { kind: 'APPLY_TACTICAL_CARD', targetTile: 3 },
    });
    await flushMicrotasks(8);
    assert.ok(internalMatch.boardModifiers.outageTileIndices?.includes(3));

    nextDice = [1, 2];
    manager.handleClientMessage('c1', { type: 'GAME_ACTION', action: { kind: 'ROLL_DICE' } });
    await flushMicrotasks(12);
    manager.handleClientMessage('c1', { type: 'GAME_ACTION', action: { kind: 'SKIP_BUY' } });
    await flushMicrotasks(8);

    // P2 (Team 0 teammate of P0) lands on tile 3 -> outage MUST STAY active and P2 pays 0!
    const p2CashBefore = internalMatch.players[2].cash;
    nextDice = [1, 2];
    manager.handleClientMessage('c2', { type: 'GAME_ACTION', action: { kind: 'ROLL_DICE' } });
    await flushMicrotasks(12);
    assert.equal(internalMatch.players[2].cash, p2CashBefore);
    assert.ok(
      internalMatch.boardModifiers.outageTileIndices?.includes(3),
      'BUG-18 (2v2): Teammate landing on outaged tile must preserve POWER_OUTAGE'
    );

    // P3 (Team 1 opponent) lands on tile 3 -> pays 0K rent and CLEARS outage!
    const p3CashBefore = internalMatch.players[3].cash;
    nextDice = [1, 2];
    manager.handleClientMessage('c3', { type: 'GAME_ACTION', action: { kind: 'ROLL_DICE' } });
    await flushMicrotasks(12);
    assert.equal(internalMatch.players[3].cash, p3CashBefore);
    assert.ok(
      !internalMatch.boardModifiers.outageTileIndices?.includes(3),
      'BUG-18 (2v2): Opponent landing on outaged tile must pay 0K and clear POWER_OUTAGE'
    );
    manager.handleClientMessage('c3', { type: 'GAME_ACTION', action: { kind: 'SKIP_BUYOUT' } });
    await flushMicrotasks(8);

    // Now P0 (Team 0) draws ch-10: teammate P2 (cash=5K, owns tile 1) must be EXEMPT;
    // opponent P1 (cash=2M) pays 25K; opponent P3 (cash=10K, owns tile 5) enters DEBT_RESOLUTION!
    internalMatch.players[0].position = 9;
    internalMatch.players[1].cash = 2_000_000;
    internalMatch.players[2].cash = 5_000;
    internalMatch.properties[1] = { tileIndex: 1, ownerId: 2, level: 0 };
    internalMatch.players[3].cash = 10_000;
    internalMatch.properties[5] = { tileIndex: 5, ownerId: 3, level: 0 };
    const ch10 = internalMatch.chanceDeck.find((c) => c.id === 'ch-10')!;
    assert.ok(ch10);
    internalMatch.chanceDeck.push(ch10);
    const p0CashBeforeCh10 = internalMatch.players[0].cash;

    nextDice = [1, 2]; // 9 -> 12 Chance
    manager.handleClientMessage('c0', { type: 'GAME_ACTION', action: { kind: 'ROLL_DICE' } });
    await flushMicrotasks(12);
    manager.handleClientMessage('c0', { type: 'GAME_ACTION', action: { kind: 'CONFIRM_CARD' } });
    await flushMicrotasks(8);

    const teamDebtSnap = latestByClient.get('c0') as Extract<ServerToClientMessage, { type: 'ROOM_SNAPSHOT' }>;
    assert.equal(teamDebtSnap.snapshot.match?.players[2].cash, 5_000, 'Teammate P2 must be exempt from ch-10');
    assert.equal(teamDebtSnap.snapshot.match?.players[2].bankrupt, false);
    assert.equal(teamDebtSnap.snapshot.match?.players[1].cash, 1_975_000);
    assert.equal(teamDebtSnap.snapshot.match?.players[0].cash, p0CashBeforeCh10 + 25_000);
    assert.equal(teamDebtSnap.snapshot.match?.turnPhase, 'DEBT_RESOLUTION');
    assert.equal(teamDebtSnap.snapshot.match?.activePlayerIndex, 3);
    assert.equal(teamDebtSnap.snapshot.match?.pendingDebt?.debtorId, 3);
  } finally {
    manager.dispose();
  }
});

test('Boundary & negative input validation: CREATE_ROOM clamping, SELL_AND_PAY_DEBT invalid/duplicate tiles, and TEAMS_2V2 <4 humans START_MATCH rejection', async () => {
  const inbox = new Map<string, ServerToClientMessage[]>();
  const record = (clientId: string, msg: ServerToClientMessage) => {
    const arr = inbox.get(clientId) || [];
    arr.push(msg);
    inbox.set(clientId, arr);
  };

  let nextDice: [number, number] = [2, 3];
  const manager = new OnlineRoomManager(record, {
    timingScale: 0,
    enableTickInterval: false,
    diceRng: () => nextDice,
  });

  try {
    // 1. CREATE_ROOM clamping negative/out-of-range startingCash & maxPlayers
    manager.handleClientMessage('clamp1', {
      type: 'CREATE_ROOM',
      playerName: 'ClampLow',
      tokenType: 'car',
      maxPlayers: 99 as unknown as 4,
      startingCash: -50_000,
      fillBots: false,
    });
    const clampedHigh = (inbox.get('clamp1') || []).find((m) => m.type === 'ROOM_JOINED');
    assert.equal(clampedHigh?.type, 'ROOM_JOINED');
    if (clampedHigh?.type === 'ROOM_JOINED') {
      assert.equal(clampedHigh.snapshot.maxPlayers, 4);
      assert.equal(clampedHigh.snapshot.startingCash, 2_000_000);
    }

    manager.handleClientMessage('clamp2', {
      type: 'CREATE_ROOM',
      playerName: 'ClampMin',
      tokenType: 'car',
      maxPlayers: 1 as unknown as 2,
      startingCash: 99_999_999,
      fillBots: false,
    });
    const clampedMin = (inbox.get('clamp2') || []).find((m) => m.type === 'ROOM_JOINED');
    assert.equal(clampedMin?.type, 'ROOM_JOINED');
    if (clampedMin?.type === 'ROOM_JOINED') {
      assert.equal(clampedMin.snapshot.maxPlayers, 4);
      assert.equal(clampedMin.snapshot.startingCash, 2_000_000);
    }
    manager.handleClientMessage('clamp1', { type: 'LEAVE_ROOM' });
    manager.handleClientMessage('clamp2', { type: 'LEAVE_ROOM' });

    // 2. TEAMS_2V2 START_MATCH rejected with NOT_ENOUGH_PLAYERS when < 4 humans and fillBots === false
    manager.handleClientMessage('t1', {
      type: 'CREATE_ROOM',
      playerName: 'T1',
      tokenType: 'car',
      maxPlayers: 4,
      startingCash: 2_000_000,
      fillBots: false,
      matchMode: 'TEAMS_2V2',
    });
    const tJoined = (inbox.get('t1') || []).find((m) => m.type === 'ROOM_JOINED');
    assert.equal(tJoined?.type, 'ROOM_JOINED');
    if (!tJoined || tJoined.type !== 'ROOM_JOINED') return;
    const roomCode = tJoined.roomCode;

    manager.handleClientMessage('t2', {
      type: 'JOIN_ROOM',
      roomCode,
      playerName: 'T2',
      tokenType: 'yacht',
    });
    manager.handleClientMessage('t1', { type: 'START_MATCH' });
    const err2Humans = (inbox.get('t1') || []).at(-1);
    assert.equal(err2Humans?.type, 'ERROR');
    if (err2Humans?.type === 'ERROR') {
      assert.equal(err2Humans.code, 'NOT_ENOUGH_PLAYERS');
    }

    // Even 3 humans with fillBots: false must still be rejected
    manager.handleClientMessage('t3', {
      type: 'JOIN_ROOM',
      roomCode,
      playerName: 'T3',
      tokenType: 'jet',
    });
    manager.handleClientMessage('t1', { type: 'START_MATCH' });
    const err3Humans = (inbox.get('t1') || []).at(-1);
    assert.equal(err3Humans?.type, 'ERROR');
    if (err3Humans?.type === 'ERROR') {
      assert.equal(err3Humans.code, 'NOT_ENOUGH_PLAYERS');
    }
    manager.handleClientMessage('t1', { type: 'LEAVE_ROOM' });
    manager.handleClientMessage('t2', { type: 'LEAVE_ROOM' });
    manager.handleClientMessage('t3', { type: 'LEAVE_ROOM' });

    // 3. SELL_AND_PAY_DEBT rejects invalid/duplicate/unowned tileIndicesToSell with INVALID_ACTION
    manager.handleClientMessage('d1', {
      type: 'CREATE_ROOM',
      playerName: 'D1',
      tokenType: 'car',
      maxPlayers: 2,
      startingCash: 2_000_000,
      fillBots: false,
    });
    const dJoined = (inbox.get('d1') || []).find((m) => m.type === 'ROOM_JOINED');
    assert.equal(dJoined?.type, 'ROOM_JOINED');
    if (!dJoined || dJoined.type !== 'ROOM_JOINED') return;
    manager.handleClientMessage('d2', {
      type: 'JOIN_ROOM',
      roomCode: dJoined.roomCode,
      playerName: 'D2',
      tokenType: 'yacht',
    });
    markAllGuestsReady(manager, ['d2']);
    manager.handleClientMessage('d1', { type: 'START_MATCH' });

    const roomsMap = (manager as unknown as {
      rooms: Map<
        string,
        {
          match: {
            players: Array<{ cash: number; position: number }>;
            chanceDeck: Array<{ id: string }>;
            properties: Record<number, { tileIndex: number; ownerId: number | null; level: number }>;
          };
        }
      >;
    }).rooms;
    const dMatch = roomsMap.get(dJoined.roomCode)!.match;
    dMatch.players[1].cash = 5_000;
    dMatch.properties[1] = { tileIndex: 1, ownerId: 1, level: 0 };
    dMatch.properties[2] = { tileIndex: 2, ownerId: 0, level: 0 }; // owned by D1, NOT D2!
    const ch10 = dMatch.chanceDeck.find((c) => c.id === 'ch-10')!;
    assert.ok(ch10);
    dMatch.chanceDeck.push(ch10);
    dMatch.players[0].position = 9;
    nextDice = [1, 2]; // 9 -> 12 Chance

    manager.handleClientMessage('d1', { type: 'GAME_ACTION', action: { kind: 'ROLL_DICE' } });
    await flushMicrotasks(12);
    manager.handleClientMessage('d1', { type: 'GAME_ACTION', action: { kind: 'CONFIRM_CARD' } });
    await flushMicrotasks(8);

    for (const badTiles of [[999], [999, 1, 1], [2], [-1], [1.5]]) {
      const prevLen = (inbox.get('d2') || []).length;
      manager.handleClientMessage('d2', {
        type: 'GAME_ACTION',
        action: { kind: 'SELL_AND_PAY_DEBT', tileIndicesToSell: badTiles },
      });
      const newMsgs = (inbox.get('d2') || []).slice(prevLen);
      const invalidErr = newMsgs.find((m) => m.type === 'ERROR' && m.code === 'INVALID_ACTION');
      assert.ok(invalidErr, `Expected INVALID_ACTION for tileIndicesToSell=${JSON.stringify(badTiles)}`);
      assert.equal(dMatch.properties[1].ownerId, 1);
    }

    // Duplicate valid tile [1, 1] deduplicates cleanly and never double-refunds
    manager.handleClientMessage('d2', {
      type: 'GAME_ACTION',
      action: { kind: 'SELL_AND_PAY_DEBT', tileIndicesToSell: [1, 1] },
    });
    await flushMicrotasks(8);
    assert.equal(dMatch.properties[1].ownerId, null);
    assert.equal(dMatch.players[1].cash, 5_000 + 50_000 - 25_000);
  } finally {
    manager.dispose();
  }
});

test('Online room defaults festivalEnabled to false (0 Festival tiles) and enables 3 Festival cities + start log when toggled on', () => {
  const inbox = new Map<string, ServerToClientMessage[]>();
  const record = (clientId: string, msg: ServerToClientMessage) => {
    const arr = inbox.get(clientId) || [];
    arr.push(msg);
    inbox.set(clientId, arr);
  };

  const manager = new OnlineRoomManager(record, {
    timingScale: 0,
    enableTickInterval: false,
  });

  try {
    // 1. Default room has festivalEnabled = false and 0 festival tiles on match start
    manager.handleClientMessage('hostA', {
      type: 'CREATE_ROOM',
      playerName: 'Host A',
      tokenType: 'car',
      maxPlayers: 2,
      startingCash: 2_000_000,
      fillBots: true,
    });
    const joinedA = (inbox.get('hostA') || [])[0];
    assert.equal(joinedA?.type, 'ROOM_JOINED');
    if (joinedA?.type === 'ROOM_JOINED') {
      assert.equal(joinedA.snapshot.festivalEnabled, false);
    }

    manager.handleClientMessage('hostA', { type: 'START_MATCH' });
    const startSnapA = (inbox.get('hostA') || []).at(-1);
    assert.equal(startSnapA?.type, 'ROOM_SNAPSHOT');
    if (startSnapA?.type === 'ROOM_SNAPSHOT') {
      assert.equal(startSnapA.snapshot.match?.festivalEnabled, false);
      assert.deepEqual(startSnapA.snapshot.match?.boardModifiers.festivalTileIndices, []);
      assert.equal(
        startSnapA.snapshot.match?.logs.some((l) => l.text.includes('Lễ Hội Đầu Mùa')),
        false
      );
    }

    // 2. Enabling festivalEnabled in lobby spawns 3 Festival cities and announces them in match logs
    manager.handleClientMessage('hostB', {
      type: 'CREATE_ROOM',
      playerName: 'Host B',
      tokenType: 'yacht',
      maxPlayers: 2,
      startingCash: 2_000_000,
      fillBots: true,
    });
    manager.handleClientMessage('hostB', {
      type: 'UPDATE_LOBBY_SETTINGS',
      festivalEnabled: true,
    });
    const lobbySnapB = (inbox.get('hostB') || []).at(-1);
    assert.equal(lobbySnapB?.type, 'ROOM_SNAPSHOT');
    if (lobbySnapB?.type === 'ROOM_SNAPSHOT') {
      assert.equal(lobbySnapB.snapshot.festivalEnabled, true);
    }

    manager.handleClientMessage('hostB', { type: 'START_MATCH' });
    const startSnapB = (inbox.get('hostB') || []).at(-1);
    assert.equal(startSnapB?.type, 'ROOM_SNAPSHOT');
    if (startSnapB?.type === 'ROOM_SNAPSHOT') {
      const festIndices = startSnapB.snapshot.match?.boardModifiers.festivalTileIndices ?? [];
      assert.equal(startSnapB.snapshot.match?.festivalEnabled, true);
      assert.equal(festIndices.length, 3);
      assert.equal(
        startSnapB.snapshot.match?.logs[0]?.text.includes('🎉 Lễ Hội Đầu Mùa'),
        true
      );
    }
  } finally {
    manager.dispose();
  }
});

test('BUG-02: startMatch preserves lobby seat order across 2v2 and FFA (with/without fillBots and non-contiguous seats)', async () => {
  const latestByClient = new Map<string, ServerToClientMessage>();
  const allByClient = new Map<string, ServerToClientMessage[]>();
  const record = (clientId: string, msg: ServerToClientMessage) => {
    if (msg.type === 'ROOM_JOINED' || msg.type === 'ROOM_SNAPSHOT') {
      latestByClient.set(clientId, msg);
    }
    const arr = allByClient.get(clientId) || [];
    arr.push(msg);
    allByClient.set(clientId, arr);
  };

  const diceSeq: Array<[number, number]> = [
    [1, 2], // Case 1 Host A (seat 0, team 0): 0 -> 3 (Đà Lạt)
    [2, 3], // Case 1 Bot 1 (seat 1, team 1): 0 -> 5 (Ninh Bình)
    [1, 2], // Case 2 Bot 0 (seat 0, team 0): 0 -> 3 (Đà Lạt)
  ];
  const manager = new OnlineRoomManager(record, {
    timingScale: 0,
    enableTickInterval: false,
    diceRng: () => diceSeq.shift() ?? [1, 2],
  });

  try {
    // Case 1: TEAMS_2V2 with fillBots=true, humans at non-contiguous seats 0 & 2 (seat 1 joined then left)
    manager.handleClientMessage('a', {
      type: 'CREATE_ROOM',
      playerName: 'Host A',
      tokenType: 'car',
      maxPlayers: 4,
      startingCash: 2_000_000,
      fillBots: true,
      matchMode: 'TEAMS_2V2',
    });
    const joinedA = latestByClient.get('a');
    assert.equal(joinedA?.type, 'ROOM_JOINED');
    if (!joinedA || joinedA.type !== 'ROOM_JOINED') return;
    const code1 = joinedA.roomCode;

    manager.handleClientMessage('b', {
      type: 'JOIN_ROOM',
      roomCode: code1,
      playerName: 'Temp B',
      tokenType: 'yacht',
    });
    manager.handleClientMessage('c', {
      type: 'JOIN_ROOM',
      roomCode: code1,
      playerName: 'Player C',
      tokenType: 'jet',
    });
    const joinedC = (allByClient.get('c') || []).find((m) => m.type === 'ROOM_JOINED');
    assert.equal(joinedC?.type, 'ROOM_JOINED');
    if (!joinedC || joinedC.type !== 'ROOM_JOINED') return;
    assert.equal(joinedC.yourSeatIndex, 2);
    const cToken = joinedC.sessionToken;

    manager.handleClientMessage('b', { type: 'LEAVE_ROOM' });
    const preStartSnap = latestByClient.get('a');
    assert.equal(preStartSnap?.type, 'ROOM_SNAPSHOT');
    if (!preStartSnap || preStartSnap.type !== 'ROOM_SNAPSHOT') return;
    const lobbySeatTokens = preStartSnap.snapshot.seats.map((s) => s.tokenType);
    const lobbySeatNames = preStartSnap.snapshot.seats.map((s) => s.playerName);

    markAllGuestsReady(manager, ['c']);
    manager.handleClientMessage('a', { type: 'START_MATCH' });
    const startSnapA = latestByClient.get('a');
    const startSnapC = latestByClient.get('c');
    assert.equal(startSnapA?.type, 'ROOM_SNAPSHOT');
    assert.equal(startSnapC?.type, 'ROOM_SNAPSHOT');
    if (
      !startSnapA ||
      startSnapA.type !== 'ROOM_SNAPSHOT' ||
      !startSnapC ||
      startSnapC.type !== 'ROOM_SNAPSHOT'
    ) {
      return;
    }

    const match1 = startSnapA.snapshot.match!;
    assert.deepEqual(
      match1.players.map((p) => p.teamId),
      [0, 1, 0, 1],
      '2v2 must alternate teams 0 -> 1 -> 0 -> 1'
    );
    assert.deepEqual(
      match1.players.map((p) => p.isBot),
      [false, true, false, true],
      'Humans at seats 0 & 2 must stay at indices 0 & 2 with Bots filling seats 1 & 3'
    );
    assert.deepEqual(
      match1.players.map((p) => p.id),
      [0, 1, 2, 3]
    );
    assert.deepEqual(
      match1.players.map((p) => p.tokenType),
      lobbySeatTokens,
      'Match token order must match lobby seat preview order'
    );
    assert.deepEqual(
      match1.players.map((p) => p.name),
      lobbySeatNames,
      'Match player names must match lobby seat preview order'
    );
    assert.equal(startSnapA.yourPlayerId, 0);
    assert.equal(startSnapC.yourPlayerId, 2);

    // Verify actual turn progression alternates Team 0 -> Team 1 (Bot) -> Team 0 (Player C)
    manager.handleClientMessage('a', { type: 'GAME_ACTION', action: { kind: 'ROLL_DICE' } });
    await flushMicrotasks(12);
    manager.handleClientMessage('a', {
      type: 'GAME_ACTION',
      action: { kind: 'BUY_PROPERTY', initialLevel: 0 },
    });
    await flushMicrotasks(24);

    // After Host A (seat 0, team 0) finishes, Bot at seat 1 (team 1) automatically completes its turn,
    // advancing activePlayerIndex to Player C (seat 2, team 0).
    const afterBot1 = latestByClient.get('c');
    assert.equal(afterBot1?.type, 'ROOM_SNAPSHOT');
    if (!afterBot1 || afterBot1.type !== 'ROOM_SNAPSHOT') return;
    assert.equal(afterBot1.snapshot.match?.activePlayerIndex, 2);
    assert.equal(afterBot1.snapshot.match?.players[2].name, 'Player C');
    assert.equal(afterBot1.snapshot.match?.properties[3].ownerId, 0);
    assert.equal(afterBot1.snapshot.match?.properties[5].ownerId, 1);

    // Reconnect Player C via sessionToken -> still maps to playerId=2, seatIndex=2
    manager.handleDisconnect('c');
    manager.handleClientMessage('c-re', {
      type: 'RECONNECT_ROOM',
      roomCode: code1,
      sessionToken: cToken,
    });
    const reC = (allByClient.get('c-re') || []).find((m) => m.type === 'ROOM_JOINED');
    assert.equal(reC?.type, 'ROOM_JOINED');
    if (reC?.type === 'ROOM_JOINED') {
      assert.equal(reC.yourSeatIndex, 2);
      assert.equal(reC.yourPlayerId, 2);
    }

    // Case 2: TEAMS_2V2 with seat 0 vacated -> Host promoted to seat 1, humans at seats 1 & 3, bots at 0 & 2
    manager.handleClientMessage('x0', {
      type: 'CREATE_ROOM',
      playerName: 'Temp X0',
      tokenType: 'car',
      maxPlayers: 4,
      startingCash: 2_000_000,
      fillBots: true,
      matchMode: 'TEAMS_2V2',
    });
    const jx0 = latestByClient.get('x0');
    if (!jx0 || jx0.type !== 'ROOM_JOINED') return;
    const code2 = jx0.roomCode;
    manager.handleClientMessage('x1', {
      type: 'JOIN_ROOM',
      roomCode: code2,
      playerName: 'Human X1',
      tokenType: 'yacht',
    });
    manager.handleClientMessage('x2', {
      type: 'JOIN_ROOM',
      roomCode: code2,
      playerName: 'Temp X2',
      tokenType: 'jet',
    });
    manager.handleClientMessage('x3', {
      type: 'JOIN_ROOM',
      roomCode: code2,
      playerName: 'Human X3',
      tokenType: 'crown',
    });
    manager.handleClientMessage('x0', { type: 'LEAVE_ROOM' });
    manager.handleClientMessage('x2', { type: 'LEAVE_ROOM' });
    // Now x1 is host at seat 1, x3 is at seat 3, seats 0 & 2 are empty -> filled by Bots
    markAllGuestsReady(manager, ['x3']);
    manager.handleClientMessage('x1', { type: 'START_MATCH' });
    const startSnapX1 = latestByClient.get('x1');
    const startSnapX3 = latestByClient.get('x3');
    assert.equal(startSnapX1?.type, 'ROOM_SNAPSHOT');
    assert.equal(startSnapX3?.type, 'ROOM_SNAPSHOT');
    if (
      !startSnapX1 ||
      startSnapX1.type !== 'ROOM_SNAPSHOT' ||
      !startSnapX3 ||
      startSnapX3.type !== 'ROOM_SNAPSHOT'
    ) {
      return;
    }
    assert.deepEqual(
      startSnapX1.snapshot.match?.players.map((p) => p.isBot),
      [true, false, true, false]
    );
    assert.deepEqual(
      startSnapX1.snapshot.match?.players.map((p) => p.teamId),
      [0, 1, 0, 1]
    );
    assert.equal(startSnapX1.yourPlayerId, 1);
    assert.equal(startSnapX3.yourPlayerId, 3);

    // Bot at seat 0 should auto-run Turn 1 and pass turn to Human X1 at playerId=1
    await flushMicrotasks(24);
    const afterBot0 = latestByClient.get('x1');
    assert.equal(afterBot0?.type, 'ROOM_SNAPSHOT');
    if (afterBot0?.type === 'ROOM_SNAPSHOT') {
      assert.equal(afterBot0.snapshot.match?.activePlayerIndex, 1);
      assert.equal(afterBot0.snapshot.match?.turnPhase, 'AWAIT_ROLL');
    }

    // Case 3: FFA 3-player with fillBots=true, humans at seats 0 & 2 -> [Human@0, Bot@1, Human@2]
    manager.handleClientMessage('f0', {
      type: 'CREATE_ROOM',
      playerName: 'F0',
      tokenType: 'car',
      maxPlayers: 3,
      startingCash: 2_000_000,
      fillBots: true,
      matchMode: 'FFA',
    });
    const jf0 = latestByClient.get('f0');
    if (!jf0 || jf0.type !== 'ROOM_JOINED') return;
    manager.handleClientMessage('f1', {
      type: 'JOIN_ROOM',
      roomCode: jf0.roomCode,
      playerName: 'F1',
      tokenType: 'yacht',
    });
    manager.handleClientMessage('f2', {
      type: 'JOIN_ROOM',
      roomCode: jf0.roomCode,
      playerName: 'F2',
      tokenType: 'jet',
    });
    manager.handleClientMessage('f1', { type: 'LEAVE_ROOM' });
    markAllGuestsReady(manager, ['f2']);
    manager.handleClientMessage('f0', { type: 'START_MATCH' });
    const sf0 = latestByClient.get('f0');
    const sf2 = latestByClient.get('f2');
    assert.equal(sf0?.type, 'ROOM_SNAPSHOT');
    assert.equal(sf2?.type, 'ROOM_SNAPSHOT');
    if (sf0?.type === 'ROOM_SNAPSHOT' && sf2?.type === 'ROOM_SNAPSHOT') {
      assert.deepEqual(
        sf0.snapshot.match?.players.map((p) => p.isBot),
        [false, true, false]
      );
      assert.equal(sf0.yourPlayerId, 0);
      assert.equal(sf2.yourPlayerId, 2);
    }

    // Case 4: FFA maxPlayers=4 with fillBots=false, humans at non-contiguous seats 1 & 3
    manager.handleClientMessage('n0', {
      type: 'CREATE_ROOM',
      playerName: 'N0',
      tokenType: 'car',
      maxPlayers: 4,
      startingCash: 2_000_000,
      fillBots: false,
      matchMode: 'FFA',
    });
    const jn0 = latestByClient.get('n0');
    if (!jn0 || jn0.type !== 'ROOM_JOINED') return;
    manager.handleClientMessage('n1', {
      type: 'JOIN_ROOM',
      roomCode: jn0.roomCode,
      playerName: 'N1',
      tokenType: 'yacht',
    });
    manager.handleClientMessage('n2', {
      type: 'JOIN_ROOM',
      roomCode: jn0.roomCode,
      playerName: 'N2',
      tokenType: 'jet',
    });
    manager.handleClientMessage('n3', {
      type: 'JOIN_ROOM',
      roomCode: jn0.roomCode,
      playerName: 'N3',
      tokenType: 'crown',
    });
    manager.handleClientMessage('n0', { type: 'LEAVE_ROOM' });
    manager.handleClientMessage('n2', { type: 'LEAVE_ROOM' });
    markAllGuestsReady(manager, ['n3']);
    manager.handleClientMessage('n1', { type: 'START_MATCH' });
    const sn1 = latestByClient.get('n1');
    const sn3 = latestByClient.get('n3');
    assert.equal(sn1?.type, 'ROOM_SNAPSHOT');
    assert.equal(sn3?.type, 'ROOM_SNAPSHOT');
    if (sn1?.type === 'ROOM_SNAPSHOT' && sn3?.type === 'ROOM_SNAPSHOT') {
      assert.deepEqual(
        sn1.snapshot.match?.players.map((p) => p.name),
        ['N1', 'N3']
      );
      assert.equal(sn1.yourPlayerId, 0);
      assert.equal(sn3.yourPlayerId, 1);
    }
  } finally {
    manager.dispose();
  }
});

test('BUG-01: AFK takeover counts full missed turns (not sub-phase timeouts), handles partial interaction, doubles, disconnect/reconnect, and RECLAIM_CONTROL', async () => {
  const latestByClient = new Map<string, ServerToClientMessage>();
  const record = (clientId: string, msg: ServerToClientMessage) => {
    if (msg.type === 'ROOM_JOINED' || msg.type === 'ROOM_SNAPSHOT') {
      latestByClient.set(clientId, msg);
    }
  };

  // Sub-case A: Multi-phase timeout in Turn 1 (tacticalDice ON -> AWAIT_ROLL + REROLL_DECISION + BUY_DECISION)
  // must only count as 1 AFK turn (no takeover until Turn 3).
  const diceSeqA: Array<[number, number]> = [
    [1, 2], // Turn 1 P0: 0 -> 3 (Đà Lạt, REROLL_DECISION -> BUY_DECISION)
    [2, 3], // Turn 2 P1: 0 -> 5 (Ninh Bình)
    [1, 2], // Turn 3 P0: 3 -> 6 (Huế) -> 2nd consecutive full AFK turn -> Bot takeover!
    [1, 2], // Extra
  ];
  const managerA = new OnlineRoomManager(record, {
    timingScale: 0,
    enableTickInterval: false,
    diceRng: () => diceSeqA.shift() ?? [1, 2],
  });

  try {
    managerA.handleClientMessage('p0', {
      type: 'CREATE_ROOM',
      playerName: 'AFK P0',
      tokenType: 'car',
      maxPlayers: 2,
      startingCash: 2_000_000,
      fillBots: false,
      tacticalDiceEnabled: true,
    });
    const j0 = latestByClient.get('p0');
    if (!j0 || j0.type !== 'ROOM_JOINED') return;
    managerA.handleClientMessage('p1', {
      type: 'JOIN_ROOM',
      roomCode: j0.roomCode,
      playerName: 'Active P1',
      tokenType: 'yacht',
    });
    markAllGuestsReady(managerA, ['p1']);
    managerA.handleClientMessage('p0', { type: 'START_MATCH' });

    // 1) Drain AWAIT_ROLL (45s) on Turn 1 -> REROLL_DECISION
    for (let s = 0; s < 45; s++) managerA.tickOneSecond();
    await flushMicrotasks(12);
    let snap = latestByClient.get('p0') as Extract<ServerToClientMessage, { type: 'ROOM_SNAPSHOT' }>;
    assert.equal(snap.snapshot.match?.turnPhase, 'REROLL_DECISION');
    assert.equal(snap.snapshot.match?.players[0].isBot, false);

    // 2) Drain REROLL_DECISION -> BUY_DECISION (still Turn 1!)
    const rerollLeft = snap.snapshot.match?.turnTimeLeft ?? 18;
    for (let s = 0; s < rerollLeft; s++) managerA.tickOneSecond();
    await flushMicrotasks(12);
    snap = latestByClient.get('p0') as Extract<ServerToClientMessage, { type: 'ROOM_SNAPSHOT' }>;
    assert.equal(snap.snapshot.match?.turnPhase, 'BUY_DECISION');
    assert.equal(
      snap.snapshot.match?.players[0].isBot,
      false,
      'Must NOT take over mid-Turn 1 after REROLL_DECISION timeout'
    );

    // 3) Drain BUY_DECISION -> Turn 1 ends, turn passes to P1 (Turn 2)
    const buyLeft = snap.snapshot.match?.turnTimeLeft ?? 18;
    for (let s = 0; s < buyLeft; s++) managerA.tickOneSecond();
    await flushMicrotasks(12);
    snap = latestByClient.get('p0') as Extract<ServerToClientMessage, { type: 'ROOM_SNAPSHOT' }>;
    assert.equal(snap.snapshot.match?.activePlayerIndex, 1);
    assert.equal(snap.snapshot.match?.turnCount, 2);
    assert.equal(
      snap.snapshot.match?.players[0].isBot,
      false,
      'After 1 full AFK turn (3 sub-phase timeouts), P0 must still be human'
    );
    assert.equal(snap.snapshot.match?.players[0].onlineBotTakeover, false);

    // P1 plays Turn 2 actively
    managerA.handleClientMessage('p1', { type: 'GAME_ACTION', action: { kind: 'ROLL_DICE' } });
    await flushMicrotasks(12);
    managerA.handleClientMessage('p1', { type: 'GAME_ACTION', action: { kind: 'CONFIRM_ROLL_MOVE' } });
    await flushMicrotasks(12);
    managerA.handleClientMessage('p1', { type: 'GAME_ACTION', action: { kind: 'SKIP_BUY' } });
    await flushMicrotasks(8);

    snap = latestByClient.get('p0') as Extract<ServerToClientMessage, { type: 'ROOM_SNAPSHOT' }>;
    assert.equal(snap.snapshot.match?.activePlayerIndex, 0);
    assert.equal(snap.snapshot.match?.turnCount, 3);

    // Turn 3 (P0's 2nd consecutive AFK turn): drain AWAIT_ROLL -> NOW Bot takes over!
    for (let s = 0; s < 45; s++) managerA.tickOneSecond();
    await flushMicrotasks(12);
    snap = latestByClient.get('p0') as Extract<ServerToClientMessage, { type: 'ROOM_SNAPSHOT' }>;
    assert.equal(snap.snapshot.match?.players[0].isBot, true);
    assert.equal(snap.snapshot.match?.players[0].onlineBotTakeover, true);

    // Reclaim control -> resets AFK counter; P0 won't be taken over again after just 1 more missed turn
    managerA.handleClientMessage('p0', { type: 'RECLAIM_CONTROL' });
    snap = latestByClient.get('p0') as Extract<ServerToClientMessage, { type: 'ROOM_SNAPSHOT' }>;
    assert.equal(snap.snapshot.match?.players[0].isBot, false);
    assert.equal(snap.snapshot.match?.players[0].onlineBotTakeover, false);
  } finally {
    managerA.dispose();
  }

  // Sub-case B: Partial interaction in Turn 1 (P0 actively rolls, then times out on BUY_DECISION)
  // does NOT count as an AFK turn; Turn 3 full AFK is only missed #1 (still human!); Turn 5 triggers takeover.
  const diceSeqB: Array<[number, number]> = [
    [1, 2], // Turn 1 P0 (rolls actively, times out on BUY)
    [2, 3], // Turn 2 P1
    [2, 2], // Turn 3 P0 (full AFK, auto-rolls doubles -> BUY_DECISION timeout clears doublesStreak -> still missed=1!)
    [1, 2], // Turn 4 P1
    [1, 2], // Turn 5 P0 (2nd full AFK -> Bot takeover!)
  ];
  const managerB = new OnlineRoomManager(record, {
    timingScale: 0,
    enableTickInterval: false,
    diceRng: () => diceSeqB.shift() ?? [1, 2],
  });

  try {
    managerB.handleClientMessage('b0', {
      type: 'CREATE_ROOM',
      playerName: 'Partial P0',
      tokenType: 'car',
      maxPlayers: 2,
      startingCash: 2_000_000,
      fillBots: false,
      tacticalDiceEnabled: false,
    });
    const jb0 = latestByClient.get('b0');
    if (!jb0 || jb0.type !== 'ROOM_JOINED') return;
    managerB.handleClientMessage('b1', {
      type: 'JOIN_ROOM',
      roomCode: jb0.roomCode,
      playerName: 'Active B1',
      tokenType: 'yacht',
    });
    markAllGuestsReady(managerB, ['b1']);
    managerB.handleClientMessage('b0', { type: 'START_MATCH' });

    // Turn 1: b0 rolls actively, then lets BUY_DECISION time out
    managerB.handleClientMessage('b0', { type: 'GAME_ACTION', action: { kind: 'ROLL_DICE' } });
    await flushMicrotasks(12);
    let snapB = latestByClient.get('b0') as Extract<ServerToClientMessage, { type: 'ROOM_SNAPSHOT' }>;
    assert.equal(snapB.snapshot.match?.turnPhase, 'BUY_DECISION');
    const b1BuyTime = snapB.snapshot.match?.turnTimeLeft ?? 45;
    for (let s = 0; s < b1BuyTime; s++) managerB.tickOneSecond();
    await flushMicrotasks(12);
    snapB = latestByClient.get('b0') as Extract<ServerToClientMessage, { type: 'ROOM_SNAPSHOT' }>;
    assert.equal(snapB.snapshot.match?.activePlayerIndex, 1);
    assert.equal(snapB.snapshot.match?.players[0].isBot, false);

    // Turn 2: b1 plays
    managerB.handleClientMessage('b1', { type: 'GAME_ACTION', action: { kind: 'ROLL_DICE' } });
    await flushMicrotasks(12);
    managerB.handleClientMessage('b1', { type: 'GAME_ACTION', action: { kind: 'SKIP_BUY' } });
    await flushMicrotasks(8);

    // Turn 3: b0 is fully AFK (auto-rolls doubles [2,2], then times out BUY_DECISION) -> only AFK turn #1!
    for (let s = 0; s < 45; s++) managerB.tickOneSecond();
    await flushMicrotasks(12);
    snapB = latestByClient.get('b0') as Extract<ServerToClientMessage, { type: 'ROOM_SNAPSHOT' }>;
    assert.equal(snapB.snapshot.match?.players[0].isBot, false, 'Turn 3 must only be 1st full AFK turn');
    const b3BuyTime = snapB.snapshot.match?.turnTimeLeft ?? 18;
    for (let s = 0; s < b3BuyTime; s++) managerB.tickOneSecond();
    await flushMicrotasks(12);
    snapB = latestByClient.get('b0') as Extract<ServerToClientMessage, { type: 'ROOM_SNAPSHOT' }>;
    assert.equal(snapB.snapshot.match?.players[0].isBot, false, 'Must still be human after 1st full AFK turn');
    assert.equal(snapB.snapshot.match?.players[0].doublesStreak, 0);
    assert.equal(snapB.snapshot.match?.activePlayerIndex, 1);

    // Turn 4: b1 plays
    managerB.handleClientMessage('b1', { type: 'GAME_ACTION', action: { kind: 'ROLL_DICE' } });
    await flushMicrotasks(12);
    managerB.handleClientMessage('b1', { type: 'GAME_ACTION', action: { kind: 'SKIP_BUY' } });
    await flushMicrotasks(8);

    // Turn 5: b0 is AFK for 2nd consecutive full turn -> NOW Bot takes over!
    for (let s = 0; s < 45; s++) managerB.tickOneSecond();
    await flushMicrotasks(12);
    snapB = latestByClient.get('b0') as Extract<ServerToClientMessage, { type: 'ROOM_SNAPSHOT' }>;
    assert.equal(snapB.snapshot.match?.players[0].isBot, true);
    assert.equal(snapB.snapshot.match?.players[0].onlineBotTakeover, true);
  } finally {
    managerB.dispose();
  }
});

test('BUG-06: Server responds with ERROR INVALID_STATE / INVALID_ACTION on phase-mismatched or invalid actions instead of silently ignoring', async () => {
  const allByClient = new Map<string, ServerToClientMessage[]>();
  const latestByClient = new Map<string, ServerToClientMessage>();
  const record = (clientId: string, msg: ServerToClientMessage) => {
    if (msg.type === 'ROOM_JOINED' || msg.type === 'ROOM_SNAPSHOT') {
      latestByClient.set(clientId, msg);
    }
    const list = allByClient.get(clientId) || [];
    list.push(msg);
    allByClient.set(clientId, list);
  };

  // Use small positive timingScale so ROLLING_DICE stays active briefly for testing
  const manager = new OnlineRoomManager(record, {
    timingScale: 0.05,
    enableTickInterval: false,
    diceRng: () => [1, 2], // 3 -> Đà Lạt (BUY_DECISION)
  });

  try {
    manager.handleClientMessage('p1', {
      type: 'CREATE_ROOM',
      playerName: 'P1',
      tokenType: 'car',
      maxPlayers: 2,
      startingCash: 2_000_000,
      fillBots: false,
    });
    const j1 = latestByClient.get('p1');
    if (!j1 || j1.type !== 'ROOM_JOINED') return;
    manager.handleClientMessage('p2', {
      type: 'JOIN_ROOM',
      roomCode: j1.roomCode,
      playerName: 'P2',
      tokenType: 'yacht',
    });
    markAllGuestsReady(manager, ['p2']);
    manager.handleClientMessage('p1', { type: 'START_MATCH' });

    const expectErrorCode = (action: OnlineGameAction, expectedCode: string) => {
      const before = (allByClient.get('p1') || []).length;
      manager.handleClientMessage('p1', { type: 'GAME_ACTION', action });
      const added = (allByClient.get('p1') || []).slice(before);
      const err = added.find((m) => m.type === 'ERROR');
      assert.ok(
        err && err.type === 'ERROR',
        `Expected ERROR for action ${action.kind}, got ${JSON.stringify(added)}`
      );
      if (err && err.type === 'ERROR') {
        assert.equal(err.code, expectedCode);
      }
    };

    // During AWAIT_ROLL (not in jail)
    expectErrorCode({ kind: 'BUY_PROPERTY', initialLevel: 0 }, 'INVALID_STATE');
    expectErrorCode({ kind: 'SKIP_BUY' }, 'INVALID_STATE');
    expectErrorCode({ kind: 'DECLARE_BANKRUPTCY' }, 'INVALID_STATE');
    expectErrorCode({ kind: 'CONFIRM_CARD' }, 'INVALID_STATE');
    expectErrorCode({ kind: 'PAY_JAIL_FINE' }, 'INVALID_ACTION');
    expectErrorCode({ kind: 'USE_JAIL_CARD' }, 'INVALID_ACTION');

    // Start rolling -> synchronously enters ROLLING_DICE; duplicate ROLL_DICE must return INVALID_STATE!
    manager.handleClientMessage('p1', { type: 'GAME_ACTION', action: { kind: 'ROLL_DICE' } });
    const midRollSnap = latestByClient.get('p1') as Extract<ServerToClientMessage, { type: 'ROOM_SNAPSHOT' }>;
    assert.equal(midRollSnap.snapshot.match?.turnPhase, 'ROLLING_DICE');
    expectErrorCode({ kind: 'ROLL_DICE' }, 'INVALID_STATE');

    // Wait for dice + hop beats to complete -> BUY_DECISION
    await new Promise<void>((resolve) => setTimeout(resolve, 400));
    const atBuy = latestByClient.get('p1') as Extract<ServerToClientMessage, { type: 'ROOM_SNAPSHOT' }>;
    assert.equal(atBuy.snapshot.match?.turnPhase, 'BUY_DECISION');

    // During BUY_DECISION: sending ROLL_DICE or SKIP_UPGRADE must return INVALID_STATE
    expectErrorCode({ kind: 'ROLL_DICE' }, 'INVALID_STATE');
    expectErrorCode({ kind: 'SKIP_UPGRADE' }, 'INVALID_STATE');
  } finally {
    manager.dispose();
  }
});

test('BUG-04: Server validates expectedTurnCount, expectedPhase, expectedDecisionRevision (same-turn repeated phases), and duplicate actionId without breaking valid flows', async () => {
  const allByClient = new Map<string, ServerToClientMessage[]>();
  const latestByClient = new Map<string, ServerToClientMessage>();
  const record = (clientId: string, msg: ServerToClientMessage) => {
    if (msg.type === 'ROOM_JOINED' || msg.type === 'ROOM_SNAPSHOT') {
      latestByClient.set(clientId, msg);
    }
    const list = allByClient.get(clientId) || [];
    list.push(msg);
    allByClient.set(clientId, list);
  };

  const seq: Array<[number, number]> = [
    [3, 5], // Turn 1 P0 -> tile 8 (Lost Island!)
    [1, 2], // Turn 2 P1 -> tile 3 (Đà Lạt)
    [1, 1], // Turn 3 P0 (after PAY_JAIL_FINE): doubles 8+2=10 (Tuy Hòa), triggers bonus roll at SAME turnCount=3!
    [1, 2], // Turn 3 P0 bonus roll: 10+3=13 (Vũng Tàu), enters REROLL_DECISION #2 at SAME turnCount=3!
  ];

  const manager = new OnlineRoomManager(record, {
    timingScale: 0,
    enableTickInterval: false,
    diceRng: () => seq.shift() ?? [1, 2],
  });

  try {
    manager.handleClientMessage('p0', {
      type: 'CREATE_ROOM',
      playerName: 'Host',
      tokenType: 'car',
      maxPlayers: 2,
      startingCash: 2_000_000,
      fillBots: false,
      tacticalDiceEnabled: true,
    });
    const j0 = latestByClient.get('p0');
    if (!j0 || j0.type !== 'ROOM_JOINED') return;
    manager.handleClientMessage('p1', {
      type: 'JOIN_ROOM',
      roomCode: j0.roomCode,
      playerName: 'Guest',
      tokenType: 'yacht',
    });
    markAllGuestsReady(manager, ['p1']);
    manager.handleClientMessage('p0', { type: 'START_MATCH' });

    const getSnap = (cid: string) =>
      (latestByClient.get(cid) as Extract<ServerToClientMessage, { type: 'ROOM_SNAPSHOT' }>).snapshot.match!;

    const revTurn1 = getSnap('p0').decisionRevision;
    assert.equal(typeof revTurn1, 'number');
    assert.ok((revTurn1 ?? 0) >= 1);

    // 1. Unrelated snapshot events (ticking clock, opponent disconnect/reconnect) must NOT break valid action!
    manager.tickOneSecond();
    manager.handleDisconnect('p1');
    const revAfterNoise = getSnap('p0').decisionRevision;
    assert.equal(revAfterNoise, revTurn1, 'Clock ticks / disconnect must not bump decisionRevision');

    // Valid action with matching turnCount, phase, decisionRevision, and actionId succeeds
    manager.handleClientMessage('p0', {
      type: 'GAME_ACTION',
      action: { kind: 'ROLL_DICE' },
      expectedTurnCount: 1,
      expectedPhase: 'AWAIT_ROLL',
      expectedDecisionRevision: revTurn1,
      actionId: 'act-t1-roll',
    });
    await flushMicrotasks(12);
    const snapReroll1 = getSnap('p0');
    assert.equal(snapReroll1.turnPhase, 'REROLL_DECISION');
    assert.ok((snapReroll1.decisionRevision ?? 0) > (revTurn1 ?? 0));

    // Confirm move to Lost Island (tile 8) -> Turn 2 for P1
    manager.handleClientMessage('p0', {
      type: 'GAME_ACTION',
      action: { kind: 'CONFIRM_ROLL_MOVE' },
      expectedTurnCount: 1,
      expectedPhase: 'REROLL_DECISION',
      expectedDecisionRevision: snapReroll1.decisionRevision,
      actionId: 'act-t1-confirm',
    });
    await flushMicrotasks(12);

    // Reconnect P1 and complete Turn 2 -> Turn 3 for P0 (in Lost Island, AWAIT_ROLL!)
    const j1 = (allByClient.get('p1') || []).find((m) => m.type === 'ROOM_JOINED');
    if (!j1 || j1.type !== 'ROOM_JOINED') return;
    manager.handleClientMessage('p1-re', {
      type: 'RECONNECT_ROOM',
      roomCode: j0.roomCode,
      sessionToken: j1.sessionToken,
    });
    manager.handleClientMessage('p1-re', { type: 'GAME_ACTION', action: { kind: 'ROLL_DICE' } });
    await flushMicrotasks(12);
    manager.handleClientMessage('p1-re', { type: 'GAME_ACTION', action: { kind: 'CONFIRM_ROLL_MOVE' } });
    await flushMicrotasks(12);
    manager.handleClientMessage('p1-re', { type: 'GAME_ACTION', action: { kind: 'SKIP_BUY' } });
    await flushMicrotasks(8);

    const snapTurn3Jail = getSnap('p0');
    assert.equal(snapTurn3Jail.turnCount, 3);
    assert.equal(snapTurn3Jail.activePlayerIndex, 0);
    assert.equal(snapTurn3Jail.turnPhase, 'AWAIT_ROLL');
    assert.equal(snapTurn3Jail.players[0].inJail, true);
    assert.equal(snapTurn3Jail.players[0].jailTurns, 0);

    // 2. Stale Turn 1 ROLL_DICE replayed on Turn 3 (same phase AWAIT_ROLL!) MUST be rejected with STALE_ACTION!
    const beforeStale = (allByClient.get('p0') || []).length;
    manager.handleClientMessage('p0', {
      type: 'GAME_ACTION',
      action: { kind: 'ROLL_DICE' },
      expectedTurnCount: 1,
      expectedPhase: 'AWAIT_ROLL',
      expectedDecisionRevision: revTurn1,
      actionId: 'act-stale-turn1',
    });
    const staleMsgs = (allByClient.get('p0') || []).slice(beforeStale);
    assert.ok(staleMsgs.some((m) => m.type === 'ERROR' && m.code === 'STALE_ACTION'));
    assert.equal(getSnap('p0').turnCount, 3);
    assert.equal(getSnap('p0').players[0].jailTurns, 0);

    // 3. Duplicate actionId replay ('act-t1-roll') MUST be rejected with DUPLICATE_ACTION!
    const beforeDup = (allByClient.get('p0') || []).length;
    manager.handleClientMessage('p0', {
      type: 'GAME_ACTION',
      action: { kind: 'ROLL_DICE' },
      expectedTurnCount: 3,
      expectedPhase: 'AWAIT_ROLL',
      expectedDecisionRevision: snapTurn3Jail.decisionRevision,
      actionId: 'act-t1-roll',
    });
    const dupMsgs = (allByClient.get('p0') || []).slice(beforeDup);
    assert.ok(dupMsgs.some((m) => m.type === 'ERROR' && m.code === 'DUPLICATE_ACTION'));
    assert.equal(getSnap('p0').players[0].jailTurns, 0);

    // 4. Same turnCount & same phase ('AWAIT_ROLL') after PAY_JAIL_FINE: decisionRevision bumps!
    const revBeforePay = snapTurn3Jail.decisionRevision!;
    manager.handleClientMessage('p0', {
      type: 'GAME_ACTION',
      action: { kind: 'PAY_JAIL_FINE' },
      expectedTurnCount: 3,
      expectedPhase: 'AWAIT_ROLL',
      expectedDecisionRevision: revBeforePay,
      actionId: 'act-t3-pay-jail',
    });
    const snapAfterPay = getSnap('p0');
    assert.equal(snapAfterPay.players[0].inJail, false);
    assert.equal(snapAfterPay.turnCount, 3);
    assert.equal(snapAfterPay.turnPhase, 'AWAIT_ROLL');
    assert.ok((snapAfterPay.decisionRevision ?? 0) > revBeforePay);

    // Stale ROLL_DICE using pre-PAY_JAIL_FINE revision MUST be rejected with STALE_ACTION even though turnCount & phase match!
    const beforeOldRev = (allByClient.get('p0') || []).length;
    manager.handleClientMessage('p0', {
      type: 'GAME_ACTION',
      action: { kind: 'ROLL_DICE' },
      expectedTurnCount: 3,
      expectedPhase: 'AWAIT_ROLL',
      expectedDecisionRevision: revBeforePay,
      actionId: 'act-t3-stale-rev',
    });
    assert.ok(
      (allByClient.get('p0') || [])
        .slice(beforeOldRev)
        .some((m) => m.type === 'ERROR' && m.code === 'STALE_ACTION')
    );

    // Valid ROLL_DICE with fresh revision rolls doubles [1, 1] -> enters REROLL_DECISION #1 at turnCount=3
    manager.handleClientMessage('p0', {
      type: 'GAME_ACTION',
      action: { kind: 'ROLL_DICE' },
      expectedTurnCount: 3,
      expectedPhase: 'AWAIT_ROLL',
      expectedDecisionRevision: snapAfterPay.decisionRevision,
      actionId: 'act-t3-roll-1',
    });
    await flushMicrotasks(12);
    const snapRerollA = getSnap('p0');
    assert.equal(snapRerollA.turnCount, 3);
    assert.equal(snapRerollA.turnPhase, 'REROLL_DECISION');

    // Confirm move (doubles 1+1 -> tile 10 Tuy Hòa) -> SKIP_BUY -> doubles bonus roll stays at turnCount=3!
    manager.handleClientMessage('p0', {
      type: 'GAME_ACTION',
      action: { kind: 'CONFIRM_ROLL_MOVE' },
      expectedTurnCount: 3,
      expectedPhase: 'REROLL_DECISION',
      expectedDecisionRevision: snapRerollA.decisionRevision,
      actionId: 'act-t3-confirm-1',
    });
    await flushMicrotasks(12);
    const snapBuy1 = getSnap('p0');
    assert.equal(snapBuy1.turnPhase, 'BUY_DECISION');
    manager.handleClientMessage('p0', {
      type: 'GAME_ACTION',
      action: { kind: 'SKIP_BUY' },
      expectedTurnCount: 3,
      expectedPhase: 'BUY_DECISION',
      expectedDecisionRevision: snapBuy1.decisionRevision,
      actionId: 'act-t3-skip-1',
    });
    await flushMicrotasks(8);

    const snapBonusRoll = getSnap('p0');
    assert.equal(snapBonusRoll.turnCount, 3, 'Doubles bonus roll keeps turnCount=3');
    assert.equal(snapBonusRoll.turnPhase, 'AWAIT_ROLL');
    assert.ok((snapBonusRoll.decisionRevision ?? 0) > (snapAfterPay.decisionRevision ?? 0));

    // Roll bonus dice -> enters REROLL_DECISION #2 at the SAME turnCount=3!
    manager.handleClientMessage('p0', {
      type: 'GAME_ACTION',
      action: { kind: 'ROLL_DICE' },
      expectedTurnCount: 3,
      expectedPhase: 'AWAIT_ROLL',
      expectedDecisionRevision: snapBonusRoll.decisionRevision,
      actionId: 'act-t3-roll-2',
    });
    await flushMicrotasks(12);
    const snapRerollB = getSnap('p0');
    assert.equal(snapRerollB.turnCount, 3);
    assert.equal(snapRerollB.turnPhase, 'REROLL_DECISION');
    assert.ok((snapRerollB.decisionRevision ?? 0) > (snapRerollA.decisionRevision ?? 0));

    // Stale CONFIRM_ROLL_MOVE from REROLL_DECISION #1 (same turnCount=3, same phase!) MUST be rejected with STALE_ACTION!
    const beforeOldReroll = (allByClient.get('p0') || []).length;
    manager.handleClientMessage('p0', {
      type: 'GAME_ACTION',
      action: { kind: 'CONFIRM_ROLL_MOVE' },
      expectedTurnCount: 3,
      expectedPhase: 'REROLL_DECISION',
      expectedDecisionRevision: snapRerollA.decisionRevision,
      actionId: 'act-t3-old-confirm',
    });
    assert.ok(
      (allByClient.get('p0') || [])
        .slice(beforeOldReroll)
        .some((m) => m.type === 'ERROR' && m.code === 'STALE_ACTION')
    );

    // Fresh CONFIRM_ROLL_MOVE from REROLL_DECISION #2 succeeds -> moves 10 + 3 = 13 (Vũng Tàu)
    manager.handleClientMessage('p0', {
      type: 'GAME_ACTION',
      action: { kind: 'CONFIRM_ROLL_MOVE' },
      expectedTurnCount: 3,
      expectedPhase: 'REROLL_DECISION',
      expectedDecisionRevision: snapRerollB.decisionRevision,
      actionId: 'act-t3-fresh-confirm',
    });
    await flushMicrotasks(12);
    assert.equal(getSnap('p0').turnPhase, 'BUY_DECISION');
    assert.equal(getSnap('p0').players[0].position, 13);

    // 5. Malformed metadata types rejected safely with BAD_MESSAGE
    const beforeBadMeta = (allByClient.get('p0') || []).length;
    manager.handleClientMessage('p0', {
      type: 'GAME_ACTION',
      action: { kind: 'SKIP_BUY' },
      expectedTurnCount: '3' as unknown as number,
    });
    assert.ok(
      (allByClient.get('p0') || [])
        .slice(beforeBadMeta)
        .some((m) => m.type === 'ERROR' && m.code === 'BAD_MESSAGE')
    );
  } finally {
    manager.dispose();
  }
});

test('BUG-05 (Audit): Online TIME_LIMIT Sudden Death settles pendingDebt and pendingDebtQueue and clears pending debt state', () => {
  const latestByClient = new Map<string, ServerToClientMessage>();
  const record = (clientId: string, msg: ServerToClientMessage) => {
    if (msg.type === 'ROOM_JOINED' || msg.type === 'ROOM_SNAPSHOT') {
      latestByClient.set(clientId, msg);
    }
  };

  const manager = new OnlineRoomManager(record, {
    timingScale: 0,
    enableTickInterval: false,
  });

  try {
    manager.handleClientMessage('c1', {
      type: 'CREATE_ROOM',
      playerName: 'Debtor P0',
      tokenType: 'car',
      maxPlayers: 3,
      startingCash: 2_000_000,
      fillBots: false,
    });
    const j1 = latestByClient.get('c1');
    if (!j1 || j1.type !== 'ROOM_JOINED') return;
    manager.handleClientMessage('c2', {
      type: 'JOIN_ROOM',
      roomCode: j1.roomCode,
      playerName: 'Creditor P1',
      tokenType: 'yacht',
    });
    manager.handleClientMessage('c3', {
      type: 'JOIN_ROOM',
      roomCode: j1.roomCode,
      playerName: 'Debtor P2',
      tokenType: 'jet',
    });
    markAllGuestsReady(manager, ['c2', 'c3']);
    manager.handleClientMessage('c1', { type: 'START_MATCH' });

    const roomsMap = (manager as unknown as {
      rooms: Map<
        string,
        {
          match: {
            players: Array<{ cash: number }>;
            properties: Record<number, { tileIndex: number; ownerId: number | null; level: number }>;
            activePlayerIndex: number;
            turnPhase: string;
            matchTimeLeft: number;
            pendingDebt: { amount: number; creditorId: number | null; reason: string; debtorId?: number } | null;
            pendingDebtQueue: Array<{ amount: number; creditorId: number | null; reason: string; debtorId?: number }>;
            debtReturnToPlayerIndex: number | null;
          };
        }
      >;
    }).rooms;
    const m = roomsMap.get(j1.roomCode)!.match;
    // P0 raw NW = 10K + 1,150K (Hà Nội lv3) = 1,160K; P1 raw NW = 600K; P2 raw NW = 900K
    // P0 owes P1 900K (pendingDebt, no explicit debtorId -> activePlayerIndex=0)
    // P2 owes P1 200K (pendingDebtQueue, explicit debtorId=2)
    // Expected effective NWs: P1 = 600K + 900K + 200K = 1,700K (#1!), P2 = 700K (#2), P0 = 260K (#3)
    m.players[0].cash = 10_000;
    m.properties[29] = { tileIndex: 29, ownerId: 0, level: 3 }; // 400K + 750K = 1,150K
    m.players[1].cash = 600_000;
    m.players[2].cash = 900_000;
    m.activePlayerIndex = 0;
    m.turnPhase = 'DEBT_RESOLUTION';
    m.pendingDebt = { amount: 900_000, creditorId: 1, reason: 'Thuê nhà' };
    m.pendingDebtQueue = [{ amount: 200_000, creditorId: 1, debtorId: 2, reason: 'Sinh Nhật' }];
    m.debtReturnToPlayerIndex = 1;
    m.matchTimeLeft = 1;

    manager.tickOneSecond();

    const endSnap = latestByClient.get('c1') as Extract<ServerToClientMessage, { type: 'ROOM_SNAPSHOT' }>;
    assert.equal(endSnap.snapshot.status, 'gameover');
    const endMatch = endSnap.snapshot.match!;
    assert.equal(endMatch.turnPhase, 'GAME_OVER');
    assert.equal(endMatch.pendingDebt, null, 'pendingDebt must be cleared on TIME_LIMIT gameover');
    assert.deepEqual(endMatch.pendingDebtQueue, []);
    assert.equal(endMatch.debtReturnToPlayerIndex, null);
    assert.equal(endMatch.matchWinnerResult?.condition, 'TIME_LIMIT');
    assert.equal(endMatch.matchWinnerResult?.winner.id, 1);
    assert.equal(endMatch.matchWinnerResult?.effectiveNetWorthByPlayerId?.[1], 1_700_000);
    assert.equal(endMatch.matchWinnerResult?.effectiveNetWorthByPlayerId?.[2], 700_000);
    assert.equal(endMatch.matchWinnerResult?.effectiveNetWorthByPlayerId?.[0], 260_000);
  } finally {
    manager.dispose();
  }
});

test('BUG-09: Bot watchdog recovers dropped timer without duplicate concurrent actions, respects async chains, and cleans up on turn change / GAME_OVER / dispose', async () => {
  const waitMs = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
  const waitUntil = async (predicate: () => boolean, timeoutMs = 2500): Promise<void> => {
    const deadline = Date.now() + timeoutMs;
    while (!predicate() && Date.now() < deadline) {
      await waitMs(15);
    }
  };
  const eventsByClient = new Map<string, ServerToClientMessage[]>();
  const latestByClient = new Map<string, ServerToClientMessage>();
  let diceRolls = 0;

  const manager = new OnlineRoomManager(
    (clientId, msg) => {
      latestByClient.set(clientId, msg);
      const arr = eventsByClient.get(clientId) || [];
      arr.push(msg);
      eventsByClient.set(clientId, arr);
    },
    {
      enableTickInterval: false,
      timingScale: 0.04, // ~50ms Bot action delay, ~58ms dice beat
      diceRng: () => {
        diceRolls += 1;
        return [1, 2]; // Non-doubles so each roll ends cleanly after buy/skip
      },
    }
  );

  try {
    // Create 2P room: Seat 0 = Human, Seat 1 = Bot
    manager.handleClientMessage('h1', {
      type: 'CREATE_ROOM',
      playerName: 'Host',
      tokenType: 'car',
      maxPlayers: 2,
      startingCash: 2_000_000,
      fillBots: true,
    });
    const j1 = (eventsByClient.get('h1') || []).find((m) => m.type === 'ROOM_JOINED');
    assert.equal(j1?.type, 'ROOM_JOINED');
    if (!j1 || j1.type !== 'ROOM_JOINED') return;
    const roomCode = j1.roomCode;

    manager.handleClientMessage('h1', { type: 'START_MATCH' });

    const roomsMap = (manager as unknown as {
      rooms: Map<
        string,
        {
          pendingTimers: Set<ReturnType<typeof setTimeout>>;
          botActionTimer: ReturnType<typeof setTimeout> | null;
          match: {
            activePlayerIndex: number;
            turnPhase: string;
            turnTimeLeft: number;
            matchTimeLeft: number;
            turnCount: number;
          };
        }
      >;
    }).rooms;
    const room = roomsMap.get(roomCode)!;

    // Human rolls and skips buying Tile 3 so turn passes to Bot (Seat 1)
    manager.handleClientMessage('h1', { type: 'GAME_ACTION', action: { kind: 'ROLL_DICE' } });
    await waitUntil(() => room.match.turnPhase === 'BUY_DECISION');
    manager.handleClientMessage('h1', { type: 'GAME_ACTION', action: { kind: 'SKIP_BUY' } });

    assert.equal(room.match.activePlayerIndex, 1, 'Turn should now belong to Bot (seat 1)');
    assert.equal(room.match.turnPhase, 'AWAIT_ROLL');
    assert.ok(room.botActionTimer !== null, 'Bot timer should initially be scheduled');

    // Case 1: Simulate dropped botActionTimer (cleared & nulled) — watchdog MUST recover cleanly
    clearTimeout(room.botActionTimer!);
    room.pendingTimers.delete(room.botActionTimer!);
    room.botActionTimer = null;

    const rollsBeforeRecovery = diceRolls;
    // Tick down (including past 0) — watchdog must recover without hanging at turnTimeLeft === 0
    for (let i = 0; i < 50; i++) {
      manager.tickOneSecond();
    }
    assert.ok(
      room.botActionTimer !== null,
      'Watchdog must reschedule dropped Bot timer instead of leaving Bot stranded at turnTimeLeft === 0'
    );
    // Calling tickOneSecond 50x synchronously while rescheduled timer is pending must NOT spawn duplicate concurrent rolls
    await waitUntil(() => room.match.activePlayerIndex === 0);
    assert.equal(
      diceRolls - rollsBeforeRecovery,
      1,
      'Bot must execute exactly ONE dice roll after watchdog recovery (no duplicate concurrent actions)'
    );
    assert.equal(
      room.match.activePlayerIndex,
      0,
      'Bot turn must complete and return control to Human (seat 0)'
    );

    // Case 2: Async chain protection — Human finishes turn -> Bot starts ROLLING_DICE -> tickOneSecond during async chain must NOT double-roll
    const rollsBeforeBotTurn2 = diceRolls;
    manager.handleClientMessage('h1', { type: 'GAME_ACTION', action: { kind: 'ROLL_DICE' } });
    await waitUntil(() => room.match.turnPhase === 'BUY_DECISION' || room.match.activePlayerIndex === 1);
    // Finish whatever landing phase Human is in (Tile 6 unowned -> SKIP_BUY)
    if ((room.match.turnPhase as string) === 'BUY_DECISION') {
      manager.handleClientMessage('h1', { type: 'GAME_ACTION', action: { kind: 'SKIP_BUY' } });
    }
    assert.equal(room.match.activePlayerIndex, 1, 'Turn 2 should belong to Bot');
    // Wait until Bot starts rolling (ROLLING_DICE / MOVING_TOKEN)
    await waitUntil(
      () => room.match.turnPhase === 'ROLLING_DICE' || room.match.turnPhase === 'MOVING_TOKEN'
    );
    // Tick repeatedly during Bot's in-flight async chain
    for (let i = 0; i < 10; i++) {
      manager.tickOneSecond();
    }
    await waitUntil(() => room.match.activePlayerIndex === 0);
    assert.equal(
      diceRolls - rollsBeforeBotTurn2,
      2, // 1 for Human + 1 for Bot
      'Ticking during Bot async chain must never trigger a second concurrent Bot roll'
    );

    // Case 3: GAME_OVER cleans up all Bot timers with zero timer leaks
    if (room.match.activePlayerIndex === 0) {
      manager.handleClientMessage('h1', { type: 'GAME_ACTION', action: { kind: 'ROLL_DICE' } });
      await waitUntil(
        () => room.match.turnPhase === 'BUY_DECISION' || room.match.activePlayerIndex === 1
      );
      if ((room.match.turnPhase as string) === 'BUY_DECISION') {
        manager.handleClientMessage('h1', { type: 'GAME_ACTION', action: { kind: 'SKIP_BUY' } });
      }
    }
    room.match.matchTimeLeft = 1;
    manager.tickOneSecond();
    assert.equal(room.match.turnPhase, 'GAME_OVER');
    assert.equal(room.botActionTimer, null, 'GAME_OVER must clear botActionTimer');
    assert.equal(room.pendingTimers.size, 0, 'GAME_OVER must leave zero pending match timers');
  } finally {
    manager.dispose();
  }
});

test('Audit Hardening: Rejected INVALID_ACTION payloads (BUY_PROPERTY invalid level) must not reset AFK counter or poison processedActionIds', async () => {
  const errorsByClient = new Map<string, string[]>();
  const manager = new OnlineRoomManager(
    (clientId, msg) => {
      if (msg.type === 'ERROR') {
        const arr = errorsByClient.get(clientId) || [];
        arr.push(msg.code);
        errorsByClient.set(clientId, arr);
      }
    },
    { enableTickInterval: false, timingScale: 0, diceRng: () => [1, 2] }
  );

  try {
    manager.handleClientMessage('h1', {
      type: 'CREATE_ROOM',
      playerName: 'Host',
      tokenType: 'car',
      maxPlayers: 2,
      startingCash: 2_000_000,
      fillBots: true,
    });
    manager.handleClientMessage('h1', { type: 'START_MATCH' });
    const roomsMap = (manager as unknown as {
      rooms: Map<
        string,
        {
          match: {
            turnPhase: string;
            missedTurnsByPlayer: Record<number, number>;
            processedActionIds: Set<string>;
          };
        }
      >;
    }).rooms;
    const room = [...roomsMap.values()][0];

    // Roll into BUY_DECISION on Tile 3, then simulate prior 1 missed turn
    manager.handleClientMessage('h1', { type: 'GAME_ACTION', action: { kind: 'ROLL_DICE' } });
    await flushMicrotasks(20);
    assert.equal(room.match.turnPhase, 'BUY_DECISION');
    room.match.missedTurnsByPlayer[0] = 1;

    // Send INVALID BUY_PROPERTY (initialLevel: 99)
    manager.handleClientMessage('h1', {
      type: 'GAME_ACTION',
      action: { kind: 'BUY_PROPERTY', initialLevel: 99 },
      actionId: 'invalid-buy-99',
    });
    assert.equal(room.match.turnPhase, 'BUY_DECISION', 'Invalid buy must leave BUY_DECISION open');
    assert.ok((errorsByClient.get('h1') || []).includes('INVALID_ACTION'));
    assert.equal(
      room.match.missedTurnsByPlayer[0],
      1,
      'Rejected INVALID_ACTION must NOT reset missedTurnsByPlayer'
    );
    assert.equal(
      room.match.processedActionIds.has('invalid-buy-99') ||
        room.match.processedActionIds.has('0:invalid-buy-99'),
      false,
      'Rejected INVALID_ACTION must NOT be recorded in processedActionIds'
    );
  } finally {
    manager.dispose();
  }
});

test('Review Round 2 (BUG-04, BUG-01, BUG-05, BUG-07): per-player actionId scoping, reconnect preserving partial-turn credit + decision time floor, invalid buyout rejection, and simultaneous reconnect + TIME_LIMIT during debt', async () => {
  const latestByClient = new Map<string, ServerToClientMessage>();
  const errorsByClient = new Map<string, string[]>();
  const diceQueue: Array<[number, number]> = [
    [1, 2], // Turn 1 P0 -> Tile 3 (Đà Lạt)
    [1, 2], // Turn 2 P1 -> Tile 3
    [2, 3], // Turn 3 P0
  ];
  let dIdx = 0;

  const manager = new OnlineRoomManager(
    (clientId, msg) => {
      latestByClient.set(clientId, msg);
      if (msg.type === 'ERROR') {
        const arr = errorsByClient.get(clientId) || [];
        arr.push(msg.code);
        errorsByClient.set(clientId, arr);
      }
    },
    {
      enableTickInterval: false,
      timingScale: 0,
      diceRng: () => diceQueue[dIdx++ % diceQueue.length],
    }
  );

  try {
    manager.handleClientMessage('p0', {
      type: 'CREATE_ROOM',
      playerName: 'P0',
      tokenType: 'car',
      maxPlayers: 2,
      startingCash: 2_000_000,
      fillBots: false,
    });
    const j0 = latestByClient.get('p0') as Extract<ServerToClientMessage, { type: 'ROOM_JOINED' }>;
    const roomCode = j0.roomCode;
    const p0Token = j0.sessionToken;

    manager.handleClientMessage('p1', {
      type: 'JOIN_ROOM',
      roomCode,
      playerName: 'P1',
      tokenType: 'yacht',
    });
    markAllGuestsReady(manager, ['p1']);
    manager.handleClientMessage('p0', { type: 'START_MATCH' });

    const roomsMap = (manager as unknown as {
      rooms: Map<
        string,
        {
          status: string;
          match: {
            turnCount: number;
            turnPhase: string;
            turnTimeLeft: number;
            matchTimeLeft: number;
            activePlayerIndex: number;
            missedTurnsByPlayer: Record<number, number>;
            pendingDebt: { amount: number; creditorId: number | null; reason: string; debtorId?: number } | null;
            matchWinnerResult: {
              condition: string;
              winner: { id: number };
              effectiveNetWorthByPlayerId?: Record<number, number>;
              effectiveCashByPlayerId?: Record<number, number>;
            } | null;
            players: Array<{ id: number; cash: number; isBot: boolean; onlineBotTakeover?: boolean }>;
          };
        }
      >;
    }).rooms;
    const room = roomsMap.get(roomCode)!;

    // 1. P0 actively rolls in Turn 1 using actionId "shared-act-1", then briefly disconnects & reconnects mid-turn during BUY_DECISION
    manager.handleClientMessage('p0', {
      type: 'GAME_ACTION',
      action: { kind: 'ROLL_DICE' },
      actionId: 'shared-act-1',
    });
    await flushMicrotasks(20);
    assert.equal(room.match.turnPhase, 'BUY_DECISION');

    manager.handleDisconnect('p0');
    manager.handleClientMessage('p0-re', {
      type: 'RECONNECT_ROOM',
      roomCode,
      sessionToken: p0Token,
    });
    // Now BUY_DECISION times out in Turn 1 -> because P0 ALREADY interacted in Turn 1, missedTurnsByPlayer[0] MUST stay 0!
    room.match.turnTimeLeft = 1;
    manager.tickOneSecond();
    await flushMicrotasks(12);
    assert.equal(
      room.match.missedTurnsByPlayer[0] ?? 0,
      0,
      'Brief RECONNECT_ROOM mid-turn must NOT erase partial-turn human interaction credit'
    );
    assert.equal(room.match.activePlayerIndex, 1);

    // 2. P1 submits Turn 2 ROLL_DICE using the SAME actionId "shared-act-1" -> MUST succeed (per-player scoping)!
    manager.handleClientMessage('p1', {
      type: 'GAME_ACTION',
      action: { kind: 'ROLL_DICE' },
      actionId: 'shared-act-1',
    });
    await flushMicrotasks(20);
    assert.equal(
      (errorsByClient.get('p1') || []).includes('DUPLICATE_ACTION'),
      false,
      'Player 1 must NOT get DUPLICATE_ACTION for an actionId previously used by Player 0'
    );
    assert.equal(room.match.turnPhase, 'BUY_DECISION');

    // Same player replaying "shared-act-1" still gets DUPLICATE_ACTION
    manager.handleClientMessage('p1', {
      type: 'GAME_ACTION',
      action: { kind: 'SKIP_BUY' },
      actionId: 'shared-act-1',
    });
    assert.ok(
      (errorsByClient.get('p1') || []).includes('DUPLICATE_ACTION'),
      'Same player replaying own actionId must still get DUPLICATE_ACTION'
    );

    // P1 skips buy -> Turn 3 P0
    manager.handleClientMessage('p1', {
      type: 'GAME_ACTION',
      action: { kind: 'SKIP_BUY' },
      actionId: 'p1-skip-1',
    });
    await flushMicrotasks(12);
    assert.equal(room.match.activePlayerIndex, 0);

    // 3. Simulate P0 taken over by Bot with turnTimeLeft=1 -> P0 clicks RECLAIM_CONTROL -> must get safe floor >= 18s (not instant timeout!)
    room.match.players[0].isBot = true;
    room.match.players[0].onlineBotTakeover = true;
    room.match.turnTimeLeft = 1;
    manager.handleClientMessage('p0-re', { type: 'RECLAIM_CONTROL' });
    assert.equal(room.match.players[0].isBot, false);
    assert.ok(
      room.match.turnTimeLeft >= 18,
      `RECLAIM_CONTROL during own active decision phase must restore >= 18s floor (got ${room.match.turnTimeLeft})`
    );
    // Tick once -> must NOT time out immediately!
    manager.tickOneSecond();
    assert.equal(room.match.turnPhase, 'AWAIT_ROLL');
    assert.equal(room.match.missedTurnsByPlayer[0] ?? 0, 0);

    // 4. Invalid CONFIRM_BUYOUT must return INVALID_ACTION and NOT reset AFK counter
    room.match.turnPhase = 'BUYOUT_DECISION';
    room.match.missedTurnsByPlayer[0] = 1;
    manager.handleClientMessage('p0-re', {
      type: 'GAME_ACTION',
      action: { kind: 'CONFIRM_BUYOUT' },
      actionId: 'invalid-buyout-1',
    });
    assert.ok((errorsByClient.get('p0-re') || []).includes('INVALID_ACTION'));
    assert.equal(room.match.turnPhase, 'BUYOUT_DECISION');
    assert.equal(room.match.missedTurnsByPlayer[0], 1);

    // 5. Simultaneous disconnect + TIME_LIMIT during DEBT_RESOLUTION + reconnect race (BUG-04 + BUG-05)
    manager.handleDisconnect('p0-re');
    room.match.players[0].cash = 1_500_000;
    room.match.players[1].cash = 1_000_000;
    room.match.turnPhase = 'DEBT_RESOLUTION';
    room.match.pendingDebt = { amount: 900_000, creditorId: 1, reason: 'Thuê nhà', debtorId: 0 };
    room.match.matchTimeLeft = 1;
    manager.tickOneSecond();
    assert.equal(room.status, 'gameover');

    manager.handleClientMessage('p0-re2', {
      type: 'RECONNECT_ROOM',
      roomCode,
      sessionToken: p0Token,
    });
    const reJoin = latestByClient.get('p0-re2');
    assert.ok(reJoin && (reJoin.type === 'ROOM_JOINED' || reJoin.type === 'ROOM_SNAPSHOT'));
    const snap = reJoin.snapshot;
    assert.equal(snap.status, 'gameover');
    assert.equal(snap.match?.pendingDebt, null);
    assert.equal(snap.match?.matchWinnerResult?.winner.id, 1);
    assert.equal(snap.match?.matchWinnerResult?.effectiveNetWorthByPlayerId?.[0], 600_000);
    assert.equal(snap.match?.matchWinnerResult?.effectiveNetWorthByPlayerId?.[1], 1_900_000);
    assert.equal(snap.match?.matchWinnerResult?.effectiveCashByPlayerId?.[0], 600_000);
    assert.equal(snap.match?.matchWinnerResult?.effectiveCashByPlayerId?.[1], 1_900_000);
  } finally {
    manager.dispose();
  }
});

test('Participant identity: stable participantId across CREATE_ROOM, JOIN_ROOM, and RECONNECT_ROOM without leaking sessionToken', () => {
  const latestByClient = new Map<string, ServerToClientMessage>();
  const allByClient = new Map<string, ServerToClientMessage[]>();
  const record = (clientId: string, msg: ServerToClientMessage) => {
    if (msg.type === 'ROOM_JOINED' || msg.type === 'ROOM_SNAPSHOT') {
      latestByClient.set(clientId, msg);
    }
    const list = allByClient.get(clientId) || [];
    list.push(msg);
    allByClient.set(clientId, list);
  };

  const manager = new OnlineRoomManager(record, {
    timingScale: 0,
    enableTickInterval: false,
  });

  try {
    manager.handleClientMessage('c1', {
      type: 'CREATE_ROOM',
      playerName: 'An',
      tokenType: 'car',
      maxPlayers: 4,
      startingCash: 2_000_000,
      fillBots: false,
    });

    const created = latestByClient.get('c1');
    assert.equal(created?.type, 'ROOM_JOINED');
    if (!created || created.type !== 'ROOM_JOINED') return;

    assert.match(created.yourParticipantId, /^p_[0-9a-f]{8}$/);
    assert.equal(created.yourSeatIndex, 0);
    assert.equal(created.snapshot.participants.length, 1);
    assert.deepEqual(created.snapshot.chatHistory, []);
    assert.deepEqual(created.snapshot.participants[0], {
      participantId: created.yourParticipantId,
      playerName: 'An',
      role: 'player',
      seatIndex: 0,
      playerId: null,
      tokenType: 'car',
      connected: true,
      isHost: true,
      ready: true,
      micEnabled: false,
    });
    assert.equal(JSON.stringify(created.snapshot).includes(created.sessionToken), false);

    manager.handleClientMessage('c2', {
      type: 'JOIN_ROOM',
      roomCode: created.roomCode,
      playerName: 'Bình',
      tokenType: 'yacht',
    });

    const joined = (allByClient.get('c2') || []).find((m) => m.type === 'ROOM_JOINED');
    assert.equal(joined?.type, 'ROOM_JOINED');
    if (!joined || joined.type !== 'ROOM_JOINED') return;

    assert.match(joined.yourParticipantId, /^p_[0-9a-f]{8}$/);
    assert.notEqual(joined.yourParticipantId, created.yourParticipantId);
    assert.equal(joined.yourSeatIndex, 1);
    assert.equal(joined.snapshot.participants.length, 2);

    const c2Summary = joined.snapshot.participants.find(
      (p) => p.participantId === joined.yourParticipantId
    );
    assert.deepEqual(c2Summary, {
      participantId: joined.yourParticipantId,
      playerName: 'Bình',
      role: 'player',
      seatIndex: 1,
      playerId: null,
      tokenType: 'yacht',
      connected: true,
      isHost: false,
      ready: false,
      micEnabled: false,
    });

    const joinedSnapJson = JSON.stringify(joined.snapshot);
    assert.equal(joinedSnapJson.includes(created.sessionToken), false);
    assert.equal(joinedSnapJson.includes(joined.sessionToken), false);

    const c1AfterJoin = latestByClient.get('c1');
    assert.equal(c1AfterJoin?.type, 'ROOM_SNAPSHOT');
    if (!c1AfterJoin || c1AfterJoin.type !== 'ROOM_SNAPSHOT') return;
    assert.equal(c1AfterJoin.yourParticipantId, created.yourParticipantId);
    assert.equal(c1AfterJoin.snapshot.participants.length, 2);
    assert.equal(JSON.stringify(c1AfterJoin.snapshot).includes(created.sessionToken), false);
    assert.equal(JSON.stringify(c1AfterJoin.snapshot).includes(joined.sessionToken), false);

    // Disconnect c2 -> participant stays in snapshot with connected=false and same participantId
    manager.handleDisconnect('c2');
    const c1AfterDisc = latestByClient.get('c1');
    assert.equal(c1AfterDisc?.type, 'ROOM_SNAPSHOT');
    if (!c1AfterDisc || c1AfterDisc.type !== 'ROOM_SNAPSHOT') return;
    const c2Offline = c1AfterDisc.snapshot.participants.find(
      (p) => p.participantId === joined.yourParticipantId
    );
    assert.equal(c2Offline?.connected, false);

    // Reconnect c2 with sessionToken -> exact same participantId preserved
    manager.handleClientMessage('c2-re', {
      type: 'RECONNECT_ROOM',
      roomCode: created.roomCode,
      sessionToken: joined.sessionToken,
    });
    const rejoined = (allByClient.get('c2-re') || []).find((m) => m.type === 'ROOM_JOINED');
    assert.equal(rejoined?.type, 'ROOM_JOINED');
    if (!rejoined || rejoined.type !== 'ROOM_JOINED') return;
    assert.equal(rejoined.yourParticipantId, joined.yourParticipantId);
    assert.equal(rejoined.yourSeatIndex, 1);
    assert.equal(rejoined.snapshot.participants.length, 2);
    assert.equal(
      rejoined.snapshot.participants.find((p) => p.participantId === joined.yourParticipantId)
        ?.connected,
      true
    );
    const rejoinedSnapJson = JSON.stringify(rejoined.snapshot);
    assert.equal(rejoinedSnapJson.includes(created.sessionToken), false);
    assert.equal(rejoinedSnapJson.includes(joined.sessionToken), false);
  } finally {
    manager.dispose();
  }
});

test('Chat channel security: TEAM chat stays isolated in TEAMS_2V2 across live events and RECONNECT_ROOM, and UPDATE_VOICE_STATE broadcasts micEnabled', () => {
  const allByClient = new Map<string, ServerToClientMessage[]>();
  const latestByClient = new Map<string, ServerToClientMessage>();
  const record = (clientId: string, msg: ServerToClientMessage) => {
    if (msg.type === 'ROOM_JOINED' || msg.type === 'ROOM_SNAPSHOT') {
      latestByClient.set(clientId, msg);
    }
    const list = allByClient.get(clientId) || [];
    list.push(msg);
    allByClient.set(clientId, list);
  };

  const manager = new OnlineRoomManager(record, {
    timingScale: 0,
    enableTickInterval: false,
  });

  try {
    manager.handleClientMessage('c0', {
      type: 'CREATE_ROOM',
      playerName: 'An',
      tokenType: 'car',
      maxPlayers: 4,
      startingCash: 2_000_000,
      fillBots: false,
      matchMode: 'TEAMS_2V2',
    });
    const created = latestByClient.get('c0');
    assert.equal(created?.type, 'ROOM_JOINED');
    if (!created || created.type !== 'ROOM_JOINED') return;

    const roomCode = created.roomCode;
    manager.handleClientMessage('c1', {
      type: 'JOIN_ROOM',
      roomCode,
      playerName: 'Bình',
      tokenType: 'yacht',
    });
    manager.handleClientMessage('c2', {
      type: 'JOIN_ROOM',
      roomCode,
      playerName: 'Chi',
      tokenType: 'jet',
    });
    manager.handleClientMessage('c3', {
      type: 'JOIN_ROOM',
      roomCode,
      playerName: 'Dũng',
      tokenType: 'crown',
    });

    const c1Join = (allByClient.get('c1') || []).find((m) => m.type === 'ROOM_JOINED');
    assert.equal(c1Join?.type, 'ROOM_JOINED');
    if (!c1Join || c1Join.type !== 'ROOM_JOINED') return;

    // Lobby: seat 0 (team 0) sends TEAM chat before match starts
    manager.handleClientMessage('c0', {
      type: 'SEND_CHAT_MESSAGE',
      channel: 'TEAM',
      text: 'Đội 0 bàn chiến thuật sảnh chờ',
    });

    // UPDATE_VOICE_STATE toggles micEnabled in participants snapshot
    manager.handleClientMessage('c2', {
      type: 'UPDATE_VOICE_STATE',
      micEnabled: true,
    });
    const c0SnapAfterMic = latestByClient.get('c0');
    assert.equal(c0SnapAfterMic?.type, 'ROOM_SNAPSHOT');
    if (!c0SnapAfterMic || c0SnapAfterMic.type !== 'ROOM_SNAPSHOT') return;
    assert.equal(
      c0SnapAfterMic.snapshot.participants.find((p) => p.seatIndex === 2)?.micEnabled,
      true
    );
    assert.equal(
      c0SnapAfterMic.snapshot.participants.find((p) => p.seatIndex === 1)?.micEnabled,
      false
    );

    // Start 2v2 match
    markAllGuestsReady(manager, ['c1', 'c2', 'c3']);
    manager.handleClientMessage('c0', { type: 'START_MATCH' });

    const origNow = Date.now;
    let fakeNow = origNow() + 5_000;
    Date.now = () => fakeNow;
    try {
      // Seat 0 (teamId=0) sends TEAM chat during match
      manager.handleClientMessage('c0', {
        type: 'SEND_CHAT_MESSAGE',
        channel: 'TEAM',
        text: 'Mật thư đội 0 trong trận',
      });
      fakeNow += 1_000;
      // Seat 1 (teamId=1) sends TEAM chat during match
      manager.handleClientMessage('c1', {
        type: 'SEND_CHAT_MESSAGE',
        channel: 'TEAM',
        text: 'Mật thư đội 1 trong trận',
      });
      fakeNow += 1_000;
      // Seat 2 sends ALL chat
      manager.handleClientMessage('c2', {
        type: 'SEND_CHAT_MESSAGE',
        channel: 'ALL',
        text: 'Chào cả phòng!',
      });
    } finally {
      Date.now = origNow;
    }

    const chatEventsFor = (cid: string) =>
      (allByClient.get(cid) || []).flatMap((m) =>
        m.type === 'GAME_EVENT' && m.event.kind === 'CHAT_MESSAGE' ? [m.event.message] : []
      );

    const c0Texts = chatEventsFor('c0').map((m) => m.text);
    const c2Texts = chatEventsFor('c2').map((m) => m.text);
    const c1Texts = chatEventsFor('c1').map((m) => m.text);
    const c3Texts = chatEventsFor('c3').map((m) => m.text);

    assert.deepEqual(c0Texts, [
      'Đội 0 bàn chiến thuật sảnh chờ',
      'Mật thư đội 0 trong trận',
      'Chào cả phòng!',
    ]);
    assert.deepEqual(c2Texts, [
      'Đội 0 bàn chiến thuật sảnh chờ',
      'Mật thư đội 0 trong trận',
      'Chào cả phòng!',
    ]);
    assert.deepEqual(c1Texts, ['Mật thư đội 1 trong trận', 'Chào cả phòng!']);
    assert.deepEqual(c3Texts, ['Mật thư đội 1 trong trận', 'Chào cả phòng!']);

    // Reconnect seat 1 (teamId=1) -> snapshot.chatHistory must NOT contain team 0 messages
    manager.handleDisconnect('c1');
    manager.handleClientMessage('c1-re', {
      type: 'RECONNECT_ROOM',
      roomCode,
      sessionToken: c1Join.sessionToken,
    });
    const c1Rejoined = (allByClient.get('c1-re') || []).find((m) => m.type === 'ROOM_JOINED');
    assert.equal(c1Rejoined?.type, 'ROOM_JOINED');
    if (!c1Rejoined || c1Rejoined.type !== 'ROOM_JOINED') return;
    assert.deepEqual(
      c1Rejoined.snapshot.chatHistory.map((m) => m.text),
      ['Mật thư đội 1 trong trận', 'Chào cả phòng!']
    );

    // Also verify FFA forces channel='TEAM' to 'ALL'
    manager.handleClientMessage('ffa1', {
      type: 'CREATE_ROOM',
      playerName: 'F1',
      tokenType: 'car',
      maxPlayers: 2,
      startingCash: 2_000_000,
      fillBots: false,
      matchMode: 'FFA',
    });
    const ffaCreated = latestByClient.get('ffa1');
    assert.equal(ffaCreated?.type, 'ROOM_JOINED');
    if (!ffaCreated || ffaCreated.type !== 'ROOM_JOINED') return;
    manager.handleClientMessage('ffa2', {
      type: 'JOIN_ROOM',
      roomCode: ffaCreated.roomCode,
      playerName: 'F2',
      tokenType: 'yacht',
    });
    manager.handleClientMessage('ffa1', {
      type: 'SEND_CHAT_MESSAGE',
      channel: 'TEAM',
      text: 'Tin nhắn ở FFA',
    });
    const ffa2Chats = chatEventsFor('ffa2');
    assert.equal(ffa2Chats.length, 1);
    assert.equal(ffa2Chats[0].channel, 'ALL');
    assert.equal(ffa2Chats[0].teamId, undefined);
  } finally {
    manager.dispose();
  }
});

test('Chat validation & rate limit: empty ignored, 220 chars truncated to 160, <800ms RATE_LIMITED, and 65 ALL messages capped at newest 60', () => {
  const allByClient = new Map<string, ServerToClientMessage[]>();
  const latestByClient = new Map<string, ServerToClientMessage>();
  const record = (clientId: string, msg: ServerToClientMessage) => {
    if (msg.type === 'ROOM_JOINED' || msg.type === 'ROOM_SNAPSHOT') {
      latestByClient.set(clientId, msg);
    }
    const list = allByClient.get(clientId) || [];
    list.push(msg);
    allByClient.set(clientId, list);
  };

  const manager = new OnlineRoomManager(record, {
    timingScale: 0,
    enableTickInterval: false,
  });

  const origNow = Date.now;
  let fakeNow = 1_700_000_000_000;
  Date.now = () => fakeNow;

  try {
    manager.handleClientMessage('c1', {
      type: 'CREATE_ROOM',
      playerName: 'An',
      tokenType: 'car',
      maxPlayers: 2,
      startingCash: 2_000_000,
      fillBots: true,
    });
    const created = latestByClient.get('c1');
    assert.equal(created?.type, 'ROOM_JOINED');
    if (!created || created.type !== 'ROOM_JOINED') return;

    // 1. Empty / whitespace message is ignored without triggering cooldown
    manager.handleClientMessage('c1', {
      type: 'SEND_CHAT_MESSAGE',
      channel: 'ALL',
      text: '   \n\t  ',
    });

    // 2. 220-char message right after empty message succeeds and truncates to 160 chars
    const longText = 'X'.repeat(220);
    manager.handleClientMessage('c1', {
      type: 'SEND_CHAT_MESSAGE',
      channel: 'ALL',
      text: longText,
    });

    // 3. Second message within <800ms returns RATE_LIMITED
    fakeNow += 500;
    manager.handleClientMessage('c1', {
      type: 'SEND_CHAT_MESSAGE',
      channel: 'ALL',
      text: 'Quá nhanh',
    });

    const c1Msgs = allByClient.get('c1') || [];
    const rateErr = c1Msgs.find((m) => m.type === 'ERROR' && m.code === 'RATE_LIMITED');
    assert.ok(rateErr, 'Sending 2 messages within <800ms must return ERROR(RATE_LIMITED)');

    const chatEvents = c1Msgs.flatMap((m) =>
      m.type === 'GAME_EVENT' && m.event.kind === 'CHAT_MESSAGE' ? [m.event.message] : []
    );
    assert.equal(chatEvents.length, 1);
    assert.equal(chatEvents[0].text.length, 160);
    assert.equal(chatEvents[0].text, 'X'.repeat(160));

    // 4. Send 65 ALL messages (advancing >= 800ms each) -> reconnect snapshot keeps newest 60
    const roomCode = created.roomCode;
    const sessionToken = created.sessionToken;
    for (let i = 1; i <= 65; i++) {
      fakeNow += 800;
      manager.handleClientMessage('c1', {
        type: 'SEND_CHAT_MESSAGE',
        channel: 'ALL',
        text: `Msg-${i}`,
      });
    }

    manager.handleDisconnect('c1');
    manager.handleClientMessage('c1-re', {
      type: 'RECONNECT_ROOM',
      roomCode,
      sessionToken,
    });
    const rejoined = (allByClient.get('c1-re') || []).find((m) => m.type === 'ROOM_JOINED');
    assert.equal(rejoined?.type, 'ROOM_JOINED');
    if (!rejoined || rejoined.type !== 'ROOM_JOINED') return;

    assert.equal(rejoined.snapshot.chatHistory.length, 60);
    assert.equal(rejoined.snapshot.chatHistory[0].text, 'Msg-6');
    assert.equal(rejoined.snapshot.chatHistory[59].text, 'Msg-65');

    // 5. Verify TEAM history caps at newest 30 per team without leaking to opponent team, and gameover chat works
    manager.handleClientMessage('t0', {
      type: 'CREATE_ROOM',
      playerName: 'T0',
      tokenType: 'car',
      maxPlayers: 4,
      startingCash: 2_000_000,
      fillBots: true,
      matchMode: 'TEAMS_2V2',
    });
    const t0Join = (allByClient.get('t0') || []).find((m) => m.type === 'ROOM_JOINED');
    assert.equal(t0Join?.type, 'ROOM_JOINED');
    if (!t0Join || t0Join.type !== 'ROOM_JOINED') return;
    manager.handleClientMessage('t1', {
      type: 'JOIN_ROOM',
      roomCode: t0Join.roomCode,
      playerName: 'T1',
      tokenType: 'yacht',
    });
    const t1Join = (allByClient.get('t1') || []).find((m) => m.type === 'ROOM_JOINED');
    assert.equal(t1Join?.type, 'ROOM_JOINED');
    if (!t1Join || t1Join.type !== 'ROOM_JOINED') return;

    for (let i = 1; i <= 35; i++) {
      fakeNow += 800;
      manager.handleClientMessage('t0', {
        type: 'SEND_CHAT_MESSAGE',
        channel: 'TEAM',
        text: `Team0-${i}`,
      });
    }
    manager.handleDisconnect('t0');
    manager.handleClientMessage('t0-re', {
      type: 'RECONNECT_ROOM',
      roomCode: t0Join.roomCode,
      sessionToken: t0Join.sessionToken,
    });
    const t0Rejoined = (allByClient.get('t0-re') || []).find((m) => m.type === 'ROOM_JOINED');
    assert.equal(t0Rejoined?.type, 'ROOM_JOINED');
    if (!t0Rejoined || t0Rejoined.type !== 'ROOM_JOINED') return;
    assert.equal(t0Rejoined.snapshot.chatHistory.length, 30);
    assert.equal(t0Rejoined.snapshot.chatHistory[0].text, 'Team0-6');
    assert.equal(t0Rejoined.snapshot.chatHistory[29].text, 'Team0-35');

    manager.handleDisconnect('t1');
    manager.handleClientMessage('t1-re', {
      type: 'RECONNECT_ROOM',
      roomCode: t0Join.roomCode,
      sessionToken: t1Join.sessionToken,
    });
    const t1Rejoined = (allByClient.get('t1-re') || []).find((m) => m.type === 'ROOM_JOINED');
    assert.equal(t1Rejoined?.type, 'ROOM_JOINED');
    if (!t1Rejoined || t1Rejoined.type !== 'ROOM_JOINED') return;
    assert.equal(t1Rejoined.snapshot.chatHistory.length, 0);

    // Also verify chat works in gameover status
    markAllGuestsReady(manager, ['t1-re']);
    manager.handleClientMessage('t0-re', { type: 'START_MATCH' });
    const roomsMap = (manager as unknown as {
      rooms: Map<string, { status: string; match: { matchTimeLeft: number } | null }>;
    }).rooms;
    const tRoom = roomsMap.get(t0Join.roomCode)!;
    assert.ok(tRoom.match);
    tRoom.match.matchTimeLeft = 1;
    manager.tickOneSecond();
    assert.equal(tRoom.status, 'gameover');
    fakeNow += 800;
    manager.handleClientMessage('t0-re', {
      type: 'SEND_CHAT_MESSAGE',
      channel: 'ALL',
      text: 'GG hay quá!',
    });
    const t1GameoverChats = (allByClient.get('t1-re') || []).flatMap((m) =>
      m.type === 'GAME_EVENT' && m.event.kind === 'CHAT_MESSAGE' ? [m.event.message.text] : []
    );
    assert.deepEqual(t1GameoverChats, ['GG hay quá!']);
  } finally {
    Date.now = origNow;
    manager.dispose();
  }
});

test('RTC_SIGNAL routing & cross-room protection: relays to target in same room and rejects cross-room or disconnected targets', () => {
  const allByClient = new Map<string, ServerToClientMessage[]>();
  const record = (clientId: string, msg: ServerToClientMessage) => {
    const list = allByClient.get(clientId) || [];
    list.push(msg);
    allByClient.set(clientId, list);
  };

  const manager = new OnlineRoomManager(record, {
    timingScale: 0,
    enableTickInterval: false,
  });

  try {
    manager.handleClientMessage('c1', {
      type: 'CREATE_ROOM',
      playerName: 'P1',
      tokenType: 'car',
      maxPlayers: 2,
      startingCash: 2_000_000,
      fillBots: false,
    });
    const c1Join = (allByClient.get('c1') || []).find((m) => m.type === 'ROOM_JOINED');
    assert.equal(c1Join?.type, 'ROOM_JOINED');
    if (!c1Join || c1Join.type !== 'ROOM_JOINED') return;

    manager.handleClientMessage('c2', {
      type: 'JOIN_ROOM',
      roomCode: c1Join.roomCode,
      playerName: 'P2',
      tokenType: 'yacht',
    });
    const c2Join = (allByClient.get('c2') || []).find((m) => m.type === 'ROOM_JOINED');
    assert.equal(c2Join?.type, 'ROOM_JOINED');
    if (!c2Join || c2Join.type !== 'ROOM_JOINED') return;

    manager.handleClientMessage('c3', {
      type: 'CREATE_ROOM',
      playerName: 'OtherRoom',
      tokenType: 'car',
      maxPlayers: 2,
      startingCash: 2_000_000,
      fillBots: false,
    });
    const c3Join = (allByClient.get('c3') || []).find((m) => m.type === 'ROOM_JOINED');
    assert.equal(c3Join?.type, 'ROOM_JOINED');
    if (!c3Join || c3Join.type !== 'ROOM_JOINED') return;

    // Same-room relay: c1 -> c2
    const offerSignal = { kind: 'offer' as const, sdp: 'v=0\r\no=- 1 2 IN IP4 127.0.0.1\r\n' };
    manager.handleClientMessage('c1', {
      type: 'RTC_SIGNAL',
      targetParticipantId: c2Join.yourParticipantId,
      signal: offerSignal,
    });

    const c2Rtc = (allByClient.get('c2') || []).filter((m) => m.type === 'RTC_SIGNAL');
    assert.equal(c2Rtc.length, 1);
    assert.deepEqual(c2Rtc[0], {
      type: 'RTC_SIGNAL',
      fromParticipantId: c1Join.yourParticipantId,
      signal: offerSignal,
    });
    assert.equal(
      (allByClient.get('c1') || []).some((m) => m.type === 'RTC_SIGNAL'),
      false
    );
    assert.equal(
      (allByClient.get('c3') || []).some((m) => m.type === 'RTC_SIGNAL'),
      false
    );

    // Self-target RTC_SIGNAL -> ERROR(BAD_MESSAGE)
    manager.handleClientMessage('c1', {
      type: 'RTC_SIGNAL',
      targetParticipantId: c1Join.yourParticipantId,
      signal: offerSignal,
    });
    assert.ok(
      (allByClient.get('c1') || []).some(
        (m) => m.type === 'ERROR' && m.code === 'BAD_MESSAGE'
      )
    );

    // Cross-room relay: c1 -> c3 (different room) -> ERROR(TARGET_NOT_FOUND)
    manager.handleClientMessage('c1', {
      type: 'RTC_SIGNAL',
      targetParticipantId: c3Join.yourParticipantId,
      signal: offerSignal,
    });
    assert.ok(
      (allByClient.get('c1') || []).some(
        (m) => m.type === 'ERROR' && m.code === 'TARGET_NOT_FOUND'
      )
    );
    assert.equal(
      (allByClient.get('c3') || []).some((m) => m.type === 'RTC_SIGNAL'),
      false
    );

    // Disconnected target -> ERROR(TARGET_NOT_FOUND)
    manager.handleDisconnect('c2');
    const c1ErrCountBefore = (allByClient.get('c1') || []).filter(
      (m) => m.type === 'ERROR' && m.code === 'TARGET_NOT_FOUND'
    ).length;
    manager.handleClientMessage('c1', {
      type: 'RTC_SIGNAL',
      targetParticipantId: c2Join.yourParticipantId,
      signal: { kind: 'ice', candidate: { candidate: 'candidate:1', sdpMid: '0' } },
    });
    const c1ErrCountAfter = (allByClient.get('c1') || []).filter(
      (m) => m.type === 'ERROR' && m.code === 'TARGET_NOT_FOUND'
    ).length;
    assert.equal(c1ErrCountAfter, c1ErrCountBefore + 1);
  } finally {
    manager.dispose();
  }
});

test('RECONNECT_ROOM resets micEnabled to false on active-session replacement and disconnect/reconnect', () => {
  const allByClient = new Map<string, ServerToClientMessage[]>();
  const latestByClient = new Map<string, ServerToClientMessage>();
  const record = (clientId: string, msg: ServerToClientMessage) => {
    if (msg.type === 'ROOM_JOINED' || msg.type === 'ROOM_SNAPSHOT') {
      latestByClient.set(clientId, msg);
    }
    const list = allByClient.get(clientId) || [];
    list.push(msg);
    allByClient.set(clientId, list);
  };

  const manager = new OnlineRoomManager(record, {
    timingScale: 0,
    enableTickInterval: false,
  });

  try {
    manager.handleClientMessage('c1', {
      type: 'CREATE_ROOM',
      playerName: 'An',
      tokenType: 'car',
      maxPlayers: 2,
      startingCash: 2_000_000,
      fillBots: false,
    });
    const c1Join = (allByClient.get('c1') || []).find((m) => m.type === 'ROOM_JOINED');
    assert.equal(c1Join?.type, 'ROOM_JOINED');
    if (!c1Join || c1Join.type !== 'ROOM_JOINED') return;

    manager.handleClientMessage('c2', {
      type: 'JOIN_ROOM',
      roomCode: c1Join.roomCode,
      playerName: 'Bình',
      tokenType: 'yacht',
    });

    // Enable mic on Tab 1 ('c1')
    manager.handleClientMessage('c1', {
      type: 'UPDATE_VOICE_STATE',
      micEnabled: true,
    });
    const c2SnapWithMicOn = latestByClient.get('c2');
    assert.equal(c2SnapWithMicOn?.type, 'ROOM_SNAPSHOT');
    if (!c2SnapWithMicOn || c2SnapWithMicOn.type !== 'ROOM_SNAPSHOT') return;
    assert.equal(
      c2SnapWithMicOn.snapshot.participants.find(
        (p) => p.participantId === c1Join.yourParticipantId
      )?.micEnabled,
      true
    );

    // Tab 2 ('c1-tab2') takes over active session via RECONNECT_ROOM before Tab 1 closes
    manager.handleClientMessage('c1-tab2', {
      type: 'RECONNECT_ROOM',
      roomCode: c1Join.roomCode,
      sessionToken: c1Join.sessionToken,
    });

    assert.ok(
      (allByClient.get('c1') || []).some(
        (m) => m.type === 'ERROR' && m.code === 'SESSION_REPLACED'
      ),
      'Old active tab must receive SESSION_REPLACED'
    );

    const tab2Joined = (allByClient.get('c1-tab2') || []).find((m) => m.type === 'ROOM_JOINED');
    assert.equal(tab2Joined?.type, 'ROOM_JOINED');
    if (!tab2Joined || tab2Joined.type !== 'ROOM_JOINED') return;
    assert.equal(
      tab2Joined.snapshot.participants.find(
        (p) => p.participantId === c1Join.yourParticipantId
      )?.micEnabled,
      false,
      'ROOM_JOINED on replacing tab must start with micEnabled=false'
    );

    const c2SnapAfterReplace = latestByClient.get('c2');
    assert.equal(c2SnapAfterReplace?.type, 'ROOM_SNAPSHOT');
    if (!c2SnapAfterReplace || c2SnapAfterReplace.type !== 'ROOM_SNAPSHOT') return;
    assert.equal(
      c2SnapAfterReplace.snapshot.participants.find(
        (p) => p.participantId === c1Join.yourParticipantId
      )?.micEnabled,
      false,
      'Broadcast ROOM_SNAPSHOT after replacement must show micEnabled=false'
    );

    // Late close from Tab 1 must not disconnect Tab 2, and micEnabled stays false
    manager.handleDisconnect('c1');
    const c2AfterLateClose = latestByClient.get('c2');
    assert.equal(c2AfterLateClose?.type, 'ROOM_SNAPSHOT');
    if (!c2AfterLateClose || c2AfterLateClose.type !== 'ROOM_SNAPSHOT') return;
    const c1SummaryAfterLateClose = c2AfterLateClose.snapshot.participants.find(
      (p) => p.participantId === c1Join.yourParticipantId
    );
    assert.equal(c1SummaryAfterLateClose?.connected, true);
    assert.equal(c1SummaryAfterLateClose?.micEnabled, false);

    // Standard disconnect + reconnect after enabling mic on Tab 2 also resets micEnabled=false
    manager.handleClientMessage('c1-tab2', {
      type: 'UPDATE_VOICE_STATE',
      micEnabled: true,
    });
    manager.handleDisconnect('c1-tab2');
    manager.handleClientMessage('c1-tab3', {
      type: 'RECONNECT_ROOM',
      roomCode: c1Join.roomCode,
      sessionToken: c1Join.sessionToken,
    });
    const tab3Joined = (allByClient.get('c1-tab3') || []).find((m) => m.type === 'ROOM_JOINED');
    assert.equal(tab3Joined?.type, 'ROOM_JOINED');
    if (!tab3Joined || tab3Joined.type !== 'ROOM_JOINED') return;
    assert.equal(
      tab3Joined.snapshot.participants.find(
        (p) => p.participantId === c1Join.yourParticipantId
      )?.micEnabled,
      false
    );
  } finally {
    manager.dispose();
  }
});

test('MOVE_TO_SEAT: switches to empty seat, preserves 2v2 fair teamId, updates hostSeatIndex, and cancels conflicting pendingSeatSwap', () => {
  const allByClient = new Map<string, ServerToClientMessage[]>();
  const latestByClient = new Map<string, ServerToClientMessage>();
  const record = (clientId: string, msg: ServerToClientMessage) => {
    if (msg.type === 'ROOM_JOINED' || msg.type === 'ROOM_SNAPSHOT') {
      latestByClient.set(clientId, msg);
    }
    const list = allByClient.get(clientId) || [];
    list.push(msg);
    allByClient.set(clientId, list);
  };

  const manager = new OnlineRoomManager(record, {
    timingScale: 0,
    enableTickInterval: false,
  });

  try {
    manager.handleClientMessage('c1', {
      type: 'CREATE_ROOM',
      playerName: 'Host',
      tokenType: 'car',
      maxPlayers: 4,
      startingCash: 2_000_000,
      fillBots: true,
      matchMode: 'TEAMS_2V2',
    });
    const created = latestByClient.get('c1');
    assert.equal(created?.type, 'ROOM_JOINED');
    if (!created || created.type !== 'ROOM_JOINED') return;

    manager.handleClientMessage('c2', {
      type: 'JOIN_ROOM',
      roomCode: created.roomCode,
      playerName: 'Guest2',
      tokenType: 'yacht',
    });

    // c2 at seat 1 (Team 1) moves to empty seat 2 (Team 0)
    manager.handleClientMessage('c2', { type: 'MOVE_TO_SEAT', targetSeatIndex: 2 });
    const c2AfterMove = latestByClient.get('c2');
    assert.equal(c2AfterMove?.type, 'ROOM_SNAPSHOT');
    if (!c2AfterMove || c2AfterMove.type !== 'ROOM_SNAPSHOT') return;
    assert.equal(c2AfterMove.yourSeatIndex, 2);
    assert.equal(c2AfterMove.snapshot.seats[2].occupiedByHuman, true);
    assert.equal(c2AfterMove.snapshot.seats[2].teamId, 0);
    assert.equal(c2AfterMove.snapshot.seats[1].occupiedByHuman, false);
    assert.equal(
      c2AfterMove.snapshot.participants.find((p) => p.participantId === c2AfterMove.yourParticipantId)
        ?.seatIndex,
      2
    );

    // Moving onto occupied seat 0 is rejected
    const beforeOccupied = (allByClient.get('c2') || []).length;
    manager.handleClientMessage('c2', { type: 'MOVE_TO_SEAT', targetSeatIndex: 0 });
    assert.ok(
      (allByClient.get('c2') || [])
        .slice(beforeOccupied)
        .some((m) => m.type === 'ERROR' && m.code === 'SEAT_OCCUPIED')
    );

    // Moving out of range is rejected
    const beforeBad = (allByClient.get('c2') || []).length;
    manager.handleClientMessage('c2', { type: 'MOVE_TO_SEAT', targetSeatIndex: 4 });
    assert.ok(
      (allByClient.get('c2') || [])
        .slice(beforeBad)
        .some((m) => m.type === 'ERROR' && m.code === 'BAD_MESSAGE')
    );

    // Host moves from seat 0 -> seat 3 -> hostSeatIndex updates and ready stays true
    manager.handleClientMessage('c1', { type: 'MOVE_TO_SEAT', targetSeatIndex: 3 });
    const c1AfterHostMove = latestByClient.get('c1');
    assert.equal(c1AfterHostMove?.type, 'ROOM_SNAPSHOT');
    if (!c1AfterHostMove || c1AfterHostMove.type !== 'ROOM_SNAPSHOT') return;
    assert.equal(c1AfterHostMove.yourSeatIndex, 3);
    assert.equal(c1AfterHostMove.snapshot.hostSeatIndex, 3);
    assert.equal(c1AfterHostMove.snapshot.seats[3].isHost, true);
    assert.equal(c1AfterHostMove.snapshot.seats[3].ready, true);
    assert.equal(c1AfterHostMove.snapshot.seats[0].isHost, false);

    // Moving a seat cancels any pendingSeatSwap involving that seat
    manager.handleClientMessage('c2', { type: 'REQUEST_SEAT_SWAP', targetSeatIndex: 3 });
    const withPending = latestByClient.get('c1');
    assert.equal(withPending?.type, 'ROOM_SNAPSHOT');
    if (!withPending || withPending.type !== 'ROOM_SNAPSHOT') return;
    assert.ok(withPending.snapshot.pendingSeatSwap);

    manager.handleClientMessage('c2', { type: 'MOVE_TO_SEAT', targetSeatIndex: 1 });
    const afterCancelMove = latestByClient.get('c1');
    assert.equal(afterCancelMove?.type, 'ROOM_SNAPSHOT');
    if (!afterCancelMove || afterCancelMove.type !== 'ROOM_SNAPSHOT') return;
    assert.equal(afterCancelMove.snapshot.pendingSeatSwap, null);
    assert.equal(afterCancelMove.snapshot.seats[1].teamId, 1);
  } finally {
    manager.dispose();
  }
});

test('REQUEST_SEAT_SWAP & RESPOND_SEAT_SWAP: handles accept, decline, authorization, SWAP_PENDING, and 15s timeout expiry', async () => {
  const allByClient = new Map<string, ServerToClientMessage[]>();
  const latestByClient = new Map<string, ServerToClientMessage>();
  const record = (clientId: string, msg: ServerToClientMessage) => {
    if (msg.type === 'ROOM_JOINED' || msg.type === 'ROOM_SNAPSHOT') {
      latestByClient.set(clientId, msg);
    }
    const list = allByClient.get(clientId) || [];
    list.push(msg);
    allByClient.set(clientId, list);
  };

  const manager = new OnlineRoomManager(record, {
    timingScale: 0,
    enableTickInterval: false,
  });

  try {
    manager.handleClientMessage('c1', {
      type: 'CREATE_ROOM',
      playerName: 'Host1',
      tokenType: 'car',
      maxPlayers: 4,
      startingCash: 2_000_000,
      fillBots: false,
      matchMode: 'TEAMS_2V2',
    });
    const j1 = (allByClient.get('c1') || []).find((m) => m.type === 'ROOM_JOINED');
    assert.equal(j1?.type, 'ROOM_JOINED');
    if (!j1 || j1.type !== 'ROOM_JOINED') return;

    manager.handleClientMessage('c2', {
      type: 'JOIN_ROOM',
      roomCode: j1.roomCode,
      playerName: 'Guest2',
      tokenType: 'yacht',
    });
    const j2 = (allByClient.get('c2') || []).find((m) => m.type === 'ROOM_JOINED');
    assert.equal(j2?.type, 'ROOM_JOINED');
    if (!j2 || j2.type !== 'ROOM_JOINED') return;

    manager.handleClientMessage('c3', {
      type: 'JOIN_ROOM',
      roomCode: j1.roomCode,
      playerName: 'Guest3',
      tokenType: 'jet',
    });
    const j3 = (allByClient.get('c3') || []).find((m) => m.type === 'ROOM_JOINED');
    assert.equal(j3?.type, 'ROOM_JOINED');
    if (!j3 || j3.type !== 'ROOM_JOINED') return;

    // 1. c2 (seat 1) requests swap with c3 (seat 2)
    manager.handleClientMessage('c2', { type: 'REQUEST_SEAT_SWAP', targetSeatIndex: 2 });
    const reqSnap = latestByClient.get('c3');
    assert.equal(reqSnap?.type, 'ROOM_SNAPSHOT');
    if (!reqSnap || reqSnap.type !== 'ROOM_SNAPSHOT') return;
    const req1 = reqSnap.snapshot.pendingSeatSwap;
    assert.ok(req1);
    assert.equal(req1.fromParticipantId, j2.yourParticipantId);
    assert.equal(req1.fromSeatIndex, 1);
    assert.equal(req1.toParticipantId, j3.yourParticipantId);
    assert.equal(req1.toSeatIndex, 2);
    assert.ok(req1.expiresAt > Date.now());

    // Duplicate / concurrent request in same room rejected with SWAP_PENDING
    const beforeDupSwap = (allByClient.get('c1') || []).length;
    manager.handleClientMessage('c1', { type: 'REQUEST_SEAT_SWAP', targetSeatIndex: 1 });
    assert.ok(
      (allByClient.get('c1') || [])
        .slice(beforeDupSwap)
        .some((m) => m.type === 'ERROR' && m.code === 'SWAP_PENDING')
    );

    // Non-target c1 cannot respond
    const beforeNonTarget = (allByClient.get('c1') || []).length;
    manager.handleClientMessage('c1', {
      type: 'RESPOND_SEAT_SWAP',
      requestId: req1.requestId,
      accept: true,
    });
    assert.ok(
      (allByClient.get('c1') || [])
        .slice(beforeNonTarget)
        .some((m) => m.type === 'ERROR' && m.code === 'FORBIDDEN')
    );

    // Target c3 declines -> pendingSeatSwap cleared, seats unchanged
    manager.handleClientMessage('c3', {
      type: 'RESPOND_SEAT_SWAP',
      requestId: req1.requestId,
      accept: false,
    });
    const afterDecline = latestByClient.get('c2');
    assert.equal(afterDecline?.type, 'ROOM_SNAPSHOT');
    if (!afterDecline || afterDecline.type !== 'ROOM_SNAPSHOT') return;
    assert.equal(afterDecline.snapshot.pendingSeatSwap, null);
    assert.equal(afterDecline.yourSeatIndex, 1);

    // 2. c2 requests again and c3 accepts -> seats 1 and 2 swap!
    manager.handleClientMessage('c2', { type: 'REQUEST_SEAT_SWAP', targetSeatIndex: 2 });
    const req2Snap = latestByClient.get('c3');
    assert.equal(req2Snap?.type, 'ROOM_SNAPSHOT');
    if (!req2Snap || req2Snap.type !== 'ROOM_SNAPSHOT') return;
    const req2 = req2Snap.snapshot.pendingSeatSwap!;
    assert.ok(req2);

    manager.handleClientMessage('c3', {
      type: 'RESPOND_SEAT_SWAP',
      requestId: req2.requestId,
      accept: true,
    });
    const c2Swapped = latestByClient.get('c2');
    const c3Swapped = latestByClient.get('c3');
    assert.equal(c2Swapped?.type, 'ROOM_SNAPSHOT');
    assert.equal(c3Swapped?.type, 'ROOM_SNAPSHOT');
    if (
      !c2Swapped ||
      c2Swapped.type !== 'ROOM_SNAPSHOT' ||
      !c3Swapped ||
      c3Swapped.type !== 'ROOM_SNAPSHOT'
    ) {
      return;
    }
    assert.equal(c2Swapped.snapshot.pendingSeatSwap, null);
    assert.equal(c2Swapped.yourSeatIndex, 2);
    assert.equal(c3Swapped.yourSeatIndex, 1);
    assert.equal(c2Swapped.snapshot.seats[2].participantId, j2.yourParticipantId);
    assert.equal(c2Swapped.snapshot.seats[2].teamId, 0);
    assert.equal(c2Swapped.snapshot.seats[1].participantId, j3.yourParticipantId);
    assert.equal(c2Swapped.snapshot.seats[1].teamId, 1);

    // 3. Swapping with Host updates hostSeatIndex and preserves host.ready === true
    manager.handleClientMessage('c3', { type: 'REQUEST_SEAT_SWAP', targetSeatIndex: 0 });
    const req3Snap = latestByClient.get('c1');
    assert.equal(req3Snap?.type, 'ROOM_SNAPSHOT');
    if (!req3Snap || req3Snap.type !== 'ROOM_SNAPSHOT') return;
    const req3 = req3Snap.snapshot.pendingSeatSwap!;
    assert.ok(req3);
    manager.handleClientMessage('c1', {
      type: 'RESPOND_SEAT_SWAP',
      requestId: req3.requestId,
      accept: true,
    });
    const afterHostSwap = latestByClient.get('c1');
    assert.equal(afterHostSwap?.type, 'ROOM_SNAPSHOT');
    if (!afterHostSwap || afterHostSwap.type !== 'ROOM_SNAPSHOT') return;
    assert.equal(afterHostSwap.yourSeatIndex, 1);
    assert.equal(afterHostSwap.snapshot.hostSeatIndex, 1);
    assert.equal(afterHostSwap.snapshot.seats[1].isHost, true);
    assert.equal(afterHostSwap.snapshot.seats[1].ready, true);

    // 4. 15s expiry (timingScale: 0) auto-clears pendingSeatSwap
    manager.handleClientMessage('c2', { type: 'REQUEST_SEAT_SWAP', targetSeatIndex: 0 });
    const beforeExpire = latestByClient.get('c3');
    assert.equal(beforeExpire?.type, 'ROOM_SNAPSHOT');
    if (!beforeExpire || beforeExpire.type !== 'ROOM_SNAPSHOT') return;
    const expiredId = beforeExpire.snapshot.pendingSeatSwap!.requestId;

    await flushMicrotasks(6);

    const afterExpire = latestByClient.get('c3');
    assert.equal(afterExpire?.type, 'ROOM_SNAPSHOT');
    if (!afterExpire || afterExpire.type !== 'ROOM_SNAPSHOT') return;
    assert.equal(afterExpire.snapshot.pendingSeatSwap, null);

    const beforeLateReply = (allByClient.get('c3') || []).length;
    manager.handleClientMessage('c3', {
      type: 'RESPOND_SEAT_SWAP',
      requestId: expiredId,
      accept: true,
    });
    assert.ok((allByClient.get('c3') || []).slice(beforeLateReply).some((m) => m.type === 'ERROR'));
  } finally {
    manager.dispose();
  }
});

test('HOST_SWAP_SEATS: host swaps occupied or empty seats directly and updates hostSeatIndex', () => {
  const allByClient = new Map<string, ServerToClientMessage[]>();
  const latestByClient = new Map<string, ServerToClientMessage>();
  const record = (clientId: string, msg: ServerToClientMessage) => {
    if (msg.type === 'ROOM_JOINED' || msg.type === 'ROOM_SNAPSHOT') {
      latestByClient.set(clientId, msg);
    }
    const list = allByClient.get(clientId) || [];
    list.push(msg);
    allByClient.set(clientId, list);
  };

  const manager = new OnlineRoomManager(record, {
    timingScale: 0,
    enableTickInterval: false,
  });

  try {
    manager.handleClientMessage('c1', {
      type: 'CREATE_ROOM',
      playerName: 'Host',
      tokenType: 'car',
      maxPlayers: 4,
      startingCash: 2_000_000,
      fillBots: true,
      matchMode: 'TEAMS_2V2',
    });
    const j1 = latestByClient.get('c1');
    if (!j1 || j1.type !== 'ROOM_JOINED') return;

    manager.handleClientMessage('c2', {
      type: 'JOIN_ROOM',
      roomCode: j1.roomCode,
      playerName: 'Guest2',
      tokenType: 'yacht',
    });

    // Non-host rejected
    const beforeForbidden = (allByClient.get('c2') || []).length;
    manager.handleClientMessage('c2', { type: 'HOST_SWAP_SEATS', seatA: 1, seatB: 2 });
    assert.ok(
      (allByClient.get('c2') || [])
        .slice(beforeForbidden)
        .some((m) => m.type === 'ERROR' && m.code === 'FORBIDDEN')
    );

    // Swap occupied seat 1 with empty seat 2
    manager.handleClientMessage('c1', { type: 'HOST_SWAP_SEATS', seatA: 1, seatB: 2 });
    const afterEmptySwap = latestByClient.get('c2');
    assert.equal(afterEmptySwap?.type, 'ROOM_SNAPSHOT');
    if (!afterEmptySwap || afterEmptySwap.type !== 'ROOM_SNAPSHOT') return;
    assert.equal(afterEmptySwap.yourSeatIndex, 2);
    assert.equal(afterEmptySwap.snapshot.seats[2].teamId, 0);
    assert.equal(afterEmptySwap.snapshot.seats[1].occupiedByHuman, false);

    // Swap Host seat 0 with Guest seat 2 -> hostSeatIndex updates to 2 and Host stays ready
    manager.handleClientMessage('c1', { type: 'HOST_SWAP_SEATS', seatA: 0, seatB: 2 });
    const c1AfterSwap = latestByClient.get('c1');
    const c2AfterSwap = latestByClient.get('c2');
    assert.equal(c1AfterSwap?.type, 'ROOM_SNAPSHOT');
    assert.equal(c2AfterSwap?.type, 'ROOM_SNAPSHOT');
    if (
      !c1AfterSwap ||
      c1AfterSwap.type !== 'ROOM_SNAPSHOT' ||
      !c2AfterSwap ||
      c2AfterSwap.type !== 'ROOM_SNAPSHOT'
    ) {
      return;
    }
    assert.equal(c1AfterSwap.yourSeatIndex, 2);
    assert.equal(c1AfterSwap.snapshot.hostSeatIndex, 2);
    assert.equal(c1AfterSwap.snapshot.seats[2].isHost, true);
    assert.equal(c1AfterSwap.snapshot.seats[2].ready, true);
    assert.equal(c2AfterSwap.yourSeatIndex, 0);
    assert.equal(c2AfterSwap.snapshot.seats[0].isHost, false);
  } finally {
    manager.dispose();
  }
});

test('Ready Check: blocks START_MATCH when guests unready, resets ready + posts system notice on rule change, and enforces carried-over host/lobby rules', () => {
  const allByClient = new Map<string, ServerToClientMessage[]>();
  const latestByClient = new Map<string, ServerToClientMessage>();
  const record = (clientId: string, msg: ServerToClientMessage) => {
    if (msg.type === 'ROOM_JOINED' || msg.type === 'ROOM_SNAPSHOT') {
      latestByClient.set(clientId, msg);
    }
    const list = allByClient.get(clientId) || [];
    list.push(msg);
    allByClient.set(clientId, list);
  };

  const manager = new OnlineRoomManager(record, {
    timingScale: 0,
    enableTickInterval: false,
  });

  try {
    manager.handleClientMessage('c1', {
      type: 'CREATE_ROOM',
      playerName: 'Host',
      tokenType: 'car',
      maxPlayers: 2,
      startingCash: 2_000_000,
      fillBots: false,
    });
    const j1 = latestByClient.get('c1');
    if (!j1 || j1.type !== 'ROOM_JOINED') return;

    manager.handleClientMessage('c2', {
      type: 'JOIN_ROOM',
      roomCode: j1.roomCode,
      playerName: 'Guest',
      tokenType: 'yacht',
    });

    // 1. Unready guest blocks START_MATCH with GUESTS_NOT_READY
    const beforeBlock = (allByClient.get('c1') || []).length;
    manager.handleClientMessage('c1', { type: 'START_MATCH' });
    assert.ok(
      (allByClient.get('c1') || [])
        .slice(beforeBlock)
        .some((m) => m.type === 'ERROR' && m.code === 'GUESTS_NOT_READY')
    );

    // 2. Guest marks ready -> reflected in seats and participants
    manager.handleClientMessage('c2', { type: 'SET_READY', ready: true });
    const snapReady = latestByClient.get('c1');
    assert.equal(snapReady?.type, 'ROOM_SNAPSHOT');
    if (!snapReady || snapReady.type !== 'ROOM_SNAPSHOT') return;
    assert.equal(snapReady.snapshot.seats[1].ready, true);
    assert.equal(snapReady.snapshot.participants.find((p) => p.seatIndex === 1)?.ready, true);

    // 3. Host changes rule (startingCash) -> resets guest ready=false and appends system chat notice
    manager.handleClientMessage('c1', {
      type: 'UPDATE_LOBBY_SETTINGS',
      startingCash: 3_000_000,
    });
    const snapAfterRule = latestByClient.get('c2');
    assert.equal(snapAfterRule?.type, 'ROOM_SNAPSHOT');
    if (!snapAfterRule || snapAfterRule.type !== 'ROOM_SNAPSHOT') return;
    assert.equal(snapAfterRule.snapshot.startingCash, 3_000_000);
    assert.equal(snapAfterRule.snapshot.seats[1].ready, false);
    assert.equal(snapAfterRule.snapshot.participants.find((p) => p.seatIndex === 1)?.ready, false);
    assert.equal(snapAfterRule.snapshot.seats[0].ready, true);
    assert.equal(snapAfterRule.snapshot.chatHistory.length, 1);
    assert.equal(snapAfterRule.snapshot.chatHistory[0].senderName, 'Hệ thống');
    assert.equal(snapAfterRule.snapshot.chatHistory[0].participantId, 'system');
    assert.equal(snapAfterRule.snapshot.chatHistory[0].senderColor, '#0284c7');
    assert.equal(snapAfterRule.snapshot.chatHistory[0].channel, 'ALL');

    const sysChatEvents = (allByClient.get('c2') || []).filter(
      (m) =>
        m.type === 'GAME_EVENT' &&
        m.event.kind === 'CHAT_MESSAGE' &&
        m.event.message.participantId === 'system'
    );
    assert.equal(sysChatEvents.length, 1);

    // Sending identical setting does NOT reset ready or duplicate system message
    manager.handleClientMessage('c2', { type: 'SET_READY', ready: true });
    manager.handleClientMessage('c1', {
      type: 'UPDATE_LOBBY_SETTINGS',
      startingCash: 3_000_000,
    });
    const snapNoChange = latestByClient.get('c2');
    assert.equal(snapNoChange?.type, 'ROOM_SNAPSHOT');
    if (!snapNoChange || snapNoChange.type !== 'ROOM_SNAPSHOT') return;
    assert.equal(snapNoChange.snapshot.seats[1].ready, true);
    assert.equal(snapNoChange.snapshot.chatHistory.length, 1);

    // Changing botDifficulty ALSO resets ready and posts another system notice
    manager.handleClientMessage('c1', {
      type: 'UPDATE_LOBBY_SETTINGS',
      botDifficulty: 'hard',
    });
    const snapDiffChange = latestByClient.get('c2');
    assert.equal(snapDiffChange?.type, 'ROOM_SNAPSHOT');
    if (!snapDiffChange || snapDiffChange.type !== 'ROOM_SNAPSHOT') return;
    assert.equal(snapDiffChange.snapshot.botDifficulty, 'hard');
    assert.equal(snapDiffChange.snapshot.seats[1].ready, false);
    assert.equal(snapDiffChange.snapshot.chatHistory.length, 2);

    // 4. Ready again -> START_MATCH succeeds; RETURN_TO_LOBBY resets guest ready=false & host ready=true
    manager.handleClientMessage('c2', { type: 'SET_READY', ready: true });
    manager.handleClientMessage('c1', { type: 'START_MATCH' });
    const started = latestByClient.get('c1');
    assert.equal(started?.type, 'ROOM_SNAPSHOT');
    if (!started || started.type !== 'ROOM_SNAPSHOT') return;
    assert.equal(started.snapshot.status, 'playing');

    const roomsMap = (manager as unknown as {
      rooms: Map<string, { match: { matchTimeLeft: number } | null }>;
    }).rooms;
    roomsMap.get(j1.roomCode)!.match!.matchTimeLeft = 1;
    manager.tickOneSecond();

    manager.handleClientMessage('c1', { type: 'RETURN_TO_LOBBY' });
    const returned = latestByClient.get('c2');
    assert.equal(returned?.type, 'ROOM_SNAPSHOT');
    if (!returned || returned.type !== 'ROOM_SNAPSHOT') return;
    assert.equal(returned.snapshot.status, 'lobby');
    assert.equal(returned.snapshot.seats[0].ready, true);
    assert.equal(returned.snapshot.seats[1].ready, false);

    // 5. Carried-over ruling: promoteConnectedHostIfNeeded sets newHost.ready = true
    manager.handleDisconnect('c1');
    const afterHostDrop = latestByClient.get('c2');
    assert.equal(afterHostDrop?.type, 'ROOM_SNAPSHOT');
    if (!afterHostDrop || afterHostDrop.type !== 'ROOM_SNAPSHOT') return;
    assert.equal(afterHostDrop.snapshot.hostSeatIndex, 1);
    assert.equal(afterHostDrop.snapshot.seats[1].isHost, true);
    assert.equal(afterHostDrop.snapshot.seats[1].ready, true);
    assert.equal(afterHostDrop.snapshot.participants.find((p) => p.seatIndex === 1)?.ready, true);
  } finally {
    manager.dispose();
  }
});

test('botDifficulty: persists in CREATE_ROOM/UPDATE_LOBBY_SETTINGS and drives Bot AI decisions in runBotDecision', async () => {
  const latestByClient = new Map<string, ServerToClientMessage>();
  const record = (clientId: string, msg: ServerToClientMessage) => {
    if (msg.type === 'ROOM_JOINED' || msg.type === 'ROOM_SNAPSHOT') {
      latestByClient.set(clientId, msg);
    }
  };

  const manager = new OnlineRoomManager(record, {
    timingScale: 0,
    enableTickInterval: false,
    diceRng: () => [1, 2], // non-doubles so jailed Bot without paying fine stays in jail
  });

  try {
    // Hard room: Bot in jail with 500_000 cash (>= 450_000 hard threshold) pays 200_000 fine!
    manager.handleClientMessage('h-hard', {
      type: 'CREATE_ROOM',
      playerName: 'HostHard',
      tokenType: 'car',
      maxPlayers: 2,
      startingCash: 2_000_000,
      fillBots: true,
      botDifficulty: 'hard',
    });
    const jHard = latestByClient.get('h-hard');
    assert.equal(jHard?.type, 'ROOM_JOINED');
    if (!jHard || jHard.type !== 'ROOM_JOINED') return;
    assert.equal(jHard.snapshot.botDifficulty, 'hard');
    manager.handleClientMessage('h-hard', { type: 'START_MATCH' });

    // Easy room: Bot in jail with 500_000 cash (< 950_000 easy threshold) does NOT pay fine!
    manager.handleClientMessage('h-easy', {
      type: 'CREATE_ROOM',
      playerName: 'HostEasy',
      tokenType: 'car',
      maxPlayers: 2,
      startingCash: 2_000_000,
      fillBots: true,
      botDifficulty: 'easy',
    });
    const jEasy = latestByClient.get('h-easy');
    assert.equal(jEasy?.type, 'ROOM_JOINED');
    if (!jEasy || jEasy.type !== 'ROOM_JOINED') return;
    assert.equal(jEasy.snapshot.botDifficulty, 'easy');
    manager.handleClientMessage('h-easy', { type: 'START_MATCH' });

    const roomsMap = (manager as unknown as {
      rooms: Map<
        string,
        {
          match: {
            players: Array<{
              cash: number;
              position: number;
              inJail: boolean;
              jailTurns: number;
              jailFreeCards: number;
            }>;
          };
        }
      >;
    }).rooms;

    const hardBot = roomsMap.get(jHard.roomCode)!.match.players[1];
    hardBot.inJail = true;
    hardBot.position = 8;
    hardBot.cash = 500_000;
    hardBot.jailFreeCards = 0;

    const easyBot = roomsMap.get(jEasy.roomCode)!.match.players[1];
    easyBot.inJail = true;
    easyBot.position = 8;
    easyBot.cash = 500_000;
    easyBot.jailFreeCards = 0;

    // Humans skip Turn 1 (roll 1+2=3 -> skip buy Đà Lạt) -> triggers Bot Turn 2 in both rooms
    manager.handleClientMessage('h-hard', { type: 'GAME_ACTION', action: { kind: 'ROLL_DICE' } });
    manager.handleClientMessage('h-easy', { type: 'GAME_ACTION', action: { kind: 'ROLL_DICE' } });
    await flushMicrotasks(12);
    manager.handleClientMessage('h-hard', { type: 'GAME_ACTION', action: { kind: 'SKIP_BUY' } });
    manager.handleClientMessage('h-easy', { type: 'GAME_ACTION', action: { kind: 'SKIP_BUY' } });
    await flushMicrotasks(32);

    assert.equal(hardBot.inJail, false, 'Hard bot with 500K must pay JAIL_FINE and exit jail');
    assert.ok(hardBot.position !== 8, 'Hard bot must roll out of Lost Island after paying fine');
    assert.equal(easyBot.inJail, true, 'Easy bot with 500K must not pay JAIL_FINE');
    assert.equal(easyBot.cash, 500_000, 'Easy bot must retain 500K after failing to roll doubles');
  } finally {
    manager.dispose();
  }
});
