export enum TileKind {
  START = 'START',
  LOST_ISLAND = 'LOST_ISLAND',
  WORLD_CHAMPIONSHIPS = 'WORLD_CHAMPIONSHIPS',
  WORLD_TOUR = 'WORLD_TOUR',
  PROPERTY = 'PROPERTY',
  RESORT = 'RESORT',
  TAX = 'TAX',
  CHANCE = 'CHANCE',
}

export enum ColorGroup {
  BROWN = 'BROWN',
  CYAN = 'CYAN',
  PINK = 'PINK',
  ORANGE = 'ORANGE',
  AMBER = 'AMBER',
  RED = 'RED',
  PURPLE = 'PURPLE',
  EMERALD = 'EMERALD',
}

export interface TileDefinition {
  index: number;
  name: string;
  shortName?: string;
  kind: TileKind;
  group?: ColorGroup;
  groupColor?: string;
  groupLabel?: string;
  price?: number;
  houseCost?: number;
  /** Rents for [land, 1 house, 2 houses, 3 houses, hotel(4)] */
  rents?: [number, number, number, number, number];
  description: string;
}

export interface PropertyState {
  tileIndex: number;
  ownerId: number | null;
  /** 0 = land only (or Resort), 1..3 = green houses, 4 = hotel / protected landmark */
  level: number;
}

export type TacticalCardActionKind = 'EARTHQUAKE' | 'POWER_OUTAGE' | 'SHIELD_CITY';

export interface MatchBoardModifiers {
  festivalTileIndices: number[];
  championshipTileIndex: number | null;
  championshipMultiplier: number;
  outageTileIndices?: number[];
  shieldedTileIndices?: number[];
}

export interface AutoSalePlan {
  sufficient: boolean;
  tileIndicesToSell: number[];
  totalRefund: number;
  cashAfterDebt: number;
}

export type MatchMode = 'FFA' | 'TEAMS_2V2';

export type TeamId = 0 | 1;

export type TacticalDiceChoice = 'NORMAL' | 'EVEN' | 'ODD';

export interface PlayerSetupConfig {
  id: number;
  name: string;
  isBot: boolean;
  enabled: boolean;
  color: string;
  colorName: string;
  tokenType: 'car' | 'yacht' | 'jet' | 'crown';
  teamId?: TeamId;
}

export interface PlayerState {
  id: number;
  name: string;
  isBot: boolean;
  color: string;
  colorName: string;
  tokenType: 'car' | 'yacht' | 'jet' | 'crown';
  cash: number;
  position: number;
  laps: number;
  inJail: boolean;
  jailTurns: number;
  jailFreeCards: number;
  doublesStreak: number;
  pendingWorldTour: boolean;
  bankrupt: boolean;
  teamId?: TeamId;
  evenOddCharges?: number;
  rerollCharges?: number;
  onlineConnected?: boolean;
  onlineBotTakeover?: boolean;
}

export type CardDeckType = 'CHANCE';

export type CardEffect =
  | { type: 'GAIN_CASH'; amount: number }
  | { type: 'PAY_CASH'; amount: number }
  | { type: 'MOVE_TO'; targetTile: number; collectStart: boolean }
  | { type: 'GO_TO_JAIL' }
  | { type: 'JAIL_FREE_CARD' }
  | { type: 'COLLECT_FROM_ALL'; amountEach: number }
  | { type: 'HOST_CHAMPIONSHIP' }
  | { type: 'GO_TO_WORLD_TOUR' }
  | { type: 'EARTHQUAKE' }
  | { type: 'POWER_OUTAGE' }
  | { type: 'SHIELD_CITY' };

export interface LuckCard {
  id: string;
  deck: CardDeckType;
  title: string;
  description: string;
  effect: CardEffect;
}

export type GameScreenState = 'title' | 'playing' | 'paused' | 'gameover';

export type TurnPhase =
  | 'AWAIT_ROLL'
  | 'ROLLING_DICE'
  | 'REROLL_DECISION'
  | 'MOVING_TOKEN'
  | 'BUY_DECISION'
  | 'UPGRADE_DECISION'
  | 'BUYOUT_DECISION'
  | 'CHAMPIONSHIP_SELECTION'
  | 'WORLD_TOUR'
  | 'CARD_REVEAL'
  | 'CARD_TARGET_SELECTION'
  | 'DEBT_RESOLUTION'
  | 'GAME_OVER';

export type VictoryConditionKind =
  | 'LAST_STANDING'
  | 'TRIPLE_MONOPOLY'
  | 'SIDE_MONOPOLY'
  | 'RESORT_MONOPOLY'
  | 'TIME_LIMIT';

export interface MatchWinnerResult {
  winner: PlayerState;
  condition: VictoryConditionKind;
  label: string;
  winningTeamId?: TeamId;
  /** Optional debt-adjusted Net Worth snapshot used for consistent Sudden Death ranking & VictoryModal display */
  effectiveNetWorthByPlayerId?: Record<number, number>;
  /** Optional debt-adjusted liquid cash snapshot used for consistent Sudden Death tie-breaking */
  effectiveCashByPlayerId?: Record<number, number>;
}

export interface GameLogEntry {
  id: number;
  turn: number;
  text: string;
  playerColor?: string;
  tone?: 'neutral' | 'positive' | 'negative' | 'highlight';
}

export interface PendingDebt {
  amount: number;
  creditorId: number | null; // null = bank
  reason: string;
  /** Optional explicit debtor id (used by multi-debtor Birthday ch-10 queue) */
  debtorId?: number;
  /** Tile index where rent was incurred so post-debt excess cash can still offer 2x Buyout */
  originTileIndex?: number;
}

export interface DiceRollVisualRequest {
  rollId: number;
  die1: number;
  die2: number;
}

export type BotQuipEventKind =
  | 'BUY_PRIME_LAND'
  | 'COLLECT_BIG_RENT'
  | 'PAY_PENALTY';

export interface BotQuipPayload {
  sessionId?: string;
  botId: number;
  botName: string;
  botPersona: string;
  eventKind: BotQuipEventKind;
  tileName: string;
  amount: number;
  botCashAfter: number;
  extraContext: string;
}

export type CurrencyStyleId = 'cash' | 'coins' | 'bullion' | 'mixed';

export type GraphicsQualityPref = 'auto' | 'low' | 'medium' | 'high';

export type GraphicsQualityTier = 'low' | 'medium' | 'high';

export interface BotChatBubbleState {
  id: number;
  botId: number;
  eventKind: BotQuipEventKind;
  status: 'loading' | 'ready' | 'error';
  text: string;
}
