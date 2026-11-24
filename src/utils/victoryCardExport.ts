import type { PostMatchAward, SeriesStandingEntry } from '../game/onlineTypes';

export const VICTORY_CARD_WIDTH = 1200;
export const VICTORY_CARD_HEIGHT = 675;

const FONT_FAMILY = "'Be Vietnam Pro', system-ui, sans-serif";
const DEFAULT_EXPORT_FILENAME = 'co-ty-phu-tong-ket.png';

export interface VictoryCardExportData {
  roomCode?: string;
  winnerName: string;
  victoryLabel: string;
  rankedPlayers: Array<{
    rank: number;
    name: string;
    color: string;
    netWorthText: string;
    isWinner?: boolean;
  }>;
  awards: PostMatchAward[];
  seriesStandings: SeriesStandingEntry[];
}

export interface VictoryCardClipboardDeps {
  clipboardWriter?: (items: ClipboardItem[]) => Promise<void>;
  createClipboardItem?: (blob: Blob) => ClipboardItem;
  fallbackDownload?: (canvas: HTMLCanvasElement, filename: string) => void;
  toBlob?: (canvas: HTMLCanvasElement) => Promise<Blob | null>;
}

function drawRoundedRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
): void {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function fillRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
  fillStyle: string | CanvasGradient
): void {
  drawRoundedRectPath(ctx, x, y, width, height, radius);
  ctx.fillStyle = fillStyle;
  ctx.fill();
}

function strokeRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
  strokeStyle: string | CanvasGradient,
  lineWidth = 1.5
): void {
  drawRoundedRectPath(ctx, x, y, width, height, radius);
  ctx.strokeStyle = strokeStyle;
  ctx.lineWidth = lineWidth;
  ctx.stroke();
}

function truncateText(
  ctx: CanvasRenderingContext2D,
  rawText: string,
  maxWidth: number
): string {
  const text = rawText.trim();
  if (!text || maxWidth <= 0) return '';
  if (ctx.measureText(text).width <= maxWidth) {
    return text;
  }
  const ellipsis = '…';
  let low = 0;
  let high = text.length;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    const candidate = `${text.slice(0, mid)}${ellipsis}`;
    if (ctx.measureText(candidate).width <= maxWidth) {
      low = mid;
    } else {
      high = mid - 1;
    }
  }
  return low > 0 ? `${text.slice(0, low)}${ellipsis}` : ellipsis;
}

function sortStandings(standings: ReadonlyArray<SeriesStandingEntry>): SeriesStandingEntry[] {
  return [...standings].sort(
    (a, b) =>
      b.seriesPoints - a.seriesPoints ||
      b.wins - a.wins ||
      a.playerName.localeCompare(b.playerName) ||
      a.participantId.localeCompare(b.participantId)
  );
}

function drawPanelShell(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  title: string,
  accentColor: string
): void {
  fillRoundedRect(ctx, x, y, width, height, 18, 'rgba(9, 25, 49, 0.86)');
  strokeRoundedRect(ctx, x, y, width, height, 18, 'rgba(125, 211, 252, 0.28)', 1.5);

  // Header strip inside panel
  fillRoundedRect(ctx, x + 2, y + 2, width - 4, 38, 16, 'rgba(14, 52, 96, 0.72)');
  ctx.fillStyle = accentColor;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.font = `900 15px ${FONT_FAMILY}`;
  ctx.fillText(title, x + 18, y + 22);
}

/**
 * Renders a crisp 1200x675 (16:9) post-match summary card using pure HTML5 Canvas 2D.
 */
export function renderVictoryCardCanvas(
  data: VictoryCardExportData,
  canvasFactory?: (w: number, h: number) => HTMLCanvasElement
): HTMLCanvasElement {
  const canvas = canvasFactory
    ? canvasFactory(VICTORY_CARD_WIDTH, VICTORY_CARD_HEIGHT)
    : document.createElement('canvas');
  canvas.width = VICTORY_CARD_WIDTH;
  canvas.height = VICTORY_CARD_HEIGHT;

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return canvas;
  }

  const W = VICTORY_CARD_WIDTH;
  const H = VICTORY_CARD_HEIGHT;

  // 1. Midnight-navy gradient backdrop + subtle gold & sky radial highlights
  const bgGrad = ctx.createLinearGradient(0, 0, W, H);
  bgGrad.addColorStop(0, '#051021');
  bgGrad.addColorStop(0.5, '#0B2447');
  bgGrad.addColorStop(1, '#102F5C');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, W, H);

  const goldGlow = ctx.createRadialGradient(W * 0.3, 72, 20, W * 0.3, 72, 460);
  goldGlow.addColorStop(0, 'rgba(245, 184, 0, 0.22)');
  goldGlow.addColorStop(1, 'rgba(245, 184, 0, 0)');
  ctx.fillStyle = goldGlow;
  ctx.fillRect(0, 0, W, H);

  const skyGlow = ctx.createRadialGradient(W * 0.85, H * 0.85, 30, W * 0.85, H * 0.85, 420);
  skyGlow.addColorStop(0, 'rgba(56, 189, 248, 0.16)');
  skyGlow.addColorStop(1, 'rgba(56, 189, 248, 0)');
  ctx.fillStyle = skyGlow;
  ctx.fillRect(0, 0, W, H);

  // Subtle decorative stars / sparkles in corners
  ctx.fillStyle = 'rgba(250, 204, 21, 0.26)';
  for (const [sx, sy, sr] of [
    [1135, 58, 3],
    [1105, 86, 2],
    [1082, 48, 2.5],
    [60, 628, 2.5],
    [1140, 626, 2.5],
  ]) {
    ctx.beginPath();
    ctx.arc(sx, sy, sr, 0, Math.PI * 2);
    ctx.fill();
  }

  // Outer golden border + inner cyan frame
  strokeRoundedRect(ctx, 16, 16, W - 32, H - 32, 24, '#F5B800', 3);
  strokeRoundedRect(ctx, 24, 24, W - 48, H - 48, 18, 'rgba(125, 211, 252, 0.25)', 1.25);

  // 2. Top Header Section
  fillRoundedRect(ctx, 44, 38, 272, 28, 14, 'rgba(56, 189, 248, 0.18)');
  strokeRoundedRect(ctx, 44, 38, 272, 28, 14, 'rgba(125, 211, 252, 0.45)', 1);
  ctx.fillStyle = '#BAE6FD';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `800 12px ${FONT_FAMILY}`;
  ctx.fillText('CỜ TỶ PHÚ VIỆT NAM 3D', 180, 52);

  const trimmedRoomCode = data.roomCode?.trim();
  if (trimmedRoomCode) {
    fillRoundedRect(ctx, 328, 38, 178, 28, 14, 'rgba(245, 184, 0, 0.2)');
    strokeRoundedRect(ctx, 328, 38, 178, 28, 14, '#F5B800', 1.25);
    ctx.fillStyle = '#FDE047';
    ctx.font = `900 12px ${FONT_FAMILY}`;
    ctx.fillText(`PHÒNG: ${trimmedRoomCode}`, 417, 52);
  }

  // Right corner badge
  fillRoundedRect(ctx, W - 266, 38, 222, 28, 14, 'rgba(245, 184, 0, 0.14)');
  strokeRoundedRect(ctx, W - 266, 38, 222, 28, 14, 'rgba(245, 184, 0, 0.45)', 1);
  ctx.fillStyle = '#FEF08A';
  ctx.textAlign = 'center';
  ctx.font = `800 12px ${FONT_FAMILY}`;
  ctx.fillText('BẢNG VÀNG CHUNG CUỘC', W - 155, 52);

  // Headline & Victory Label
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#FEF08A';
  ctx.font = `900 34px ${FONT_FAMILY}`;
  const headline = truncateText(ctx, `🏆 ${data.winnerName} Chiến Thắng!`, W - 96);
  ctx.fillText(headline, 46, 110);

  ctx.fillStyle = '#E0F2FE';
  ctx.font = `700 16px ${FONT_FAMILY}`;
  const subtitle = truncateText(
    ctx,
    data.victoryLabel || 'Chung cuộc Business Tour Edition',
    W - 96
  );
  ctx.fillText(subtitle, 46, 138);

  // Subtle gold divider under header
  const dividerGrad = ctx.createLinearGradient(44, 154, W - 44, 154);
  dividerGrad.addColorStop(0, '#F5B800');
  dividerGrad.addColorStop(0.55, 'rgba(125, 211, 252, 0.6)');
  dividerGrad.addColorStop(1, 'rgba(125, 211, 252, 0.08)');
  ctx.fillStyle = dividerGrad;
  ctx.fillRect(44, 152, W - 88, 2);

  // 3. Left Column: Top Ranked Players + Bottom Series Leaderboard
  const leftX = 44;
  const leftW = 538;

  // 3a. Ranked Players Panel
  const rankPanelY = 168;
  const rankPanelH = 224;
  drawPanelShell(ctx, leftX, rankPanelY, leftW, rankPanelH, '🏅 BẢNG XẾP HẠNG TRẬN ĐẤU', '#FEF08A');

  const topPlayers = data.rankedPlayers.slice(0, 4);
  topPlayers.forEach((pl, idx) => {
    const rowY = rankPanelY + 48 + idx * 42;
    const isChamp = Boolean(pl.isWinner || pl.rank === 1);
    if (isChamp) {
      fillRoundedRect(ctx, leftX + 12, rowY, leftW - 24, 36, 10, 'rgba(245, 184, 0, 0.18)');
      strokeRoundedRect(ctx, leftX + 12, rowY, leftW - 24, 36, 10, 'rgba(245, 184, 0, 0.65)', 1.2);
    } else {
      fillRoundedRect(ctx, leftX + 12, rowY, leftW - 24, 36, 10, 'rgba(255, 255, 255, 0.04)');
    }

    // Rank text
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = isChamp ? '#FDE047' : '#7DD3FC';
    ctx.font = `900 15px ${FONT_FAMILY}`;
    ctx.fillText(`#${pl.rank}`, leftX + 24, rowY + 18);

    // Color dot
    ctx.beginPath();
    ctx.arc(leftX + 70, rowY + 18, 7, 0, Math.PI * 2);
    ctx.fillStyle = pl.color || '#38BDF8';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#FFFFFF';
    ctx.stroke();

    // Player name
    ctx.fillStyle = '#FFFFFF';
    ctx.font = `800 15px ${FONT_FAMILY}`;
    const maxNameW = isChamp ? 200 : 255;
    const displayName = truncateText(ctx, pl.name, maxNameW);
    ctx.fillText(displayName, leftX + 88, rowY + 18);

    if (isChamp) {
      fillRoundedRect(ctx, leftX + 292, rowY + 8, 72, 20, 10, '#F5B800');
      ctx.fillStyle = '#0F172A';
      ctx.textAlign = 'center';
      ctx.font = `900 10px ${FONT_FAMILY}`;
      ctx.fillText('VÔ ĐỊCH', leftX + 328, rowY + 18);
    }

    // Net worth text
    const isBankrupt = pl.netWorthText.toUpperCase().includes('PHÁ SẢN');
    ctx.textAlign = 'right';
    ctx.fillStyle = isBankrupt ? '#FB7185' : '#4ADE80';
    ctx.font = `900 15px ${FONT_FAMILY}`;
    ctx.fillText(
      truncateText(ctx, pl.netWorthText, isChamp ? 140 : 155),
      leftX + leftW - 24,
      rowY + 18
    );
  });

  // 3b. Series Standings Panel
  const seriesPanelY = 406;
  const seriesPanelH = 216;
  drawPanelShell(
    ctx,
    leftX,
    seriesPanelY,
    leftW,
    seriesPanelH,
    '🏆 BẢNG ĐIỂM CHUỖI TRẬN',
    '#7DD3FC'
  );

  const sortedSeries = sortStandings(data.seriesStandings).slice(0, 4);
  if (sortedSeries.length === 0) {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#94A3B8';
    ctx.font = `600 14px ${FONT_FAMILY}`;
    ctx.fillText(
      'Chưa có điểm tích lũy chuỗi trận Online trong phòng này',
      leftX + leftW / 2,
      seriesPanelY + 122
    );
  } else {
    sortedSeries.forEach((entry, idx) => {
      const rowY = seriesPanelY + 48 + idx * 40;
      const isLeader = idx === 0;
      fillRoundedRect(
        ctx,
        leftX + 12,
        rowY,
        leftW - 24,
        34,
        10,
        isLeader ? 'rgba(56, 189, 248, 0.16)' : 'rgba(255, 255, 255, 0.04)'
      );
      if (isLeader) {
        strokeRoundedRect(ctx, leftX + 12, rowY, leftW - 24, 34, 10, 'rgba(56, 189, 248, 0.5)', 1);
      }

      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = isLeader ? '#FDE047' : '#94A3B8';
      ctx.font = `900 14px ${FONT_FAMILY}`;
      ctx.fillText(`#${idx + 1}`, leftX + 24, rowY + 17);

      ctx.fillStyle = '#F8FAFC';
      ctx.font = `800 14px ${FONT_FAMILY}`;
      ctx.fillText(truncateText(ctx, entry.playerName, 195), leftX + 64, rowY + 17);

      ctx.textAlign = 'right';
      ctx.fillStyle = '#FEF08A';
      ctx.font = `800 13px ${FONT_FAMILY}`;
      ctx.fillText(
        truncateText(ctx, `🏆 ${entry.wins} Cúp`, 115),
        leftX + leftW - 150,
        rowY + 17
      );

      ctx.fillStyle = '#CBD5E1';
      ctx.font = `700 12px ${FONT_FAMILY}`;
      ctx.fillText(
        truncateText(ctx, `${entry.matchesPlayed} trận`, 54),
        leftX + leftW - 92,
        rowY + 17
      );

      ctx.fillStyle = '#38BDF8';
      ctx.font = `900 14px ${FONT_FAMILY}`;
      ctx.fillText(
        truncateText(ctx, `${entry.seriesPoints} điểm`, 64),
        leftX + leftW - 24,
        rowY + 17
      );
    });
  }

  // 4. Right Column: Post-Match Humorous Awards
  const rightX = 600;
  const rightW = 556;
  const awardsPanelY = 168;
  const awardsPanelH = 454;
  drawPanelShell(
    ctx,
    rightX,
    awardsPanelY,
    rightW,
    awardsPanelH,
    '🎖️ DANH HIỆU HÀI HƯỚC HẬU TRẬN',
    '#FDE047'
  );

  const visibleAwards = data.awards.slice(0, 4);
  if (visibleAwards.length === 0) {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#94A3B8';
    ctx.font = `600 15px ${FONT_FAMILY}`;
    ctx.fillText(
      'Ván đấu kết thúc nhanh — chưa ghi nhận danh hiệu đặc biệt!',
      rightX + rightW / 2,
      awardsPanelY + 230
    );
  } else {
    visibleAwards.forEach((award, idx) => {
      const cardY = awardsPanelY + 50 + idx * 98;
      const cardH = 88;
      fillRoundedRect(ctx, rightX + 14, cardY, rightW - 28, cardH, 14, 'rgba(15, 39, 74, 0.92)');
      strokeRoundedRect(
        ctx,
        rightX + 14,
        cardY,
        rightW - 28,
        cardH,
        14,
        'rgba(245, 184, 0, 0.34)',
        1.2
      );

      // Left player-color accent bar
      fillRoundedRect(
        ctx,
        rightX + 14,
        cardY + 10,
        6,
        cardH - 20,
        3,
        award.playerColor || '#F5B800'
      );

      // Icon circle
      fillRoundedRect(ctx, rightX + 32, cardY + 18, 52, 52, 14, 'rgba(255, 255, 255, 0.08)');
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#FFFFFF';
      ctx.font = `400 26px ${FONT_FAMILY}`;
      ctx.fillText(award.icon || '🎖️', rightX + 58, cardY + 45);

      // Award title + value badge
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#FDE047';
      ctx.font = `900 17px ${FONT_FAMILY}`;
      ctx.fillText(truncateText(ctx, award.title, 260), rightX + 98, cardY + 27);

      ctx.textAlign = 'right';
      ctx.fillStyle = '#4ADE80';
      ctx.font = `900 15px ${FONT_FAMILY}`;
      ctx.fillText(truncateText(ctx, award.valueLabel, 165), rightX + rightW - 28, cardY + 27);

      // Recipient player name & subtitle
      ctx.textAlign = 'left';
      ctx.fillStyle = '#FFFFFF';
      ctx.font = `800 14px ${FONT_FAMILY}`;
      ctx.fillText(truncateText(ctx, award.playerName, rightW - 130), rightX + 98, cardY + 50);

      ctx.fillStyle = '#94A3B8';
      ctx.font = `600 12px ${FONT_FAMILY}`;
      ctx.fillText(truncateText(ctx, award.subtitle, rightW - 130), rightX + 98, cardY + 70);
    });
  }

  // 5. Footer strip
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#7DD3FC';
  ctx.font = `700 12px ${FONT_FAMILY}`;
  ctx.fillText('Business Tour Vietnam 3D · Tổng kết trận đấu 1200×675', 46, H - 36);

  ctx.textAlign = 'right';
  ctx.fillStyle = '#FDE047';
  ctx.font = `800 12px ${FONT_FAMILY}`;
  ctx.fillText('Chơi vui cùng bạn bè!', W - 46, H - 36);

  return canvas;
}

/**
 * Triggers a client-side PNG download of the rendered Victory Card canvas.
 */
export function downloadVictoryCardPng(
  canvas: HTMLCanvasElement,
  filename = DEFAULT_EXPORT_FILENAME
): void {
  const resolvedFilename = filename.trim() || DEFAULT_EXPORT_FILENAME;
  if (typeof canvas.toDataURL !== 'function' || typeof document === 'undefined') {
    return;
  }
  const dataUrl = canvas.toDataURL('image/png');
  if (!dataUrl) {
    return;
  }

  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = resolvedFilename;
  if (link.style) {
    link.style.display = 'none';
  }

  const body = document.body;
  if (body && typeof body.appendChild === 'function') {
    body.appendChild(link);
    try {
      link.click();
    } finally {
      if (typeof body.removeChild === 'function') {
        body.removeChild(link);
      } else if (typeof link.remove === 'function') {
        link.remove();
      }
    }
  } else {
    link.click();
  }
}

async function canvasToPngBlob(
  canvas: HTMLCanvasElement,
  customToBlob?: (canvas: HTMLCanvasElement) => Promise<Blob | null>
): Promise<Blob | null> {
  if (customToBlob) {
    return customToBlob(canvas);
  }
  if (typeof canvas.toBlob !== 'function') {
    return null;
  }
  return new Promise<Blob | null>((resolve) => {
    try {
      canvas.toBlob((blob) => resolve(blob), 'image/png');
    } catch {
      resolve(null);
    }
  });
}

/**
 * Copies the rendered Victory Card PNG to the system clipboard when supported,
 * automatically falling back to PNG file download otherwise.
 */
export async function copyVictoryCardToClipboard(
  canvas: HTMLCanvasElement,
  filename = DEFAULT_EXPORT_FILENAME,
  deps?: VictoryCardClipboardDeps
): Promise<'copied' | 'downloaded'> {
  const resolvedFilename = filename.trim() || DEFAULT_EXPORT_FILENAME;
  const fallback = deps?.fallbackDownload ?? downloadVictoryCardPng;

  const writer =
    deps?.clipboardWriter ??
    (typeof navigator !== 'undefined' &&
    navigator.clipboard &&
    typeof navigator.clipboard.write === 'function'
      ? (items: ClipboardItem[]) => navigator.clipboard.write(items)
      : null);

  const itemFactory =
    deps?.createClipboardItem ??
    (typeof ClipboardItem === 'function'
      ? (blob: Blob) => new ClipboardItem({ 'image/png': blob })
      : null);

  if (!writer || !itemFactory) {
    fallback(canvas, resolvedFilename);
    return 'downloaded';
  }

  try {
    const blob = await canvasToPngBlob(canvas, deps?.toBlob);
    if (!blob) {
      fallback(canvas, resolvedFilename);
      return 'downloaded';
    }
    const item = itemFactory(blob);
    await writer([item]);
    return 'copied';
  } catch {
    fallback(canvas, resolvedFilename);
    return 'downloaded';
  }
}
