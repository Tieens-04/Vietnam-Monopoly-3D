import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ClientToServerMessage,
  OnlineGameAction,
  OnlineRoomSnapshot,
  OnlineVisualEvent,
  ServerToClientMessage,
  TokenArchetype,
} from '../game/onlineTypes';

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

export function useOnlineMultiplayer(
  onVisualEvent?: (event: OnlineVisualEvent) => void
) {
  const [initialInviteCode] = useState<string | null>(() => readInitialInviteCode());
  const [savedPlayerName, setSavedPlayerName] = useState<string>(() => {
    try {
      return window.localStorage.getItem(PLAYER_NAME_STORAGE_KEY) || '';
    } catch {
      return '';
    }
  });

  const [connectionStatus, setConnectionStatus] = useState<OnlineConnectionStatus>('idle');
  const [roomSnapshot, setRoomSnapshot] = useState<OnlineRoomSnapshot | null>(null);
  const [yourSeatIndex, setYourSeatIndex] = useState<number | null>(null);
  const [yourPlayerId, setYourPlayerId] = useState<number | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const pendingQueueRef = useRef<ClientToServerMessage[]>([]);
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
      reconnectAttemptsRef.current = 0;
      setConnectionStatus('connected');

      // If we are reconnecting to a stored session and no explicit create/join is queued
      const hasRoomInitQueued = pendingQueueRef.current.some(
        (m) => m.type === 'CREATE_ROOM' || m.type === 'JOIN_ROOM' || m.type === 'RECONNECT_ROOM'
      );
      if (!hasRoomInitQueued && sessionRef.current) {
        ws.send(
          JSON.stringify({
            type: 'RECONNECT_ROOM',
            roomCode: sessionRef.current.roomCode,
            sessionToken: sessionRef.current.sessionToken,
          } satisfies ClientToServerMessage)
        );
      }

      const queued = pendingQueueRef.current.splice(0, pendingQueueRef.current.length);
      for (const msg of queued) {
        ws.send(JSON.stringify(msg));
      }
    };

    ws.onmessage = (evt) => {
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
        setYourSeatIndex(msg.yourSeatIndex);
        setYourPlayerId(msg.yourPlayerId);
        setRoomSnapshot(msg.snapshot);
        setErrorMessage(null);
        return;
      }

      if (msg.type === 'ROOM_SNAPSHOT') {
        setYourSeatIndex(msg.yourSeatIndex);
        setYourPlayerId(msg.yourPlayerId);
        setRoomSnapshot(msg.snapshot);
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
        writeStoredSession(null);
        syncRoomQueryParam(null);
        setRoomSnapshot(null);
        setYourSeatIndex(null);
        setYourPlayerId(null);
        setErrorMessage(null);
        return;
      }

      if (msg.type === 'ERROR') {
        if (msg.code === 'ROOM_NOT_FOUND' || msg.code === 'SESSION_EXPIRED') {
          sessionRef.current = null;
          writeStoredSession(null);
          syncRoomQueryParam(null);
          setRoomSnapshot(null);
          setYourSeatIndex(null);
          setYourPlayerId(null);
        }
        setErrorMessage(msg.message);
      }
    };

    ws.onclose = () => {
      if (wsRef.current === ws) {
        wsRef.current = null;
      }
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
    (msg: ClientToServerMessage) => {
      const ws = wsRef.current;
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(msg));
        return;
      }
      pendingQueueRef.current.push(msg);
      openSocket(Boolean(sessionRef.current));
    },
    [openSocket]
  );

  // Auto-reconnect on mount if there is a stored session matching the URL (or no room param)
  useEffect(() => {
    const stored = sessionRef.current;
    if (stored && (!initialInviteCode || initialInviteCode === stored.roomCode)) {
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
  }, [initialInviteCode, openSocket]);

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
    sessionRef.current = null;
    writeStoredSession(null);
    syncRoomQueryParam(null);
    window.clearTimeout(reconnectTimerRef.current);

    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'LEAVE_ROOM' } satisfies ClientToServerMessage));
    }
    setRoomSnapshot(null);
    setYourSeatIndex(null);
    setYourPlayerId(null);
    setErrorMessage(null);
  }, []);

  const updateLobbySettings = useCallback(
    (patch: { maxPlayers?: 2 | 3 | 4; startingCash?: number; fillBots?: boolean }) => {
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

  const sendGameAction = useCallback(
    (action: OnlineGameAction) => {
      sendMessage({ type: 'GAME_ACTION', action });
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
    roomSnapshot,
    yourSeatIndex,
    yourPlayerId,
    errorMessage,
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
    sendGameAction,
    sendEmote,
    clearError,
    getInviteUrl,
  };
}
