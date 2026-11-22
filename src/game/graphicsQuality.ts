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
