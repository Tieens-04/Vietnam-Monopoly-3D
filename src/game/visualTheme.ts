import { BOARD_TILES } from './boardData';
import { formatBusinessTourCompact } from './rules';
import { BotQuipPayload, ColorGroup, TileKind } from './types';

export type RegionalArchitectureStyle = 'heritage' | 'coastal' | 'metropolis';

export type CityLandmarkMotif =
  | 'lung_cu_tower'
  | 'fansipan_peak'
  | 'lam_vien_bud'
  | 'ha_long_sails'
  | 'trang_an_boat'
  | 'ngo_mon_gate'
  | 'chua_cau_lantern'
  | 'eo_gio_cliff'
  | 'nghinh_phong_twin'
  | 'mui_ne_lighthouse'
  | 'vung_tau_beacon'
  | 'ly_son_arch'
  | 'nha_trang_tram'
  | 'nha_rong_coffee'
  | 'con_dao_pearl'
  | 'can_tho_bridge'
  | 'quan_ho_pavilion'
  | 'smart_tech_hub'
  | 'port_crane_blossom'
  | 'phu_quoc_cable'
  | 'long_thanh_wing'
  | 'dragon_bridge'
  | 'khue_van_cac'
  | 'landmark_skyline'
  | 'generic_emblem';

export interface CityVisualProfile {
  tileIndex: number;
  architectureStyle: RegionalArchitectureStyle;
  landmarkMotif: CityLandmarkMotif;
  regionBadge: string;
}

const TILE_LANDMARK_MOTIFS: Record<number, { motif: CityLandmarkMotif; badge: string }> = {
  1: { motif: 'lung_cu_tower', badge: 'Cột cờ Lũng Cú' },
  2: { motif: 'fansipan_peak', badge: 'Đỉnh Fansipan' },
  3: { motif: 'lam_vien_bud', badge: 'Hồ Xuân Hương' },
  4: { motif: 'ha_long_sails', badge: 'Kỳ Quan Vịnh Ngọc' },
  5: { motif: 'trang_an_boat', badge: 'Non Nước Tràng An' },
  6: { motif: 'ngo_mon_gate', badge: 'Kinh Thành Huế' },
  7: { motif: 'chua_cau_lantern', badge: 'Phố Cổ Đèn Lồng' },
  9: { motif: 'eo_gio_cliff', badge: 'Eo Gió Kỳ Co' },
  10: { motif: 'nghinh_phong_twin', badge: 'Tháp Nghinh Phong' },
  11: { motif: 'mui_ne_lighthouse', badge: 'Đồi Cát Mũi Né' },
  13: { motif: 'vung_tau_beacon', badge: 'Hải Đăng Biển Đông' },
  14: { motif: 'ly_son_arch', badge: 'Cổng Tò Vò' },
  15: { motif: 'nha_trang_tram', badge: 'Vịnh Ngọc Nha Trang' },
  17: { motif: 'nha_rong_coffee', badge: 'Thủ Phủ Cà Phê' },
  18: { motif: 'con_dao_pearl', badge: 'Đảo Ngọc Nguyên Sơ' },
  19: { motif: 'can_tho_bridge', badge: 'Bến Ninh Kiều' },
  21: { motif: 'quan_ho_pavilion', badge: 'Kinh Bắc Công Nghệ' },
  22: { motif: 'smart_tech_hub', badge: 'Thành Phố Thông Minh' },
  23: { motif: 'port_crane_blossom', badge: 'Cảng Quốc Tế' },
  25: { motif: 'phu_quoc_cable', badge: 'Đảo Ngọc Phương Nam' },
  26: { motif: 'long_thanh_wing', badge: 'Siêu Sân Bay' },
  27: { motif: 'dragon_bridge', badge: 'Cầu Rồng Sông Hàn' },
  29: { motif: 'khue_van_cac', badge: 'Khuê Văn Các' },
  31: { motif: 'landmark_skyline', badge: 'Siêu Đô Thị' },
};

export function getCityVisualProfile(tileIndex: number): CityVisualProfile {
  const tile = BOARD_TILES[tileIndex];
  const entry = TILE_LANDMARK_MOTIFS[tileIndex] ?? {
    motif: 'generic_emblem' as const,
    badge: 'Đô Thị Việt Nam',
  };

  if (!tile) {
    return {
      tileIndex,
      architectureStyle: 'metropolis',
      landmarkMotif: entry.motif,
      regionBadge: entry.badge,
    };
  }

  if (tile.kind === TileKind.RESORT) {
    return {
      tileIndex,
      architectureStyle: 'coastal',
      landmarkMotif: entry.motif,
      regionBadge: entry.badge,
    };
  }

  let architectureStyle: RegionalArchitectureStyle = 'metropolis';
  switch (tile.group) {
    case ColorGroup.BROWN:
    case ColorGroup.CYAN:
    case ColorGroup.AMBER:
      architectureStyle = 'heritage';
      break;
    case ColorGroup.PINK:
    case ColorGroup.ORANGE:
      architectureStyle = 'coastal';
      break;
    case ColorGroup.RED:
    case ColorGroup.PURPLE:
    case ColorGroup.EMERALD:
    default:
      architectureStyle = 'metropolis';
      break;
  }

  return {
    tileIndex,
    architectureStyle,
    landmarkMotif: entry.motif,
    regionBadge: entry.badge,
  };
}

export interface SafeBoardCameraPose {
  posX: number;
  posY: number;
  posZ: number;
  targetX: number;
  targetY: number;
  targetZ: number;
  distance: number;
}

const BASE_DIR_X = 24.4 / Math.hypot(24.4, 24.8, 24.4);
const BASE_DIR_Y = 24.8 / Math.hypot(24.4, 24.8, 24.4);
const BASE_DIR_Z = 24.4 / Math.hypot(24.4, 24.8, 24.4);
const TAN_HALF_FOV_26 = Math.tan((26 * Math.PI) / 360);

/**
 * Computes an aspect-aware default isometric camera pose for `FOV = 26deg` so the entire
 * 32-tile diamond board (including corner dioramas, outer price tabs, and right utility margin)
 * fits comfortably without clipping on desktop widescreen, split-screen, tablet, or mobile portrait.
 */
export function computeSafeBoardCameraPose(
  viewportWidth: number,
  viewportHeight: number
): SafeBoardCameraPose {
  const safeW = Math.max(280, viewportWidth || 1280);
  const safeH = Math.max(320, viewportHeight || 800);
  const aspect = Math.max(0.34, safeW / safeH);

  // Board-focused framing accommodating the 32-tile diamond board & 4 edge player money trays
  const requiredHalfWidthWorld = aspect < 0.85 ? 12.35 : 12.85;
  const requiredHalfHeightWorld = aspect < 0.85 ? 9.55 : 9.45;

  const distForWidth = requiredHalfWidthWorld / (TAN_HALF_FOV_26 * aspect);
  const distForHeight = requiredHalfHeightWorld / TAN_HALF_FOV_26;
  const distance = Math.max(distForWidth, distForHeight);

  const targetX = 0;
  // Center the diamond board cleanly between top HUD clock and bottom Roll Dock
  const targetY = aspect < 0.8 ? -0.32 : -0.18;
  const targetZ = 0;

  return {
    posX: targetX + BASE_DIR_X * distance,
    posY: targetY + BASE_DIR_Y * distance,
    posZ: targetZ + BASE_DIR_Z * distance,
    targetX,
    targetY,
    targetZ,
    distance,
  };
}

export interface ClampedBubblePlacement {
  x: number;
  y: number;
  tailOffsetPx: number;
}

/**
 * Clamps a 3D-projected floating speech bubble (`transform: translate(-50%, -100%)`)
 * inside safe viewport margins while computing a bounded horizontal tail offset so the
 * pointer arrow still indicates the speaker's world position.
 */
export function clampSpeechBubbleToViewport(
  projX: number,
  projY: number,
  bubbleWidth: number,
  bubbleHeight: number,
  viewportWidth: number,
  viewportHeight: number,
  safeMargin = 16
): ClampedBubblePlacement {
  const halfW = Math.max(48, bubbleWidth / 2);
  const safeH = Math.max(28, bubbleHeight);
  const minCenterX = safeMargin + halfW;
  const maxCenterX = Math.max(minCenterX, viewportWidth - safeMargin - halfW);

  const clampedX = Math.max(minCenterX, Math.min(maxCenterX, projX));
  const minBottomY = safeMargin + safeH;
  const maxBottomY = Math.max(minBottomY, viewportHeight - safeMargin - 52);
  const clampedY = Math.max(minBottomY, Math.min(maxBottomY, projY));

  const maxTailShift = Math.max(12, halfW - 18);
  const rawDelta = projX - clampedX;
  const tailOffsetPx = Math.max(-maxTailShift, Math.min(maxTailShift, rawDelta));

  return {
    x: clampedX,
    y: clampedY,
    tailOffsetPx,
  };
}

/**
 * Generates an in-character witty Vietnamese billionaire remark when the Gemini API key is
 * unconfigured or unreachable, ensuring zero technical error banners ever interrupt gameplay.
 */
export function generateOfflineBotQuip(payload: BotQuipPayload, seed = 0): string {
  const amt = formatBusinessTourCompact(Math.max(0, Math.round(payload.amount || 0)));
  const tile = payload.tileName || 'ô đắc địa';
  const personaHint = `${payload.botName} ${payload.botPersona}`.toLowerCase();

  const isShark = personaHint.includes('shark') || personaHint.includes('cá mập');
  const isYacht = personaHint.includes('du thuyền') || personaHint.includes('lan anh');
  const isTraditional = personaHint.includes('phu nhân') || personaHint.includes('truyền thống');

  const hash =
    Math.abs(
      (payload.botId || 1) * 31 +
        tile.length * 17 +
        Math.round((payload.amount || 0) / 10_000) +
        seed
    ) % 3;

  if (payload.eventKind === 'BUY_PRIME_LAND') {
    if (isShark) {
      const lines = [
        `Chốt gọn ${tile} giá ${amt}, thương vụ này biên lợi nhuận quá thơm!`,
        `Nhìn vị trí ${tile} là biết mỏ vàng rồi, xuống tiền ${amt} không cần đắn đo!`,
        `${tile} đã vào danh mục đầu tư ${amt}, ai đi ngang nhớ chuẩn bị thanh khoản nhé!`,
      ];
      return lines[hash];
    }
    if (isYacht) {
      const lines = [
        `Sổ hồng ${tile} giá ${amt} vừa cập bến, chuẩn bị đón khách thượng lưu thôi!`,
        `Đất đẹp như ${tile} mà chỉ ${amt} thì tập đoàn mình xin phép rước ngay nhé!`,
        `Thêm ${tile} với mức chi ${amt}, chuỗi nghỉ dưỡng năm sao càng thêm trọn vẹn!`,
      ];
      return lines[hash];
    }
    if (isTraditional) {
      const lines = [
        `Tấc đất tấc vàng, gom ngay ${tile} với ${amt} để dành sinh lời đường dài!`,
        `Mảnh ${tile} phong thủy vượng tài thế này, bỏ ra ${amt} là quá hời luôn!`,
        `Cứ đất đẹp ${tile} giá ${amt} là cô chốt liền tay, giữ tiền mặt làm gì!`,
      ];
      return lines[hash];
    }
    const defaultBuy = [
      `Xuống tiền ${amt} rinh ngay ${tile}, nước đi mở màn cho chuỗi độc quyền!`,
      `Chốt sổ ${tile} gọn lẹ ${amt}, phen này quyết xây cao ốc tới nóc!`,
      `Đặt gạch ${tile} giá ${amt} trước đã, chậm một nhịp là tiếc đứt ruột!`,
    ];
    return defaultBuy[hash];
  }

  if (payload.eventKind === 'COLLECT_BIG_RENT') {
    if (isShark) {
      const lines = [
        `Dòng tiền thụ động ${amt} từ ${tile} chảy về tài khoản nghe êm tai thật!`,
        `Cảm ơn khách quý đã đóng góp ${amt} doanh thu quý này tại ${tile} nhé!`,
        `Đầu tư chuẩn bài ở ${tile}, ngồi không cũng thu nhẹ ${amt} tiền thuê!`,
      ];
      return lines[hash];
    }
    const rentLines = [
      `Cảm ơn bạn hiền ghé thăm ${tile} và ủng hộ nhẹ ${amt} phí dịch vụ năm sao!`,
      `Tiền thuê ${amt} tại ${tile} về đúng lúc quá, lại có vốn nâng cấp thêm lầu!`,
      `Đất vàng ${tile} sinh lời mát tay thật, vừa thu gọn ${amt} vào két sắt!`,
    ];
    return rentLines[hash];
  }

  const penaltyLines = [
    `Nộp nhẹ ${amt} tại ${tile} coi như chi phí vận hành, vòng sau gỡ lại gấp đôi!`,
    `Trả ${amt} ở ${tile} hơi xót ví chút xíu nhưng đại gia vẫn còn dư lực nhé!`,
    `Coi như chi ${amt} tại ${tile} lấy vía may mắn, cuộc đua tỷ phú còn dài!`,
  ];
  return penaltyLines[hash];
}
