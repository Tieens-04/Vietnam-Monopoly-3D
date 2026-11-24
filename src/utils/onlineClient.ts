import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ClientToServerMessage,
  OnlineGameAction,
  OnlineRoomSnapshot,
  OnlineVisualEvent,
  ServerToClientMessage,
  TokenArchetype,
} from '../game/onlineTypes';
import type { MatchMode } from '../game/types';

const SESSION_STORAGE_KEY = 'bt_online_session_v1';
const PLAYER_NAME_STORAGE_KEY = 'bt_player_name_v1';

export type OnlineConnectionStatus = 'idle' | 'connecting' | 'connected' | 'reconnecting';

interface StoredSession {
  roomCode: string;
  sessionToken: string;
}

function readStoredSession(): StoredSession | null {
  try {
    const raw = window.localStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredSession>;
    if (
      typeof parsed.roomCode === 'string' &&
      parsed.roomCode.length >= 4 &&
      typeof parsed.sessionToken === 'string' &&
      parsed.sessionToken.length >= 8
    ) {
      return { roomCode: parsed.roomCode.toUpperCase(), sessionToken: parsed.sessionToken };
    }
  } catch {
    // ignore storage errors
  }
  return null;
}

function writeStoredSession(session: StoredSession | null): void {
  try {
    if (session) {
      window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
    } else {
      window.localStorage.removeItem(SESSION_STORAGE_KEY);
    }
  } catch {
    // ignore storage errors
  }
}

function readInitialInviteCode(): string | null {
  if (typeof window === 'undefined') return null;
  const code = new URLSearchParams(window.location.search).get('room');
  if (!code) return null;
  const clean = code.trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
  return clean.length >= 4 ? clean : null;
}

function syncRoomQueryParam(roomCode: string | null): void {
  if (typeof window === 'undefined') return;
  try {
    const url = new URL(window.location.href);
    if (roomCode) {
      url.searchParams.set('room', roomCode);
    } else {
      url.searchParams.delete('room');
    }
    window.history.replaceState({}, '', url.toString());
  } catch {
    // ignore history errors
  }
}

export interface UseOnlineMultiplayerOptions {
  skipInitialAutoReconnect?: boolean;
}

export function useOnlineMultiplayer(
  onVisualEvent?: (event: OnlineVisualEvent) => void,
  options?: UseOnlineMultiplayerOptions
) {
  const skipInitialAutoReconnect = Boolean(options?.skipInitialAutoReconnect);
  const [initialInviteCode] = useState<string | null>(() => readInitialInviteCode());
  const [savedPlayerName, setSavedPlayerName] = useState<string>(() => {
    try {
      return window.localStorage.getItem(PLAYER_NAME_STORAGE_KEY) || '';
    } catch {
      return '';
    }
  });

  const [connectionStatus, setConnectionStatus] = useState<OnlineConnectionStatus>('idle');
  const [isSynced, setIsSynced] = useState<boolean>(false);
  const [roomSnapshot, setRoomSnapshot] = useState<OnlineRoomSnapshot | null>(null);
  const [yourSeatIndex, setYourSeatIndex] = useState<number | null>(null);
  const [yourPlayerId, setYourPlayerId] = useState<number | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [errorSeq, setErrorSeq] = useState<number>(0);
  const [snapshotSeq, setSnapshotSeq] = useState<number>(0);

  const wsRef = useRef<WebSocket | null>(null);
  const pendingQueueRef = useRef<ClientToServerMessage[]>([]);
  const roomSnapshotRef = useRef<OnlineRoomSnapshot | null>(null);
  const isSyncedRef = useRef<boolean>(false);
  const actionSeqRef = useRef<number>(0);
  const sessionRef = useRef<StoredSession | null>(readStoredSession());
  const intentionalCloseRef = useRef<boolean>(false);
  const reconnectTimerRef = useRef<number>(0);
  const reconnectAttemptsRef = useRef<number>(0);
  const lastEventSeqRef = useRef<number>(0);
  const onVisualEventRef = useRef(onVisualEvent);
  onVisualEventRef.current = onVisualEvent;

  const rememberPlayerName = useCallback((name: string) => {
    const trimmed = name.trim().slice(0, 22);
    setSavedPlayerName(trimmed);
    try {
      if (trimmed) {
        window.localStorage.setItem(PLAYER_NAME_STORAGE_KEY, trimmed);
      }
    } catch {
      // ignore
    }
  }, []);

  const openSocket = useCallback((isReconnect = false) => {
    if (typeof window === 'undefined') return;
    const current = wsRef.current;
    if (current && (current.readyState === WebSocket.OPEN || current.readyState === WebSocket.CONNECTING)) {
      return;
    }

    intentionalCloseRef.current = false;
    setConnectionStatus(isReconnect ? 'reconnecting' : 'connecting');

    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${wsProtocol}//${window.location.host}/ws`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      if (wsRef.current !== ws) return;
      reconnectAttemptsRef.current = 0;

      // Filter queue to room bootstrap messages only — never replay stale in-match actions across reconnects.
      const bootstrapQueued = pendingQueueRef.current.filter(
        (m) => m.type === 'CREATE_ROOM' || m.type === 'JOIN_ROOM' || m.type === 'RECONNECT_ROOM'
      );
      pendingQueueRef.current = [];

      const hasRoomInitQueued = bootstrapQueued.length > 0;
      if (!hasRoomInitQueued && sessionRef.current) {
        // Stay in 'reconnecting' & unsynced until the server responds with a fresh ROOM_JOINED / ROOM_SNAPSHOT.
        isSyncedRef.current = false;
        setIsSynced(false);
        setConnectionStatus('reconnecting');
        ws.send(
          JSON.stringify({
            type: 'RECONNECT_ROOM',
            roomCode: sessionRef.current.roomCode,
            sessionToken: sessionRef.current.sessionToken,
          } satisfies ClientToServerMessage)
        );
      } else {
        setConnectionStatus('connected');
      }

      for (const msg of bootstrapQueued) {
        ws.send(JSON.stringify(msg));
      }
    };

    ws.onmessage = (evt) => {
      if (wsRef.current !== ws) return;
      let msg: ServerToClientMessage;
      try {
        msg = JSON.parse(String(evt.data)) as ServerToClientMessage;
      } catch {
        return;
      }

      if (msg.type === 'PONG') return;

      if (msg.type === 'ROOM_JOINED') {
        const stored: StoredSession = {
          roomCode: msg.roomCode,
          sessionToken: msg.sessionToken,
        };
        sessionRef.current = stored;
        writeStoredSession(stored);
        syncRoomQueryParam(msg.roomCode);
        lastEventSeqRef.current = 0;
        roomSnapshotRef.current = msg.snapshot;
        isSyncedRef.current = true;
        setIsSynced(true);
        setConnectionStatus('connected');
        setYourSeatIndex(msg.yourSeatIndex);
        setYourPlayerId(msg.yourPlayerId);
        setRoomSnapshot(msg.snapshot);
        setSnapshotSeq((prev) => prev + 1);
        setErrorMessage(null);
        return;
      }

      if (msg.type === 'ROOM_SNAPSHOT') {
        roomSnapshotRef.current = msg.snapshot;
        isSyncedRef.current = true;
        setIsSynced(true);
        setConnectionStatus('connected');
        setYourSeatIndex(msg.yourSeatIndex);
        setYourPlayerId(msg.yourPlayerId);
        setRoomSnapshot(msg.snapshot);
        setSnapshotSeq((prev) => prev + 1);
        return;
      }

      if (msg.type === 'GAME_EVENT') {
        if (msg.event.eventSeq > lastEventSeqRef.current) {
          lastEventSeqRef.current = msg.event.eventSeq;
          onVisualEventRef.current?.(msg.event);
        }
        return;
      }

      if (msg.type === 'LEFT_ROOM') {
        sessionRef.current = null;
        roomSnapshotRef.current = null;
        isSyncedRef.current = false;
        setIsSynced(false);
        writeStoredSession(null);
        syncRoomQueryParam(null);
        setRoomSnapshot(null);
        setYourSeatIndex(null);
        setYourPlayerId(null);
        setErrorMessage(null);
        return;
      }

      if (msg.type === 'ERROR') {
        if (
          msg.code === 'ROOM_NOT_FOUND' ||
          msg.code === 'SESSION_EXPIRED' ||
          msg.code === 'NOT_IN_ROOM' ||
          msg.code === 'SESSION_REPLACED'
        ) {
          sessionRef.current = null;
          roomSnapshotRef.current = null;
          isSyncedRef.current = false;
          setIsSynced(false);
          if (msg.code !== 'SESSION_REPLACED') {
            writeStoredSession(null);
          }
          syncRoomQueryParam(null);
          setRoomSnapshot(null);
          setYourSeatIndex(null);
          setYourPlayerId(null);
          if (wsRef.current?.readyState === WebSocket.OPEN) {
            setConnectionStatus('connected');
          }
        }
        setErrorMessage(msg.message);
        setErrorSeq((prev) => prev + 1);
      }
    };

    ws.onclose = () => {
      if (wsRef.current !== ws) {
        return;
      }
      wsRef.current = null;
      isSyncedRef.current = false;
      setIsSynced(false);
      // Drop any non-bootstrap messages that shouldn't survive a socket close.
      pendingQueueRef.current = pendingQueueRef.current.filter(
        (m) => m.type === 'CREATE_ROOM' || m.type === 'JOIN_ROOM' || m.type === 'RECONNECT_ROOM'
      );
      if (intentionalCloseRef.current) {
        setConnectionStatus('idle');
        return;
      }

      if (sessionRef.current) {
        const attempt = reconnectAttemptsRef.current++;
        const delayMs = Math.min(6000, 1000 * Math.pow(1.6, attempt));
        setConnectionStatus('reconnecting');
        window.clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = window.setTimeout(() => {
          openSocket(true);
        }, delayMs);
      } else {
        setConnectionStatus('idle');
      }
    };

    ws.onerror = () => {
      // Handled by onclose
    };
  }, []);

  const sendMessage = useCallback(
    (msg: ClientToServerMessage): boolean => {
      const isBootstrapMessage =
        msg.type === 'CREATE_ROOM' || msg.type === 'JOIN_ROOM' || msg.type === 'RECONNECT_ROOM';
      const ws = wsRef.current;

      if (isBootstrapMessage) {
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify(msg));
          return true;
        }
        pendingQueueRef.current.push(msg);
        openSocket(Boolean(sessionRef.current));
        return true;
      }

      // Live in-room / in-match actions require an OPEN socket synced with the latest server snapshot.
      if (ws && ws.readyState === WebSocket.OPEN && isSyncedRef.current) {
        ws.send(JSON.stringify(msg));
        return true;
      }

      if (msg.type !== 'SEND_EMOTE') {
        if (!ws || ws.readyState === WebSocket.CLOSED || ws.readyState === WebSocket.CLOSING) {
          openSocket(Boolean(sessionRef.current));
        }
        setErrorMessage('Đang đồng bộ lại kết nối máy chủ, vui lòng thử lại sau giây lát.');
        setErrorSeq((prev) => prev + 1);
      }
      return false;
    },
    [openSocket]
  );

  // Auto-reconnect on mount if there is a stored session matching the URL (and not in explicit offline autostart/demo mode)
  useEffect(() => {
    const stored = sessionRef.current;
    if (stored && skipInitialAutoReconnect && !initialInviteCode) {
      sessionRef.current = null;
    } else if (stored && initialInviteCode && initialInviteCode !== stored.roomCode) {
      sessionRef.current = null;
    } else if (stored && (!initialInviteCode || initialInviteCode === stored.roomCode)) {
      openSocket(true);
    }

    const pingInterval = window.setInterval(() => {
      const ws = wsRef.current;
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'PING' } satisfies ClientToServerMessage));
      }
    }, 20_000);

    return () => {
      intentionalCloseRef.current = true;
      window.clearTimeout(reconnectTimerRef.current);
      window.clearInterval(pingInterval);
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [initialInviteCode, openSocket, skipInitialAutoReconnect]);

  const ensureConnected = useCallback(() => {
    openSocket(false);
  }, [openSocket]);

  const createRoom = useCallback(
    (opts: {
      playerName: string;
      tokenType: TokenArchetype;
      maxPlayers: 2 | 3 | 4;
      startingCash: number;
      fillBots: boolean;
      matchMode?: MatchMode;
      tacticalDiceEnabled?: boolean;
      festivalEnabled?: boolean;
    }) => {
      rememberPlayerName(opts.playerName);
      setErrorMessage(null);
      sendMessage({
        type: 'CREATE_ROOM',
        playerName: opts.playerName,
        tokenType: opts.tokenType,
        maxPlayers: opts.maxPlayers,
        startingCash: opts.startingCash,
        fillBots: opts.fillBots,
        matchMode: opts.matchMode,
        tacticalDiceEnabled: opts.tacticalDiceEnabled,
        festivalEnabled: opts.festivalEnabled,
      });
    },
    [rememberPlayerName, sendMessage]
  );

  const joinRoom = useCallback(
    (opts: { roomCode: string; playerName: string; tokenType?: TokenArchetype }) => {
      rememberPlayerName(opts.playerName);
      setErrorMessage(null);
      sendMessage({
        type: 'JOIN_ROOM',
        roomCode: opts.roomCode.trim().toUpperCase(),
        playerName: opts.playerName,
        tokenType: opts.tokenType,
      });
    },
    [rememberPlayerName, sendMessage]
  );

  const leaveRoom = useCallback(() => {
    const hadSession = Boolean(sessionRef.current);
    sessionRef.current = null;
    roomSnapshotRef.current = null;
    isSyncedRef.current = false;
    setIsSynced(false);
    pendingQueueRef.current = [];
    writeStoredSession(null);
    syncRoomQueryParam(null);
    window.clearTimeout(reconnectTimerRef.current);

    const ws = wsRef.current;
    if (hadSession && ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'LEAVE_ROOM' } satisfies ClientToServerMessage));
    }
    setRoomSnapshot(null);
    setYourSeatIndex(null);
    setYourPlayerId(null);
    setErrorMessage(null);
  }, []);

  const updateLobbySettings = useCallback(
    (patch: {
      maxPlayers?: 2 | 3 | 4;
      startingCash?: number;
      fillBots?: boolean;
      matchMode?: MatchMode;
      tacticalDiceEnabled?: boolean;
      festivalEnabled?: boolean;
    }) => {
      sendMessage({ type: 'UPDATE_LOBBY_SETTINGS', ...patch });
    },
    [sendMessage]
  );

  const updateMyProfile = useCallback(
    (patch: { playerName?: string; tokenType?: TokenArchetype }) => {
      if (patch.playerName) rememberPlayerName(patch.playerName);
      sendMessage({ type: 'UPDATE_MY_PROFILE', ...patch });
    },
    [rememberPlayerName, sendMessage]
  );

  const startMatch = useCallback(() => {
    setErrorMessage(null);
    sendMessage({ type: 'START_MATCH' });
  }, [sendMessage]);

  const returnToLobby = useCallback(() => {
    setErrorMessage(null);
    sendMessage({ type: 'RETURN_TO_LOBBY' });
  }, [sendMessage]);

  const reclaimControl = useCallback(() => {
    setErrorMessage(null);
    sendMessage({ type: 'RECLAIM_CONTROL' });
  }, [sendMessage]);

  const sendGameAction = useCallback(
    (action: OnlineGameAction) => {
      const match = roomSnapshotRef.current?.match;
      const actionId = `act-${++actionSeqRef.current}-${Date.now().toString(36)}`;
      return sendMessage({
        type: 'GAME_ACTION',
        action,
        expectedTurnCount: match?.turnCount,
        expectedPhase: match?.turnPhase,
        expectedDecisionRevision: match?.decisionRevision,
        actionId,
      });
    },
    [sendMessage]
  );

  const sendEmote = useCallback(
    (emoteText: string) => {
      sendMessage({ type: 'SEND_EMOTE', emoteText });
    },
    [sendMessage]
  );

  const clearError = useCallback(() => {
    setErrorMessage(null);
  }, []);

  const getInviteUrl = useCallback((): string => {
    if (!roomSnapshot || typeof window === 'undefined') return '';
    return `${window.location.origin}/?room=${roomSnapshot.roomCode}`;
  }, [roomSnapshot]);

  return {
    connectionStatus,
    isSynced,
    roomSnapshot,
    yourSeatIndex,
    yourPlayerId,
    errorMessage,
    errorSeq,
    snapshotSeq,
    initialInviteCode,
    savedPlayerName,
    ensureConnected,
    createRoom,
    joinRoom,
    leaveRoom,
    updateLobbySettings,
    updateMyProfile,
    startMatch,
    returnToLobby,
    reclaimControl,
    sendGameAction,
    sendEmote,
    clearError,
    getInviteUrl,
  };
}
