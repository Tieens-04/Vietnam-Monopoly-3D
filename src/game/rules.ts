import { BOARD_TILES, COLOR_GROUP_META } from './boardData';
import {
  AutoSalePlan,
  BotQuipPayload,
  ColorGroup,
  MatchBoardModifiers,
  MatchWinnerResult,
  PlayerSetupConfig,
  PlayerState,
  PropertyState,
  TacticalCardActionKind,
  TileDefinition,
  TileKind,
} from './types';

export const TOTAL_TILES = 32;
export const LOST_ISLAND_TILE_INDEX = 8;
export const WORLD_CHAMPIONSHIPS_TILE_INDEX = 16;
export const WORLD_TOUR_TILE_INDEX = 24;
export const TAX_TILE_INDEX = 30;
export const RESORT_TILE_INDICES = [4, 14, 18, 25] as const;
export const RESORT_RENTS = [50_000, 150_000, 400_000, 1_000_000] as const;
export const START_SALARY = 300_000;
export const JAIL_FINE = 200_000;
export const WORLD_TOUR_FEE = 50_000;
export const CHAMPIONSHIP_FEE = 0;
export const MAX_JAIL_TURNS = 3;
export const TURN_COUNTDOWN_SECONDS = 45;
export const BT_DISPLAY_MULTIPLIER = 1;
export const EDGE_TILE_WIDTH = 11.4 / 7;

/**
 * Formats Business Tour currency amounts into compact K/M scale
 * (e.g., 50000 -> "50K", 1200000 -> "1.2M", 0 -> "0K").
 */
export function formatBusinessTourCompact(rawDollars: number, showMinusSign = false): string {
  const isNeg = rawDollars < 0;
  const absScaled = Math.abs(rawDollars) * BT_DISPLAY_MULTIPLIER;
  const prefix = isNeg && showMinusSign ? '-' : '';

  if (absScaled < 1000) {
    return '0K';
  }
  if (absScaled >= 1_000_000) {
    const millions = Math.round((absScaled / 1_000_000) * 100) / 100;
    return `${prefix}${Number(millions.toFixed(2))}M`;
  }
  const thousands = Math.round(absScaled / 1000);
  return `${prefix}${thousands}K`;
}

/**
 * Formats Business Tour currency amounts into spaced strings
 * (e.g., 0 -> "0", 220000 -> "220 000", 2000000 -> "2 000 000", -150000 -> "-150 000").
 */
export function formatBusinessTourSpaced(rawDollars: number): string {
  const scaled = Math.round(rawDollars * BT_DISPLAY_MULTIPLIER);
  if (scaled === 0) return '0';
  const sign = scaled < 0 ? '-' : '';
  const digits = String(Math.abs(scaled));
  const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return `${sign}${grouped}`;
}

/**
 * Formats remaining turn countdown seconds as MM:SS (e.g., 45 -> "00:45").
 */
export function formatCountdownClock(secondsLeft: number): string {
  const clamped = Math.max(0, Math.floor(secondsLeft));
  const mins = Math.floor(clamped / 60);
  const secs = clamped % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export const BOARD_SIDES: Array<{
  id: 'SOUTH' | 'WEST' | 'NORTH' | 'EAST';
  label: string;
  tileIndices: number[];
}> = [
  { id: 'SOUTH', label: 'Cạnh Nam (Hà Giang → Hội An)', tileIndices: [1, 2, 3, 4, 5, 6, 7] },
  { id: 'WEST', label: 'Cạnh Tây (Quy Nhơn → Nha Trang)', tileIndices: [9, 10, 11, 13, 14, 15] },
  { id: 'NORTH', label: 'Cạnh Bắc (Buôn Ma Thuột → Hải Phòng)', tileIndices: [17, 18, 19, 21, 22, 23] },
  { id: 'EAST', label: 'Cạnh Đông (Phú Quốc → TP.HCM)', tileIndices: [25, 26, 27, 29, 31] },
];

export interface TileSpatialTransform {
  x: number;
  z: number;
  rotationY: number;
  width: number;
  depth: number;
  isCorner: boolean;
  side: 'bottom' | 'left' | 'top' | 'right';
}

/**
 * Computes exact 3D board coordinates for each of the 32 tiles.
 * Regular edge tile: width = 11.4 / 7, depth = 2.6 (7 per side -> inner span = 11.4, ±5.7)
 * Corner tile: 2.6 x 2.6 centered at (±7.0, ±7.0)
 */
export function getTileTransform(index: number): TileSpatialTransform {
  const W = EDGE_TILE_WIDTH;
  const D = 2.6;
  const EDGE_COORD = 7.0; // 5.7 + 1.3

  const idx = ((index % TOTAL_TILES) + TOTAL_TILES) % TOTAL_TILES;

  if (idx === 0) {
    return {
      x: EDGE_COORD,
      z: EDGE_COORD,
      rotationY: 0,
      width: D,
      depth: D,
      isCorner: true,
      side: 'bottom',
    };
  }
  if (idx >= 1 && idx <= 7) {
    // Bottom edge: 7 tiles spanning +5.7 down to -5.7 along X, z = +7.0
    const offset = idx - 1;
    const x = 5.7 - W / 2 - offset * W;
    return {
      x,
      z: EDGE_COORD,
      rotationY: 0,
      width: W,
      depth: D,
      isCorner: false,
      side: 'bottom',
    };
  }
  if (idx === 8) {
    return {
      x: -EDGE_COORD,
      z: EDGE_COORD,
      rotationY: -Math.PI / 2,
      width: D,
      depth: D,
      isCorner: true,
      side: 'left',
    };
  }
  if (idx >= 9 && idx <= 15) {
    // Left edge: 7 tiles spanning +5.7 down to -5.7 along Z, x = -7.0
    const offset = idx - 9;
    const z = 5.7 - W / 2 - offset * W;
    return {
      x: -EDGE_COORD,
      z,
      rotationY: -Math.PI / 2,
      width: W,
      depth: D,
      isCorner: false,
      side: 'left',
    };
  }
  if (idx === 16) {
    return {
      x: -EDGE_COORD,
      z: -EDGE_COORD,
      rotationY: Math.PI,
      width: D,
      depth: D,
      isCorner: true,
      side: 'top',
    };
  }
  if (idx >= 17 && idx <= 23) {
    // Top edge: 7 tiles spanning -5.7 up to +5.7 along X, z = -7.0
    const offset = idx - 17;
    const x = -5.7 + W / 2 + offset * W;
    return {
      x,
      z: -EDGE_COORD,
      rotationY: Math.PI,
      width: W,
      depth: D,
      isCorner: false,
      side: 'top',
    };
  }
  if (idx === 24) {
    return {
      x: EDGE_COORD,
      z: -EDGE_COORD,
      rotationY: Math.PI / 2,
      width: D,
      depth: D,
      isCorner: true,
      side: 'right',
    };
  }

  // idx 25..31: Right edge: 7 tiles spanning -5.7 up to +5.7 along Z, x = +7.0
  const offset = idx - 25;
  const z = -5.7 + W / 2 + offset * W;
  return {
    x: EDGE_COORD,
    z,
    rotationY: Math.PI / 2,
    width: W,
    depth: D,
    isCorner: false,
    side: 'right',
  };
}

/**
 * Multi-token non-overlapping offset in world X/Z on the same tile.
 */
export function getTokenSlotOffset(
  slotIndex: number,
  totalOnTile: number,
  isCorner: boolean
): { dx: number; dz: number } {
  if (totalOnTile <= 1) return { dx: 0, dz: 0 };
  const spread = isCorner ? 0.52 : 0.32;
  const slots = [
    { dx: -spread, dz: -spread * 0.85 },
    { dx: spread, dz: -spread * 0.85 },
    { dx: -spread, dz: spread * 0.85 },
    { dx: spread, dz: spread * 0.85 },
  ];
  return slots[slotIndex % slots.length];
}

/**
 * BoxGeometry face material mapping for 3D Dice:
 * 0 (+X) = 2, 1 (-X) = 5, 2 (+Y) = 1, 3 (-Y) = 6, 4 (+Z) = 3, 5 (-Z) = 4
 * Opposite faces always sum to 7!
 */
export const DICE_BOX_FACE_VALUES: [number, number, number, number, number, number] = [
  2, // +X
  5, // -X
  1, // +Y
  6, // -Y
  3, // +Z
  4, // -Z
];

/**
 * Returns Euler [rx, ry, rz] (order 'XYZ') that orients the face for `value` (1..6) straight up (+Y).
 */
export function getDiceFaceBaseEuler(value: number): [number, number, number] {
  switch (value) {
    case 1:
      return [0, 0, 0];
    case 6:
      return [Math.PI, 0, 0];
    case 2:
      return [0, 0, Math.PI / 2];
    case 5:
      return [0, 0, -Math.PI / 2];
    case 3:
      return [-Math.PI / 2, 0, 0];
    case 4:
      return [Math.PI / 2, 0, 0];
    default:
      return [0, 0, 0];
  }
}

export function createInitialPlayers(
  configs: PlayerSetupConfig[],
  startingCash: number
): PlayerState[] {
  return configs
    .filter((c) => c.enabled)
    .map((c, idx) => ({
      id: idx,
      name: c.name.trim() || `Người chơi ${idx + 1}`,
      isBot: c.isBot,
      color: c.color,
      colorName: c.colorName,
      tokenType: c.tokenType,
      cash: startingCash,
      position: 0,
      laps: 0,
      inJail: false,
      jailTurns: 0,
      jailFreeCards: 0,
      doublesStreak: 0,
      pendingWorldTour: false,
      bankrupt: false,
    }));
}

export function createInitialProperties(): Record<number, PropertyState> {
  const map: Record<number, PropertyState> = {};
  for (const tile of BOARD_TILES) {
    if (tile.kind === TileKind.PROPERTY || tile.kind === TileKind.RESORT) {
      map[tile.index] = {
        tileIndex: tile.index,
        ownerId: null,
        level: 0,
      };
    }
  }
  return map;
}

export function isPurchasableTile(tile: TileDefinition): boolean {
  return tile.kind === TileKind.PROPERTY || tile.kind === TileKind.RESORT;
}

export function ownsFullColorGroup(
  ownerId: number,
  group: ColorGroup,
  properties: Record<number, PropertyState>
): boolean {
  const indices = COLOR_GROUP_META[group].tileIndices;
  return indices.every((idx) => properties[idx]?.ownerId === ownerId);
}

/**
 * Creates initial board modifiers at match start: picks `festivalCount` distinct color-group
 * cities for 2x Festival rent bonuses and initializes progressive World Championships state.
 */
export function createDefaultBoardModifiers(
  festivalCount = 3,
  rng: () => number = Math.random
): MatchBoardModifiers {
  const groups = [...Object.values(ColorGroup)];
  for (let i = groups.length - 1; i > 0; i--) {
    const j = Math.floor(Math.max(0, Math.min(0.999999, rng())) * (i + 1));
    [groups[i], groups[j]] = [groups[j], groups[i]];
  }
  const pickedGroups = groups.slice(0, Math.max(0, Math.min(festivalCount, groups.length)));
  const festivalTileIndices = pickedGroups
    .map((grp) => {
      const candidates = COLOR_GROUP_META[grp].tileIndices;
      const pickIdx = Math.floor(Math.max(0, Math.min(0.999999, rng())) * candidates.length);
      return candidates[pickIdx];
    })
    .sort((a, b) => a - b);

  return {
    festivalTileIndices,
    championshipTileIndex: null,
    championshipMultiplier: 1,
    outageTileIndices: [],
    shieldedTileIndices: [],
  };
}

/**
 * Assigns World Championships host to `tileIndex` and increments the global progressive
 * multiplier (1 -> 2 on first host, then 2 -> 3 -> 4 -> ... on every subsequent placement).
 */
export function applyChampionshipHost(
  modifiers: MatchBoardModifiers,
  tileIndex: number
): MatchBoardModifiers {
  const nextMult =
    modifiers.championshipMultiplier < 2 ? 2 : modifiers.championshipMultiplier + 1;
  return {
    ...modifiers,
    championshipTileIndex: tileIndex,
    championshipMultiplier: nextMult,
  };
}

/**
 * Clears championshipTileIndex, outageTileIndices, and shieldedTileIndices if their city became
 * unowned (sold to bank, earthquake, or bankrupt), while preserving accumulated championshipMultiplier!
 */
export function clearDisownedModifiers(
  modifiers: MatchBoardModifiers,
  properties: Record<number, PropertyState>
): MatchBoardModifiers {
  const nextChamp =
    modifiers.championshipTileIndex !== null &&
    (properties[modifiers.championshipTileIndex]?.ownerId ?? null) === null
      ? null
      : modifiers.championshipTileIndex;
  const nextOutage = (modifiers.outageTileIndices ?? []).filter(
    (idx) => (properties[idx]?.ownerId ?? null) !== null
  );
  const nextShielded = (modifiers.shieldedTileIndices ?? []).filter(
    (idx) => (properties[idx]?.ownerId ?? null) !== null
  );
  return {
    ...modifiers,
    championshipTileIndex: nextChamp,
    outageTileIndices: nextOutage,
    shieldedTileIndices: nextShielded,
  };
}

/**
 * Calculates exact Business Tour rent when a player lands on an owned tile:
 * - Outage: 0 rent while power outage is active on `tileIndex`.
 * - RESORT: scales [50K, 150K, 400K, 1M] by total Resorts owned by the same owner.
 * - PROPERTY: baseRent * (ColorMonopoly ? 2 : 1) * (Festival ? 2 : 1) * (Championship ? champMult : 1).
 */
export function calculateRent(
  tileIndex: number,
  properties: Record<number, PropertyState>,
  modifiers?: MatchBoardModifiers
): number {
  const tile = BOARD_TILES[tileIndex];
  const prop = properties[tileIndex];
  if (!tile || !prop || prop.ownerId === null) return 0;
  if (modifiers?.outageTileIndices?.includes(tileIndex)) return 0;

  if (tile.kind === TileKind.RESORT) {
    const ownedResorts = RESORT_TILE_INDICES.filter(
      (idx) => properties[idx]?.ownerId === prop.ownerId
    ).length;
    return RESORT_RENTS[Math.min(Math.max(ownedResorts, 1), 4) - 1];
  }

  if (tile.kind === TileKind.PROPERTY && tile.rents && tile.group) {
    const hasMonopoly = ownsFullColorGroup(prop.ownerId, tile.group, properties);
    const tierRent = tile.rents[Math.min(prop.level, 4)];
    const colorMult = hasMonopoly ? 2 : 1;
    const festivalMult = modifiers?.festivalTileIndices.includes(tileIndex) ? 2 : 1;
    const champMult =
      modifiers?.championshipTileIndex === tileIndex
        ? Math.max(1, modifiers.championshipMultiplier)
        : 1;
    return tierRent * colorMult * festivalMult * champMult;
  }

  return 0;
}

/**
 * Computes the compact label shown on a tile's protruding 3D outer tab:
 * - Unowned purchasable tile -> purchase price ("200K")
 * - Owned purchasable tile -> live effective rent ("240K", "1.2M")
 * - Tax tile -> "-10%"
 */
export function formatTilePriceLabel(
  tile: TileDefinition,
  propState?: PropertyState,
  properties?: Record<number, PropertyState>,
  modifiers?: MatchBoardModifiers
): string | null {
  if (tile.kind === TileKind.TAX) {
    return '-10%';
  }
  if (isPurchasableTile(tile)) {
    if (propState && propState.ownerId !== null && properties) {
      return formatBusinessTourCompact(calculateRent(tile.index, properties, modifiers));
    }
    return tile.price ? formatBusinessTourCompact(tile.price) : null;
  }
  return null;
}

/**
 * Calculates step-by-step forward path indices when moving `steps` clockwise from `fromIndex`.
 */
export function computeForwardSteps(
  fromIndex: number,
  steps: number
): { path: number[]; finalTile: number; passedStart: boolean } {
  const path: number[] = [];
  let passedStart = false;
  let current = fromIndex;
  for (let i = 0; i < steps; i++) {
    current = (current + 1) % TOTAL_TILES;
    path.push(current);
    if (current === 0) {
      passedStart = true;
    }
  }
  return { path, finalTile: current, passedStart };
}

/**
 * Calculates path to a specific target tile clockwise.
 */
export function computePathToTile(
  fromIndex: number,
  targetTile: number,
  collectStart: boolean
): { path: number[]; passedStart: boolean } {
  const steps =
    targetTile === fromIndex
      ? 0
      : (targetTile - fromIndex + TOTAL_TILES) % TOTAL_TILES;
  const result = computeForwardSteps(fromIndex, steps);
  return {
    path: result.path,
    passedStart: collectStart && result.passedStart,
  };
}

export interface InitialPurchaseTierOption {
  level: 0 | 1 | 2 | 3;
  label: string;
  totalCost: number;
  affordable: boolean;
}

/**
 * Initial purchase tiers in Business Tour:
 * - RESORT: single ownership tier (level 0).
 * - PROPERTY: Lap 0 (first lap) capped at 2 houses; Lap 1+ unlocks 3 houses. Never Level 4 on first buy.
 */
export function getInitialPurchaseTiers(
  player: PlayerState,
  tileIndex: number
): InitialPurchaseTierOption[] {
  const tile = BOARD_TILES[tileIndex];
  if (!tile || !tile.price) return [];

  if (tile.kind === TileKind.RESORT) {
    return [
      {
        level: 0,
        label: 'Sở hữu Khu nghỉ dưỡng',
        totalCost: tile.price,
        affordable: player.cash >= tile.price,
      },
    ];
  }

  if (tile.kind !== TileKind.PROPERTY || !tile.houseCost) {
    return [];
  }

  const maxTier = player.laps === 0 ? 2 : 3;
  const labels: Array<{ level: 0 | 1 | 2 | 3; label: string }> = [
    { level: 0, label: 'Đất trống' },
    { level: 1, label: '1 Nhà' },
    { level: 2, label: '2 Nhà' },
    { level: 3, label: '3 Nhà' },
  ];

  return labels
    .filter((item) => item.level <= maxTier)
    .map((item) => {
      const totalCost = tile.price! + item.level * tile.houseCost!;
      return {
        level: item.level,
        label: item.label,
        totalCost,
        affordable: player.cash >= totalCost,
      };
    });
}

export interface UpgradeCheckOptions {
  isOnTileLanding?: boolean;
  allowRemoteFromStart?: boolean;
  targetLevel?: number;
}

/**
 * Checks whether a player can upgrade an owned PROPERTY in Business Tour:
 * - Must either land directly on that city (`isOnTileLanding: true`) OR land directly on START (`allowRemoteFromStart: true`).
 * - Lap 0 caps upgrades at Level 2.
 * - Lap 1+ allows upgrading directly from any owned level (0..3) up to Level 4 (Hotel ★) by paying the difference!
 */
export function canUpgradeProperty(
  player: PlayerState,
  tileIndex: number,
  properties: Record<number, PropertyState>,
  options?: UpgradeCheckOptions
): { allowed: boolean; cost: number; targetLevel: number; reason?: string } {
  const tile = BOARD_TILES[tileIndex];
  const prop = properties[tileIndex];
  if (!tile || tile.kind !== TileKind.PROPERTY || !prop || !tile.houseCost) {
    return { allowed: false, cost: 0, targetLevel: 0, reason: 'Ô này không thể xây nhà.' };
  }
  if (prop.ownerId !== player.id) {
    return {
      allowed: false,
      cost: tile.houseCost,
      targetLevel: prop.level + 1,
      reason: 'Bạn không sở hữu thành phố này.',
    };
  }
  if (prop.level >= 4) {
    return {
      allowed: false,
      cost: 0,
      targetLevel: 4,
      reason: 'Đã đạt cấp Khách sạn Biểu tượng tối đa (★).',
    };
  }

  const desiredTarget = options?.targetLevel ?? prop.level + 1;
  if (desiredTarget <= prop.level || desiredTarget > 4) {
    return {
      allowed: false,
      cost: 0,
      targetLevel: desiredTarget,
      reason: 'Cấp nâng cấp không hợp lệ.',
    };
  }

  const totalCost = (desiredTarget - prop.level) * tile.houseCost;

  if (player.laps === 0 && desiredTarget > 2) {
    return {
      allowed: false,
      cost: totalCost,
      targetLevel: desiredTarget,
      reason: 'Vòng đầu tiên chỉ cho phép xây tối đa 2 Nhà. Qua BẮT ĐẦU để mở khóa Cấp 3 & Khách sạn ★!',
    };
  }

  if (!options?.isOnTileLanding && !options?.allowRemoteFromStart) {
    return {
      allowed: false,
      cost: totalCost,
      targetLevel: desiredTarget,
      reason: 'Chỉ có thể nâng cấp công trình khi dừng tại thành phố đó hoặc dừng đúng ô BẮT ĐẦU.',
    };
  }
  if (player.cash < totalCost) {
    return {
      allowed: false,
      cost: totalCost,
      targetLevel: desiredTarget,
      reason: `Cần ${formatBusinessTourCompact(totalCost)} tiền mặt để nâng cấp.`,
    };
  }
  return { allowed: true, cost: totalCost, targetLevel: desiredTarget };
}

/**
 * Total invested capital (100% refund value when selling back to Bank during debt).
 */
export function calculatePropertyInvestedValue(tileIndex: number, level: number): number {
  const tile = BOARD_TILES[tileIndex];
  if (!tile || !isPurchasableTile(tile) || !tile.price) return 0;
  if (tile.kind === TileKind.RESORT) return tile.price;
  return tile.price + Math.max(0, level) * (tile.houseCost ?? 0);
}

/**
 * Sum of invested value across all properties & resorts owned by `playerId`.
 */
export function calculateTotalRealEstateValue(
  playerId: number,
  properties: Record<number, PropertyState>
): number {
  let total = 0;
  for (const prop of Object.values(properties)) {
    if (prop.ownerId === playerId) {
      total += calculatePropertyInvestedValue(prop.tileIndex, prop.level);
    }
  }
  return total;
}

/**
 * Business Tour Tax Agency charge: 10% of total owned real estate capital.
 */
export function calculateTaxAmount(
  playerId: number,
  properties: Record<number, PropertyState>
): number {
  const totalRealEstate = calculateTotalRealEstateValue(playerId, properties);
  return Math.round(totalRealEstate * 0.1);
}

/**
 * Business Tour Buyout cost = 2x total invested value (land + standing houses).
 */
export function calculateBuyoutPrice(tileIndex: number, level: number): number {
  const tile = BOARD_TILES[tileIndex];
  if (!tile || tile.kind !== TileKind.PROPERTY || !tile.price) return 0;
  return calculatePropertyInvestedValue(tileIndex, level) * 2;
}

export function canBuyoutProperty(
  buyer: PlayerState,
  tileIndex: number,
  properties: Record<number, PropertyState>,
  modifiers?: MatchBoardModifiers
): { allowed: boolean; cost: number; reason?: string } {
  const tile = BOARD_TILES[tileIndex];
  const prop = properties[tileIndex];
  if (!tile || tile.kind !== TileKind.PROPERTY || !prop || prop.ownerId === null) {
    return { allowed: false, cost: 0, reason: 'Ô này miễn nhiễm mua lại.' };
  }
  if (prop.ownerId === buyer.id) {
    return { allowed: false, cost: 0, reason: 'Đây đã là tài sản của bạn.' };
  }
  if (prop.level >= 4) {
    return {
      allowed: false,
      cost: 0,
      reason: 'Khách sạn Cấp 4 là Biểu tượng bất khả xâm phạm — miễn nhiễm mua lại!',
    };
  }
  if (modifiers?.shieldedTileIndices?.includes(tileIndex)) {
    return {
      allowed: false,
      cost: 0,
      reason: 'Thành phố đang có Khiên Bảo Hộ — miễn nhiễm mua lại!',
    };
  }
  const cost = calculateBuyoutPrice(tileIndex, prop.level);
  if (buyer.cash < cost) {
    return {
      allowed: false,
      cost,
      reason: `Không đủ ${formatBusinessTourCompact(cost)} để mua lại thành phố này.`,
    };
  }
  return { allowed: true, cost };
}

/**
 * Computes optimal 100%-refund property sale plan to cover `cashNeeded` (debt - currentCash).
 * Preserves Lv4 Hotels > full Color Monopolies > multi-Resort sets > Championship host city > higher value.
 */
export function computeOptimalAutoSale(
  playerId: number,
  cashNeeded: number,
  properties: Record<number, PropertyState>,
  modifiers?: MatchBoardModifiers
): AutoSalePlan {
  if (cashNeeded <= 0) {
    return {
      sufficient: true,
      tileIndicesToSell: [],
      totalRefund: 0,
      cashAfterDebt: Math.abs(cashNeeded),
    };
  }

  const owned = Object.values(properties)
    .filter((p) => p.ownerId === playerId)
    .sort((a, b) => a.tileIndex - b.tileIndex);

  if (owned.length === 0) {
    return {
      sufficient: false,
      tileIndicesToSell: [],
      totalRefund: 0,
      cashAfterDebt: -cashNeeded,
    };
  }

  const ownedResortCount = RESORT_TILE_INDICES.filter(
    (idx) => properties[idx]?.ownerId === playerId
  ).length;

  const items = owned.map((prop) => {
    const tile = BOARD_TILES[prop.tileIndex];
    const refund = calculatePropertyInvestedValue(prop.tileIndex, prop.level);
    let keepWeight = refund;
    if (prop.level >= 4) keepWeight += 10_000_000;
    if (tile?.group && ownsFullColorGroup(playerId, tile.group, properties)) {
      keepWeight += 5_000_000;
    }
    if (tile?.kind === TileKind.RESORT && ownedResortCount >= 2) {
      keepWeight += 3_000_000;
    }
    if (modifiers?.championshipTileIndex === prop.tileIndex) {
      keepWeight += 2_000_000;
    }
    if (modifiers?.shieldedTileIndices?.includes(prop.tileIndex)) {
      keepWeight += 1_500_000;
    }
    if (modifiers?.festivalTileIndices.includes(prop.tileIndex)) {
      keepWeight += 1_000_000;
    }
    return { tileIndex: prop.tileIndex, refund, keepWeight };
  });

  const totalAll = items.reduce((acc, it) => acc + it.refund, 0);
  if (totalAll < cashNeeded) {
    return {
      sufficient: false,
      tileIndicesToSell: items.map((it) => it.tileIndex),
      totalRefund: totalAll,
      cashAfterDebt: totalAll - cashNeeded,
    };
  }

  if (items.length <= 16) {
    let bestMask = (1 << items.length) - 1;
    let bestWeight = Number.POSITIVE_INFINITY;
    let bestRefund = Number.POSITIVE_INFINITY;

    const totalMasks = 1 << items.length;
    for (let mask = 1; mask < totalMasks; mask++) {
      let sumRefund = 0;
      let sumWeight = 0;
      for (let i = 0; i < items.length; i++) {
        if ((mask & (1 << i)) !== 0) {
          sumRefund += items[i].refund;
          sumWeight += items[i].keepWeight;
        }
      }
      if (sumRefund >= cashNeeded) {
        if (
          sumWeight < bestWeight ||
          (sumWeight === bestWeight && sumRefund < bestRefund)
        ) {
          bestWeight = sumWeight;
          bestRefund = sumRefund;
          bestMask = mask;
        }
      }
    }

    const chosen: number[] = [];
    for (let i = 0; i < items.length; i++) {
      if ((bestMask & (1 << i)) !== 0) {
        chosen.push(items[i].tileIndex);
      }
    }
    return {
      sufficient: true,
      tileIndicesToSell: chosen,
      totalRefund: bestRefund,
      cashAfterDebt: bestRefund - cashNeeded,
    };
  }

  const sortedAsc = [...items].sort((a, b) => a.keepWeight - b.keepWeight);
  const picked: typeof items = [];
  let accRefund = 0;
  for (const item of sortedAsc) {
    picked.push(item);
    accRefund += item.refund;
    if (accRefund >= cashNeeded) break;
  }
  for (let i = picked.length - 1; i >= 0; i--) {
    if (accRefund - picked[i].refund >= cashNeeded) {
      accRefund -= picked[i].refund;
      picked.splice(i, 1);
    }
  }
  return {
    sufficient: true,
    tileIndicesToSell: picked.map((p) => p.tileIndex).sort((a, b) => a - b),
    totalRefund: accRefund,
    cashAfterDebt: accRefund - cashNeeded,
  };
}

/**
 * Valid World Tour destination in Business Tour:
 * Allows any purchasable tile (unowned, own, or opponent's for 2x Buyout), START (0),
 * WORLD_CHAMPIONSHIPS (16, when owning >= 1 city), and CHANCE (12, 20, 28).
 * Blocks WORLD_TOUR itself (24), LOST_ISLAND (8), and TAX (30) to prevent self-sabotage misclicks.
 */
export function isValidWorldTourTarget(
  player: PlayerState,
  tileIndex: number,
  properties: Record<number, PropertyState>
): boolean {
  const tile = BOARD_TILES[tileIndex];
  if (!tile) return false;
  if (
    tileIndex === WORLD_TOUR_TILE_INDEX ||
    tileIndex === LOST_ISLAND_TILE_INDEX ||
    tileIndex === TAX_TILE_INDEX
  ) {
    return false;
  }
  if (tile.kind === TileKind.WORLD_CHAMPIONSHIPS) {
    return Object.values(properties).some(
      (p) => p.ownerId === player.id && BOARD_TILES[p.tileIndex]?.kind === TileKind.PROPERTY
    );
  }
  return (
    isPurchasableTile(tile) ||
    tile.kind === TileKind.START ||
    tile.kind === TileKind.CHANCE
  );
}

/**
 * Computes clockwise path & Start bonus / lap increment for a World Tour flight.
 */
export function resolveWorldTourMovement(
  fromIndex: number,
  targetTile: number
): { path: number[]; passedStart: boolean; lapsDelta: number } {
  const { path, passedStart } = computePathToTile(fromIndex, targetTile, true);
  return {
    path,
    passedStart,
    lapsDelta: passedStart ? 1 : 0,
  };
}

/**
 * Evaluates a dice roll made while stranded on Lost Island (Tile 8):
 * - Doubles escape immediately (no bonus roll).
 * - Failing 3rd turn frees the player automatically at zero cost and moves `die1 + die2`.
 */
export function resolveIslandRollOutcome(
  die1: number,
  die2: number,
  currentJailTurns: number
): {
  escaped: boolean;
  moveSteps: number;
  nextJailTurns: number;
  nextDoublesStreak: 0;
} {
  const sum = die1 + die2;
  if (die1 === die2) {
    return {
      escaped: true,
      moveSteps: sum,
      nextJailTurns: 0,
      nextDoublesStreak: 0,
    };
  }
  const nextTurns = currentJailTurns + 1;
  if (nextTurns >= MAX_JAIL_TURNS) {
    return {
      escaped: true,
      moveSteps: sum,
      nextJailTurns: 0,
      nextDoublesStreak: 0,
    };
  }
  return {
    escaped: false,
    moveSteps: 0,
    nextJailTurns: nextTurns,
    nextDoublesStreak: 0,
  };
}

/**
 * Computes total net worth (cash + 100% invested value of owned properties & buildings).
 */
export function calculateNetWorth(
  player: PlayerState,
  properties: Record<number, PropertyState>
): number {
  if (player.bankrupt) return 0;
  let total = Math.max(0, player.cash);
  for (const prop of Object.values(properties)) {
    if (prop.ownerId === player.id) {
      total += calculatePropertyInvestedValue(prop.tileIndex, prop.level);
    }
  }
  return total;
}

export function getNextActivePlayerIndex(
  players: PlayerState[],
  currentIndex: number
): number {
  const count = players.length;
  for (let offset = 1; offset <= count; offset++) {
    const idx = (currentIndex + offset) % count;
    if (!players[idx].bankrupt) {
      return idx;
    }
  }
  return currentIndex;
}

export function getWinner(players: PlayerState[]): PlayerState | null {
  const alive = players.filter((p) => !p.bankrupt);
  if (alive.length === 1) return alive[0];
  return null;
}

/**
 * Evaluates all 4 Business Tour Victory Conditions:
 * 1. LAST_STANDING (all opponents bankrupt)
 * 2. TRIPLE_MONOPOLY (3+ full color groups)
 * 3. SIDE_MONOPOLY (all purchasable tiles along 1 full board edge)
 * 4. RESORT_MONOPOLY (all 4 Island/Bay Resorts)
 */
export function evaluateMatchWinner(
  players: PlayerState[],
  properties: Record<number, PropertyState>
): MatchWinnerResult | null {
  const alive = players.filter((p) => !p.bankrupt);
  if (alive.length === 1) {
    return {
      winner: alive[0],
      condition: 'LAST_STANDING',
      label: 'Chiến thắng Độc Tôn — Toàn bộ đối thủ đã phá sản!',
    };
  }

  const allColorGroups = Object.values(ColorGroup);
  for (const pl of alive) {
    const ownedResorts = RESORT_TILE_INDICES.filter(
      (idx) => properties[idx]?.ownerId === pl.id
    ).length;
    if (ownedResorts >= RESORT_TILE_INDICES.length) {
      return {
        winner: pl,
        condition: 'RESORT_MONOPOLY',
        label: 'Chiến thắng Độc Quyền Du Lịch — Sở hữu trọn bộ 4 Khu Nghỉ Dưỡng!',
      };
    }

    const ownedMonoCount = allColorGroups.filter((grp) =>
      ownsFullColorGroup(pl.id, grp, properties)
    ).length;
    if (ownedMonoCount >= 3) {
      return {
        winner: pl,
        condition: 'TRIPLE_MONOPOLY',
        label: `Chiến thắng Độc Quyền 3 Bộ Màu (${ownedMonoCount} nhóm màu)!`,
      };
    }

    for (const side of BOARD_SIDES) {
      const ownsEntireSide = side.tileIndices.every(
        (idx) => properties[idx]?.ownerId === pl.id
      );
      if (ownsEntireSide) {
        return {
          winner: pl,
          condition: 'SIDE_MONOPOLY',
          label: `Chiến thắng Thống Trị Bản Đồ — Sở hữu trọn ${side.label}!`,
        };
      }
    }
  }

  return null;
}

/**
 * Ranks all players for the final Victory Leaderboard:
 * 1. The match winner (`winnerId`) ALWAYS ranks #1 (crucial for special instant victories
 *    like RESORT_MONOPOLY, TRIPLE_MONOPOLY, and SIDE_MONOPOLY where an opponent may hold higher cash/net worth).
 * 2. Surviving players (`!bankrupt`) ALWAYS rank above bankrupt players (`bankrupt`), even at 0 net worth.
 * 3. Descending total Net Worth (`calculateNetWorth`), then descending cash, then player id.
 */
export function rankPlayersForVictory(
  players: PlayerState[],
  properties: Record<number, PropertyState>,
  winnerId: number
): PlayerState[] {
  return [...players].sort((a, b) => {
    const aIsWinner = a.id === winnerId;
    const bIsWinner = b.id === winnerId;
    if (aIsWinner !== bIsWinner) return aIsWinner ? -1 : 1;

    if (a.bankrupt !== b.bankrupt) return a.bankrupt ? 1 : -1;

    const nwDiff = calculateNetWorth(b, properties) - calculateNetWorth(a, properties);
    if (nwDiff !== 0) return nwDiff;

    const cashDiff = b.cash - a.cash;
    if (cashDiff !== 0) return cashDiff;

    return a.id - b.id;
  });
}

/**
 * Simulates acquiring `tileIndex` for `actorId` and returns the resulting `MatchWinnerResult`
 * if and only if owning `tileIndex` immediately wins the match for `actorId`.
 */
export function wouldOwnTileWinMatch(
  actorId: number,
  tileIndex: number,
  players: PlayerState[],
  properties: Record<number, PropertyState>
): MatchWinnerResult | null {
  const tile = BOARD_TILES[tileIndex];
  if (!tile || !isPurchasableTile(tile)) return null;

  const simProps: Record<number, PropertyState> = {
    ...properties,
    [tileIndex]: {
      tileIndex,
      ownerId: actorId,
      level: properties[tileIndex]?.level ?? 0,
    },
  };

  const evalPlayers: PlayerState[] =
    players.length >= 2
      ? players
      : [
          {
            id: actorId,
            name: 'Actor',
            isBot: true,
            color: '#F5B800',
            colorName: 'Vàng',
            tokenType: 'car',
            cash: 1,
            position: tileIndex,
            laps: 1,
            inJail: false,
            jailTurns: 0,
            jailFreeCards: 0,
            doublesStreak: 0,
            pendingWorldTour: false,
            bankrupt: false,
          },
          {
            id: actorId + 1,
            name: 'Opponent',
            isBot: true,
            color: '#29B6F6',
            colorName: 'Lam',
            tokenType: 'crown',
            cash: 1,
            position: 0,
            laps: 1,
            inJail: false,
            jailTurns: 0,
            jailFreeCards: 0,
            doublesStreak: 0,
            pendingWorldTour: false,
            bankrupt: false,
          },
        ];

  const win = evaluateMatchWinner(evalPlayers, simProps);
  return win && win.winner.id === actorId ? win : null;
}

/* ============================
 * SMART BOT AI DECISION RULES
 * ============================ */

function isStrategicWinOrBlockTile(
  actorId: number,
  tileIndex: number,
  players: PlayerState[],
  properties: Record<number, PropertyState>
): boolean {
  const tile = BOARD_TILES[tileIndex];
  if (!tile) return false;

  const activeIds = players.filter((p) => !p.bankrupt).map((p) => p.id);

  if (tile.group) {
    const groupTiles = COLOR_GROUP_META[tile.group].tileIndices;
    for (const pid of activeIds) {
      const owned = groupTiles.filter(
        (idx) => idx !== tileIndex && properties[idx]?.ownerId === pid
      ).length;
      if (owned === groupTiles.length - 1) return true;
    }
  }

  if (tile.kind === TileKind.RESORT) {
    for (const pid of activeIds) {
      const ownedResorts = RESORT_TILE_INDICES.filter(
        (idx) => idx !== tileIndex && properties[idx]?.ownerId === pid
      ).length;
      if (ownedResorts >= RESORT_TILE_INDICES.length - 1) return true;
    }
    if (
      RESORT_TILE_INDICES.some(
        (idx) => idx !== tileIndex && properties[idx]?.ownerId === actorId
      )
    ) {
      return true;
    }
  }

  for (const side of BOARD_SIDES) {
    if (!side.tileIndices.includes(tileIndex)) continue;
    for (const pid of activeIds) {
      const ownedOnSide = side.tileIndices.filter(
        (idx) => idx !== tileIndex && properties[idx]?.ownerId === pid
      ).length;
      if (ownedOnSide === side.tileIndices.length - 1) return true;
    }
  }

  return false;
}

/**
 * Bot buys unowned tile if remaining cash >= 400K, or >= 100K when completing/blocking
 * a Color Group, Board Side, or Resort Monopoly.
 */
export function botShouldBuyProperty(
  bot: PlayerState,
  tileIndex: number,
  players: PlayerState[],
  properties: Record<number, PropertyState>
): boolean {
  const tile = BOARD_TILES[tileIndex];
  if (!tile || !tile.price || !isPurchasableTile(tile)) return false;
  if (bot.cash < tile.price) return false;

  if (wouldOwnTileWinMatch(bot.id, tileIndex, players, properties)) {
    return true;
  }

  const cashAfter = bot.cash - tile.price;
  if (cashAfter >= 400_000) return true;

  if (isStrategicWinOrBlockTile(bot.id, tileIndex, players, properties) && cashAfter >= 100_000) {
    return true;
  }

  return false;
}

/**
 * Bot chooses how many initial houses (0..3) to build while obeying lap caps.
 */
export function botPickInitialPurchaseTier(
  bot: PlayerState,
  tileIndex: number,
  properties: Record<number, PropertyState>
): 0 | 1 | 2 | 3 {
  const tiers = getInitialPurchaseTiers(bot, tileIndex).filter((t) => t.affordable);
  if (tiers.length <= 1) return 0;

  const tile = BOARD_TILES[tileIndex];
  const completesMono =
    Boolean(tile?.group) &&
    COLOR_GROUP_META[tile!.group!].tileIndices.every(
      (idx) => idx === tileIndex || properties[idx]?.ownerId === bot.id
    );
  const reserveTarget = completesMono ? 250_000 : 450_000;

  let chosen: 0 | 1 | 2 | 3 = 0;
  for (const tier of tiers) {
    if (bot.cash - tier.totalCost >= reserveTarget) {
      chosen = tier.level;
    }
  }
  return chosen;
}

/**
 * When a Bot lands on its own PROPERTY, picks highest legal upgrade target level respecting lap caps & Lv3->Lv4 rule.
 */
export function botPickOnTileUpgradeTargetLevel(
  bot: PlayerState,
  tileIndex: number,
  properties: Record<number, PropertyState>
): number | null {
  const prop = properties[tileIndex];
  const tile = BOARD_TILES[tileIndex];
  if (!prop || !tile || prop.ownerId !== bot.id || prop.level >= 4 || !tile.houseCost) {
    return null;
  }

  for (let target = 4; target > prop.level; target--) {
    const check = canUpgradeProperty(bot, tileIndex, properties, {
      isOnTileLanding: true,
      targetLevel: target,
    });
    if (!check.allowed) continue;
    const minReserve = target === 4 ? 200_000 : 350_000;
    if (bot.cash - check.cost >= minReserve) {
      return target;
    }
  }
  return null;
}

/**
 * Evaluates whether a Bot should execute a 2x Buyout after paying rent on an opponent's PROPERTY.
 */
export function botShouldBuyoutProperty(
  bot: PlayerState,
  tileIndex: number,
  players: PlayerState[],
  properties: Record<number, PropertyState>,
  modifiers?: MatchBoardModifiers
): boolean {
  const check = canBuyoutProperty(bot, tileIndex, properties, modifiers);
  if (!check.allowed) return false;

  const tile = BOARD_TILES[tileIndex];
  const prop = properties[tileIndex];
  if (!tile || !prop || prop.ownerId === null) return false;

  if (wouldOwnTileWinMatch(bot.id, tileIndex, players, properties)) {
    return true;
  }

  const cashAfter = bot.cash - check.cost;
  const completesBotColor =
    Boolean(tile.group) &&
    COLOR_GROUP_META[tile.group!].tileIndices.every(
      (idx) => idx === tileIndex || properties[idx]?.ownerId === bot.id
    );
  const completesBotSide = BOARD_SIDES.some(
    (side) =>
      side.tileIndices.includes(tileIndex) &&
      side.tileIndices.every((idx) => idx === tileIndex || properties[idx]?.ownerId === bot.id)
  );
  if ((completesBotColor || completesBotSide) && cashAfter >= 150_000) return true;

  const ownerId = prop.ownerId;
  const ownerBrokenMono =
    Boolean(tile.group) && ownsFullColorGroup(ownerId, tile.group!, properties);
  const ownerMonoCount = Object.values(ColorGroup).filter((g) =>
    ownsFullColorGroup(ownerId, g, properties)
  ).length;
  const ownerNearSide = BOARD_SIDES.some(
    (side) =>
      side.tileIndices.includes(tileIndex) &&
      side.tileIndices.filter((idx) => properties[idx]?.ownerId === ownerId).length >=
        side.tileIndices.length - 1
  );
  const ownerExists = players.some((p) => p.id === ownerId && !p.bankrupt);

  if (ownerExists && (ownerBrokenMono || ownerMonoCount >= 2 || ownerNearSide) && cashAfter >= 280_000) {
    return true;
  }

  return cashAfter >= 700_000;
}

/**
 * Bot picks its highest-rent city to host World Championships (free on Tile 16 & Chance card).
 */
export function botPickChampionshipTarget(
  bot: PlayerState,
  properties: Record<number, PropertyState>,
  modifiers: MatchBoardModifiers,
  isFree = false
): number | null {
  const fee = isFree ? 0 : CHAMPIONSHIP_FEE;
  if (bot.cash < fee) return null;
  if (fee > 0 && bot.cash < fee + 150_000) return null;

  const ownedCities = Object.values(properties).filter(
    (p) => p.ownerId === bot.id && BOARD_TILES[p.tileIndex]?.kind === TileKind.PROPERTY
  );
  if (ownedCities.length === 0) return null;

  let bestTile = ownedCities[0].tileIndex;
  let bestScore = -1;
  for (const city of ownedCities) {
    const simMods = applyChampionshipHost(modifiers, city.tileIndex);
    const projectedRent = calculateRent(city.tileIndex, properties, simMods);
    const score = projectedRent + city.level * 15_000;
    if (score > bestScore) {
      bestScore = score;
      bestTile = city.tileIndex;
    }
  }
  return bestTile;
}

/**
 * Bot picks the best legal World Tour flight target across unowned tiles, opponent buyout targets,
 * own upgradable cities, or World Championships.
 */
export function botPickWorldTourTarget(
  bot: PlayerState,
  properties: Record<number, PropertyState>,
  modifiers: MatchBoardModifiers,
  players: PlayerState[] = []
): number | null {
  if (bot.cash < WORLD_TOUR_FEE) return null;

  // 0. Affordable INSTANT MATCH VICTORY check (never skip winning the match due to cash-reserve thresholds!)
  for (const tile of BOARD_TILES) {
    if (!isValidWorldTourTarget(bot, tile.index, properties) || !isPurchasableTile(tile)) {
      continue;
    }
    if (!wouldOwnTileWinMatch(bot.id, tile.index, players, properties)) {
      continue;
    }
    const prop = properties[tile.index];
    const move = resolveWorldTourMovement(bot.position, tile.index);
    const cashBudget = bot.cash + (move.passedStart ? START_SALARY : 0) - WORLD_TOUR_FEE;

    if (!prop || prop.ownerId === null) {
      if (tile.price && cashBudget >= tile.price) {
        return tile.index;
      }
    } else if (prop.ownerId !== bot.id && tile.kind === TileKind.PROPERTY) {
      if (players.length > 0 && !players.some((p) => p.id === prop.ownerId && !p.bankrupt)) {
        continue;
      }
      const wasOutage = Boolean(modifiers.outageTileIndices?.includes(tile.index));
      const rent = wasOutage ? 0 : calculateRent(tile.index, properties, modifiers);
      const cashAfterRent = cashBudget - rent;
      if (cashAfterRent < 0) continue;
      const simBuyer: PlayerState = { ...bot, cash: cashAfterRent };
      const buyoutCheck = canBuyoutProperty(simBuyer, tile.index, properties, modifiers);
      if (buyoutCheck.allowed && cashAfterRent >= buyoutCheck.cost) {
        return tile.index;
      }
    }
  }

  if (bot.cash < WORLD_TOUR_FEE + 150_000) return null;

  // 1. Instant-win or Monopoly completion on unowned tiles
  const validUnowned = BOARD_TILES.filter(
    (t) =>
      isValidWorldTourTarget(bot, t.index, properties) &&
      properties[t.index]?.ownerId === null &&
      t.price
  );

  for (const tile of validUnowned) {
    const move = resolveWorldTourMovement(bot.position, tile.index);
    const cashBudget = bot.cash + (move.passedStart ? START_SALARY : 0) - WORLD_TOUR_FEE;
    if (cashBudget - tile.price! < 120_000) continue;

    if (tile.kind === TileKind.RESORT) {
      const ownedResorts = RESORT_TILE_INDICES.filter(
        (i) => i !== tile.index && properties[i]?.ownerId === bot.id
      ).length;
      if (ownedResorts === RESORT_TILE_INDICES.length - 1) return tile.index;
    }
    if (tile.group) {
      const groupTiles = COLOR_GROUP_META[tile.group].tileIndices;
      const ownedCount = groupTiles.filter(
        (i) => i !== tile.index && properties[i]?.ownerId === bot.id
      ).length;
      if (ownedCount === groupTiles.length - 1) return tile.index;
    }
    for (const side of BOARD_SIDES) {
      if (side.tileIndices.includes(tile.index)) {
        const ownedSide = side.tileIndices.filter(
          (i) => i !== tile.index && properties[i]?.ownerId === bot.id
        ).length;
        if (ownedSide === side.tileIndices.length - 1) return tile.index;
      }
    }
  }

  // 2. Strategic 2x Buyout of an opponent's unprotected city to complete a Monopoly or win a Side!
  for (const tile of BOARD_TILES) {
    const prop = properties[tile.index];
    if (
      !prop ||
      prop.ownerId === null ||
      prop.ownerId === bot.id ||
      tile.kind !== TileKind.PROPERTY ||
      !isValidWorldTourTarget(bot, tile.index, properties)
    ) {
      continue;
    }
    if (players.length > 0 && !players.some((p) => p.id === prop.ownerId && !p.bankrupt)) {
      continue;
    }
    const move = resolveWorldTourMovement(bot.position, tile.index);
    const rent = calculateRent(tile.index, properties, modifiers);
    const cashAfterRent = bot.cash + (move.passedStart ? START_SALARY : 0) - WORLD_TOUR_FEE - rent;
    const simBuyer: PlayerState = { ...bot, cash: cashAfterRent };
    const buyoutCheck = canBuyoutProperty(simBuyer, tile.index, properties, modifiers);
    if (!buyoutCheck.allowed || cashAfterRent - buyoutCheck.cost < 150_000) continue;

    const completesGroup =
      Boolean(tile.group) &&
      COLOR_GROUP_META[tile.group!].tileIndices.every(
        (i) => i === tile.index || properties[i]?.ownerId === bot.id
      );
    const completesSide = BOARD_SIDES.some(
      (side) =>
        side.tileIndices.includes(tile.index) &&
        side.tileIndices.every((i) => i === tile.index || properties[i]?.ownerId === bot.id)
    );
    if (completesSide || completesGroup) {
      return tile.index;
    }
  }

  // 3. Upgrade own city to Hotel ★ (or highest legal level)
  const ownUpgradable = Object.values(properties)
    .filter(
      (p) =>
        p.ownerId === bot.id &&
        BOARD_TILES[p.tileIndex]?.kind === TileKind.PROPERTY &&
        isValidWorldTourTarget(bot, p.tileIndex, properties) &&
        p.level < 4
    )
    .sort((a, b) => {
      const rentA = calculateRent(a.tileIndex, properties, modifiers);
      const rentB = calculateRent(b.tileIndex, properties, modifiers);
      return rentB - rentA;
    });

  for (const cand of ownUpgradable) {
    const move = resolveWorldTourMovement(bot.position, cand.tileIndex);
    const simBot: PlayerState = {
      ...bot,
      cash: bot.cash + (move.passedStart ? START_SALARY : 0) - WORLD_TOUR_FEE,
      laps: bot.laps + move.lapsDelta,
    };
    const bestTarget = botPickOnTileUpgradeTargetLevel(simBot, cand.tileIndex, properties);
    if (bestTarget !== null) {
      return cand.tileIndex;
    }
  }

  // 4. Fly to World Championships (16) if Bot owns a Hotel ★ not currently hosting the Cup
  const ownsPowerCity = Object.values(properties).some(
    (p) =>
      p.ownerId === bot.id &&
      BOARD_TILES[p.tileIndex]?.kind === TileKind.PROPERTY &&
      p.level >= 4 &&
      modifiers.championshipTileIndex !== p.tileIndex
  );
  if (
    ownsPowerCity &&
    isValidWorldTourTarget(bot, WORLD_CHAMPIONSHIPS_TILE_INDEX, properties) &&
    bot.cash >= WORLD_TOUR_FEE + 250_000
  ) {
    return WORLD_CHAMPIONSHIPS_TILE_INDEX;
  }

  // 5. Best affordable unowned Resort or City
  const bestUnowned = validUnowned
    .filter((t) => {
      const move = resolveWorldTourMovement(bot.position, t.index);
      const cashBudget = bot.cash + (move.passedStart ? START_SALARY : 0) - WORLD_TOUR_FEE;
      return cashBudget - (t.price ?? 0) >= 350_000;
    })
    .sort((a, b) => {
      const scoreA = a.kind === TileKind.RESORT ? 250_000 : a.price ?? 0;
      const scoreB = b.kind === TileKind.RESORT ? 250_000 : b.price ?? 0;
      return scoreB - scoreA;
    });

  if (bestUnowned.length > 0) {
    return bestUnowned[0].index;
  }

  return null;
}

export function botChooseJailAction(
  bot: PlayerState
): 'USE_CARD' | 'PAY_FINE' | 'ROLL_DOUBLES' {
  if (bot.jailFreeCards > 0) return 'USE_CARD';
  if (bot.cash >= 650_000) return 'PAY_FINE';
  return 'ROLL_DOUBLES';
}

/* ==========================================
 * CINEMATIC CAMERA & DAY/NIGHT LIGHTING MATH
 * ========================================== */

export interface CinematicCameraPose {
  target: { x: number; y: number; z: number };
  position: { x: number; y: number; z: number };
  dampLambda: number;
}

/**
 * Computes desired isometric camera target & position when Cinematic Camera is enabled.
 * - 'dice': frames the central dice pit closer for dramatic dice rolls
 * - 'hop': closely tracks the moving player token along the board perimeter
 * - 'idle': gently biases the standard isometric overview toward the active player
 */
export function computeCinematicCameraPose(
  mode: 'dice' | 'hop' | 'idle',
  focusWorldPos: { x: number; y: number; z: number }
): CinematicCameraPose {
  if (mode === 'dice') {
    const tx = 0;
    const ty = 0.15;
    const tz = 0;
    return {
      target: { x: tx, y: ty, z: tz },
      position: { x: tx + 9.2, y: 10.6, z: tz + 9.2 },
      dampLambda: 4.8,
    };
  }

  if (mode === 'hop') {
    // Track 82% of token world position with a dramatic close-in isometric dolly
    const tx = focusWorldPos.x * 0.82;
    const ty = 0.1;
    const tz = focusWorldPos.z * 0.82;
    return {
      target: { x: tx, y: ty, z: tz },
      position: { x: tx + 8.6, y: 9.4, z: tz + 8.6 },
      dampLambda: 5.4,
    };
  }

  // 'idle' — focused neighborhood view centered 65% toward active player's tile
  const tx = focusWorldPos.x * 0.65;
  const ty = -0.15;
  const tz = focusWorldPos.z * 0.65;
  return {
    target: { x: tx, y: ty, z: tz },
    position: { x: tx + 10.8, y: 11.8, z: tz + 10.8 },
    dampLambda: 3.6,
  };
}

export interface DayNightLightingState {
  nightFactor: number;
  skyHex: number;
  hemiSkyHex: number;
  hemiGroundHex: number;
  hemiIntensity: number;
  keyLightHex: number;
  keyLightIntensity: number;
  rimLightIntensity: number;
  envIntensity: number;
  exposure: number;
  windowEmissiveIntensity: number;
  lampBulbEmissiveIntensity: number;
  courtyardPointLightIntensity: number;
  starOpacity: number;
}

function lerpChannel(a: number, b: number, t: number): number {
  return Math.round(a + (b - a) * t);
}

function lerpColorHex(hexDay: number, hexNight: number, t: number): number {
  const r1 = (hexDay >> 16) & 0xff;
  const g1 = (hexDay >> 8) & 0xff;
  const b1 = hexDay & 0xff;

  const r2 = (hexNight >> 16) & 0xff;
  const g2 = (hexNight >> 8) & 0xff;
  const b2 = hexNight & 0xff;

  return (
    (lerpChannel(r1, r2, t) << 16) |
    (lerpChannel(g1, g2, t) << 8) |
    lerpChannel(b1, b2, t)
  );
}

/**
 * Pure interpolation of scene lighting, sky/fog palette, and night architectural glow
 * for `nightFactor` in [0 = Sunny Day, 1 = Starry Night].
 */
export function computeDayNightLightingState(rawFactor: number): DayNightLightingState {
  const t = Math.max(0, Math.min(1, rawFactor));
  // Smoothstep for natural twilight ramp on emissive lamps & windows
  const glowCurve = t * t * (3 - 2 * t);

  return {
    nightFactor: t,
    skyHex: lerpColorHex(0xdcf0ff, 0x111c3d, t),
    hemiSkyHex: lerpColorHex(0xeef8ff, 0x60a5fa, t),
    hemiGroundHex: lerpColorHex(0xffe9f2, 0x312e81, t),
    hemiIntensity: 0.88 - 0.24 * t,
    keyLightHex: lerpColorHex(0xfffdf7, 0xbfdbfe, t),
    keyLightIntensity: 0.96 - 0.34 * t,
    rimLightIntensity: 0.44 + 0.12 * t,
    envIntensity: 0.34 - 0.25 * t,
    exposure: 1.02 + 0.1 * t,
    windowEmissiveIntensity: glowCurve * 2.85,
    lampBulbEmissiveIntensity: glowCurve * 3.8,
    courtyardPointLightIntensity: glowCurve * 4.2,
    starOpacity: Math.max(0, (t - 0.2) / 0.8) * 0.96,
  };
}

/* ==========================================
 * BOT AI PERSONA & GEMINI QUIP CONTEXT BUILDERS
 * ========================================== */

export const MIN_BIG_RENT_FOR_QUIP = 120_000;

export function getBotPersonaDescription(bot: PlayerState): string {
  switch (bot.tokenType) {
    case 'yacht':
      return 'Chủ tập đoàn du thuyền và resort biển lịch lãm, sang chảnh, điềm tĩnh nhưng rất biết khoe khéo.';
    case 'jet':
      return 'Cá mập tài chính (Shark) sắc sảo, mê tốc độ chốt lời bất động sản và hay cà khịa dí dỏm.';
    case 'crown':
      return 'Đại gia đất nền truyền thống hào sảng, hóm hỉnh, thích ví von dân dã Việt Nam nhưng cực kỳ nhạy bén.';
    default:
      return 'Nhà đầu tư tốc độ máu lửa, liều lĩnh, thích chốt đơn nhanh và pha trò vui nhộn.';
  }
}

export function buildBotBuyQuipPayload(
  bot: PlayerState,
  tileIndex: number,
  paidAmount: number,
  nextProperties: Record<number, PropertyState>,
  source: 'DIRECT' | 'BUYOUT' = 'DIRECT'
): BotQuipPayload | null {
  if (!bot.isBot || bot.bankrupt) return null;
  const tile = BOARD_TILES[tileIndex];
  if (!tile || !isPurchasableTile(tile)) return null;

  const listPrice = tile.price ?? paidAmount;
  const completedMonopoly =
    Boolean(tile.group) && ownsFullColorGroup(bot.id, tile.group!, nextProperties);

  let extraContext = 'Vừa chốt mua thành công một điểm đầu tư tiềm năng trên bàn cờ.';
  if (completedMonopoly) {
    extraContext = `Vừa gom trọn bộ nhóm màu (${tile.groupLabel || tile.name}) độc quyền, sẵn sàng xây chuỗi khách sạn!`;
  } else if (source === 'BUYOUT') {
    extraContext = `Vừa chi ${formatBusinessTourCompact(paidAmount)} (2×) thâu tóm thẳng đô thị ${tile.name} từ tay đối thủ!`;
  } else if (tile.kind === TileKind.RESORT) {
    extraContext = `Vừa sở hữu khu nghỉ dưỡng đẳng cấp (${tile.name}) để thu phí du lịch dài hạn!`;
  } else if (listPrice >= 320_000) {
    extraContext = `Vừa sở hữu đất kim cương đắt giá hàng đầu Việt Nam (${tile.name}, giá ${formatBusinessTourCompact(listPrice)})!`;
  } else {
    extraContext = `Vừa mở rộng danh mục đầu tư tại thành phố du lịch nổi tiếng ${tile.name}!`;
  }

  return {
    botId: bot.id,
    botName: bot.name,
    botPersona: getBotPersonaDescription(bot),
    eventKind: 'BUY_PRIME_LAND',
    tileName: tile.name,
    amount: paidAmount,
    botCashAfter: Math.max(0, bot.cash),
    extraContext,
  };
}

export function buildBotRentCollectedQuipPayload(
  landlordBot: PlayerState,
  payerName: string,
  tileIndex: number,
  rentAmount: number,
  properties: Record<number, PropertyState>
): BotQuipPayload | null {
  if (!landlordBot.isBot || landlordBot.bankrupt) return null;
  if (rentAmount < MIN_BIG_RENT_FOR_QUIP) return null;

  const tile = BOARD_TILES[tileIndex];
  if (!tile) return null;

  const prop = properties[tileIndex];
  const levelDesc =
    prop?.level === 4
      ? 'Khách sạn 5 sao'
      : prop && prop.level > 0
        ? `${prop.level} Nhà`
        : 'bất động sản đắc địa';

  return {
    botId: landlordBot.id,
    botName: landlordBot.name,
    botPersona: getBotPersonaDescription(landlordBot),
    eventKind: 'COLLECT_BIG_RENT',
    tileName: tile.name,
    amount: rentAmount,
    botCashAfter: landlordBot.cash,
    extraContext: `Khách quý "${payerName}" vừa ghé thăm ${levelDesc} tại ${tile.name} và nộp ${formatBusinessTourCompact(rentAmount)} tiền thuê!`,
  };
}

export function buildBotPenaltyQuipPayload(
  bot: PlayerState,
  reason: string,
  penaltyAmount: number,
  creditorName?: string
): BotQuipPayload | null {
  if (!bot.isBot || bot.bankrupt || penaltyAmount <= 0) return null;

  const compactPenalty = formatBusinessTourCompact(penaltyAmount);
  const extraContext = creditorName
    ? `Vừa phải bấm bụng trả ${compactPenalty} tiền thuê tại ${reason} cho đối thủ "${creditorName}".`
    : `Vừa bị trừ nóng ${compactPenalty} do "${reason}".`;

  return {
    botId: bot.id,
    botName: bot.name,
    botPersona: getBotPersonaDescription(bot),
    eventKind: 'PAY_PENALTY',
    tileName: reason,
    amount: penaltyAmount,
    botCashAfter: Math.max(0, bot.cash),
    extraContext,
  };
}

/**
 * Determines whether the active player immediately receives another dice roll
 * because they rolled doubles (1st or 2nd streak) without being sent to Jail or going bankrupt.
 */
export function shouldGrantImmediateDoublesRoll(
  player: PlayerState | null | undefined
): boolean {
  return Boolean(
    player &&
      !player.bankrupt &&
      !player.inJail &&
      player.doublesStreak > 0 &&
      player.doublesStreak < 3
  );
}

/**
 * Computes the next TurnPhase right after a landing/card/modal action finishes:
 * - Returns 'AWAIT_ROLL' immediately (skipping any "Đổ tiếp (đôi)" confirmation) when eligible for a doubles bonus roll.
 * - Returns 'AWAIT_END_TURN' otherwise.
 */
export function resolvePostActionTurnPhase(
  player: PlayerState | null | undefined
): 'AWAIT_ROLL' | 'AWAIT_END_TURN' {
  return shouldGrantImmediateDoublesRoll(player) ? 'AWAIT_ROLL' : 'AWAIT_END_TURN';
}

/**
 * Parses an optional `?dice=3-3,1-2` query string into a deterministic queue of valid [1..6, 1..6] pairs.
 */
export function parseDeterministicDiceQueue(search: string): Array<[number, number]> {
  if (!search) return [];
  const params = new URLSearchParams(search.startsWith('?') ? search : `?${search}`);
  const raw = params.get('dice');
  if (!raw) return [];

  const queue: Array<[number, number]> = [];
  for (const token of raw.split(',')) {
    const match = token.trim().match(/^([1-6])[-:]([1-6])$/);
    if (match) {
      queue.push([Number(match[1]), Number(match[2])]);
    }
  }
  return queue;
}

/**
 * Computes consistent token hop duration per step and total animation wait time
 * across both the 3D client (`MonopolyCanvas`) and the online room server (`OnlineRoomManager`).
 * Caps long-distance jumps (>8 tiles, e.g., World Tour / Chance) so movement finishes smoothly.
 */
export function computeTokenHopTiming(
  stepCount: number,
  speedMultiplier = 1
): { stepDurationSec: number; totalWaitMs: number } {
  const safeSpeed = Math.max(0.5, speedMultiplier);
  const baseStep = Math.max(0.16, 0.3 / safeSpeed);
  const stepDurationSec =
    stepCount > 8
      ? Math.max(0.075, Math.min(baseStep, (2.6 / safeSpeed) / stepCount))
      : baseStep;
  const totalWaitMs = Math.round(stepCount * stepDurationSec * 1000 + 220);
  return { stepDurationSec, totalWaitMs };
}

/**
 * Returns all PROPERTY tile indices owned by `player` that can legally and affordably
 * be upgraded by at least 1 level when landing directly on START (Tile 0).
 */
export function getStartUpgradableTileIndices(
  player: PlayerState,
  properties: Record<number, PropertyState>
): number[] {
  return Object.values(properties)
    .filter(
      (p) =>
        p.ownerId === player.id &&
        BOARD_TILES[p.tileIndex]?.kind === TileKind.PROPERTY &&
        canUpgradeProperty(player, p.tileIndex, properties, {
          allowRemoteFromStart: true,
          targetLevel: p.level + 1,
        }).allowed
    )
    .map((p) => p.tileIndex)
    .sort((a, b) => a - b);
}

/**
 * Returns valid target tile indices for Business Tour tactical Chance cards:
 * - EARTHQUAKE: opponent-owned PROPERTY tiles with level < 4 (Hotels ★ & Resorts are immune).
 * - POWER_OUTAGE: opponent-owned PROPERTY or RESORT tiles not currently in outage.
 * - SHIELD_CITY: actor-owned PROPERTY tiles not currently shielded.
 */
export function getValidTacticalCardTargets(
  kind: TacticalCardActionKind,
  actorId: number,
  properties: Record<number, PropertyState>,
  modifiers?: MatchBoardModifiers
): number[] {
  const outageSet = new Set(modifiers?.outageTileIndices ?? []);
  const shieldSet = new Set(modifiers?.shieldedTileIndices ?? []);

  return Object.values(properties)
    .filter((prop) => {
      const tile = BOARD_TILES[prop.tileIndex];
      if (!tile || prop.ownerId === null) return false;
      if (kind === 'SHIELD_CITY') {
        return (
          prop.ownerId === actorId &&
          tile.kind === TileKind.PROPERTY &&
          !shieldSet.has(prop.tileIndex)
        );
      }
      if (kind === 'EARTHQUAKE') {
        return (
          prop.ownerId !== actorId &&
          tile.kind === TileKind.PROPERTY &&
          prop.level < 4
        );
      }
      // POWER_OUTAGE
      return (
        prop.ownerId !== actorId &&
        isPurchasableTile(tile) &&
        !outageSet.has(prop.tileIndex)
      );
    })
    .map((p) => p.tileIndex)
    .sort((a, b) => a - b);
}

export function applyShieldToTile(
  tileIndex: number,
  modifiers: MatchBoardModifiers
): MatchBoardModifiers {
  const current = modifiers.shieldedTileIndices ?? [];
  if (current.includes(tileIndex)) return modifiers;
  return {
    ...modifiers,
    shieldedTileIndices: [...current, tileIndex].sort((a, b) => a - b),
    // Adding a shield also clears any active power outage on the protected city!
    outageTileIndices: (modifiers.outageTileIndices ?? []).filter((i) => i !== tileIndex),
  };
}

export function applyPowerOutageToTile(
  tileIndex: number,
  properties: Record<number, PropertyState>,
  modifiers: MatchBoardModifiers
): { blockedByShield: boolean; nextModifiers: MatchBoardModifiers } {
  const prop = properties[tileIndex];
  if (!prop || prop.ownerId === null) {
    return { blockedByShield: false, nextModifiers: modifiers };
  }
  const shields = modifiers.shieldedTileIndices ?? [];
  if (shields.includes(tileIndex)) {
    return {
      blockedByShield: true,
      nextModifiers: {
        ...modifiers,
        shieldedTileIndices: shields.filter((i) => i !== tileIndex),
      },
    };
  }
  const outages = modifiers.outageTileIndices ?? [];
  const nextOutages = outages.includes(tileIndex)
    ? outages
    : [...outages, tileIndex].sort((a, b) => a - b);
  return {
    blockedByShield: false,
    nextModifiers: {
      ...modifiers,
      outageTileIndices: nextOutages,
    },
  };
}

export function clearTileOutage(
  modifiers: MatchBoardModifiers,
  tileIndex: number
): MatchBoardModifiers {
  const outages = modifiers.outageTileIndices ?? [];
  if (!outages.includes(tileIndex)) return modifiers;
  return {
    ...modifiers,
    outageTileIndices: outages.filter((i) => i !== tileIndex),
  };
}

export function applyEarthquakeToTile(
  tileIndex: number,
  properties: Record<number, PropertyState>,
  modifiers: MatchBoardModifiers
): {
  blockedByShield: boolean;
  destroyedToBank: boolean;
  newLevel: number;
  nextProperties: Record<number, PropertyState>;
  nextModifiers: MatchBoardModifiers;
} {
  const prop = properties[tileIndex];
  const tile = BOARD_TILES[tileIndex];
  if (!prop || prop.ownerId === null || !tile || tile.kind !== TileKind.PROPERTY || prop.level >= 4) {
    return {
      blockedByShield: false,
      destroyedToBank: false,
      newLevel: prop?.level ?? 0,
      nextProperties: properties,
      nextModifiers: modifiers,
    };
  }

  const shields = modifiers.shieldedTileIndices ?? [];
  if (shields.includes(tileIndex)) {
    return {
      blockedByShield: true,
      destroyedToBank: false,
      newLevel: prop.level,
      nextProperties: properties,
      nextModifiers: {
        ...modifiers,
        shieldedTileIndices: shields.filter((i) => i !== tileIndex),
      },
    };
  }

  if (prop.level > 0) {
    const newLevel = prop.level - 1;
    const nextProperties: Record<number, PropertyState> = {
      ...properties,
      [tileIndex]: {
        ...prop,
        level: newLevel,
      },
    };
    return {
      blockedByShield: false,
      destroyedToBank: false,
      newLevel,
      nextProperties,
      nextModifiers: modifiers,
    };
  }

  // Raw land claim (level === 0) collapses back to Bank!
  const nextProperties: Record<number, PropertyState> = {
    ...properties,
    [tileIndex]: {
      tileIndex,
      ownerId: null,
      level: 0,
    },
  };
  return {
    blockedByShield: false,
    destroyedToBank: true,
    newLevel: 0,
    nextProperties,
    nextModifiers: clearDisownedModifiers(modifiers, nextProperties),
  };
}

/**
 * In Business Tour, when a player declares bankruptcy due to an opponent's rent (`creditorId !== null`),
 * all their properties return unowned to the Bank while the creditor collects 100% of their remaining
 * cash PLUS 100% of the liquidated real estate value!
 */
export function calculateBankruptcyCreditorPayout(
  bankruptPlayer: PlayerState,
  creditorId: number | null,
  properties: Record<number, PropertyState>
): number {
  if (creditorId === null) return 0;
  const leftoverCash = Math.max(0, bankruptPlayer.cash);
  const liquidatedAssets = calculateTotalRealEstateValue(bankruptPlayer.id, properties);
  return leftoverCash + liquidatedAssets;
}

/**
 * Bot chooses which owned city and target level to upgrade when landing directly on START (Tile 0).
 */
export function botPickStartUpgradePlan(
  bot: PlayerState,
  properties: Record<number, PropertyState>,
  modifiers?: MatchBoardModifiers
): { tileIndex: number; targetLevel: number } | null {
  const candidates = getStartUpgradableTileIndices(bot, properties);
  if (candidates.length === 0) return null;

  let bestPlan: { tileIndex: number; targetLevel: number; score: number } | null = null;
  for (const idx of candidates) {
    const prop = properties[idx];
    if (!prop) continue;
    const currRent = calculateRent(idx, properties, modifiers);
    for (let target = 4; target > prop.level; target--) {
      const check = canUpgradeProperty(bot, idx, properties, {
        allowRemoteFromStart: true,
        targetLevel: target,
      });
      if (!check.allowed) continue;
      const minReserve = target === 4 ? 180_000 : 300_000;
      if (bot.cash - check.cost < minReserve) continue;

      const simProps: Record<number, PropertyState> = {
        ...properties,
        [idx]: { ...prop, level: target },
      };
      const nextRent = calculateRent(idx, simProps, modifiers);
      const score = (nextRent - currRent) + (target === 4 ? 250_000 : 0);
      if (!bestPlan || score > bestPlan.score) {
        bestPlan = { tileIndex: idx, targetLevel: target, score };
      }
      break;
    }
  }
  return bestPlan ? { tileIndex: bestPlan.tileIndex, targetLevel: bestPlan.targetLevel } : null;
}

/**
 * Bot picks the highest-impact target tile for EARTHQUAKE, POWER_OUTAGE, or SHIELD_CITY.
 */
export function botPickTacticalCardTarget(
  kind: TacticalCardActionKind,
  bot: PlayerState,
  players: PlayerState[],
  properties: Record<number, PropertyState>,
  modifiers: MatchBoardModifiers
): number | null {
  const valid = getValidTacticalCardTargets(kind, bot.id, properties, modifiers).filter((idx) => {
    const ownerId = properties[idx]?.ownerId;
    if (ownerId === null || ownerId === undefined) return false;
    return players.length === 0 || players.some((p) => p.id === ownerId && !p.bankrupt);
  });
  if (valid.length === 0) return null;

  const shieldSet = new Set(modifiers.shieldedTileIndices ?? []);

  let bestIdx = valid[0];
  let bestScore = -1;

  for (const idx of valid) {
    const prop = properties[idx];
    const tile = BOARD_TILES[idx];
    if (!prop || !tile) continue;

    if (kind === 'SHIELD_CITY') {
      const rent = calculateRent(idx, properties, modifiers);
      const vulnerableBonus = prop.level < 4 ? 120_000 : 0;
      const monoBonus =
        tile.group && ownsFullColorGroup(bot.id, tile.group, properties) ? 200_000 : 0;
      const score = rent + vulnerableBonus + monoBonus;
      if (score > bestScore) {
        bestScore = score;
        bestIdx = idx;
      }
      continue;
    }

    if (kind === 'POWER_OUTAGE') {
      const rent = calculateRent(idx, properties, modifiers);
      const shieldPenalty = shieldSet.has(idx) ? 0.35 : 1;
      const score = rent * shieldPenalty;
      if (score > bestScore) {
        bestScore = score;
        bestIdx = idx;
      }
      continue;
    }

    // EARTHQUAKE: prioritize breaking raw-land monopolies or downgrading highest-rent multi-house cities
    const rent = calculateRent(idx, properties, modifiers);
    const breaksMonopoly =
      prop.level === 0 &&
      Boolean(tile.group) &&
      ownsFullColorGroup(prop.ownerId!, tile.group!, properties);
    const rawScore =
      rent + (breaksMonopoly ? 450_000 : 0) + (prop.level > 0 ? prop.level * 80_000 : 40_000);
    const score = shieldSet.has(idx) ? rawScore * 0.3 : rawScore;
    if (score > bestScore) {
      bestScore = score;
      bestIdx = idx;
    }
  }

  return bestIdx;
}

