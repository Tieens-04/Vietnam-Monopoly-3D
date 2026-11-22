import 'dotenv/config';
import express, { type Request, type Response } from 'express';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GoogleGenAI, ThinkingLevel } from '@google/genai';
import type { BotQuipPayload } from '../game/types';
import { generateOfflineBotQuip } from '../game/visualTheme';
import { attachMultiplayerWebSocketServer } from './wsServer';

interface BotQuipRequestBody {
  sessionId?: string;
  botId?: number;
  botName?: string;
  botPersona?: string;
  eventKind?: 'BUY_PRIME_LAND' | 'COLLECT_BIG_RENT' | 'PAY_PENALTY';
  tileName?: string;
  amount?: number;
  botCashAfter?: number;
  extraContext?: string;
}

const BT_PROMPT_MULTIPLIER = 1;

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

function buildEventPrompt(body: Required<Omit<BotQuipRequestBody, 'botId' | 'sessionId'>>): string {
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
  const botName = String(body.botName ?? '').trim();
  const eventKind = body.eventKind;
  const tileName = String(body.tileName ?? '').trim();
  const amount = Number(body.amount ?? 0);

  if (
    !botName ||
    !tileName ||
    !eventKind ||
    !['BUY_PRIME_LAND', 'COLLECT_BIG_RENT', 'PAY_PENALTY'].includes(eventKind)
  ) {
    throw new Error('Thiếu thông tin sự kiện hợp lệ để tạo bình luận cho Bot AI.');
  }

  const parsedBotId = Number(body.botId);
  const botIdNum = Number.isInteger(parsedBotId) && parsedBotId >= 0 ? parsedBotId : -1;
  const sessionKey = String(body.sessionId ?? 'default').trim().slice(0, 64) || 'default';
  const quipCacheKey = botIdNum >= 0 ? `${sessionKey}:${botIdNum}` : '';
  const prevQuip = quipCacheKey ? recentBotQuips.get(quipCacheKey) : undefined;
  const antiRepeatNote = prevQuip
    ? ` (Lưu ý: không lặp lại cách diễn đạt của câu trước đó: "${prevQuip}")`
    : '';

  const prompt = buildEventPrompt({
    botName,
    botPersona: String(body.botPersona ?? 'Tỷ phú đầu tư bất động sản hóm hỉnh.'),
    eventKind,
    tileName,
    amount: Number.isFinite(amount) ? Math.max(0, Math.round(amount)) : 0,
    botCashAfter: Number.isFinite(Number(body.botCashAfter))
      ? Math.round(Number(body.botCashAfter))
      : 0,
    extraContext: `${String(body.extraContext ?? '')}${antiRepeatNote}`,
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
  const body = (req.body ?? {}) as BotQuipRequestBody;
  const botName = String(body.botName ?? '').trim();
  const eventKind = body.eventKind;
  const tileName = String(body.tileName ?? '').trim();

  if (
    !botName ||
    !tileName ||
    !eventKind ||
    !['BUY_PRIME_LAND', 'COLLECT_BIG_RENT', 'PAY_PENALTY'].includes(eventKind)
  ) {
    res.status(400).json({
      error: 'Thiếu thông tin sự kiện hợp lệ để tạo bình luận cho Bot AI.',
    });
    return;
  }

  const fallbackPayload: BotQuipPayload = {
    botId: Number(body.botId ?? 1),
    botName,
    botPersona: String(body.botPersona ?? 'Tỷ phú đầu tư bất động sản hóm hỉnh.'),
    eventKind,
    tileName,
    amount: Number(body.amount ?? 0),
    botCashAfter: Number(body.botCashAfter ?? 0),
    extraContext: String(body.extraContext ?? ''),
  };

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    res.status(200).json({ quip: generateOfflineBotQuip(fallbackPayload) });
    return;
  }

  try {
    const quip = await generateBotQuipText(body);
    res.status(200).json({ quip });
  } catch {
    res.status(200).json({ quip: generateOfflineBotQuip(fallbackPayload) });
  }
}

export async function startServer(): Promise<http.Server> {
  const app = express();
  app.use(express.json({ limit: '32kb' }));

  const httpServer = http.createServer(app);
  const wsHandle = attachMultiplayerWebSocketServer(httpServer, {
    generateBotQuip: generateOptionalOnlineBotQuip,
  });

  app.get('/api/health', (_req: Request, res: Response) => {
    res.status(200).json({
      ok: true,
      rooms: wsHandle.roomManager.getActiveRoomCount(),
    });
  });

  app.post('/api/bot-quip', (req, res) => {
    void handleBotQuip(req, res);
  });

  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const isProd = process.env.NODE_ENV === 'production' || import.meta.url.endsWith('.js');

  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distCandidates = [
      path.resolve(__dirname, 'dist'),
      path.resolve(process.cwd(), 'dist'),
    ];
    const distPath = distCandidates.find((d) => fs.existsSync(d)) || distCandidates[0];
    app.use(express.static(distPath));
    app.get('*', (_req: Request, res: Response) => {
      const indexHtml = path.join(distPath, 'index.html');
      if (fs.existsSync(indexHtml)) {
        res.sendFile(indexHtml);
      } else {
        res.status(404).send('Not found');
      }
    });
  }

  const port = Number(process.env.PORT) || 3000;
  await new Promise<void>((resolve) => {
    httpServer.listen(port, '0.0.0.0', () => {
      console.log(`Server running on http://0.0.0.0:${port}`);
      resolve();
    });
  });

  return httpServer;
}

if (process.env.NODE_ENV !== 'test') {
  void startServer();
}
