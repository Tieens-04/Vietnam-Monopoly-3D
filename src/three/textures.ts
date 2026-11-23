import * as THREE from 'three';
import { ColorGroup, TileDefinition, TileKind } from '../game/types';
import { CityLandmarkMotif, getCityVisualProfile } from '../game/visualTheme';

export const CANVAS_FONT_DISPLAY = '"Be Vietnam Pro", "Segoe UI", sans-serif';
export const CANVAS_FONT_MONO = '"Be Vietnam Pro", "Segoe UI", sans-serif';

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function drawWrappedTitle(
  ctx: CanvasRenderingContext2D,
  text: string,
  cx: number,
  startY: number,
  maxWidth: number,
  lineHeight: number
): void {
  const words = text.split(' ');
  const lines: string[] = [];
  let current = '';

  for (const w of words) {
    const testLine = current ? `${current} ${w}` : w;
    if (ctx.measureText(testLine).width > maxWidth && current) {
      lines.push(current);
      current = w;
    } else {
      current = testLine;
    }
  }
  if (current) lines.push(current);

  const totalH = (lines.length - 1) * lineHeight;
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.98)';
  ctx.lineWidth = 7;
  lines.forEach((line, idx) => {
    const ly = startY - totalH / 2 + idx * lineHeight;
    ctx.strokeText(line, cx, ly, maxWidth);
    ctx.fillText(line, cx, ly, maxWidth);
  });
  ctx.restore();
}

function addSubtleMarbleVeinsAndSparkle(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  seedOffset = 0
): void {
  ctx.save();
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.09)';
  ctx.lineWidth = 2.2;
  for (let v = 0; v < 4; v++) {
    const startX = ((v * 137 + seedOffset * 41) % (W - 80)) + 40;
    const startY = 320 + ((v * 89 + seedOffset * 23) % Math.max(80, H - 380));
    ctx.beginPath();
    ctx.moveTo(startX - 48, startY - 18);
    ctx.bezierCurveTo(
      startX - 10,
      startY + 12,
      startX + 26,
      startY - 14,
      startX + 64,
      startY + 16
    );
    ctx.stroke();
  }

  for (let i = 0; i < 36; i++) {
    const gx = ((i * 97 + seedOffset * 31) % (W - 48)) + 24;
    const gy = ((i * 151 + seedOffset * 53) % (H - 48)) + 24;
    ctx.fillStyle =
      i % 2 === 0 ? 'rgba(148, 163, 184, 0.08)' : 'rgba(255, 255, 255, 0.72)';
    ctx.fillRect(gx, gy, 3, 3);
  }
  ctx.restore();
}

/**
 * Vibrant Business Tour city group color palette.
 */
export function resolveDeedGroupPalette(
  group?: ColorGroup,
  fallbackHex?: string
): {
  topHex: string;
  bottomHex: string;
  emblemHex: string;
} {
  switch (group) {
    case ColorGroup.BROWN:
      return { topHex: '#C25E0E', bottomHex: '#8C3B08', emblemHex: '#78350F' };
    case ColorGroup.CYAN:
      return { topHex: '#22B8F8', bottomHex: '#0277BD', emblemHex: '#0369A1' };
    case ColorGroup.PINK:
      return { topHex: '#F43F8E', bottomHex: '#C81D66', emblemHex: '#9D174D' };
    case ColorGroup.ORANGE:
      return { topHex: '#FF9429', bottomHex: '#E05308', emblemHex: '#B43E06' };
    case ColorGroup.AMBER:
      return { topHex: '#FBBF24', bottomHex: '#D97706', emblemHex: '#92400E' };
    case ColorGroup.RED:
      return { topHex: '#FF4757', bottomHex: '#D81B3A', emblemHex: '#9F1239' };
    case ColorGroup.PURPLE:
      return { topHex: '#9B5DE5', bottomHex: '#6D28D9', emblemHex: '#4C1D95' };
    case ColorGroup.EMERALD:
      return { topHex: '#10D48E', bottomHex: '#059669', emblemHex: '#065F46' };
    default:
      return {
        topHex: fallbackHex || '#38BDF8',
        bottomHex: fallbackHex || '#0284C7',
        emblemHex: fallbackHex || '#0369A1',
      };
  }
}

/**
 * Renders a crisp, stylized Vietnamese landmark badge illustration for all 24 purchasable
 * cities & island resorts. Shared between 3D tile header medallions and 2D property modals!
 */
export function drawCityLandmarkIllustration(
  ctx: CanvasRenderingContext2D,
  motif: CityLandmarkMotif,
  cx: number,
  cy: number,
  radius: number,
  primaryHex: string,
  darkHex: string
): void {
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  const bg = ctx.createLinearGradient(cx, cy - radius, cx, cy + radius);
  bg.addColorStop(0, '#FFFFFF');
  bg.addColorStop(0.7, '#F8FAFC');
  bg.addColorStop(1, '#E2E8F0');
  ctx.fillStyle = bg;
  ctx.fill();
  ctx.clip();

  const s = radius / 54;
  ctx.translate(cx, cy);
  ctx.scale(s, s);

  // Soft horizon tint band at bottom of medallion
  ctx.fillStyle = primaryHex;
  ctx.globalAlpha = 0.16;
  ctx.fillRect(-60, 16, 120, 44);
  ctx.globalAlpha = 1;

  // Warm sun / moon accent
  ctx.fillStyle = '#FACC15';
  ctx.beginPath();
  ctx.arc(22, -22, 10, 0, Math.PI * 2);
  ctx.fill();

  switch (motif) {
    case 'lung_cu_tower': {
      // Twin karst peaks + Lũng Cú octagonal flagpole & red star flag
      ctx.fillStyle = '#A8A29E';
      ctx.beginPath();
      ctx.moveTo(-52, 36);
      ctx.lineTo(-22, -4);
      ctx.lineTo(6, 36);
      ctx.fill();
      ctx.fillStyle = darkHex;
      ctx.fillRect(-7, -14, 14, 42);
      ctx.fillStyle = '#F59E0B';
      ctx.fillRect(-11, -18, 22, 5);
      ctx.strokeStyle = '#475569';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(0, -18);
      ctx.lineTo(0, -40);
      ctx.stroke();
      ctx.fillStyle = '#EF4444';
      ctx.fillRect(0, -39, 22, 13);
      ctx.fillStyle = '#FDE047';
      ctx.beginPath();
      ctx.arc(11, -32.5, 3.2, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'fansipan_peak': {
      // Fansipan summit + terraced hills + cable car
      ctx.fillStyle = primaryHex;
      ctx.beginPath();
      ctx.moveTo(-54, 38);
      ctx.lineTo(-8, -28);
      ctx.lineTo(44, 38);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#84CC16';
      ctx.beginPath();
      ctx.ellipse(-18, 34, 36, 14, 0, Math.PI, 0);
      ctx.fill();
      ctx.strokeStyle = darkHex;
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.moveTo(-44, -8);
      ctx.lineTo(36, -30);
      ctx.stroke();
      ctx.fillStyle = '#EF4444';
      roundRect(ctx, 4, -22, 14, 11, 3);
      ctx.fill();
      break;
    }
    case 'lam_vien_bud': {
      // Đà Lạt pine silhouettes + emerald spiral artichoke bud dome
      ctx.fillStyle = '#16A34A';
      ctx.beginPath();
      ctx.moveTo(0, -32);
      ctx.bezierCurveTo(26, -18, 28, 16, 0, 28);
      ctx.bezierCurveTo(-28, 16, -26, -18, 0, -32);
      ctx.fill();
      ctx.strokeStyle = '#BBF7D0';
      ctx.lineWidth = 2.6;
      ctx.beginPath();
      ctx.moveTo(-14, 10);
      ctx.quadraticCurveTo(0, -14, 14, 10);
      ctx.moveTo(-18, 20);
      ctx.quadraticCurveTo(0, -2, 18, 20);
      ctx.stroke();
      break;
    }
    case 'ha_long_sails': {
      // Turquoise bay + twin limestone karsts + traditional junk sail
      ctx.fillStyle = '#0EA5E9';
      ctx.fillRect(-58, 18, 116, 38);
      ctx.fillStyle = '#0F766E';
      ctx.beginPath();
      ctx.moveTo(-38, 20);
      ctx.quadraticCurveTo(-32, -26, -16, -22);
      ctx.quadraticCurveTo(-8, -18, -6, 20);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(14, 20);
      ctx.quadraticCurveTo(20, -14, 32, -10);
      ctx.lineTo(38, 20);
      ctx.fill();
      ctx.fillStyle = '#EA580C';
      ctx.beginPath();
      ctx.moveTo(-2, 16);
      ctx.lineTo(-2, -14);
      ctx.lineTo(16, 8);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case 'trang_an_boat': {
      // Limestone river grotto arch + golden sampan
      ctx.fillStyle = '#0284C7';
      ctx.fillRect(-58, 16, 116, 40);
      ctx.fillStyle = '#15803D';
      ctx.beginPath();
      ctx.arc(0, 18, 36, Math.PI, 0);
      ctx.fill();
      ctx.fillStyle = '#BAE6FD';
      ctx.beginPath();
      ctx.arc(0, 20, 16, Math.PI, 0);
      ctx.fill();
      ctx.fillStyle = '#D97706';
      ctx.beginPath();
      ctx.ellipse(0, 25, 18, 5, 0, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'ngo_mon_gate': {
      // Imperial Huế Ngọ Môn stone rampart + curved golden palace roof
      ctx.fillStyle = '#64748B';
      ctx.fillRect(-38, 4, 76, 26);
      ctx.fillStyle = '#1E293B';
      for (const gx of [-20, 0, 20]) {
        ctx.beginPath();
        ctx.arc(gx, 30, 6.5, Math.PI, 0);
        ctx.fill();
      }
      ctx.fillStyle = '#DC2626';
      ctx.fillRect(-24, -12, 48, 16);
      ctx.fillStyle = '#F59E0B';
      ctx.beginPath();
      ctx.moveTo(-34, -10);
      ctx.quadraticCurveTo(0, -30, 34, -10);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case 'chua_cau_lantern': {
      // Hội An Covered Bridge + glowing silk lanterns
      ctx.fillStyle = '#0284C7';
      ctx.fillRect(-58, 20, 116, 36);
      ctx.fillStyle = '#F59E0B';
      roundRect(ctx, -34, -4, 68, 22, 5);
      ctx.fill();
      ctx.fillStyle = '#92400E';
      ctx.beginPath();
      ctx.moveTo(-40, -2);
      ctx.quadraticCurveTo(0, -26, 40, -2);
      ctx.closePath();
      ctx.fill();
      for (const [lx, hex] of [
        [-24, '#EF4444'],
        [0, '#FDE047'],
        [24, '#EC4899'],
      ] as const) {
        ctx.fillStyle = hex;
        ctx.beginPath();
        ctx.arc(lx, -24, 6.5, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    }
    case 'nghinh_phong_twin': {
      // Iconic split twin basalt columns of Nghinh Phong (Tuy Hòa)
      ctx.fillStyle = '#0EA5E9';
      ctx.fillRect(-58, 22, 116, 34);
      ctx.fillStyle = darkHex;
      roundRect(ctx, -20, -30, 15, 54, 4);
      ctx.fill();
      roundRect(ctx, 5, -24, 15, 48, 4);
      ctx.fill();
      break;
    }
    case 'mui_ne_lighthouse':
    case 'vung_tau_beacon': {
      // Golden coastal dunes / headland + white coastal lighthouse
      ctx.fillStyle = '#FBBF24';
      ctx.beginPath();
      ctx.ellipse(-10, 32, 46, 18, 0, Math.PI, 0);
      ctx.fill();
      ctx.fillStyle = primaryHex;
      ctx.beginPath();
      ctx.moveTo(-9, 18);
      ctx.lineTo(-5, -26);
      ctx.lineTo(5, -26);
      ctx.lineTo(9, 18);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#FEF08A';
      ctx.beginPath();
      ctx.arc(0, -30, 6.5, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'nha_rong_coffee': {
      // Steep Central Highlands Nhà Rông roof
      ctx.fillStyle = '#92400E';
      ctx.fillRect(-18, 8, 36, 18);
      ctx.fillStyle = '#D97706';
      ctx.beginPath();
      ctx.moveTo(-26, 10);
      ctx.lineTo(-12, -34);
      ctx.lineTo(12, -34);
      ctx.lineTo(26, 10);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case 'can_tho_bridge': {
      // Cable-stayed bridge A-frame pylon over Hau River
      ctx.fillStyle = '#0EA5E9';
      ctx.fillRect(-58, 20, 116, 36);
      ctx.strokeStyle = primaryHex;
      ctx.lineWidth = 3;
      for (const xEnd of [-40, -24, 24, 40]) {
        ctx.beginPath();
        ctx.moveTo(0, -26);
        ctx.lineTo(xEnd, 14);
        ctx.stroke();
      }
      ctx.fillStyle = darkHex;
      ctx.fillRect(-48, 12, 96, 6);
      ctx.beginPath();
      ctx.moveTo(-8, 24);
      ctx.lineTo(0, -32);
      ctx.lineTo(8, 24);
      ctx.stroke();
      break;
    }
    case 'dragon_bridge': {
      // Golden undulating Dragon Bridge of Đà Nẵng
      ctx.fillStyle = '#0284C7';
      ctx.fillRect(-58, 20, 116, 36);
      ctx.strokeStyle = '#F59E0B';
      ctx.lineWidth = 8;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(-42, 14);
      ctx.bezierCurveTo(-24, -14, -6, 24, 12, -8);
      ctx.quadraticCurveTo(26, -24, 38, -6);
      ctx.stroke();
      ctx.fillStyle = '#475569';
      ctx.fillRect(-48, 14, 96, 6);
      break;
    }
    case 'khue_van_cac': {
      // Iconic Khuê Văn Các circular sun-star window pavilion (Hà Nội)
      ctx.fillStyle = '#B45309';
      ctx.fillRect(-28, 12, 56, 18);
      ctx.fillStyle = '#DC2626';
      ctx.fillRect(-22, -12, 44, 24);
      ctx.fillStyle = '#FEF08A';
      ctx.beginPath();
      ctx.arc(0, 0, 8.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#047857';
      ctx.beginPath();
      ctx.moveTo(-34, -10);
      ctx.quadraticCurveTo(0, -30, 34, -10);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case 'landmark_skyline': {
      // TP. Hồ Chí Minh Landmark 81 stepped bamboo tower + Bitexco silhouette
      ctx.fillStyle = '#059669';
      roundRect(ctx, -28, -4, 14, 36, 3);
      ctx.fill();
      ctx.fillStyle = darkHex;
      roundRect(ctx, -7, -28, 16, 60, 3);
      ctx.fill();
      ctx.fillStyle = primaryHex;
      roundRect(ctx, -14, -12, 8, 44, 2);
      ctx.fill();
      roundRect(ctx, 8, -16, 8, 48, 2);
      ctx.fill();
      ctx.strokeStyle = '#10B981';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(1, -28);
      ctx.lineTo(1, -42);
      ctx.stroke();
      break;
    }
    default: {
      // Coastal resort / modern city stylized palm-arch or skyline
      ctx.fillStyle = '#0EA5E9';
      ctx.fillRect(-58, 20, 116, 36);
      ctx.fillStyle = primaryHex;
      roundRect(ctx, -22, -16, 18, 38, 4);
      ctx.fill();
      ctx.fillStyle = darkHex;
      roundRect(ctx, 2, -26, 20, 48, 4);
      ctx.fill();
      ctx.fillStyle = '#FFFFFF';
      for (const wy of [-16, -6, 4]) {
        ctx.fillRect(7, wy, 10, 4);
      }
      break;
    }
  }

  ctx.restore();

  // Crisp glossy outer medallion ring
  ctx.save();
  ctx.strokeStyle = '#FFFFFF';
  ctx.lineWidth = Math.max(3, radius * 0.09);
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

/**
 * Draws the Business Tour colorful 8-slice rainbow spinning-wheel decal for Chance / Chest tiles.
 */
function drawRainbowSpinWheel(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  outerR: number,
  centerSymbol: '?' | '★'
): void {
  const sliceColors = [
    '#FF3B5C',
    '#FF9800',
    '#FFD600',
    '#66C61C',
    '#00BCD4',
    '#29B6F6',
    '#AB47BC',
    '#EC407A',
  ];

  ctx.save();

  ctx.fillStyle = '#F59E0B';
  ctx.beginPath();
  ctx.arc(cx, cy, outerR + 12, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#FFFFFF';
  ctx.beginPath();
  ctx.arc(cx, cy, outerR + 5, 0, Math.PI * 2);
  ctx.fill();

  const sliceAngle = (Math.PI * 2) / sliceColors.length;
  for (let i = 0; i < sliceColors.length; i++) {
    const a0 = i * sliceAngle - Math.PI / 2;
    const a1 = a0 + sliceAngle;
    ctx.fillStyle = sliceColors[i];
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, outerR, a0, a1);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 4;
    ctx.stroke();

    const midA = (a0 + a1) * 0.5;
    ctx.fillStyle = '#FEF08A';
    ctx.beginPath();
    ctx.arc(
      cx + Math.cos(midA) * (outerR - 12),
      cy + Math.sin(midA) * (outerR - 12),
      5.5,
      0,
      Math.PI * 2
    );
    ctx.fill();
  }

  const hubGrad = ctx.createRadialGradient(cx - 8, cy - 8, 4, cx, cy, 42);
  hubGrad.addColorStop(0, '#FFFBEB');
  hubGrad.addColorStop(0.55, '#FACC15');
  hubGrad.addColorStop(1, '#D97706');
  ctx.fillStyle = hubGrad;
  ctx.beginPath();
  ctx.arc(cx, cy, 40, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = 5;
  ctx.strokeStyle = '#FFFFFF';
  ctx.stroke();

  ctx.fillStyle = '#78350F';
  ctx.font = `900 48px ${CANVAS_FONT_DISPLAY}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(centerSymbol, cx, cy + 3);

  ctx.fillStyle = '#EF4444';
  ctx.strokeStyle = '#FFFFFF';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(cx - 18, cy - outerR - 16);
  ctx.lineTo(cx + 18, cy - outerR - 16);
  ctx.lineTo(cx, cy - outerR + 14);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.restore();
}

function drawFunctionalArtwork(
  ctx: CanvasRenderingContext2D,
  kind: TileKind,
  cx: number,
  cy: number
): void {
  ctx.save();

  if (kind === TileKind.CHANCE) {
    drawRainbowSpinWheel(ctx, cx, cy + 6, 114, '?');
  } else if (kind === TileKind.TAX) {
    const taxGrad = ctx.createRadialGradient(cx, cy - 18, 10, cx, cy, 102);
    taxGrad.addColorStop(0, '#FF6B8B');
    taxGrad.addColorStop(0.65, '#E11D48');
    taxGrad.addColorStop(1, '#9F1239');
    ctx.fillStyle = taxGrad;
    ctx.beginPath();
    ctx.arc(cx, cy, 98, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 8;
    ctx.stroke();

    ctx.fillStyle = 'rgba(255,255,255,0.22)';
    ctx.beginPath();
    ctx.ellipse(cx, cy - 42, 54, 24, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#FFFFFF';
    ctx.font = `900 86px ${CANVAS_FONT_DISPLAY}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('%', cx, cy + 4);
  }

  ctx.restore();
}

/**
 * Business Tour High-Contrast Glossy 3D Tile Top Texture:
 * - Property tiles feature a rich beveled Color-Group Header Band on the inner half (framing 3D buildings)
 *   paired with a bespoke Vietnamese landmark medallion & crisp alabaster name plaque.
 * - Resort tiles feature lush turquoise-golden island lagoon artwork.
 * - 4 Corner tiles feature richly detailed themed floor pads supporting their 3D dioramas.
 */
export function createTileTopTexture(
  tile: TileDefinition,
  maxAnisotropy: number,
  flipReadability = false
): THREE.CanvasTexture {
  const isCorner =
    tile.kind === TileKind.START ||
    tile.kind === TileKind.LOST_ISLAND ||
    tile.kind === TileKind.WORLD_CHAMPIONSHIPS ||
    tile.kind === TileKind.WORLD_TOUR;

  const canvas = document.createElement('canvas');
  canvas.width = isCorner ? 640 : 512;
  canvas.height = isCorner ? 640 : 768;
  const ctx = canvas.getContext('2d')!;

  const W = canvas.width;
  const H = canvas.height;

  // 1. Crisp beveled alabaster-ivory outer stone rim + warm satin tile surface
  ctx.fillStyle = '#CBD5E1';
  ctx.fillRect(0, 0, W, H);

  const bodyGrad = ctx.createLinearGradient(0, 0, W, H);
  bodyGrad.addColorStop(0, '#FFFFFF');
  bodyGrad.addColorStop(0.58, '#F8FAFC');
  bodyGrad.addColorStop(1, '#EEF2F7');
  ctx.fillStyle = bodyGrad;
  roundRect(ctx, 12, 12, W - 24, H - 24, 24);
  ctx.fill();

  addSubtleMarbleVeinsAndSparkle(ctx, W, H, tile.index);

  ctx.strokeStyle = '#E2E8F0';
  ctx.lineWidth = 5;
  roundRect(ctx, 22, 22, W - 44, H - 44, 18);
  ctx.stroke();

  if (isCorner) {
    ctx.save();
    if (flipReadability) {
      ctx.translate(W / 2, H / 2);
      ctx.rotate(Math.PI);
      ctx.translate(-W / 2, -H / 2);
    }

    if (tile.kind === TileKind.START) {
      const padGrad = ctx.createLinearGradient(48, 48, W - 48, H - 48);
      padGrad.addColorStop(0, '#22C55E');
      padGrad.addColorStop(0.55, '#16A34A');
      padGrad.addColorStop(1, '#DC2626');
      ctx.fillStyle = padGrad;
      roundRect(ctx, 44, 44, W - 88, H - 88, 38);
      ctx.fill();

      ctx.strokeStyle = '#FEF08A';
      ctx.lineWidth = 10;
      roundRect(ctx, 60, 60, W - 120, H - 120, 30);
      ctx.stroke();

      ctx.fillStyle = 'rgba(255,255,255,0.94)';
      ctx.beginPath();
      ctx.moveTo(492, 320);
      ctx.lineTo(250, 320);
      ctx.lineTo(250, 250);
      ctx.lineTo(136, 350);
      ctx.lineTo(250, 450);
      ctx.lineTo(250, 380);
      ctx.lineTo(492, 380);
      ctx.closePath();
      ctx.fill();

      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#FFFFFF';
      ctx.font = `900 66px ${CANVAS_FONT_DISPLAY}`;
      ctx.fillText('BẮT ĐẦU', W / 2, 148);

      ctx.fillStyle = '#FEF08A';
      ctx.font = `800 44px ${CANVAS_FONT_MONO}`;
      ctx.fillText('+300K', W / 2, 522);
    } else if (tile.kind === TileKind.LOST_ISLAND) {
      const waterGrad = ctx.createRadialGradient(W / 2, H / 2, 60, W / 2, H / 2, 280);
      waterGrad.addColorStop(0, '#67E8F9');
      waterGrad.addColorStop(0.62, '#06B6D4');
      waterGrad.addColorStop(1, '#0369A1');
      ctx.fillStyle = waterGrad;
      roundRect(ctx, 42, 42, W - 84, H - 84, 42);
      ctx.fill();

      ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
      ctx.lineWidth = 10;
      ctx.beginPath();
      ctx.arc(W / 2, H / 2, 198, 0, Math.PI * 2);
      ctx.stroke();

      ctx.fillStyle = '#FDE68A';
      ctx.beginPath();
      ctx.arc(W / 2, H / 2, 166, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#FFFFFF';
      ctx.font = `900 44px ${CANVAS_FONT_DISPLAY}`;
      ctx.textAlign = 'center';
      ctx.fillText('ĐẢO HOANG', W / 2, 566);
    } else if (tile.kind === TileKind.WORLD_CHAMPIONSHIPS) {
      const stadGrad = ctx.createRadialGradient(W / 2, H / 2 - 12, 40, W / 2, H / 2, 270);
      stadGrad.addColorStop(0, '#FEF08A');
      stadGrad.addColorStop(0.28, '#84CC16');
      stadGrad.addColorStop(0.75, '#15803D');
      stadGrad.addColorStop(1, '#1E293B');
      ctx.fillStyle = stadGrad;
      roundRect(ctx, 46, 46, W - 92, H - 92, 38);
      ctx.fill();

      ctx.strokeStyle = '#FACC15';
      ctx.lineWidth = 10;
      ctx.beginPath();
      ctx.arc(W / 2, H / 2 - 12, 188, 0, Math.PI * 2);
      ctx.stroke();

      ctx.fillStyle = '#FFFFFF';
      ctx.font = `900 42px ${CANVAS_FONT_DISPLAY}`;
      ctx.textAlign = 'center';
      ctx.fillText('CÚP QUỐC GIA', W / 2, 568);
    } else if (tile.kind === TileKind.WORLD_TOUR) {
      const tarmacGrad = ctx.createLinearGradient(46, 46, W - 46, H - 46);
      tarmacGrad.addColorStop(0, '#334155');
      tarmacGrad.addColorStop(1, '#0F172A');
      ctx.fillStyle = tarmacGrad;
      roundRect(ctx, 46, 46, W - 92, H - 92, 38);
      ctx.fill();

      ctx.save();
      ctx.translate(W / 2, H / 2);
      ctx.rotate(-Math.PI / 4);
      ctx.fillStyle = '#1E293B';
      roundRect(ctx, -230, -68, 460, 136, 18);
      ctx.fill();

      ctx.strokeStyle = '#38BDF8';
      ctx.lineWidth = 5;
      ctx.strokeRect(-220, -58, 440, 116);

      ctx.strokeStyle = '#FDE047';
      ctx.lineWidth = 8;
      ctx.setLineDash([28, 22]);
      ctx.beginPath();
      ctx.moveTo(-190, 0);
      ctx.lineTo(190, 0);
      ctx.stroke();
      ctx.restore();

      ctx.fillStyle = '#FFFFFF';
      ctx.font = `900 46px ${CANVAS_FONT_DISPLAY}`;
      ctx.textAlign = 'center';
      ctx.fillText('DU LỊCH', W / 2, 564);
    }
    ctx.restore();
  } else if (tile.kind === TileKind.PROPERTY) {
    const pal = resolveDeedGroupPalette(tile.group, tile.groupColor);
    const profile = getCityVisualProfile(tile.index);

    // 1. Vibrant Glossy Business Tour Color-Group Header Band on inner half (y: 34..304)
    const bandGrad = ctx.createLinearGradient(34, 34, 34, 304);
    bandGrad.addColorStop(0, pal.topHex);
    bandGrad.addColorStop(1, pal.bottomHex);
    ctx.fillStyle = bandGrad;
    roundRect(ctx, 32, 34, W - 64, 270, 24);
    ctx.fill();

    // Top specular glass highlight inside color header
    const glossGrad = ctx.createLinearGradient(42, 42, 42, 138);
    glossGrad.addColorStop(0, 'rgba(255, 255, 255, 0.36)');
    glossGrad.addColorStop(1, 'rgba(255, 255, 255, 0.02)');
    ctx.fillStyle = glossGrad;
    roundRect(ctx, 44, 42, W - 88, 92, 18);
    ctx.fill();

    // Subtle geometric architectural chevron pattern inside color header
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.16)';
    ctx.lineWidth = 4;
    roundRect(ctx, 44, 46, W - 88, 246, 18);
    ctx.stroke();
    ctx.restore();

    // Crisp Vietnamese Landmark Medallion centered in the color header (visible when unowned, frames buildings when owned!)
    ctx.save();
    if (flipReadability) {
      ctx.translate(W / 2, 169);
      ctx.rotate(Math.PI);
      ctx.translate(-W / 2, -169);
    }
    drawCityLandmarkIllustration(
      ctx,
      profile.landmarkMotif,
      W / 2,
      169,
      62,
      pal.topHex,
      pal.emblemHex
    );
    ctx.restore();

    // Gold-trimmed separator ribbon below color band
    ctx.fillStyle = pal.bottomHex;
    roundRect(ctx, 56, 316, W - 112, 14, 7);
    ctx.fill();

    // Subtle color-group vertical accent ticks flanking the city title
    ctx.fillStyle = pal.topHex;
    roundRect(ctx, 28, 368, 10, 290, 5);
    ctx.fill();
    roundRect(ctx, W - 38, 368, 10, 290, 5);
    ctx.fill();

    ctx.save();
    if (flipReadability) {
      ctx.translate(W / 2, 534);
      ctx.rotate(Math.PI);
      ctx.translate(-W / 2, -534);
    }

    ctx.fillStyle = '#0F172A';
    ctx.font = `900 74px ${CANVAS_FONT_DISPLAY}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    drawWrappedTitle(ctx, tile.name, W / 2, 496, W - 76, 82);

    // High-contrast region/landmark pill badge at bottom (crisp legibility at isometric zoom)
    ctx.fillStyle = pal.topHex;
    ctx.globalAlpha = 0.18;
    roundRect(ctx, 44, 646, W - 88, 56, 28);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = pal.topHex;
    ctx.lineWidth = 2.5;
    roundRect(ctx, 44, 646, W - 88, 56, 28);
    ctx.stroke();

    ctx.fillStyle = pal.emblemHex;
    ctx.font = `900 30px ${CANVAS_FONT_DISPLAY}`;
    ctx.fillText(
      (profile.regionBadge || tile.groupLabel || '').toUpperCase(),
      W / 2,
      675,
      W - 112
    );
    ctx.restore();
  } else if (tile.kind === TileKind.RESORT) {
    const profile = getCityVisualProfile(tile.index);
    const lagoonGrad = ctx.createLinearGradient(32, 34, W - 32, 304);
    lagoonGrad.addColorStop(0, '#0EA5E9');
    lagoonGrad.addColorStop(0.58, '#06B6D4');
    lagoonGrad.addColorStop(1, '#FBBF24');
    ctx.fillStyle = lagoonGrad;
    roundRect(ctx, 32, 34, W - 64, 270, 24);
    ctx.fill();

    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth = 5;
    roundRect(ctx, 44, 46, W - 88, 246, 18);
    ctx.stroke();

    ctx.save();
    if (flipReadability) {
      ctx.translate(W / 2, 169);
      ctx.rotate(Math.PI);
      ctx.translate(-W / 2, -169);
    }
    drawCityLandmarkIllustration(
      ctx,
      profile.landmarkMotif,
      W / 2,
      169,
      64,
      '#0EA5E9',
      '#0369A1'
    );
    ctx.restore();

    ctx.fillStyle = '#0284C7';
    roundRect(ctx, 56, 316, W - 112, 14, 7);
    ctx.fill();

    ctx.save();
    if (flipReadability) {
      ctx.translate(W / 2, 534);
      ctx.rotate(Math.PI);
      ctx.translate(-W / 2, -534);
    }

    ctx.fillStyle = '#0F172A';
    ctx.font = `900 72px ${CANVAS_FONT_DISPLAY}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    drawWrappedTitle(ctx, tile.name, W / 2, 496, W - 72, 80);

    ctx.fillStyle = 'rgba(14, 165, 233, 0.18)';
    roundRect(ctx, 48, 646, W - 96, 56, 28);
    ctx.fill();
    ctx.strokeStyle = '#0EA5E9';
    ctx.lineWidth = 2.5;
    roundRect(ctx, 48, 646, W - 96, 56, 28);
    ctx.stroke();

    ctx.fillStyle = '#0369A1';
    ctx.font = `900 30px ${CANVAS_FONT_DISPLAY}`;
    ctx.fillText('★ ĐẢO NGHỈ DƯỠNG', W / 2, 675, W - 116);
    ctx.restore();
  } else {
    // Functional Tile (Chance, Tax)
    ctx.save();
    if (flipReadability) {
      ctx.translate(W / 2, H / 2);
      ctx.rotate(Math.PI);
      ctx.translate(-W / 2, -H / 2);
    }

    ctx.fillStyle = '#0F172A';
    ctx.font = `900 60px ${CANVAS_FONT_DISPLAY}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    drawWrappedTitle(ctx, tile.name, W / 2, 142, W - 56, 66);

    drawFunctionalArtwork(ctx, tile.kind, W / 2, 434);

    if (tile.kind === TileKind.CHANCE) {
      ctx.fillStyle = 'rgba(234, 88, 12, 0.12)';
      roundRect(ctx, 52, H - 120, W - 104, 54, 27);
      ctx.fill();
      ctx.fillStyle = '#EA580C';
      ctx.font = `900 34px ${CANVAS_FONT_DISPLAY}`;
      ctx.fillText('VÒNG QUAY CƠ HỘI', W / 2, H - 91);
    } else if (tile.kind === TileKind.TAX) {
      ctx.fillStyle = 'rgba(225, 29, 72, 0.12)';
      roundRect(ctx, 52, H - 120, W - 104, 54, 27);
      ctx.fill();
      ctx.fillStyle = '#E11D48';
      ctx.font = `900 32px ${CANVAS_FONT_DISPLAY}`;
      ctx.fillText('10% BẤT ĐỘNG SẢN', W / 2, H - 91);
    }
    ctx.restore();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  tex.needsUpdate = true;
  return tex;
}

/**
 * High-readability top texture for the protruding 3D Business Tour Price/Rent Tab
 * extending OUTWARD from the outer edge of each purchasable/tax tile.
 */
export function createOuterPriceTabTexture(
  label: string,
  accentHex: string,
  ownerHex: string | null,
  modifiers: {
    isFestival: boolean;
    cupMultiplier: number | null;
    isOutage?: boolean;
    isShielded?: boolean;
  } = {
    isFestival: false,
    cupMultiplier: null,
    isOutage: false,
    isShielded: false,
  },
  flip180: boolean,
  maxAnisotropy: number
): THREE.CanvasTexture {
  const W = 384;
  const H = 224;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;

  ctx.save();
  if (flip180) {
    ctx.translate(W / 2, H / 2);
    ctx.rotate(Math.PI);
    ctx.translate(-W / 2, -H / 2);
  }

  const isNegative = label.startsWith('-');
  const hasCup = Boolean(modifiers.cupMultiplier && modifiers.cupMultiplier > 1);
  const rimHex = hasCup
    ? '#FACC15'
    : ownerHex
      ? ownerHex
      : isNegative
        ? '#FB7185'
        : accentHex || '#CBD5E1';

  // Vibrant group/owner-linked 3D tab frame
  ctx.fillStyle = rimHex;
  ctx.fillRect(0, 0, W, H);

  if (isNegative) {
    ctx.fillStyle = '#FFF1F2';
  } else {
    const g = ctx.createLinearGradient(0, 14, 0, H - 14);
    g.addColorStop(0, '#FFFFFF');
    g.addColorStop(1, '#F1F5F9');
    ctx.fillStyle = g;
  }
  const pad = ownerHex || hasCup ? 16 : 12;
  roundRect(ctx, pad, pad, W - pad * 2, H - pad * 2, 22);
  ctx.fill();

  // Prominent top color header ribbon linking tab to its city group or owner
  ctx.fillStyle = ownerHex || accentHex;
  roundRect(ctx, 26, 18, W - 52, 24, 12);
  ctx.fill();

  ctx.fillStyle = 'rgba(255,255,255,0.38)';
  roundRect(ctx, 34, 21, W - 68, 9, 4.5);
  ctx.fill();

  if (modifiers.isOutage) {
    const badgeW = 94;
    const badgeX = 22;
    ctx.fillStyle = '#334155';
    roundRect(ctx, badgeX, 12, badgeW, 38, 14);
    ctx.fill();
    ctx.strokeStyle = '#FDE047';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.fillStyle = '#FDE047';
    ctx.font = `900 22px ${CANVAS_FONT_DISPLAY}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('⚡TẮT', badgeX + badgeW / 2, 32);
  } else if (modifiers.isFestival) {
    const badgeW = 82;
    const badgeX = 24;
    ctx.fillStyle = '#F97316';
    roundRect(ctx, badgeX, 12, badgeW, 38, 14);
    ctx.fill();
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.fillStyle = '#FFFFFF';
    ctx.font = `900 24px ${CANVAS_FONT_DISPLAY}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('🔥×2', badgeX + badgeW / 2, 32);
  }

  if (hasCup) {
    const badgeW = 128;
    const badgeX = W - 24 - badgeW;
    ctx.fillStyle = '#FACC15';
    roundRect(ctx, badgeX, 12, badgeW, 38, 14);
    ctx.fill();
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.fillStyle = '#78350F';
    ctx.font = `900 24px ${CANVAS_FONT_DISPLAY}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`🏆 ×${modifiers.cupMultiplier}`, badgeX + badgeW / 2, 32);
  }
  if (modifiers.isShielded) {
    const badgeW = 86;
    const badgeX = hasCup ? W - 24 - 128 - 8 - badgeW : W - 24 - badgeW;
    ctx.fillStyle = '#0284C7';
    roundRect(ctx, badgeX, 12, badgeW, 38, 14);
    ctx.fill();
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.fillStyle = '#FFFFFF';
    ctx.font = `900 23px ${CANVAS_FONT_DISPLAY}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('🛡️BV', badgeX + badgeW / 2, 32);
  }

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = isNegative ? '#BE123C' : '#0F172A';
  const labelFontPx = label.length >= 6 ? 76 : label.length >= 5 ? 86 : 96;
  ctx.font = `800 ${labelFontPx}px ${CANVAS_FONT_MONO}`;
  ctx.fillText(label, W / 2, H / 2 + 20);

  ctx.restore();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Clean square level badge ("1", "2", "3", "★") shown above upgraded or hovered owned tiles.
 */
export function createLevelBadgeTexture(
  level: number,
  ownerHex: string,
  maxAnisotropy: number
): THREE.CanvasTexture {
  const S = 160;
  const canvas = document.createElement('canvas');
  canvas.width = S;
  canvas.height = S;
  const ctx = canvas.getContext('2d')!;

  ctx.clearRect(0, 0, S, S);

  ctx.fillStyle = '#FFFFFF';
  roundRect(ctx, 8, 8, S - 16, S - 16, 30);
  ctx.fill();

  ctx.fillStyle = level >= 4 ? '#F59E0B' : ownerHex || '#29B6F6';
  roundRect(ctx, 18, 18, S - 36, S - 36, 22);
  ctx.fill();

  ctx.fillStyle = 'rgba(255,255,255,0.34)';
  roundRect(ctx, 24, 24, S - 48, (S - 48) * 0.44, 14);
  ctx.fill();

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = 'rgba(15, 23, 42, 0.6)';
  ctx.lineWidth = 7;
  ctx.fillStyle = '#FFFFFF';
  const text = level >= 4 ? '★' : String(Math.max(1, level));
  ctx.font = level >= 4 ? `900 88px ${CANVAS_FONT_DISPLAY}` : `800 88px ${CANVAS_FONT_MONO}`;
  ctx.strokeText(text, S / 2, S / 2 + 5);
  ctx.fillText(text, S / 2, S / 2 + 5);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Business Tour Sunken Courtyard Stadium Turf Texture (#78D64B -> #A3E66A)
 * featuring a sunlit radial glow, mown checker turf, and crisp golden-white stadium chalk lines.
 */
export function createBusinessTourPitchTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const S = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = S;
  canvas.height = S;
  const ctx = canvas.getContext('2d')!;

  const baseGrad = ctx.createRadialGradient(S / 2, S / 2, 64, S / 2, S / 2, S * 0.72);
  baseGrad.addColorStop(0, '#8BE255');
  baseGrad.addColorStop(0.65, '#78D043');
  baseGrad.addColorStop(1, '#5FB82E');
  ctx.fillStyle = baseGrad;
  ctx.fillRect(0, 0, S, S);

  const cell = 128;
  for (let gy = 0; gy < S; gy += cell) {
    for (let gx = 0; gx < S; gx += cell) {
      const isAlt = ((gx / cell + gy / cell) & 1) === 0;
      ctx.fillStyle = isAlt
        ? 'rgba(205, 255, 152, 0.19)'
        : 'rgba(64, 145, 24, 0.11)';
      ctx.fillRect(gx, gy, cell, cell);
    }
  }

  const stripeW = 128;
  ctx.save();
  for (let d = -S; d < S * 2; d += stripeW * 2) {
    ctx.fillStyle = 'rgba(232, 255, 188, 0.1)';
    ctx.beginPath();
    ctx.moveTo(d, 0);
    ctx.lineTo(d + stripeW, 0);
    ctx.lineTo(d + stripeW - S, S);
    ctx.lineTo(d - S, S);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();

  // Crisp stadium outer chalk line + subtle inner golden corner flourishes
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.82)';
  ctx.lineWidth = 7;
  roundRect(ctx, 34, 34, S - 68, S - 68, 26);
  ctx.stroke();

  ctx.strokeStyle = 'rgba(254, 240, 138, 0.58)';
  ctx.lineWidth = 3;
  roundRect(ctx, 50, 50, S - 100, S - 100, 18);
  ctx.stroke();

  // Inlaid center stadium medallion ring framing the 3D "VIỆT NAM 3D" / "CÚP QUỐC GIA" crest
  ctx.save();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.42)';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.arc(S / 2, S / 2, 236, 0, Math.PI * 2);
  ctx.stroke();

  ctx.strokeStyle = 'rgba(254, 240, 138, 0.45)';
  ctx.lineWidth = 2.5;
  ctx.setLineDash([16, 12]);
  ctx.beginPath();
  ctx.arc(S / 2, S / 2, 218, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

/**
 * Generates ultra-crisp, anti-aliased high-res layers for the Center Grass 3D Tournament Crest & Title
 * (1536x576 canvas — eliminates jagged alphaTest stair-stepping on subtitle & letters!).
 */
export function create3DTaxGrassTexture(
  bannerMainText: string,
  layerRole: 'cap' | 'extrude' | 'shadow',
  maxAnisotropy: number,
  subtitle = 'CÚP QUỐC GIA'
): THREE.CanvasTexture {
  const W = 1536;
  const H = 576;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;

  ctx.clearRect(0, 0, W, H);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';

  if (layerRole === 'shadow') {
    ctx.fillStyle = 'rgba(20, 62, 10, 0.42)';
    roundRect(ctx, W / 2 - 260, 54, 520, 84, 42);
    ctx.fill();

    const fontSize =
      bannerMainText.length >= 14 ? 152 : bannerMainText.length >= 10 ? 186 : 236;
    ctx.font = `900 ${fontSize}px ${CANVAS_FONT_DISPLAY}`;
    ctx.lineWidth = 22;
    ctx.strokeStyle = 'rgba(20, 62, 10, 0.38)';
    ctx.strokeText(bannerMainText, W / 2, 356, W - 96);
    ctx.fillText(bannerMainText, W / 2, 356, W - 96);
  } else if (layerRole === 'extrude') {
    // Rich golden-slate 3D bevel body
    ctx.fillStyle = '#B45309';
    roundRect(ctx, W / 2 - 256, 52, 512, 82, 41);
    ctx.fill();

    const fontSize =
      bannerMainText.length >= 14 ? 152 : bannerMainText.length >= 10 ? 186 : 236;
    ctx.font = `900 ${fontSize}px ${CANVAS_FONT_DISPLAY}`;
    ctx.strokeStyle = '#94A3B8';
    ctx.fillStyle = '#CBD5E1';
    ctx.lineWidth = 18;
    ctx.strokeText(bannerMainText, W / 2, 352, W - 96);
    ctx.fillText(bannerMainText, W / 2, 352, W - 96);
  } else {
    // Crisp golden ribbon pill for subtitle ("★ CỜ TỶ PHÚ ★" / "★ CÚP QUỐC GIA ★")
    const pillGrad = ctx.createLinearGradient(0, 50, 0, 134);
    pillGrad.addColorStop(0, '#FDE047');
    pillGrad.addColorStop(0.55, '#F59E0B');
    pillGrad.addColorStop(1, '#D97706');
    ctx.fillStyle = pillGrad;
    roundRect(ctx, W / 2 - 256, 50, 512, 82, 41);
    ctx.fill();

    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 6;
    ctx.stroke();

    ctx.fillStyle = '#FFFFFF';
    ctx.strokeStyle = 'rgba(120, 53, 15, 0.7)';
    ctx.lineWidth = 6;
    ctx.font = `900 44px ${CANVAS_FONT_DISPLAY}`;
    const decoratedSub = `★ ${subtitle} ★`;
    ctx.strokeText(decoratedSub, W / 2, 92, 476);
    ctx.fillText(decoratedSub, W / 2, 92, 476);

    const fontSize =
      bannerMainText.length >= 14 ? 152 : bannerMainText.length >= 10 ? 186 : 236;
    ctx.font = `900 ${fontSize}px ${CANVAS_FONT_DISPLAY}`;
    ctx.strokeStyle = '#0F172A';
    ctx.lineWidth = 14;
    ctx.strokeText(bannerMainText, W / 2, 350, W - 96);

    const textGrad = ctx.createLinearGradient(0, 230, 0, 460);
    textGrad.addColorStop(0, '#FFFFFF');
    textGrad.addColorStop(0.75, '#F8FAFC');
    textGrad.addColorStop(1, '#E2E8F0');
    ctx.fillStyle = textGrad;
    ctx.fillText(bannerMainText, W / 2, 350, W - 96);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Generates the sleek dark-gray 3D digital timer + active turn counter face texture
 * placed at the top inner corner of the green courtyard.
 */
export function drawCountdownClockBoardToCanvas(
  canvas: HTMLCanvasElement,
  timeStr: string,
  turnNumber: number,
  secondsLeft: number,
  activeColorHex: string
): void {
  const W = 640;
  const H = 320;
  if (canvas.width !== W) canvas.width = W;
  if (canvas.height !== H) canvas.height = H;
  const ctx = canvas.getContext('2d')!;

  ctx.clearRect(0, 0, W, H);
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#1E293B');
  bg.addColorStop(1, '#0F172A');
  ctx.fillStyle = bg;
  roundRect(ctx, 0, 0, W, H, 30);
  ctx.fill();

  ctx.fillStyle = '#0B1320';
  roundRect(ctx, 22, 20, W - 44, 72, 18);
  ctx.fill();

  const pillHex = (activeColorHex || '#29B6F6').toUpperCase();
  ctx.fillStyle = pillHex;
  roundRect(ctx, 30, 26, 256, 60, 14);
  ctx.fill();

  const isLightActiveBadge =
    pillHex.startsWith('#F5') ||
    pillHex.startsWith('#FD') ||
    pillHex.startsWith('#FE') ||
    pillHex.startsWith('#66');
  ctx.fillStyle = isLightActiveBadge ? '#0F172A' : '#FFFFFF';
  ctx.font = `900 36px ${CANVAS_FONT_DISPLAY}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(`LƯỢT ${Math.max(1, turnNumber)}`, 158, 57);

  ctx.fillStyle = '#E2E8F0';
  ctx.font = `800 28px ${CANVAS_FONT_DISPLAY}`;
  ctx.fillText('ĐẾM NGƯỢC', 456, 57);

  ctx.fillStyle = '#060B14';
  roundRect(ctx, 24, 108, W - 48, H - 130, 20);
  ctx.fill();
  ctx.strokeStyle = 'rgba(56, 189, 248, 0.35)';
  ctx.lineWidth = 4;
  ctx.stroke();

  const digitColor =
    secondsLeft <= 5 ? '#FF5252' : secondsLeft <= 10 ? '#FFD740' : '#A3E66A';
  ctx.save();
  ctx.font = `800 144px ${CANVAS_FONT_MONO}`;
  ctx.lineJoin = 'round';
  ctx.strokeStyle = digitColor;
  ctx.globalAlpha = 0.24;
  ctx.lineWidth = 14;
  ctx.strokeText(timeStr, W / 2, 208);
  ctx.globalAlpha = 1;
  ctx.fillStyle = digitColor;
  ctx.fillText(timeStr, W / 2, 208);
  ctx.restore();
}

export function createCountdownClockBoardTexture(
  timeStr: string,
  turnNumber: number,
  secondsLeft: number,
  activeColorHex: string,
  maxAnisotropy: number
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  drawCountdownClockBoardToCanvas(
    canvas,
    timeStr,
    turnNumber,
    secondsLeft,
    activeColorHex
  );

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  tex.needsUpdate = true;
  return tex;
}

export function createCashBillTopTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const W = 256;
  const H = 128;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#DCFCE7';
  ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = '#22C55E';
  roundRect(ctx, 8, 8, W - 16, H - 16, 10);
  ctx.fill();

  ctx.fillStyle = '#BBF7D0';
  roundRect(ctx, 18, 18, W - 36, H - 36, 6);
  ctx.fill();

  ctx.strokeStyle = '#15803D';
  ctx.lineWidth = 3;
  roundRect(ctx, 24, 24, W - 48, H - 48, 4);
  ctx.stroke();

  ctx.fillStyle = '#16A34A';
  ctx.beginPath();
  ctx.ellipse(W / 2, H / 2, 34, 24, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#FFFFFF';
  ctx.font = `900 30px ${CANVAS_FONT_DISPLAY}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('★', W / 2, H / 2 + 2);

  ctx.fillStyle = '#14532D';
  ctx.font = `800 18px ${CANVAS_FONT_MONO}`;
  ctx.fillText('500K', 48, 40);
  ctx.fillText('500K', W - 48, 40);
  ctx.fillText('500K', 48, H - 38);
  ctx.fillText('500K', W - 48, H - 38);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

export function createCashBillSideTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const W = 128;
  const H = 64;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;

  for (let y = 0; y < H; y += 4) {
    ctx.fillStyle = y % 8 === 0 ? '#DCFCE7' : '#4ADE80';
    ctx.fillRect(0, y, W, 2);
    ctx.fillStyle = '#16A34A';
    ctx.fillRect(0, y + 2, W, 2);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

export function createMetallicCoinTopTexture(
  tier: 'gold' | 'silver' | 'bronze',
  maxAnisotropy: number
): THREE.CanvasTexture {
  const S = 128;
  const canvas = document.createElement('canvas');
  canvas.width = S;
  canvas.height = S;
  const ctx = canvas.getContext('2d')!;

  const stops =
    tier === 'gold'
      ? ['#FEF08A', '#FACC15', '#CA8A04', '#FEF9C3', '#92400E']
      : tier === 'silver'
        ? ['#FFFFFF', '#CBD5E1', '#64748B', '#F8FAFC', '#334155']
        : ['#FED7AA', '#EA580C', '#9A3412', '#FFEDD5', '#7C2D12'];

  const g = ctx.createRadialGradient(S * 0.38, S * 0.35, 6, S / 2, S / 2, S / 2);
  g.addColorStop(0, stops[0]);
  g.addColorStop(0.65, stops[1]);
  g.addColorStop(1, stops[2]);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);

  ctx.strokeStyle = stops[3];
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.arc(S / 2, S / 2, 48, 0, Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = stops[4];
  ctx.font = `900 50px ${CANVAS_FONT_DISPLAY}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('★', S / 2, S / 2 + 2);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

export function createGoldCoinTopTexture(maxAnisotropy: number): THREE.CanvasTexture {
  return createMetallicCoinTopTexture('gold', maxAnisotropy);
}

export function createCardDeckTopTexture(
  deckType: 'CHANCE' | 'CHEST',
  maxAnisotropy: number
): THREE.CanvasTexture {
  const W = 512;
  const H = 320;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;

  const isChance = deckType === 'CHANCE';
  const grad = ctx.createLinearGradient(0, 0, W, H);
  if (isChance) {
    grad.addColorStop(0, '#FF5C93');
    grad.addColorStop(0.5, '#FF8A3D');
    grad.addColorStop(1, '#FBBF24');
  } else {
    grad.addColorStop(0, '#29B6F6');
    grad.addColorStop(1, '#0288D1');
  }
  ctx.fillStyle = grad;
  roundRect(ctx, 0, 0, W, H, 28);
  ctx.fill();

  ctx.strokeStyle = '#FFFFFF';
  ctx.lineWidth = 12;
  roundRect(ctx, 18, 18, W - 36, H - 36, 20);
  ctx.stroke();

  ctx.fillStyle = 'rgba(255, 255, 255, 0.28)';
  ctx.beginPath();
  ctx.arc(W / 2, H / 2, 94, 0, Math.PI * 2);
  ctx.fill();

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#FFFFFF';
  ctx.font = `900 152px ${CANVAS_FONT_DISPLAY}`;
  ctx.fillText('?', W / 2, H / 2 + 6);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

export function createBoulevardRoadTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const S = 256;
  const canvas = document.createElement('canvas');
  canvas.width = S;
  canvas.height = S;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#F4F5F7';
  ctx.fillRect(0, 0, S, S);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

/**
 * Creates 6 high-saturation Glossy Hot-Pink (#FF2975 -> #C2185B) 3D Clearcoat PBR dice face materials
 * with spherical recessed pip bump maps matching DICE_BOX_FACE_VALUES: [2, 5, 1, 6, 3, 4].
 */
export function createDiceFaceMaterials(
  faceValues: [number, number, number, number, number, number],
  maxAnisotropy: number
): THREE.MeshPhysicalMaterial[] {
  const pipCoords: Record<number, Array<[number, number]>> = {
    1: [[0.5, 0.5]],
    2: [
      [0.27, 0.27],
      [0.73, 0.73],
    ],
    3: [
      [0.24, 0.24],
      [0.5, 0.5],
      [0.76, 0.76],
    ],
    4: [
      [0.27, 0.27],
      [0.73, 0.27],
      [0.27, 0.73],
      [0.73, 0.73],
    ],
    5: [
      [0.25, 0.25],
      [0.75, 0.25],
      [0.5, 0.5],
      [0.25, 0.75],
      [0.75, 0.75],
    ],
    6: [
      [0.27, 0.22],
      [0.73, 0.22],
      [0.27, 0.5],
      [0.73, 0.5],
      [0.27, 0.78],
      [0.73, 0.78],
    ],
  };

  return faceValues.map((val) => {
    const size = 384;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;

    // Seamless rich hot-pink base (blends cleanly onto RoundedBoxGeometry bevels!)
    const faceGrad = ctx.createRadialGradient(
      size * 0.35,
      size * 0.3,
      18,
      size / 2,
      size / 2,
      size * 0.72
    );
    faceGrad.addColorStop(0, '#FF5C97');
    faceGrad.addColorStop(0.58, '#E91E63');
    faceGrad.addColorStop(1, '#B8144D');
    ctx.fillStyle = faceGrad;
    ctx.fillRect(0, 0, size, size);

    // Subtle glossy inner cushion highlight
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.34)';
    ctx.lineWidth = 5;
    roundRect(ctx, 22, 22, size - 44, size - 44, 54);
    ctx.stroke();

    // Concave dimple bump canvas
    const bumpCanvas = document.createElement('canvas');
    bumpCanvas.width = size;
    bumpCanvas.height = size;
    const bctx = bumpCanvas.getContext('2d')!;
    bctx.fillStyle = '#B0B0B0';
    bctx.fillRect(0, 0, size, size);

    const radius = val === 1 ? 56 : 38;

    for (const [px, py] of pipCoords[val]) {
      const cx = px * size;
      const cy = py * size;

      // Ambient shadow ring inside dimple
      ctx.fillStyle = 'rgba(112, 10, 58, 0.52)';
      ctx.beginPath();
      ctx.arc(cx, cy + 3, radius + 4, 0, Math.PI * 2);
      ctx.fill();

      // Pearl-white 3D pip gradient
      const pipGrad = ctx.createRadialGradient(
        cx - radius * 0.25,
        cy - radius * 0.25,
        4,
        cx,
        cy,
        radius
      );
      pipGrad.addColorStop(0, '#FFFFFF');
      pipGrad.addColorStop(0.78, '#F8FAFC');
      pipGrad.addColorStop(1, '#E2E8F0');
      ctx.fillStyle = pipGrad;
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.fill();

      // Gold center ring on the Ace ("1") pip — classic luxury casino/Business Tour touch!
      if (val === 1) {
        ctx.strokeStyle = '#FACC15';
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.arc(cx, cy, radius - 9, 0, Math.PI * 2);
        ctx.stroke();
      }

      // Spherical concave bump gradient
      const bg = bctx.createRadialGradient(cx, cy, 2, cx, cy, radius + 5);
      bg.addColorStop(0, '#282828');
      bg.addColorStop(0.75, '#585858');
      bg.addColorStop(1, '#B0B0B0');
      bctx.fillStyle = bg;
      bctx.beginPath();
      bctx.arc(cx, cy, radius + 5, 0, Math.PI * 2);
      bctx.fill();
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = maxAnisotropy;

    const bumpTex = new THREE.CanvasTexture(bumpCanvas);
    bumpTex.anisotropy = maxAnisotropy;

    return new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      map: tex,
      bumpMap: bumpTex,
      bumpScale: 0.022,
      roughness: 0.18,
      metalness: 0.04,
      clearcoat: 0.94,
      clearcoatRoughness: 0.09,
    });
  });
}

export function createWoodGrainBumpMap(): THREE.CanvasTexture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#808080';
  ctx.fillRect(0, 0, size, size);

  for (let y = 0; y < size; y += 2) {
    const wave = Math.round(128 + Math.sin(y * 0.28) * 10);
    ctx.fillStyle = `rgb(${wave},${wave},${wave})`;
    ctx.fillRect(0, y, size, 2);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

export function createStonePaperBumpMap(): THREE.CanvasTexture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#808080';
  ctx.fillRect(0, 0, size, size);

  for (let y = 0; y < size; y += 4) {
    for (let x = 0; x < size; x += 4) {
      const hash = ((x * 37 + y * 91) % 13) - 6;
      const v = 128 + hash;
      ctx.fillStyle = `rgb(${v},${v},${v})`;
      ctx.fillRect(x, y, 4, 4);
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(3, 3);
  return tex;
}
