import { BOARD_TILES, COLOR_GROUP_META } from './boardData';
import {
  BotQuipPayload,
  ColorGroup,
  MatchWinnerResult,
  PlayerSetupConfig,
  PlayerState,
  PropertyState,
  TileDefinition,
  TileKind,
  TradeEvaluationResult,
  TradeOffer,
} from './types';

export const TOTAL_TILES = 28;
export const JAIL_TILE_INDEX = 7;
export const WORLD_TOUR_TILE_INDEX = 14;
export const GO_TO_JAIL_TILE_INDEX = 21;
export const START_SALARY = 200;
export const JAIL_FINE = 50;
export const WORLD_TOUR_FEE = 50;
export const MAX_JAIL_TURNS = 3;
export const TURN_COUNTDOWN_SECONDS = 45;
export const BT_DISPLAY_MULTIPLIER = 3000;

/**
 * Formats internal game dollar amounts into Business Tour compact K/M scale
 * (e.g., 60 -> "180K", 220 -> "660K", 350 -> "1.05M", 400 -> "1.2M", 0 -> "0K").
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
 * Formats internal game dollar amounts into Business Tour spaced cash strings
 * (e.g., 0 -> "0", 220 -> "660 000", 1500 -> "4 500 000", -150 -> "-450 000").
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
 * Computes the Business Tour compact price/value label shown on a tile's protruding 3D outer tab.
 */
export function formatTilePriceLabel(
  tile: TileDefinition,
  buildingLevel = 0
): string | null {
  if (tile.kind === TileKind.PROPERTY && tile.price) {
    const totalInvested = tile.price + Math.max(0, buildingLevel) * (tile.houseCost ?? 0);
    return formatBusinessTourCompact(totalInvested);
  }
  if ((tile.kind === TileKind.TRANSPORT || tile.kind === TileKind.UTILITY) && tile.price) {
    return formatBusinessTourCompact(tile.price);
  }
  if (tile.kind === TileKind.TAX && tile.taxAmount) {
    return formatBusinessTourCompact(-tile.taxAmount, true);
  }
  return null;
}

/**
 * Formats remaining turn countdown seconds as MM:SS (e.g., 25 -> "00:25").
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
  { id: 'SOUTH', label: 'Cạnh Nam (Đà Lạt → Hội An)', tileIndices: [1, 3, 5, 6] },
  { id: 'WEST', label: 'Cạnh Tây (Huế → Vũng Tàu)', tileIndices: [8, 10, 11, 12, 13] },
  { id: 'NORTH', label: 'Cạnh Bắc (Hải Phòng → Nội Bài)', tileIndices: [15, 16, 18, 19, 20] },
  { id: 'EAST', label: 'Cạnh Đông (Đà Nẵng → TP.HCM)', tileIndices: [22, 23, 25, 26, 27] },
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
 * Computes exact 3D board coordinates for each of the 28 tiles.
 * Regular edge tile: width = 1.9, depth = 2.6 (6 per side -> inner span = 11.4, ±5.7)
 * Corner tile: 2.6 x 2.6 centered at (±7.0, ±7.0)
 */
export function getTileTransform(index: number): TileSpatialTransform {
  const W = 1.9;
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
  if (idx >= 1 && idx <= 6) {
    // Bottom edge: from +4.75 to -4.75 along X, z = +7.0
    const offset = idx - 1; // 0..5
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
  if (idx === 7) {
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
  if (idx >= 8 && idx <= 13) {
    // Left edge: from +4.75 to -4.75 along Z, x = -7.0
    const offset = idx - 8;
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
  if (idx === 14) {
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
  if (idx >= 15 && idx <= 20) {
    // Top edge: from -4.75 to +4.75 along X, z = -7.0
    const offset = idx - 15;
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
  if (idx === 21) {
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

  // idx 22..27: Right edge: from -4.75 to +4.75 along Z, x = +7.0
  const offset = idx - 22;
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
  const spread = isCorner ? 0.52 : 0.38;
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
      inJail: false,
      jailTurns: 0,
      jailFreeCards: 0,
      doublesStreak: 0,
      bankrupt: false,
    }));
}

export function createInitialProperties(): Record<number, PropertyState> {
  const map: Record<number, PropertyState> = {};
  for (const tile of BOARD_TILES) {
    if (
      tile.kind === TileKind.PROPERTY ||
      tile.kind === TileKind.TRANSPORT ||
      tile.kind === TileKind.UTILITY
    ) {
      map[tile.index] = {
        tileIndex: tile.index,
        ownerId: null,
        level: 0,
        mortgaged: false,
      };
    }
  }
  return map;
}

export function isPurchasableTile(tile: TileDefinition): boolean {
  return (
    tile.kind === TileKind.PROPERTY ||
    tile.kind === TileKind.TRANSPORT ||
    tile.kind === TileKind.UTILITY
  );
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
 * Calculates exact Business Tour rent when a player lands on an owned tile:
 * - Full color group doubles rent across ALL building levels (0..4)!
 * - Transports: 1 station = 150K (50), 2 stations = 360K (120).
 * - Utility: 24K (8) * diceSum.
 */
export function calculateRent(
  tileIndex: number,
  properties: Record<number, PropertyState>,
  diceSum: number
): number {
  const tile = BOARD_TILES[tileIndex];
  const prop = properties[tileIndex];
  if (!tile || !prop || prop.ownerId === null) return 0;

  if (tile.kind === TileKind.PROPERTY && tile.rents && tile.group) {
    const hasMonopoly = ownsFullColorGroup(prop.ownerId, tile.group, properties);
    const tierRent = tile.rents[Math.min(prop.level, 4)];
    return hasMonopoly ? tierRent * 2 : tierRent;
  }

  if (tile.kind === TileKind.TRANSPORT) {
    const ownedTransports = BOARD_TILES.filter(
      (t) =>
        t.kind === TileKind.TRANSPORT && properties[t.index]?.ownerId === prop.ownerId
    ).length;
    return ownedTransports >= 2 ? 120 : 50;
  }

  if (tile.kind === TileKind.UTILITY) {
    return Math.max(2, diceSum) * 8;
  }

  return 0;
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
 * In Business Tour mode, landing on an unowned city lets the buyer build up to 3 houses immediately.
 * (Hotel / Landmark level 4 requires revisiting the city on a subsequent lap!)
 */
export function getInitialPurchaseTiers(
  player: PlayerState,
  tileIndex: number
): InitialPurchaseTierOption[] {
  const tile = BOARD_TILES[tileIndex];
  if (!tile || !tile.price) return [];

  if (tile.kind !== TileKind.PROPERTY || !tile.houseCost) {
    return [
      {
        level: 0,
        label: 'Sở hữu Hạ tầng',
        totalCost: tile.price,
        affordable: player.cash >= tile.price,
      },
    ];
  }

  const labels: Array<{ level: 0 | 1 | 2 | 3; label: string }> = [
    { level: 0, label: 'Đất trống' },
    { level: 1, label: '1 Nhà xanh' },
    { level: 2, label: '2 Nhà xanh' },
    { level: 3, label: '3 Nhà xanh' },
  ];

  return labels.map((item) => {
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
  targetLevel?: number;
}

/**
 * Checks whether a player can upgrade a property in Business Tour:
 * Must be actively standing on that city (`isOnTileLanding: true`); upgrades up to level 4 (Landmark/Hotel).
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
      reason: 'Bạn không sở hữu mảnh đất này.',
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

  if (!options?.isOnTileLanding) {
    return {
      allowed: false,
      cost: totalCost,
      targetLevel: desiredTarget,
      reason: 'Chỉ có thể nâng cấp công trình khi quân cờ dừng tại chính thành phố đó.',
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
 * Checks whether a house can be sold back to the Bank (50% refund).
 */
export function canSellHouse(
  playerId: number,
  tileIndex: number,
  properties: Record<number, PropertyState>
): { allowed: boolean; refund: number; reason?: string } {
  const tile = BOARD_TILES[tileIndex];
  const prop = properties[tileIndex];
  const refund = getHouseSellRefund(tileIndex);
  if (!tile || !prop || prop.ownerId !== playerId || prop.level <= 0) {
    return { allowed: false, refund, reason: 'Không có nhà để bán tại ô này.' };
  }
  return { allowed: true, refund };
}

/**
 * Refund value when selling 1 house/hotel level (50% of houseCost).
 */
export function getHouseSellRefund(tileIndex: number): number {
  const tile = BOARD_TILES[tileIndex];
  if (!tile || !tile.houseCost) return 0;
  return Math.floor(tile.houseCost * 0.5);
}

/**
 * Refund value when selling an unimproved property back to the Bank (50% of purchase price).
 */
export function getPropertySellRefund(tileIndex: number): number {
  const tile = BOARD_TILES[tileIndex];
  if (!tile || !tile.price) return 0;
  return Math.floor(tile.price * 0.5);
}

/**
 * Business Tour Buyout (Mua Lại / Thâu Tóm Đô Thị) cost = 2x total invested value (land + standing houses).
 */
export function calculateBuyoutPrice(tileIndex: number, level: number): number {
  const tile = BOARD_TILES[tileIndex];
  if (!tile || tile.kind !== TileKind.PROPERTY || !tile.price) return 0;
  return (tile.price + level * (tile.houseCost ?? 0)) * 2;
}

export function canBuyoutProperty(
  buyer: PlayerState,
  tileIndex: number,
  properties: Record<number, PropertyState>
): { allowed: boolean; cost: number; reason?: string } {
  const tile = BOARD_TILES[tileIndex];
  const prop = properties[tileIndex];
  if (!tile || tile.kind !== TileKind.PROPERTY || !prop || prop.ownerId === null) {
    return { allowed: false, cost: 0, reason: 'Ô này không thể mua lại.' };
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
 * Computes total liquidation value of all houses + properties owned by a player (at 50% rate).
 */
export function calculateLiquidationPotential(
  playerId: number,
  properties: Record<number, PropertyState>
): number {
  let total = 0;
  for (const prop of Object.values(properties)) {
    if (prop.ownerId === playerId) {
      total += prop.level * getHouseSellRefund(prop.tileIndex);
      total += getPropertySellRefund(prop.tileIndex);
    }
  }
  return total;
}

/**
 * Computes total net worth (cash + full value of owned properties + standing buildings).
 */
export function calculateNetWorth(
  player: PlayerState,
  properties: Record<number, PropertyState>
): number {
  if (player.bankrupt) return 0;
  let total = Math.max(0, player.cash);
  for (const prop of Object.values(properties)) {
    if (prop.ownerId === player.id) {
      const tile = BOARD_TILES[prop.tileIndex];
      if (tile?.price) total += tile.price;
      if (tile?.houseCost) total += prop.level * tile.houseCost;
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
 * Evaluates Business Tour Victory Conditions:
 * 1. Last non-bankrupt player standing (`LAST_STANDING`).
 * 2. Instant victory on `TRIPLE_MONOPOLY` (3 full color sets).
 * 3. Instant victory on `SIDE_MONOPOLY` (all properties on 1 full board edge).
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

/* ============================
 * SMART BOT AI DECISION RULES
 * ============================ */

/**
 * Bot buys unowned property if remaining cash after purchase >= $300
 * (or if completing a color group / side monopoly and cash after purchase >= $100).
 */
export function botShouldBuyProperty(
  bot: PlayerState,
  tileIndex: number,
  properties: Record<number, PropertyState>
): boolean {
  const tile = BOARD_TILES[tileIndex];
  if (!tile || !tile.price) return false;
  if (bot.cash < tile.price) return false;

  const cashAfter = bot.cash - tile.price;
  if (cashAfter >= 300) return true;

  if (tile.group) {
    const groupTiles = COLOR_GROUP_META[tile.group].tileIndices;
    const ownedInGroup = groupTiles.filter(
      (idx) => idx !== tileIndex && properties[idx]?.ownerId === bot.id
    ).length;
    if (ownedInGroup === groupTiles.length - 1 && cashAfter >= 100) {
      return true;
    }
  }

  return false;
}

/**
 * Bot chooses how many initial houses (0..3) to build immediately upon claiming a city in Business Tour.
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
    tile?.group &&
    COLOR_GROUP_META[tile.group].tileIndices.every(
      (idx) => idx === tileIndex || properties[idx]?.ownerId === bot.id
    );
  const reserveTarget = completesMono ? 220 : 340;

  let chosen: 0 | 1 | 2 | 3 = 0;
  for (const tier of tiers) {
    if (bot.cash - tier.totalCost >= reserveTarget && tier.level <= 2) {
      chosen = tier.level;
    } else if (completesMono && bot.cash - tier.totalCost >= 200) {
      chosen = tier.level;
    }
  }
  return chosen;
}

/**
 * When a Bot lands on its own city in Business Tour, picks target upgrade level (up to Hotel level 4!).
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

  // Strongly prioritize reaching Level 4 (Hotel / Landmark) for Buyout immunity!
  for (let target = 4; target > prop.level; target--) {
    const cost = (target - prop.level) * tile.houseCost;
    const minReserve = target === 4 ? 180 : 280;
    if (bot.cash - cost >= minReserve) {
      return target;
    }
  }
  return null;
}

/**
 * Evaluates whether a Bot should execute a Business Tour Buyout after paying rent on an opponent's city.
 */
export function botShouldBuyoutProperty(
  bot: PlayerState,
  tileIndex: number,
  players: PlayerState[],
  properties: Record<number, PropertyState>
): boolean {
  const check = canBuyoutProperty(bot, tileIndex, properties);
  if (!check.allowed) return false;

  const tile = BOARD_TILES[tileIndex];
  const prop = properties[tileIndex];
  if (!tile || !prop || prop.ownerId === null) return false;

  const cashAfter = bot.cash - check.cost;
  const completesBotMono =
    tile.group &&
    COLOR_GROUP_META[tile.group].tileIndices.every(
      (idx) => idx === tileIndex || properties[idx]?.ownerId === bot.id
    );
  if (completesBotMono && cashAfter >= 120) return true;

  // Defensive buyout: break an opponent's existing monopoly or stop a 2-monopoly leader!
  const ownerId = prop.ownerId;
  const ownerBrokenMono =
    tile.group && ownsFullColorGroup(ownerId, tile.group, properties);
  const ownerMonoCount = Object.values(ColorGroup).filter((g) =>
    ownsFullColorGroup(ownerId, g, properties)
  ).length;
  const ownerExists = players.some((p) => p.id === ownerId && !p.bankrupt);

  if (ownerExists && (ownerBrokenMono || ownerMonoCount >= 2) && cashAfter >= 220) {
    return true;
  }

  return cashAfter >= 480;
}

/**
 * Picks the highest-value target tile when a Bot lands on Corner 14 (Du Lịch Xuyên Việt / World Tour).
 */
export function botPickWorldTourTarget(
  bot: PlayerState,
  players: PlayerState[],
  properties: Record<number, PropertyState>
): number | null {
  if (bot.cash < WORLD_TOUR_FEE + 140) return null;

  // 1. Snipe an unowned tile that immediately completes a Color Monopoly or Side Monopoly!
  for (const tile of BOARD_TILES) {
    if (!isPurchasableTile(tile) || !tile.price) continue;
    const prop = properties[tile.index];
    if (prop && prop.ownerId === null && bot.cash - WORLD_TOUR_FEE - tile.price >= 120) {
      if (tile.group) {
        const groupTiles = COLOR_GROUP_META[tile.group].tileIndices;
        const ownedCount = groupTiles.filter(
          (i) => i !== tile.index && properties[i]?.ownerId === bot.id
        ).length;
        if (ownedCount === groupTiles.length - 1) {
          return tile.index;
        }
      }
      for (const side of BOARD_SIDES) {
        if (side.tileIndices.includes(tile.index)) {
          const ownedSide = side.tileIndices.filter(
            (i) => i !== tile.index && properties[i]?.ownerId === bot.id
          ).length;
          if (ownedSide === side.tileIndices.length - 1) {
            return tile.index;
          }
        }
      }
    }
  }

  // 2. Fly to own Level 2–3 city to upgrade straight to Level 4 Protected Landmark!
  const ownUpgradable = Object.values(properties)
    .filter((p) => p.ownerId === bot.id && p.level >= 2 && p.level < 4)
    .sort((a, b) => (BOARD_TILES[b.tileIndex].price ?? 0) - (BOARD_TILES[a.tileIndex].price ?? 0));
  for (const cand of ownUpgradable) {
    const houseCost = BOARD_TILES[cand.tileIndex].houseCost ?? 100;
    const needed = (4 - cand.level) * houseCost;
    if (bot.cash - WORLD_TOUR_FEE - needed >= 200) {
      return cand.tileIndex;
    }
  }

  // 3. Fly to best unowned city Bot can comfortably afford
  const unowned = BOARD_TILES.filter(
    (t) =>
      t.kind === TileKind.PROPERTY &&
      properties[t.index]?.ownerId === null &&
      bot.cash - WORLD_TOUR_FEE - (t.price ?? 0) >= 320
  ).sort((a, b) => (b.price ?? 0) - (a.price ?? 0));
  if (unowned.length > 0) {
    return unowned[0].index;
  }

  void players;
  return null;
}

export function botChooseJailAction(
  bot: PlayerState
): 'USE_CARD' | 'PAY_FINE' | 'ROLL_DOUBLES' {
  if (bot.jailFreeCards > 0) return 'USE_CARD';
  if (bot.cash >= 350) return 'PAY_FINE';
  return 'ROLL_DOUBLES';
}

/**
 * Picks next asset for a Bot (or auto-assist) to liquidate when raising cash to pay debt in Business Tour:
 * 1. Sell houses first (lowest-value city first)
 * 2. Sell unimproved properties (lowest-value city first)
 */
export function botPickAssetToLiquidate(
  playerId: number,
  properties: Record<number, PropertyState>
): { action: 'SELL_HOUSE' | 'SELL_PROPERTY'; tileIndex: number } | null {
  const owned = Object.values(properties).filter((p) => p.ownerId === playerId);
  if (owned.length === 0) return null;

  const sellableHouses = owned
    .filter((p) => canSellHouse(playerId, p.tileIndex, properties).allowed)
    .sort(
      (a, b) =>
        (BOARD_TILES[a.tileIndex].price ?? 0) - (BOARD_TILES[b.tileIndex].price ?? 0)
    );

  if (sellableHouses.length > 0) {
    return { action: 'SELL_HOUSE', tileIndex: sellableHouses[0].tileIndex };
  }

  const unimproved = owned
    .filter((p) => p.level === 0)
    .sort(
      (a, b) =>
        (BOARD_TILES[a.tileIndex].price ?? 0) - (BOARD_TILES[b.tileIndex].price ?? 0)
    );

  if (unimproved.length === 0) return null;

  return { action: 'SELL_PROPERTY', tileIndex: unimproved[0].tileIndex };
}

/* ==========================================
 * PLAYER-TO-PLAYER & BOT AI TRADE ENGINE
 * ========================================== */

export function canPropertyBeTraded(
  tileIndex: number,
  ownerId: number,
  properties: Record<number, PropertyState>
): boolean {
  const prop = properties[tileIndex];
  const tile = BOARD_TILES[tileIndex];
  if (!prop || !tile || prop.ownerId !== ownerId || prop.level > 0) return false;
  // Standard Monopoly rule: cannot trade a property in a color group while buildings stand on any tile in that group
  if (tile.group) {
    const groupHasBuildings = COLOR_GROUP_META[tile.group].tileIndices.some(
      (idx) => properties[idx]?.ownerId === ownerId && (properties[idx]?.level ?? 0) > 0
    );
    if (groupHasBuildings) return false;
  }
  return true;
}

export function validateTradeOffer(
  offer: TradeOffer,
  players: PlayerState[],
  properties: Record<number, PropertyState>
): { valid: boolean; reason?: string } {
  if (offer.fromPlayerId === offer.toPlayerId) {
    return { valid: false, reason: 'Không thể tự giao dịch với chính mình.' };
  }

  const fromP = players.find((p) => p.id === offer.fromPlayerId);
  const toP = players.find((p) => p.id === offer.toPlayerId);
  if (!fromP || !toP || fromP.bankrupt || toP.bankrupt) {
    return { valid: false, reason: 'Người chơi tham gia giao dịch không hợp lệ.' };
  }

  if (offer.offeredCash < 0 || offer.requestedCash < 0) {
    return { valid: false, reason: 'Số tiền giao dịch không hợp lệ.' };
  }
  if (offer.offeredCash > fromP.cash) {
    return { valid: false, reason: 'Bạn không đủ tiền mặt để đưa ra lời đề nghị này.' };
  }
  if (offer.requestedCash > toP.cash) {
    return {
      valid: false,
      reason: `${toP.name} không có đủ ${formatBusinessTourCompact(offer.requestedCash)} tiền mặt.`,
    };
  }

  if (
    offer.offeredTileIndices.length === 0 &&
    offer.requestedTileIndices.length === 0
  ) {
    return {
      valid: false,
      reason: 'Giao dịch phải bao gồm ít nhất 1 bất động sản cần mua hoặc trao đổi.',
    };
  }

  // Must not be a purely one-sided giveaway with nothing requested AND nothing offered properly
  const giverHasSomething =
    offer.offeredTileIndices.length > 0 || offer.offeredCash > 0;
  const receiverHasSomething =
    offer.requestedTileIndices.length > 0 || offer.requestedCash > 0;
  if (!giverHasSomething || !receiverHasSomething) {
    return {
      valid: false,
      reason: 'Mỗi bên cần đưa ra ít nhất tài sản hoặc tiền mặt để trao đổi.',
    };
  }

  for (const idx of offer.offeredTileIndices) {
    if (!canPropertyBeTraded(idx, offer.fromPlayerId, properties)) {
      return {
        valid: false,
        reason: `Ô ${BOARD_TILES[idx]?.name} đang có nhà hoặc không thuộc quyền sở hữu của bạn.`,
      };
    }
  }

  for (const idx of offer.requestedTileIndices) {
    if (!canPropertyBeTraded(idx, offer.toPlayerId, properties)) {
      return {
        valid: false,
        reason: `Ô ${BOARD_TILES[idx]?.name} đang có công trình nên chưa thể chuyển nhượng.`,
      };
    }
  }

  return { valid: true };
}

function simulatePropertiesAfterTrade(
  offer: TradeOffer,
  properties: Record<number, PropertyState>
): Record<number, PropertyState> {
  const sim: Record<number, PropertyState> = { ...properties };
  for (const idx of offer.offeredTileIndices) {
    sim[idx] = { ...sim[idx], ownerId: offer.toPlayerId, level: 0 };
  }
  for (const idx of offer.requestedTileIndices) {
    sim[idx] = { ...sim[idx], ownerId: offer.fromPlayerId, level: 0 };
  }
  return sim;
}

function computeTileStrategicValue(
  tileIndex: number,
  perspectivePlayerId: number,
  propsSnapshot: Record<number, PropertyState>
): number {
  const tile = BOARD_TILES[tileIndex];
  const base = tile?.price ?? 0;
  if (!tile || base === 0) return 0;

  if (tile.group) {
    const indices = COLOR_GROUP_META[tile.group].tileIndices;
    const ownedCount = indices.filter(
      (i) => propsSnapshot[i]?.ownerId === perspectivePlayerId
    ).length;
    if (ownedCount === indices.length) {
      return Math.round(base * 1.5 + 45);
    }
    if (ownedCount >= indices.length - 1 && indices.length > 2) {
      return Math.round(base * 1.2);
    }
  }

  if (tile.kind === TileKind.TRANSPORT) {
    const ownedTransports = BOARD_TILES.filter(
      (t) =>
        t.kind === TileKind.TRANSPORT &&
        propsSnapshot[t.index]?.ownerId === perspectivePlayerId
    ).length;
    if (ownedTransports >= 2) return Math.round(base * 1.3);
  }

  return base;
}

/**
 * Evaluates whether a Bot AI partner (`offer.toPlayerId`) accepts a proposed trade.
 */
export function evaluateBotTradeOffer(
  offer: TradeOffer,
  players: PlayerState[],
  properties: Record<number, PropertyState>
): TradeEvaluationResult {
  const check = validateTradeOffer(offer, players, properties);
  if (!check.valid) {
    return { valid: false, accepted: false, reason: check.reason || 'Đề nghị không hợp lệ.' };
  }

  const bot = players.find((p) => p.id === offer.toPlayerId)!;
  const netCashAfter = bot.cash - offer.requestedCash + offer.offeredCash;

  if (offer.requestedCash > 0 && netCashAfter < 120) {
    return {
      valid: true,
      accepted: false,
      reason: `${bot.name} từ chối vì muốn giữ tối thiểu ${formatBusinessTourCompact(120)} tiền mặt dự phòng.`,
    };
  }

  const simAfter = simulatePropertiesAfterTrade(offer, properties);

  // Value Bot receives
  let valueReceived = offer.offeredCash;
  for (const idx of offer.offeredTileIndices) {
    valueReceived += computeTileStrategicValue(idx, bot.id, simAfter);
  }

  // Value Bot gives up (including defensive penalty if handing opponent a full color monopoly)
  let valueGiven = offer.requestedCash;
  for (const idx of offer.requestedTileIndices) {
    const tile = BOARD_TILES[idx];
    // How valuable was this tile to Bot BEFORE the trade?
    let lostVal = computeTileStrategicValue(idx, bot.id, properties);

    // Extra reluctance if Bot already owned a full color set here
    if (tile?.group && ownsFullColorGroup(bot.id, tile.group, properties)) {
      lostVal = Math.round((tile.price ?? 100) * 1.75 + 60);
    }

    // Defensive premium if giving this tile completes a color monopoly for the human proposer
    if (tile?.group && ownsFullColorGroup(offer.fromPlayerId, tile.group, simAfter)) {
      lostVal += 55;
    }

    valueGiven += lostVal;
  }

  // Bot expects at least 105% fair value to sign the deal
  const requiredValue = Math.ceil(valueGiven * 1.05);
  if (valueReceived >= requiredValue) {
    return {
      valid: true,
      accepted: true,
      reason: `${bot.name} đồng ý thương vụ! Đề nghị mang lại lợi ích hợp lý cho đôi bên.`,
    };
  }

  const shortfall = requiredValue - valueReceived;
  return {
    valid: true,
    accepted: false,
    reason: `${bot.name} chưa hài lòng: giá trị bạn đưa ra còn thiếu khoảng ${formatBusinessTourCompact(shortfall)} so với kỳ vọng.`,
  };
}

/**
 * Pure execution of an accepted trade, returning updated players and properties.
 */
export function executeTradeOffer(
  offer: TradeOffer,
  players: PlayerState[],
  properties: Record<number, PropertyState>
): {
  players: PlayerState[];
  properties: Record<number, PropertyState>;
} {
  const nextPlayers = players.map((p) => {
    if (p.id === offer.fromPlayerId) {
      return {
        ...p,
        cash: p.cash - offer.offeredCash + offer.requestedCash,
      };
    }
    if (p.id === offer.toPlayerId) {
      return {
        ...p,
        cash: p.cash - offer.requestedCash + offer.offeredCash,
      };
    }
    return p;
  });

  const nextProperties = simulatePropertiesAfterTrade(offer, properties);
  return { players: nextPlayers, properties: nextProperties };
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
    skyHex: lerpColorHex(0xdcf0ff, 0x0f172a, t),
    hemiSkyHex: lerpColorHex(0xeef8ff, 0x1e3a8a, t),
    hemiGroundHex: lerpColorHex(0xffe9f2, 0x0f172a, t),
    hemiIntensity: 0.88 - 0.56 * t,
    keyLightHex: lerpColorHex(0xfffdf7, 0x60a5fa, t),
    keyLightIntensity: 0.96 - 0.64 * t,
    rimLightIntensity: 0.44 - 0.18 * t,
    envIntensity: 0.34 - 0.28 * t,
    exposure: 1.02 + 0.04 * t,
    windowEmissiveIntensity: glowCurve * 2.8,
    lampBulbEmissiveIntensity: glowCurve * 3.6,
    courtyardPointLightIntensity: glowCurve * 3.8,
    starOpacity: Math.max(0, (t - 0.2) / 0.8) * 0.95,
  };
}

/* ==========================================
 * BOT AI PERSONA & GEMINI QUIP CONTEXT BUILDERS
 * ========================================== */

export const MIN_BIG_RENT_FOR_QUIP = 20;

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
  source: 'DIRECT' | 'BUYOUT' | 'TRADE' = 'DIRECT'
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
  } else if (source === 'TRADE') {
    extraContext = `Vừa hoàn tất thương vụ đàm phán trao đổi khôn ngoan để thâu tóm ${tile.name}!`;
  } else if (listPrice >= 220) {
    extraContext = `Vừa sở hữu đất kim cương đắt giá hàng đầu Việt Nam (${tile.name}, giá ${formatBusinessTourCompact(listPrice)})!`;
  } else if (tile.kind === TileKind.TRANSPORT || tile.kind === TileKind.UTILITY) {
    extraContext = `Vừa nắm giữ mắt xích hạ tầng chiến lược (${tile.name}) để thu phí đường dài!`;
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
        ? `${prop.level} Nhà xanh`
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

