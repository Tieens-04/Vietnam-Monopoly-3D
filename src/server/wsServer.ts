import crypto from 'node:crypto';
import type http from 'node:http';
import { WebSocket, WebSocketServer } from 'ws';
import type { ClientToServerMessage, ServerToClientMessage } from '../game/onlineTypes';
import type { BotQuipPayload } from '../game/types';
import { OnlineRoomManager } from './roomManager';

interface TrackedSocket extends WebSocket {
  isAlive?: boolean;
  clientId?: string;
}

export interface MultiplayerWsServerHandle {
  roomManager: OnlineRoomManager;
  wss: WebSocketServer;
  close: () => Promise<void>;
}

export function attachMultiplayerWebSocketServer(
  httpServer: http.Server,
  options: {
    generateBotQuip?: (payload: BotQuipPayload) => Promise<string | null>;
    timingScale?: number;
  } = {}
): MultiplayerWsServerHandle {
  const clients = new Map<string, TrackedSocket>();

  const roomManager = new OnlineRoomManager(
    (clientId, msg: ServerToClientMessage) => {
      const ws = clients.get(clientId);
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(msg));
      }
    },
    {
      generateBotQuip: options.generateBotQuip,
      timingScale: options.timingScale,
    }
  );

  const wss = new WebSocketServer({ noServer: true });

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
    const clientId = crypto.randomUUID();
    ws.clientId = clientId;
    ws.isAlive = true;
    clients.set(clientId, ws);

    ws.on('pong', () => {
      ws.isAlive = true;
    });

    ws.on('message', (data) => {
      let parsed: ClientToServerMessage | null = null;
      try {
        parsed = JSON.parse(String(data)) as ClientToServerMessage;
      } catch {
        ws.send(
          JSON.stringify({
            type: 'ERROR',
            code: 'BAD_JSON',
            message: 'Dữ liệu gửi lên không hợp lệ.',
          } satisfies ServerToClientMessage)
        );
        return;
      }
      if (!parsed || typeof parsed.type !== 'string') return;
      roomManager.handleClientMessage(clientId, parsed);
    });

    ws.on('close', () => {
      clients.delete(clientId);
      roomManager.handleDisconnect(clientId);
    });

    ws.on('error', () => {
      clients.delete(clientId);
      roomManager.handleDisconnect(clientId);
    });
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
