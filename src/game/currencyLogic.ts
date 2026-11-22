import { CurrencyStyleId, PlayerState, PropertyState } from './types';

export type VaultMeshCategory = 'bill' | 'coin' | 'bullion' | 'chip';

export interface VisualVaultUnit {
  meshCategory: VaultMeshCategory;
  colorHex: string;
  localX: number;
  localY: number;
  localZ: number;
  rotY: number;
}

export interface VaultWorldAnchor {
  x: number;
  y: number;
  z: number;
  rotY: number;
}

export type CashFlowTransferKind =
  | 'PLAYER_TO_PLAYER'
  | 'PLAYER_TO_TILE'
  | 'PLAYER_TO_BANK'
  | 'BANK_TO_PLAYER';

export interface CashFlowTransferEvent {
  kind: CashFlowTransferKind;
  fromPlayerId: number | null;
  toPlayerId: number | null;
  tileIndex: number | null;
  amount: number;
}

export interface CurrencyStyleOptionMeta {
  id: CurrencyStyleId;
  shortLabel: string;
  title: string;
  subtitle: string;
}

export const CURRENCY_STYLE_STORAGE_KEY = 'bt_vn_currency_style';

export const CURRENCY_STYLE_OPTIONS: CurrencyStyleOptionMeta[] = [
  {
    id: 'mixed',
    shortLabel: 'Tiền mặt & Xu',
    title: 'Hỗn hợp Thực tế',
    subtitle: 'Tiền chẵn xếp cọc Polymer, tiền lẻ xếp cột Xu kim loại',
  },
  {
    id: 'cash',
    shortLabel: 'Tiền mặt',
    title: 'Tiền mặt Polymer',
    subtitle: 'Cọc mệnh giá 500K · 200K · 100K · 50K · 20K đóng đai',
  },
  {
    id: 'coins',
    shortLabel: 'Tiền xu',
    title: 'Tiền xu Kim loại',
    subtitle: 'Cột xu Vàng ròng · Bạc sáng · Đồng đỏ dập nổi',
  },
  {
    id: 'bullion',
    shortLabel: 'Vàng & Chip',
    title: 'Thỏi vàng & Chip',
    subtitle: 'Thỏi vàng 9999 bóng gương kèm chồng Chip Tỷ phú',
  },
];

export function loadSavedCurrencyStyle(): CurrencyStyleId {
  if (typeof window === 'undefined') return 'mixed';
  try {
    const raw = window.localStorage.getItem(CURRENCY_STYLE_STORAGE_KEY);
    if (raw === 'cash' || raw === 'coins' || raw === 'bullion' || raw === 'mixed') {
      return raw;
    }
  } catch {
    // Ignore storage privacy restrictions
  }
  return 'mixed';
}

export function saveCurrencyStyle(style: CurrencyStyleId): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(CURRENCY_STYLE_STORAGE_KEY, style);
  } catch {
    // Ignore storage privacy restrictions
  }
}

// Polymer banknote denomination colors inspired by Vietnamese Polymer notes
export const POLYMER_COLORS = {
  BILL_500K: '#0EA5B7', // Cyan-Teal 500K
  BILL_200K: '#EA580C', // Terracotta-Orange 200K
  BILL_100K: '#22C55E', // Emerald-Green 100K
  BILL_50K: '#EC4899', // Rose-Magenta 50K
  BILL_20K: '#2563EB', // Cobalt-Blue 20K
} as const;

export const METALLIC_COLORS = {
  COIN_GOLD: '#FACC15',
  COIN_SILVER: '#E2E8F0',
  COIN_BRONZE: '#EA580C',
  BULLION_GOLD: '#FBBF24',
  CHIP_100K: '#EF4444',
  CHIP_50K: '#0EA5E9',
  CHIP_10K: '#8B5CF6',
} as const;

/**
 * Returns symmetric 3D world coordinates for each player's 3D Vault Tray (`0..3`)
 * matching their exact HUD screen corner under the `(+X, +Y, +Z)` isometric camera,
 * or `-1` for the Central Bank Reserve Vault inside the upper sunken courtyard.
 */
export function getVaultWorldAnchor(slotIndex: number): VaultWorldAnchor {
  switch (slotIndex) {
    case 0: // Top-Left HUD (Screen X = x - z < 0, Screen Y = x + z < 0)
      return { x: -10.45, y: -0.22, z: -2.15, rotY: Math.PI / 4 };
    case 1: // Top-Right HUD (Screen X = x - z > 0, Screen Y = x + z < 0)
      return { x: -2.15, y: -0.22, z: -10.45, rotY: Math.PI / 4 };
    case 2: // Bottom-Right HUD (Screen X = x - z > 0, Screen Y = x + z > 0)
      return { x: 10.45, y: -0.22, z: 2.15, rotY: Math.PI / 4 };
    case 3: // Bottom-Left HUD (Screen X = x - z < 0, Screen Y = x + z > 0)
      return { x: 2.15, y: -0.22, z: 10.45, rotY: Math.PI / 4 };
    default: // Central Bank Vault (-1) inside upper sunken grass courtyard
      return { x: -4.05, y: 0.16, z: -4.05, rotY: Math.PI / 4 };
  }
}

const BILL_GRID_SLOTS: Array<[number, number]> = [
  [-0.58, -0.26],
  [0.0, -0.26],
  [0.58, -0.26],
  [-0.58, 0.26],
  [0.0, 0.26],
  [0.58, 0.26],
];

const COIN_GRID_SLOTS: Array<[number, number]> = [
  [-0.64, -0.24],
  [-0.22, -0.26],
  [0.22, -0.24],
  [0.64, -0.26],
  [-0.44, 0.24],
  [0.0, 0.26],
  [0.44, 0.24],
];

/**
 * Decomposes a player's live cash balance into bounded (`<= 48`) 3D visual units
 * arranged cleanly on their personal Vault Tray according to `style`.
 */
export function decomposeCashToVisualUnits(
  rawCash: number,
  style: CurrencyStyleId
): VisualVaultUnit[] {
  const cash = Math.floor(rawCash || 0);
  if (cash <= 0) return [];

  const units: VisualVaultUnit[] = [];

  if (style === 'cash') {
    const capped = Math.min(cash, 6_500_000);
    const totalBricks = Math.min(42, Math.max(1, Math.ceil(capped / 105_000)));
    const billColors: string[] = [];

    for (let i = 0; i < totalBricks; i++) {
      const ratio = i / Math.max(1, totalBricks);
      if (cash >= 500_000 && ratio < 0.45) {
        billColors.push(POLYMER_COLORS.BILL_500K);
      } else if (cash >= 200_000 && ratio < 0.72) {
        billColors.push(POLYMER_COLORS.BILL_200K);
      } else if (cash >= 100_000 && ratio < 0.88) {
        billColors.push(POLYMER_COLORS.BILL_100K);
      } else if (cash >= 50_000 && i % 2 === 0) {
        billColors.push(POLYMER_COLORS.BILL_50K);
      } else {
        billColors.push(POLYMER_COLORS.BILL_20K);
      }
    }

    billColors.forEach((hex, idx) => {
      const col = idx % BILL_GRID_SLOTS.length;
      const layer = Math.floor(idx / BILL_GRID_SLOTS.length);
      const [sx, sz] = BILL_GRID_SLOTS[col];
      units.push({
        meshCategory: 'bill',
        colorHex: hex,
        localX: sx + Math.sin(idx * 1.7) * 0.018,
        localY: 0.12 + layer * 0.126,
        localZ: sz + Math.cos(idx * 2.1) * 0.018,
        rotY: ((idx % 3) - 1) * 0.055,
      });
    });
    return units;
  }

  if (style === 'coins') {
    const capped = Math.min(cash, 6_500_000);
    const totalCoins = Math.min(46, Math.max(1, Math.ceil(capped / 80_000)));
    const coinColors: string[] = [];

    for (let i = 0; i < totalCoins; i++) {
      const col = i % COIN_GRID_SLOTS.length;
      if (cash >= 300_000 && col < 4) {
        coinColors.push(METALLIC_COLORS.COIN_GOLD);
      } else if (cash >= 80_000 && col < 6) {
        coinColors.push(METALLIC_COLORS.COIN_SILVER);
      } else {
        coinColors.push(METALLIC_COLORS.COIN_BRONZE);
      }
    }

    coinColors.forEach((hex, idx) => {
      const col = idx % COIN_GRID_SLOTS.length;
      const layer = Math.floor(idx / COIN_GRID_SLOTS.length);
      const [sx, sz] = COIN_GRID_SLOTS[col];
      units.push({
        meshCategory: 'coin',
        colorHex: hex,
        localX: sx + Math.sin(layer * 1.9 + col) * 0.014,
        localY: 0.1 + layer * 0.082,
        localZ: sz + Math.cos(layer * 2.3 + col) * 0.014,
        rotY: (idx * 0.42) % (Math.PI * 2),
      });
    });
    return units;
  }

  if (style === 'bullion') {
    const capped = Math.min(cash, 7_500_000);
    const barCount = Math.min(21, Math.floor(capped / 210_000));

    for (let b = 0; b < barCount; b++) {
      const col = b % 3;
      const layer = Math.floor(b / 3);
      units.push({
        meshCategory: 'bullion',
        colorHex: METALLIC_COLORS.BULLION_GOLD,
        localX: (col - 1) * 0.56,
        localY: 0.125 + layer * 0.145,
        localZ: -0.23 + (layer % 2) * 0.025,
        rotY: layer % 2 === 0 ? 0.04 : -0.04,
      });
    }

    const chipTarget = Math.min(
      24,
      Math.max(barCount > 0 ? 9 : 1, Math.ceil((capped % 630_000 + 360_000) / 55_000))
    );
    const chipCount = cash < 80_000 ? Math.max(1, Math.ceil(cash / 20_000)) : chipTarget;
    const chipSlots: Array<[number, number]> = [
      [-0.54, 0.28],
      [-0.18, 0.3],
      [0.18, 0.28],
      [0.54, 0.3],
    ];
    for (let idx = 0; idx < chipCount; idx++) {
      const col = idx % chipSlots.length;
      const layer = Math.floor(idx / chipSlots.length);
      const [sx, sz] = chipSlots[col];
      const hex =
        col === 0 || col === 2
          ? METALLIC_COLORS.CHIP_100K
          : col === 1
            ? METALLIC_COLORS.CHIP_50K
            : METALLIC_COLORS.CHIP_10K;
      units.push({
        meshCategory: 'chip',
        colorHex: hex,
        localX: sx,
        localY: 0.095 + layer * 0.072,
        localZ: sz,
        rotY: idx * 0.35,
      });
    }
    return units;
  }

  // 'mixed': Multi-layer Vietnamese Polymer Banknotes on left half + gleaming Coin Towers on right half!
  const capped = Math.min(cash, 6_500_000);
  const billCount =
    cash >= 100_000 ? Math.min(24, Math.max(2, Math.floor(capped / 155_000))) : 0;

  const mixedBillSlots: Array<[number, number]> = [
    [-0.55, -0.24],
    [-0.04, -0.24],
    [-0.55, 0.24],
    [-0.04, 0.24],
  ];
  for (let idx = 0; idx < billCount; idx++) {
    const col = idx % mixedBillSlots.length;
    const layer = Math.floor(idx / mixedBillSlots.length);
    const [sx, sz] = mixedBillSlots[col];
    const hex =
      idx % 3 === 0
        ? POLYMER_COLORS.BILL_500K
        : idx % 3 === 1
          ? POLYMER_COLORS.BILL_200K
          : POLYMER_COLORS.BILL_100K;
    units.push({
      meshCategory: 'bill',
      colorHex: hex,
      localX: sx + Math.sin(idx * 1.5) * 0.015,
      localY: 0.12 + layer * 0.126,
      localZ: sz,
      rotY: ((idx % 3) - 1) * 0.05,
    });
  }

  const coinCount =
    cash < 100_000
      ? Math.max(1, Math.ceil(cash / 20_000))
      : Math.min(22, Math.max(6, Math.ceil(capped / 210_000)));
  const mixedCoinSlots: Array<[number, number]> = [
    [0.42, -0.24],
    [0.73, -0.18],
    [0.45, 0.22],
    [0.74, 0.24],
  ];
  for (let idx = 0; idx < coinCount; idx++) {
    const col = idx % mixedCoinSlots.length;
    const layer = Math.floor(idx / mixedCoinSlots.length);
    const [sx, sz] = mixedCoinSlots[col];
    const hex =
      col < 2
        ? METALLIC_COLORS.COIN_GOLD
        : col === 2
          ? METALLIC_COLORS.COIN_SILVER
          : METALLIC_COLORS.COIN_BRONZE;
    units.push({
      meshCategory: 'coin',
      colorHex: hex,
      localX: sx,
      localY: 0.1 + layer * 0.082,
      localZ: sz,
      rotY: idx * 0.5,
    });
  }

  return units;
}

/**
 * Pure state-diff classifier that turns any `players` + `properties` update (Offline OR Online WebSocket)
 * into concrete 3D incoming/outgoing physical money transfer events.
 */
export function detectCashFlowTransfers(
  prevPlayers: PlayerState[],
  nextPlayers: PlayerState[],
  prevProps: Record<number, PropertyState>,
  nextProps: Record<number, PropertyState>
): CashFlowTransferEvent[] {
  if (!prevPlayers.length || prevPlayers.length !== nextPlayers.length) {
    return [];
  }

  // Guard against fresh match reset: all players back at position 0, laps 0, identical positive starting cash, 0 owned properties
  const allAtFreshStart =
    nextPlayers.every(
      (p) => p.position === 0 && p.laps === 0 && !p.bankrupt && p.cash === nextPlayers[0].cash
    ) && Object.values(nextProps).every((pr) => pr.ownerId === null);
  const hadPriorProgress =
    prevPlayers.some((p) => p.position !== 0 || p.laps > 0) ||
    Object.values(prevProps).some((pr) => pr.ownerId !== null);
  if (allAtFreshStart && hadPriorProgress) {
    return [];
  }

  const prevById = new Map<number, PlayerState>();
  for (const p of prevPlayers) prevById.set(p.id, p);

  const payers: Array<{ id: number; remaining: number; pos: number }> = [];
  const gainers: Array<{ id: number; remaining: number; pos: number }> = [];

  for (const nextP of nextPlayers) {
    const prevP = prevById.get(nextP.id);
    if (!prevP) continue;
    const delta = Math.round(nextP.cash - prevP.cash);
    if (delta < 0) {
      payers.push({ id: nextP.id, remaining: Math.abs(delta), pos: nextP.position });
    } else if (delta > 0) {
      gainers.push({ id: nextP.id, remaining: delta, pos: nextP.position });
    }
  }

  if (payers.length === 0 && gainers.length === 0) {
    return [];
  }

  const events: CashFlowTransferEvent[] = [];

  // 1. Pair direct Player -> Player transfers (Rent, 2x Buyout, Birthday COLLECT_FROM_ALL)
  for (const payer of payers) {
    for (const gainer of gainers) {
      if (payer.remaining <= 0) break;
      if (gainer.remaining <= 0) continue;
      const matched = Math.min(payer.remaining, gainer.remaining);
      if (matched > 0) {
        events.push({
          kind: 'PLAYER_TO_PLAYER',
          fromPlayerId: payer.id,
          toPlayerId: gainer.id,
          tileIndex: null,
          amount: matched,
        });
        payer.remaining -= matched;
        gainer.remaining -= matched;
      }
    }
  }

  // Detect newly acquired or upgraded tiles per player
  const newlyInvestedTileByPlayer = new Map<number, number>();
  for (const key of Object.keys(nextProps)) {
    const tIdx = Number(key);
    const nextPr = nextProps[tIdx];
    const prevPr = prevProps[tIdx];
    if (!nextPr || nextPr.ownerId === null) continue;
    if (!prevPr || prevPr.ownerId !== nextPr.ownerId || nextPr.level > prevPr.level) {
      newlyInvestedTileByPlayer.set(nextPr.ownerId, tIdx);
    }
  }

  // 2. Classify remaining outflows (Property/Upgrade investment vs Tax/Bank fee)
  for (const payer of payers) {
    if (payer.remaining <= 0) continue;
    const investedTile = newlyInvestedTileByPlayer.get(payer.id);
    if (investedTile !== undefined) {
      events.push({
        kind: 'PLAYER_TO_TILE',
        fromPlayerId: payer.id,
        toPlayerId: null,
        tileIndex: investedTile,
        amount: payer.remaining,
      });
    } else {
      events.push({
        kind: 'PLAYER_TO_BANK',
        fromPlayerId: payer.id,
        toPlayerId: null,
        tileIndex: payer.pos === 30 ? 30 : null,
        amount: payer.remaining,
      });
    }
  }

  // 3. Classify remaining inflows (Start +300K salary, Chance dividend, Property sale refund)
  for (const gainer of gainers) {
    if (gainer.remaining <= 0) continue;
    events.push({
      kind: 'BANK_TO_PLAYER',
      fromPlayerId: null,
      toPlayerId: gainer.id,
      tileIndex: null,
      amount: gainer.remaining,
    });
  }

  return events;
}
