import {
  BotQuipEventKind,
  GameLogEntry,
  LuckCard,
  MatchBoardModifiers,
  MatchMode,
  MatchWinnerResult,
  PendingDebt,
  PlayerSetupConfig,
  PlayerState,
  PropertyState,
  TacticalCardActionKind,
  TacticalDiceChoice,
  TeamId,
  TurnPhase,
} from './types';

export type TokenArchetype = PlayerSetupConfig['tokenType'];
export type OnlineRoomStatus = 'lobby' | 'playing' | 'gameover';
export type ParticipantRole = 'player' | 'spectator';
export type ChatChannel = 'ALL' | 'TEAM';

export interface RoomParticipantSummary {
  participantId: string;
  playerName: string;
  role: ParticipantRole;
  seatIndex: number | null;
  playerId: number | null;
  tokenType: TokenArchetype | null;
  connected: boolean;
  isHost: boolean;
  ready: boolean;
  micEnabled: boolean;
}

export interface RoomChatMessage {
  id: number;
  participantId: string;
  playerId: number | null;
  senderName: string;
  senderColor: string;
  role: ParticipantRole;
  channel: ChatChannel;
  teamId?: TeamId;
  text: string;
  createdAt: number;
}

export type RtcSignalPayload =
  | { kind: 'offer' | 'answer'; sdp: string }
  | { kind: 'ice'; candidate: RTCIceCandidateInit };

export interface LobbySeatInfo {
  seatIndex: number;
  occupiedByHuman: boolean;
  playerName: string;
  tokenType: TokenArchetype;
  color: string;
  colorName: string;
  connected: boolean;
  isHost: boolean;
  teamId?: TeamId;
}

export interface OnlineMatchSnapshot {
  players: PlayerState[];
  properties: Record<number, PropertyState>;
  activePlayerIndex: number;
  turnPhase: TurnPhase;
  turnCount: number;
  /** Monotonic server revision incremented whenever decision state transitions (same-turn doubles/reroll/jail-pay safe). */
  decisionRevision?: number;
  lastDice: [number, number] | null;
  lastDiceSum: number;
  lastRentPaid: number;
  boardModifiers: MatchBoardModifiers;
  isFreeChampionship: boolean;
  pendingTacticalCard?: TacticalCardActionKind | null;
  turnTimeLeft: number;
  /** Remaining match countdown seconds (20:00 = 1200s) */
  matchTimeLeft: number;
  matchMode?: MatchMode;
  tacticalDiceEnabled?: boolean;
  festivalEnabled?: boolean;
  drawnCard: LuckCard | null;
  pendingDebt: PendingDebt | null;
  pendingDebtQueue?: PendingDebt[];
  debtReturnToPlayerIndex?: number | null;
  matchWinnerResult: MatchWinnerResult | null;
  logs: GameLogEntry[];
  landingCueText: string | null;
}

export interface OnlineRoomSnapshot {
  roomCode: string;
  status: OnlineRoomStatus;
  maxPlayers: 2 | 3 | 4;
  startingCash: number;
  fillBots: boolean;
  matchMode?: MatchMode;
  tacticalDiceEnabled?: boolean;
  festivalEnabled?: boolean;
  seats: LobbySeatInfo[];
  participants: RoomParticipantSummary[];
  chatHistory: RoomChatMessage[];
  hostSeatIndex: number;
  match: OnlineMatchSnapshot | null;
}

export type OnlineGameAction =
  | { kind: 'ROLL_DICE'; diceChoice?: TacticalDiceChoice }
  | { kind: 'REROLL_DICE' }
  | { kind: 'CONFIRM_ROLL_MOVE' }
  | { kind: 'PAY_JAIL_FINE' }
  | { kind: 'USE_JAIL_CARD' }
  | { kind: 'BUY_PROPERTY'; initialLevel: number }
  | { kind: 'SKIP_BUY' }
  | { kind: 'UPGRADE_PROPERTY'; targetLevel: number }
  | { kind: 'SKIP_UPGRADE' }
  | { kind: 'CONFIRM_BUYOUT' }
  | { kind: 'SKIP_BUYOUT' }
  | { kind: 'CONFIRM_CHAMPIONSHIP'; targetTile: number }
  | { kind: 'SKIP_CHAMPIONSHIP' }
  | { kind: 'SELECT_WORLD_TOUR'; targetTile: number }
  | { kind: 'SKIP_WORLD_TOUR' }
  | { kind: 'CONFIRM_CARD' }
  | { kind: 'APPLY_TACTICAL_CARD'; targetTile: number }
  | { kind: 'SKIP_TACTICAL_CARD' }
  | { kind: 'SELL_AND_PAY_DEBT'; tileIndicesToSell: number[] }
  | { kind: 'DECLARE_BANKRUPTCY' };

export type ClientToServerMessage =
  | {
      type: 'CREATE_ROOM';
      playerName: string;
      tokenType: TokenArchetype;
      maxPlayers: 2 | 3 | 4;
      startingCash: number;
      fillBots: boolean;
      matchMode?: MatchMode;
      tacticalDiceEnabled?: boolean;
      festivalEnabled?: boolean;
    }
  | {
      type: 'JOIN_ROOM';
      roomCode: string;
      playerName: string;
      tokenType?: TokenArchetype;
    }
  | {
      type: 'RECONNECT_ROOM';
      roomCode: string;
      sessionToken: string;
    }
  | { type: 'LEAVE_ROOM' }
  | {
      type: 'UPDATE_LOBBY_SETTINGS';
      maxPlayers?: 2 | 3 | 4;
      startingCash?: number;
      fillBots?: boolean;
      matchMode?: MatchMode;
      tacticalDiceEnabled?: boolean;
      festivalEnabled?: boolean;
    }
  | {
      type: 'UPDATE_MY_PROFILE';
      playerName?: string;
      tokenType?: TokenArchetype;
    }
  | { type: 'START_MATCH' }
  | { type: 'RETURN_TO_LOBBY' }
  | { type: 'RECLAIM_CONTROL' }
  | {
      type: 'GAME_ACTION';
      action: OnlineGameAction;
      expectedTurnCount?: number;
      expectedPhase?: TurnPhase;
      expectedDecisionRevision?: number;
      actionId?: string;
    }
  | { type: 'SEND_EMOTE'; emoteText: string }
  | {
      type: 'SEND_CHAT_MESSAGE';
      channel: ChatChannel;
      text: string;
    }
  | {
      type: 'RTC_SIGNAL';
      targetParticipantId: string;
      signal: RtcSignalPayload;
    }
  | {
      type: 'UPDATE_VOICE_STATE';
      micEnabled: boolean;
    }
  | { type: 'PING' };

export type OnlineSoundEffect =
  | 'cashGain'
  | 'cashPay'
  | 'buyProperty'
  | 'buildHouse'
  | 'auctionGavel'
  | 'cardDraw'
  | 'jailAlert'
  | 'victory';

export type OnlineVisualEvent =
  | {
      eventSeq: number;
      kind: 'DICE_ROLLED';
      playerId: number;
      die1: number;
      die2: number;
    }
  | {
      eventSeq: number;
      kind: 'TOKEN_MOVED';
      playerId: number;
      path: number[];
      speedMultiplier: number;
    }
  | {
      eventSeq: number;
      kind: 'SOUND';
      effect: OnlineSoundEffect;
      level?: number;
    }
  | {
      eventSeq: number;
      kind: 'PLAYER_EMOTE';
      playerId: number;
      playerName: string;
      emoteText: string;
    }
  | {
      eventSeq: number;
      kind: 'BOT_QUIP';
      botId: number;
      botName: string;
      eventKind: BotQuipEventKind;
      status: 'loading' | 'ready';
      text: string;
    }
  | {
      eventSeq: number;
      kind: 'CHAT_MESSAGE';
      message: RoomChatMessage;
    };

export type ServerToClientMessage =
  | {
      type: 'ROOM_JOINED';
      roomCode: string;
      sessionToken: string;
      yourParticipantId: string;
      yourSeatIndex: number | null;
      yourPlayerId: number | null;
      snapshot: OnlineRoomSnapshot;
    }
  | {
      type: 'ROOM_SNAPSHOT';
      yourParticipantId: string;
      yourSeatIndex: number | null;
      yourPlayerId: number | null;
      snapshot: OnlineRoomSnapshot;
    }
  | {
      type: 'GAME_EVENT';
      event: OnlineVisualEvent;
    }
  | {
      type: 'RTC_SIGNAL';
      fromParticipantId: string;
      signal: RtcSignalPayload;
    }
  | { type: 'LEFT_ROOM' }
  | {
      type: 'ERROR';
      code: string;
      message: string;
    }
  | { type: 'PONG' };
