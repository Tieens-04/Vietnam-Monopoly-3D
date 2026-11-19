import { BotChatBubbleState, PlayerSetupConfig, PlayerState } from './types';

export type AvatarArchetypeId = PlayerSetupConfig['tokenType'];

export type AvatarMood =
  | 'idle'
  | 'active'
  | 'celebrating'
  | 'stressed'
  | 'jailed'
  | 'bankrupt';

export interface CharacterPersonaMeta {
  archetype: AvatarArchetypeId;
  personaName: string;
  roleTitle: string;
  tokenLabel: string;
  botDefaultName: string;
  suitHex: number;
  lapelHex: number;
  accentHex: number;
  hairHex: number;
  skinHex: number;
  irisHex: number;
  backdropGradient: [string, string];
  ribbonGradient: [string, string];
}

export const CHARACTER_PERSONAS: Record<AvatarArchetypeId, CharacterPersonaMeta> = {
  car: {
    archetype: 'car',
    personaName: 'CEO Minh Khôi',
    roleTitle: 'Tài Phiệt Công Nghệ · Siêu Xe',
    tokenLabel: 'Tài Phiệt Vàng Kim',
    botDefaultName: 'CEO Minh Khôi',
    suitHex: 0xf5b800,
    lapelHex: 0xd97706,
    accentHex: 0xef4444,
    hairHex: 0x2a1810,
    skinHex: 0xf6c9ac,
    irisHex: 0x291811,
    backdropGradient: ['#fffbeb', '#fcd34d'],
    ribbonGradient: ['#f5b800', '#d97706'],
  },
  yacht: {
    archetype: 'yacht',
    personaName: 'Chủ Tịch Lan Anh',
    roleTitle: 'Nữ Hoàng Nghỉ Dưỡng · Du Thuyền',
    tokenLabel: 'Nữ Hoàng Xanh Cốm',
    botDefaultName: 'Chủ Tịch Lan Anh',
    suitHex: 0x66c61c,
    lapelHex: 0x3f8f0f,
    accentHex: 0xfde047,
    hairHex: 0x1e293b,
    skinHex: 0xfad5be,
    irisHex: 0x1e293b,
    backdropGradient: ['#f7fee7', '#a3e635'],
    ribbonGradient: ['#66c61c', '#4d9c11'],
  },
  jet: {
    archetype: 'jet',
    personaName: 'Shark Hoàng Nam',
    roleTitle: 'Tỷ Phú Hàng Không · Chuyên Cơ',
    tokenLabel: 'Cá Mập Hồng Đậm',
    botDefaultName: 'Shark Hoàng Nam',
    suitHex: 0xe91e63,
    lapelHex: 0xad1457,
    accentHex: 0xfbbf24,
    hairHex: 0x3b2114,
    skinHex: 0xf0be9d,
    irisHex: 0x1e293b,
    backdropGradient: ['#fdf2f8', '#f472b6'],
    ribbonGradient: ['#e91e63', '#be185d'],
  },
  crown: {
    archetype: 'crown',
    personaName: 'Phu Nhân Ngọc Diệp',
    roleTitle: 'Đại Gia Địa Ốc · Vương Miện',
    tokenLabel: 'Quý Tộc Lam Ngọc',
    botDefaultName: 'Phu Nhân Ngọc Diệp',
    suitHex: 0x29b6f6,
    lapelHex: 0x0288d1,
    accentHex: 0xfde047,
    hairHex: 0x5c2314,
    skinHex: 0xf8d1b8,
    irisHex: 0x0369a1,
    backdropGradient: ['#f0f9ff', '#7dd3fc'],
    ribbonGradient: ['#29b6f6', '#0288d1'],
  },
};

export interface DeriveAvatarMoodInput {
  bankrupt: boolean;
  inJail: boolean;
  cash: number;
  isActive: boolean;
  recentCashDelta?: number | null;
  bubble?: BotChatBubbleState;
}

/**
 * Deterministically maps live gameplay state into a stylized Business Tour character mood.
 */
export function deriveAvatarMood(input: DeriveAvatarMoodInput): AvatarMood {
  if (input.bankrupt) return 'bankrupt';
  if (input.inJail) return 'jailed';

  if (
    (typeof input.recentCashDelta === 'number' && input.recentCashDelta >= 40) ||
    (input.bubble?.status === 'ready' &&
      (input.bubble.eventKind === 'BUY_PRIME_LAND' ||
        input.bubble.eventKind === 'COLLECT_BIG_RENT'))
  ) {
    return 'celebrating';
  }

  if (
    (typeof input.recentCashDelta === 'number' && input.recentCashDelta <= -40) ||
    input.cash < 180 ||
    (input.bubble?.status === 'ready' && input.bubble.eventKind === 'PAY_PENALTY')
  ) {
    return 'stressed';
  }

  if (input.isActive || input.bubble?.status === 'loading') {
    return 'active';
  }

  return 'idle';
}

/**
 * Computes a smooth natural blink factor in [0 = open, 1 = closed] staggered by `phaseSeed`
 * so the 4 HUD avatars never blink in robotic unison.
 */
export function computeBlinkFactor(elapsedSec: number, phaseSeed: number): number {
  const period = 3.4 + (Math.abs(phaseSeed) % 3) * 0.55;
  const cyclePos = ((elapsedSec + phaseSeed * 1.37) % period + period) % period;
  const blinkWindow = 0.17;
  if (cyclePos > blinkWindow) return 0;
  const norm = cyclePos / blinkWindow;
  return Math.sin(norm * Math.PI);
}

export interface AvatarPoseTargets {
  headYaw: number;
  headPitch: number;
  headRoll: number;
  torsoYaw: number;
  torsoBobY: number;
  shoulderTiltZ: number;
  browAngle: number;
  browLiftY: number;
  blinkAmount: number;
  smileScale: number;
  propGestureAngle: number;
}

export interface ComputeAvatarPoseInput {
  mood: AvatarMood;
  elapsedSec: number;
  phaseSeed: number;
  /** +1 = left-side HUD card facing slightly right/inward; -1 = right-side HUD card facing slightly left/inward; 0 = centered */
  facingSign?: -1 | 0 | 1;
  /** Normalized cursor offset in [-1, +1] when hovered */
  pointerX?: number;
  pointerY?: number;
}

/**
 * Pure procedural animation curves driving each 3D Business Tour character bust.
 */
export function computeAvatarPoseTargets(input: ComputeAvatarPoseInput): AvatarPoseTargets {
  const {
    mood,
    elapsedSec: t,
    phaseSeed,
    facingSign = 0,
    pointerX = 0,
    pointerY = 0,
  } = input;

  const seedOffset = phaseSeed * 1.91;
  const clampedPX = Math.max(-1, Math.min(1, pointerX));
  const clampedPY = Math.max(-1, Math.min(1, pointerY));

  const inwardYawBias = facingSign * 0.22;
  const hoverYaw = clampedPX * 0.34;
  const hoverPitch = -clampedPY * 0.2;
  const baseBlink = computeBlinkFactor(t, phaseSeed);

  if (mood === 'bankrupt') {
    return {
      headYaw: inwardYawBias * 0.5 + hoverYaw * 0.3,
      headPitch: 0.28 + Math.sin(t * 1.1 + seedOffset) * 0.02,
      headRoll: 0.12 * (facingSign || 1),
      torsoYaw: inwardYawBias * 0.4,
      torsoBobY: -0.05,
      shoulderTiltZ: -0.06,
      browAngle: -0.28,
      browLiftY: -0.015,
      blinkAmount: Math.max(0.65, baseBlink),
      smileScale: -0.6,
      propGestureAngle: -0.22,
    };
  }

  if (mood === 'jailed') {
    return {
      headYaw: inwardYawBias + Math.sin(t * 3.6 + seedOffset) * 0.16 + hoverYaw * 0.5,
      headPitch: 0.1 + hoverPitch * 0.5,
      headRoll: Math.sin(t * 1.8 + seedOffset) * 0.06,
      torsoYaw: inwardYawBias * 0.65,
      torsoBobY: Math.sin(t * 2.0 + seedOffset) * 0.012 - 0.015,
      shoulderTiltZ: Math.sin(t * 1.8) * 0.03,
      browAngle: 0.26,
      browLiftY: -0.012,
      blinkAmount: baseBlink,
      smileScale: -0.35,
      propGestureAngle: -0.1,
    };
  }

  if (mood === 'celebrating') {
    const bounce = Math.abs(Math.sin(t * 6.4 + seedOffset));
    return {
      headYaw: inwardYawBias + Math.sin(t * 3.2 + seedOffset) * 0.18 + hoverYaw,
      headPitch: -0.08 - bounce * 0.1 + hoverPitch,
      headRoll: Math.sin(t * 3.2 + seedOffset) * 0.09,
      torsoYaw: inwardYawBias * 0.75 + Math.sin(t * 3.2) * 0.08,
      torsoBobY: bounce * 0.045,
      shoulderTiltZ: Math.sin(t * 6.4) * 0.045,
      browAngle: -0.14,
      browLiftY: 0.026,
      blinkAmount: baseBlink * 0.7,
      smileScale: 1.35,
      propGestureAngle: 0.28 + bounce * 0.15,
    };
  }

  if (mood === 'stressed') {
    return {
      headYaw: inwardYawBias + Math.sin(t * 5.2 + seedOffset) * 0.13 + hoverYaw * 0.6,
      headPitch: 0.08 + Math.sin(t * 2.6) * 0.04 + hoverPitch * 0.5,
      headRoll: -0.09 * (facingSign || 1),
      torsoYaw: inwardYawBias * 0.6,
      torsoBobY: Math.sin(t * 3.2 + seedOffset) * 0.014 - 0.01,
      shoulderTiltZ: 0.04,
      browAngle: -0.24,
      browLiftY: 0.01,
      blinkAmount: Math.min(1, baseBlink + 0.18),
      smileScale: -0.45,
      propGestureAngle: -0.08,
    };
  }

  if (mood === 'active') {
    return {
      headYaw: inwardYawBias + Math.sin(t * 1.85 + seedOffset) * 0.14 + hoverYaw,
      headPitch: -0.03 + Math.sin(t * 2.7 + seedOffset) * 0.045 + hoverPitch,
      headRoll: Math.sin(t * 1.4 + seedOffset) * 0.055,
      torsoYaw: inwardYawBias * 0.72 + Math.sin(t * 1.4 + seedOffset) * 0.05,
      torsoBobY: Math.sin(t * 2.8 + seedOffset) * 0.024,
      shoulderTiltZ: Math.sin(t * 1.4 + seedOffset) * 0.025,
      browAngle: -0.08,
      browLiftY: 0.016,
      blinkAmount: baseBlink,
      smileScale: 1.12,
      propGestureAngle: 0.14 + Math.sin(t * 2.4) * 0.08,
    };
  }

  // Calm poised Business Tour executive idle
  return {
    headYaw: inwardYawBias + Math.sin(t * 0.95 + seedOffset) * 0.075 + hoverYaw,
    headPitch: Math.sin(t * 1.35 + seedOffset) * 0.025 + hoverPitch,
    headRoll: Math.sin(t * 0.8 + seedOffset) * 0.03,
    torsoYaw: inwardYawBias * 0.68 + Math.sin(t * 0.85 + seedOffset) * 0.025,
    torsoBobY: Math.sin(t * 1.7 + seedOffset) * 0.014,
    shoulderTiltZ: Math.sin(t * 0.85 + seedOffset) * 0.012,
    browAngle: -0.03,
    browLiftY: 0.004,
    blinkAmount: baseBlink,
    smileScale: 0.92,
    propGestureAngle: Math.sin(t * 1.3 + seedOffset) * 0.05,
  };
}

export function getPlayerPersona(player: Pick<PlayerState, 'tokenType'>): CharacterPersonaMeta {
  return CHARACTER_PERSONAS[player.tokenType] || CHARACTER_PERSONAS.car;
}
