import { BotQuipPayload } from '../game/types';
import { generateOfflineBotQuip } from '../game/visualTheme';

export interface BotQuipResponse {
  quip: string;
}

const TAB_QUIP_SESSION_ID =
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `tab-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

let localFallbackSeed = 0;

/**
 * Calls our server-side Express proxy `/api/bot-quip` to generate a short, witty
 * Vietnamese remark tailored to the Bot's persona and board event.
 * Gracefully falls back to persona-specific built-in Vietnamese billionaire remarks
 * whenever `GEMINI_API_KEY` is unconfigured or offline, keeping HUD visuals clean.
 */
export async function fetchBotQuip(
  payload: BotQuipPayload,
  signal?: AbortSignal
): Promise<string> {
  try {
    const response = await fetch('/api/bot-quip', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ...payload,
        sessionId: payload.sessionId ?? TAB_QUIP_SESSION_ID,
      }),
      signal,
    });

    if (response.ok) {
      const data = (await response.json()) as { quip?: string };
      const quip = (data.quip ?? '').trim();
      if (quip) {
        return quip;
      }
    }
  } catch (err) {
    if (signal?.aborted) {
      throw err;
    }
  }

  localFallbackSeed = (localFallbackSeed + 1) % 997;
  return generateOfflineBotQuip(payload, localFallbackSeed);
}
