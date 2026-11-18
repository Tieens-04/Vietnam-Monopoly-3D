import { BOARD_TILES, COLOR_GROUP_META } from './boardData';
import {
  AuctionState,
  BotQuipPayload,
  ColorGroup,
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
export const GO_TO_JAIL_TILE_INDEX = 21;
export const START_SALARY = 200;
export const JAIL_FINE = 50;
export const MAX_JAIL_TURNS = 3;

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
 * Calculates exact rent when a player lands on an owned tile.
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
    if (prop.level > 0) {
      return tile.rents[Math.min(prop.level, 4)];
    }
    const base = tile.rents[0];
    return ownsFullColorGroup(prop.ownerId, tile.group, properties) ? base * 2 : base;
  }

  if (tile.kind === TileKind.TRANSPORT) {
    const ownedTransports = BOARD_TILES.filter(
      (t) => t.kind === TileKind.TRANSPORT && properties[t.index]?.ownerId === prop.ownerId
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

/**
 * Checks whether a player can upgrade a property (build 1 house up to level 3, or hotel at level 4).
 * Per game brief: allows building during turn when owning at least 1 property or full color set!
 */
export function canUpgradeProperty(
  player: PlayerState,
  tileIndex: number,
  properties: Record<number, PropertyState>
): { allowed: boolean; cost: number; reason?: string } {
  const tile = BOARD_TILES[tileIndex];
  const prop = properties[tileIndex];
  if (!tile || tile.kind !== TileKind.PROPERTY || !prop || !tile.houseCost) {
    return { allowed: false, cost: 0, reason: 'Ô này không thể xây nhà.' };
  }
  if (prop.ownerId !== player.id) {
    return { allowed: false, cost: tile.houseCost, reason: 'Bạn không sở hữu mảnh đất này.' };
  }
  if (prop.level >= 4) {
    return { allowed: false, cost: tile.houseCost, reason: 'Đã đạt cấp Khách sạn tối đa.' };
  }
  if (player.cash < tile.houseCost) {
    return { allowed: false, cost: tile.houseCost, reason: 'Không đủ tiền mặt để xây dựng.' };
  }
  return { allowed: true, cost: tile.houseCost };
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
 * Refund value when selling/mortgaging an unimproved property back to Bank (50% of purchase price).
 */
export function getPropertySellRefund(tileIndex: number): number {
  const tile = BOARD_TILES[tileIndex];
  if (!tile || !tile.price) return 0;
  return Math.floor(tile.price * 0.5);
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
 * Computes total net worth (cash + full purchase value of properties & buildings) for leaderboard.
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

/* ============================
 * SMART BOT AI DECISION RULES
 * ============================ */

/**
 * Bot buys unowned property if remaining cash after purchase >= $300
 * (or if completing a color group and cash after purchase >= $120).
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

  // Smart exception: if buying completes a color monopoly and leaves >= $120
  if (tile.group) {
    const groupTiles = COLOR_GROUP_META[tile.group].tileIndices;
    const ownedInGroup = groupTiles.filter(
      (idx) => idx !== tileIndex && properties[idx]?.ownerId === bot.id
    ).length;
    if (ownedInGroup === groupTiles.length - 1 && cashAfter >= 120) {
      return true;
    }
  }

  return false;
}

/**
 * Bot picks the best owned property to upgrade while keeping at least $320 reserve.
 */
export function botPickUpgradeTile(
  bot: PlayerState,
  properties: Record<number, PropertyState>
): number | null {
  const candidates = Object.values(properties)
    .filter((p) => p.ownerId === bot.id && p.level < 4)
    .map((p) => ({
      prop: p,
      tile: BOARD_TILES[p.tileIndex],
    }))
    .filter(
      ({ tile }) =>
        tile.kind === TileKind.PROPERTY &&
        tile.houseCost !== undefined &&
        bot.cash - tile.houseCost >= 320
    );

  if (candidates.length === 0) return null;

  // Prioritize full color group properties and higher-tier properties
  candidates.sort((a, b) => {
    const aMono =
      a.tile.group && ownsFullColorGroup(bot.id, a.tile.group, properties) ? 1 : 0;
    const bMono =
      b.tile.group && ownsFullColorGroup(bot.id, b.tile.group, properties) ? 1 : 0;
    if (bMono !== aMono) return bMono - aMono;
    return (b.tile.price ?? 0) - (a.tile.price ?? 0);
  });

  return candidates[0].prop.tileIndex;
}

export function botChooseJailAction(
  bot: PlayerState
): 'USE_CARD' | 'PAY_FINE' | 'ROLL_DOUBLES' {
  if (bot.jailFreeCards > 0) return 'USE_CARD';
  if (bot.cash >= 350) return 'PAY_FINE';
  return 'ROLL_DOUBLES';
}

/**
 * Picks next asset for a Bot (or auto-assist) to sell at 50% when raising cash to pay debt:
 * 1. Sell houses first (lowest-tier property houses first)
 * 2. Sell unimproved properties (non-monopoly, lowest price first)
 */
export function botPickAssetToLiquidate(
  playerId: number,
  properties: Record<number, PropertyState>
): { action: 'SELL_HOUSE' | 'SELL_PROPERTY'; tileIndex: number } | null {
  const owned = Object.values(properties).filter((p) => p.ownerId === playerId);
  if (owned.length === 0) return null;

  const withHouses = owned
    .filter((p) => p.level > 0)
    .sort(
      (a, b) =>
        (BOARD_TILES[a.tileIndex].price ?? 0) - (BOARD_TILES[b.tileIndex].price ?? 0)
    );

  if (withHouses.length > 0) {
    return { action: 'SELL_HOUSE', tileIndex: withHouses[0].tileIndex };
  }

  const unimproved = owned.sort(
    (a, b) =>
      (BOARD_TILES[a.tileIndex].price ?? 0) - (BOARD_TILES[b.tileIndex].price ?? 0)
  );
  return { action: 'SELL_PROPERTY', tileIndex: unimproved[0].tileIndex };
}

/* ==========================================
 * PUBLIC AUCTION ENGINE & BOT BIDDING LOGIC
 * ========================================== */

export const MIN_AUCTION_INCREMENT = 10;

export function getMinimumNextBid(auction: AuctionState): number {
  return auction.highestBidderId === null
    ? auction.startingBid
    : auction.currentBid + MIN_AUCTION_INCREMENT;
}

/**
 * Initializes a public auction among all solvent players who can afford the starting bid.
 * Starting bid is 50% of list price (rounded to nearest $10, min $10).
 */
export function createAuctionState(
  tileIndex: number,
  players: PlayerState[],
  startingTurnPlayerId: number
): AuctionState {
  const tile = BOARD_TILES[tileIndex];
  const basePrice = tile?.price ?? 100;
  const startingBid = Math.max(10, Math.round((basePrice * 0.5) / 10) * 10);

  // Order clockwise starting from the player AFTER the one who skipped (or including them so anyone can bid!)
  const startIdx = Math.max(
    0,
    players.findIndex((p) => p.id === startingTurnPlayerId)
  );
  const orderedSolvent: PlayerState[] = [];
  for (let i = 1; i <= players.length; i++) {
    const p = players[(startIdx + i) % players.length];
    if (!p.bankrupt && p.cash >= startingBid) {
      orderedSolvent.push(p);
    }
  }

  if (orderedSolvent.length === 0) {
    return {
      tileIndex,
      startingBid,
      currentBid: 0,
      highestBidderId: null,
      activeBidderIds: [],
      currentTurnBidderId: startingTurnPlayerId,
      status: 'COMPLETED',
      winnerId: null,
      history: ['Không có người chơi nào đủ tiền mặt tham gia đấu giá.'],
    };
  }

  return {
    tileIndex,
    startingBid,
    currentBid: 0,
    highestBidderId: null,
    activeBidderIds: orderedSolvent.map((p) => p.id),
    currentTurnBidderId: orderedSolvent[0].id,
    status: 'ACTIVE',
    winnerId: null,
    history: [
      `Mở đấu giá công khai ${tile.name} (Giá gốc $${basePrice}, khởi điểm $${startingBid}).`,
    ],
  };
}

function finalizeOrAdvanceAuction(
  auction: AuctionState,
  players: PlayerState[],
  nextStartFromId: number
): AuctionState {
  const minNext =
    auction.highestBidderId === null
      ? auction.startingBid
      : auction.currentBid + MIN_AUCTION_INCREMENT;

  // Prune any active bidder (except current highest bidder) who cannot afford minNext
  const autoPassLogs: string[] = [];
  const filteredIds = auction.activeBidderIds.filter((id) => {
    if (id === auction.highestBidderId) return true;
    const pl = players.find((p) => p.id === id);
    if (!pl || pl.bankrupt || pl.cash < minNext) {
      if (pl) {
        autoPassLogs.push(`${pl.name} dừng đấu giá (không đủ số dư $${minNext}).`);
      }
      return false;
    }
    return true;
  });

  const history = [...autoPassLogs, ...auction.history].slice(0, 12);

  // Case 1: Nobody left at all
  if (filteredIds.length === 0) {
    return {
      ...auction,
      activeBidderIds: [],
      status: 'COMPLETED',
      winnerId: auction.highestBidderId,
      history,
    };
  }

  // Case 2: Only 1 bidder left AND they already hold the highest bid -> immediate win!
  if (filteredIds.length === 1 && auction.highestBidderId === filteredIds[0]) {
    return {
      ...auction,
      activeBidderIds: filteredIds,
      currentTurnBidderId: filteredIds[0],
      status: 'COMPLETED',
      winnerId: filteredIds[0],
      history,
    };
  }

  // Pick next bidder in ring order
  const idx = filteredIds.indexOf(nextStartFromId);
  const nextBidderId = idx !== -1 ? filteredIds[idx] : filteredIds[0];

  return {
    ...auction,
    activeBidderIds: filteredIds,
    currentTurnBidderId: nextBidderId,
    history,
  };
}

export function applyAuctionBid(
  auction: AuctionState,
  bidderId: number,
  bidAmount: number,
  players: PlayerState[]
): AuctionState {
  if (auction.status !== 'ACTIVE' || auction.currentTurnBidderId !== bidderId) {
    return auction;
  }
  const bidder = players.find((p) => p.id === bidderId);
  const minNext = getMinimumNextBid(auction);
  if (!bidder || bidAmount < minNext || bidder.cash < bidAmount) {
    return auction;
  }

  const curPos = auction.activeBidderIds.indexOf(bidderId);
  const nextCandidate =
    auction.activeBidderIds[(curPos + 1) % auction.activeBidderIds.length];

  const updated: AuctionState = {
    ...auction,
    currentBid: bidAmount,
    highestBidderId: bidderId,
    history: [`${bidder.name} trả giá $${bidAmount}!`, ...auction.history].slice(0, 12),
  };

  return finalizeOrAdvanceAuction(updated, players, nextCandidate);
}

export function applyAuctionPass(
  auction: AuctionState,
  bidderId: number,
  players: PlayerState[]
): AuctionState {
  if (auction.status !== 'ACTIVE' || auction.currentTurnBidderId !== bidderId) {
    return auction;
  }
  const bidder = players.find((p) => p.id === bidderId);
  const curPos = auction.activeBidderIds.indexOf(bidderId);
  const remaining = auction.activeBidderIds.filter((id) => id !== bidderId);

  const nextCandidate =
    remaining.length > 0 ? remaining[curPos % remaining.length] : bidderId;

  const updated: AuctionState = {
    ...auction,
    activeBidderIds: remaining,
    history: [
      `${bidder ? bidder.name : 'Người chơi'} bỏ lượt đấu giá.`,
      ...auction.history,
    ].slice(0, 12),
  };

  return finalizeOrAdvanceAuction(updated, players, nextCandidate);
}

/**
 * Smart Bot AI valuation & bid decision during a live public auction.
 */
export function botDecideAuctionTurn(
  bot: PlayerState,
  auction: AuctionState,
  properties: Record<number, PropertyState>
): { action: 'BID'; amount: number } | { action: 'PASS' } {
  const tile = BOARD_TILES[auction.tileIndex];
  const minNext = getMinimumNextBid(auction);
  if (!tile || !tile.price || bot.cash < minNext) {
    return { action: 'PASS' };
  }

  // Keep a cash safety reserve of $220 (or $150 if completing a color monopoly)
  let valuation = tile.price * 0.95;
  let minReserve = 220;

  if (tile.group) {
    const groupIndices = COLOR_GROUP_META[tile.group].tileIndices;
    const botOwned = groupIndices.filter((i) => properties[i]?.ownerId === bot.id).length;
    if (botOwned === groupIndices.length - 1) {
      valuation = tile.price * 1.35 + 30;
      minReserve = 140;
    } else if (botOwned > 0) {
      valuation = tile.price * 1.1;
    }
  } else if (tile.kind === TileKind.TRANSPORT) {
    const ownedTransports = BOARD_TILES.filter(
      (t) => t.kind === TileKind.TRANSPORT && properties[t.index]?.ownerId === bot.id
    ).length;
    if (ownedTransports >= 1) valuation = tile.price * 1.2;
  }

  const maxAffordable = bot.cash - minReserve;
  const maxWillingBid = Math.min(maxAffordable, Math.floor(valuation / 10) * 10);

  if (minNext > maxWillingBid) {
    return { action: 'PASS' };
  }

  // Step bid cleanly by minNext (or +$10 extra if way below bargain price)
  const stepJump =
    minNext + 10 <= maxWillingBid && minNext < tile.price * 0.65 ? minNext + 10 : minNext;
  return { action: 'BID', amount: stepJump };
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
  if (!prop || prop.ownerId !== ownerId) return false;
  // Standard rule: cannot trade a property while buildings stand on it
  return prop.level === 0;
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
      reason: `${toP.name} không có đủ $${offer.requestedCash} tiền mặt.`,
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
      reason: `${bot.name} từ chối vì muốn giữ tối thiểu $120 tiền mặt dự phòng.`,
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
    reason: `${bot.name} chưa hài lòng: giá trị bạn đưa ra còn thiếu khoảng $${shortfall} so với kỳ vọng.`,
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
    skyHex: lerpColorHex(0xdceefb, 0x070e20, t),
    hemiSkyHex: lerpColorHex(0xe0f2fe, 0x1e3a8a, t),
    hemiGroundHex: lerpColorHex(0xfde68a, 0x0f172a, t),
    hemiIntensity: 0.56 - 0.32 * t,
    keyLightHex: lerpColorHex(0xfff7ed, 0x60a5fa, t),
    keyLightIntensity: 1.12 - 0.8 * t,
    rimLightIntensity: 0.45 - 0.17 * t,
    envIntensity: 0.42 - 0.37 * t,
    exposure: 0.96 + 0.08 * t,
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
  source: 'DIRECT' | 'AUCTION' | 'TRADE' = 'DIRECT'
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
  } else if (source === 'AUCTION') {
    extraContext =
      paidAmount < listPrice
        ? `Vừa đấu giá hời được mảnh đất giá niêm yết $${listPrice} chỉ với $${paidAmount}!`
        : `Vừa vượt mặt các đối thủ tại phiên đấu giá công khai để giành quyền sở hữu ${tile.name}!`;
  } else if (source === 'TRADE') {
    extraContext = `Vừa hoàn tất thương vụ đàm phán trao đổi khôn ngoan để thâu tóm ${tile.name}!`;
  } else if (listPrice >= 220) {
    extraContext = `Vừa sở hữu đất kim cương đắt giá hàng đầu Việt Nam (${tile.name}, giá $${listPrice})!`;
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
    extraContext: `Khách quý "${payerName}" vừa ghé thăm ${levelDesc} tại ${tile.name} và nộp $${rentAmount} tiền thuê!`,
  };
}

export function buildBotPenaltyQuipPayload(
  bot: PlayerState,
  reason: string,
  penaltyAmount: number,
  creditorName?: string
): BotQuipPayload | null {
  if (!bot.isBot || bot.bankrupt || penaltyAmount <= 0) return null;

  const extraContext = creditorName
    ? `Vừa phải bấm bụng trả $${penaltyAmount} tiền thuê tại ${reason} cho đối thủ "${creditorName}".`
    : `Vừa bị trừ nóng $${penaltyAmount} do "${reason}".`;

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
