import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';
import { WebSocket } from 'ws';
import type { ServerToClientMessage } from '../game/onlineTypes';
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

test('World Tour blocks Lost Island/Tax, allows flying to opponent city for 2x Buyout & Start landing remote upgrade', async () => {
  const latestByClient = new Map<string, ServerToClientMessage>();
  const record = (clientId: string, msg: ServerToClientMessage) => {
    if (msg.type === 'ROOM_JOINED' || msg.type === 'ROOM_SNAPSHOT') {
      latestByClient.set(clientId, msg);
    }
  };

  const diceQueue: Array<[number, number]> = [
    [5, 6], // P1: 0 -> 11 (buys Phan Thiết lv0 = 160K)
    [1, 2], // P2: 0 -> 3 (buys Đà Lạt lv0 = 70K)
    [5, 6], // P1: 11 -> 22 (skips)
    [1, 2], // P2: 3 -> 6 (skips)
    [1, 1], // P1: 22 -> 24 (WORLD_TOUR + doubles triggers immediate WORLD_TOUR phase)
    [4, 6], // P2: 6 -> 16 (free Championship on Đà Lạt if owned, or next roll)
    [2, 4], // P2 extra if needed
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

    // Invalid targets: Lost Island (8) and Tax (30) must keep pendingWorldTour & stay in WORLD_TOUR!
    manager.handleClientMessage('c1', {
      type: 'GAME_ACTION',
      action: { kind: 'SELECT_WORLD_TOUR', targetTile: 8 },
    });
    manager.handleClientMessage('c1', {
      type: 'GAME_ACTION',
      action: { kind: 'SELECT_WORLD_TOUR', targetTile: 30 },
    });
    await flushMicrotasks(8);

    const afterInvalid = latestByClient.get('c1');
    assert.equal(afterInvalid?.type, 'ROOM_SNAPSHOT');
    if (!afterInvalid || afterInvalid.type !== 'ROOM_SNAPSHOT') return;
    assert.equal(afterInvalid.snapshot.match?.turnPhase, 'WORLD_TOUR');
    assert.equal(afterInvalid.snapshot.match?.players[0].pendingWorldTour, true);
    assert.equal(afterInvalid.snapshot.match?.players[0].position, 24);

    // Valid target: fly to START (0) -> gains +300K salary, laps=1, and enters START_UPGRADE_SELECTION!
    manager.handleClientMessage('c1', {
      type: 'GAME_ACTION',
      action: { kind: 'SELECT_WORLD_TOUR', targetTile: 0 },
    });
    await flushMicrotasks(14);

    const atStart = latestByClient.get('c1');
    assert.equal(atStart?.type, 'ROOM_SNAPSHOT');
    if (!atStart || atStart.type !== 'ROOM_SNAPSHOT') return;
    assert.equal(atStart.snapshot.match?.players[0].position, 0);
    assert.equal(atStart.snapshot.match?.players[0].laps, 1);
    assert.equal(atStart.snapshot.match?.turnPhase, 'START_UPGRADE_SELECTION');

    // Select owned city 11 (Phan Thiết) and upgrade straight from level 0 to Hotel ★ (level 4)!
    manager.handleClientMessage('c1', {
      type: 'GAME_ACTION',
      action: { kind: 'SELECT_START_UPGRADE_CITY', targetTile: 11 },
    });
    await flushMicrotasks(6);
    manager.handleClientMessage('c1', {
      type: 'GAME_ACTION',
      action: { kind: 'UPGRADE_PROPERTY', targetLevel: 4 },
    });
    await flushMicrotasks(8);

    const afterStartUpg = latestByClient.get('c1');
    assert.equal(afterStartUpg?.type, 'ROOM_SNAPSHOT');
    if (!afterStartUpg || afterStartUpg.type !== 'ROOM_SNAPSHOT') return;
    assert.equal(afterStartUpg.snapshot.match?.properties[11].level, 4);
    assert.equal(afterStartUpg.snapshot.match?.activePlayerIndex, 1);
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
    [4, 5], // T5b P1: 30 -> 7 (+300K, laps=1; upgrades Hội An lv2 -> lv4 Hotel ★! Rent = 850K)
    [2, 3], // T6 P2: 2 -> 7 (lands on P1's Hội An Hotel ★, rent = 850K! P2 has 180K cash + 360K + 650K + 160K = 1,350K > 850K; P2 declares bankruptcy -> P1 must receive +1,350K!)
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

    // T5 P1 -> 30 Tax (auto-paid, doubles) -> 7 Hội An upgrades to Hotel ★ (level 4)
    manager.handleClientMessage('c1', { type: 'GAME_ACTION', action: { kind: 'ROLL_DICE' } });
    await flushMicrotasks(12);
    manager.handleClientMessage('c1', { type: 'GAME_ACTION', action: { kind: 'ROLL_DICE' } });
    await flushMicrotasks(12);
    manager.handleClientMessage('c1', {
      type: 'GAME_ACTION',
      action: { kind: 'UPGRADE_PROPERTY', targetLevel: 4 },
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

test('Online sub-phase timer floor prevents instant skip at 00:01, BACK_TO_START_UPGRADE returns to city picker, and null/failed generateBotQuip falls back to ready quip', async () => {
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
    [1, 2], // Bot P2 rolls 3 -> lands on Đà Lạt (tile 3, leaves P1's tile 11 untouched)
    [6, 6], // P1 rolls -> 23 (Hải Phòng, doubles!)
    [4, 5], // P1 rolls -> 0 (START! laps=1, owns tiles 11 & 23 -> START_UPGRADE_SELECTION)
  ];

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
    await flushMicrotasks(24); // Bot P2 also completes its automated turn (rolls 6+5=11? wait: seq[1] is [6,5] -> lands on P1's tile 11 or let's check!)

    // Wait until activePlayerIndex returns to P1 (0)
    const afterBotTurn = latestByClient.get('c1');
    assert.equal(afterBotTurn?.type, 'ROOM_SNAPSHOT');
    if (!afterBotTurn || afterBotTurn.type !== 'ROOM_SNAPSHOT') return;
    assert.equal(afterBotTurn.snapshot.match?.activePlayerIndex, 0);

    // P1 rolls [6, 6] -> tile 23 (buys lv0, doubles!) -> rolls [4, 5] -> tile 0 (START, START_UPGRADE_SELECTION!)
    manager.handleClientMessage('c1', { type: 'GAME_ACTION', action: { kind: 'ROLL_DICE' } });
    await flushMicrotasks(12);
    manager.handleClientMessage('c1', {
      type: 'GAME_ACTION',
      action: { kind: 'BUY_PROPERTY', initialLevel: 0 },
    });
    await flushMicrotasks(8);

    manager.handleClientMessage('c1', { type: 'GAME_ACTION', action: { kind: 'ROLL_DICE' } });
    await flushMicrotasks(12);

    const atStartUpg = latestByClient.get('c1');
    assert.equal(atStartUpg?.type, 'ROOM_SNAPSHOT');
    if (!atStartUpg || atStartUpg.type !== 'ROOM_SNAPSHOT') return;
    assert.equal(atStartUpg.snapshot.match?.turnPhase, 'START_UPGRADE_SELECTION');

    // Select city 11 -> enters UPGRADE_DECISION -> click BACK_TO_START_UPGRADE -> returns to START_UPGRADE_SELECTION!
    manager.handleClientMessage('c1', {
      type: 'GAME_ACTION',
      action: { kind: 'SELECT_START_UPGRADE_CITY', targetTile: 11 },
    });
    await flushMicrotasks(4);
    const inUpgModal = latestByClient.get('c1');
    if (inUpgModal?.type === 'ROOM_SNAPSHOT') {
      assert.equal(inUpgModal.snapshot.match?.turnPhase, 'UPGRADE_DECISION');
      assert.equal(inUpgModal.snapshot.match?.upgradeTargetTileIndex, 11);
    }

    manager.handleClientMessage('c1', {
      type: 'GAME_ACTION',
      action: { kind: 'BACK_TO_START_UPGRADE' },
    });
    await flushMicrotasks(4);
    const backToPicker = latestByClient.get('c1');
    assert.equal(backToPicker?.type, 'ROOM_SNAPSHOT');
    if (backToPicker?.type === 'ROOM_SNAPSHOT') {
      assert.equal(backToPicker.snapshot.match?.turnPhase, 'START_UPGRADE_SELECTION');
      assert.equal(backToPicker.snapshot.match?.upgradeTargetTileIndex, null);
    }

    // Trigger a Bot prime-land purchase to test BOT_QUIP fallback when generateBotQuip returns null:
    // Bot P2 is at tile 3 -> roll [6, 6] (+12 = 15 Nha Trang, buys, doubles!) -> [5, 5] (+10 = 25 Phú Quốc, buys, doubles!) -> [2, 4] (+6 = 31 TP.HCM 450K -> triggers BOT_QUIP!)
    seq.push([6, 6], [5, 5], [2, 4]);
    manager.handleClientMessage('c1', {
      type: 'GAME_ACTION',
      action: { kind: 'SKIP_START_UPGRADE' },
    });
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
