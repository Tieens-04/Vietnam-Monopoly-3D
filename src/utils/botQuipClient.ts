import { BotQuipPayload } from '../game/types';

export interface BotQuipResponse {
  quip: string;
}

/**
 * Calls our server-side Express proxy `/api/bot-quip` to generate a short, witty
 * Vietnamese remark tailored to the Bot's persona and board event.
 */
export async function fetchBotQuip(
  payload: BotQuipPayload,
  signal?: AbortSignal
): Promise<string> {
  const response = await fetch('/api/bot-quip', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
    signal,
  });

  let data: { quip?: string; error?: string } = {};
  try {
    data = (await response.json()) as { quip?: string; error?: string };
  } catch {
    // Non-JSON upstream error
  }

  if (!response.ok) {
    throw new Error(
      data.error || `Lỗi kết nối máy chủ bình luận (${response.status}).`
    );
  }

  const quip = (data.quip ?? '').trim();
  if (!quip) {
    throw new Error('Phản hồi bình luận rỗng.');
  }
  return quip;
}
