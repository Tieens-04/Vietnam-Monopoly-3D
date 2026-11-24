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

export interface MonotonicBeatAdvanceResult {
  done: boolean;
  elapsedMs: number;
  remainingMs: number;
}

export interface MonotonicBeatTracker {
  advance: (nowMs: number, active: boolean) => MonotonicBeatAdvanceResult;
  getElapsedMs: () => number;
}

/**
 * Tracks a short gameplay beat using monotonic wall-clock deltas so Chrome's
 * 1 Hz background-tab timer throttling completes in a single tick instead of
 * stretching fixed `60ms` decrements across ~10.5 seconds, while still freezing
 * completely whenever paused (`active === false`).
 */
export function createMonotonicBeatTracker(
  targetMs: number,
  initialNowMs: number
): MonotonicBeatTracker {
  const safeTargetMs = Number.isFinite(targetMs) ? Math.max(0, targetMs) : 0;
  let elapsedMs = 0;
  let lastNowMs = Number.isFinite(initialNowMs) ? initialNowMs : 0;

  const advance = (nowMs: number, active: boolean): MonotonicBeatAdvanceResult => {
    const safeNow = Number.isFinite(nowMs) ? nowMs : lastNowMs;
    const deltaMs = Math.max(0, safeNow - lastNowMs);
    lastNowMs = safeNow;
    if (active) {
      elapsedMs += deltaMs;
    }
    return {
      done: elapsedMs >= safeTargetMs,
      elapsedMs,
      remainingMs: Math.max(0, safeTargetMs - elapsedMs),
    };
  };

  return {
    advance,
    getElapsedMs: () => elapsedMs,
  };
}

export interface WaitMonotonicBeatOptions {
  targetMs: number;
  pollMs?: number;
  isCancelled: () => boolean;
  isActive: () => boolean;
  now?: () => number;
  setTimer?: (cb: () => void, ms: number) => number;
}

/**
 * Pause-aware monotonic beat waiter. Resolves `true` once `targetMs` of active
 * wall-clock time has accumulated, or `false` if cancelled by an epoch reset.
 */
export function waitMonotonicBeat(options: WaitMonotonicBeatOptions): Promise<boolean> {
  const nowFn =
    options.now ??
    (() => (typeof performance !== 'undefined' ? performance.now() : Date.now()));
  const setTimerFn =
    options.setTimer ??
    ((cb: () => void, ms: number) => window.setTimeout(cb, ms));
  const pollMs = Math.max(16, options.pollMs ?? 60);
  const tracker = createMonotonicBeatTracker(options.targetMs, nowFn());

  if (options.isCancelled()) {
    return Promise.resolve(false);
  }
  if (options.targetMs <= 0 && options.isActive()) {
    return Promise.resolve(true);
  }

  return new Promise((resolve) => {
    const scheduleNext = (delayMs: number) => {
      setTimerFn(() => {
        if (options.isCancelled()) {
          resolve(false);
          return;
        }
        const step = tracker.advance(nowFn(), options.isActive());
        if (step.done) {
          resolve(true);
          return;
        }
        const nextDelay = options.isActive()
          ? Math.min(pollMs, Math.max(16, Math.ceil(step.remainingMs)))
          : pollMs;
        scheduleNext(nextDelay);
      }, delayMs);
    };

    const initialDelay = options.isActive()
      ? Math.min(pollMs, Math.max(16, Math.ceil(options.targetMs)))
      : pollMs;
    scheduleNext(initialDelay);
  });
}
