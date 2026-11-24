import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';
import { WebSocket } from 'ws';
import type { ServerToClientMessage } from '../game/onlineTypes';
import { attachMultiplayerWebSocketServer } from './wsServer';

async function startWsTestServer(options: {
  maxClients?: number;
  rateLimitMaxMessages?: number;
  rateLimitWindowMs?: number;
} = {}) {
  const server = http.createServer((_req, res) => {
    res.writeHead(200);
    res.end('ok');
  });
  const wsHandle = attachMultiplayerWebSocketServer(server, {
    timingScale: 0,
    ...options,
  });

  await new Promise<void>((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve());
  });
  const addr = server.address();
  assert.ok(addr && typeof addr === 'object');
  const wsUrl = `ws://127.0.0.1:${addr.port}/ws`;

  const connect = async () => {
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

  const closeAll = async () => {
    await wsHandle.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  };

  return { wsHandle, wsUrl, connect, closeAll };
}

async function waitFor<T>(
  predicate: () => T | undefined | false,
  timeoutMs = 3000
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const res = predicate();
    if (res) return res;
    await new Promise<void>((r) => setTimeout(r, 15));
  }
  throw new Error('Timed out waiting for condition');
}

test('BUG-21: Malformed JSON, non-object/array payloads, and wrong-typed message fields return ERROR without crashing WS server', async () => {
  const srv = await startWsTestServer();
  const client = await srv.connect();

  try {
    // 1. Invalid JSON
    client.ws.send('{not valid json');
    const badJson = await waitFor(() =>
      client.messages.find((m) => m.type === 'ERROR' && m.code === 'BAD_JSON')
    );
    assert.equal(badJson.type, 'ERROR');

    // 2. JSON array / primitive / null
    client.ws.send('null');
    client.ws.send('[1, 2, 3]');
    client.ws.send(JSON.stringify({ type: 123 }));
    await waitFor(
      () => client.messages.filter((m) => m.type === 'ERROR' && m.code === 'BAD_MESSAGE').length >= 3
    );

    // 3. Wrong-typed fields inside CREATE_ROOM, JOIN_ROOM, GAME_ACTION, SEND_EMOTE
    client.ws.send(JSON.stringify({ type: 'JOIN_ROOM', roomCode: 12345 }));
    client.ws.send(JSON.stringify({ type: 'RECONNECT_ROOM', roomCode: null, sessionToken: 99 }));
    client.ws.send(
      JSON.stringify({
        type: 'CREATE_ROOM',
        playerName: 99999,
        tokenType: 'car',
        maxPlayers: 2,
        startingCash: 2_000_000,
        fillBots: true,
      })
    );
    const joined = await waitFor(() => client.messages.find((m) => m.type === 'ROOM_JOINED'));
    assert.equal(joined.type, 'ROOM_JOINED');

    client.ws.send(JSON.stringify({ type: 'GAME_ACTION', action: null }));
    client.ws.send(JSON.stringify({ type: 'GAME_ACTION', action: { kind: 42 } }));
    client.ws.send(JSON.stringify({ type: 'SEND_EMOTE', emoteText: { bad: true } }));
    client.ws.send(JSON.stringify({ type: 'START_MATCH' }));
    await waitFor(() =>
      client.messages.find((m) => m.type === 'ROOM_SNAPSHOT' && m.snapshot.status === 'playing')
    );

    client.ws.send(
      JSON.stringify({
        type: 'GAME_ACTION',
        action: { kind: 'SELL_AND_PAY_DEBT', tileIndicesToSell: 'not-array' },
      })
    );
    client.ws.send(JSON.stringify({ type: 'PING' }));
    const pong = await waitFor(() => client.messages.find((m) => m.type === 'PONG'));
    assert.equal(pong.type, 'PONG');
  } finally {
    client.ws.close();
    await srv.closeAll();
  }
});

test('BUG-24: wsServer enforces 32 KiB maxPayload, connection cap (1013), and per-socket rate limit (RATE_LIMITED / 1008)', async () => {
  const srv = await startWsTestServer({
    maxClients: 2,
    rateLimitMaxMessages: 5,
    rateLimitWindowMs: 5000,
  });

  const c1 = await srv.connect();
  const c2 = await srv.connect();

  try {
    // Connection cap: 3rd client exceeds maxClients=2 -> closed with 1013
    const c3 = new WebSocket(srv.wsUrl);
    const c3Close = await new Promise<number>((resolve) => {
      c3.once('close', (code) => resolve(code));
    });
    assert.equal(c3Close, 1013);

    // Rate limit: send >5 messages rapidly on c1 -> RATE_LIMITED then close 1008 on abuse
    for (let i = 0; i < 12; i++) {
      if (c1.ws.readyState === WebSocket.OPEN) {
        c1.ws.send(JSON.stringify({ type: 'PING' }));
      }
    }
    const c1Closed = await new Promise<number>((resolve) => {
      if (c1.ws.readyState === WebSocket.CLOSED) {
        resolve(1008);
        return;
      }
      c1.ws.once('close', (code) => resolve(code));
    });
    assert.equal(c1Closed, 1008);
    assert.ok(
      c1.messages.some((m) => m.type === 'ERROR' && m.code === 'RATE_LIMITED'),
      'Expected RATE_LIMITED error before closing abusive socket'
    );

    // maxPayload > 32 KiB on c2 -> closes socket with 1009
    const oversized = JSON.stringify({
      type: 'CREATE_ROOM',
      playerName: 'A'.repeat(36 * 1024),
    });
    const c2ClosePromise = new Promise<number>((resolve) => {
      c2.ws.once('close', (code) => resolve(code));
      c2.ws.once('error', () => {
        // ws emits error + close 1009 on maxPayload exceeded
      });
    });
    c2.ws.send(oversized);
    const c2Code = await c2ClosePromise;
    assert.equal(c2Code, 1009);
  } finally {
    c1.ws.close();
    c2.ws.close();
    await srv.closeAll();
  }
});

test('Phase 1 Task 2: RTC_SIGNAL uses separate 120/5s rate-limit budget without starving gameplay and allows 20 KiB SDP payloads', async () => {
  const srv = await startWsTestServer({
    rateLimitMaxMessages: 5,
    rateLimitWindowMs: 5000,
  });

  const c1 = await srv.connect();
  const c2 = await srv.connect();

  try {
    c1.ws.send(
      JSON.stringify({
        type: 'CREATE_ROOM',
        playerName: 'Host',
        tokenType: 'car',
        maxPlayers: 2,
        startingCash: 2_000_000,
        fillBots: false,
      })
    );
    const joined1 = await waitFor(() => c1.messages.find((m) => m.type === 'ROOM_JOINED'));
    assert.equal(joined1.type, 'ROOM_JOINED');
    if (joined1.type !== 'ROOM_JOINED') return;

    c2.ws.send(
      JSON.stringify({
        type: 'JOIN_ROOM',
        roomCode: joined1.roomCode,
        playerName: 'Guest',
        tokenType: 'yacht',
      })
    );
    const joined2 = await waitFor(() => c2.messages.find((m) => m.type === 'ROOM_JOINED'));
    assert.equal(joined2.type, 'ROOM_JOINED');
    if (joined2.type !== 'ROOM_JOINED') return;

    // 1. 20 KiB RTC_SIGNAL payload passes under 32 KiB maxPayload
    c1.ws.send(
      JSON.stringify({
        type: 'RTC_SIGNAL',
        targetParticipantId: joined2.yourParticipantId,
        signal: { kind: 'offer', sdp: 'S'.repeat(20 * 1024) },
      })
    );
    const bigOffer = await waitFor(() => c2.messages.find((m) => m.type === 'RTC_SIGNAL'));
    assert.equal(bigOffer.type, 'RTC_SIGNAL');

    // 2. Burst 80 RTC_SIGNAL messages (>> gameplay cap of 5) -> no RATE_LIMITED and socket stays open
    for (let i = 0; i < 80; i++) {
      c1.ws.send(
        JSON.stringify({
          type: 'RTC_SIGNAL',
          targetParticipantId: joined2.yourParticipantId,
          signal: {
            kind: 'ice',
            candidate: { candidate: `candidate:${i}`, sdpMid: '0', sdpMLineIndex: 0 },
          },
        })
      );
    }

    await waitFor(
      () => c2.messages.filter((m) => m.type === 'RTC_SIGNAL').length >= 81
    );
    assert.equal(
      c1.messages.some((m) => m.type === 'ERROR' && m.code === 'RATE_LIMITED'),
      false
    );
    assert.equal(c1.ws.readyState, WebSocket.OPEN);

    // 3. Gameplay/control budget must still be intact after 81 RTC signals
    c1.ws.send(JSON.stringify({ type: 'PING' }));
    const pong = await waitFor(() => c1.messages.find((m) => m.type === 'PONG'));
    assert.equal(pong.type, 'PONG');

    // 4. Exceeding 120 RTC_SIGNAL messages in 5s triggers RATE_LIMITED and closes 1008
    for (let i = 0; i < 46; i++) {
      if (c1.ws.readyState === WebSocket.OPEN) {
        c1.ws.send(
          JSON.stringify({
            type: 'RTC_SIGNAL',
            targetParticipantId: joined2.yourParticipantId,
            signal: {
              kind: 'ice',
              candidate: { candidate: `candidate:extra-${i}`, sdpMid: '0', sdpMLineIndex: 0 },
            },
          })
        );
      }
    }
    const c1Closed = await new Promise<number>((resolve) => {
      if (c1.ws.readyState === WebSocket.CLOSED) {
        resolve(1008);
        return;
      }
      c1.ws.once('close', (code) => resolve(code));
    });
    assert.equal(c1Closed, 1008);
    assert.ok(
      c1.messages.some((m) => m.type === 'ERROR' && m.code === 'RATE_LIMITED'),
      'Exceeding 120 RTC_SIGNAL messages in 5s must emit RATE_LIMITED'
    );
  } finally {
    c1.ws.close();
    c2.ws.close();
    await srv.closeAll();
  }
});

test('BUG-30: Duplicate tab RECONNECT_ROOM over /ws delivers SESSION_REPLACED to previous socket', async () => {
  const srv = await startWsTestServer();
  const tab1 = await srv.connect();
  const tab2 = await srv.connect();

  try {
    tab1.ws.send(
      JSON.stringify({
        type: 'CREATE_ROOM',
        playerName: 'Player1',
        tokenType: 'car',
        maxPlayers: 2,
        startingCash: 2_000_000,
        fillBots: true,
      })
    );
    const joined1 = await waitFor(() =>
      tab1.messages.find((m) => m.type === 'ROOM_JOINED')
    );
    assert.equal(joined1.type, 'ROOM_JOINED');
    if (joined1.type !== 'ROOM_JOINED') return;

    tab2.ws.send(
      JSON.stringify({
        type: 'RECONNECT_ROOM',
        roomCode: joined1.roomCode,
        sessionToken: joined1.sessionToken,
      })
    );
    await waitFor(() => tab2.messages.find((m) => m.type === 'ROOM_JOINED'));
    const replaced = await waitFor(() =>
      tab1.messages.find((m) => m.type === 'ERROR' && m.code === 'SESSION_REPLACED')
    );
    assert.equal(replaced.type, 'ERROR');
  } finally {
    tab1.ws.close();
    tab2.ws.close();
    await srv.closeAll();
  }
});
