export enum TileKind {
  START = 'START',
  JAIL = 'JAIL',
  FREE_PARKING = 'FREE_PARKING',
  GO_TO_JAIL = 'GO_TO_JAIL',
  PROPERTY = 'PROPERTY',
  TRANSPORT = 'TRANSPORT',
  UTILITY = 'UTILITY',
  TAX = 'TAX',
  CHANCE = 'CHANCE',
  CHEST = 'CHEST',
}

export enum ColorGroup {
  BROWN = 'BROWN',
  CYAN = 'CYAN',
  PINK = 'PINK',
  ORANGE = 'ORANGE',
  RED = 'RED',
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
  /** Rents for [base, 1 house, 2 houses, 3 houses, hotel(4)] */
  rents?: [number, number, number, number, number];
  taxAmount?: number;
  description: string;
}

export interface PropertyState {
  tileIndex: number;
  ownerId: number | null;
  /** 0 = land only, 1..3 = green houses, 4 = hotel */
  level: number;
}

export interface PlayerSetupConfig {
  id: number;
  name: string;
  isBot: boolean;
  enabled: boolean;
  color: string;
  colorName: string;
  tokenType: 'car' | 'yacht' | 'jet' | 'crown';
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
  inJail: boolean;
  jailTurns: number;
  jailFreeCards: number;
  doublesStreak: number;
  bankrupt: boolean;
}

export type CardDeckType = 'CHANCE' | 'CHEST';

export type CardEffect =
  | { type: 'GAIN_CASH'; amount: number }
  | { type: 'PAY_CASH'; amount: number }
  | { type: 'MOVE_TO'; targetTile: number; collectStart: boolean }
  | { type: 'MOVE_RELATIVE'; steps: number }
  | { type: 'GO_TO_JAIL' }
  | { type: 'JAIL_FREE_CARD' }
  | { type: 'HOUSE_REPAIR'; perHouse: number; perHotel: number }
  | { type: 'COLLECT_FROM_ALL'; amountEach: number };

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
  | 'MOVING_TOKEN'
  | 'BUY_DECISION'
  | 'AUCTION'
  | 'CARD_REVEAL'
  | 'DEBT_RESOLUTION'
  | 'AWAIT_END_TURN'
  | 'GAME_OVER';

export interface AuctionState {
  tileIndex: number;
  startingBid: number;
  currentBid: number;
  highestBidderId: number | null;
  activeBidderIds: number[];
  currentTurnBidderId: number;
  status: 'ACTIVE' | 'COMPLETED';
  winnerId: number | null;
  history: string[];
}

export interface TradeOffer {
  fromPlayerId: number;
  toPlayerId: number;
  offeredTileIndices: number[];
  requestedTileIndices: number[];
  offeredCash: number;
  requestedCash: number;
}

export interface TradeEvaluationResult {
  valid: boolean;
  accepted: boolean;
  reason: string;
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
  botId: number;
  botName: string;
  botPersona: string;
  eventKind: BotQuipEventKind;
  tileName: string;
  amount: number;
  botCashAfter: number;
  extraContext: string;
}

export interface BotChatBubbleState {
  id: number;
  botId: number;
  eventKind: BotQuipEventKind;
  status: 'loading' | 'ready' | 'error';
  text: string;
}

