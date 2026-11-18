import 'dotenv/config';
import express, { type Request, type Response } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GoogleGenAI, ThinkingLevel } from '@google/genai';

interface BotQuipRequestBody {
  botId?: number;
  botName?: string;
  botPersona?: string;
  eventKind?: 'BUY_PRIME_LAND' | 'COLLECT_BIG_RENT' | 'PAY_PENALTY';
  tileName?: string;
  amount?: number;
  botCashAfter?: number;
  extraContext?: string;
}

const SYSTEM_INSTRUCTION = [
  'Bạn là AI nhập vai một tỷ phú đối thủ đang chơi Cờ Tỷ Phú Việt Nam 3D.',
  'Nhiệm vụ: Viết ĐÚNG 1 câu bình luận ngắn gọn bằng Tiếng Việt (từ 8 đến 20 từ, chỉ 1 câu duy nhất, không xuống dòng, không bọc dấu ngoặc kép, không dùng markdown hay hashtag).',
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

function buildEventPrompt(body: Required<Omit<BotQuipRequestBody, 'botId'>>): string {
  const eventDesc =
    body.eventKind === 'BUY_PRIME_LAND'
      ? `Vừa chốt mua thành công bất động sản "${body.tileName}" với giá $${body.amount}.`
      : body.eventKind === 'COLLECT_BIG_RENT'
        ? `Vừa thu được khoản tiền thuê đậm $${body.amount} tại "${body.tileName}".`
        : `Vừa bị trừ/phạt khoản tiền $${body.amount} vì "${body.tileName}".`;

  return [
    `Tên Bot: ${body.botName}`,
    `Cá tính: ${body.botPersona}`,
    `Sự kiện vừa xảy ra: ${eventDesc}`,
    `Ngữ cảnh ván đấu: ${body.extraContext} Số dư tiền mặt còn lại của Bot: $${body.botCashAfter}.`,
    'Hãy buông 1 câu bình luận hài hước đúng ngữ cảnh ngay lúc này:',
  ].join('\n');
}

function cleanQuipOutput(raw: string): string {
  return raw
    .replace(/^["'“”‘’\s]+|["'“”‘’\s]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const recentBotQuips = new Map<number, string>();

async function generateQuipWithRetry(prompt: string): Promise<string> {
  const ai = getGeminiClient();
  const attempts: Array<{ model: string; thinkingLevel: ThinkingLevel; timeoutMs: number }> = [
    {
      model: 'gemini-3.1-flash-lite',
      thinkingLevel: ThinkingLevel.MINIMAL,
      timeoutMs: 9000,
    },
    {
      model: 'gemini-4-hydrogen',
      thinkingLevel: ThinkingLevel.LOW,
      timeoutMs: 18000,
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

async function handleBotQuip(req: Request, res: Response): Promise<void> {
  try {
    const body = (req.body ?? {}) as BotQuipRequestBody;
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
      res.status(400).json({
        error: 'Thiếu thông tin sự kiện hợp lệ để tạo bình luận cho Bot AI.',
      });
      return;
    }

    const botIdNum = Number.isFinite(Number(body.botId)) ? Number(body.botId) : 0;
    const prevQuip = botIdNum ? recentBotQuips.get(botIdNum) : undefined;
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
    if (botIdNum) {
      recentBotQuips.set(botIdNum, quip);
    }
    res.status(200).json({ quip });
  } catch (err) {
    const rawMsg = err instanceof Error ? err.message : String(err);
    const explicitStatus = (err as { statusCode?: number; status?: number })?.statusCode ||
      (err as { status?: number })?.status;

    if (
      explicitStatus === 401 ||
      explicitStatus === 403 ||
      /API_KEY_INVALID|PERMISSION_DENIED|API key not valid/i.test(rawMsg)
    ) {
      res.status(403).json({
        error:
          'Khóa GEMINI_API_KEY không hợp lệ hoặc chưa có quyền. Vui lòng kiểm tra trong Settings > Secrets.',
      });
      return;
    }

    if (explicitStatus === 429 || /RESOURCE_EXHAUSTED|quota|429/i.test(rawMsg)) {
      res.status(429).json({
        error:
          'Đã chạm giới hạn hạn ngạch Gemini API. Bạn có thể nâng cấp gói khóa API trong Settings > Secrets.',
      });
      return;
    }

    res.status(500).json({
      error: `Không thể gọi Gemini API lúc này: ${rawMsg.slice(0, 140)}`,
    });
  }
}

async function startServer(): Promise<void> {
  const app = express();
  app.use(express.json({ limit: '32kb' }));

  app.post('/api/bot-quip', (req, res) => {
    void handleBotQuip(req, res);
  });

  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const isProd = process.env.NODE_ENV === 'production';

  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
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
  app.listen(port, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${port}`);
  });
}

void startServer();
