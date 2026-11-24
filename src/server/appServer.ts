import 'dotenv/config';
import express, { type NextFunction, type Request, type Response } from 'express';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GoogleGenAI, ThinkingLevel } from '@google/genai';
import type { BotQuipPayload } from '../game/types';
import { generateOfflineBotQuip } from '../game/visualTheme';
import { attachMultiplayerWebSocketServer, type MultiplayerWsServerHandle } from './wsServer';

interface BotQuipRequestBody {
  sessionId?: unknown;
  botId?: unknown;
  botName?: unknown;
  botPersona?: unknown;
  eventKind?: unknown;
  tileName?: unknown;
  amount?: unknown;
  botCashAfter?: unknown;
  extraContext?: unknown;
}

const BT_PROMPT_MULTIPLIER = 1;
const DEFAULT_BOT_QUIP_RATE_LIMIT_MAX = 20;
const DEFAULT_BOT_QUIP_RATE_LIMIT_WINDOW_MS = 60_000;

function sanitizePromptField(raw: unknown, maxLen: number): string {
  if (typeof raw !== 'string') return '';
  return raw
    .replace(/[\r\n\t\x00-\x1f\x7f]+/g, ' ')
    .replace(/[`<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLen);
}

function isValidEventKind(
  val: unknown
): val is 'BUY_PRIME_LAND' | 'COLLECT_BIG_RENT' | 'PAY_PENALTY' {
  return (
    val === 'BUY_PRIME_LAND' ||
    val === 'COLLECT_BIG_RENT' ||
    val === 'PAY_PENALTY'
  );
}

function formatPromptCompact(rawDollars: number): string {
  const absScaled = Math.abs(rawDollars) * BT_PROMPT_MULTIPLIER;
  if (absScaled < 1000) return '0K';
  if (absScaled >= 1_000_000) {
    const millions = Math.round((absScaled / 1_000_000) * 100) / 100;
    return `${Number(millions.toFixed(2))}M`;
  }
  return `${Math.round(absScaled / 1000)}K`;
}

function formatPromptSpaced(rawDollars: number): string {
  const scaled = Math.round(rawDollars * BT_PROMPT_MULTIPLIER);
  if (scaled === 0) return '0';
  const sign = scaled < 0 ? '-' : '';
  const grouped = String(Math.abs(scaled)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return `${sign}${grouped}`;
}

const SYSTEM_INSTRUCTION = [
  'Bạn là AI nhập vai một tỷ phú đối thủ đang chơi Cờ Tỷ Phú Việt Nam 3D (luật Business Tour).',
  'Nhiệm vụ: Viết ĐÚNG 1 câu bình luận ngắn gọn bằng Tiếng Việt (từ 8 đến 20 từ, chỉ 1 câu duy nhất, không xuống dòng, không bọc dấu ngoặc kép, không dùng markdown hay hashtag).',
  'Tuyệt đối KHÔNG dùng ký hiệu đô la ($); nếu nhắc đến tiền hãy dùng đúng định dạng K hoặc M (ví dụ 600K, 1.2M).',
  'Câu nói phải thể hiện rõ cá tính riêng của Bot, nhắc khéo tới địa danh hoặc số tiền vừa xảy ra, hài hước, tự nhiên và dí dỏm đúng chất đại gia bất động sản.',
].join(' ');

function getGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    const missingErr = new Error(
      'Chưa tìm thấy GEMINI_API_KEY hợp lệ. Hãy kiểm tra khóa API trong bảng Settings > Secrets.'
    ) as Error & { statusCode?: number };
    missingErr.statusCode = 401;
    throw missingErr;
  }

  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function buildEventPrompt(body: {
  botName: string;
  botPersona: string;
  eventKind: 'BUY_PRIME_LAND' | 'COLLECT_BIG_RENT' | 'PAY_PENALTY';
  tileName: string;
  amount: number;
  botCashAfter: number;
  extraContext: string;
}): string {
  const compactAmt = formatPromptCompact(body.amount);
  const spacedCash = formatPromptSpaced(body.botCashAfter);
  const eventDesc =
    body.eventKind === 'BUY_PRIME_LAND'
      ? `Vừa chốt mua thành công bất động sản "${body.tileName}" với mức chi ${compactAmt}.`
      : body.eventKind === 'COLLECT_BIG_RENT'
        ? `Vừa thu được khoản tiền thuê đậm ${compactAmt} tại "${body.tileName}".`
        : `Vừa bị trừ/phạt khoản tiền ${compactAmt} vì "${body.tileName}".`;

  return [
    `Tên Bot: ${body.botName}`,
    `Cá tính: ${body.botPersona}`,
    `Sự kiện vừa xảy ra: ${eventDesc}`,
    `Ngữ cảnh ván đấu: ${body.extraContext} Số dư tiền mặt còn lại của Bot: ${spacedCash}.`,
    'Hãy buông 1 câu bình luận hài hước đúng ngữ cảnh ngay lúc này:',
  ].join('\n');
}

function cleanQuipOutput(raw: string): string {
  return raw
    .replace(/^["'“”‘’\s]+|["'“”‘’\s]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const recentBotQuips = new Map<string, string>();
const MAX_RECENT_QUIPS = 200;

async function generateQuipWithRetry(prompt: string): Promise<string> {
  const ai = getGeminiClient();
  const attempts: Array<{ model: string; thinkingLevel: ThinkingLevel; timeoutMs: number }> = [
    {
      model: 'gemini-3.5-flash-lite',
      thinkingLevel: ThinkingLevel.MINIMAL,
      timeoutMs: 9000,
    },
    {
      model: 'gemini-3.1-flash-lite',
      thinkingLevel: ThinkingLevel.LOW,
      timeoutMs: 14000,
    },
  ];

  let lastError: unknown = null;

  for (let i = 0; i < attempts.length; i++) {
    const candidate = attempts[i];
    try {
      const response = await ai.models.generateContent({
        model: candidate.model,
        contents: prompt,
        config: {
          systemInstruction: SYSTEM_INSTRUCTION,
          thinkingConfig: {
            thinkingLevel: candidate.thinkingLevel,
          },
          abortSignal: AbortSignal.timeout(candidate.timeoutMs),
        },
      });

      const cleaned = cleanQuipOutput(response.text ?? '');
      if (!cleaned) {
        throw new Error('Mô hình trả về phản hồi rỗng.');
      }
      return cleaned;
    } catch (err) {
      lastError = err;
      const msg = err instanceof Error ? err.message : String(err);
      const isAuthOrQuota =
        /API_KEY_INVALID|PERMISSION_DENIED|API key not valid|RESOURCE_EXHAUSTED|quota|429|401|403/i.test(
          msg
        );
      if (isAuthOrQuota || i === attempts.length - 1) {
        throw err;
      }
    }
  }

  throw lastError;
}

async function generateBotQuipText(body: BotQuipRequestBody): Promise<string> {
  const botName = sanitizePromptField(body.botName, 30);
  const eventKind = body.eventKind;
  const tileName = sanitizePromptField(body.tileName, 60);
  const amount = Number(body.amount ?? 0);

  if (!botName || !tileName || !isValidEventKind(eventKind)) {
    throw new Error('Thiếu thông tin sự kiện hợp lệ để tạo bình luận cho Bot AI.');
  }

  const parsedBotId = Number(body.botId);
  const botIdNum = Number.isInteger(parsedBotId) && parsedBotId >= 0 ? parsedBotId : -1;
  const sessionKey = sanitizePromptField(body.sessionId, 64) || 'default';
  const quipCacheKey = botIdNum >= 0 ? `${sessionKey}:${botIdNum}` : '';
  const prevQuip = quipCacheKey ? recentBotQuips.get(quipCacheKey) : undefined;
  const antiRepeatNote = prevQuip
    ? ` (Lưu ý: không lặp lại cách diễn đạt của câu trước đó: "${sanitizePromptField(prevQuip, 160)}")`
    : '';

  const botPersona =
    sanitizePromptField(body.botPersona, 120) || 'Tỷ phú đầu tư bất động sản hóm hỉnh.';
  const extraContext = sanitizePromptField(body.extraContext, 200);

  const prompt = buildEventPrompt({
    botName,
    botPersona,
    eventKind,
    tileName,
    amount: Number.isFinite(amount) ? Math.max(0, Math.round(amount)) : 0,
    botCashAfter: Number.isFinite(Number(body.botCashAfter))
      ? Math.round(Number(body.botCashAfter))
      : 0,
    extraContext: `${extraContext}${antiRepeatNote}`,
  });

  const quip = await generateQuipWithRetry(prompt);
  if (quipCacheKey) {
    if (recentBotQuips.size >= MAX_RECENT_QUIPS) {
      const oldestKey = recentBotQuips.keys().next().value;
      if (oldestKey !== undefined) {
        recentBotQuips.delete(oldestKey);
      }
    }
    recentBotQuips.set(quipCacheKey, quip);
  }
  return quip;
}

async function generateOptionalOnlineBotQuip(payload: BotQuipPayload): Promise<string | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    return generateOfflineBotQuip(payload);
  }
  try {
    return await generateBotQuipText(payload);
  } catch {
    return generateOfflineBotQuip(payload);
  }
}

async function handleBotQuip(req: Request, res: Response): Promise<void> {
  if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
    res.status(400).json({ error: 'Dữ liệu yêu cầu không hợp lệ.' });
    return;
  }

  const body = req.body as BotQuipRequestBody;
  if (
    typeof body.botName !== 'string' ||
    typeof body.tileName !== 'string' ||
    !isValidEventKind(body.eventKind) ||
    (body.botPersona !== undefined && typeof body.botPersona !== 'string') ||
    (body.extraContext !== undefined && typeof body.extraContext !== 'string') ||
    (body.sessionId !== undefined && typeof body.sessionId !== 'string') ||
    (body.botId !== undefined && (typeof body.botId !== 'number' || !Number.isFinite(body.botId))) ||
    (body.amount !== undefined && (typeof body.amount !== 'number' || !Number.isFinite(body.amount))) ||
    (body.botCashAfter !== undefined &&
      (typeof body.botCashAfter !== 'number' || !Number.isFinite(body.botCashAfter)))
  ) {
    res.status(400).json({
      error: 'Thiếu thông tin sự kiện hợp lệ để tạo bình luận cho Bot AI.',
    });
    return;
  }

  const botName = sanitizePromptField(body.botName, 30);
  const tileName = sanitizePromptField(body.tileName, 60);
  const eventKind = body.eventKind;

  if (!botName || !tileName) {
    res.status(400).json({
      error: 'Thiếu thông tin sự kiện hợp lệ để tạo bình luận cho Bot AI.',
    });
    return;
  }

  const sanitizedBody: BotQuipRequestBody = {
    sessionId: sanitizePromptField(body.sessionId, 64),
    botId: body.botId ?? 1,
    botName,
    botPersona: sanitizePromptField(body.botPersona, 120) || 'Tỷ phú đầu tư bất động sản hóm hỉnh.',
    eventKind,
    tileName,
    amount: Math.max(0, Math.round(body.amount ?? 0)),
    botCashAfter: Math.round(body.botCashAfter ?? 0),
    extraContext: sanitizePromptField(body.extraContext, 200),
  };

  const fallbackPayload: BotQuipPayload = {
    botId: Number(sanitizedBody.botId ?? 1),
    botName,
    botPersona: String(sanitizedBody.botPersona),
    eventKind,
    tileName,
    amount: Number(sanitizedBody.amount ?? 0),
    botCashAfter: Number(sanitizedBody.botCashAfter ?? 0),
    extraContext: String(sanitizedBody.extraContext ?? ''),
  };

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    res.status(200).json({ quip: generateOfflineBotQuip(fallbackPayload) });
    return;
  }

  try {
    const quip = await generateBotQuipText(sanitizedBody);
    res.status(200).json({ quip });
  } catch {
    res.status(200).json({ quip: generateOfflineBotQuip(fallbackPayload) });
  }
}

/**
 * Builds the WebRTC ICE server list with default STUN servers plus optional
 * TURN configuration from `TURN_URLS`, `TURN_USERNAME`, and `TURN_CREDENTIAL`.
 */
export function buildRtcIceServers(): RTCIceServer[] {
  const iceServers: RTCIceServer[] = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun.cloudflare.com:3478' },
  ];

  const turnUrls = (process.env.TURN_URLS ?? '')
    .split(',')
    .map((url) => url.trim())
    .filter((url) => url.length > 0);

  if (turnUrls.length > 0) {
    const turnServer: RTCIceServer = {
      urls: turnUrls.length === 1 ? turnUrls[0] : turnUrls,
    };
    const turnUsername = process.env.TURN_USERNAME?.trim();
    const turnCredential = process.env.TURN_CREDENTIAL?.trim();
    if (turnUsername) {
      turnServer.username = turnUsername;
    }
    if (turnCredential) {
      turnServer.credential = turnCredential;
    }
    iceServers.push(turnServer);
  }

  return iceServers;
}

export interface CreateAppServerOptions {
  enableVite?: boolean;
  botQuipRateLimitMax?: number;
  botQuipRateLimitWindowMs?: number;
  generateBotQuip?: (payload: BotQuipPayload) => Promise<string | null>;
}

export interface CreatedAppServer {
  app: express.Express;
  httpServer: http.Server;
  wsHandle: MultiplayerWsServerHandle;
  close: () => Promise<void>;
}

export async function createAppServer(
  options: CreateAppServerOptions = {}
): Promise<CreatedAppServer> {
  const app = express();
  app.disable('x-powered-by');

  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(self), geolocation=()');
    next();
  });

  app.use(express.json({ limit: '32kb' }));
  app.use((err: unknown, _req: Request, res: Response, next: NextFunction) => {
    if (err instanceof SyntaxError && 'status' in err && (err as { status?: number }).status === 400) {
      res.status(400).json({ error: 'JSON không hợp lệ.' });
      return;
    }
    if (
      err &&
      typeof err === 'object' &&
      'type' in err &&
      (err as { type?: string }).type === 'entity.too.large'
    ) {
      res.status(413).json({ error: 'Dữ liệu quá lớn.' });
      return;
    }
    next(err);
  });

  const httpServer = http.createServer(app);
  const wsHandle = attachMultiplayerWebSocketServer(httpServer, {
    generateBotQuip: options.generateBotQuip ?? generateOptionalOnlineBotQuip,
  });

  const rateMax = options.botQuipRateLimitMax ?? DEFAULT_BOT_QUIP_RATE_LIMIT_MAX;
  const rateWindowMs = options.botQuipRateLimitWindowMs ?? DEFAULT_BOT_QUIP_RATE_LIMIT_WINDOW_MS;
  const ipTimestamps = new Map<string, number[]>();

  app.get('/api/health', (_req: Request, res: Response) => {
    res.status(200).json({
      ok: true,
      rooms: wsHandle.roomManager.getActiveRoomCount(),
    });
  });

  app.get('/api/rtc-config', (_req: Request, res: Response) => {
    res.status(200).json({
      iceServers: buildRtcIceServers(),
    });
  });

  app.post('/api/bot-quip', (req: Request, res: Response) => {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const now = Date.now();
    const list = ipTimestamps.get(ip) ?? [];
    while (list.length > 0 && now - list[0] >= rateWindowMs) {
      list.shift();
    }
    if (list.length >= rateMax) {
      ipTimestamps.set(ip, list);
      res.status(429).json({
        error: 'Quá nhiều yêu cầu bình luận Bot AI. Vui lòng thử lại sau.',
      });
      return;
    }
    list.push(now);
    ipTimestamps.set(ip, list);
    if (ipTimestamps.size > 1000) {
      for (const [k, ts] of ipTimestamps) {
        if (ts.length === 0 || now - ts[ts.length - 1] >= rateWindowMs) {
          ipTimestamps.delete(k);
        }
      }
    }
    void handleBotQuip(req, res);
  });

  app.all('/api/*', (_req: Request, res: Response) => {
    res.status(404).json({ error: 'Not found' });
  });

  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const isProd = process.env.NODE_ENV === 'production' || import.meta.url.endsWith('.js');
  const shouldUseVite = options.enableVite ?? !isProd;
  let viteClose: (() => Promise<void>) | null = null;

  if (shouldUseVite) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
    viteClose = () => vite.close();
  } else {
    const distCandidates = [
      path.resolve(__dirname, 'dist'),
      path.resolve(process.cwd(), 'dist'),
    ];
    const distPath = distCandidates.find((d) => fs.existsSync(d)) || distCandidates[0];
    if (fs.existsSync(distPath)) {
      app.use(express.static(distPath));
    }
    app.get('*', (_req: Request, res: Response) => {
      const indexHtml = path.join(distPath, 'index.html');
      if (fs.existsSync(indexHtml)) {
        res.sendFile(indexHtml);
      } else {
        res.status(404).send('Not found');
      }
    });
  }

  const close = async () => {
    await wsHandle.close();
    if (viteClose) {
      await viteClose();
    }
    await new Promise<void>((resolve) => {
      httpServer.close(() => resolve());
    });
  };

  return { app, httpServer, wsHandle, close };
}

export async function startServer(): Promise<http.Server> {
  const { httpServer } = await createAppServer();
  const port = Number(process.env.PORT) || 3000;
  await new Promise<void>((resolve) => {
    httpServer.listen(port, '0.0.0.0', () => {
      console.log(`Server running on http://0.0.0.0:${port}`);
      resolve();
    });
  });

  return httpServer;
}

const isServerEntrypoint = (() => {
  const entry = process.argv[1] ? path.resolve(process.argv[1]) : '';
  const self = path.resolve(fileURLToPath(import.meta.url));
  return (
    entry === self ||
    entry.endsWith(`${path.sep}server.ts`) ||
    entry.endsWith(`${path.sep}server.js`)
  );
})();

if (process.env.NODE_ENV !== 'test' && isServerEntrypoint) {
  void startServer();
}
