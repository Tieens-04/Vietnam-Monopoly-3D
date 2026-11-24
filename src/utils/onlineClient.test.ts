import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import type {
  OnlineRoomSnapshot,
  OnlineVisualEvent,
  RoomChatMessage,
  RtcSignalPayload,
  ServerToClientMessage,
} from '../game/onlineTypes';
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
    rerender: () => {
      render();
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

function makeChatMessage(overrides: Partial<RoomChatMessage> = {}): RoomChatMessage {
  return {
    id: 1,
    participantId: 'p_host0001',
    playerId: 0,
    senderName: 'Host',
    senderColor: '#F5B800',
    role: 'player',
    channel: 'ALL',
    text: 'Xin chào!',
    createdAt: 1_700_000_000_000,
    ...overrides,
  };
}

test('Phase 1 Task 5: ROOM_JOINED / ROOM_SNAPSHOT hydrate yourParticipantId & chatMessages, GAME_EVENT(CHAT_MESSAGE) deduplicates by id, and RTC_SIGNAL / onChatMessage update refs across rerenders', () => {
  const env = installBrowserShims({ initialUrl: 'http://localhost:3099/' });
  const visualEvents: OnlineVisualEvent[] = [];
  const receivedChat1: RoomChatMessage[] = [];
  const receivedChat2: RoomChatMessage[] = [];
  const receivedSignals1: Array<{ from: string; signal: RtcSignalPayload }> = [];
  const receivedSignals2: Array<{ from: string; signal: RtcSignalPayload }> = [];

  let activeOnChat = (msg: RoomChatMessage) => {
    receivedChat1.push(msg);
  };
  let activeOnRtc = (fromParticipantId: string, signal: RtcSignalPayload) => {
    receivedSignals1.push({ from: fromParticipantId, signal });
  };

  const hook = mountHook(() =>
    useOnlineMultiplayer(
      (event) => {
        visualEvents.push(event);
      },
      {
        onChatMessage: activeOnChat,
        onRtcSignal: activeOnRtc,
      }
    )
  );

  try {
    assert.equal(hook.current.yourParticipantId, null);
    assert.deepEqual(hook.current.chatMessages, []);

    hook.current.createRoom({
      playerName: 'Host',
      tokenType: 'car',
      maxPlayers: 2,
      startingCash: 2_000_000,
      fillBots: false,
    });
    const ws = MockWebSocket.instances[0];
    ws.simulateOpen();

    const msg1 = makeChatMessage({ id: 1, text: 'Tin lịch sử 1' });
    ws.simulateMessage({
      type: 'ROOM_JOINED',
      roomCode: 'AAAA',
      sessionToken: 'token-aaaa-999999',
      yourParticipantId: 'p_host0001',
      yourSeatIndex: 0,
      yourPlayerId: 0,
      snapshot: {
        ...makeRoomSnapshot('AAAA'),
        chatHistory: [msg1],
      },
    });

    assert.equal(hook.current.yourParticipantId, 'p_host0001');
    assert.deepEqual(hook.current.chatMessages, [msg1]);
    assert.deepEqual(receivedChat1, []);

    // Incoming GAME_EVENT(CHAT_MESSAGE) appends new message and triggers both onChatMessage and onVisualEvent
    const msg2 = makeChatMessage({ id: 2, participantId: 'p_guest002', playerId: 1, senderName: 'Guest', text: 'Chào Host!' });
    ws.simulateMessage({
      type: 'GAME_EVENT',
      event: {
        eventSeq: 1,
        kind: 'CHAT_MESSAGE',
        message: msg2,
      },
    });

    assert.deepEqual(hook.current.chatMessages, [msg1, msg2]);
    assert.deepEqual(receivedChat1, [msg2]);
    assert.equal(visualEvents.length, 1);
    assert.equal(visualEvents[0].kind, 'CHAT_MESSAGE');

    // Duplicate message id even with newer eventSeq must NOT duplicate chatMessages or re-fire onChatMessage
    ws.simulateMessage({
      type: 'GAME_EVENT',
      event: {
        eventSeq: 2,
        kind: 'CHAT_MESSAGE',
        message: msg2,
      },
    });
    // Stale eventSeq visual event must still be deduplicated by lastEventSeqRef
    ws.simulateMessage({
      type: 'GAME_EVENT',
      event: {
        eventSeq: 2,
        kind: 'SOUND',
        effect: 'cashGain',
      },
    });
    assert.deepEqual(hook.current.chatMessages, [msg1, msg2]);
    assert.deepEqual(receivedChat1, [msg2]);
    assert.equal(visualEvents.length, 2);

    // Next visual event with higher eventSeq still works
    ws.simulateMessage({
      type: 'GAME_EVENT',
      event: {
        eventSeq: 3,
        kind: 'SOUND',
        effect: 'cashGain',
      },
    });
    assert.equal(visualEvents.length, 3);
    assert.equal(visualEvents[2].kind, 'SOUND');

    // ROOM_SNAPSHOT hydrates yourParticipantId and chatMessages
    const msg3 = makeChatMessage({ id: 3, channel: 'TEAM', teamId: 0, text: 'Tin đội mới' });
    ws.simulateMessage({
      type: 'ROOM_SNAPSHOT',
      yourParticipantId: 'p_host_updated',
      yourSeatIndex: 0,
      yourPlayerId: 0,
      snapshot: {
        ...makeRoomSnapshot('AAAA'),
        chatHistory: [msg1, msg2, msg3],
      },
    });
    assert.equal(hook.current.yourParticipantId, 'p_host_updated');
    assert.deepEqual(hook.current.chatMessages, [msg1, msg2, msg3]);

    // Incoming RTC_SIGNAL forwards to onRtcSignal
    const offerSignal: RtcSignalPayload = { kind: 'offer', sdp: 'v=0\r\no=- 1 2 IN IP4 127.0.0.1' };
    ws.simulateMessage({
      type: 'RTC_SIGNAL',
      fromParticipantId: 'p_guest002',
      signal: offerSignal,
    });
    assert.deepEqual(receivedSignals1, [{ from: 'p_guest002', signal: offerSignal }]);

    // Update callback handlers on rerender -> socket listener must invoke the latest refs without stale closures
    activeOnChat = (msg: RoomChatMessage) => {
      receivedChat2.push(msg);
    };
    activeOnRtc = (fromParticipantId: string, signal: RtcSignalPayload) => {
      receivedSignals2.push({ from: fromParticipantId, signal });
    };
    hook.rerender();

    const msg4 = makeChatMessage({ id: 4, text: 'Tin sau rerender' });
    ws.simulateMessage({
      type: 'GAME_EVENT',
      event: {
        eventSeq: 4,
        kind: 'CHAT_MESSAGE',
        message: msg4,
      },
    });
    const iceSignal: RtcSignalPayload = {
      kind: 'ice',
      candidate: { candidate: 'candidate:1 1 UDP 1234 127.0.0.1 9999 typ host', sdpMid: '0', sdpMLineIndex: 0 },
    };
    ws.simulateMessage({
      type: 'RTC_SIGNAL',
      fromParticipantId: 'p_guest002',
      signal: iceSignal,
    });

    assert.equal(receivedChat1.length, 1);
    assert.deepEqual(receivedChat2, [msg4]);
    assert.equal(receivedSignals1.length, 1);
    assert.deepEqual(receivedSignals2, [{ from: 'p_guest002', signal: iceSignal }]);
  } finally {
    hook.unmount();
    env.restore();
  }
});

test('Phase 1 Task 5: sendChatMessage, sendRtcSignal, and updateVoiceState payloads and offline toast suppression', () => {
  const env = installBrowserShims({ initialUrl: 'http://localhost:3099/' });
  const hook = mountHook(() => useOnlineMultiplayer());

  try {
    // When socket is not open/synced:
    // - sendRtcSignal & updateVoiceState return false and must NOT set errorMessage or increment errorSeq
    const iceSignal: RtcSignalPayload = {
      kind: 'ice',
      candidate: { candidate: 'candidate:0 1 UDP 1 127.0.0.1 5000 typ host', sdpMid: '0', sdpMLineIndex: 0 },
    };
    assert.equal(hook.current.sendRtcSignal('p_guest002', iceSignal), false);
    assert.equal(hook.current.updateVoiceState(true), false);
    assert.equal(hook.current.errorMessage, null);
    assert.equal(hook.current.errorSeq, 0);
    assert.equal(MockWebSocket.instances.length, 0);

    // - sendChatMessage while offline/unsynced returns false and DOES surface sync error toast
    assert.equal(hook.current.sendChatMessage('ALL', 'Xin chào'), false);
    assert.equal(hook.current.errorSeq, 1);
    assert.ok(hook.current.errorMessage);
    assert.equal(MockWebSocket.instances.length, 1);

    // Join and sync room
    hook.current.createRoom({
      playerName: 'Host',
      tokenType: 'car',
      maxPlayers: 2,
      startingCash: 2_000_000,
      fillBots: false,
    });
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
    assert.equal(hook.current.errorMessage, null);
    ws.sent.length = 0;

    // While synced, all three methods return true and emit exact JSON payloads
    assert.equal(hook.current.sendChatMessage('TEAM', 'Đội mình cố lên!'), true);
    assert.equal(hook.current.sendRtcSignal('p_guest002', { kind: 'answer', sdp: 'v=0-answer' }), true);
    assert.equal(hook.current.updateVoiceState(true), true);

    assert.equal(ws.sent.length, 3);
    assert.deepEqual(JSON.parse(ws.sent[0]), {
      type: 'SEND_CHAT_MESSAGE',
      channel: 'TEAM',
      text: 'Đội mình cố lên!',
    });
    assert.deepEqual(JSON.parse(ws.sent[1]), {
      type: 'RTC_SIGNAL',
      targetParticipantId: 'p_guest002',
      signal: { kind: 'answer', sdp: 'v=0-answer' },
    });
    assert.deepEqual(JSON.parse(ws.sent[2]), {
      type: 'UPDATE_VOICE_STATE',
      micEnabled: true,
    });

    // After socket drops (unsynced / reconnecting), sendRtcSignal & updateVoiceState suppress error toast
    ws.simulateClose();
    const errorSeqBeforeDrop = hook.current.errorSeq;
    assert.equal(hook.current.sendRtcSignal('p_guest002', iceSignal), false);
    assert.equal(hook.current.updateVoiceState(false), false);
    assert.equal(hook.current.errorMessage, null);
    assert.equal(hook.current.errorSeq, errorSeqBeforeDrop);
  } finally {
    hook.unmount();
    env.restore();
  }
});

test('Phase 1 Task 5: LEFT_ROOM, leaveRoom(), and terminal room errors reset yourParticipantId and chatMessages (and clear chat dedup across rooms)', () => {
  const env = installBrowserShims({ initialUrl: 'http://localhost:3099/' });
  const receivedChats: RoomChatMessage[] = [];
  const hook = mountHook(() =>
    useOnlineMultiplayer(undefined, {
      onChatMessage: (m) => receivedChats.push(m),
    })
  );

  try {
    const joinAndPopulate = (roomCode: string, participantId: string) => {
      hook.current.createRoom({
        playerName: 'Host',
        tokenType: 'car',
        maxPlayers: 2,
        startingCash: 2_000_000,
        fillBots: false,
      });
      const ws = MockWebSocket.instances.at(-1)!;
      if (ws.readyState !== MockWebSocket.OPEN) {
        ws.simulateOpen();
      }
      ws.simulateMessage({
        type: 'ROOM_JOINED',
        roomCode,
        sessionToken: `token-${roomCode}-123456`,
        yourParticipantId: participantId,
        yourSeatIndex: 0,
        yourPlayerId: 0,
        snapshot: {
          ...makeRoomSnapshot(roomCode),
          chatHistory: [makeChatMessage({ id: 1, text: `Welcome ${roomCode}` })],
        },
      });
      assert.equal(hook.current.yourParticipantId, participantId);
      assert.equal(hook.current.chatMessages.length, 1);
      return ws;
    };

    // 1. LEFT_ROOM resets state (also emit chat id=2 first so step 4 proves dedup state resets across rooms)
    const ws1 = joinAndPopulate('AAAA', 'p_host_a');
    ws1.simulateMessage({
      type: 'GAME_EVENT',
      event: {
        eventSeq: 1,
        kind: 'CHAT_MESSAGE',
        message: makeChatMessage({ id: 2, text: 'Room A message 2' }),
      },
    });
    assert.equal(hook.current.chatMessages.length, 2);
    ws1.simulateMessage({ type: 'LEFT_ROOM' });
    assert.equal(hook.current.yourParticipantId, null);
    assert.deepEqual(hook.current.chatMessages, [] as RoomChatMessage[]);

    // 2. leaveRoom() resets state
    joinAndPopulate('BBBB', 'p_host_b');
    hook.current.leaveRoom();
    assert.equal(hook.current.yourParticipantId, null);
    assert.deepEqual(hook.current.chatMessages, [] as RoomChatMessage[]);

    // 3. Terminal errors reset state
    const terminalCodes = [
      'ROOM_NOT_FOUND',
      'SESSION_EXPIRED',
      'NOT_IN_ROOM',
      'SESSION_REPLACED',
    ] as const;

    for (const code of terminalCodes) {
      const ws = joinAndPopulate('CCCC', `p_${code}`);
      ws.simulateMessage({
        type: 'ERROR',
        code,
        message: `Error ${code}`,
      });
      assert.equal(hook.current.yourParticipantId, null, `${code} must reset yourParticipantId`);
      assert.deepEqual(
        hook.current.chatMessages,
        [] as RoomChatMessage[],
        `${code} must reset chatMessages`
      );
    }

    // 4. Rejoining a new room accepts chat id=2 after previous room AAAA had chat id=2
    const wsNew = joinAndPopulate('DDDD', 'p_host_d');
    const newMsg = makeChatMessage({ id: 2, text: 'Fresh room message 2' });
    wsNew.simulateMessage({
      type: 'GAME_EVENT',
      event: {
        eventSeq: 1,
        kind: 'CHAT_MESSAGE',
        message: newMsg,
      },
    });
    assert.equal(hook.current.chatMessages.length, 2);
    assert.equal(hook.current.chatMessages[1].text, 'Fresh room message 2');
    assert.equal(receivedChats.length, 2);
  } finally {
    hook.unmount();
    env.restore();
  }
});
