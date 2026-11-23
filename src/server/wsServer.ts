import crypto from 'node:crypto';
import type http from 'node:http';
import { WebSocket, WebSocketServer } from 'ws';
import type { ClientToServerMessage, ServerToClientMessage } from '../game/onlineTypes';
import type { BotQuipPayload } from '../game/types';
import { OnlineRoomManager } from './roomManager';

const MAX_WS_PAYLOAD_BYTES = 16 * 1024;
const DEFAULT_MAX_WS_CLIENTS = 256;
const DEFAULT_RATE_LIMIT_MAX_MESSAGES = 40;
const DEFAULT_RATE_LIMIT_WINDOW_MS = 5000;

interface TrackedSocket extends WebSocket {
  isAlive?: boolean;
  clientId?: string;
}

export interface MultiplayerWsServerHandle {
  roomManager: OnlineRoomManager;
  wss: WebSocketServer;
  close: () => Promise<void>;
}

function sendSafe(ws: WebSocket, msg: ServerToClientMessage): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

export function attachMultiplayerWebSocketServer(
  httpServer: http.Server,
  options: {
    generateBotQuip?: (payload: BotQuipPayload) => Promise<string | null>;
    timingScale?: number;
    maxClients?: number;
    rateLimitMaxMessages?: number;
    rateLimitWindowMs?: number;
  } = {}
): MultiplayerWsServerHandle {
  const clients = new Map<string, TrackedSocket>();
  const maxClients = options.maxClients ?? DEFAULT_MAX_WS_CLIENTS;
  const rateLimitMaxMessages = options.rateLimitMaxMessages ?? DEFAULT_RATE_LIMIT_MAX_MESSAGES;
  const rateLimitWindowMs = options.rateLimitWindowMs ?? DEFAULT_RATE_LIMIT_WINDOW_MS;

  const roomManager = new OnlineRoomManager(
    (clientId, msg: ServerToClientMessage) => {
      const ws = clients.get(clientId);
      if (ws) {
        sendSafe(ws, msg);
      }
    },
    {
      generateBotQuip: options.generateBotQuip,
      timingScale: options.timingScale,
    }
  );

  const wss = new WebSocketServer({
    noServer: true,
    maxPayload: MAX_WS_PAYLOAD_BYTES,
  });

  const onUpgrade = (req: http.IncomingMessage, socket: import('node:stream').Duplex, head: Buffer) => {
    let pathname = '/';
    try {
      pathname = new URL(req.url || '/', 'http://localhost').pathname;
    } catch {
      pathname = '/';
    }
    if (pathname !== '/ws') {
      // Leave non-/ws upgrades untouched (e.g. Vite HMR WebSocket in dev)
      return;
    }

    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit('connection', ws, req);
    });
  };

  httpServer.on('upgrade', onUpgrade);

  wss.on('connection', (rawWs: WebSocket) => {
    const ws = rawWs as TrackedSocket;
    if (clients.size >= maxClients) {
      sendSafe(ws, {
        type: 'ERROR',
        code: 'SERVER_BUSY',
        message: 'Máy chủ đang quá tải kết nối. Vui lòng thử lại sau.',
      });
      ws.close(1013, 'Server busy');
      return;
    }

    const clientId = crypto.randomUUID();
    ws.clientId = clientId;
    ws.isAlive = true;
    clients.set(clientId, ws);

    const msgTimestamps: number[] = [];
    let rateViolations = 0;
    let cleanedUp = false;
    const cleanup = () => {
      if (cleanedUp) return;
      cleanedUp = true;
      clients.delete(clientId);
      roomManager.handleDisconnect(clientId);
    };

    ws.on('pong', () => {
      ws.isAlive = true;
    });

    ws.on('message', (data) => {
      const now = Date.now();
      while (msgTimestamps.length > 0 && now - msgTimestamps[0] >= rateLimitWindowMs) {
        msgTimestamps.shift();
      }
      if (msgTimestamps.length >= rateLimitMaxMessages) {
        rateViolations += 1;
        sendSafe(ws, {
          type: 'ERROR',
          code: 'RATE_LIMITED',
          message: 'Bạn gửi thao tác quá nhanh. Vui lòng chậm lại.',
        });
        if (rateViolations >= 5) {
          ws.close(1008, 'Rate limit exceeded');
        }
        return;
      }
      msgTimestamps.push(now);

      let parsed: unknown = null;
      try {
        parsed = JSON.parse(String(data));
      } catch {
        sendSafe(ws, {
          type: 'ERROR',
          code: 'BAD_JSON',
          message: 'Dữ liệu gửi lên không hợp lệ.',
        });
        return;
      }

      if (
        !parsed ||
        typeof parsed !== 'object' ||
        Array.isArray(parsed) ||
        typeof (parsed as { type?: unknown }).type !== 'string'
      ) {
        sendSafe(ws, {
          type: 'ERROR',
          code: 'BAD_MESSAGE',
          message: 'Định dạng thông điệp không hợp lệ.',
        });
        return;
      }

      try {
        roomManager.handleClientMessage(clientId, parsed as ClientToServerMessage);
      } catch {
        sendSafe(ws, {
          type: 'ERROR',
          code: 'BAD_MESSAGE',
          message: 'Không thể xử lý yêu cầu.',
        });
      }
    });

    ws.on('close', cleanup);
    ws.on('error', cleanup);
  });

  const keepalive = setInterval(() => {
    for (const ws of clients.values()) {
      if (ws.isAlive === false) {
        ws.terminate();
        continue;
      }
      ws.isAlive = false;
      if (ws.readyState === WebSocket.OPEN) {
        ws.ping();
      }
    }
  }, 25_000);

  const close = async () => {
    clearInterval(keepalive);
    httpServer.off('upgrade', onUpgrade);
    roomManager.dispose();
    for (const ws of clients.values()) {
      ws.terminate();
    }
    clients.clear();
    await new Promise<void>((resolve) => {
      wss.close(() => resolve());
    });
  };

  return { roomManager, wss, close };
}
