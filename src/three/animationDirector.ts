import gsap from 'gsap';
import { GraphicsQualityTier } from '../game/types';
import { AnimationCategory } from './animationEventBus';

let gsapDetached = false;

function ensureGsapTickerAsleep(): void {
  gsap.ticker.sleep();
}

/**
 * Permanently detaches GSAP's root clock from requestAnimationFrame / setTimeout.
 * Visual timelines are stepped manually inside MonopolyCanvas's single
 * `createBoardFrameScheduler` loop using `visualAnimDt * speedMultiplier` so Low-tier
 * idle stays strictly at 0 FPS and pauses freeze deterministically.
 */
export function detachGsapFromGlobalTicker(): void {
  if (!gsapDetached) {
    gsapDetached = true;
    gsap.ticker.remove(gsap.updateRoot);
    gsap.ticker.lagSmoothing(0);
  }
  ensureGsapTickerAsleep();
}

export function isGsapDetachedFromGlobalTicker(): boolean {
  return gsapDetached;
}

detachGsapFromGlobalTicker();

export function readPrefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false;
  }
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

export function subscribePrefersReducedMotion(
  onChange: (reduced: boolean) => void
): () => void {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return () => {};
  }
  try {
    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const handler = (event: MediaQueryListEvent) => {
      onChange(Boolean(event.matches));
    };
    onChange(Boolean(mediaQuery.matches));
    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', handler);
      return () => {
        mediaQuery.removeEventListener('change', handler);
      };
    }
    const legacy = mediaQuery as unknown as {
      addListener?: (cb: (e: MediaQueryListEvent) => void) => void;
      removeListener?: (cb: (e: MediaQueryListEvent) => void) => void;
    };
    if (typeof legacy.addListener === 'function') {
      legacy.addListener(handler);
      return () => {
        legacy.removeListener?.(handler);
      };
    }
    return () => {};
  } catch {
    return () => {};
  }
}

export interface ManagedVisualTimeline {
  readonly id: string;
  readonly category: AnimationCategory;
  /** True when active frames should keep rendering even while Low tier would otherwise sleep. */
  readonly blocksIdleSleep: boolean;
  /** Advance visual state by `scaledVisualDtSec`. Returns false once finished. */
  advance: (scaledVisualDtSec: number) => boolean;
  /** Jump cleanly to final pose on Reset, Context Restore, or Online resync. */
  fastForwardToEnd: () => void;
  /** Abort immediately and clean up without firing completion callbacks. */
  cancel: () => void;
}

export interface ManagedMixerLike {
  update: (deltaSeconds: number) => void;
  stopAllAction: () => void;
}

export interface ManagedMixerEntry {
  readonly id: string;
  readonly category: AnimationCategory;
  readonly mixer: ManagedMixerLike;
  isActive: () => boolean;
  blocksIdleSleep: () => boolean;
}

export interface AnimationStepContext {
  isPaused: boolean;
  speedMultiplier: number;
  reducedMotion: boolean;
  qualityTier: GraphicsQualityTier;
}

export interface ManagedGsapTimelineOptions {
  id: string;
  category: AnimationCategory;
  blocksIdleSleep?: boolean;
  timeline?: gsap.core.Timeline;
  build?: (tl: gsap.core.Timeline) => void;
  onComplete?: () => void;
  onCancel?: () => void;
}

/**
 * Wraps a `gsap.timeline({ paused: true })` into a manually stepped timeline
 * driven strictly by `visualAnimDt`, keeping GSAP's global ticker asleep.
 */
export function createManagedGsapTimeline(
  options: ManagedGsapTimelineOptions
): ManagedVisualTimeline {
  detachGsapFromGlobalTicker();

  const tl = options.timeline ?? gsap.timeline({ paused: true });
  tl.pause(0, true);
  if (options.build) {
    options.build(tl);
  }
  ensureGsapTickerAsleep();

  let elapsedSec = 0;
  let settled = false;

  const finalizeComplete = (): void => {
    if (settled) return;
    settled = true;
    try {
      options.onComplete?.();
    } finally {
      tl.kill();
      ensureGsapTickerAsleep();
    }
  };

  const advance = (scaledVisualDtSec: number): boolean => {
    if (settled) return false;
    const duration = tl.totalDuration();
    if (!Number.isFinite(duration) || duration <= 0) {
      tl.progress(1, false);
      finalizeComplete();
      return false;
    }
    if (!Number.isFinite(scaledVisualDtSec) || scaledVisualDtSec <= 0) {
      return true;
    }

    elapsedSec += scaledVisualDtSec;
    const clampedTime = Math.min(elapsedSec, duration);
    tl.totalTime(clampedTime, false);
    ensureGsapTickerAsleep();

    if (elapsedSec >= duration) {
      finalizeComplete();
      return false;
    }
    return true;
  };

  const fastForwardToEnd = (): void => {
    if (settled) return;
    tl.progress(1, false);
    finalizeComplete();
  };

  const cancel = (): void => {
    if (settled) return;
    settled = true;
    tl.kill();
    ensureGsapTickerAsleep();
    options.onCancel?.();
  };

  return {
    id: options.id,
    category: options.category,
    blocksIdleSleep: options.blocksIdleSleep ?? true,
    advance,
    fastForwardToEnd,
    cancel,
  };
}

export interface AnimationDirector {
  register: (
    timeline: ManagedVisualTimeline,
    replaceMode?: 'fastForward' | 'cancel'
  ) => void;
  registerMixer: (entry: ManagedMixerEntry) => void;
  unregisterMixer: (id: string) => void;
  step: (visualAnimDtSec: number, ctx: AnimationStepContext) => boolean;
  hasBlockingVisualAnimations: () => boolean;
  getActiveCount: (category?: AnimationCategory) => number;
  fastForwardAll: (category?: AnimationCategory) => void;
  cancelCategory: (category: AnimationCategory) => void;
  cancelAll: () => void;
  dispose: () => void;
}

/**
 * Coordinates all paused GSAP visual timelines and `THREE.AnimationMixer` instances
 * inside `MonopolyCanvas`'s single RAF scheduler.
 */
export function createAnimationDirector(): AnimationDirector {
  detachGsapFromGlobalTicker();

  const timelines = new Map<string, ManagedVisualTimeline>();
  const mixers = new Map<string, ManagedMixerEntry>();
  let disposed = false;

  const hasBlockingVisualAnimations = (): boolean => {
    for (const tl of timelines.values()) {
      if (tl.blocksIdleSleep) return true;
    }
    for (const entry of mixers.values()) {
      if (entry.isActive() && entry.blocksIdleSleep()) return true;
    }
    return false;
  };

  const register = (
    timeline: ManagedVisualTimeline,
    replaceMode: 'fastForward' | 'cancel' = 'fastForward'
  ): void => {
    if (disposed) {
      timeline.cancel();
      return;
    }
    const existing = timelines.get(timeline.id);
    if (existing) {
      timelines.delete(timeline.id);
      if (replaceMode === 'fastForward') {
        existing.fastForwardToEnd();
      } else {
        existing.cancel();
      }
    }
    if (disposed) {
      timeline.cancel();
      return;
    }
    timelines.set(timeline.id, timeline);
  };

  const registerMixer = (entry: ManagedMixerEntry): void => {
    if (disposed) return;
    const prev = mixers.get(entry.id);
    if (prev && prev !== entry) {
      prev.mixer.stopAllAction();
    }
    mixers.set(entry.id, entry);
  };

  const unregisterMixer = (id: string): void => {
    const existing = mixers.get(id);
    if (existing) {
      existing.mixer.stopAllAction();
      mixers.delete(id);
    }
  };

  const step = (visualAnimDtSec: number, ctx: AnimationStepContext): boolean => {
    if (disposed || ctx.isPaused) {
      return false;
    }

    const safeDt = Number.isFinite(visualAnimDtSec) ? Math.max(0, visualAnimDtSec) : 0;
    const safeSpeed = Number.isFinite(ctx.speedMultiplier)
      ? Math.max(0.25, ctx.speedMultiplier)
      : 1;
    const scaledDt = safeDt * safeSpeed;

    const timelineSnapshot = Array.from(timelines.entries());
    for (const [id, timeline] of timelineSnapshot) {
      if (timelines.get(id) !== timeline) continue;
      const keepAlive = timeline.advance(scaledDt);
      if (!keepAlive && timelines.get(id) === timeline) {
        timelines.delete(id);
      }
    }

    const mixerSnapshot = Array.from(mixers.values());
    for (const entry of mixerSnapshot) {
      if (entry.isActive()) {
        entry.mixer.update(scaledDt);
      }
    }

    return hasBlockingVisualAnimations();
  };

  const getActiveCount = (category?: AnimationCategory): number => {
    if (!category) return timelines.size;
    let count = 0;
    for (const tl of timelines.values()) {
      if (tl.category === category) count += 1;
    }
    return count;
  };

  const fastForwardAll = (category?: AnimationCategory): void => {
    const snapshot = Array.from(timelines.entries());
    for (const [id, tl] of snapshot) {
      if (category && tl.category !== category) continue;
      if (timelines.get(id) === tl) {
        timelines.delete(id);
        tl.fastForwardToEnd();
      }
    }
  };

  const cancelCategory = (category: AnimationCategory): void => {
    const snapshot = Array.from(timelines.entries());
    for (const [id, tl] of snapshot) {
      if (tl.category !== category) continue;
      if (timelines.get(id) === tl) {
        timelines.delete(id);
        tl.cancel();
      }
    }
  };

  const cancelAll = (): void => {
    const snapshot = Array.from(timelines.entries());
    timelines.clear();
    for (const [, tl] of snapshot) {
      tl.cancel();
    }
  };

  const dispose = (): void => {
    if (disposed) return;
    disposed = true;
    cancelAll();
    for (const entry of mixers.values()) {
      entry.mixer.stopAllAction();
    }
    mixers.clear();
    ensureGsapTickerAsleep();
  };

  return {
    register,
    registerMixer,
    unregisterMixer,
    step,
    hasBlockingVisualAnimations,
    getActiveCount,
    fastForwardAll,
    cancelCategory,
    cancelAll,
    dispose,
  };
}

export interface AnimationRegistryEntry<P = unknown> {
  readonly animId: string;
  readonly category: AnimationCategory;
  create: (params: P) => ManagedVisualTimeline | null;
}

export interface AnimationRegistry {
  register: <P>(entry: AnimationRegistryEntry<P>) => void;
  has: (animId: string) => boolean;
  create: <P>(animId: string, params: P) => ManagedVisualTimeline | null;
  listIds: () => string[];
}

export function createAnimationRegistry(): AnimationRegistry {
  const entries = new Map<string, AnimationRegistryEntry<unknown>>();

  return {
    register: <P>(entry: AnimationRegistryEntry<P>) => {
      entries.set(entry.animId, entry as AnimationRegistryEntry<unknown>);
    },
    has: (animId: string) => entries.has(animId),
    create: <P>(animId: string, params: P) => {
      const entry = entries.get(animId);
      return entry ? entry.create(params) : null;
    },
    listIds: () => Array.from(entries.keys()),
  };
}
