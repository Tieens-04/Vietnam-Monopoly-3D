import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import type { OnlineRoomSnapshot, ServerToClientMessage } from '../game/onlineTypes';
import { useOnlineMultiplayer } from './onlineClient';

const SESSION_STORAGE_KEY = 'bt_online_session_v1';

class MockWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;
  static instances: MockWebSocket[] = [];

  url: string;
  readyState: number = MockWebSocket.CONNECTING;
  sent: string[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((evt: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;

  constructor(url: string) {
    this.url = url;
    MockWebSocket.instances.push(this);
  }

  send(data: string): void {
    this.sent.push(data);
  }

  close(): void {
    this.readyState = MockWebSocket.CLOSED;
  }

  simulateOpen(): void {
    this.readyState = MockWebSocket.OPEN;
    this.onopen?.();
  }

  simulateMessage(msg: ServerToClientMessage): void {
    this.onmessage?.({ data: JSON.stringify(msg) });
  }

  simulateClose(): void {
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.();
  }
}

interface TestEnvOptions {
  initialUrl?: string;
  initialStorage?: Record<string, string>;
}

function installBrowserShims(opts: TestEnvOptions = {}) {
  const storage = new Map<string, string>(Object.entries(opts.initialStorage ?? {}));
  let currentUrl = new URL(opts.initialUrl ?? 'http://localhost:3099/');

  const prevWindow = (globalThis as Record<string, unknown>).window;
  const prevWebSocket = (globalThis as Record<string, unknown>).WebSocket;
  MockWebSocket.instances = [];

  const localStorageShim = {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => {
      storage.set(key, String(value));
    },
    removeItem: (key: string) => {
      storage.delete(key);
    },
    clear: () => {
      storage.clear();
    },
  };

  const windowShim = {
    location: {
      get href() {
        return currentUrl.toString();
      },
      get search() {
        return currentUrl.search;
      },
      get protocol() {
        return currentUrl.protocol;
      },
      get host() {
        return currentUrl.host;
      },
      get origin() {
        return currentUrl.origin;
      },
    },
    history: {
      replaceState: (_data: unknown, _unused: string, nextUrl: string) => {
        currentUrl = new URL(nextUrl, currentUrl.origin);
      },
    },
    localStorage: localStorageShim,
    setInterval: globalThis.setInterval.bind(globalThis),
    clearInterval: globalThis.clearInterval.bind(globalThis),
    setTimeout: globalThis.setTimeout.bind(globalThis),
    clearTimeout: globalThis.clearTimeout.bind(globalThis),
  };

  (globalThis as Record<string, unknown>).window = windowShim;
  (globalThis as Record<string, unknown>).WebSocket = MockWebSocket;

  return {
    storage,
    getHref: () => currentUrl.toString(),
    restore: () => {
      if (prevWindow === undefined) {
        delete (globalThis as Record<string, unknown>).window;
      } else {
        (globalThis as Record<string, unknown>).window = prevWindow;
      }
      if (prevWebSocket === undefined) {
        delete (globalThis as Record<string, unknown>).WebSocket;
      } else {
        (globalThis as Record<string, unknown>).WebSocket = prevWebSocket;
      }
    },
  };
}

function depsChanged(prev: unknown[] | undefined, next: unknown[] | undefined): boolean {
  if (!prev || !next) return true;
  if (prev.length !== next.length) return true;
  for (let i = 0; i < prev.length; i++) {
    if (!Object.is(prev[i], next[i])) return true;
  }
  return false;
}

function mountHook<T>(useHookFn: () => T) {
  const internals = (
    React as unknown as {
      __CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE: { H: unknown };
    }
  ).__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;

  const states: unknown[] = [];
  const refs: Array<{ current: unknown }> = [];
  const callbacks: Array<{ fn: unknown; deps: unknown[] | undefined }> = [];
  const effects: Array<{
    effect: () => void | (() => void);
    deps: unknown[] | undefined;
    cleanup?: () => void;
    dirty: boolean;
  }> = [];

  let mounted = true;
  let rendering = false;
  let rerenderPending = false;
  let latest!: T;

  const render = () => {
    if (!mounted) return;
    if (rendering) {
      rerenderPending = true;
      return;
    }

    let stateIdx = 0;
    let refIdx = 0;
    let cbIdx = 0;
    let effIdx = 0;

    const prevDispatcher = internals.H;
    rendering = true;
    internals.H = {
      useState: (initial: unknown) => {
        const idx = stateIdx++;
        if (idx >= states.length) {
          states[idx] = typeof initial === 'function' ? (initial as () => unknown)() : initial;
        }
        const setState = (action: unknown) => {
          if (!mounted) return;
          const next =
            typeof action === 'function'
              ? (action as (prev: unknown) => unknown)(states[idx])
              : action;
          if (!Object.is(states[idx], next)) {
            states[idx] = next;
            render();
          }
        };
        return [states[idx], setState];
      },
      useRef: (initial: unknown) => {
        const idx = refIdx++;
        if (idx >= refs.length) {
          refs[idx] = { current: initial };
        }
        return refs[idx];
      },
      useCallback: (fn: unknown, deps: unknown[] | undefined) => {
        const idx = cbIdx++;
        if (idx >= callbacks.length || depsChanged(callbacks[idx].deps, deps)) {
          callbacks[idx] = { fn, deps };
        }
        return callbacks[idx].fn;
      },
      useEffect: (effect: () => void | (() => void), deps: unknown[] | undefined) => {
        const idx = effIdx++;
        if (idx >= effects.length) {
          effects[idx] = { effect, deps, dirty: true };
        } else if (depsChanged(effects[idx].deps, deps)) {
          effects[idx].effect = effect;
          effects[idx].deps = deps;
          effects[idx].dirty = true;
        }
      },
    };

    try {
      latest = useHookFn();
    } finally {
      internals.H = prevDispatcher;
      rendering = false;
    }

    for (const slot of effects) {
      if (slot.dirty) {
        slot.dirty = false;
        slot.cleanup?.();
        const cleanup = slot.effect();
        slot.cleanup = typeof cleanup === 'function' ? cleanup : undefined;
      }
    }

    if (rerenderPending) {
      rerenderPending = false;
      render();
    }
  };

  render();

  return {
    get current() {
      return latest;
    },
    unmount: () => {
      mounted = false;
      for (const slot of effects) {
        slot.cleanup?.();
        slot.cleanup = undefined;
      }
    },
  };
}

function makeRoomSnapshot(roomCode: string): OnlineRoomSnapshot {
  return {
    roomCode,
    status: 'lobby',
    maxPlayers: 2,
    startingCash: 2_000_000,
    fillBots: false,
    matchMode: 'FFA',
    tacticalDiceEnabled: false,
    hostSeatIndex: 0,
    seats: [
      {
        seatIndex: 0,
        playerName: 'Host',
        tokenType: 'car',
        color: '#F5B800',
        colorName: 'Vàng kim',
        occupiedByHuman: true,
        connected: true,
        isHost: true,
        teamId: 0,
      },
      {
        seatIndex: 1,
        playerName: 'Bot',
        tokenType: 'yacht',
        color: '#66C61C',
        colorName: 'Xanh cốm',
        occupiedByHuman: false,
        connected: false,
        isHost: false,
        teamId: 1,
      },
    ],
    participants: [
      {
        participantId: 'p_host0001',
        playerName: 'Host',
        role: 'player',
        seatIndex: 0,
        playerId: 0,
        tokenType: 'car',
        connected: true,
        isHost: true,
        ready: true,
        micEnabled: false,
      },
    ],
    chatHistory: [],
    match: null,
  };
}

test('BUG-30a: SESSION_REPLACED preserves localStorage session while clearing active room state and setting error', () => {
  const env = installBrowserShims({ initialUrl: 'http://localhost:3099/' });
  const hook = mountHook(() => useOnlineMultiplayer());

  try {
    hook.current.createRoom({
      playerName: 'Host',
      tokenType: 'car',
      maxPlayers: 2,
      startingCash: 2_000_000,
      fillBots: false,
    });
    assert.equal(MockWebSocket.instances.length, 1);
    const ws = MockWebSocket.instances[0];
    ws.simulateOpen();

    ws.simulateMessage({
      type: 'ROOM_JOINED',
      roomCode: 'AAAA',
      sessionToken: 'token-aaaa-999999',
      yourParticipantId: 'p_host0001',
      yourSeatIndex: 0,
      yourPlayerId: 0,
      snapshot: makeRoomSnapshot('AAAA'),
    });

    assert.equal(hook.current.roomSnapshot?.roomCode, 'AAAA');
    assert.equal(hook.current.yourSeatIndex, 0);
    assert.equal(hook.current.yourPlayerId, 0);
    assert.equal(
      env.storage.get(SESSION_STORAGE_KEY),
      JSON.stringify({ roomCode: 'AAAA', sessionToken: 'token-aaaa-999999' })
    );

    // Server notifies that another tab replaced the session
    ws.simulateMessage({
      type: 'ERROR',
      code: 'SESSION_REPLACED',
      message: 'Phiên đăng nhập đã được chuyển sang tab khác.',
    });

    // Active room state is cleared + error shown, while localStorage token stays intact for the new tab!
    assert.equal(hook.current.roomSnapshot, null);
    assert.equal(hook.current.yourSeatIndex, null);
    assert.equal(hook.current.yourPlayerId, null);
    assert.equal(hook.current.errorMessage, 'Phiên đăng nhập đã được chuyển sang tab khác.');
    assert.equal(env.getHref(), 'http://localhost:3099/');
    assert.equal(
      env.storage.get(SESSION_STORAGE_KEY),
      JSON.stringify({ roomCode: 'AAAA', sessionToken: 'token-aaaa-999999' })
    );

    // Closing old socket must NOT enter reconnecting state because sessionRef was cleared
    ws.simulateClose();
    assert.equal(hook.current.connectionStatus, 'idle');
  } finally {
    hook.unmount();
    env.restore();
  }
});

test('BUG-30b: Opening ?room=BBBB with mismatched stored session for AAAA skips auto-reconnect to AAAA and updates session on BBBB join', () => {
  const env = installBrowserShims({
    initialUrl: 'http://localhost:3099/?room=BBBB',
    initialStorage: {
      [SESSION_STORAGE_KEY]: JSON.stringify({
        roomCode: 'AAAA',
        sessionToken: 'token-aaaa-999999',
      }),
    },
  });
  const hook = mountHook(() => useOnlineMultiplayer());

  try {
    assert.equal(hook.current.initialInviteCode, 'BBBB');
    // Must NOT open a WebSocket on mount to auto-reconnect into mismatched room AAAA
    assert.equal(MockWebSocket.instances.length, 0);
    assert.equal(hook.current.connectionStatus, 'idle');

    // Connecting explicitly later must NOT emit RECONNECT_ROOM for AAAA
    hook.current.ensureConnected();
    assert.equal(MockWebSocket.instances.length, 1);
    const ws = MockWebSocket.instances[0];
    ws.simulateOpen();
    assert.deepEqual(ws.sent, []);

    // Even if socket closes before joining BBBB, it must NOT transition into reconnecting to AAAA
    ws.simulateClose();
    assert.equal(hook.current.connectionStatus, 'idle');

    // Joining BBBB opens a new socket, sends JOIN_ROOM for BBBB, and replaces stored session with BBBB
    hook.current.joinRoom({ roomCode: 'BBBB', playerName: 'Guest' });
    assert.equal(MockWebSocket.instances.length, 2);
    const ws2 = MockWebSocket.instances[1];
    ws2.simulateOpen();
    assert.equal(ws2.sent.length, 1);
    assert.deepEqual(JSON.parse(ws2.sent[0]), {
      type: 'JOIN_ROOM',
      roomCode: 'BBBB',
      playerName: 'Guest',
    });

    ws2.simulateMessage({
      type: 'ROOM_JOINED',
      roomCode: 'BBBB',
      sessionToken: 'token-bbbb-111111',
      yourParticipantId: 'p_guest002',
      yourSeatIndex: 1,
      yourPlayerId: 1,
      snapshot: makeRoomSnapshot('BBBB'),
    });
    assert.equal(
      env.storage.get(SESSION_STORAGE_KEY),
      JSON.stringify({ roomCode: 'BBBB', sessionToken: 'token-bbbb-111111' })
    );
  } finally {
    hook.unmount();
    env.restore();
  }
});

test('BUG-30c & BUG-04: pendingQueueRef queues only room bootstrap messages; GAME_ACTION & SEND_EMOTE are never queued offline or before reconnect snapshot sync', () => {
  const env = installBrowserShims({ initialUrl: 'http://localhost:3099/' });
  const hook = mountHook(() => useOnlineMultiplayer());

  try {
    // 1. Room bootstrap message (CREATE_ROOM) before onopen -> queued and flushed on open; leaveRoom clears it
    hook.current.createRoom({
      playerName: 'Host',
      tokenType: 'car',
      maxPlayers: 2,
      startingCash: 2_000_000,
      fillBots: false,
    });
    assert.equal(MockWebSocket.instances.length, 1);
    const ws1 = MockWebSocket.instances[0];
    assert.equal(ws1.readyState, MockWebSocket.CONNECTING);
    assert.deepEqual(ws1.sent, []);

    ws1.simulateOpen();
    assert.equal(ws1.sent.length, 1);
    assert.equal(JSON.parse(ws1.sent[0]).type, 'CREATE_ROOM');

    const playingSnap: OnlineRoomSnapshot = {
      ...makeRoomSnapshot('AAAA'),
      status: 'playing',
      match: {
        players: [],
        properties: {},
        activePlayerIndex: 0,
        turnPhase: 'AWAIT_ROLL',
        turnCount: 1,
        decisionRevision: 1,
        lastDice: null,
        lastDiceSum: 0,
        lastRentPaid: 0,
        boardModifiers: {
          festivalTileIndices: [],
          championshipTileIndex: null,
          championshipMultiplier: 1,
        },
        isFreeChampionship: false,
        turnTimeLeft: 45,
        matchTimeLeft: 1200,
        drawnCard: null,
        pendingDebt: null,
        matchWinnerResult: null,
        logs: [],
        landingCueText: null,
      },
    };
    ws1.simulateMessage({
      type: 'ROOM_JOINED',
      roomCode: 'AAAA',
      sessionToken: 'token-aaaa-999999',
      yourParticipantId: 'p_host0001',
      yourSeatIndex: 0,
      yourPlayerId: 0,
      snapshot: playingSnap,
    });
    assert.equal(hook.current.connectionStatus, 'connected');
    assert.equal((hook.current as { isSynced?: boolean }).isSynced, true);

    // 2. While connected & synced, sendGameAction sends immediately with server expectations + unique actionId
    hook.current.sendGameAction({ kind: 'ROLL_DICE', diceChoice: 'NORMAL' });
    assert.equal(ws1.sent.length, 2);
    const sentAction = JSON.parse(ws1.sent[1]);
    assert.equal(sentAction.type, 'GAME_ACTION');
    assert.deepEqual(sentAction.action, { kind: 'ROLL_DICE', diceChoice: 'NORMAL' });
    assert.equal(sentAction.expectedTurnCount, 1);
    assert.equal(sentAction.expectedPhase, 'AWAIT_ROLL');
    assert.equal(sentAction.expectedDecisionRevision, 1);
    assert.equal(typeof sentAction.actionId, 'string');
    assert.ok(sentAction.actionId.length > 0);

    // 3. Simulate network drop while in match -> attempting GAME_ACTION / SEND_EMOTE while disconnected MUST NOT queue or replay!
    ws1.simulateClose();
    assert.equal(hook.current.connectionStatus, 'reconnecting');
    assert.equal((hook.current as { isSynced?: boolean }).isSynced, false);

    hook.current.sendGameAction({ kind: 'ROLL_DICE' });
    hook.current.sendEmote('👍 Tuyệt vời!');

    assert.equal(MockWebSocket.instances.length, 2);
    const ws2 = MockWebSocket.instances[1];
    ws2.simulateOpen();

    // Only RECONNECT_ROOM may be sent on reconnect — NEVER the stale GAME_ACTION or SEND_EMOTE!
    assert.equal(ws2.sent.length, 1, `Expected only RECONNECT_ROOM on reconnect, got ${JSON.stringify(ws2.sent)}`);
    assert.equal(JSON.parse(ws2.sent[0]).type, 'RECONNECT_ROOM');

    // 4. Before ROOM_JOINED/ROOM_SNAPSHOT arrives after reconnect, client is STILL NOT synced; GAME_ACTION must stay blocked!
    assert.equal((hook.current as { isSynced?: boolean }).isSynced, false);
    assert.equal(hook.current.connectionStatus, 'reconnecting');
    hook.current.sendGameAction({ kind: 'ROLL_DICE' });
    assert.equal(ws2.sent.length, 1, 'Must NOT send GAME_ACTION before fresh reconnect snapshot arrives');

    // 5. Fresh ROOM_JOINED arrives (now Turn 3, revision 7) -> unlocks actions with updated expectations!
    ws2.simulateMessage({
      type: 'ROOM_JOINED',
      roomCode: 'AAAA',
      sessionToken: 'token-aaaa-999999',
      yourParticipantId: 'p_host0001',
      yourSeatIndex: 0,
      yourPlayerId: 0,
      snapshot: {
        ...playingSnap,
        match: {
          ...playingSnap.match!,
          turnCount: 3,
          decisionRevision: 7,
          turnPhase: 'AWAIT_ROLL',
        },
      },
    });
    assert.equal((hook.current as { isSynced?: boolean }).isSynced, true);
    assert.equal(hook.current.connectionStatus, 'connected');
    hook.current.sendGameAction({ kind: 'PAY_JAIL_FINE' });
    assert.equal(ws2.sent.length, 2);
    const postSyncAction = JSON.parse(ws2.sent[1]);
    assert.equal(postSyncAction.expectedTurnCount, 3);
    assert.equal(postSyncAction.expectedDecisionRevision, 7);
    assert.notEqual(postSyncAction.actionId, sentAction.actionId);

    // 6. leaveRoom() still purges queued JOIN_ROOM bootstrap messages before onopen
    ws2.simulateClose();
    hook.current.leaveRoom();
    hook.current.joinRoom({ roomCode: 'BBBB', playerName: 'Guest' });
    const ws3 = MockWebSocket.instances.at(-1)!;
    hook.current.leaveRoom();
    ws3.simulateOpen();
    assert.deepEqual(ws3.sent, []);
  } finally {
    hook.unmount();
    env.restore();
  }
});

test('skipInitialAutoReconnect skips stored session hijack on offline autostart/demo URLs, errorSeq increments on identical errors, and leaveRoom without session avoids NOT_IN_ROOM', () => {
  const env = installBrowserShims({
    initialUrl: 'http://localhost:3099/?autostart=1',
    initialStorage: {
      [SESSION_STORAGE_KEY]: JSON.stringify({
        roomCode: 'AAAA',
        sessionToken: 'token-aaaa-999999',
      }),
    },
  });
  const hook = mountHook(() =>
    useOnlineMultiplayer(undefined, { skipInitialAutoReconnect: true })
  );

  try {
    assert.equal(MockWebSocket.instances.length, 0);
    assert.equal(hook.current.connectionStatus, 'idle');
    assert.equal(hook.current.roomSnapshot, null);

    // Opening an idle socket (e.g. clicking Online tab) and calling leaveRoom() before joining must NOT send LEAVE_ROOM
    hook.current.ensureConnected();
    assert.equal(MockWebSocket.instances.length, 1);
    const ws = MockWebSocket.instances[0];
    ws.simulateOpen();
    assert.deepEqual(ws.sent, []);

    hook.current.leaveRoom();
    assert.deepEqual(
      ws.sent,
      [],
      'leaveRoom() without an active room session must not emit LEAVE_ROOM'
    );

    // Repeated identical ERROR messages still increment errorSeq every time
    assert.equal(hook.current.errorSeq, 0);
    ws.simulateMessage({
      type: 'ERROR',
      code: 'INVALID_ACTION',
      message: 'Hành động không hợp lệ.',
    });
    assert.equal(hook.current.errorSeq, 1);
    assert.equal(hook.current.errorMessage, 'Hành động không hợp lệ.');

    ws.simulateMessage({
      type: 'ERROR',
      code: 'INVALID_ACTION',
      message: 'Hành động không hợp lệ.',
    });
    assert.equal(hook.current.errorSeq, 2);
  } finally {
    hook.unmount();
    env.restore();
  }
});

test('BUG-04 (Review Round 2): delayed onclose from a superseded WebSocket must not desync or disconnect a newer active socket', () => {
  const env = installBrowserShims({ initialUrl: 'http://localhost:3099/' });
  const hook = mountHook(() => useOnlineMultiplayer());

  try {
    hook.current.createRoom({
      playerName: 'Host',
      tokenType: 'car',
      maxPlayers: 2,
      startingCash: 2_000_000,
      fillBots: false,
    });
    const ws1 = MockWebSocket.instances[0];
    ws1.simulateOpen();
    ws1.simulateMessage({
      type: 'ROOM_JOINED',
      roomCode: 'AAAA',
      sessionToken: 'tok-aaaa-111111',
      yourParticipantId: 'p_host0001',
      yourSeatIndex: 0,
      yourPlayerId: 0,
      snapshot: makeRoomSnapshot('AAAA'),
    });
    assert.equal(hook.current.isSynced, true);

    // Simulate ws1 closing normally and ws2 opening & syncing
    ws1.simulateClose();
    assert.equal(hook.current.isSynced, false);
    // Re-open by sending a new createRoom (simulates rapid reconnect / room switch creating ws2)
    hook.current.leaveRoom();
    hook.current.createRoom({
      playerName: 'Host2',
      tokenType: 'car',
      maxPlayers: 2,
      startingCash: 2_000_000,
      fillBots: false,
    });
    const ws2 = MockWebSocket.instances.at(-1)!;
    assert.notEqual(ws2, ws1);
    ws2.simulateOpen();
    ws2.simulateMessage({
      type: 'ROOM_JOINED',
      roomCode: 'BBBB',
      sessionToken: 'tok-bbbb-222222',
      yourParticipantId: 'p_host0001',
      yourSeatIndex: 0,
      yourPlayerId: 0,
      snapshot: makeRoomSnapshot('BBBB'),
    });
    assert.equal(hook.current.connectionStatus, 'connected');
    assert.equal(hook.current.isSynced, true);

    // Now a delayed/stale onclose fires on the old ws1 -> MUST NOT touch ws2's synced connected state!
    ws1.simulateClose();
    assert.equal(hook.current.connectionStatus, 'connected');
    assert.equal(hook.current.isSynced, true);
    assert.equal(hook.current.roomSnapshot?.roomCode, 'BBBB');
  } finally {
    hook.unmount();
    env.restore();
  }
});
