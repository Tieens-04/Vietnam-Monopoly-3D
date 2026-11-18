import * as THREE from 'three';
import { TileDefinition, TileKind } from '../game/types';

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
  lines.forEach((line, idx) => {
    ctx.fillText(line, cx, startY - totalH / 2 + idx * lineHeight);
  });
}

function drawStar(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  outerR: number,
  innerR: number,
  points = 5
): void {
  ctx.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? outerR : innerR;
    const angle = (i * Math.PI) / points - Math.PI / 2;
    const px = cx + Math.cos(angle) * r;
    const py = cy + Math.sin(angle) * r;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

function drawPropertyEmblem(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  color: string
): void {
  ctx.save();
  ctx.globalAlpha = 0.13;
  ctx.fillStyle = color;

  // Stylized miniature Vietnamese skyline silhouette
  roundRect(ctx, cx - 72, cy - 8, 36, 56, 6);
  ctx.fill();
  roundRect(ctx, cx - 26, cy - 42, 52, 90, 8);
  ctx.fill();
  roundRect(ctx, cx + 36, cy + 2, 36, 46, 6);
  ctx.fill();

  // Spire crown
  ctx.beginPath();
  ctx.moveTo(cx - 26, cy - 40);
  ctx.lineTo(cx, cy - 66);
  ctx.lineTo(cx + 26, cy - 40);
  ctx.closePath();
  ctx.fill();
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
    // Monopoly GO! Vibrant Orange-Gold Sunburst Medallion + Glossy 3D '?'
    const bgGrad = ctx.createRadialGradient(cx, cy - 20, 12, cx, cy, 108);
    bgGrad.addColorStop(0, '#FEF08A');
    bgGrad.addColorStop(0.6, '#F59E0B');
    bgGrad.addColorStop(1, '#EA580C');
    ctx.fillStyle = bgGrad;
    ctx.beginPath();
    ctx.arc(cx, cy, 98, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 10;
    ctx.strokeStyle = '#FFFBEB';
    ctx.stroke();
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#9A3412';
    ctx.stroke();

    // Drop shadow '?' + Crisp White '?'
    ctx.font = '900 134px "Baloo 2", "Plus Jakarta Sans", Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#7C2D12';
    ctx.fillText('?', cx + 4, cy + 12);
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText('?', cx, cy + 6);
  } else if (kind === TileKind.CHEST) {
    // Monopoly GO! Royal Blue & Gold Overflowing Treasure Vault Chest
    const bgGrad = ctx.createRadialGradient(cx, cy - 20, 12, cx, cy, 106);
    bgGrad.addColorStop(0, '#BAE6FD');
    bgGrad.addColorStop(0.65, '#0284C7');
    bgGrad.addColorStop(1, '#1E3A8A');
    ctx.fillStyle = bgGrad;
    ctx.beginPath();
    ctx.arc(cx, cy, 98, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 10;
    ctx.strokeStyle = '#EFF6FF';
    ctx.stroke();
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#1E3A8A';
    ctx.stroke();

    // Gold coins peeking out
    ctx.fillStyle = '#FACC15';
    for (const [ox, oy] of [
      [-32, -26],
      [-10, -34],
      [14, -32],
      [34, -24],
    ]) {
      ctx.beginPath();
      ctx.arc(cx + ox, cy + oy, 16, 0, Math.PI * 2);
      ctx.fill();
    }

    // Chest body
    ctx.fillStyle = '#92400E';
    roundRect(ctx, cx - 58, cy - 22, 116, 74, 14);
    ctx.fill();
    ctx.strokeStyle = '#FBBF24';
    ctx.lineWidth = 8;
    ctx.stroke();

    // Gold latch
    ctx.fillStyle = '#FEF08A';
    roundRect(ctx, cx - 15, cy - 6, 30, 32, 7);
    ctx.fill();
    ctx.fillStyle = '#78350F';
    ctx.beginPath();
    ctx.arc(cx, cy + 10, 5, 0, Math.PI * 2);
    ctx.fill();
  } else if (kind === TileKind.TRANSPORT) {
    const isAirport = tileIndex === 20;
    const medalGrad = ctx.createLinearGradient(cx, cy - 95, cx, cy + 95);
    medalGrad.addColorStop(0, isAirport ? '#E0F2FE' : '#F1F5F9');
    medalGrad.addColorStop(1, isAirport ? '#7DD3FC' : '#CBD5E1');
    ctx.fillStyle = medalGrad;
    ctx.beginPath();
    ctx.arc(cx, cy, 94, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#0F172A';
    ctx.lineWidth = 9;
    ctx.stroke();

    if (isAirport) {
      // Sleek Sky-Blue & Navy Jetliner
      ctx.fillStyle = '#0F172A';
      ctx.beginPath();
      ctx.moveTo(cx, cy - 62);
      ctx.lineTo(cx + 14, cy - 20);
      ctx.lineTo(cx + 66, cy + 8);
      ctx.lineTo(cx + 66, cy + 24);
      ctx.lineTo(cx + 14, cy + 12);
      ctx.lineTo(cx + 11, cy + 44);
      ctx.lineTo(cx + 30, cy + 56);
      ctx.lineTo(cx + 30, cy + 66);
      ctx.lineTo(cx, cy + 57);
      ctx.lineTo(cx - 30, cy + 66);
      ctx.lineTo(cx - 30, cy + 56);
      ctx.lineTo(cx - 11, cy + 44);
      ctx.lineTo(cx - 14, cy + 12);
      ctx.lineTo(cx - 66, cy + 24);
      ctx.lineTo(cx - 66, cy + 8);
      ctx.lineTo(cx - 14, cy - 20);
      ctx.closePath();
      ctx.fill();
    } else {
      // Express Locomotive with Red-Gold Accent
      ctx.fillStyle = '#1E293B';
      roundRect(ctx, cx - 46, cy - 52, 92, 94, 20);
      ctx.fill();
      ctx.fillStyle = '#EF4444';
      ctx.fillRect(cx - 46, cy - 4, 92, 14);
      ctx.fillStyle = '#BAE6FD';
      roundRect(ctx, cx - 34, cy - 38, 68, 28, 8);
      ctx.fill();
      ctx.fillStyle = '#FACC15';
      ctx.beginPath();
      ctx.arc(cx - 21, cy + 24, 9, 0, Math.PI * 2);
      ctx.arc(cx + 21, cy + 24, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#0F172A';
      ctx.lineWidth = 8;
      ctx.beginPath();
      ctx.moveTo(cx - 28, cy + 44);
      ctx.lineTo(cx - 48, cy + 66);
      ctx.moveTo(cx + 28, cy + 44);
      ctx.lineTo(cx + 48, cy + 66);
      ctx.stroke();
    }
  } else if (kind === TileKind.UTILITY) {
    // Golden Power Crest
    const utilGrad = ctx.createRadialGradient(cx, cy - 16, 10, cx, cy, 94);
    utilGrad.addColorStop(0, '#FEF9C3');
    utilGrad.addColorStop(1, '#FDE047');
    ctx.fillStyle = utilGrad;
    ctx.beginPath();
    ctx.arc(cx, cy, 92, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#CA8A04';
    ctx.lineWidth = 9;
    ctx.stroke();

    ctx.fillStyle = '#EA580C';
    ctx.beginPath();
    ctx.moveTo(cx + 14, cy - 64);
    ctx.lineTo(cx - 36, cy + 6);
    ctx.lineTo(cx + 2, cy + 6);
    ctx.lineTo(cx - 14, cy + 64);
    ctx.lineTo(cx + 40, cy - 8);
    ctx.lineTo(cx + 2, cy - 8);
    ctx.closePath();
    ctx.fill();
  } else if (kind === TileKind.TAX) {
    // Luxury Diamond Ring / Tax Crest
    ctx.fillStyle = '#FFE4E6';
    ctx.beginPath();
    ctx.arc(cx, cy, 90, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#E11D48';
    ctx.lineWidth = 9;
    ctx.stroke();

    // Faceted blue diamond
    ctx.fillStyle = '#38BDF8';
    ctx.strokeStyle = '#0284C7';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(cx - 36, cy - 28);
    ctx.lineTo(cx + 36, cy - 28);
    ctx.lineTo(cx + 56, cy - 2);
    ctx.lineTo(cx, cy + 52);
    ctx.lineTo(cx - 56, cy - 2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}

export function createTileTopTexture(
  tile: TileDefinition,
  maxAnisotropy: number
): THREE.CanvasTexture {
  const isCorner =
    tile.kind === TileKind.START ||
    tile.kind === TileKind.JAIL ||
    tile.kind === TileKind.FREE_PARKING ||
    tile.kind === TileKind.GO_TO_JAIL;

  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = isCorner ? 512 : 704;
  const ctx = canvas.getContext('2d')!;

  const W = canvas.width;
  const H = canvas.height;

  // Classic Monopoly Mint-Cream outer border + crisp dark-ink architectural frame
  ctx.fillStyle = '#D8F1E2';
  ctx.fillRect(0, 0, W, H);

  ctx.fillStyle = '#FFFEFA';
  roundRect(ctx, 14, 14, W - 28, H - 28, 18);
  ctx.fill();

  ctx.strokeStyle = '#1E293B';
  ctx.lineWidth = 8;
  roundRect(ctx, 14, 14, W - 28, H - 28, 18);
  ctx.stroke();

  if (isCorner) {
    if (tile.kind === TileKind.START) {
      // MONOPOLY GO! Vibrant Mint-Gold & Crimson GO! / BẮT ĐẦU Corner
      const grad = ctx.createLinearGradient(0, 0, W, H);
      grad.addColorStop(0, '#ECFDF5');
      grad.addColorStop(0.55, '#D1FAE5');
      grad.addColorStop(1, '#A7F3D0');
      ctx.fillStyle = grad;
      roundRect(ctx, 20, 20, W - 40, H - 40, 14);
      ctx.fill();

      // Big festive GO! / BẮT ĐẦU header
      ctx.textAlign = 'center';
      ctx.font = '900 102px "Baloo 2", "Plus Jakarta Sans", Arial, sans-serif';
      ctx.fillStyle = '#991B1B';
      ctx.fillText('GO!', W / 2 + 4, 134);
      ctx.fillStyle = '#EF4444';
      ctx.fillText('GO!', W / 2, 128);

      ctx.fillStyle = '#064E3B';
      ctx.font = '900 54px "Plus Jakarta Sans", Arial, sans-serif';
      ctx.fillText('BẮT ĐẦU', W / 2, 202);

      // Gold salary ribbon
      ctx.fillStyle = '#F59E0B';
      roundRect(ctx, 88, 226, W - 176, 62, 16);
      ctx.fill();
      ctx.fillStyle = '#FFFBEB';
      ctx.font = '900 38px "Plus Jakarta Sans", Arial, sans-serif';
      ctx.fillText('NHẬN +$200', W / 2, 269);

      // Bold 3D-outlined crimson arrow pointing clockwise
      ctx.fillStyle = '#DC2626';
      ctx.strokeStyle = '#7F1D1D';
      ctx.lineWidth = 8;
      ctx.beginPath();
      ctx.moveTo(410, 356);
      ctx.lineTo(192, 356);
      ctx.lineTo(192, 310);
      ctx.lineTo(96, 384);
      ctx.lineTo(192, 458);
      ctx.lineTo(192, 412);
      ctx.lineTo(410, 412);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    } else if (tile.kind === TileKind.JAIL) {
      // Inner cell = NHÀ TÙ (vibrant orange-amber), outer L-corridor = THĂM TÙ
      ctx.fillStyle = '#F1F5F9';
      roundRect(ctx, 20, 20, W - 40, H - 40, 14);
      ctx.fill();

      const cellGrad = ctx.createLinearGradient(130, 34, 476, 344);
      cellGrad.addColorStop(0, '#FFEDD5');
      cellGrad.addColorStop(1, '#FDBA74');
      ctx.fillStyle = cellGrad;
      roundRect(ctx, 132, 34, 346, 310, 20);
      ctx.fill();
      ctx.strokeStyle = '#C2410C';
      ctx.lineWidth = 10;
      ctx.stroke();

      // Metallic iron bars with highlight
      for (let bx = 186; bx <= 426; bx += 60) {
        ctx.strokeStyle = '#0F172A';
        ctx.lineWidth = 14;
        ctx.beginPath();
        ctx.moveTo(bx, 114);
        ctx.lineTo(bx, 294);
        ctx.stroke();

        ctx.strokeStyle = '#64748B';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(bx - 3, 114);
        ctx.lineTo(bx - 3, 294);
        ctx.stroke();
      }

      ctx.fillStyle = '#7C2D12';
      ctx.font = '900 46px "Plus Jakarta Sans", Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('NHÀ TÙ', 305, 92);

      ctx.fillStyle = '#0F172A';
      ctx.font = '900 46px "Plus Jakarta Sans", Arial, sans-serif';
      ctx.fillText('THĂM TÙ', W / 2 + 18, 444);
    } else if (tile.kind === TileKind.FREE_PARKING) {
      const fpGrad = ctx.createLinearGradient(0, 0, W, H);
      fpGrad.addColorStop(0, '#FEF9C3');
      fpGrad.addColorStop(1, '#FDE047');
      ctx.fillStyle = fpGrad;
      roundRect(ctx, 20, 20, W - 40, H - 40, 14);
      ctx.fill();

      // Glossy red Monopoly GO! Parking Shield
      ctx.fillStyle = '#DC2626';
      roundRect(ctx, W / 2 - 92, 130, 184, 176, 38);
      ctx.fill();
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 8;
      ctx.stroke();

      ctx.fillStyle = '#FFFFFF';
      ctx.font = '900 120px "Baloo 2", "Plus Jakarta Sans", Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('P', W / 2, 224);

      ctx.textBaseline = 'alphabetic';
      ctx.fillStyle = '#0F172A';
      ctx.font = '900 48px "Plus Jakarta Sans", Arial, sans-serif';
      ctx.fillText('BÃI ĐỖ XE', W / 2, 96);
      ctx.fillStyle = '#991B1B';
      ctx.font = '900 42px "Plus Jakarta Sans", Arial, sans-serif';
      ctx.fillText('MIỄN PHÍ', W / 2, 396);
    } else if (tile.kind === TileKind.GO_TO_JAIL) {
      const gtjGrad = ctx.createLinearGradient(0, 0, W, H);
      gtjGrad.addColorStop(0, '#DBEAFE');
      gtjGrad.addColorStop(1, '#FEE2E2');
      ctx.fillStyle = gtjGrad;
      roundRect(ctx, 20, 20, W - 40, H - 40, 14);
      ctx.fill();

      // Police siren medallion
      ctx.fillStyle = '#1D4ED8';
      ctx.beginPath();
      ctx.arc(W / 2, 232, 102, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#FBBF24';
      ctx.lineWidth = 10;
      ctx.stroke();

      ctx.fillStyle = '#EF4444';
      ctx.beginPath();
      ctx.arc(W / 2, 232, 70, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#FFFFFF';
      ctx.font = '900 100px "Baloo 2", "Plus Jakarta Sans", Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('!', W / 2, 236);

      ctx.textBaseline = 'alphabetic';
      ctx.fillStyle = '#991B1B';
      ctx.font = '900 58px "Plus Jakarta Sans", Arial, sans-serif';
      ctx.fillText('VÀO TÙ', W / 2, 98);
      ctx.fillStyle = '#0F172A';
      ctx.font = '800 38px "Plus Jakarta Sans", Arial, sans-serif';
      ctx.fillText('ĐI THẲNG TỚI TÙ', W / 2, 418);
    }
  } else if (tile.kind === TileKind.PROPERTY) {
    // Glossy 3D-shaded Color Group Header Ribbon (Monopoly GO! style)
    const headerH = 192;
    const baseHex = tile.groupColor || '#3B82F6';
    ctx.fillStyle = baseHex;
    roundRect(ctx, 20, 20, W - 40, headerH, 12);
    ctx.fill();

    // Top specular sheen across color band
    const sheenGrad = ctx.createLinearGradient(0, 20, 0, 105);
    sheenGrad.addColorStop(0, 'rgba(255, 255, 255, 0.36)');
    sheenGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = sheenGrad;
    roundRect(ctx, 24, 24, W - 48, 72, 10);
    ctx.fill();

    // Crisp inner white pin-stripe & dark divider under color band
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)';
    ctx.lineWidth = 4;
    roundRect(ctx, 30, 30, W - 60, headerH - 20, 8);
    ctx.stroke();

    ctx.fillStyle = '#0F172A';
    ctx.fillRect(18, 20 + headerH, W - 36, 8);

    // Subtle skyline watermark in center
    drawPropertyEmblem(ctx, W / 2, 444, baseHex);

    // Bold high-contrast Vietnamese city name
    ctx.fillStyle = '#0F172A';
    ctx.font = '800 66px "Plus Jakarta Sans", "Segoe UI", Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    drawWrappedTitle(ctx, tile.name, W / 2, 334, W - 64, 74);

    // Gold-trimmed Royal Navy Price Plaque at bottom
    ctx.fillStyle = '#0F2342';
    roundRect(ctx, 56, H - 154, W - 112, 108, 22);
    ctx.fill();
    ctx.strokeStyle = '#F59E0B';
    ctx.lineWidth = 6;
    ctx.stroke();

    ctx.fillStyle = '#FEF08A';
    ctx.font = '800 62px "Baloo 2", "Plus Jakarta Sans", Arial, sans-serif';
    ctx.fillText(`$${tile.price}`, W / 2, H - 96);
  } else {
    // Functional tile (Chance, Chest, Transport, Utility, Tax)
    ctx.fillStyle = '#0F172A';
    ctx.font = '800 56px "Plus Jakarta Sans", "Segoe UI", Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    drawWrappedTitle(ctx, tile.name, W / 2, 126, W - 56, 64);

    drawFunctionalArtwork(ctx, tile.kind, W / 2, 366, tile.index);

    if (tile.price) {
      ctx.fillStyle = '#0F2342';
      roundRect(ctx, 58, H - 148, W - 116, 104, 22);
      ctx.fill();
      ctx.strokeStyle = '#F59E0B';
      ctx.lineWidth = 6;
      ctx.stroke();
      ctx.fillStyle = '#FEF08A';
      ctx.font = '800 58px "Baloo 2", "Plus Jakarta Sans", Arial, sans-serif';
      ctx.fillText(`$${tile.price}`, W / 2, H - 94);
    } else if (tile.taxAmount) {
      ctx.fillStyle = '#991B1B';
      roundRect(ctx, 54, H - 148, W - 108, 104, 22);
      ctx.fill();
      ctx.strokeStyle = '#FCA5A5';
      ctx.lineWidth = 5;
      ctx.stroke();
      ctx.fillStyle = '#FFFFFF';
      ctx.font = '800 56px "Baloo 2", "Plus Jakarta Sans", Arial, sans-serif';
      ctx.fillText(`-$${tile.taxAmount}`, W / 2, H - 94);
    } else {
      ctx.fillStyle = tile.kind === TileKind.CHANCE ? '#B45309' : '#1D4ED8';
      ctx.font = '800 40px "Plus Jakarta Sans", Arial, sans-serif';
      ctx.fillText(
        tile.kind === TileKind.CHANCE ? 'RÚT THẺ MAY MẮN' : 'QUỸ CỘNG ĐỒNG',
        W / 2,
        H - 88
      );
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Iconic Diagonal Red & Gold "CỜ TỶ PHÚ VIỆT NAM" Centerpiece Banner Plaque
 * (inspired directly by MONOPOLY GO!'s signature diagonal board logo).
 */
export function createMonopolyCenterBannerTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const W = 1024;
  const H = 384;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;

  // Brushed gold outer frame
  const goldGrad = ctx.createLinearGradient(0, 0, W, H);
  goldGrad.addColorStop(0, '#FEF08A');
  goldGrad.addColorStop(0.5, '#F59E0B');
  goldGrad.addColorStop(1, '#B45309');
  ctx.fillStyle = goldGrad;
  roundRect(ctx, 6, 6, W - 12, H - 12, 36);
  ctx.fill();

  // Crisp white inner mat
  ctx.fillStyle = '#FFFFFF';
  roundRect(ctx, 20, 20, W - 40, H - 40, 28);
  ctx.fill();

  // Rich Monopoly crimson inner banner
  const redGrad = ctx.createLinearGradient(0, 32, 0, H - 32);
  redGrad.addColorStop(0, '#EF4444');
  redGrad.addColorStop(0.5, '#DC2626');
  redGrad.addColorStop(1, '#991B1B');
  ctx.fillStyle = redGrad;
  roundRect(ctx, 32, 32, W - 64, H - 64, 22);
  ctx.fill();

  // Subtle glossy top highlight across red plaque
  const gloss = ctx.createLinearGradient(0, 34, 0, 150);
  gloss.addColorStop(0, 'rgba(255,255,255,0.28)');
  gloss.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gloss;
  roundRect(ctx, 38, 38, W - 76, 110, 18);
  ctx.fill();

  // Golden corner stars
  ctx.fillStyle = '#FDE047';
  for (const [sx, sy] of [
    [76, 76],
    [W - 76, 76],
    [76, H - 76],
    [W - 76, H - 76],
  ]) {
    drawStar(ctx, sx, sy, 18, 8, 5);
    ctx.fill();
  }

  // Bold 3D-extruded "CỜ TỶ PHÚ" lettering
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '900 142px "Baloo 2", "Plus Jakarta Sans", Arial, sans-serif';
  ctx.fillStyle = '#450A0A';
  ctx.fillText('CỜ TỶ PHÚ', W / 2 + 6, 168);
  ctx.strokeStyle = '#7F1D1D';
  ctx.lineWidth = 14;
  ctx.strokeText('CỜ TỶ PHÚ', W / 2, 160);
  ctx.fillStyle = '#FFFFFF';
  ctx.fillText('CỜ TỶ PHÚ', W / 2, 160);

  // Golden "VIỆT NAM" sub-ribbon
  ctx.fillStyle = '#FEF08A';
  ctx.font = '800 46px "Plus Jakarta Sans", Arial, sans-serif';
  ctx.fillText('★  V I Ệ T   N A M   3 D  ★', W / 2, 286);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

/**
 * Illustrated Top Texture for 3D Chance (Cơ Hội) & Community Chest (Khí Vận) Card Decks on the court.
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
    grad.addColorStop(0, '#FDBA74');
    grad.addColorStop(1, '#EA580C');
  } else {
    grad.addColorStop(0, '#7DD3FC');
    grad.addColorStop(1, '#0284C7');
  }
  ctx.fillStyle = grad;
  roundRect(ctx, 0, 0, W, H, 28);
  ctx.fill();

  ctx.strokeStyle = '#FFFFFF';
  ctx.lineWidth = 14;
  roundRect(ctx, 18, 18, W - 36, H - 36, 20);
  ctx.stroke();

  ctx.setLineDash([18, 12]);
  ctx.strokeStyle = 'rgba(255,255,255,0.65)';
  ctx.lineWidth = 5;
  roundRect(ctx, 36, 36, W - 72, H - 72, 14);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#FFFFFF';
  ctx.font = '900 108px "Baloo 2", "Plus Jakarta Sans", Arial, sans-serif';
  ctx.fillText(isChance ? '?' : '★', W / 2, 124);

  ctx.font = '800 48px "Plus Jakarta Sans", Arial, sans-serif';
  ctx.fillText(isChance ? 'CƠ HỘI' : 'KHÍ VẬN', W / 2, 232);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

/**
 * Procedural City Boulevard Ring-Road Texture surrounding the 3D Monopoly board
 * (two-lane urban asphalt, sidewalks, dashed lane dividers & 4 zebra crosswalks,
 * inspired directly by MONOPOLY GO!'s city block environment).
 */
export function createBoulevardRoadTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const S = 1024;
  const canvas = document.createElement('canvas');
  canvas.width = S;
  canvas.height = S;
  const ctx = canvas.getContext('2d')!;

  // Base urban park grass for outer city blocks
  ctx.fillStyle = '#5BBD72';
  ctx.fillRect(0, 0, S, S);

  // Subtle park grid texture
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
  ctx.lineWidth = 2;
  for (let p = 0; p < S; p += 64) {
    ctx.beginPath();
    ctx.moveTo(p, 0);
    ctx.lineTo(p, S);
    ctx.moveTo(0, p);
    ctx.lineTo(S, p);
    ctx.stroke();
  }

  // World scale mapping: plane covers [-34, +34] (68m across => ~15.06 px per meter).
  // Board plinth occupies [-9.1, +9.1] => [375..649] px.
  // Ring road boulevard occupies [-13.4, +13.4] outside plinth, plus 4 radiating avenues!
  const pxPerMeter = S / 68;
  const toPx = (m: number) => S / 2 + m * pxPerMeter;

  const roadHalfOuter = 13.5;
  const roadHalfInner = 9.2;

  // Sidewalk curb apron
  ctx.fillStyle = '#CBD5E1';
  const swOuter = roadHalfOuter + 0.85;
  const swInner = roadHalfInner - 0.55;
  ctx.fillRect(
    toPx(-swOuter),
    toPx(-swOuter),
    (swOuter * 2) * pxPerMeter,
    (swOuter * 2) * pxPerMeter
  );
  // Radiating avenue sidewalks
  ctx.fillRect(toPx(-swOuter), 0, (swOuter - swInner) * pxPerMeter, S);
  ctx.fillRect(toPx(swInner), 0, (swOuter - swInner) * pxPerMeter, S);
  ctx.fillRect(0, toPx(-swOuter), S, (swOuter - swInner) * pxPerMeter);
  ctx.fillRect(0, toPx(swInner), S, (swOuter - swInner) * pxPerMeter);

  // Dark slate asphalt roads (ring boulevard + 4 radiating city streets)
  ctx.fillStyle = '#334155';
  const rOuterPx = toPx(-roadHalfOuter);
  const rSpanPx = roadHalfOuter * 2 * pxPerMeter;
  ctx.fillRect(rOuterPx, rOuterPx, rSpanPx, rSpanPx);

  const laneW = (roadHalfOuter - roadHalfInner) * pxPerMeter;
  // North/South/East/West avenues extending to horizon
  ctx.fillRect(toPx(-roadHalfOuter), 0, laneW, S);
  ctx.fillRect(toPx(roadHalfInner), 0, laneW, S);
  ctx.fillRect(0, toPx(-roadHalfOuter), S, laneW);
  ctx.fillRect(0, toPx(roadHalfInner), S, laneW);

  // Cut out inner island under board plinth
  ctx.fillStyle = '#E2E8F0';
  ctx.fillRect(
    toPx(-roadHalfInner),
    toPx(-roadHalfInner),
    roadHalfInner * 2 * pxPerMeter,
    roadHalfInner * 2 * pxPerMeter
  );

  // Dashed golden-yellow center lane dividers along ring boulevard
  const midM = (roadHalfOuter + roadHalfInner) / 2;
  ctx.strokeStyle = '#FACC15';
  ctx.lineWidth = 4;
  ctx.setLineDash([16, 14]);
  ctx.strokeRect(
    toPx(-midM),
    toPx(-midM),
    midM * 2 * pxPerMeter,
    midM * 2 * pxPerMeter
  );
  ctx.setLineDash([]);

  // Crisp white zebra crosswalks at the 4 boulevard corners
  ctx.fillStyle = '#F8FAFC';
  const drawCrosswalkH = (cxM: number, cyM: number) => {
    const startX = toPx(cxM - 1.5);
    const yTop = toPx(cyM - 0.55);
    for (let i = 0; i < 5; i++) {
      ctx.fillRect(startX + i * 9, yTop, 5, 1.1 * pxPerMeter);
    }
  };
  const drawCrosswalkV = (cxM: number, cyM: number) => {
    const xLeft = toPx(cxM - 0.55);
    const startY = toPx(cyM - 1.5);
    for (let i = 0; i < 5; i++) {
      ctx.fillRect(xLeft, startY + i * 9, 1.1 * pxPerMeter, 5);
    }
  };

  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      drawCrosswalkH(sx * midM, sy * (roadHalfInner - 0.2));
      drawCrosswalkV(sx * (roadHalfInner - 0.2), sy * midM);
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

/**
 * Creates 6 high-contrast glossy 3D dice face materials matching DICE_BOX_FACE_VALUES:
 * [2, 5, 1, 6, 3, 4]
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

    // Soft pearl-gold chamfer edge + glossy warm ivory face
    ctx.fillStyle = '#E2E8F0';
    ctx.fillRect(0, 0, size, size);

    const faceGrad = ctx.createRadialGradient(size * 0.38, size * 0.35, 12, size / 2, size / 2, 165);
    faceGrad.addColorStop(0, '#FFFFFF');
    faceGrad.addColorStop(1, '#F8F4E6');
    ctx.fillStyle = faceGrad;
    roundRect(ctx, 10, 10, size - 20, size - 20, 38);
    ctx.fill();

    ctx.strokeStyle = '#CBD5E1';
    ctx.lineWidth = 4;
    ctx.stroke();

    const isRed = val === 1 || val === 4;
    const radius = val === 1 ? 40 : 27;

    if (val === 1) {
      // Signature Monopoly GO! golden halo ring around the Ace pip
      ctx.strokeStyle = '#F59E0B';
      ctx.lineWidth = 7;
      ctx.beginPath();
      ctx.arc(size / 2, size / 2, 54, 0, Math.PI * 2);
      ctx.stroke();
    }

    for (const [px, py] of pipCoords[val]) {
      const cx = px * size;
      const cy = py * size;

      // Subtle recessed pip rim
      ctx.fillStyle = 'rgba(15, 23, 42, 0.16)';
      ctx.beginPath();
      ctx.arc(cx, cy - 2, radius + 2, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = isRed ? '#EF4444' : '#0F172A';
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.fill();

      // Tiny specular dot on pip
      ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
      ctx.beginPath();
      ctx.arc(cx - radius * 0.28, cy - radius * 0.28, radius * 0.22, 0, Math.PI * 2);
      ctx.fill();
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = maxAnisotropy;

    return new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      map: tex,
      roughness: 0.28,
      metalness: 0.02,
      clearcoat: 0.72,
      clearcoatRoughness: 0.14,
    });
  });
}

/**
 * Generates a subtle procedural wood/stone grain bump map (linear space).
 */
export function createWoodGrainBumpMap(): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#808080';
  ctx.fillRect(0, 0, size, size);

  for (let y = 0; y < size; y += 2) {
    const shade = 118 + Math.floor(Math.sin(y * 0.25) * 14 + (Math.random() - 0.5) * 16);
    ctx.fillStyle = `rgb(${shade},${shade},${shade})`;
    ctx.fillRect(0, y, size, 2);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(4, 4);
  return tex;
}
