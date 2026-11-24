export interface MonotonicCountdownAdvanceResult {
  remainingSeconds: number;
  wholeSecondsConsumed: number;
  changed: boolean;
}

export interface MonotonicCountdownClock {
  /** Resets remaining seconds and clears accumulated sub-second remainder. */
  reset: (seconds: number, nowMs: number) => number;
  /**
   * Ensures remaining seconds is at least `minSeconds`; clears carry only if raised.
   * When `wasActive` is true, advances active elapsed time up to `nowMs` first so sub-second
   * progress is preserved instead of dropped; when false, syncs `lastNowMs` without losing carry.
   */
  ensureFloor: (minSeconds: number, nowMs: number, wasActive?: boolean) => number;
  /** Updates baseline timestamp without consuming elapsed time (e.g. on Pause/Resume). */
  syncTimestamp: (nowMs: number) => void;
  /** Advances clock monotonically using `nowMs` (e.g. `performance.now()`). */
  advance: (nowMs: number, active: boolean) => MonotonicCountdownAdvanceResult;
  getRemainingSeconds: () => number;
  getCarryMs: () => number;
}

/**
 * Drift-free monotonic countdown clock driven by `performance.now()` deltas.
 * Preserves fractional millisecond carry across phase transitions, animation pauses,
 * PauseModal pauses, low FPS, and browser timer throttling.
 */
export function createMonotonicCountdownClock(
  initialSeconds: number,
  initialNowMs: number
): MonotonicCountdownClock {
  let remainingSeconds = Math.max(0, Math.floor(initialSeconds));
  let carryMs = 0;
  let lastNowMs = Number.isFinite(initialNowMs) ? initialNowMs : 0;

  const reset = (seconds: number, nowMs: number): number => {
    remainingSeconds = Math.max(0, Math.floor(seconds));
    carryMs = 0;
    if (Number.isFinite(nowMs)) {
      lastNowMs = nowMs;
    }
    return remainingSeconds;
  };

  const ensureFloor = (minSeconds: number, nowMs: number, wasActive = false): number => {
    advance(nowMs, wasActive);
    const floor = Math.max(0, Math.floor(minSeconds));
    if (remainingSeconds < floor) {
      remainingSeconds = floor;
      carryMs = 0;
    }
    return remainingSeconds;
  };

  const syncTimestamp = (nowMs: number): void => {
    if (Number.isFinite(nowMs)) {
      lastNowMs = nowMs;
    }
  };

  const advance = (nowMs: number, active: boolean): MonotonicCountdownAdvanceResult => {
    const safeNow = Number.isFinite(nowMs) ? nowMs : lastNowMs;
    const deltaMs = Math.max(0, safeNow - lastNowMs);
    lastNowMs = safeNow;

    if (!active || remainingSeconds <= 0) {
      if (remainingSeconds <= 0) {
        carryMs = 0;
      }
      return {
        remainingSeconds,
        wholeSecondsConsumed: 0,
        changed: false,
      };
    }

    carryMs += deltaMs;
    const wholeSeconds = Math.floor(carryMs / 1000);
    if (wholeSeconds <= 0) {
      return {
        remainingSeconds,
        wholeSecondsConsumed: 0,
        changed: false,
      };
    }

    const prev = remainingSeconds;
    const next = Math.max(0, prev - wholeSeconds);
    const consumed = prev - next;
    remainingSeconds = next;
    carryMs = next === 0 ? 0 : carryMs - wholeSeconds * 1000;

    return {
      remainingSeconds,
      wholeSecondsConsumed: consumed,
      changed: next !== prev,
    };
  };

  return {
    reset,
    ensureFloor,
    syncTimestamp,
    advance,
    getRemainingSeconds: () => remainingSeconds,
    getCarryMs: () => carryMs,
  };
}
