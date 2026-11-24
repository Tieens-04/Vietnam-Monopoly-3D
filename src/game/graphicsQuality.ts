import { GraphicsQualityPref, GraphicsQualityTier } from './types';

export const GRAPHICS_QUALITY_STORAGE_KEY = 'bt_vn_graphics_quality';

export interface DetectedGpuInfo {
  tier: GraphicsQualityTier;
  isSoftwareGl: boolean;
  label: string;
  rawRenderer: string;
}

export interface GraphicsQualityProfile {
  tier: GraphicsQualityTier;
  maxPixelRatio: number;
  antialias: boolean;
  usePostProcessing: boolean;
  shadowsEnabled: boolean;
  shadowMapSize: number;
  useEnvironmentMap: boolean;
  usePhysicalClearcoat: boolean;
  animateAmbientProps: boolean;
  idleBoardFps: number;
  activeBoardFps: number;
  avatarFps: number;
  avatarPixelSize: number;
}

export interface BoardAnimationActivityInput {
  isDocumentHidden: boolean;
  isBoardOccluded: boolean;
  hasActiveMotion: boolean;
  hasPendingGameplayPromises?: boolean;
  idleBoardFps: number;
}

export interface BoardFrameScheduleDecision {
  mode: 'stop' | 'interval' | 'raf' | 'background_sim';
  intervalMs: number;
}

export interface BoardFrameDeltas {
  /** Clamped ambient/physics simulation delta for smooth visual motion. */
  simDt: number;
  /** Clamped visual interpolation delta (camera, lighting, springs, particles, treasury). */
  visualAnimDt: number;
  /**
   * Decoupled gameplay animation delta driving deterministic dice & token-hop Promises.
   * Tracks real wall time even under low FPS or OS-throttled RAF, freezes to 0 when paused,
   * and caps the first post-resume frame to avoid pause-gap jumps.
   */
  gameplayAnimDt: number;
}

export interface BoardFrameSchedulerOptions {
  isSoftwareGl: boolean;
  now?: () => number;
  isDocumentHidden: () => boolean;
  hasPendingGameplayPromises: () => boolean;
  /**
   * Watchdog fallback delay (ms) used ONLY when `hasPendingGameplayPromises()` is true
   * and RAF stalls (e.g. OS-suspended/1 Hz occluded window with `document.hidden === false`).
   * Default: 500ms (> 400ms @ 2.5 FPS + vsync jitter so 60/30/15/5/2.5 FPS stay 100% pure RAF
   * without off-vsync GPU pile-up, while 0–1 Hz stalled windows still complete promptly at 2 Hz).
   */
  rafFallbackMs?: number;
  requestRaf?: (cb: () => void) => number;
  cancelRaf?: (id: number) => void;
  setTimer?: (cb: () => void, ms: number) => number;
  clearTimer?: (id: number) => void;
  afterSoftwareDraw?: (
    scheduleTimeout: (cb: () => void, ms: number) => void,
    runNextTick: () => void
  ) => (() => void) | void;
  onMarkBackdropDirty?: () => void;
  onFrame: (rawDtSec: number) => BoardFrameScheduleDecision;
}

export interface BoardFrameScheduler {
  requestRender: (markBackdropDirty?: boolean) => void;
  runImmediateTick: () => void;
  handleVisibilityChange: () => void;
  cancel: () => void;
  dispose: () => void;
}

export interface GraphicsQualityOptionMeta {
  id: GraphicsQualityPref;
  shortLabel: string;
  title: string;
  subtitle: string;
}

export const GRAPHICS_QUALITY_OPTIONS: GraphicsQualityOptionMeta[] = [
  {
    id: 'auto',
    shortLabel: 'Tự động',
    title: 'Tự động theo phần cứng',
    subtitle: 'Tự nhận diện Card Onboard để chạy nhẹ nhất, hoặc bật mức Cao nếu có GPU rời.',
  },
  {
    id: 'low',
    shortLabel: 'Thấp',
    title: 'Mượt & Mát máy (Card Onboard)',
    subtitle: 'Chữ sắc nét 100%, tắt hậu kỳ nặng & nghỉ 0% GPU khi bàn cờ đứng yên.',
  },
  {
    id: 'medium',
    shortLabel: 'Vừa',
    title: 'Cân bằng Đẹp & Mượt',
    subtitle: 'Bóng đổ thông minh 1024px chỉ cập nhật khi di chuyển, hạ nhịp 20 FPS lúc nghỉ.',
  },
  {
    id: 'high',
    shortLabel: 'Cao',
    title: 'Đồ họa Tối đa (GPU Rời)',
    subtitle: 'Đầy đủ bóng âm GTAO, ánh sáng Bloom ban đêm, mặt phủ Clearcoat & 60 FPS.',
  },
];

export const GRAPHICS_TIER_LABELS: Record<GraphicsQualityTier, string> = {
  low: 'Thấp',
  medium: 'Vừa',
  high: 'Cao',
};

const SOFTWARE_GL_REGEX =
  /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i;

const EXPLICIT_INTEGRATED_REGEX =
  /Integrated|UHD|HD\s*Graphics|Iris|Radeon\(TM\)\s*(Vega\s*\d*\s*)?Graphics|Vega\s*\d|Adreno|Mali|PowerVR|VideoCore|Intel\(R\)\s*(HD|UHD|Iris|Graphics)/i;

const DEDICATED_GPU_REGEX =
  /NVIDIA|GeForce|RTX|GTX|Quadro|Titan|Radeon\s*RX|Radeon\s*Pro|Radeon\s*VII|Arc\s*A\d|Apple\s*M\d\s*(Pro|Max|Ultra)/i;

export function classifyGpuRenderer(rendererString: string): DetectedGpuInfo {
  const trimmed = (rendererString || '').trim();

  if (SOFTWARE_GL_REGEX.test(trimmed)) {
    return {
      tier: 'low',
      isSoftwareGl: true,
      label: 'GPU Phần mềm',
      rawRenderer: trimmed,
    };
  }

  if (
    trimmed.length > 0 &&
    !EXPLICIT_INTEGRATED_REGEX.test(trimmed) &&
    DEDICATED_GPU_REGEX.test(trimmed)
  ) {
    return {
      tier: 'high',
      isSoftwareGl: false,
      label: 'GPU Rời',
      rawRenderer: trimmed,
    };
  }

  return {
    tier: 'low',
    isSoftwareGl: false,
    label: 'Card Onboard',
    rawRenderer: trimmed || 'WebGL Generic',
  };
}

let cachedDetectedGpu: DetectedGpuInfo | null = null;

export function detectBrowserGpu(): DetectedGpuInfo {
  if (cachedDetectedGpu) return cachedDetectedGpu;
  if (typeof document === 'undefined') {
    cachedDetectedGpu = {
      tier: 'low',
      isSoftwareGl: false,
      label: 'Card Onboard',
      rawRenderer: 'SSR',
    };
    return cachedDetectedGpu;
  }

  try {
    const probe = document.createElement('canvas');
    const gl =
      probe.getContext('webgl2') ||
      probe.getContext('webgl') ||
      (probe.getContext('experimental-webgl') as WebGLRenderingContext | null);
    if (!gl) {
      cachedDetectedGpu = {
        tier: 'low',
        isSoftwareGl: true,
        label: 'GPU Phần mềm',
        rawRenderer: 'No WebGL',
      };
      return cachedDetectedGpu;
    }

    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    const rawRenderer = String(
      gl.getParameter(dbg ? dbg.UNMASKED_RENDERER_WEBGL : gl.RENDERER) || ''
    );
    gl.getExtension('WEBGL_lose_context')?.loseContext();

    cachedDetectedGpu = classifyGpuRenderer(rawRenderer);
    return cachedDetectedGpu;
  } catch {
    cachedDetectedGpu = {
      tier: 'low',
      isSoftwareGl: false,
      label: 'Card Onboard',
      rawRenderer: 'Probe Error',
    };
    return cachedDetectedGpu;
  }
}

export function resolveEffectiveGraphicsTier(
  pref: GraphicsQualityPref,
  detected: DetectedGpuInfo
): GraphicsQualityTier {
  if (pref === 'auto') {
    return detected.tier;
  }
  return pref;
}

export function resolveGraphicsProfile(
  tier: GraphicsQualityTier,
  isSoftwareGl = false
): GraphicsQualityProfile {
  if (isSoftwareGl) {
    return {
      tier,
      maxPixelRatio: 1.0,
      antialias: false,
      usePostProcessing: false,
      shadowsEnabled: false,
      shadowMapSize: 0,
      useEnvironmentMap: false,
      usePhysicalClearcoat: false,
      animateAmbientProps: false,
      idleBoardFps: 0,
      activeBoardFps: 30,
      avatarFps: 0,
      avatarPixelSize: 144,
    };
  }

  if (tier === 'low') {
    return {
      tier: 'low',
      maxPixelRatio: 1.0,
      antialias: false,
      usePostProcessing: false,
      shadowsEnabled: false,
      shadowMapSize: 0,
      useEnvironmentMap: false,
      usePhysicalClearcoat: false,
      animateAmbientProps: false,
      idleBoardFps: 0,
      activeBoardFps: 60,
      avatarFps: 0,
      avatarPixelSize: 160,
    };
  }

  if (tier === 'medium') {
    return {
      tier: 'medium',
      maxPixelRatio: 1.25,
      antialias: true,
      usePostProcessing: false,
      shadowsEnabled: true,
      shadowMapSize: 1024,
      useEnvironmentMap: true,
      usePhysicalClearcoat: false,
      animateAmbientProps: true,
      idleBoardFps: 20,
      activeBoardFps: 60,
      avatarFps: 15,
      avatarPixelSize: 192,
    };
  }

  return {
    tier: 'high',
    maxPixelRatio: 1.75,
    antialias: true,
    usePostProcessing: true,
    shadowsEnabled: true,
    shadowMapSize: 2048,
    useEnvironmentMap: true,
    usePhysicalClearcoat: true,
    animateAmbientProps: true,
    idleBoardFps: 60,
    activeBoardFps: 60,
    avatarFps: 30,
    avatarPixelSize: 256,
  };
}

export function shouldKeepBoardAnimating(
  input: BoardAnimationActivityInput
): { mode: 'stop' | 'interval' | 'raf' | 'background_sim'; intervalMs: number } {
  if (input.isDocumentHidden || input.isBoardOccluded) {
    if (input.hasPendingGameplayPromises) {
      return { mode: 'background_sim', intervalMs: 80 };
    }
    return { mode: 'stop', intervalMs: 0 };
  }

  if (input.hasActiveMotion) {
    return { mode: 'raf', intervalMs: 0 };
  }

  if (input.idleBoardFps <= 0) {
    return { mode: 'stop', intervalMs: 0 };
  }

  if (input.idleBoardFps >= 55) {
    return { mode: 'raf', intervalMs: 0 };
  }

  return {
    mode: 'interval',
    intervalMs: Math.max(16, Math.round(1000 / input.idleBoardFps)),
  };
}

/**
 * Separates Gameplay Animation Time (`gameplayAnimDt`) from Visual Animation Time (`visualAnimDt`).
 * - Visual interpolations stay clamped (`<= 0.06s` hardware / `<= 0.35s` software) so springs & camera never explode.
 * - Gameplay promises track real monotonic elapsed time (`<= 10s` hibernate safety cap) so dice & token hops
 *   finish in designed wall-clock time at 60, 30, 15, 5, and 2.5 FPS without slow-motion stretch.
 * - Pause zeroes all deltas; the first frame after Resume caps delta to `0.05s` so pause time never leaks in.
 */
export function computeBoardFrameDeltas(input: {
  rawDtSec: number;
  isPaused: boolean;
  wasPausedPrevFrame: boolean;
  isDocumentHidden: boolean;
  isSoftwareGl: boolean;
}): BoardFrameDeltas {
  if (input.isPaused) {
    return { simDt: 0, visualAnimDt: 0, gameplayAnimDt: 0 };
  }
  const safeRaw = Number.isFinite(input.rawDtSec) ? Math.max(0, input.rawDtSec) : 0;
  const effectiveRaw = input.wasPausedPrevFrame ? Math.min(safeRaw, 0.05) : safeRaw;
  const simDt = Math.min(effectiveRaw, 0.08);
  const visualAnimDt = input.isDocumentHidden
    ? Math.min(effectiveRaw, 2.0)
    : Math.min(effectiveRaw, input.isSoftwareGl ? 0.35 : 0.06);
  const gameplayAnimDt = Math.min(effectiveRaw, 10.0);
  return { simDt, visualAnimDt, gameplayAnimDt };
}

/**
 * Single-flight WebGL frame scheduler that guarantees at most ONE pending RAF or timer
 * exists at any moment — even when `OrbitControls.update()` synchronously dispatches
 * `'change'` -> `requestRender()` from inside `onFrame()`.
 *
 * When `hasPendingGameplayPromises()` is true, arms a mutually-exclusive RAF watchdog timer
 * (`rafFallbackMs`, default 500ms) sharing a monotonic `scheduleToken` so stalled/occluded
 * windows complete gameplay animations on time with zero duplicate ticks and zero idle overhead.
 */
export function createBoardFrameScheduler(
  options: BoardFrameSchedulerOptions
): BoardFrameScheduler {
  const nowFn = options.now ?? (() => performance.now());
  const rafFallbackMs = options.rafFallbackMs ?? 500;
  const requestRafFn =
    options.requestRaf ?? ((cb: () => void) => window.requestAnimationFrame(cb));
  const cancelRafFn =
    options.cancelRaf ?? ((id: number) => window.cancelAnimationFrame(id));
  const setTimerFn =
    options.setTimer ?? ((cb: () => void, ms: number) => window.setTimeout(cb, ms));
  const clearTimerFn =
    options.clearTimer ?? ((id: number) => window.clearTimeout(id));

  let disposed = false;
  let isTickRunning = false;
  let dirtyWakeDuringTick = false;
  let scheduledMode: 'none' | 'raf' | 'timeout' = 'none';
  let frameId = 0;
  let rafFallbackTimerId = 0;
  let scheduleToken = 0;
  let cleanupSoftwareSync: (() => void) | null = null;
  let lastTimeMs = nowFn();

  const clearRafFallback = (): void => {
    if (rafFallbackTimerId !== 0) {
      clearTimerFn(rafFallbackTimerId);
      rafFallbackTimerId = 0;
    }
  };

  const cancel = (): void => {
    scheduleToken += 1;
    if (scheduledMode === 'raf') {
      cancelRafFn(frameId);
    } else if (scheduledMode === 'timeout') {
      clearTimerFn(frameId);
    }
    clearRafFallback();
    scheduledMode = 'none';
    frameId = 0;
    if (cleanupSoftwareSync) {
      const fn = cleanupSoftwareSync;
      cleanupSoftwareSync = null;
      fn();
    }
  };

  const armRafFallbackIfNeeded = (token: number): void => {
    if (disposed || rafFallbackTimerId !== 0 || !options.hasPendingGameplayPromises()) {
      return;
    }
    rafFallbackTimerId = setTimerFn(() => {
      rafFallbackTimerId = 0;
      if (disposed || token !== scheduleToken) return;
      tick();
    }, rafFallbackMs);
  };

  const scheduleRaf = (): void => {
    if (disposed) return;
    if (scheduledMode === 'raf') {
      armRafFallbackIfNeeded(scheduleToken);
      return;
    }
    if (scheduledMode !== 'none') {
      cancel();
    }
    const token = ++scheduleToken;
    scheduledMode = 'raf';
    frameId = requestRafFn(() => {
      if (disposed || token !== scheduleToken) return;
      tick();
    });
    armRafFallbackIfNeeded(token);
  };

  const scheduleTimeout = (cb: () => void, ms: number): void => {
    if (disposed) return;
    if (scheduledMode !== 'none') {
      cancel();
    }
    const token = ++scheduleToken;
    scheduledMode = 'timeout';
    frameId = setTimerFn(() => {
      if (disposed || token !== scheduleToken) return;
      cb();
    }, ms);
  };

  const tick = (): void => {
    if (disposed || isTickRunning) return;
    cancel();
    isTickRunning = true;
    dirtyWakeDuringTick = false;

    const currentMs = nowFn();
    const rawDtSec = Math.max(0.001, (currentMs - lastTimeMs) / 1000);
    lastTimeMs = currentMs;

    let decision: BoardFrameScheduleDecision;
    try {
      decision = options.onFrame(rawDtSec);
    } finally {
      isTickRunning = false;
    }

    if (disposed) return;

    if (decision.mode === 'stop' && !dirtyWakeDuringTick) {
      return;
    }
    if (decision.mode === 'interval' || decision.mode === 'background_sim') {
      scheduleTimeout(tick, decision.intervalMs);
      return;
    }
    if (options.isSoftwareGl) {
      if (options.afterSoftwareDraw) {
        const maybeCleanup = options.afterSoftwareDraw(scheduleTimeout, tick);
        if (typeof maybeCleanup === 'function') {
          cleanupSoftwareSync = maybeCleanup;
        }
      } else {
        scheduleTimeout(tick, 33);
      }
      return;
    }
    scheduleRaf();
  };

  const requestRender = (markBackdropDirty = false): void => {
    if (disposed) return;
    if (markBackdropDirty) {
      options.onMarkBackdropDirty?.();
    }
    if (isTickRunning) {
      if (markBackdropDirty) {
        dirtyWakeDuringTick = true;
      }
      return;
    }
    if (options.isDocumentHidden()) {
      if (options.hasPendingGameplayPromises()) {
        if (scheduledMode !== 'timeout') {
          if (scheduledMode === 'none') {
            lastTimeMs = nowFn() - 16;
          }
          scheduleTimeout(tick, 80);
        }
      } else {
        cancel();
      }
      return;
    }
    if (scheduledMode === 'raf') {
      armRafFallbackIfNeeded(scheduleToken);
      return;
    }
    if (scheduledMode === 'none') {
      lastTimeMs = nowFn() - 16;
    }
    if (options.isSoftwareGl) {
      if (scheduledMode !== 'timeout') {
        scheduleTimeout(tick, 16);
      }
    } else {
      scheduleRaf();
    }
  };

  const handleVisibilityChange = (): void => {
    if (disposed) return;
    if (options.isDocumentHidden()) {
      const wasIdle = scheduledMode === 'none';
      cancel();
      if (options.hasPendingGameplayPromises()) {
        if (wasIdle) {
          lastTimeMs = nowFn() - 16;
        }
        scheduleTimeout(tick, 80);
      }
    } else {
      requestRender(true);
    }
  };

  const dispose = (): void => {
    disposed = true;
    cancel();
  };

  return {
    requestRender,
    runImmediateTick: tick,
    handleVisibilityChange,
    cancel,
    dispose,
  };
}

function isValidGraphicsPref(val: unknown): val is GraphicsQualityPref {
  return val === 'auto' || val === 'low' || val === 'medium' || val === 'high';
}

export function loadSavedGraphicsQualityPref(
  storage?: Pick<Storage, 'getItem'> | null
): GraphicsQualityPref {
  const target =
    storage !== undefined
      ? storage
      : typeof window !== 'undefined'
        ? window.localStorage
        : null;
  if (!target) return 'auto';

  try {
    const raw = target.getItem(GRAPHICS_QUALITY_STORAGE_KEY);
    if (isValidGraphicsPref(raw)) {
      return raw;
    }
  } catch {
    // Ignore restricted localStorage SecurityError
  }
  return 'auto';
}

export function saveGraphicsQualityPref(
  pref: GraphicsQualityPref,
  storage?: Pick<Storage, 'setItem'> | null
): void {
  const target =
    storage !== undefined
      ? storage
      : typeof window !== 'undefined'
        ? window.localStorage
        : null;
  if (!target) return;

  try {
    target.setItem(GRAPHICS_QUALITY_STORAGE_KEY, pref);
  } catch {
    // Ignore storage quota or SecurityError
  }
}
