import * as THREE from 'three';
import { ColorGroup, TileDefinition, TileKind } from '../game/types';

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
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.96)';
  ctx.lineWidth = 6;
  lines.forEach((line, idx) => {
    const ly = startY - totalH / 2 + idx * lineHeight;
    ctx.strokeText(line, cx, ly);
    ctx.fillText(line, cx, ly);
  });
  ctx.restore();
}

function addSubtleStoneMicroGrid(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  seedOffset = 0
): void {
  ctx.save();
  for (let i = 0; i < 44; i++) {
    const gx = ((i * 97 + seedOffset * 31) % (W - 48)) + 24;
    const gy = ((i * 151 + seedOffset * 53) % (H - 48)) + 24;
    ctx.fillStyle =
      i % 2 === 0 ? 'rgba(148, 163, 184, 0.08)' : 'rgba(255, 255, 255, 0.7)';
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
      return { topHex: '#B45309', bottomHex: '#92400E', emblemHex: '#78350F' };
    case ColorGroup.CYAN:
      return { topHex: '#0EA5E9', bottomHex: '#0284C7', emblemHex: '#0369A1' };
    case ColorGroup.PINK:
      return { topHex: '#EC4899', bottomHex: '#DB2777', emblemHex: '#BE185D' };
    case ColorGroup.ORANGE:
      return { topHex: '#FB923C', bottomHex: '#EA580C', emblemHex: '#C2410C' };
    case ColorGroup.RED:
      return { topHex: '#F43F5E', bottomHex: '#E11D48', emblemHex: '#BE123C' };
    case ColorGroup.EMERALD:
      return { topHex: '#10B981', bottomHex: '#059669', emblemHex: '#047857' };
    default:
      return {
        topHex: fallbackHex || '#38BDF8',
        bottomHex: fallbackHex || '#0284C7',
        emblemHex: fallbackHex || '#0369A1',
      };
  }
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

  // Outer white-gold rim
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

    // Rim peg stud
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

  // Center glossy gold hub
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
  ctx.font = '900 48px "Be Vietnam Pro", "Plus Jakarta Sans", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(centerSymbol, cx, cy + 3);

  // Top pointer clapper triangle
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
  cy: number,
  tileIndex: number
): void {
  ctx.save();

  if (kind === TileKind.CHANCE) {
    drawRainbowSpinWheel(ctx, cx, cy + 6, 112, '?');
  } else if (kind === TileKind.CHEST) {
    drawRainbowSpinWheel(ctx, cx, cy + 6, 112, '★');
  } else if (kind === TileKind.TRANSPORT) {
    const isAirport = tileIndex === 20;
    const medalGrad = ctx.createLinearGradient(cx, cy - 94, cx, cy + 94);
    medalGrad.addColorStop(0, '#38BDF8');
    medalGrad.addColorStop(1, '#0284C7');
    ctx.fillStyle = medalGrad;
    ctx.beginPath();
    ctx.arc(cx, cy, 96, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 7;
    ctx.stroke();

    if (isAirport) {
      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath();
      ctx.moveTo(cx, cy - 58);
      ctx.lineTo(cx + 13, cy - 16);
      ctx.lineTo(cx + 60, cy + 8);
      ctx.lineTo(cx + 60, cy + 22);
      ctx.lineTo(cx + 13, cy + 11);
      ctx.lineTo(cx + 10, cy + 42);
      ctx.lineTo(cx + 26, cy + 54);
      ctx.lineTo(cx + 26, cy + 62);
      ctx.lineTo(cx, cy + 53);
      ctx.lineTo(cx - 26, cy + 62);
      ctx.lineTo(cx - 26, cy + 54);
      ctx.lineTo(cx - 10, cy + 42);
      ctx.lineTo(cx - 13, cy + 11);
      ctx.lineTo(cx - 60, cy + 22);
      ctx.lineTo(cx - 60, cy + 8);
      ctx.lineTo(cx - 13, cy - 16);
      ctx.closePath();
      ctx.fill();
    } else {
      ctx.fillStyle = '#FFFFFF';
      roundRect(ctx, cx - 42, cy - 48, 84, 88, 16);
      ctx.fill();
      ctx.fillStyle = '#EF4444';
      ctx.fillRect(cx - 42, cy - 2, 84, 14);
      ctx.fillStyle = '#0F172A';
      roundRect(ctx, cx - 30, cy - 34, 60, 24, 6);
      ctx.fill();
      ctx.fillStyle = '#FACC15';
      ctx.beginPath();
      ctx.arc(cx - 18, cy + 24, 7.5, 0, Math.PI * 2);
      ctx.arc(cx + 18, cy + 24, 7.5, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (kind === TileKind.UTILITY) {
    const utilGrad = ctx.createRadialGradient(cx, cy - 16, 10, cx, cy, 96);
    utilGrad.addColorStop(0, '#FEF08A');
    utilGrad.addColorStop(1, '#F59E0B');
    ctx.fillStyle = utilGrad;
    ctx.beginPath();
    ctx.arc(cx, cy, 94, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 7;
    ctx.stroke();

    ctx.fillStyle = '#1E293B';
    ctx.beginPath();
    ctx.moveTo(cx + 12, cy - 56);
    ctx.lineTo(cx - 32, cy + 4);
    ctx.lineTo(cx + 2, cy + 4);
    ctx.lineTo(cx - 12, cy + 56);
    ctx.lineTo(cx + 34, cy - 6);
    ctx.lineTo(cx + 2, cy - 6);
    ctx.closePath();
    ctx.fill();
  } else if (kind === TileKind.TAX) {
    const taxGrad = ctx.createRadialGradient(cx, cy - 16, 10, cx, cy, 96);
    taxGrad.addColorStop(0, '#FB7185');
    taxGrad.addColorStop(1, '#E11D48');
    ctx.fillStyle = taxGrad;
    ctx.beginPath();
    ctx.arc(cx, cy, 94, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 7;
    ctx.stroke();

    ctx.fillStyle = '#FFFFFF';
    ctx.font = '900 84px "Be Vietnam Pro", "Plus Jakarta Sans", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('%', cx, cy + 4);
  }

  ctx.restore();
}

/**
 * Business Tour Extruded #F4F5F7 Off-White Stone/Plastic Block Top Texture.
 * - Property name sits cleanly centered on the #F4F5F7 block surface (inner half reserved for full-color 3D buildings!).
 * - Chance/Chest tiles feature colorful rainbow spinning-wheel decals.
 * - 4 Corner tiles feature themed floor pads supporting their 3D dioramas.
 */
export function createTileTopTexture(
  tile: TileDefinition,
  maxAnisotropy: number,
  flipReadability = false
): THREE.CanvasTexture {
  const isCorner =
    tile.kind === TileKind.START ||
    tile.kind === TileKind.JAIL ||
    tile.kind === TileKind.FREE_PARKING ||
    tile.kind === TileKind.GO_TO_JAIL;

  const canvas = document.createElement('canvas');
  canvas.width = isCorner ? 640 : 512;
  canvas.height = isCorner ? 640 : 768;
  const ctx = canvas.getContext('2d')!;

  const W = canvas.width;
  const H = canvas.height;

  // 1. Crisp #D6DCE5 bevel rim + #F4F5F7 light gray/off-white block surface
  ctx.fillStyle = '#D6DCE5';
  ctx.fillRect(0, 0, W, H);

  const bodyGrad = ctx.createLinearGradient(0, 0, W, H);
  bodyGrad.addColorStop(0, '#F9FAFB');
  bodyGrad.addColorStop(0.55, '#F4F5F7');
  bodyGrad.addColorStop(1, '#EAEEF3');
  ctx.fillStyle = bodyGrad;
  roundRect(ctx, 14, 14, W - 28, H - 28, 22);
  ctx.fill();

  addSubtleStoneMicroGrid(ctx, W, H, tile.index);

  ctx.strokeStyle = '#E2E8F0';
  ctx.lineWidth = 5;
  roundRect(ctx, 24, 24, W - 48, H - 48, 16);
  ctx.stroke();

  if (isCorner) {
    ctx.save();
    if (flipReadability) {
      ctx.translate(W / 2, H / 2);
      ctx.rotate(Math.PI);
      ctx.translate(-W / 2, -H / 2);
    }

    if (tile.kind === TileKind.START) {
      // Red/Green celebratory floor pad beneath the 3D START Arch
      const padGrad = ctx.createLinearGradient(56, 56, W - 56, H - 56);
      padGrad.addColorStop(0, '#22C55E');
      padGrad.addColorStop(0.5, '#16A34A');
      padGrad.addColorStop(1, '#EF4444');
      ctx.fillStyle = padGrad;
      roundRect(ctx, 48, 48, W - 96, H - 96, 36);
      ctx.fill();

      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 10;
      roundRect(ctx, 64, 64, W - 128, H - 128, 28);
      ctx.stroke();

      // White celebratory directional chevron
      ctx.fillStyle = 'rgba(255,255,255,0.92)';
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
      ctx.font = '900 66px "Be Vietnam Pro", "Plus Jakarta Sans", sans-serif';
      ctx.fillText('BẮT ĐẦU', W / 2, 148);

      ctx.fillStyle = '#FEF08A';
      ctx.font = '800 42px "JetBrains Mono", "Be Vietnam Pro", sans-serif';
      ctx.fillText('+600K', W / 2, 520);
    } else if (tile.kind === TileKind.JAIL) {
      // Tropical Lost Island turquoise lagoon water rim + warm sandy shore pad
      const waterGrad = ctx.createRadialGradient(W / 2, H / 2, 70, W / 2, H / 2, 275);
      waterGrad.addColorStop(0, '#67E8F9');
      waterGrad.addColorStop(0.65, '#06B6D4');
      waterGrad.addColorStop(1, '#0284C7');
      ctx.fillStyle = waterGrad;
      roundRect(ctx, 44, 44, W - 88, H - 88, 42);
      ctx.fill();

      // White ocean surf foam ring
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.82)';
      ctx.lineWidth = 10;
      ctx.beginPath();
      ctx.arc(W / 2, H / 2, 198, 0, Math.PI * 2);
      ctx.stroke();

      // Sandy beach center
      ctx.fillStyle = '#FDE68A';
      ctx.beginPath();
      ctx.arc(W / 2, H / 2, 168, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#FFFFFF';
      ctx.font = '900 44px "Be Vietnam Pro", "Plus Jakarta Sans", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('ĐẢO HOANG', W / 2, 566);
    } else if (tile.kind === TileKind.FREE_PARKING) {
      // World Championships Stadium plaza pad
      ctx.fillStyle = '#E2E8F0';
      roundRect(ctx, 48, 48, W - 96, H - 96, 36);
      ctx.fill();

      ctx.fillStyle = '#65C434';
      ctx.beginPath();
      ctx.arc(W / 2, H / 2 - 12, 188, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#FACC15';
      ctx.lineWidth = 10;
      ctx.stroke();

      ctx.fillStyle = '#0F172A';
      ctx.font = '900 44px "Be Vietnam Pro", "Plus Jakarta Sans", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('LỄ HỘI CÚP', W / 2, 566);
    } else if (tile.kind === TileKind.GO_TO_JAIL) {
      // World Tour Airport diagonal asphalt apron & runway markings
      ctx.fillStyle = '#475569';
      roundRect(ctx, 48, 48, W - 96, H - 96, 36);
      ctx.fill();

      ctx.save();
      ctx.translate(W / 2, H / 2);
      ctx.rotate(-Math.PI / 4);
      ctx.fillStyle = '#1E293B';
      roundRect(ctx, -230, -68, 460, 136, 18);
      ctx.fill();

      ctx.strokeStyle = '#F8FAFC';
      ctx.lineWidth = 8;
      ctx.setLineDash([28, 22]);
      ctx.beginPath();
      ctx.moveTo(-190, 0);
      ctx.lineTo(190, 0);
      ctx.stroke();
      ctx.restore();

      ctx.fillStyle = '#FFFFFF';
      ctx.font = '900 46px "Be Vietnam Pro", "Plus Jakarta Sans", sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('DU LỊCH', W / 2, 562);
    }
    ctx.restore();
  } else if (tile.kind === TileKind.PROPERTY) {
    const pal = resolveDeedGroupPalette(tile.group, tile.groupColor);

    // Subtle recessed architectural foundation pad on the inner half (y = 38..304) where 3D buildings sit
    ctx.fillStyle = '#E8ECF2';
    roundRect(ctx, 36, 38, W - 72, 256, 18);
    ctx.fill();
    ctx.strokeStyle = '#D5DCE6';
    ctx.lineWidth = 4;
    ctx.stroke();

    // Small crisp group-color indicator pill bar separating building plot from city name
    ctx.fillStyle = pal.topHex;
    roundRect(ctx, 96, 314, W - 192, 18, 9);
    ctx.fill();

    // Centered bold dark-slate city name on the #F4F5F7 tile surface
    ctx.save();
    if (flipReadability) {
      ctx.translate(W / 2, 526);
      ctx.rotate(Math.PI);
      ctx.translate(-W / 2, -526);
    }

    ctx.fillStyle = '#1E293B';
    ctx.font = '900 76px "Be Vietnam Pro", "Plus Jakarta Sans", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    drawWrappedTitle(ctx, tile.name, W / 2, 512, W - 56, 84);

    if (tile.groupLabel) {
      ctx.fillStyle = '#64748B';
      ctx.font = '800 28px "Be Vietnam Pro", "Plus Jakarta Sans", sans-serif';
      ctx.fillText(tile.groupLabel.toUpperCase(), W / 2, 682);
    }
    ctx.restore();
  } else {
    // Functional Tile (Chance, Chest, Transport, Utility, Tax)
    ctx.save();
    if (flipReadability) {
      ctx.translate(W / 2, H / 2);
      ctx.rotate(Math.PI);
      ctx.translate(-W / 2, -H / 2);
    }

    ctx.fillStyle = '#1E293B';
    ctx.font = '900 62px "Be Vietnam Pro", "Plus Jakarta Sans", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    drawWrappedTitle(ctx, tile.name, W / 2, 146, W - 56, 68);

    drawFunctionalArtwork(ctx, tile.kind, W / 2, 438, tile.index);

    if (tile.kind === TileKind.CHANCE || tile.kind === TileKind.CHEST) {
      const isChance = tile.kind === TileKind.CHANCE;
      ctx.fillStyle = isChance ? '#EA580C' : '#0284C7';
      ctx.font = '900 38px "Be Vietnam Pro", "Plus Jakarta Sans", sans-serif';
      ctx.fillText(isChance ? 'VÒNG QUAY CƠ HỘI' : 'VÒNG QUAY KHÍ VẬN', W / 2, H - 92);
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
 * High-readability top texture for the protruding 3D Business Tour Price Tab
 * extending OUTWARD from the outer edge of each property/purchasable/tax tile.
 * Uses bold dark-slate (#1E293B) shorthand typography (180K, 660K, 1.2M) on a crisp off-white
 * inner plate framed by either crisp stone-slate (unowned) or vibrant owner color!
 */
export function createOuterPriceTabTexture(
  label: string,
  accentHex: string,
  ownerHex: string | null,
  isMortgaged: boolean,
  flip180: boolean,
  maxAnisotropy: number
): THREE.CanvasTexture {
  const W = 320;
  const H = 192;
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

  // Outer 3D tab frame (owner signature color when owned, crisp #D5DCE6 when unowned)
  ctx.fillStyle = isMortgaged
    ? '#64748B'
    : ownerHex
      ? ownerHex
      : isNegative
        ? '#FB7185'
        : '#D5DCE6';
  ctx.fillRect(0, 0, W, H);

  // Inner #F4F5F7 sculpted off-white plate so dark-slate shorthand is readable at a glance!
  if (isMortgaged) {
    ctx.fillStyle = '#475569';
  } else if (isNegative) {
    ctx.fillStyle = '#FFF1F2';
  } else {
    const g = ctx.createLinearGradient(0, 12, 0, H - 12);
    g.addColorStop(0, '#FFFFFF');
    g.addColorStop(1, '#F1F5F9');
    ctx.fillStyle = g;
  }
  const pad = ownerHex ? 16 : 10;
  roundRect(ctx, pad, pad, W - pad * 2, H - pad * 2, 20);
  ctx.fill();

  // Top color accent strip linking tab to its city group / owner
  ctx.fillStyle = isMortgaged ? '#94A3B8' : ownerHex || accentHex;
  roundRect(ctx, 26, 16, W - 52, 16, 8);
  ctx.fill();

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  if (isMortgaged) {
    ctx.fillStyle = '#E2E8F0';
    ctx.font = '900 46px "Be Vietnam Pro", "Plus Jakarta Sans", sans-serif';
    ctx.fillText('THẾ CHẤP', W / 2, H / 2 + 10);
  } else {
    ctx.fillStyle = isNegative ? '#BE123C' : '#1E293B';
    const labelFontPx = label.length >= 5 ? 74 : 86;
    ctx.font = `900 ${labelFontPx}px "JetBrains Mono", "Be Vietnam Pro", sans-serif`;
    ctx.fillText(label, W / 2, H / 2 + 12);
  }

  ctx.restore();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Clean square level badge ("1", "2", "3", "4") shown above upgraded or hovered owned tiles.
 */
export function createLevelBadgeTexture(
  level: number,
  ownerHex: string,
  maxAnisotropy: number
): THREE.CanvasTexture {
  const S = 128;
  const canvas = document.createElement('canvas');
  canvas.width = S;
  canvas.height = S;
  const ctx = canvas.getContext('2d')!;

  ctx.clearRect(0, 0, S, S);

  // Crisp white outer rounded-square border
  ctx.fillStyle = '#FFFFFF';
  roundRect(ctx, 8, 8, S - 16, S - 16, 24);
  ctx.fill();

  // Vibrant owner-colored inner badge square
  ctx.fillStyle = ownerHex || '#29B6F6';
  roundRect(ctx, 16, 16, S - 32, S - 32, 18);
  ctx.fill();

  // Subtle top glossy highlight
  ctx.fillStyle = 'rgba(255,255,255,0.28)';
  roundRect(ctx, 20, 20, S - 40, (S - 40) * 0.45, 12);
  ctx.fill();

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = 'rgba(15, 23, 42, 0.55)';
  ctx.lineWidth = 6;
  ctx.fillStyle = '#FFFFFF';
  ctx.font = '900 72px "JetBrains Mono", "Be Vietnam Pro", sans-serif';
  const text = level >= 4 ? '★' : String(Math.max(1, level));
  ctx.strokeText(text, S / 2, S / 2 + 4);
  ctx.fillText(text, S / 2, S / 2 + 4);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Business Tour Sunken Courtyard Grass Texture (#8CD756 to #A3E66A)
 * featuring a subtle checker + mown lawn stripe texture and NO center dice ring.
 */
export function createBusinessTourPitchTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const S = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = S;
  canvas.height = S;
  const ctx = canvas.getContext('2d')!;

  // Base bright lime-green (#7ED348 calibrates under bright GI to #8CD756..#A3E66A!)
  ctx.fillStyle = '#7ED348';
  ctx.fillRect(0, 0, S, S);

  // Subtle checker grid squares across the sunken grass courtyard
  const cell = 128;
  for (let gy = 0; gy < S; gy += cell) {
    for (let gx = 0; gx < S; gx += cell) {
      const isAlt = ((gx / cell + gy / cell) & 1) === 0;
      ctx.fillStyle = isAlt
        ? 'rgba(182, 248, 126, 0.22)'
        : 'rgba(104, 188, 52, 0.12)';
      ctx.fillRect(gx, gy, cell, cell);
    }
  }

  // Diagonal soft lawn-mower sheen bands
  const stripeW = 128;
  ctx.save();
  for (let d = -S; d < S * 2; d += stripeW * 2) {
    ctx.fillStyle = 'rgba(215, 255, 168, 0.11)';
    ctx.beginPath();
    ctx.moveTo(d, 0);
    ctx.lineTo(d + stripeW, 0);
    ctx.lineTo(d + stripeW - S, S);
    ctx.lineTo(d - S, S);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();

  // Crisp subtle white inner chalk border inside the sunken courtyard walls
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.72)';
  ctx.lineWidth = 6;
  roundRect(ctx, 36, 36, S - 72, S - 72, 22);
  ctx.stroke();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

/**
 * Generates crisp alpha-cutout layers for the Center Grass Flat-Shaded Bold White 3D Tax/Pot Text
 * (e.g., "660 000", "450 000", "0").
 */
export function create3DTaxGrassTexture(
  taxSpacedText: string,
  layerRole: 'cap' | 'extrude' | 'shadow',
  maxAnisotropy: number
): THREE.CanvasTexture {
  const W = 1024;
  const H = 384;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;

  ctx.clearRect(0, 0, W, H);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';

  const fillStyle =
    layerRole === 'cap'
      ? '#FFFFFF'
      : layerRole === 'extrude'
        ? '#B8C4D4'
        : 'rgba(28, 74, 14, 0.45)';

  ctx.fillStyle = fillStyle;
  ctx.strokeStyle = fillStyle;

  // Clean compact label above center jackpot number
  ctx.font = '900 44px "Be Vietnam Pro", "Plus Jakarta Sans", sans-serif';
  ctx.lineWidth = layerRole === 'extrude' ? 4 : 1;
  ctx.fillText('QUỸ THUẾ', W / 2, 76);

  // Large bold flat-shaded white 3D Tax/Pot value in spaced format (e.g. "660 000" or "0")
  const fontSize = taxSpacedText.length >= 9 ? 164 : 196;
  ctx.font = `900 ${fontSize}px "Be Vietnam Pro", "Plus Jakarta Sans", sans-serif`;
  ctx.lineWidth = layerRole === 'extrude' ? 10 : 3;
  ctx.strokeText(taxSpacedText, W / 2, 236);
  ctx.fillText(taxSpacedText, W / 2, 236);

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
export function createCountdownClockBoardTexture(
  timeStr: string,
  turnNumber: number,
  secondsLeft: number,
  activeColorHex: string,
  maxAnisotropy: number
): THREE.CanvasTexture {
  const W = 512;
  const H = 256;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;

  // Sleek dark-gray digital casing face
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#263238');
  bg.addColorStop(1, '#111827');
  ctx.fillStyle = bg;
  roundRect(ctx, 0, 0, W, H, 24);
  ctx.fill();

  // Top header row with active turn number pill + active player color indicator
  ctx.fillStyle = '#1E293B';
  roundRect(ctx, 18, 16, W - 36, 58, 14);
  ctx.fill();

  ctx.fillStyle = activeColorHex || '#29B6F6';
  roundRect(ctx, 24, 22, 196, 46, 10);
  ctx.fill();

  ctx.fillStyle = '#FFFFFF';
  ctx.font = '900 28px "Be Vietnam Pro", "Plus Jakarta Sans", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(`LƯỢT ${Math.max(1, turnNumber)}`, 122, 46);

  ctx.fillStyle = '#94A3B8';
  ctx.font = '800 24px "JetBrains Mono", "Be Vietnam Pro", sans-serif';
  ctx.fillText('TIMER', 362, 46);

  // Inner digital MM:SS LCD recess
  ctx.fillStyle = '#0B1320';
  roundRect(ctx, 20, 86, W - 40, H - 104, 16);
  ctx.fill();
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.28)';
  ctx.lineWidth = 3;
  ctx.stroke();

  const digitColor =
    secondsLeft <= 5 ? '#FF5252' : secondsLeft <= 10 ? '#FFD740' : '#A3E66A';
  ctx.fillStyle = digitColor;
  ctx.font = '900 116px "JetBrains Mono", "Be Vietnam Pro", monospace';
  ctx.fillText(timeStr, W / 2, 168);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Crisp emerald-green Business Tour banknote face texture for 3D Cash Stacks on left/top outer sides.
 */
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
  ctx.font = '900 30px "JetBrains Mono", sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('★', W / 2, H / 2 + 2);

  ctx.fillStyle = '#14532D';
  ctx.font = '800 18px "JetBrains Mono", sans-serif';
  ctx.fillText('500K', 48, 40);
  ctx.fillText('500K', W - 48, 40);
  ctx.fillText('500K', 48, H - 38);
  ctx.fillText('500K', W - 48, H - 38);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

/**
 * Layered paper banknote stack edge texture for 3D Cash Stacks.
 */
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

/**
 * Embossed Gold / Silver / Bronze Coin face texture for 3D Coin Stacks on the bottom-right outer side.
 */
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
  ctx.font = '900 50px "JetBrains Mono", sans-serif';
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

/**
 * Business Tour Top Texture for 3D Question-Mark Chance Card Stack resting outside the top-left board edge.
 */
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
    grad.addColorStop(0, '#FF6B9D');
    grad.addColorStop(0.5, '#FF8E53');
    grad.addColorStop(1, '#FFB300');
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

  // Central white badge circle with bold '?'
  ctx.fillStyle = 'rgba(255, 255, 255, 0.25)';
  ctx.beginPath();
  ctx.arc(W / 2, H / 2, 92, 0, Math.PI * 2);
  ctx.fill();

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#FFFFFF';
  ctx.font = '900 148px "Be Vietnam Pro", "Plus Jakarta Sans", sans-serif';
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
 * Creates 6 high-saturation Glossy Hot-Pink (#FF2975 -> #E91E63) 3D dice face materials
 * with crisp white pips matching DICE_BOX_FACE_VALUES: [2, 5, 1, 6, 3, 4].
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
    const size = 256;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;

    // Rich magenta-pink bevel edge
    ctx.fillStyle = '#AD1457';
    ctx.fillRect(0, 0, size, size);

    // High-saturation vibrant hot-pink face gradient
    const faceGrad = ctx.createRadialGradient(
      size * 0.36,
      size * 0.32,
      14,
      size / 2,
      size / 2,
      172
    );
    faceGrad.addColorStop(0, '#FF4785');
    faceGrad.addColorStop(0.65, '#E91E63');
    faceGrad.addColorStop(1, '#C2185B');
    ctx.fillStyle = faceGrad;
    roundRect(ctx, 10, 10, size - 20, size - 20, 38);
    ctx.fill();

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
    ctx.lineWidth = 4;
    ctx.stroke();

    const radius = val === 1 ? 38 : 26;

    for (const [px, py] of pipCoords[val]) {
      const cx = px * size;
      const cy = py * size;

      // Subtle inset crimson rim around each white pip
      ctx.fillStyle = 'rgba(136, 14, 79, 0.55)';
      ctx.beginPath();
      ctx.arc(cx, cy + 2, radius + 3, 0, Math.PI * 2);
      ctx.fill();

      // Pure crisp white pip
      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.fill();
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = maxAnisotropy;

    return new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      map: tex,
      roughness: 0.24,
      metalness: 0.06,
      clearcoat: 0.85,
      clearcoatRoughness: 0.14,
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
