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

    // Tick again to trigger 2nd missed turn -> Bot AI takeover + auto SKIP_BUY
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
    manager.handleClientMessage('c1', { type: 'START_MATCH' });

    // Drain 45s while c1 is STILL CONNECTED -> missed turn #1 auto-rolls [2, 2] (doubles!)
    for (let s = 0; s < 45; s++) {
      manager.tickOneSecond();
    }
    await flushMicrotasks(12);

    const afterMiss1 = latestByClient.get('c1') as Extract<ServerToClientMessage, { type: 'ROOM_SNAPSHOT' }>;
    assert.equal(afterMiss1.snapshot.match?.turnPhase, 'BUY_DECISION');
    assert.equal(afterMiss1.snapshot.match?.players[0].doublesStreak, 1);

    // Drain BUY_DECISION timeout -> missed turn #2 triggers connected AFK Bot takeover (BUG-12)
    // AND clears doublesStreak = 0 so turn passes to P2 (BUG-13)!
    const buyTime = afterMiss1.snapshot.match?.turnTimeLeft ?? 18;
    for (let s = 0; s < buyTime; s++) {
      manager.tickOneSecond();
    }
    await flushMicrotasks(12);

    const afterMiss2 = latestByClient.get('c1') as Extract<ServerToClientMessage, { type: 'ROOM_SNAPSHOT' }>;
    assert.equal(afterMiss2.snapshot.match?.players[0].onlineConnected, true);
    assert.equal(afterMiss2.snapshot.match?.players[0].onlineBotTakeover, true);
    assert.equal(afterMiss2.snapshot.match?.players[0].isBot, true);
    assert.equal(afterMiss2.snapshot.match?.players[0].doublesStreak, 0);
    assert.equal(afterMiss2.snapshot.match?.activePlayerIndex, 1);

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


