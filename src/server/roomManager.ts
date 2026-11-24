import crypto from 'node:crypto';
import { CHARACTER_PERSONAS } from '../game/avatarLogic';
import { BOARD_TILES, CHANCE_CARDS } from '../game/boardData';
import {
  BotDifficulty,
  ChatChannel,
  ClientToServerMessage,
  LobbySeatInfo,
  OnlineGameAction,
  OnlineMatchSnapshot,
  OnlineRoomSnapshot,
  OnlineRoomStatus,
  OnlineSoundEffect,
  OnlineVisualEvent,
  PendingSeatSwapRequest,
  RoomChatMessage,
  RoomParticipantSummary,
  RtcSignalPayload,
  ServerToClientMessage,
  TokenArchetype,
} from '../game/onlineTypes';
import {
  applyChampionshipHost,
  applyEarthquakeToTile,
  applyPowerOutageToTile,
  applyShieldToTile,
  areTeammates,
  botChooseJailAction,
  botChooseTacticalDice,
  botPickChampionshipTarget,
  botPickInitialPurchaseTier,
  botPickOnTileUpgradeTargetLevel,
  botPickTacticalCardTarget,
  botPickWorldTourTarget,
  botShouldBuyoutProperty,
  botShouldBuyProperty,
  botShouldRerollDice,
  buildBotBuyQuipPayload,
  buildBotPenaltyQuipPayload,
  buildBotRentCollectedQuipPayload,
  calculateBankruptcyCreditorPayout,
  calculateRent,
  calculatePropertyInvestedValue,
  calculateTaxAmount,
  canBuyoutProperty,
  canUpgradeProperty,
  clearDisownedModifiers,
  clearTileOutage,
  computeForwardSteps,
  computeOptimalAutoSale,
  computePathToTile,
  computeTokenHopTiming,
  createDefaultBoardModifiers,
  createInitialProperties,
  DEFAULT_EVEN_ODD_CHARGES,
  DEFAULT_FESTIVAL_CITY_COUNT,
  DEFAULT_REROLL_CHARGES,
  evaluateMatchWinner,
  evaluateTimeLimitWinner,
  formatBusinessTourCompact,
  formatBusinessTourSpaced,
  formatFestivalStartLog,
  getNextActivePlayerIndex,
  getValidTacticalCardTargets,
  isPurchasableTile,
  isValidTileIndex,
  isValidUpgradeTargetLevel,
  isValidWorldTourTarget,
  JAIL_FINE,
  LOST_ISLAND_TILE_INDEX,
  MATCH_DURATION_SECONDS,
  MAX_JAIL_TURNS,
  MIN_BIG_RENT_FOR_QUIP,
  resolveIslandRollOutcome,
  resolveWorldTourMovement,
  rollTacticalDicePair,
  shouldGrantImmediateDoublesRoll,
  START_SALARY,
  TURN_COUNTDOWN_SECONDS,
  validateChampionshipHostSelection,
  validateInitialPropertyPurchase,
  WORLD_TOUR_FEE,
  WORLD_TOUR_TILE_INDEX,
} from '../game/rules';
import {
  BotQuipPayload,
  GameLogEntry,
  LuckCard,
  MatchBoardModifiers,
  MatchMode,
  MatchWinnerResult,
  PendingDebt,
  PlayerState,
  PropertyState,
  TacticalCardActionKind,
  TacticalDiceChoice,
  TeamId,
  TileKind,
  TurnPhase,
} from '../game/types';
import { generateOfflineBotQuip } from '../game/visualTheme';

const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const ALL_TOKENS: TokenArchetype[] = ['car', 'yacht', 'jet', 'crown'];
const DISCONNECT_BOT_TAKEOVER_MS = 90_000;
const EMPTY_LOBBY_CLEANUP_MS = 10_000;
const SEAT_SWAP_EXPIRY_MS = 15_000;
const MAX_ROOMS = 100;
const EMOTE_COOLDOWN_MS = 1500;
const CHAT_COOLDOWN_MS = 800;
const MAX_CHAT_LENGTH = 160;
const MAX_ALL_CHAT_HISTORY = 60;
const MAX_TEAM_CHAT_HISTORY = 30;

const TOKEN_COLORS: Record<TokenArchetype, { color: string; colorName: string }> = {
  car: { color: '#F5B800', colorName: 'Vàng kim' },
  yacht: { color: '#66C61C', colorName: 'Xanh cốm' },
  jet: { color: '#E91E63', colorName: 'Hồng đậm' },
  crown: { color: '#29B6F6', colorName: 'Xanh da trời' },
};

function shuffleCards<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function isTokenArchetype(value: unknown): value is TokenArchetype {
  return value === 'car' || value === 'yacht' || value === 'jet' || value === 'crown';
}

function sanitizePlayerName(raw: unknown, fallback: string): string {
  if (typeof raw !== 'string') return fallback;
  const cleaned = raw.replace(/\s+/g, ' ').trim().slice(0, 22);
  return cleaned.length > 0 ? cleaned : fallback;
}

function normalizeMaxPlayers(val: unknown): 2 | 3 | 4 {
  if (val === 2 || val === 3 || val === 4) return val;
  return 4;
}

function normalizeStartingCash(val: unknown): number {
  return val === 3_000_000 ? 3_000_000 : 2_000_000;
}

function normalizeMatchMode(val: unknown): MatchMode {
  return val === 'TEAMS_2V2' ? 'TEAMS_2V2' : 'FFA';
}

function normalizeBotDifficulty(val: unknown): BotDifficulty {
  if (val === 'easy' || val === 'hard') return val;
  return 'normal';
}

function isValidTacticalDiceChoice(val: unknown): val is TacticalDiceChoice {
  return val === 'NORMAL' || val === 'EVEN' || val === 'ODD';
}

function isValidRtcSignalPayload(signal: unknown): signal is RtcSignalPayload {
  if (!signal || typeof signal !== 'object' || Array.isArray(signal)) {
    return false;
  }
  const candidate = signal as Record<string, unknown>;
  if (candidate.kind === 'offer' || candidate.kind === 'answer') {
    return typeof candidate.sdp === 'string' && candidate.sdp.length > 0;
  }
  if (candidate.kind === 'ice') {
    return (
      typeof candidate.candidate === 'object' &&
      candidate.candidate !== null &&
      !Array.isArray(candidate.candidate)
    );
  }
  return false;
}

function generateParticipantId(existingHumans: HumanSeatRecord[] = []): string {
  for (let attempt = 0; attempt < 8; attempt++) {
    const candidate = `p_${crypto.randomBytes(4).toString('hex')}`;
    if (!existingHumans.some((h) => h.participantId === candidate)) {
      return candidate;
    }
  }
  return `p_${crypto.randomBytes(4).toString('hex')}`;
}

interface HumanSeatRecord {
  participantId: string;
  seatIndex: number;
  sessionToken: string;
  clientId: string | null;
  playerName: string;
  tokenType: TokenArchetype;
  connected: boolean;
  disconnectedAt: number | null;
  explicitlyLeft: boolean;
  playerId: number | null;
  ready: boolean;
  micEnabled: boolean;
}

interface MatchRecord {
  players: PlayerState[];
  properties: Record<number, PropertyState>;
  activePlayerIndex: number;
  turnPhase: TurnPhase;
  turnCount: number;
  decisionRevision: number;
  processedActionIds: Set<string>;
  processedActionIdOrder: string[];
  lastDice: [number, number] | null;
  lastDiceSum: number;
  lastRentPaid: number;
  boardModifiers: MatchBoardModifiers;
  isFreeChampionship: boolean;
  pendingTacticalCard: TacticalCardActionKind | null;
  turnTimeLeft: number;
  matchTimeLeft: number;
  matchMode: MatchMode;
  tacticalDiceEnabled: boolean;
  festivalEnabled: boolean;
  drawnCard: LuckCard | null;
  pendingDebt: PendingDebt | null;
  pendingDebtQueue: PendingDebt[];
  debtReturnToPlayerIndex: number | null;
  matchWinnerResult: MatchWinnerResult | null;
  logs: GameLogEntry[];
  landingCueText: string | null;
  chanceDeck: LuckCard[];
  nextLogId: number;
  missedTurnsByPlayer: Record<number, number>;
  lastMissedTurnCountByPlayer: Record<number, number>;
  lastHumanActionTurnCountByPlayer: Record<number, number>;
}

interface BotScheduledMeta {
  epoch: number;
  turnCount: number;
  decisionRevision: number;
  playerId: number;
  phase: TurnPhase;
  scheduledAt: number;
  expectedDelayMs: number;
}

interface RoomRecord {
  roomCode: string;
  status: OnlineRoomStatus;
  maxPlayers: 2 | 3 | 4;
  startingCash: number;
  fillBots: boolean;
  botDifficulty: BotDifficulty;
  matchMode: MatchMode;
  tacticalDiceEnabled: boolean;
  festivalEnabled: boolean;
  hostSeatIndex: number;
  humans: HumanSeatRecord[];
  pendingSeatSwap: (PendingSeatSwapRequest & { timer: ReturnType<typeof setTimeout> }) | null;
  allChatHistory: RoomChatMessage[];
  teamChatHistory: Record<TeamId, RoomChatMessage[]>;
  nextChatId: number;
  match: MatchRecord | null;
  matchEpoch: number;
  eventSeq: number;
  pendingTimers: Set<ReturnType<typeof setTimeout>>;
  botActionTimer: ReturnType<typeof setTimeout> | null;
  botScheduledMeta: BotScheduledMeta | null;
  botActionExecuting: boolean;
  inFlightBeatCount: number;
  botWatchdogKey: string | null;
  botWatchdogAttempts: number;
  cleanupTimer: ReturnType<typeof setTimeout> | null;
}

export interface OnlineRoomManagerOptions {
  timingScale?: number;
  enableTickInterval?: boolean;
  generateBotQuip?: (payload: BotQuipPayload) => Promise<string | null>;
  diceRng?: () => [number, number];
}

export class OnlineRoomManager {
  private readonly rooms = new Map<string, RoomRecord>();
  private readonly clientSessions = new Map<string, { roomCode: string; sessionToken: string }>();
  private readonly lastEmoteAtByClient = new Map<string, number>();
  private readonly lastChatAtByClient = new Map<string, number>();
  private readonly sendMessage: (clientId: string, msg: ServerToClientMessage) => void;
  private readonly timingScale: number;
  private readonly generateBotQuip?: (payload: BotQuipPayload) => Promise<string | null>;
  private readonly diceRng: () => [number, number];
  private tickTimer: ReturnType<typeof setInterval> | null = null;
  private disposed = false;

  constructor(
    sendMessage: (clientId: string, msg: ServerToClientMessage) => void,
    options: OnlineRoomManagerOptions = {}
  ) {
    this.sendMessage = sendMessage;
    this.timingScale = options.timingScale ?? 1;
    this.generateBotQuip = options.generateBotQuip;
    this.diceRng =
      options.diceRng ??
      (() => [Math.floor(Math.random() * 6) + 1, Math.floor(Math.random() * 6) + 1]);

    if (options.enableTickInterval !== false) {
      this.tickTimer = setInterval(() => {
        this.tickOneSecond();
      }, 1000);
    }
  }

  public getActiveRoomCount(): number {
    return this.rooms.size;
  }

  public dispose(): void {
    this.disposed = true;
    if (this.tickTimer) {
      clearInterval(this.tickTimer);
      this.tickTimer = null;
    }
    for (const room of this.rooms.values()) {
      this.clearRoomTimers(room);
    }
    this.rooms.clear();
    this.clientSessions.clear();
    this.lastEmoteAtByClient.clear();
    this.lastChatAtByClient.clear();
  }

  private clearBotActionTimer(room: RoomRecord): void {
    if (room.botActionTimer) {
      clearTimeout(room.botActionTimer);
      room.pendingTimers.delete(room.botActionTimer);
      room.botActionTimer = null;
    }
    room.botScheduledMeta = null;
  }

  private clearMatchTimers(room: RoomRecord): void {
    for (const t of room.pendingTimers) {
      clearTimeout(t);
    }
    room.pendingTimers.clear();
    this.clearBotActionTimer(room);
    room.botActionExecuting = false;
    room.inFlightBeatCount = 0;
    room.botWatchdogKey = null;
    room.botWatchdogAttempts = 0;
  }

  private clearPendingSeatSwap(room: RoomRecord): boolean {
    if (!room.pendingSeatSwap) return false;
    clearTimeout(room.pendingSeatSwap.timer);
    room.pendingTimers.delete(room.pendingSeatSwap.timer);
    room.pendingSeatSwap = null;
    return true;
  }

  private clearRoomTimers(room: RoomRecord): void {
    this.clearPendingSeatSwap(room);
    this.clearMatchTimers(room);
    if (room.cleanupTimer) {
      clearTimeout(room.cleanupTimer);
      room.cleanupTimer = null;
    }
  }

  private scheduleRoomTimeout(
    room: RoomRecord,
    rawMs: number,
    fn: () => void
  ): ReturnType<typeof setTimeout> {
    const delayMs = this.timingScale <= 0 ? 0 : Math.max(10, Math.round(rawMs * this.timingScale));
    const timer = setTimeout(() => {
      room.pendingTimers.delete(timer);
      if (this.disposed || !this.rooms.has(room.roomCode)) return;
      fn();
    }, delayMs);
    room.pendingTimers.add(timer);
    return timer;
  }

  private waitRoomBeat(room: RoomRecord, rawMs: number, epoch: number): Promise<boolean> {
    room.inFlightBeatCount += 1;
    return new Promise((resolve) => {
      this.scheduleRoomTimeout(room, rawMs, () => {
        if (room.matchEpoch === epoch) {
          room.inFlightBeatCount = Math.max(0, room.inFlightBeatCount - 1);
        }
        resolve(room.matchEpoch === epoch && room.status === 'playing');
      });
    });
  }

  private generateUniqueRoomCode(): string {
    for (let attempt = 0; attempt < 25; attempt++) {
      let code = '';
      for (let i = 0; i < 6; i++) {
        code += ROOM_CODE_ALPHABET[Math.floor(Math.random() * ROOM_CODE_ALPHABET.length)];
      }
      if (!this.rooms.has(code)) return code;
    }
    return crypto.randomBytes(3).toString('hex').toUpperCase();
  }

  private pickAvailableToken(room: RoomRecord, requested?: TokenArchetype): TokenArchetype {
    const used = new Set(room.humans.map((h) => h.tokenType));
    if (requested && isTokenArchetype(requested) && !used.has(requested)) {
      return requested;
    }
    return ALL_TOKENS.find((t) => !used.has(t)) || 'car';
  }

  private sendError(clientId: string, code: string, message: string): void {
    this.sendMessage(clientId, { type: 'ERROR', code, message });
  }

  private promoteConnectedHostIfNeeded(room: RoomRecord): boolean {
    const currentHost = room.humans.find((h) => h.seatIndex === room.hostSeatIndex);
    if (currentHost && currentHost.connected && !currentHost.explicitlyLeft) {
      return false;
    }
    const nextConnected = [...room.humans]
      .filter((h) => h.connected && !h.explicitlyLeft)
      .sort((a, b) => a.seatIndex - b.seatIndex)[0];
    if (nextConnected && nextConnected.seatIndex !== room.hostSeatIndex) {
      room.hostSeatIndex = nextConnected.seatIndex;
      nextConnected.ready = true;
      return true;
    }
    return false;
  }

  private scheduleGraceCleanupIfEmpty(room: RoomRecord): void {
    const anyConnected = room.humans.some((h) => h.connected && !h.explicitlyLeft);
    if (!anyConnected && !room.cleanupTimer) {
      const waitMs =
        room.status === 'playing' ? DISCONNECT_BOT_TAKEOVER_MS : EMPTY_LOBBY_CLEANUP_MS;
      room.cleanupTimer = this.scheduleRoomTimeout(room, waitMs, () => {
        room.cleanupTimer = null;
        if (!room.humans.some((h) => h.connected && !h.explicitlyLeft)) {
          this.clearRoomTimers(room);
          this.rooms.delete(room.roomCode);
        }
      });
    }
  }

  private buildParticipantsList(room: RoomRecord): RoomParticipantSummary[] {
    return [...room.humans]
      .filter((h) => !h.explicitlyLeft)
      .sort((a, b) => a.seatIndex - b.seatIndex)
      .map((h) => ({
        participantId: h.participantId,
        playerName: h.playerName,
        role: 'player',
        seatIndex: h.seatIndex,
        playerId: h.playerId,
        tokenType: h.tokenType,
        connected: h.connected,
        isHost: h.seatIndex === room.hostSeatIndex,
        ready: h.seatIndex === room.hostSeatIndex ? true : h.ready,
        micEnabled: h.micEnabled,
      }));
  }

  private isValidLobbySeatIndex(room: RoomRecord, val: unknown): val is number {
    return (
      typeof val === 'number' &&
      Number.isInteger(val) &&
      val >= 0 &&
      val < room.maxPlayers
    );
  }

  private swapLobbySeatAssignments(room: RoomRecord, seatA: number, seatB: number): void {
    const humanA = room.humans.find((h) => !h.explicitlyLeft && h.seatIndex === seatA);
    const humanB = room.humans.find((h) => !h.explicitlyLeft && h.seatIndex === seatB);
    if (humanA) humanA.seatIndex = seatB;
    if (humanB) humanB.seatIndex = seatA;
    if (room.hostSeatIndex === seatA) {
      room.hostSeatIndex = seatB;
      if (humanA) humanA.ready = true;
    } else if (room.hostSeatIndex === seatB) {
      room.hostSeatIndex = seatA;
      if (humanB) humanB.ready = true;
    }
  }

  private appendSystemLobbyChat(room: RoomRecord, text: string): void {
    const chatMessage: RoomChatMessage = {
      id: room.nextChatId++,
      participantId: 'system',
      playerId: null,
      senderName: 'Hệ thống',
      senderColor: '#0284c7',
      role: 'player',
      channel: 'ALL',
      text,
      createdAt: Date.now(),
    };
    room.allChatHistory.push(chatMessage);
    if (room.allChatHistory.length > MAX_ALL_CHAT_HISTORY) {
      room.allChatHistory.splice(0, room.allChatHistory.length - MAX_ALL_CHAT_HISTORY);
    }
    this.emitVisualEvent(room, { kind: 'CHAT_MESSAGE', message: chatMessage });
  }

  private getSeatTeamId(room: RoomRecord, seat: HumanSeatRecord | undefined): TeamId | undefined {
    if (!seat || seat.explicitlyLeft || room.matchMode !== 'TEAMS_2V2') {
      return undefined;
    }
    if (room.match && seat.playerId !== null) {
      const player = room.match.players.find((p) => p.id === seat.playerId);
      if (player?.teamId === 0 || player?.teamId === 1) {
        return player.teamId;
      }
    }
    return (seat.seatIndex % 2) as TeamId;
  }

  private buildRoomSnapshot(
    room: RoomRecord,
    recipientParticipantId?: string
  ): OnlineRoomSnapshot {
    const usedByHumans = new Set(room.humans.map((h) => h.tokenType));
    const freeTokens = ALL_TOKENS.filter((t) => !usedByHumans.has(t));
    let freeTokenIdx = 0;

    const seats: LobbySeatInfo[] = [];
    for (let s = 0; s < room.maxPlayers; s++) {
      const human = room.humans.find((h) => h.seatIndex === s);
      const teamId = room.matchMode === 'TEAMS_2V2' ? ((s % 2) as TeamId) : undefined;
      if (human) {
        const meta = TOKEN_COLORS[human.tokenType];
        seats.push({
          seatIndex: s,
          occupiedByHuman: true,
          participantId: human.participantId,
          playerName: human.playerName,
          tokenType: human.tokenType,
          color: meta.color,
          colorName: meta.colorName,
          connected: human.connected,
          isHost: s === room.hostSeatIndex,
          ready: s === room.hostSeatIndex ? true : human.ready,
          teamId,
        });
      } else {
        const tok = freeTokens[freeTokenIdx++] || ALL_TOKENS[s % ALL_TOKENS.length];
        const meta = TOKEN_COLORS[tok];
        const persona = CHARACTER_PERSONAS[tok];
        seats.push({
          seatIndex: s,
          occupiedByHuman: false,
          participantId: null,
          playerName: room.fillBots ? persona.botDefaultName : 'Đang chờ người chơi...',
          tokenType: tok,
          color: meta.color,
          colorName: meta.colorName,
          connected: false,
          isHost: false,
          ready: false,
          teamId,
        });
      }
    }

    const matchSnap: OnlineMatchSnapshot | null = room.match
      ? {
          players: room.match.players,
          properties: room.match.properties,
          activePlayerIndex: room.match.activePlayerIndex,
          turnPhase: room.match.turnPhase,
          turnCount: room.match.turnCount,
          decisionRevision: room.match.decisionRevision,
          lastDice: room.match.lastDice,
          lastDiceSum: room.match.lastDiceSum,
          lastRentPaid: room.match.lastRentPaid,
          boardModifiers: room.match.boardModifiers,
          isFreeChampionship: room.match.isFreeChampionship,
          pendingTacticalCard: room.match.pendingTacticalCard,
          turnTimeLeft: room.match.turnTimeLeft,
          matchTimeLeft: room.match.matchTimeLeft,
          matchMode: room.match.matchMode,
          tacticalDiceEnabled: room.match.tacticalDiceEnabled,
          festivalEnabled: room.match.festivalEnabled,
          drawnCard: room.match.drawnCard,
          pendingDebt: room.match.pendingDebt,
          pendingDebtQueue: room.match.pendingDebtQueue,
          debtReturnToPlayerIndex: room.match.debtReturnToPlayerIndex,
          matchWinnerResult: room.match.matchWinnerResult,
          logs: room.match.logs,
          landingCueText: room.match.landingCueText,
        }
      : null;

    const recipientSeat = recipientParticipantId
      ? room.humans.find((h) => h.participantId === recipientParticipantId && !h.explicitlyLeft)
      : undefined;
    const recipientTeamId = this.getSeatTeamId(room, recipientSeat);
    const chatHistory =
      room.matchMode === 'TEAMS_2V2' && recipientTeamId !== undefined
        ? [...room.allChatHistory, ...room.teamChatHistory[recipientTeamId]].sort(
            (a, b) => a.id - b.id
          )
        : [...room.allChatHistory];

    return {
      roomCode: room.roomCode,
      status: room.status,
      maxPlayers: room.maxPlayers,
      startingCash: room.startingCash,
      fillBots: room.fillBots,
      botDifficulty: room.botDifficulty,
      matchMode: room.matchMode,
      tacticalDiceEnabled: room.tacticalDiceEnabled,
      festivalEnabled: room.festivalEnabled,
      seats,
      participants: this.buildParticipantsList(room),
      spectators: [],
      pendingSeatSwap: room.pendingSeatSwap
        ? {
            requestId: room.pendingSeatSwap.requestId,
            fromParticipantId: room.pendingSeatSwap.fromParticipantId,
            fromSeatIndex: room.pendingSeatSwap.fromSeatIndex,
            fromPlayerName: room.pendingSeatSwap.fromPlayerName,
            toParticipantId: room.pendingSeatSwap.toParticipantId,
            toSeatIndex: room.pendingSeatSwap.toSeatIndex,
            expiresAt: room.pendingSeatSwap.expiresAt,
          }
        : null,
      pendingTakeoverRequest: null,
      chatHistory,
      hostSeatIndex: room.hostSeatIndex,
      match: matchSnap,
    };
  }

  private broadcastSnapshot(room: RoomRecord): void {
    for (const h of room.humans) {
      if (h.connected && h.clientId && !h.explicitlyLeft) {
        this.sendMessage(h.clientId, {
          type: 'ROOM_SNAPSHOT',
          yourParticipantId: h.participantId,
          yourSeatIndex: h.seatIndex,
          yourPlayerId: h.playerId,
          snapshot: this.buildRoomSnapshot(room, h.participantId),
        });
      }
    }
  }

  private emitVisualEvent(
    room: RoomRecord,
    eventPayload:
      | Omit<Extract<OnlineVisualEvent, { kind: 'DICE_ROLLED' }>, 'eventSeq'>
      | Omit<Extract<OnlineVisualEvent, { kind: 'TOKEN_MOVED' }>, 'eventSeq'>
      | Omit<Extract<OnlineVisualEvent, { kind: 'SOUND' }>, 'eventSeq'>
      | Omit<Extract<OnlineVisualEvent, { kind: 'PLAYER_EMOTE' }>, 'eventSeq'>
      | Omit<Extract<OnlineVisualEvent, { kind: 'BOT_QUIP' }>, 'eventSeq'>
      | Omit<Extract<OnlineVisualEvent, { kind: 'CHAT_MESSAGE' }>, 'eventSeq'>,
    options?: { teamId?: TeamId }
  ): void {
    room.eventSeq += 1;
    const event = {
      ...eventPayload,
      eventSeq: room.eventSeq,
    } as OnlineVisualEvent;

    for (const h of room.humans) {
      if (!h.connected || !h.clientId || h.explicitlyLeft) continue;
      if (options?.teamId !== undefined && this.getSeatTeamId(room, h) !== options.teamId) {
        continue;
      }
      this.sendMessage(h.clientId, { type: 'GAME_EVENT', event });
    }
  }

  private emitSound(room: RoomRecord, effect: OnlineSoundEffect, level?: number): void {
    this.emitVisualEvent(room, { kind: 'SOUND', effect, level });
  }

  private addLog(
    room: RoomRecord,
    text: string,
    playerColor?: string,
    tone: GameLogEntry['tone'] = 'neutral'
  ): void {
    const match = room.match;
    if (!match) return;
    const id = match.nextLogId++;
    match.logs = [{ id, turn: match.turnCount, text, playerColor, tone }, ...match.logs.slice(0, 29)];
  }

  public handleClientMessage(clientId: string, msg: ClientToServerMessage): void {
    if (!msg || typeof msg !== 'object' || Array.isArray(msg) || typeof msg.type !== 'string') {
      this.sendError(clientId, 'BAD_MESSAGE', 'Định dạng thông điệp không hợp lệ.');
      return;
    }

    if (msg.type === 'PING') {
      this.sendMessage(clientId, { type: 'PONG' });
      return;
    }

    if (msg.type === 'CREATE_ROOM') {
      if (this.rooms.size >= MAX_ROOMS) {
        this.sendError(
          clientId,
          'SERVER_BUSY',
          'Máy chủ đang đạt giới hạn phòng chơi. Vui lòng thử lại sau.'
        );
        return;
      }

      this.detachClientIfAny(clientId, true);
      const roomCode = this.generateUniqueRoomCode();
      const tokenType = isTokenArchetype(msg.tokenType) ? msg.tokenType : 'car';
      const matchMode = normalizeMatchMode(msg.matchMode);
      const maxPlayers = matchMode === 'TEAMS_2V2' ? 4 : normalizeMaxPlayers(msg.maxPlayers);
      const tacticalDiceEnabled = Boolean(msg.tacticalDiceEnabled);
      const festivalEnabled = Boolean(msg.festivalEnabled);
      const sessionToken = crypto.randomBytes(18).toString('hex');
      const participantId = generateParticipantId();
      const creator: HumanSeatRecord = {
        participantId,
        seatIndex: 0,
        sessionToken,
        clientId,
        playerName: sanitizePlayerName(msg.playerName, 'Chủ phòng'),
        tokenType,
        connected: true,
        disconnectedAt: null,
        explicitlyLeft: false,
        playerId: null,
        ready: true,
        micEnabled: false,
      };

      const room: RoomRecord = {
        roomCode,
        status: 'lobby',
        maxPlayers,
        startingCash: normalizeStartingCash(msg.startingCash),
        fillBots: Boolean(msg.fillBots),
        botDifficulty: normalizeBotDifficulty(msg.botDifficulty),
        matchMode,
        tacticalDiceEnabled,
        festivalEnabled,
        hostSeatIndex: 0,
        humans: [creator],
        pendingSeatSwap: null,
        allChatHistory: [],
        teamChatHistory: { 0: [], 1: [] },
        nextChatId: 1,
        match: null,
        matchEpoch: 1,
        eventSeq: 0,
        pendingTimers: new Set(),
        botActionTimer: null,
        botScheduledMeta: null,
        botActionExecuting: false,
        inFlightBeatCount: 0,
        botWatchdogKey: null,
        botWatchdogAttempts: 0,
        cleanupTimer: null,
      };

      this.rooms.set(roomCode, room);
      this.clientSessions.set(clientId, { roomCode, sessionToken });

      this.sendMessage(clientId, {
        type: 'ROOM_JOINED',
        roomCode,
        sessionToken,
        yourParticipantId: participantId,
        yourSeatIndex: 0,
        yourPlayerId: null,
        snapshot: this.buildRoomSnapshot(room, participantId),
      });
      return;
    }

    if (msg.type === 'JOIN_ROOM') {
      if (typeof msg.roomCode !== 'string') {
        this.sendError(clientId, 'BAD_MESSAGE', 'Mã phòng không hợp lệ.');
        return;
      }
      const code = msg.roomCode.trim().toUpperCase();
      const room = this.rooms.get(code);
      if (!room) {
        this.sendError(clientId, 'ROOM_NOT_FOUND', `Không tìm thấy phòng "${code}".`);
        return;
      }
      if (room.status !== 'lobby') {
        this.sendError(
          clientId,
          'MATCH_ALREADY_STARTED',
          'Ván đấu trong phòng này đã bắt đầu. Hãy tải lại bằng phiên cũ nếu bạn từng ở trong phòng.'
        );
        return;
      }

      const existingSeat = room.humans.find((h) => h.clientId === clientId && !h.explicitlyLeft);
      if (existingSeat) {
        existingSeat.connected = true;
        existingSeat.disconnectedAt = null;
        if (room.cleanupTimer) {
          clearTimeout(room.cleanupTimer);
          room.cleanupTimer = null;
        }
        this.sendMessage(clientId, {
          type: 'ROOM_JOINED',
          roomCode: room.roomCode,
          sessionToken: existingSeat.sessionToken,
          yourParticipantId: existingSeat.participantId,
          yourSeatIndex: existingSeat.seatIndex,
          yourPlayerId: existingSeat.playerId,
          snapshot: this.buildRoomSnapshot(room, existingSeat.participantId),
        });
        return;
      }

      let freeSeat = -1;
      for (let s = 0; s < room.maxPlayers; s++) {
        if (!room.humans.some((h) => h.seatIndex === s)) {
          freeSeat = s;
          break;
        }
      }
      if (freeSeat < 0) {
        this.sendError(clientId, 'ROOM_FULL', 'Phòng đã đủ số lượng người chơi!');
        return;
      }

      this.detachClientIfAny(clientId, true);

      if (room.cleanupTimer) {
        clearTimeout(room.cleanupTimer);
        room.cleanupTimer = null;
      }

      const tokenType = this.pickAvailableToken(room, msg.tokenType);
      const sessionToken = crypto.randomBytes(18).toString('hex');
      const participantId = generateParticipantId(room.humans);
      const joiner: HumanSeatRecord = {
        participantId,
        seatIndex: freeSeat,
        sessionToken,
        clientId,
        playerName: sanitizePlayerName(msg.playerName, `Người chơi ${freeSeat + 1}`),
        tokenType,
        connected: true,
        disconnectedAt: null,
        explicitlyLeft: false,
        playerId: null,
        ready: false,
        micEnabled: false,
      };

      room.humans.push(joiner);
      this.clientSessions.set(clientId, { roomCode: room.roomCode, sessionToken });

      this.sendMessage(clientId, {
        type: 'ROOM_JOINED',
        roomCode: room.roomCode,
        sessionToken,
        yourParticipantId: participantId,
        yourSeatIndex: freeSeat,
        yourPlayerId: null,
        snapshot: this.buildRoomSnapshot(room, participantId),
      });
      this.broadcastSnapshot(room);
      return;
    }

    if (msg.type === 'RECONNECT_ROOM') {
      if (typeof msg.roomCode !== 'string' || typeof msg.sessionToken !== 'string') {
        this.sendError(clientId, 'BAD_MESSAGE', 'Thông tin kết nối lại phòng không hợp lệ.');
        return;
      }
      const code = msg.roomCode.trim().toUpperCase();
      const room = this.rooms.get(code);
      if (!room) {
        this.sendError(clientId, 'ROOM_NOT_FOUND', 'Phòng không còn tồn tại hoặc đã kết thúc.');
        return;
      }
      const seat = room.humans.find(
        (h) => h.sessionToken === msg.sessionToken && !h.explicitlyLeft
      );
      if (!seat) {
        this.sendError(clientId, 'SESSION_EXPIRED', 'Phiên chơi cũ không hợp lệ hoặc đã rời phòng.');
        return;
      }

      const prevSession = this.clientSessions.get(clientId);
      if (
        prevSession &&
        (prevSession.roomCode !== code || prevSession.sessionToken !== msg.sessionToken)
      ) {
        this.detachClientIfAny(clientId, true);
      }

      if (seat.clientId && seat.clientId !== clientId) {
        const oldClientId = seat.clientId;
        this.clientSessions.delete(oldClientId);
        this.lastEmoteAtByClient.delete(oldClientId);
        this.lastChatAtByClient.delete(oldClientId);
        this.sendError(
          oldClientId,
          'SESSION_REPLACED',
          'Phiên chơi đã được mở ở tab hoặc thiết bị khác.'
        );
      }
      if (room.cleanupTimer) {
        clearTimeout(room.cleanupTimer);
        room.cleanupTimer = null;
      }

      seat.clientId = clientId;
      seat.connected = true;
      seat.micEnabled = false;
      seat.disconnectedAt = null;
      this.clientSessions.set(clientId, { roomCode: room.roomCode, sessionToken: seat.sessionToken });
      this.promoteConnectedHostIfNeeded(room);

      if (room.match && seat.playerId !== null) {
        const player = room.match.players.find((p) => p.id === seat.playerId);
        if (player) {
          player.onlineConnected = true;
          room.match.missedTurnsByPlayer[player.id] = 0;
          delete room.match.lastMissedTurnCountByPlayer[player.id];
          if (player.onlineBotTakeover && !player.bankrupt) {
            player.isBot = false;
            player.onlineBotTakeover = false;
            const current = room.match.players[room.match.activePlayerIndex];
            if (current?.id === player.id) {
              this.clearBotActionTimer(room);
              if (
                room.match.turnPhase !== 'ROLLING_DICE' &&
                room.match.turnPhase !== 'MOVING_TOKEN' &&
                room.match.turnPhase !== 'GAME_OVER'
              ) {
                this.ensureSubPhaseTimeFloor(room.match, 18);
              }
            }
            this.addLog(room, `🟢 ${player.name} đã kết nối lại ván đấu!`, player.color, 'positive');
          }
        }
      }

      this.sendMessage(clientId, {
        type: 'ROOM_JOINED',
        roomCode: room.roomCode,
        sessionToken: seat.sessionToken,
        yourParticipantId: seat.participantId,
        yourSeatIndex: seat.seatIndex,
        yourPlayerId: seat.playerId,
        snapshot: this.buildRoomSnapshot(room, seat.participantId),
      });
      this.broadcastSnapshot(room);
      return;
    }

    // All remaining messages require an active room membership
    const session = this.clientSessions.get(clientId);
    if (!session) {
      this.sendError(clientId, 'NOT_IN_ROOM', 'Bạn chưa tham gia phòng nào.');
      return;
    }
    const room = this.rooms.get(session.roomCode);
    if (!room) {
      this.clientSessions.delete(clientId);
      this.lastEmoteAtByClient.delete(clientId);
      this.lastChatAtByClient.delete(clientId);
      this.sendError(clientId, 'ROOM_NOT_FOUND', 'Phòng không còn tồn tại.');
      return;
    }
    const seat = room.humans.find((h) => h.sessionToken === session.sessionToken);
    if (!seat) {
      this.clientSessions.delete(clientId);
      this.lastEmoteAtByClient.delete(clientId);
      this.lastChatAtByClient.delete(clientId);
      this.sendError(clientId, 'SESSION_EXPIRED', 'Không tìm thấy vị trí của bạn trong phòng.');
      return;
    }

    if (msg.type === 'LEAVE_ROOM') {
      this.handleExplicitLeave(room, seat, clientId);
      return;
    }

    if (msg.type === 'UPDATE_LOBBY_SETTINGS') {
      if (seat.seatIndex !== room.hostSeatIndex) {
        this.sendError(clientId, 'FORBIDDEN', 'Chỉ chủ phòng mới có thể thay đổi cài đặt.');
        return;
      }
      if (room.status !== 'lobby') {
        this.sendError(clientId, 'INVALID_STATE', 'Không thể đổi cài đặt khi ván đấu đang diễn ra.');
        return;
      }

      const prevMatchMode = room.matchMode;
      const prevMaxPlayers = room.maxPlayers;
      const prevStartingCash = room.startingCash;
      const prevFillBots = room.fillBots;
      const prevTacticalDice = room.tacticalDiceEnabled;
      const prevFestival = room.festivalEnabled;
      const prevBotDifficulty = room.botDifficulty;

      const nextMatchMode =
        msg.matchMode !== undefined ? normalizeMatchMode(msg.matchMode) : room.matchMode;
      let nextMaxPlayers = room.maxPlayers;
      if (nextMatchMode === 'TEAMS_2V2') {
        nextMaxPlayers = 4;
      } else if (msg.maxPlayers !== undefined) {
        nextMaxPlayers = normalizeMaxPlayers(msg.maxPlayers);
      }

      if (nextMaxPlayers < room.humans.length) {
        this.sendError(
          clientId,
          'INVALID_MAX_PLAYERS',
          'Số người tối đa không thể nhỏ hơn số người đang có mặt trong phòng.'
        );
        return;
      }

      room.matchMode = nextMatchMode;
      if (nextMaxPlayers !== room.maxPlayers) {
        room.maxPlayers = nextMaxPlayers;
        // Compact seats downward if any human currently sits at >= nextMaxPlayers
        const sorted = [...room.humans].sort((a, b) => a.seatIndex - b.seatIndex);
        for (const h of sorted) {
          if (h.seatIndex >= nextMaxPlayers) {
            for (let s = 0; s < nextMaxPlayers; s++) {
              if (!room.humans.some((other) => other !== h && other.seatIndex === s)) {
                const wasHost = h.seatIndex === room.hostSeatIndex;
                h.seatIndex = s;
                if (wasHost) room.hostSeatIndex = s;
                break;
              }
            }
          }
        }
        if (
          room.pendingSeatSwap &&
          (room.pendingSeatSwap.fromSeatIndex >= nextMaxPlayers ||
            room.pendingSeatSwap.toSeatIndex >= nextMaxPlayers)
        ) {
          this.clearPendingSeatSwap(room);
        }
      }

      if (msg.startingCash !== undefined) {
        room.startingCash = normalizeStartingCash(msg.startingCash);
      }
      if (msg.fillBots !== undefined) {
        room.fillBots = Boolean(msg.fillBots);
      }
      if (msg.tacticalDiceEnabled !== undefined) {
        room.tacticalDiceEnabled = Boolean(msg.tacticalDiceEnabled);
      }
      if (msg.festivalEnabled !== undefined) {
        room.festivalEnabled = Boolean(msg.festivalEnabled);
      }
      if (msg.botDifficulty !== undefined) {
        room.botDifficulty = normalizeBotDifficulty(msg.botDifficulty);
      }

      const rulesChanged =
        room.matchMode !== prevMatchMode ||
        room.maxPlayers !== prevMaxPlayers ||
        room.startingCash !== prevStartingCash ||
        room.fillBots !== prevFillBots ||
        room.tacticalDiceEnabled !== prevTacticalDice ||
        room.festivalEnabled !== prevFestival ||
        room.botDifficulty !== prevBotDifficulty;

      if (rulesChanged) {
        for (const h of room.humans) {
          h.ready = h.seatIndex === room.hostSeatIndex;
        }
        this.appendSystemLobbyChat(
          room,
          '⚙️ Chủ phòng đã thay đổi cài đặt luật — các khách cần Sẵn sàng lại.'
        );
      }
      this.broadcastSnapshot(room);
      return;
    }

    if (msg.type === 'MOVE_TO_SEAT') {
      if (room.status !== 'lobby' || seat.explicitlyLeft) {
        this.sendError(clientId, 'INVALID_STATE', 'Chỉ có thể đổi ghế ở sảnh chờ.');
        return;
      }
      const targetSeatIndex = msg.targetSeatIndex;
      if (!this.isValidLobbySeatIndex(room, targetSeatIndex)) {
        this.sendError(clientId, 'BAD_MESSAGE', 'Vị trí ghế mục tiêu không hợp lệ.');
        return;
      }
      if (seat.seatIndex === targetSeatIndex) {
        return;
      }
      const occupied = room.humans.some(
        (h) => h !== seat && !h.explicitlyLeft && h.seatIndex === targetSeatIndex
      );
      if (occupied) {
        this.sendError(
          clientId,
          'SEAT_OCCUPIED',
          'Ghế này đã có người chơi khác. Hãy gửi lời mời đổi ghế.'
        );
        return;
      }
      const prevSeatIndex = seat.seatIndex;
      this.swapLobbySeatAssignments(room, prevSeatIndex, targetSeatIndex);
      if (
        room.pendingSeatSwap &&
        (room.pendingSeatSwap.fromParticipantId === seat.participantId ||
          room.pendingSeatSwap.toParticipantId === seat.participantId ||
          room.pendingSeatSwap.fromSeatIndex === prevSeatIndex ||
          room.pendingSeatSwap.toSeatIndex === prevSeatIndex ||
          room.pendingSeatSwap.fromSeatIndex === targetSeatIndex ||
          room.pendingSeatSwap.toSeatIndex === targetSeatIndex)
      ) {
        this.clearPendingSeatSwap(room);
      }
      this.broadcastSnapshot(room);
      return;
    }

    if (msg.type === 'REQUEST_SEAT_SWAP') {
      if (room.status !== 'lobby' || seat.explicitlyLeft) {
        this.sendError(clientId, 'INVALID_STATE', 'Chỉ có thể mời đổi ghế ở sảnh chờ.');
        return;
      }
      const targetSeatIndex = msg.targetSeatIndex;
      if (!this.isValidLobbySeatIndex(room, targetSeatIndex)) {
        this.sendError(clientId, 'BAD_MESSAGE', 'Vị trí ghế mục tiêu không hợp lệ.');
        return;
      }
      if (targetSeatIndex === seat.seatIndex) {
        this.sendError(clientId, 'BAD_MESSAGE', 'Không thể gửi lời mời đổi ghế cho chính mình.');
        return;
      }
      if (room.pendingSeatSwap) {
        this.sendError(
          clientId,
          'SWAP_PENDING',
          'Đang có một lời mời đổi ghế chờ phản hồi trong phòng.'
        );
        return;
      }
      const target = room.humans.find(
        (h) => !h.explicitlyLeft && h.seatIndex === targetSeatIndex
      );
      if (!target) {
        this.sendError(
          clientId,
          'SEAT_EMPTY',
          'Ghế này đang trống, bạn có thể chuyển sang trực tiếp.'
        );
        return;
      }
      if (!target.connected) {
        this.sendError(clientId, 'TARGET_OFFLINE', 'Người chơi ở ghế này đang mất kết nối.');
        return;
      }

      const requestId = `swap_${crypto.randomBytes(6).toString('hex')}`;
      const expiresAt = Date.now() + SEAT_SWAP_EXPIRY_MS;
      const timer = this.scheduleRoomTimeout(room, SEAT_SWAP_EXPIRY_MS, () => {
        if (
          room.status === 'lobby' &&
          room.pendingSeatSwap &&
          room.pendingSeatSwap.requestId === requestId
        ) {
          room.pendingSeatSwap = null;
          this.broadcastSnapshot(room);
        }
      });
      room.pendingSeatSwap = {
        requestId,
        fromParticipantId: seat.participantId,
        fromSeatIndex: seat.seatIndex,
        fromPlayerName: seat.playerName,
        toParticipantId: target.participantId,
        toSeatIndex: target.seatIndex,
        expiresAt,
        timer,
      };
      this.broadcastSnapshot(room);
      return;
    }

    if (msg.type === 'RESPOND_SEAT_SWAP') {
      if (room.status !== 'lobby' || seat.explicitlyLeft) {
        this.sendError(clientId, 'INVALID_STATE', 'Chỉ có thể phản hồi đổi ghế ở sảnh chờ.');
        return;
      }
      const pending = room.pendingSeatSwap;
      if (!pending) {
        this.sendError(clientId, 'SWAP_EXPIRED', 'Lời mời đổi ghế không tồn tại hoặc đã hết hạn.');
        return;
      }
      if (typeof msg.requestId !== 'string' || msg.requestId !== pending.requestId) {
        this.sendError(clientId, 'SWAP_EXPIRED', 'Mã lời mời đổi ghế không khớp hoặc đã hết hạn.');
        return;
      }
      if (Date.now() > pending.expiresAt) {
        this.clearPendingSeatSwap(room);
        this.broadcastSnapshot(room);
        this.sendError(clientId, 'SWAP_EXPIRED', 'Lời mời đổi ghế đã hết hạn.');
        return;
      }
      if (seat.participantId !== pending.toParticipantId) {
        this.sendError(clientId, 'FORBIDDEN', 'Chỉ người được mời mới có thể phản hồi đổi ghế.');
        return;
      }

      this.clearPendingSeatSwap(room);
      if (msg.accept === true) {
        const fromSeat = room.humans.find(
          (h) => !h.explicitlyLeft && h.participantId === pending.fromParticipantId
        );
        const toSeat = room.humans.find(
          (h) => !h.explicitlyLeft && h.participantId === pending.toParticipantId
        );
        if (!fromSeat || !toSeat) {
          this.sendError(clientId, 'INVALID_STATE', 'Người chơi đổi ghế không còn trong phòng.');
          this.broadcastSnapshot(room);
          return;
        }
        this.swapLobbySeatAssignments(room, fromSeat.seatIndex, toSeat.seatIndex);
      }
      this.broadcastSnapshot(room);
      return;
    }

    if (msg.type === 'HOST_SWAP_SEATS') {
      if (seat.seatIndex !== room.hostSeatIndex) {
        this.sendError(clientId, 'FORBIDDEN', 'Chỉ chủ phòng mới có thể sắp xếp lại vị trí ghế.');
        return;
      }
      if (room.status !== 'lobby') {
        this.sendError(clientId, 'INVALID_STATE', 'Chỉ có thể sắp xếp ghế ở sảnh chờ.');
        return;
      }
      const { seatA, seatB } = msg;
      if (
        !this.isValidLobbySeatIndex(room, seatA) ||
        !this.isValidLobbySeatIndex(room, seatB) ||
        seatA === seatB
      ) {
        this.sendError(clientId, 'BAD_MESSAGE', 'Cặp ghế cần hoán đổi không hợp lệ.');
        return;
      }
      this.swapLobbySeatAssignments(room, seatA, seatB);
      if (
        room.pendingSeatSwap &&
        (room.pendingSeatSwap.fromSeatIndex === seatA ||
          room.pendingSeatSwap.fromSeatIndex === seatB ||
          room.pendingSeatSwap.toSeatIndex === seatA ||
          room.pendingSeatSwap.toSeatIndex === seatB)
      ) {
        this.clearPendingSeatSwap(room);
      }
      this.broadcastSnapshot(room);
      return;
    }

    if (msg.type === 'SET_READY') {
      if (room.status !== 'lobby' || seat.explicitlyLeft) {
        this.sendError(
          clientId,
          'INVALID_STATE',
          'Chỉ có thể thay đổi trạng thái sẵn sàng ở sảnh chờ.'
        );
        return;
      }
      if (seat.seatIndex === room.hostSeatIndex) {
        seat.ready = true;
        this.broadcastSnapshot(room);
        return;
      }
      seat.ready = Boolean(msg.ready);
      this.broadcastSnapshot(room);
      return;
    }

    if (msg.type === 'UPDATE_MY_PROFILE') {
      if (room.status !== 'lobby') {
        this.sendError(clientId, 'INVALID_STATE', 'Chỉ có thể đổi tên/nhân vật ở sảnh chờ.');
        return;
      }
      if (msg.playerName !== undefined) {
        seat.playerName = sanitizePlayerName(msg.playerName, seat.playerName);
      }
      if (msg.tokenType !== undefined && isTokenArchetype(msg.tokenType)) {
        const conflict = room.humans.some(
          (h) => h !== seat && h.tokenType === msg.tokenType
        );
        if (conflict) {
          this.sendError(clientId, 'TOKEN_TAKEN', 'Nhân vật này đã có người chơi khác chọn!');
          return;
        }
        seat.tokenType = msg.tokenType;
      }
      this.broadcastSnapshot(room);
      return;
    }

    if (msg.type === 'START_MATCH') {
      if (seat.seatIndex !== room.hostSeatIndex) {
        this.sendError(clientId, 'FORBIDDEN', 'Chỉ chủ phòng mới có thể bắt đầu ván đấu.');
        return;
      }
      if (room.status !== 'lobby') {
        this.sendError(clientId, 'INVALID_STATE', 'Ván đấu đã được bắt đầu rồi.');
        return;
      }
      this.startMatch(room, clientId);
      return;
    }

    if (msg.type === 'RETURN_TO_LOBBY') {
      if (seat.seatIndex !== room.hostSeatIndex) {
        this.sendError(clientId, 'FORBIDDEN', 'Chỉ chủ phòng mới có thể mở sảnh chờ mới.');
        return;
      }
      if (room.status !== 'gameover') {
        this.sendError(
          clientId,
          'INVALID_STATE',
          'Chỉ có thể quay lại sảnh chờ sau khi ván đấu kết thúc.'
        );
        return;
      }
      this.returnRoomToLobby(room);
      return;
    }

    if (msg.type === 'RECLAIM_CONTROL') {
      if (room.status !== 'playing' || !room.match || seat.playerId === null || seat.explicitlyLeft) {
        this.sendError(clientId, 'INVALID_STATE', 'Không thể lấy lại quyền điều khiển lúc này.');
        return;
      }
      const player = room.match.players.find((p) => p.id === seat.playerId);
      if (!player || player.bankrupt || !player.onlineBotTakeover) {
        this.sendError(
          clientId,
          'INVALID_STATE',
          'Bạn đang tự điều khiển hoặc nhân vật không còn trong ván đấu.'
        );
        return;
      }
      player.isBot = false;
      player.onlineBotTakeover = false;
      player.onlineConnected = true;
      room.match.missedTurnsByPlayer[player.id] = 0;
      delete room.match.lastMissedTurnCountByPlayer[player.id];
      room.match.lastHumanActionTurnCountByPlayer[player.id] = room.match.turnCount;

      const current = room.match.players[room.match.activePlayerIndex];
      if (current?.id === player.id) {
        this.clearBotActionTimer(room);
        if (
          room.match.turnPhase !== 'ROLLING_DICE' &&
          room.match.turnPhase !== 'MOVING_TOKEN' &&
          room.match.turnPhase !== 'GAME_OVER'
        ) {
          this.ensureSubPhaseTimeFloor(room.match, 18);
        }
      }
      this.addLog(
        room,
        `🙋 ${player.name} đã lấy lại quyền điều khiển từ Bot AI!`,
        player.color,
        'positive'
      );
      this.broadcastSnapshot(room);
      return;
    }

    if (msg.type === 'SEND_EMOTE') {
      if (room.status !== 'playing' || !room.match || seat.playerId === null) return;
      if (typeof msg.emoteText !== 'string') {
        this.sendError(clientId, 'BAD_MESSAGE', 'Biểu cảm không hợp lệ.');
        return;
      }
      const emoteText = msg.emoteText.replace(/\s+/g, ' ').trim().slice(0, 48);
      if (!emoteText) return;
      const now = Date.now();
      const lastEmoteAt = this.lastEmoteAtByClient.get(clientId) ?? 0;
      if (now - lastEmoteAt < EMOTE_COOLDOWN_MS) {
        this.sendError(clientId, 'RATE_LIMITED', 'Bạn gửi biểu cảm quá nhanh.');
        return;
      }
      this.lastEmoteAtByClient.set(clientId, now);
      this.emitVisualEvent(room, {
        kind: 'PLAYER_EMOTE',
        playerId: seat.playerId,
        playerName: seat.playerName,
        emoteText,
      });
      return;
    }

    if (msg.type === 'SEND_CHAT_MESSAGE') {
      if (seat.explicitlyLeft) return;
      if (typeof msg.text !== 'string') {
        this.sendError(clientId, 'BAD_MESSAGE', 'Nội dung tin nhắn không hợp lệ.');
        return;
      }
      const text = msg.text.replace(/\s+/g, ' ').trim().slice(0, MAX_CHAT_LENGTH);
      if (!text) return;

      const now = Date.now();
      const lastChatAt = this.lastChatAtByClient.get(clientId);
      if (lastChatAt !== undefined && now - lastChatAt < CHAT_COOLDOWN_MS) {
        this.sendError(clientId, 'RATE_LIMITED', 'Bạn gửi tin nhắn quá nhanh.');
        return;
      }
      this.lastChatAtByClient.set(clientId, now);

      const senderTeamId = this.getSeatTeamId(room, seat);
      const channel: ChatChannel =
        msg.channel === 'TEAM' && room.matchMode === 'TEAMS_2V2' && senderTeamId !== undefined
          ? 'TEAM'
          : 'ALL';

      const chatMessage: RoomChatMessage = {
        id: room.nextChatId++,
        participantId: seat.participantId,
        playerId: seat.playerId,
        senderName: seat.playerName,
        senderColor: TOKEN_COLORS[seat.tokenType].color,
        role: 'player',
        channel,
        ...(channel === 'TEAM' ? { teamId: senderTeamId } : {}),
        text,
        createdAt: now,
      };

      if (channel === 'TEAM' && senderTeamId !== undefined) {
        const teamHistory = room.teamChatHistory[senderTeamId];
        teamHistory.push(chatMessage);
        if (teamHistory.length > MAX_TEAM_CHAT_HISTORY) {
          teamHistory.splice(0, teamHistory.length - MAX_TEAM_CHAT_HISTORY);
        }
        this.emitVisualEvent(
          room,
          { kind: 'CHAT_MESSAGE', message: chatMessage },
          { teamId: senderTeamId }
        );
      } else {
        room.allChatHistory.push(chatMessage);
        if (room.allChatHistory.length > MAX_ALL_CHAT_HISTORY) {
          room.allChatHistory.splice(0, room.allChatHistory.length - MAX_ALL_CHAT_HISTORY);
        }
        this.emitVisualEvent(room, { kind: 'CHAT_MESSAGE', message: chatMessage });
      }
      return;
    }

    if (msg.type === 'RTC_SIGNAL') {
      if (seat.explicitlyLeft) return;
      if (
        typeof msg.targetParticipantId !== 'string' ||
        !msg.targetParticipantId.trim() ||
        msg.targetParticipantId === seat.participantId ||
        !isValidRtcSignalPayload(msg.signal)
      ) {
        this.sendError(clientId, 'BAD_MESSAGE', 'Tín hiệu kết nối thoại không hợp lệ.');
        return;
      }

      const target = room.humans.find(
        (h) =>
          h.participantId === msg.targetParticipantId &&
          !h.explicitlyLeft &&
          h.connected &&
          Boolean(h.clientId)
      );
      if (!target || !target.clientId) {
        this.sendError(clientId, 'TARGET_NOT_FOUND', 'Không tìm thấy thành viên nhận tín hiệu.');
        return;
      }

      this.sendMessage(target.clientId, {
        type: 'RTC_SIGNAL',
        fromParticipantId: seat.participantId,
        signal: msg.signal,
      });
      return;
    }

    if (msg.type === 'UPDATE_VOICE_STATE') {
      if (seat.explicitlyLeft) return;
      seat.micEnabled = Boolean(msg.micEnabled);
      this.broadcastSnapshot(room);
      return;
    }

    if (msg.type === 'GAME_ACTION') {
      if (
        !msg.action ||
        typeof msg.action !== 'object' ||
        Array.isArray(msg.action) ||
        typeof (msg.action as { kind?: unknown }).kind !== 'string'
      ) {
        this.sendError(clientId, 'BAD_MESSAGE', 'Hành động trò chơi không hợp lệ.');
        return;
      }
      this.handleHumanGameAction(room, seat, clientId, msg.action, {
        expectedTurnCount: msg.expectedTurnCount,
        expectedPhase: msg.expectedPhase,
        expectedDecisionRevision: msg.expectedDecisionRevision,
        actionId: msg.actionId,
      });
    }
  }

  public handleDisconnect(clientId: string): void {
    this.lastEmoteAtByClient.delete(clientId);
    this.lastChatAtByClient.delete(clientId);
    this.detachClientIfAny(clientId, true);
  }

  private detachClientIfAny(clientId: string, scheduleGraceCleanup: boolean): void {
    const session = this.clientSessions.get(clientId);
    if (!session) return;
    this.clientSessions.delete(clientId);

    const room = this.rooms.get(session.roomCode);
    if (!room) return;
    const seat = room.humans.find((h) => h.sessionToken === session.sessionToken);
    if (!seat || seat.clientId !== clientId) return;

    seat.clientId = null;
    seat.connected = false;
    seat.micEnabled = false;
    seat.disconnectedAt = Date.now();

    if (room.match && seat.playerId !== null) {
      const player = room.match.players.find((p) => p.id === seat.playerId);
      if (player) {
        player.onlineConnected = false;
      }
    }

    // Promote another connected human to host if host disconnected (lobby, playing, or gameover)
    if (room.status === 'lobby' || room.status === 'playing' || room.status === 'gameover') {
      this.promoteConnectedHostIfNeeded(room);
    }

    if (
      room.status === 'lobby' &&
      room.pendingSeatSwap &&
      (room.pendingSeatSwap.fromParticipantId === seat.participantId ||
        room.pendingSeatSwap.toParticipantId === seat.participantId)
    ) {
      this.clearPendingSeatSwap(room);
    }

    this.broadcastSnapshot(room);

    if (scheduleGraceCleanup) {
      this.scheduleGraceCleanupIfEmpty(room);
    }
  }

  private handleExplicitLeave(room: RoomRecord, seat: HumanSeatRecord, clientId: string): void {
    this.clientSessions.delete(clientId);
    this.lastEmoteAtByClient.delete(clientId);
    this.lastChatAtByClient.delete(clientId);
    seat.micEnabled = false;
    this.sendMessage(clientId, { type: 'LEFT_ROOM' });

    if (room.status === 'lobby') {
      if (
        room.pendingSeatSwap &&
        (room.pendingSeatSwap.fromParticipantId === seat.participantId ||
          room.pendingSeatSwap.toParticipantId === seat.participantId)
      ) {
        this.clearPendingSeatSwap(room);
      }
      room.humans = room.humans.filter((h) => h !== seat);
      if (room.humans.length === 0) {
        this.clearRoomTimers(room);
        this.rooms.delete(room.roomCode);
        return;
      }
      if (seat.seatIndex === room.hostSeatIndex) {
        if (!this.promoteConnectedHostIfNeeded(room)) {
          const fallbackHost = [...room.humans].sort((a, b) => a.seatIndex - b.seatIndex)[0];
          if (fallbackHost) {
            room.hostSeatIndex = fallbackHost.seatIndex;
            fallbackHost.ready = true;
          }
        }
      }
      this.broadcastSnapshot(room);
      this.scheduleGraceCleanupIfEmpty(room);
      return;
    }

    // During playing / gameover: mark explicitly left and hand over seat to Bot AI
    seat.clientId = null;
    seat.connected = false;
    seat.explicitlyLeft = true;

    if (room.match && seat.playerId !== null) {
      const player = room.match.players.find((p) => p.id === seat.playerId);
      if (player && !player.bankrupt && !player.isBot) {
        player.onlineConnected = false;
        player.isBot = true;
        player.onlineBotTakeover = true;
        this.addLog(
          room,
          `🚪 ${player.name} đã rời phòng — Bot AI tiếp quản phần còn lại.`,
          player.color,
          'neutral'
        );
      }
    }

    const remainingHumans = room.humans.filter((h) => !h.explicitlyLeft);
    if (remainingHumans.length === 0) {
      this.clearRoomTimers(room);
      this.rooms.delete(room.roomCode);
      return;
    }

    this.promoteConnectedHostIfNeeded(room);
    this.scheduleGraceCleanupIfEmpty(room);

    this.broadcastSnapshot(room);
    if (room.status === 'playing') {
      this.scheduleBotTurnIfNeeded(room);
    }
  }

  private returnRoomToLobby(room: RoomRecord): void {
    room.matchEpoch += 1;
    this.clearRoomTimers(room);
    room.status = 'lobby';
    room.match = null;
    room.humans = room.humans.filter((h) => !h.explicitlyLeft);
    for (const h of room.humans) {
      h.playerId = null;
    }
    if (room.humans.length === 0) {
      this.rooms.delete(room.roomCode);
      return;
    }
    if (!this.promoteConnectedHostIfNeeded(room)) {
      if (!room.humans.some((h) => h.seatIndex === room.hostSeatIndex)) {
        room.hostSeatIndex = [...room.humans].sort((a, b) => a.seatIndex - b.seatIndex)[0].seatIndex;
      }
    }
    for (const h of room.humans) {
      h.ready = h.seatIndex === room.hostSeatIndex;
    }
    this.scheduleGraceCleanupIfEmpty(room);
    this.broadcastSnapshot(room);
  }

  private startMatch(room: RoomRecord, requesterClientId: string): void {
    const orderedHumans = [...room.humans]
      .filter((h) => !h.explicitlyLeft)
      .sort((a, b) => a.seatIndex - b.seatIndex);

    const botSlotsNeeded = room.fillBots ? Math.max(0, room.maxPlayers - orderedHumans.length) : 0;
    const totalCount = orderedHumans.length + botSlotsNeeded;

    if (room.matchMode === 'TEAMS_2V2' && totalCount < 4) {
      this.sendError(
        requesterClientId,
        'NOT_ENOUGH_PLAYERS',
        'Chế độ Đấu Đội 2v2 yêu cầu đủ 4 người chơi (hoặc bật "Bù Bot AI")!'
      );
      return;
    }

    if (totalCount < 2) {
      this.sendError(
        requesterClientId,
        'NOT_ENOUGH_PLAYERS',
        'Cần ít nhất 2 người chơi (hoặc bật "Bù Bot AI") để bắt đầu ván đấu!'
      );
      return;
    }

    const unreadyGuest = orderedHumans.find(
      (h) => h.connected && h.seatIndex !== room.hostSeatIndex && !h.ready
    );
    if (unreadyGuest) {
      this.sendError(requesterClientId, 'GUESTS_NOT_READY', 'Vẫn còn người chơi chưa nhấn Sẵn sàng!');
      return;
    }

    room.matchEpoch += 1;
    this.clearRoomTimers(room);

    const players: PlayerState[] = [];
    const usedTokens = new Set<TokenArchetype>(orderedHumans.map((h) => h.tokenType));
    const humanBySeat = new Map<number, HumanSeatRecord>();
    for (const h of orderedHumans) {
      humanBySeat.set(h.seatIndex, h);
    }
    const remainingTokens = ALL_TOKENS.filter((t) => !usedTokens.has(t));
    let botTokenIdx = 0;

    for (let seatIdx = 0; seatIdx < room.maxPlayers; seatIdx++) {
      const h = humanBySeat.get(seatIdx);
      const teamId = room.matchMode === 'TEAMS_2V2' ? ((seatIdx % 2) as TeamId) : undefined;

      if (h) {
        const id = players.length;
        const meta = TOKEN_COLORS[h.tokenType];
        h.playerId = id;
        players.push({
          id,
          name: h.playerName,
          isBot: false,
          color: meta.color,
          colorName: meta.colorName,
          tokenType: h.tokenType,
          cash: room.startingCash,
          position: 0,
          laps: 0,
          inJail: false,
          jailTurns: 0,
          jailFreeCards: 0,
          doublesStreak: 0,
          pendingWorldTour: false,
          bankrupt: false,
          teamId,
          evenOddCharges: room.tacticalDiceEnabled ? DEFAULT_EVEN_ODD_CHARGES : 0,
          rerollCharges: room.tacticalDiceEnabled ? DEFAULT_REROLL_CHARGES : 0,
          onlineConnected: h.connected,
          onlineBotTakeover: false,
        });
      } else if (room.fillBots) {
        const id = players.length;
        const tok = remainingTokens[botTokenIdx++] || ALL_TOKENS[seatIdx % ALL_TOKENS.length];
        const meta = TOKEN_COLORS[tok];
        const persona = CHARACTER_PERSONAS[tok];
        players.push({
          id,
          name: persona.botDefaultName,
          isBot: true,
          color: meta.color,
          colorName: meta.colorName,
          tokenType: tok,
          cash: room.startingCash,
          position: 0,
          laps: 0,
          inJail: false,
          jailTurns: 0,
          jailFreeCards: 0,
          doublesStreak: 0,
          pendingWorldTour: false,
          bankrupt: false,
          teamId,
          evenOddCharges: room.tacticalDiceEnabled ? DEFAULT_EVEN_ODD_CHARGES : 0,
          rerollCharges: room.tacticalDiceEnabled ? DEFAULT_REROLL_CHARGES : 0,
        });
      }
    }

    const initModifiers = createDefaultBoardModifiers(
      room.festivalEnabled ? DEFAULT_FESTIVAL_CITY_COUNT : 0
    );
    const festivalLogText = formatFestivalStartLog(initModifiers);
    const initLogs: GameLogEntry[] = [
      {
        id: 1,
        turn: 1,
        text: `Ván đấu Online Phòng ${room.roomCode} bắt đầu với ${players.length} tỷ phú (${room.matchMode === 'TEAMS_2V2' ? 'Đấu Đội 2v2' : 'Đấu Đơn FFA'}) · Ngân sách ${formatBusinessTourSpaced(room.startingCash)}!`,
        tone: 'highlight',
      },
    ];
    if (festivalLogText) {
      initLogs.unshift({
        id: 2,
        turn: 1,
        text: festivalLogText,
        tone: 'highlight',
      });
    }

    room.status = 'playing';
    room.match = {
      players,
      properties: createInitialProperties(),
      activePlayerIndex: 0,
      turnPhase: 'AWAIT_ROLL',
      turnCount: 1,
      decisionRevision: 1,
      processedActionIds: new Set<string>(),
      processedActionIdOrder: [],
      lastDice: null,
      lastDiceSum: 0,
      lastRentPaid: 0,
      boardModifiers: initModifiers,
      isFreeChampionship: false,
      pendingTacticalCard: null,
      turnTimeLeft: TURN_COUNTDOWN_SECONDS,
      matchTimeLeft: MATCH_DURATION_SECONDS,
      matchMode: room.matchMode,
      tacticalDiceEnabled: room.tacticalDiceEnabled,
      festivalEnabled: room.festivalEnabled,
      drawnCard: null,
      pendingDebt: null,
      pendingDebtQueue: [],
      debtReturnToPlayerIndex: null,
      matchWinnerResult: null,
      logs: initLogs,
      landingCueText: null,
      chanceDeck: shuffleCards(CHANCE_CARDS),
      nextLogId: initLogs.length + 1,
      missedTurnsByPlayer: {},
      lastMissedTurnCountByPlayer: {},
      lastHumanActionTurnCountByPlayer: {},
    };

    this.broadcastSnapshot(room);
    this.scheduleBotTurnIfNeeded(room);
  }

  private setTurnPhase(match: MatchRecord, nextPhase: TurnPhase): void {
    match.turnPhase = nextPhase;
    match.decisionRevision += 1;
  }

  private recordProcessedActionId(match: MatchRecord, actionId: string): void {
    if (match.processedActionIds.has(actionId)) return;
    match.processedActionIds.add(actionId);
    match.processedActionIdOrder.push(actionId);
    if (match.processedActionIdOrder.length > 256) {
      const oldest = match.processedActionIdOrder.shift();
      if (oldest) match.processedActionIds.delete(oldest);
    }
  }

  private handleHumanGameAction(
    room: RoomRecord,
    seat: HumanSeatRecord,
    clientId: string,
    action: OnlineGameAction,
    meta?: {
      expectedTurnCount?: unknown;
      expectedPhase?: unknown;
      expectedDecisionRevision?: unknown;
      actionId?: unknown;
    }
  ): void {
    const match = room.match;
    if (room.status !== 'playing' || !match || seat.playerId === null) {
      this.sendError(clientId, 'INVALID_STATE', 'Phòng chưa ở trạng thái đang chơi.');
      return;
    }

    const expectedTurnCount = meta?.expectedTurnCount;
    const expectedPhase = meta?.expectedPhase;
    const expectedDecisionRevision = meta?.expectedDecisionRevision;
    const actionId = meta?.actionId;

    if (
      expectedTurnCount !== undefined &&
      (typeof expectedTurnCount !== 'number' ||
        !Number.isInteger(expectedTurnCount) ||
        expectedTurnCount < 1)
    ) {
      this.sendError(clientId, 'BAD_MESSAGE', 'Thông tin lượt chơi kỳ vọng không hợp lệ.');
      return;
    }
    if (expectedPhase !== undefined && typeof expectedPhase !== 'string') {
      this.sendError(clientId, 'BAD_MESSAGE', 'Thông tin trạng thái kỳ vọng không hợp lệ.');
      return;
    }
    if (
      expectedDecisionRevision !== undefined &&
      (typeof expectedDecisionRevision !== 'number' ||
        !Number.isInteger(expectedDecisionRevision) ||
        expectedDecisionRevision < 1)
    ) {
      this.sendError(clientId, 'BAD_MESSAGE', 'Thông tin phiên quyết định không hợp lệ.');
      return;
    }
    if (
      actionId !== undefined &&
      (typeof actionId !== 'string' || actionId.trim().length === 0 || actionId.length > 64)
    ) {
      this.sendError(clientId, 'BAD_MESSAGE', 'Mã định danh hành động không hợp lệ.');
      return;
    }

    const scopedActionKey =
      typeof actionId === 'string' ? `${seat.playerId}:${actionId}` : null;
    if (scopedActionKey && match.processedActionIds.has(scopedActionKey)) {
      this.sendError(clientId, 'DUPLICATE_ACTION', 'Hành động này đã được xử lý trước đó.');
      return;
    }
    if (expectedTurnCount !== undefined && expectedTurnCount !== match.turnCount) {
      this.sendError(
        clientId,
        'STALE_ACTION',
        'Lượt chơi đã thay đổi, thao tác cũ đã được hủy.'
      );
      return;
    }

    const activePlayer = match.players[match.activePlayerIndex];
    if (!activePlayer || activePlayer.id !== seat.playerId) {
      this.sendError(clientId, 'NOT_YOUR_TURN', 'Chưa tới lượt của bạn.');
      return;
    }
    if (activePlayer.isBot || activePlayer.bankrupt) {
      this.sendError(clientId, 'BOT_CONTROLLED', 'Lượt này đang do Bot điều khiển.');
      return;
    }
    if (
      expectedDecisionRevision !== undefined &&
      expectedDecisionRevision !== match.decisionRevision
    ) {
      this.sendError(
        clientId,
        'STALE_ACTION',
        'Trạng thái quyết định đã thay đổi, thao tác cũ đã được hủy.'
      );
      return;
    }
    if (expectedPhase !== undefined && expectedPhase !== match.turnPhase) {
      this.sendError(
        clientId,
        'STALE_ACTION',
        'Trạng thái lượt đã thay đổi, thao tác cũ đã được hủy.'
      );
      return;
    }
    if (match.turnPhase === 'ROLLING_DICE' || match.turnPhase === 'MOVING_TOKEN') {
      this.sendError(clientId, 'INVALID_STATE', 'Trạng thái lượt vừa thay đổi, vui lòng thử lại.');
      return;
    }

    const actionTurnCount = match.turnCount;
    const accepted = this.executeAction(room, action, clientId);
    if (accepted) {
      if (scopedActionKey) {
        this.recordProcessedActionId(match, scopedActionKey);
      }
      match.missedTurnsByPlayer[activePlayer.id] = 0;
      delete match.lastMissedTurnCountByPlayer[activePlayer.id];
      match.lastHumanActionTurnCountByPlayer[activePlayer.id] = actionTurnCount;
    }
  }

  private executeAction(room: RoomRecord, action: OnlineGameAction, clientId?: string): boolean {
    const match = room.match;
    if (!match || room.status !== 'playing') {
      if (clientId) {
        this.sendError(clientId, 'INVALID_STATE', 'Phòng chưa ở trạng thái đang chơi.');
      }
      return false;
    }

    const activePlayer = match.players[match.activePlayerIndex];
    if (!activePlayer || activePlayer.bankrupt) {
      if (clientId) {
        this.sendError(clientId, 'INVALID_STATE', 'Trạng thái lượt vừa thay đổi, vui lòng thử lại.');
      }
      return false;
    }

    const rejectInvalidState = (): false => {
      if (clientId) {
        this.sendError(clientId, 'INVALID_STATE', 'Trạng thái lượt vừa thay đổi, vui lòng thử lại.');
      }
      return false;
    };

    switch (action.kind) {
      case 'ROLL_DICE': {
        if (match.turnPhase !== 'AWAIT_ROLL') return rejectInvalidState();
        const rawChoice = (action as { diceChoice?: unknown }).diceChoice;
        if (rawChoice !== undefined && !isValidTacticalDiceChoice(rawChoice)) {
          if (clientId) {
            this.sendError(clientId, 'INVALID_ACTION', 'Lựa chọn xúc xắc chiến thuật không hợp lệ.');
          }
          return false;
        }
        const choice: TacticalDiceChoice = rawChoice ?? 'NORMAL';
        if (choice === 'EVEN' || choice === 'ODD') {
          if (
            !match.tacticalDiceEnabled ||
            activePlayer.inJail ||
            (activePlayer.evenOddCharges ?? 0) <= 0
          ) {
            if (clientId) {
              this.sendError(clientId, 'INVALID_ACTION', 'Không thể dùng xúc xắc Chẵn/Lẻ lúc này.');
            }
            return false;
          }
        }
        void this.performRollDice(room, room.matchEpoch, choice);
        return true;
      }

      case 'REROLL_DICE':
        if (match.turnPhase !== 'REROLL_DECISION') return rejectInvalidState();
        if (
          !match.tacticalDiceEnabled ||
          activePlayer.inJail ||
          (activePlayer.rerollCharges ?? 0) <= 0
        ) {
          if (clientId) {
            this.sendError(clientId, 'INVALID_ACTION', 'Không thể đổ lại xúc xắc lúc này.');
          }
          return false;
        }
        void this.performRerollDice(room, room.matchEpoch);
        return true;

      case 'CONFIRM_ROLL_MOVE':
        if (match.turnPhase !== 'REROLL_DECISION') return rejectInvalidState();
        if (!match.lastDice) {
          if (clientId) {
            this.sendError(clientId, 'INVALID_ACTION', 'Không có kết quả xúc xắc để xác nhận di chuyển.');
          }
          return false;
        }
        void this.performConfirmRollMove(room, room.matchEpoch, false);
        return true;

      case 'PAY_JAIL_FINE':
        if (match.turnPhase !== 'AWAIT_ROLL') return rejectInvalidState();
        if (!activePlayer.inJail || activePlayer.cash < JAIL_FINE) {
          if (clientId) {
            this.sendError(clientId, 'INVALID_ACTION', 'Không thể nộp phạt rời Đảo Hoang lúc này.');
          }
          return false;
        }
        activePlayer.cash -= JAIL_FINE;
        activePlayer.inJail = false;
        activePlayer.jailTurns = 0;
        activePlayer.doublesStreak = 0;
        match.decisionRevision += 1;
        this.emitSound(room, 'cashPay');
        this.addLog(
          room,
          `${activePlayer.name} nộp phạt ${formatBusinessTourCompact(JAIL_FINE)} để rời khỏi Đảo Hoang ngay lập tức.`,
          activePlayer.color,
          'highlight'
        );
        if (activePlayer.isBot) {
          this.triggerBotQuip(
            room,
            buildBotPenaltyQuipPayload(activePlayer, 'Tiền chuộc rời Đảo Hoang', JAIL_FINE)
          );
        }
        this.broadcastSnapshot(room);
        this.scheduleBotTurnIfNeeded(room);
        return true;

      case 'USE_JAIL_CARD':
        if (match.turnPhase !== 'AWAIT_ROLL') return rejectInvalidState();
        if (!activePlayer.inJail || activePlayer.jailFreeCards <= 0) {
          if (clientId) {
            this.sendError(clientId, 'INVALID_ACTION', 'Không thể dùng Thẻ Thoát Đảo lúc này.');
          }
          return false;
        }
        activePlayer.jailFreeCards -= 1;
        activePlayer.inJail = false;
        activePlayer.jailTurns = 0;
        activePlayer.doublesStreak = 0;
        match.decisionRevision += 1;
        this.emitSound(room, 'cardDraw');
        this.addLog(
          room,
          `${activePlayer.name} sử dụng Thẻ Thoát Đảo để rời Đảo Hoang!`,
          activePlayer.color,
          'positive'
        );
        this.broadcastSnapshot(room);
        this.scheduleBotTurnIfNeeded(room);
        return true;

      case 'BUY_PROPERTY':
        if (match.turnPhase !== 'BUY_DECISION') return rejectInvalidState();
        return this.performBuyProperty(room, action.initialLevel, clientId);

      case 'SKIP_BUY':
        if (match.turnPhase !== 'BUY_DECISION') return rejectInvalidState();
        this.addLog(
          room,
          `${activePlayer.name} bỏ qua cơ hội mua ${BOARD_TILES[activePlayer.position]?.name || ''}.`,
          activePlayer.color
        );
        this.completeTurnAfterAction(room, activePlayer);
        return true;

      case 'UPGRADE_PROPERTY':
        if (match.turnPhase !== 'UPGRADE_DECISION') return rejectInvalidState();
        return this.performOnTileUpgrade(room, action.targetLevel, clientId);

      case 'SKIP_UPGRADE':
        if (match.turnPhase !== 'UPGRADE_DECISION') return rejectInvalidState();
        this.completeTurnAfterAction(room, activePlayer);
        return true;

      case 'CONFIRM_BUYOUT':
        if (match.turnPhase !== 'BUYOUT_DECISION') return rejectInvalidState();
        return this.performConfirmBuyout(room, clientId);

      case 'SKIP_BUYOUT':
        if (match.turnPhase !== 'BUYOUT_DECISION') return rejectInvalidState();
        this.completeTurnAfterAction(room, activePlayer);
        return true;

      case 'CONFIRM_CHAMPIONSHIP':
        if (match.turnPhase !== 'CHAMPIONSHIP_SELECTION') return rejectInvalidState();
        return this.performConfirmChampionship(room, action.targetTile, clientId);

      case 'SKIP_CHAMPIONSHIP':
        if (match.turnPhase !== 'CHAMPIONSHIP_SELECTION') return rejectInvalidState();
        match.isFreeChampionship = false;
        this.addLog(room, `${activePlayer.name} bỏ qua quyền đăng cai Cúp Quốc Gia.`, activePlayer.color);
        this.completeTurnAfterAction(room, activePlayer);
        return true;

      case 'SELECT_WORLD_TOUR': {
        if (match.turnPhase !== 'WORLD_TOUR') return rejectInvalidState();
        if (!isValidTileIndex(action.targetTile)) {
          if (clientId) {
            this.sendError(clientId, 'INVALID_ACTION', 'Ô đích Du Lịch Xuyên Việt không hợp lệ.');
          }
          return false;
        }
        if (action.targetTile !== WORLD_TOUR_TILE_INDEX) {
          const hasAnyValidTarget = BOARD_TILES.some((t) =>
            isValidWorldTourTarget(activePlayer, t.index, match.properties)
          );
          if (
            activePlayer.cash >= WORLD_TOUR_FEE &&
            hasAnyValidTarget &&
            !isValidWorldTourTarget(activePlayer, action.targetTile, match.properties)
          ) {
            if (clientId) {
              this.sendError(
                clientId,
                'INVALID_ACTION',
                'Chỉ có thể bay tới ô đất/khu nghỉ dưỡng trống hoặc thuộc sở hữu của bạn.'
              );
            }
            return false;
          }
        }
        void this.performWorldTour(room, action.targetTile, room.matchEpoch, clientId);
        return true;
      }

      case 'SKIP_WORLD_TOUR':
        if (match.turnPhase !== 'WORLD_TOUR') return rejectInvalidState();
        this.performSkipWorldTour(room);
        return true;

      case 'CONFIRM_CARD':
        if (match.turnPhase !== 'CARD_REVEAL' || !match.drawnCard) return rejectInvalidState();
        void this.performConfirmCard(room, room.matchEpoch);
        return true;

      case 'APPLY_TACTICAL_CARD':
        if (match.turnPhase !== 'CARD_TARGET_SELECTION' || !match.pendingTacticalCard) {
          return rejectInvalidState();
        }
        return this.performApplyTacticalCard(room, action.targetTile, clientId);

      case 'SKIP_TACTICAL_CARD':
        if (match.turnPhase !== 'CARD_TARGET_SELECTION') return rejectInvalidState();
        match.pendingTacticalCard = null;
        this.addLog(room, `${activePlayer.name} bỏ qua tác động của thẻ chiến thuật.`, activePlayer.color);
        this.completeTurnAfterAction(room, activePlayer);
        return true;

      case 'SELL_AND_PAY_DEBT':
        if (match.turnPhase !== 'DEBT_RESOLUTION' || !match.pendingDebt) {
          return rejectInvalidState();
        }
        return this.performSellAndPayDebt(room, action.tileIndicesToSell, clientId);

      case 'DECLARE_BANKRUPTCY':
        if (match.turnPhase !== 'DEBT_RESOLUTION') return rejectInvalidState();
        this.performDeclareBankruptcy(room);
        return true;

      default:
        if (clientId) {
          this.sendError(clientId, 'INVALID_ACTION', 'Hành động không hợp lệ.');
        }
        return false;
    }
  }

  private async performRollDice(
    room: RoomRecord,
    epoch: number,
    diceChoice: TacticalDiceChoice = 'NORMAL'
  ): Promise<void> {
    const match = room.match;
    if (!match || room.matchEpoch !== epoch) return;
    const player = match.players[match.activePlayerIndex];
    if (!player || player.bankrupt) return;

    let die1: number;
    let die2: number;
    if (
      match.tacticalDiceEnabled &&
      !player.inJail &&
      (diceChoice === 'EVEN' || diceChoice === 'ODD') &&
      (player.evenOddCharges ?? 0) > 0
    ) {
      player.evenOddCharges = Math.max(0, (player.evenOddCharges ?? 0) - 1);
      [die1, die2] = rollTacticalDicePair(diceChoice);
      this.addLog(
        room,
        `🎯 ${player.name} kích hoạt Xúc Xắc ${diceChoice === 'EVEN' ? 'CHẴN' : 'LẺ'} (còn ${player.evenOddCharges} lượt).`,
        player.color,
        'highlight'
      );
    } else {
      [die1, die2] = this.diceRng();
    }

    const sum = die1 + die2;
    match.lastDice = [die1, die2];
    match.lastDiceSum = sum;
    this.setTurnPhase(match, 'ROLLING_DICE');
    this.emitVisualEvent(room, { kind: 'DICE_ROLLED', playerId: player.id, die1, die2 });
    this.broadcastSnapshot(room);

    if (!(await this.waitRoomBeat(room, 1450, epoch))) return;

    if (player.inJail) {
      const isDoubles = die1 === die2;
      const outcome = resolveIslandRollOutcome(die1, die2, player.jailTurns);
      if (outcome.escaped) {
        this.addLog(
          room,
          isDoubles
            ? `${player.name} đổ ra đôi (${die1}-${die2}), thoát khỏi Đảo Hoang và tiến ${outcome.moveSteps} bước!`
            : `${player.name} hết ${MAX_JAIL_TURNS} lượt trên Đảo Hoang — được giải cứu miễn phí và tiến ${outcome.moveSteps} bước!`,
          player.color,
          'positive'
        );
        player.inJail = false;
        player.jailTurns = 0;
        player.doublesStreak = 0;
        await this.movePlayerStepsAndResolve(room, player, outcome.moveSteps, epoch);
      } else {
        this.addLog(
          room,
          `${player.name} đổ (${die1}-${die2}) không ra đôi, tiếp tục ở Đảo Hoang (${outcome.nextJailTurns}/${MAX_JAIL_TURNS}).`,
          player.color
        );
        player.jailTurns = outcome.nextJailTurns;
        player.doublesStreak = 0;
        this.completeTurnAfterAction(room, player);
      }
      return;
    }

    if (match.tacticalDiceEnabled && (player.rerollCharges ?? 0) > 0) {
      const isDoubles = die1 === die2;
      this.setTurnPhase(match, 'REROLL_DECISION');
      this.ensureSubPhaseTimeFloor(match, 12);
      this.addLog(
        room,
        `🎲 ${player.name} đổ được ${die1} + ${die2} = ${sum}${isDoubles ? ' (Ra đôi!)' : ''} — có thể Đổ lại (${player.rerollCharges} lượt) hoặc Xác nhận đi tiếp.`,
        player.color
      );
      this.broadcastSnapshot(room);
      this.scheduleBotTurnIfNeeded(room);
      return;
    }

    await this.commitDiceRollOutcome(room, player, die1, die2, epoch, false);
  }

  private async performRerollDice(room: RoomRecord, epoch: number): Promise<void> {
    const match = room.match;
    if (!match || room.matchEpoch !== epoch) return;
    const player = match.players[match.activePlayerIndex];
    if (!player || player.bankrupt) return;

    player.rerollCharges = Math.max(0, (player.rerollCharges ?? 0) - 1);
    const [die1, die2] = this.diceRng();
    const sum = die1 + die2;

    match.lastDice = [die1, die2];
    match.lastDiceSum = sum;
    this.setTurnPhase(match, 'ROLLING_DICE');
    this.addLog(
      room,
      `🔄 ${player.name} dùng Thẻ Đổ Lại Xúc Xắc (còn ${player.rerollCharges} lượt)!`,
      player.color,
      'highlight'
    );
    this.emitVisualEvent(room, { kind: 'DICE_ROLLED', playerId: player.id, die1, die2 });
    this.broadcastSnapshot(room);

    if (!(await this.waitRoomBeat(room, 1450, epoch))) return;

    await this.commitDiceRollOutcome(room, player, die1, die2, epoch, false);
  }

  private async performConfirmRollMove(
    room: RoomRecord,
    epoch: number,
    suppressDoubles: boolean,
    forceThirdDoubleJail = false
  ): Promise<void> {
    const match = room.match;
    if (!match || room.matchEpoch !== epoch || !match.lastDice) return;
    const player = match.players[match.activePlayerIndex];
    if (!player || player.bankrupt) return;
    const [die1, die2] = match.lastDice;
    await this.commitDiceRollOutcome(
      room,
      player,
      die1,
      die2,
      epoch,
      suppressDoubles,
      forceThirdDoubleJail
    );
  }

  private async commitDiceRollOutcome(
    room: RoomRecord,
    player: PlayerState,
    die1: number,
    die2: number,
    epoch: number,
    suppressDoubles: boolean,
    forceThirdDoubleJail = false
  ): Promise<void> {
    const match = room.match;
    if (!match || room.matchEpoch !== epoch) return;
    const sum = die1 + die2;
    const isDoubles = die1 === die2;

    if (forceThirdDoubleJail || (!suppressDoubles && isDoubles && player.doublesStreak + 1 >= 3)) {
      this.emitSound(room, 'jailAlert');
      this.addLog(
        room,
        `${player.name} đổ ra đôi 3 lần liên tiếp (${die1}-${die2}) — bị đưa thẳng ra Đảo Hoang!`,
        player.color,
        'negative'
      );
      this.setTurnPhase(match, 'MOVING_TOKEN');
      this.emitVisualEvent(room, {
        kind: 'TOKEN_MOVED',
        playerId: player.id,
        path: [LOST_ISLAND_TILE_INDEX],
        speedMultiplier: 1,
      });
      this.broadcastSnapshot(room);

      if (!(await this.waitRoomBeat(room, 650, epoch))) return;

      player.position = LOST_ISLAND_TILE_INDEX;
      player.inJail = true;
      player.jailTurns = 0;
      player.doublesStreak = 0;
      player.pendingWorldTour = false;
      this.completeTurnAfterAction(room, player);
      return;
    }

    if (suppressDoubles) {
      player.doublesStreak = 0;
    } else {
      player.doublesStreak = isDoubles ? player.doublesStreak + 1 : 0;
    }

    this.addLog(
      room,
      `${player.name} đổ xúc xắc được ${die1} + ${die2} = ${sum}${isDoubles && !suppressDoubles ? ' (Ra đôi!)' : ''}.`,
      player.color
    );

    await this.movePlayerStepsAndResolve(room, player, sum, epoch);
  }

  private async movePlayerStepsAndResolve(
    room: RoomRecord,
    player: PlayerState,
    moveSteps: number,
    epoch: number
  ): Promise<void> {
    const match = room.match;
    if (!match || room.matchEpoch !== epoch) return;

    const { path, finalTile, passedStart } = computeForwardSteps(player.position, moveSteps);
    this.setTurnPhase(match, 'MOVING_TOKEN');
    this.emitVisualEvent(room, {
      kind: 'TOKEN_MOVED',
      playerId: player.id,
      path,
      speedMultiplier: 1,
    });
    this.broadcastSnapshot(room);

    const { totalWaitMs } = computeTokenHopTiming(path.length, 1);
    if (!(await this.waitRoomBeat(room, totalWaitMs, epoch))) return;

    player.position = finalTile;
    if (passedStart) {
      player.cash += START_SALARY;
      player.laps += 1;
      this.emitSound(room, 'cashGain');
      this.addLog(
        room,
        `${player.name} đi qua ô BẮT ĐẦU, hoàn thành vòng mới và nhận +${formatBusinessTourCompact(START_SALARY)}!`,
        player.color,
        'positive'
      );
    }

    await this.resolveTileLanding(room, player, finalTile, epoch);
  }

  private async resolveTileLanding(
    room: RoomRecord,
    player: PlayerState,
    tileIndex: number,
    epoch: number
  ): Promise<void> {
    const match = room.match;
    if (!match || room.matchEpoch !== epoch) return;
    const tile = BOARD_TILES[tileIndex];
    if (!tile) return;

    if (tile.kind === TileKind.START) {
      this.completeTurnAfterAction(room, player);
      return;
    }

    if (tile.kind === TileKind.LOST_ISLAND) {
      this.emitSound(room, 'jailAlert');
      match.landingCueText = '🏝️ Dạt vào Đảo Hoang! (Bị kẹt tại đảo)';
      this.broadcastSnapshot(room);
      if (!(await this.waitRoomBeat(room, 650, epoch))) return;
      match.landingCueText = null;

      player.position = LOST_ISLAND_TILE_INDEX;
      player.inJail = true;
      player.jailTurns = 0;
      player.doublesStreak = 0;
      player.pendingWorldTour = false;
      this.addLog(
        room,
        `🏝️ ${player.name} dạt vào Đảo Hoang — mắc kẹt tại đảo (đổ đôi, dùng Thẻ Thoát Đảo hoặc nộp ${formatBusinessTourCompact(JAIL_FINE)} để rời đảo)!`,
        player.color,
        'negative'
      );
      this.completeTurnAfterAction(room, player);
      return;
    }

    if (tile.kind === TileKind.WORLD_CHAMPIONSHIPS) {
      const ownsCity = Object.values(match.properties).some(
        (pr) => pr.ownerId === player.id && BOARD_TILES[pr.tileIndex]?.kind === TileKind.PROPERTY
      );
      if (ownsCity) {
        this.addLog(
          room,
          `🏆 ${player.name} dừng tại ${tile.name} — chọn miễn phí 1 thành phố đăng cai (tăng hệ số thuê lũy tiến)!`,
          player.color,
          'highlight'
        );
        match.landingCueText = `🏆 ${tile.name} — Chọn thành phố đăng cai...`;
        this.broadcastSnapshot(room);
        if (!(await this.waitRoomBeat(room, 650, epoch))) return;
        match.landingCueText = null;
        match.isFreeChampionship = true;
        this.setTurnPhase(match, 'CHAMPIONSHIP_SELECTION');
        this.ensureSubPhaseTimeFloor(match, 18);
        this.broadcastSnapshot(room);
        this.scheduleBotTurnIfNeeded(room);
        return;
      }
      this.addLog(
        room,
        `${player.name} dừng tại ${tile.name} (cần sở hữu ít nhất 1 Thành phố để đăng cai).`,
        player.color
      );
      this.completeTurnAfterAction(room, player);
      return;
    }

    if (tile.kind === TileKind.WORLD_TOUR) {
      this.emitSound(room, 'cardDraw');
      match.landingCueText = '✈️ Đặt vé Du Lịch Xuyên Việt — Kích hoạt từ lượt tới!';
      this.broadcastSnapshot(room);
      if (!(await this.waitRoomBeat(room, 650, epoch))) return;
      match.landingCueText = null;
      player.pendingWorldTour = true;
      this.addLog(
        room,
        `✈️ ${player.name} dừng tại ${tile.name} — nhận vé bay vào đầu lượt tiếp theo (phí ${formatBusinessTourCompact(WORLD_TOUR_FEE)})!`,
        player.color,
        'highlight'
      );
      this.completeTurnAfterAction(room, player);
      return;
    }

    if (tile.kind === TileKind.TAX) {
      const tax = calculateTaxAmount(player.id, match.properties);
      if (tax <= 0) {
        this.addLog(
          room,
          `${player.name} dừng tại ${tile.name} nhưng chưa có bất động sản nào — miễn thuế (0K).`,
          player.color
        );
        this.completeTurnAfterAction(room, player);
        return;
      }
      match.landingCueText = `💸 ${tile.name}: 10% BĐS (-${formatBusinessTourCompact(tax)})`;
      this.broadcastSnapshot(room);
      if (!(await this.waitRoomBeat(room, 650, epoch))) return;
      match.landingCueText = null;
      this.applyPaymentOrDebt(room, player, tax, null, `${tile.name} (10% BĐS)`);
      return;
    }

    if (isPurchasableTile(tile)) {
      const prop = match.properties[tileIndex];
      if (!prop || prop.ownerId === null) {
        const price = tile.price || 0;
        if (player.cash < price) {
          match.landingCueText = `🏙️ ${tile.name} — Thiếu tiền mặt (${formatBusinessTourCompact(price)})`;
          this.broadcastSnapshot(room);
          if (!(await this.waitRoomBeat(room, 550, epoch))) return;
          match.landingCueText = null;
          this.addLog(
            room,
            `${player.name} dừng tại ${tile.name} nhưng không đủ ${formatBusinessTourCompact(price)} tiền mặt để mua.`,
            player.color
          );
          this.completeTurnAfterAction(room, player);
          return;
        }
        match.landingCueText = `🏙️ ${tile.name} — Đất trống (${formatBusinessTourCompact(price)})`;
        this.broadcastSnapshot(room);
        if (!(await this.waitRoomBeat(room, 650, epoch))) return;
        match.landingCueText = null;
        this.setTurnPhase(match, 'BUY_DECISION');
        this.ensureSubPhaseTimeFloor(match, 18);
        this.broadcastSnapshot(room);
        this.scheduleBotTurnIfNeeded(room);
        return;
      }

      if (prop.ownerId === player.id) {
        const upgradeCheck = canUpgradeProperty(player, tileIndex, match.properties, {
          isOnTileLanding: true,
        });
        if (upgradeCheck.allowed) {
          this.addLog(
            room,
            `${player.name} quay lại đô thị sở hữu ${tile.name} — mở quyền nâng cấp công trình!`,
            player.color,
            'highlight'
          );
          match.landingCueText = `🏗️ Ghé thăm ${tile.name} — Nâng cấp đô thị!`;
          this.broadcastSnapshot(room);
          if (!(await this.waitRoomBeat(room, 650, epoch))) return;
          match.landingCueText = null;
          this.setTurnPhase(match, 'UPGRADE_DECISION');
          this.ensureSubPhaseTimeFloor(match, 18);
          this.broadcastSnapshot(room);
          this.scheduleBotTurnIfNeeded(room);
          return;
        }
        this.addLog(
          room,
          tile.kind === TileKind.RESORT
            ? `${player.name} dừng nghỉ dưỡng tại khu du lịch sở hữu ${tile.name}.`
            : `${player.name} dừng tại đô thị sở hữu ${tile.name}.`,
          player.color
        );
        this.completeTurnAfterAction(room, player);
        return;
      }

      const owner = match.players.find((p) => p.id === prop.ownerId && !p.bankrupt);
      if (!owner) {
        this.completeTurnAfterAction(room, player);
        return;
      }

      if (match.matchMode === 'TEAMS_2V2' && areTeammates(player, owner)) {
        this.addLog(
          room,
          `🤝 ${player.name} ghé thăm ${tile.name} của đồng đội ${owner.name} — Miễn tiền thuê!`,
          player.color,
          'positive'
        );
        this.completeTurnAfterAction(room, player);
        return;
      }

      const wasOutage = Boolean(match.boardModifiers.outageTileIndices?.includes(tileIndex));
      if (wasOutage) {
        match.boardModifiers = clearTileOutage(match.boardModifiers, tileIndex);
        match.lastRentPaid = 0;
        match.landingCueText = `⚡ ${tile.name} đang mất điện — Miễn phí thuê (0K)!`;
        this.broadcastSnapshot(room);
        if (!(await this.waitRoomBeat(room, 580, epoch))) return;
        match.landingCueText = null;
        this.addLog(
          room,
          `⚡ ${tile.name} đang mất điện — ${player.name} được miễn tiền thuê 0K (điện lưới đã khôi phục sau lượt ghé)!`,
          player.color,
          'positive'
        );
        if (
          canBuyoutProperty(
            player,
            tileIndex,
            match.properties,
            match.boardModifiers,
            match.players,
            match.matchMode
          ).allowed
        ) {
          this.setTurnPhase(match, 'BUYOUT_DECISION');
          this.ensureSubPhaseTimeFloor(match, 18);
          this.broadcastSnapshot(room);
          this.scheduleBotTurnIfNeeded(room);
          return;
        }
        this.completeTurnAfterAction(room, player);
        return;
      }

      const rent = calculateRent(
        tileIndex,
        match.properties,
        match.boardModifiers,
        match.players,
        match.matchMode,
        player.id
      );
      match.lastRentPaid = rent;
      match.landingCueText = `🏨 Đất của ${owner.name}: ${tile.name} (-${formatBusinessTourCompact(rent)})`;
      this.broadcastSnapshot(room);
      if (!(await this.waitRoomBeat(room, 650, epoch))) return;
      match.landingCueText = null;
      this.applyPaymentOrDebt(room, player, rent, owner.id, tile.name, tileIndex);
      return;
    }

    if (tile.kind === TileKind.CHANCE) {
      match.landingCueText = '🍀 Ô Cơ Hội — Đang rút thẻ sự kiện...';
      this.broadcastSnapshot(room);
      if (!(await this.waitRoomBeat(room, 750, epoch))) return;
      match.landingCueText = null;

      if (match.chanceDeck.length === 0) {
        match.chanceDeck = shuffleCards(CHANCE_CARDS);
      }
      const card = match.chanceDeck.pop()!;
      this.emitSound(room, 'cardDraw');
      this.addLog(room, `${player.name} rút thẻ ${tile.name}: "${card.title}"`, player.color, 'highlight');
      match.drawnCard = card;
      this.setTurnPhase(match, 'CARD_REVEAL');
      this.ensureSubPhaseTimeFloor(match, 18);
      this.broadcastSnapshot(room);
      this.scheduleBotTurnIfNeeded(room);
      return;
    }

    this.completeTurnAfterAction(room, player);
  }

  private applyPaymentOrDebt(
    room: RoomRecord,
    payer: PlayerState,
    amount: number,
    creditorId: number | null,
    reason: string,
    originTileIndex?: number
  ): void {
    const match = room.match;
    if (!match) return;

    if (amount <= 0) {
      this.completeTurnAfterAction(room, payer);
      return;
    }

    const compactAmt = formatBusinessTourCompact(amount);

    if (payer.cash >= amount) {
      const creditor =
        creditorId !== null ? match.players.find((p) => p.id === creditorId) || null : null;
      payer.cash -= amount;
      if (creditor) {
        creditor.cash += amount;
        match.lastRentPaid = amount;
        this.addLog(
          room,
          `${payer.name} trả ${compactAmt} tiền thuê (${reason}) cho ${creditor.name}.`,
          payer.color,
          'negative'
        );
        if (creditor.isBot) {
          this.triggerBotQuip(
            room,
            buildBotRentCollectedQuipPayload(creditor, payer.name, payer.position, amount, match.properties)
          );
        } else if (payer.isBot && amount >= MIN_BIG_RENT_FOR_QUIP) {
          this.triggerBotQuip(
            room,
            buildBotPenaltyQuipPayload(payer, reason, amount, creditor.name)
          );
        }
      } else {
        this.addLog(room, `${payer.name} nộp ${compactAmt} (${reason}).`, payer.color, 'negative');
        if (payer.isBot) {
          this.triggerBotQuip(room, buildBotPenaltyQuipPayload(payer, reason, amount));
        }
      }
      this.emitSound(room, 'cashPay');

      if (
        originTileIndex !== undefined &&
        creditorId !== null &&
        canBuyoutProperty(
          payer,
          originTileIndex,
          match.properties,
          match.boardModifiers,
          match.players,
          match.matchMode
        ).allowed
      ) {
        this.setTurnPhase(match, 'BUYOUT_DECISION');
        this.ensureSubPhaseTimeFloor(match, 18);
        this.broadcastSnapshot(room);
        this.scheduleBotTurnIfNeeded(room);
        return;
      }

      this.completeTurnAfterAction(room, payer);
      return;
    }

    match.pendingDebt = {
      amount,
      creditorId,
      reason,
      originTileIndex,
    };

    const ownedCount = Object.values(match.properties).filter(
      (pr) => pr.ownerId === payer.id
    ).length;
    if (ownedCount === 0) {
      this.addLog(
        room,
        `${payer.name} thiếu tiền mặt để trả ${compactAmt} (${reason}) và không còn bất động sản nào để bán — tự động phá sản!`,
        payer.color,
        'negative'
      );
      this.performDeclareBankruptcy(room);
      return;
    }

    this.setTurnPhase(match, 'DEBT_RESOLUTION');
    this.ensureSubPhaseTimeFloor(match, 20);
    this.addLog(
      room,
      `${payer.name} thiếu tiền mặt để trả ${compactAmt} (${reason}) — cần bán tài sản hoặc phá sản!`,
      payer.color,
      'negative'
    );
    this.broadcastSnapshot(room);
    this.scheduleBotTurnIfNeeded(room);
  }

  private performBuyProperty(
    room: RoomRecord,
    requestedInitialLevel: number,
    clientId?: string
  ): boolean {
    const match = room.match;
    if (!match) return false;
    const player = match.players[match.activePlayerIndex];
    const tile = BOARD_TILES[player.position];
    if (!tile) {
      this.completeTurnAfterAction(room, player);
      return true;
    }

    const buyCheck = validateInitialPropertyPurchase(
      player,
      tile.index,
      requestedInitialLevel
    );
    if (!buyCheck.allowed) {
      if (clientId) {
        this.sendError(
          clientId,
          'INVALID_ACTION',
          buyCheck.reason || 'Không thể mua bất động sản theo mức đã chọn.'
        );
      }
      return false;
    }
    const { safeLevel, totalCost } = buyCheck;

    player.cash -= totalCost;
    match.properties[tile.index] = {
      tileIndex: tile.index,
      ownerId: player.id,
      level: safeLevel,
    };

    if (safeLevel > 0) {
      this.emitSound(room, 'buildHouse', safeLevel);
    } else {
      this.emitSound(room, 'buyProperty');
    }

    const compactCost = formatBusinessTourCompact(totalCost);
    this.addLog(
      room,
      safeLevel > 0
        ? `${player.name} mua ${tile.name} và xây ngay Nhà Cấp ${safeLevel} (-${compactCost})!`
        : `${player.name} mua thành công ${tile.name} với giá ${compactCost}!`,
      player.color,
      'positive'
    );

    if (player.isBot) {
      this.triggerBotQuip(
        room,
        buildBotBuyQuipPayload(player, tile.index, totalCost, match.properties, 'DIRECT')
      );
    }

    this.completeTurnAfterAction(room, player);
    return true;
  }

  private performOnTileUpgrade(
    room: RoomRecord,
    targetLevel: number,
    clientId?: string
  ): boolean {
    const match = room.match;
    if (!match) return false;
    const player = match.players[match.activePlayerIndex];
    const tileIndex = player.position;
    const prop = match.properties[tileIndex];

    if (!isValidUpgradeTargetLevel(targetLevel, prop?.level ?? -1)) {
      if (clientId) {
        this.sendError(clientId, 'INVALID_ACTION', 'Cấp độ nâng cấp không hợp lệ.');
      }
      return false;
    }

    const check = canUpgradeProperty(player, tileIndex, match.properties, {
      isOnTileLanding: true,
      targetLevel,
    });
    if (!check.allowed) {
      if (clientId) {
        this.sendError(clientId, 'INVALID_ACTION', check.reason || 'Không thể nâng cấp lên cấp này.');
      }
      return false;
    }

    player.cash -= check.cost;
    match.properties[tileIndex] = {
      ...match.properties[tileIndex],
      level: targetLevel,
    };
    this.emitSound(room, 'buildHouse', targetLevel);

    const tile = BOARD_TILES[tileIndex];
    const compactCost = formatBusinessTourCompact(check.cost);
    this.addLog(
      room,
      targetLevel === 4
        ? `${player.name} nâng cấp ${tile.name} lên KHÁCH SẠN BIỂU TƯỢNG (Cấp 4 ★ · Miễn mua lại, -${compactCost})!`
        : `${player.name} nâng cấp ${tile.name} lên Nhà Cấp ${targetLevel} (-${compactCost}).`,
      player.color,
      'positive'
    );
    this.completeTurnAfterAction(room, player);
    return true;
  }

  private performConfirmBuyout(room: RoomRecord, clientId?: string): boolean {
    const match = room.match;
    if (!match) return false;
    const buyer = match.players[match.activePlayerIndex];
    const tileIndex = buyer.position;
    const prop = match.properties[tileIndex];
    const check = canBuyoutProperty(
      buyer,
      tileIndex,
      match.properties,
      match.boardModifiers,
      match.players,
      match.matchMode
    );
    if (!check.allowed || !prop || prop.ownerId === null) {
      if (clientId) {
        this.sendError(
          clientId,
          'INVALID_ACTION',
          check.reason || 'Không thể mua lại bất động sản này lúc này.'
        );
        return false;
      }
      this.completeTurnAfterAction(room, buyer);
      return true;
    }

    const prevOwner = match.players.find((p) => p.id === prop.ownerId);
    buyer.cash -= check.cost;
    if (prevOwner) prevOwner.cash += check.cost;
    match.properties[tileIndex] = { ...prop, ownerId: buyer.id };

    this.emitSound(room, 'auctionGavel');
    const tile = BOARD_TILES[tileIndex];
    this.addLog(
      room,
      `${buyer.name} chi ${formatBusinessTourCompact(check.cost)} (2×) THÂU TÓM ĐÔ THỊ ${tile.name} từ ${prevOwner?.name || 'đối thủ'}!`,
      buyer.color,
      'highlight'
    );

    if (buyer.isBot) {
      this.triggerBotQuip(
        room,
        buildBotBuyQuipPayload(buyer, tileIndex, check.cost, match.properties, 'BUYOUT')
      );
    }

    this.completeTurnAfterAction(room, buyer);
    return true;
  }

  private performConfirmChampionship(
    room: RoomRecord,
    targetTile: number,
    clientId?: string
  ): boolean {
    const match = room.match;
    if (!match) return false;
    const player = match.players[match.activePlayerIndex];
    const champCheck = validateChampionshipHostSelection(
      player,
      targetTile,
      match.properties,
      match.isFreeChampionship
    );
    if (!champCheck.allowed) {
      if (clientId) {
        this.sendError(
          clientId,
          'INVALID_ACTION',
          champCheck.reason || 'Không thể đăng cai Cúp Quốc Gia tại ô này.'
        );
        return false;
      }
      match.isFreeChampionship = false;
      this.completeTurnAfterAction(room, player);
      return true;
    }
    const prop = match.properties[targetTile];
    const tile = BOARD_TILES[targetTile];
    const fee = champCheck.fee;

    player.cash -= fee;
    match.boardModifiers = applyChampionshipHost(match.boardModifiers, targetTile);
    match.isFreeChampionship = false;
    if (fee > 0) this.emitSound(room, 'cashPay');
    this.emitSound(room, 'buildHouse', prop.level + 1);
    this.addLog(
      room,
      `🏆 ${player.name} đăng cai Cúp Quốc Gia tại ${tile.name} (${match.boardModifiers.championshipMultiplier}× tiền thuê${fee > 0 ? `, phí -${formatBusinessTourCompact(fee)}` : ', miễn phí'})!`,
      player.color,
      'highlight'
    );
    this.completeTurnAfterAction(room, player);
    return true;
  }

  private performSkipWorldTour(room: RoomRecord): void {
    const match = room.match;
    if (!match) return;
    const player = match.players[match.activePlayerIndex];
    player.pendingWorldTour = false;
    this.addLog(
      room,
      `${player.name} bỏ qua chuyến bay Du Lịch Xuyên Việt và đổ xúc xắc như thường.`,
      player.color
    );
    this.setTurnPhase(match, 'AWAIT_ROLL');
    this.ensureSubPhaseTimeFloor(match, 18);
    this.broadcastSnapshot(room);
    this.scheduleBotTurnIfNeeded(room);
  }

  private async performWorldTour(
    room: RoomRecord,
    targetTile: number,
    epoch: number,
    clientId?: string
  ): Promise<void> {
    const match = room.match;
    if (!match || room.matchEpoch !== epoch) return;
    if (!isValidTileIndex(targetTile)) {
      if (clientId) {
        this.sendError(clientId, 'INVALID_ACTION', 'Ô đích Du Lịch Xuyên Việt không hợp lệ.');
      }
      return;
    }
    const player = match.players[match.activePlayerIndex];
    if (targetTile === WORLD_TOUR_TILE_INDEX) {
      this.performSkipWorldTour(room);
      return;
    }

    const hasAnyValidTarget = BOARD_TILES.some((t) =>
      isValidWorldTourTarget(player, t.index, match.properties)
    );
    if (player.cash < WORLD_TOUR_FEE || !hasAnyValidTarget) {
      player.pendingWorldTour = false;
      this.setTurnPhase(match, 'AWAIT_ROLL');
      this.ensureSubPhaseTimeFloor(match, 18);
      this.broadcastSnapshot(room);
      this.scheduleBotTurnIfNeeded(room);
      return;
    }

    if (!isValidWorldTourTarget(player, targetTile, match.properties)) {
      if (clientId) {
        this.sendError(
          clientId,
          'INVALID_ACTION',
          'Chỉ có thể bay tới ô đất/khu nghỉ dưỡng trống hoặc thuộc sở hữu của bạn.'
        );
      }
      return;
    }

    const destTile = BOARD_TILES[targetTile];
    if (!destTile) return;

    this.emitSound(room, 'cashPay');
    const { path, passedStart, lapsDelta } = resolveWorldTourMovement(player.position, targetTile);
    player.cash -= WORLD_TOUR_FEE;
    player.pendingWorldTour = false;
    player.doublesStreak = 0;
    this.addLog(
      room,
      `✈️ ${player.name} mua vé ${formatBusinessTourCompact(WORLD_TOUR_FEE)} bay thẳng tới ${destTile.name}!`,
      player.color,
      'highlight'
    );

    this.setTurnPhase(match, 'MOVING_TOKEN');
    if (path.length > 0) {
      this.emitVisualEvent(room, {
        kind: 'TOKEN_MOVED',
        playerId: player.id,
        path,
        speedMultiplier: 1.25,
      });
    }
    this.broadcastSnapshot(room);

    if (path.length > 0) {
      const { totalWaitMs } = computeTokenHopTiming(path.length, 1.25);
      if (!(await this.waitRoomBeat(room, totalWaitMs, epoch))) return;
    }

    player.position = targetTile;
    if (passedStart && lapsDelta > 0) {
      player.cash += START_SALARY * lapsDelta;
      player.laps += lapsDelta;
      this.emitSound(room, 'cashGain');
      this.addLog(
        room,
        `${player.name} bay qua ô BẮT ĐẦU, hoàn thành vòng mới và nhận +${formatBusinessTourCompact(START_SALARY * lapsDelta)}!`,
        player.color,
        'positive'
      );
    }

    await this.resolveTileLanding(room, player, targetTile, epoch);
  }

  private async performConfirmCard(room: RoomRecord, epoch: number): Promise<void> {
    const match = room.match;
    if (!match || !match.drawnCard || room.matchEpoch !== epoch) return;
    const card = match.drawnCard;
    const drawerIndex = match.activePlayerIndex;
    const player = match.players[drawerIndex];
    match.drawnCard = null;
    const eff = card.effect;

    if (eff.type === 'GAIN_CASH') {
      player.cash += eff.amount;
      this.emitSound(room, 'cashGain');
      this.addLog(
        room,
        `${player.name} nhận +${formatBusinessTourCompact(eff.amount)} (${card.title}).`,
        player.color,
        'positive'
      );
      this.completeTurnAfterAction(room, player);
    } else if (eff.type === 'PAY_CASH') {
      this.applyPaymentOrDebt(room, player, eff.amount, null, card.title);
    } else if (eff.type === 'COLLECT_FROM_ALL') {
      let collected = 0;
      const debtQueue: PendingDebt[] = [];
      for (const opp of match.players) {
        if (opp.id === player.id || opp.bankrupt) continue;
        if (match.matchMode === 'TEAMS_2V2' && areTeammates(player, opp)) continue;

        if (opp.cash >= eff.amountEach) {
          opp.cash -= eff.amountEach;
          collected += eff.amountEach;
          continue;
        }

        const ownedCount = Object.values(match.properties).filter(
          (pr) => pr.ownerId === opp.id
        ).length;
        if (ownedCount === 0) {
          const leftover = Math.max(0, opp.cash);
          collected += leftover;
          opp.cash = 0;
          opp.bankrupt = true;
          opp.inJail = false;
          opp.jailTurns = 0;
          opp.doublesStreak = 0;
          opp.pendingWorldTour = false;
          this.addLog(
            room,
            `💸 ${opp.name} không đủ ${formatBusinessTourCompact(eff.amountEach)} (${card.title}) và không còn BĐS — tự động phá sản (nộp ${formatBusinessTourCompact(leftover)})!`,
            opp.color,
            'negative'
          );
        } else {
          debtQueue.push({
            amount: eff.amountEach,
            creditorId: player.id,
            debtorId: opp.id,
            reason: card.title,
          });
        }
      }

      player.cash += collected;
      if (collected > 0) {
        this.emitSound(room, 'cashGain');
      }
      this.addLog(
        room,
        `${player.name} nhận quà mừng tổng cộng +${formatBusinessTourCompact(collected)} từ các đối thủ!`,
        player.color,
        'positive'
      );

      if (this.checkVictory(room)) return;

      if (debtQueue.length > 0) {
        const firstDebt = debtQueue.shift()!;
        const debtorIdx = match.players.findIndex((p) => p.id === firstDebt.debtorId);
        match.debtReturnToPlayerIndex = drawerIndex;
        match.pendingDebtQueue = debtQueue;
        match.pendingDebt = firstDebt;
        if (debtorIdx >= 0) {
          match.activePlayerIndex = debtorIdx;
        }
        const debtor = match.players[match.activePlayerIndex];
        this.setTurnPhase(match, 'DEBT_RESOLUTION');
        this.ensureSubPhaseTimeFloor(match, 25);
        this.addLog(
          room,
          `${debtor.name} thiếu tiền mặt để trả ${formatBusinessTourCompact(firstDebt.amount)} (${card.title}) — cần bán tài sản hoặc phá sản!`,
          debtor.color,
          'negative'
        );
        this.broadcastSnapshot(room);
        this.scheduleBotTurnIfNeeded(room);
        return;
      }

      this.completeTurnAfterAction(room, player);
    } else if (eff.type === 'JAIL_FREE_CARD') {
      player.jailFreeCards += 1;
      this.addLog(room, `${player.name} cất giữ 1 Thẻ Thoát Đảo.`, player.color, 'positive');
      this.completeTurnAfterAction(room, player);
    } else if (eff.type === 'GO_TO_JAIL') {
      this.emitSound(room, 'jailAlert');
      this.setTurnPhase(match, 'MOVING_TOKEN');
      this.emitVisualEvent(room, {
        kind: 'TOKEN_MOVED',
        playerId: player.id,
        path: [LOST_ISLAND_TILE_INDEX],
        speedMultiplier: 1,
      });
      this.broadcastSnapshot(room);
      if (!(await this.waitRoomBeat(room, 650, epoch))) return;
      player.position = LOST_ISLAND_TILE_INDEX;
      player.inJail = true;
      player.jailTurns = 0;
      player.doublesStreak = 0;
      player.pendingWorldTour = false;
      this.completeTurnAfterAction(room, player);
    } else if (eff.type === 'MOVE_TO') {
      const { path, passedStart } = computePathToTile(player.position, eff.targetTile, eff.collectStart);
      this.setTurnPhase(match, 'MOVING_TOKEN');
      if (path.length > 0) {
        this.emitVisualEvent(room, {
          kind: 'TOKEN_MOVED',
          playerId: player.id,
          path,
          speedMultiplier: 1,
        });
      }
      this.broadcastSnapshot(room);
      if (path.length > 0) {
        const { totalWaitMs } = computeTokenHopTiming(path.length, 1);
        if (!(await this.waitRoomBeat(room, totalWaitMs, epoch))) return;
      }
      player.position = eff.targetTile;
      if (passedStart) {
        player.cash += START_SALARY;
        player.laps += 1;
        this.emitSound(room, 'cashGain');
        this.addLog(
          room,
          `${player.name} đi qua ô BẮT ĐẦU, hoàn thành vòng mới và nhận +${formatBusinessTourCompact(START_SALARY)}!`,
          player.color,
          'positive'
        );
      }
      await this.resolveTileLanding(room, player, eff.targetTile, epoch);
    } else if (eff.type === 'HOST_CHAMPIONSHIP') {
      const ownsCity = Object.values(match.properties).some(
        (pr) => pr.ownerId === player.id && BOARD_TILES[pr.tileIndex]?.kind === TileKind.PROPERTY
      );
      if (!ownsCity) {
        this.addLog(
          room,
          `${player.name} rút được "${card.title}" nhưng chưa sở hữu Thành phố nào để đăng cai.`,
          player.color
        );
        this.completeTurnAfterAction(room, player);
        return;
      }
      match.isFreeChampionship = true;
      this.setTurnPhase(match, 'CHAMPIONSHIP_SELECTION');
      this.ensureSubPhaseTimeFloor(match, 18);
      this.broadcastSnapshot(room);
      this.scheduleBotTurnIfNeeded(room);
    } else if (eff.type === 'GO_TO_WORLD_TOUR') {
      const { path, passedStart } = computePathToTile(player.position, WORLD_TOUR_TILE_INDEX, true);
      this.setTurnPhase(match, 'MOVING_TOKEN');
      if (path.length > 0) {
        this.emitVisualEvent(room, {
          kind: 'TOKEN_MOVED',
          playerId: player.id,
          path,
          speedMultiplier: 1,
        });
      }
      this.broadcastSnapshot(room);
      if (path.length > 0) {
        const { totalWaitMs } = computeTokenHopTiming(path.length, 1);
        if (!(await this.waitRoomBeat(room, totalWaitMs, epoch))) return;
      }
      player.position = WORLD_TOUR_TILE_INDEX;
      if (passedStart) {
        player.cash += START_SALARY;
        player.laps += 1;
        this.emitSound(room, 'cashGain');
        this.addLog(
          room,
          `${player.name} đi qua ô BẮT ĐẦU, hoàn thành vòng mới và nhận +${formatBusinessTourCompact(START_SALARY)}!`,
          player.color,
          'positive'
        );
      }
      await this.resolveTileLanding(room, player, WORLD_TOUR_TILE_INDEX, epoch);
    } else if (
      eff.type === 'EARTHQUAKE' ||
      eff.type === 'POWER_OUTAGE' ||
      eff.type === 'SHIELD_CITY'
    ) {
      const validTargets = getValidTacticalCardTargets(
        eff.type,
        player.id,
        match.properties,
        match.boardModifiers,
        match.players,
        match.matchMode
      ).filter((idx) => {
        const ownerId = match.properties[idx]?.ownerId;
        return ownerId !== null && match.players.some((p) => p.id === ownerId && !p.bankrupt);
      });
      if (validTargets.length === 0) {
        this.addLog(
          room,
          `${player.name} rút thẻ "${card.title}" nhưng hiện không có thành phố hợp lệ nào trên bàn cờ để áp dụng.`,
          player.color
        );
        this.completeTurnAfterAction(room, player);
        return;
      }
      match.pendingTacticalCard = eff.type;
      this.setTurnPhase(match, 'CARD_TARGET_SELECTION');
      this.ensureSubPhaseTimeFloor(match, 18);
      this.broadcastSnapshot(room);
      this.scheduleBotTurnIfNeeded(room);
    }
  }

  private performApplyTacticalCard(
    room: RoomRecord,
    targetTile: number,
    clientId?: string
  ): boolean {
    const match = room.match;
    if (!match || !match.pendingTacticalCard) return false;
    if (!isValidTileIndex(targetTile)) {
      if (clientId) {
        this.sendError(clientId, 'INVALID_ACTION', 'Ô mục tiêu thẻ chiến thuật không hợp lệ.');
      }
      return false;
    }
    const player = match.players[match.activePlayerIndex];
    const kind = match.pendingTacticalCard;

    const validTargets = getValidTacticalCardTargets(
      kind,
      player.id,
      match.properties,
      match.boardModifiers,
      match.players,
      match.matchMode
    );
    if (!validTargets.includes(targetTile)) {
      if (clientId) {
        this.sendError(clientId, 'INVALID_ACTION', 'Không thể áp dụng thẻ chiến thuật lên ô này.');
      }
      return false;
    }

    const tile = BOARD_TILES[targetTile];
    match.pendingTacticalCard = null;

    if (kind === 'SHIELD_CITY') {
      match.boardModifiers = applyShieldToTile(targetTile, match.boardModifiers);
      this.emitSound(room, 'buildHouse', 4);
      this.addLog(
        room,
        `🛡️ ${player.name} dựng Khiên Bảo Hộ tại ${tile.name} (miễn nhiễm Mua đứt 2× & chặn 1 đòn tấn công)!`,
        player.color,
        'positive'
      );
      this.completeTurnAfterAction(room, player);
      return true;
    }

    if (kind === 'POWER_OUTAGE') {
      const res = applyPowerOutageToTile(targetTile, match.properties, match.boardModifiers);
      match.boardModifiers = res.nextModifiers;
      if (res.blockedByShield) {
        this.emitSound(room, 'cardDraw');
        this.addLog(
          room,
          `🛡️ Khiên Bảo Hộ tại ${tile.name} đã chặn đứng đòn Mất Điện của ${player.name} (Khiên đã tiêu hao)!`,
          player.color,
          'highlight'
        );
      } else {
        this.emitSound(room, 'jailAlert');
        this.addLog(
          room,
          `⚡ ${player.name} kích hoạt Sự Cố Mất Điện tại ${tile.name} — tiền thuê về 0K trong lần ghé tiếp theo!`,
          player.color,
          'highlight'
        );
      }
      this.completeTurnAfterAction(room, player);
      return true;
    }

    // EARTHQUAKE
    const eq = applyEarthquakeToTile(targetTile, match.properties, match.boardModifiers);
    match.properties = eq.nextProperties;
    match.boardModifiers = eq.nextModifiers;
    if (eq.blockedByShield) {
      this.emitSound(room, 'cardDraw');
      this.addLog(
        room,
        `🛡️ Khiên Bảo Hộ tại ${tile.name} đã chặn đứng Địa Chấn của ${player.name} (Khiên đã tiêu hao)!`,
        player.color,
        'highlight'
      );
    } else if (eq.destroyedToBank) {
      this.emitSound(room, 'jailAlert');
      this.addLog(
        room,
        `🌋 Địa Chấn Thương Trường từ ${player.name} san phẳng khu đất trống ${tile.name} trở về Ngân hàng!`,
        player.color,
        'highlight'
      );
    } else {
      this.emitSound(room, 'jailAlert');
      this.addLog(
        room,
        `🌋 Địa Chấn Thương Trường từ ${player.name} hạ ${tile.name} xuống còn ${eq.newLevel === 0 ? 'Đất trống' : `Nhà Cấp ${eq.newLevel}`}!`,
        player.color,
        'highlight'
      );
    }
    this.completeTurnAfterAction(room, player);
    return true;
  }

  private advanceAfterQueuedDebt(room: RoomRecord): boolean {
    const match = room.match;
    if (!match) return false;
    if (match.debtReturnToPlayerIndex === null && match.pendingDebtQueue.length === 0) {
      return false;
    }

    while (match.pendingDebtQueue.length > 0) {
      const nextDebt = match.pendingDebtQueue.shift()!;
      const debtorIdx = match.players.findIndex(
        (p) => p.id === nextDebt.debtorId && !p.bankrupt
      );
      if (debtorIdx < 0) continue;
      const debtor = match.players[debtorIdx];
      const creditor =
        nextDebt.creditorId !== null
          ? match.players.find((p) => p.id === nextDebt.creditorId && !p.bankrupt) || null
          : null;
      if (nextDebt.creditorId !== null && !creditor) continue;

      if (debtor.cash >= nextDebt.amount) {
        debtor.cash -= nextDebt.amount;
        if (creditor) creditor.cash += nextDebt.amount;
        this.emitSound(room, 'cashPay');
        this.addLog(
          room,
          `${debtor.name} thanh toán đủ ${formatBusinessTourCompact(nextDebt.amount)} (${nextDebt.reason}).`,
          debtor.color,
          'positive'
        );
        continue;
      }

      const ownedCount = Object.values(match.properties).filter(
        (pr) => pr.ownerId === debtor.id
      ).length;
      if (ownedCount === 0) {
        const payout = calculateBankruptcyCreditorPayout(
          debtor,
          nextDebt.creditorId,
          match.properties
        );
        debtor.cash = 0;
        debtor.bankrupt = true;
        debtor.inJail = false;
        debtor.jailTurns = 0;
        debtor.doublesStreak = 0;
        debtor.pendingWorldTour = false;
        if (creditor) creditor.cash += payout;
        this.addLog(
          room,
          `💸 ${debtor.name} không đủ ${formatBusinessTourCompact(nextDebt.amount)} (${nextDebt.reason}) và không còn BĐS — tự động phá sản!`,
          debtor.color,
          'negative'
        );
        if (this.checkVictory(room)) return true;
        continue;
      }

      match.activePlayerIndex = debtorIdx;
      match.pendingDebt = nextDebt;
      this.setTurnPhase(match, 'DEBT_RESOLUTION');
      this.ensureSubPhaseTimeFloor(match, 25);
      this.addLog(
        room,
        `${debtor.name} thiếu tiền mặt để trả ${formatBusinessTourCompact(nextDebt.amount)} (${nextDebt.reason}) — cần bán tài sản hoặc phá sản!`,
        debtor.color,
        'negative'
      );
      this.broadcastSnapshot(room);
      this.scheduleBotTurnIfNeeded(room);
      return true;
    }

    const returnIdx = match.debtReturnToPlayerIndex;
    match.debtReturnToPlayerIndex = null;
    match.pendingDebt = null;
    if (returnIdx !== null && match.players[returnIdx] && !match.players[returnIdx].bankrupt) {
      match.activePlayerIndex = returnIdx;
      this.completeTurnAfterAction(room, match.players[returnIdx]);
    } else {
      this.advanceToNextPlayerTurn(room);
    }
    return true;
  }

  private performSellAndPayDebt(
    room: RoomRecord,
    tileIndicesToSell: number[],
    clientId?: string
  ): boolean {
    const match = room.match;
    if (!match || !match.pendingDebt) return false;
    if (
      !Array.isArray(tileIndicesToSell) ||
      !tileIndicesToSell.every((n) => isValidTileIndex(n))
    ) {
      if (clientId) {
        this.sendError(clientId, 'INVALID_ACTION', 'Danh sách bất động sản bán không hợp lệ.');
      }
      return false;
    }

    const player = match.players[match.activePlayerIndex];

    const uniqueTiles = Array.from(new Set(tileIndicesToSell));
    let totalRefund = 0;
    let soldCount = 0;
    const previewProps: Record<number, PropertyState> = { ...match.properties };

    for (const tileIdx of uniqueTiles) {
      const prop = previewProps[tileIdx];
      if (!prop || prop.ownerId !== player.id) continue;
      totalRefund += calculatePropertyInvestedValue(tileIdx, prop.level);
      previewProps[tileIdx] = { tileIndex: tileIdx, ownerId: null, level: 0 };
      soldCount += 1;
    }

    const { amount, creditorId, reason, originTileIndex } = match.pendingDebt;
    const availableCash = Math.max(0, player.cash) + totalRefund;
    if (availableCash < amount) {
      if (clientId) {
        this.sendError(clientId, 'INVALID_ACTION', 'Số tiền bán tài sản chưa đủ để thanh toán khoản nợ.');
      }
      return false;
    }

    match.properties = previewProps;
    match.boardModifiers = clearDisownedModifiers(match.boardModifiers, previewProps);
    player.cash = availableCash - amount;

    const creditor =
      creditorId !== null ? match.players.find((p) => p.id === creditorId) || null : null;
    if (creditor) creditor.cash += amount;

    this.emitSound(room, 'cashPay');
    if (soldCount > 0) {
      this.addLog(
        room,
        `${player.name} bán ${soldCount} bất động sản cho Ngân hàng (+${formatBusinessTourCompact(totalRefund)} hoàn trả 100%) và thanh toán đủ ${formatBusinessTourCompact(amount)} (${reason})!`,
        player.color,
        'positive'
      );
    } else {
      this.addLog(
        room,
        `${player.name} đã thanh toán đủ khoản nợ ${formatBusinessTourCompact(amount)} (${reason})!`,
        player.color,
        'positive'
      );
    }

    if (creditor && creditor.isBot) {
      this.triggerBotQuip(
        room,
        buildBotRentCollectedQuipPayload(creditor, player.name, player.position, amount, previewProps)
      );
    } else if (player.isBot && amount >= MIN_BIG_RENT_FOR_QUIP) {
      this.triggerBotQuip(
        room,
        buildBotPenaltyQuipPayload(player, reason, amount, creditor?.name)
      );
    }

    match.pendingDebt = null;

    if (this.checkVictory(room)) return true;
    if (this.advanceAfterQueuedDebt(room)) return true;

    if (
      originTileIndex !== undefined &&
      creditorId !== null &&
      canBuyoutProperty(
        player,
        originTileIndex,
        match.properties,
        match.boardModifiers,
        match.players,
        match.matchMode
      ).allowed
    ) {
      this.setTurnPhase(match, 'BUYOUT_DECISION');
      this.ensureSubPhaseTimeFloor(match, 18);
      this.broadcastSnapshot(room);
      this.scheduleBotTurnIfNeeded(room);
      return true;
    }

    this.completeTurnAfterAction(room, player);
    return true;
  }

  private performDeclareBankruptcy(room: RoomRecord): void {
    const match = room.match;
    if (!match) return;
    const player = match.players[match.activePlayerIndex];
    const creditorId = match.pendingDebt?.creditorId ?? null;
    const creditorPayout = calculateBankruptcyCreditorPayout(
      player,
      creditorId,
      match.properties
    );

    player.cash = 0;
    player.bankrupt = true;
    player.inJail = false;
    player.jailTurns = 0;
    player.doublesStreak = 0;
    player.pendingWorldTour = false;

    const creditor =
      creditorId !== null ? match.players.find((p) => p.id === creditorId) || null : null;
    if (creditor) {
      creditor.cash += creditorPayout;
    }

    for (const key of Object.keys(match.properties)) {
      const idx = Number(key);
      if (match.properties[idx].ownerId === player.id) {
        match.properties[idx] = { tileIndex: idx, ownerId: null, level: 0 };
      }
    }
    match.boardModifiers = clearDisownedModifiers(match.boardModifiers, match.properties);
    match.pendingDebt = null;
    match.pendingTacticalCard = null;
    this.emitSound(room, 'jailAlert');
    this.addLog(
      room,
      creditor && creditorPayout > 0
        ? `${player.name} chính thức PHÁ SẢN! Chủ nợ ${creditor.name} nhận bồi thường ${formatBusinessTourCompact(creditorPayout)} (tiền mặt + thanh lý 100% BĐS); các ô đất trả về Ngân hàng.`
        : `${player.name} chính thức tuyên bố PHÁ SẢN! Toàn bộ bất động sản được trả về Ngân hàng.`,
      player.color,
      'negative'
    );

    if (this.checkVictory(room)) return;
    if (this.advanceAfterQueuedDebt(room)) return;

    this.advanceToNextPlayerTurn(room);
  }

  private advanceToNextPlayerTurn(room: RoomRecord): void {
    const match = room.match;
    if (!match) return;
    match.pendingTacticalCard = null;
    const nextIdx = getNextActivePlayerIndex(match.players, match.activePlayerIndex);
    match.activePlayerIndex = nextIdx;
    match.turnCount += 1;
    this.enterRollPhaseForPlayer(room, match.players[nextIdx]);
  }

  private enterRollPhaseForPlayer(room: RoomRecord, player: PlayerState | undefined): void {
    const match = room.match;
    if (!match) return;
    match.turnTimeLeft = TURN_COUNTDOWN_SECONDS;
    match.pendingTacticalCard = null;

    if (!player || player.bankrupt) {
      this.setTurnPhase(match, 'AWAIT_ROLL');
      this.broadcastSnapshot(room);
      return;
    }

    if (player.pendingWorldTour && !player.inJail) {
      const hasValidTarget = BOARD_TILES.some((t) =>
        isValidWorldTourTarget(player, t.index, match.properties)
      );
      if (player.cash >= WORLD_TOUR_FEE && hasValidTarget) {
        this.addLog(
          room,
          `✈️ ${player.name} kích hoạt vé Du Lịch Xuyên Việt — hãy chọn điểm đến trên bàn cờ (phí ${formatBusinessTourCompact(WORLD_TOUR_FEE)})!`,
          player.color,
          'highlight'
        );
        this.setTurnPhase(match, 'WORLD_TOUR');
        this.broadcastSnapshot(room);
        this.scheduleBotTurnIfNeeded(room);
        return;
      }
      player.pendingWorldTour = false;
      this.addLog(
        room,
        `${player.name} không thể thực hiện Du Lịch Xuyên Việt (thiếu phí ${formatBusinessTourCompact(WORLD_TOUR_FEE)} hoặc không còn điểm đến hợp lệ).`,
        player.color
      );
    }

    this.setTurnPhase(match, 'AWAIT_ROLL');
    this.broadcastSnapshot(room);
    this.scheduleBotTurnIfNeeded(room);
  }

  private completeTurnAfterAction(room: RoomRecord, overridePlayer?: PlayerState): void {
    const match = room.match;
    if (!match) return;
    if (this.checkVictory(room)) return;

    const activePlayer = overridePlayer ?? match.players[match.activePlayerIndex];
    if (shouldGrantImmediateDoublesRoll(activePlayer) && activePlayer) {
      this.addLog(
        room,
        `${activePlayer.name} được thưởng thêm 1 lượt đổ xúc xắc nhờ ra đôi!`,
        activePlayer.color,
        'highlight'
      );
      this.enterRollPhaseForPlayer(room, activePlayer);
      return;
    }
    this.advanceToNextPlayerTurn(room);
  }

  private checkVictory(room: RoomRecord): boolean {
    const match = room.match;
    if (!match) return false;
    const result = evaluateMatchWinner(match.players, match.properties, match.matchMode);
    if (!result) return false;

    match.matchWinnerResult = result;
    this.setTurnPhase(match, 'GAME_OVER');
    room.status = 'gameover';
    this.clearMatchTimers(room);
    this.promoteConnectedHostIfNeeded(room);
    this.emitSound(room, 'victory');
    this.addLog(room, `🏆 ${result.winner.name} VÔ ĐỊCH — ${result.label}`, result.winner.color, 'highlight');
    this.broadcastSnapshot(room);
    return true;
  }

  private scheduleBotTurnIfNeeded(room: RoomRecord): void {
    if (this.disposed || !this.rooms.has(room.roomCode)) return;
    const match = room.match;
    if (!match || room.status !== 'playing') return;
    const current = match.players[match.activePlayerIndex];
    if (!current || !current.isBot || current.bankrupt) return;

    const phase = match.turnPhase;
    if (phase === 'ROLLING_DICE' || phase === 'MOVING_TOKEN' || phase === 'GAME_OVER') return;
    // Never schedule a Bot action while an async beat (`waitRoomBeat`) is actively in flight
    if (room.inFlightBeatCount > 0) return;

    const epoch = room.matchEpoch;
    const turnCount = match.turnCount;
    const decisionRevision = match.decisionRevision;
    const scheduledPlayerId = current.id;

    // Idempotent guard: if an active timer already matches this exact decision, keep it (never double-schedule)
    if (
      room.botActionTimer !== null &&
      room.botScheduledMeta &&
      room.botScheduledMeta.epoch === epoch &&
      room.botScheduledMeta.turnCount === turnCount &&
      room.botScheduledMeta.decisionRevision === decisionRevision &&
      room.botScheduledMeta.playerId === scheduledPlayerId &&
      room.botScheduledMeta.phase === phase
    ) {
      return;
    }

    this.clearBotActionTimer(room);

    const delayMs = phase === 'CARD_REVEAL' ? 2800 : 1250;
    const expectedDelayMs =
      this.timingScale <= 0 ? 0 : Math.max(10, Math.round(delayMs * this.timingScale));
    room.botScheduledMeta = {
      epoch,
      turnCount,
      decisionRevision,
      playerId: scheduledPlayerId,
      phase,
      scheduledAt: Date.now(),
      expectedDelayMs,
    };

    room.botActionTimer = this.scheduleRoomTimeout(room, delayMs, () => {
      room.botActionTimer = null;
      room.botScheduledMeta = null;
      if (this.disposed || !this.rooms.has(room.roomCode)) return;
      if (room.matchEpoch !== epoch || room.status !== 'playing' || !room.match) return;
      if (room.botActionExecuting || room.inFlightBeatCount > 0) return;
      const bot = room.match.players[room.match.activePlayerIndex];
      if (
        !bot ||
        bot.id !== scheduledPlayerId ||
        !bot.isBot ||
        bot.bankrupt ||
        room.match.turnPhase !== phase ||
        room.match.decisionRevision !== decisionRevision
      ) {
        return;
      }

      room.botActionExecuting = true;
      try {
        this.runBotDecision(room, bot, phase);
      } finally {
        room.botActionExecuting = false;
      }
    });
  }

  private runBotDecision(room: RoomRecord, bot: PlayerState, phase: TurnPhase): void {
    if (!room.match) return;
    if (phase === 'AWAIT_ROLL') {
      if (bot.inJail) {
        const decision = botChooseJailAction(bot, room.botDifficulty);
        if (decision === 'USE_CARD') {
          this.executeAction(room, { kind: 'USE_JAIL_CARD' });
          return;
        }
        if (decision === 'PAY_FINE') {
          this.executeAction(room, { kind: 'PAY_JAIL_FINE' });
          return;
        }
      }
      const diceChoice = room.match.tacticalDiceEnabled
        ? botChooseTacticalDice(
            bot,
            room.match.players,
            room.match.properties,
            room.match.boardModifiers,
            room.match.matchMode,
            room.botDifficulty
          )
        : 'NORMAL';
      this.executeAction(room, { kind: 'ROLL_DICE', diceChoice });
    } else if (phase === 'REROLL_DECISION') {
      const lastDice = room.match.lastDice;
      if (
        lastDice &&
        botShouldRerollDice(
          bot,
          lastDice[0],
          lastDice[1],
          room.match.players,
          room.match.properties,
          room.match.boardModifiers,
          room.match.matchMode,
          room.botDifficulty
        )
      ) {
        this.executeAction(room, { kind: 'REROLL_DICE' });
      } else {
        this.executeAction(room, { kind: 'CONFIRM_ROLL_MOVE' });
      }
    } else if (phase === 'BUY_DECISION') {
      if (
        botShouldBuyProperty(
          bot,
          bot.position,
          room.match.players,
          room.match.properties,
          room.match.matchMode,
          room.botDifficulty
        )
      ) {
        const tier = botPickInitialPurchaseTier(
          bot,
          bot.position,
          room.match.properties,
          room.match.players,
          room.match.matchMode,
          room.botDifficulty
        );
        this.executeAction(room, { kind: 'BUY_PROPERTY', initialLevel: tier });
      } else {
        this.executeAction(room, { kind: 'SKIP_BUY' });
      }
    } else if (phase === 'UPGRADE_DECISION') {
      const lvl = botPickOnTileUpgradeTargetLevel(
        bot,
        bot.position,
        room.match.properties,
        room.botDifficulty
      );
      if (lvl !== null) {
        this.executeAction(room, { kind: 'UPGRADE_PROPERTY', targetLevel: lvl });
      } else {
        this.executeAction(room, { kind: 'SKIP_UPGRADE' });
      }
    } else if (phase === 'BUYOUT_DECISION') {
      if (
        botShouldBuyoutProperty(
          bot,
          bot.position,
          room.match.players,
          room.match.properties,
          room.match.boardModifiers,
          room.match.matchMode,
          room.botDifficulty
        )
      ) {
        this.executeAction(room, { kind: 'CONFIRM_BUYOUT' });
      } else {
        this.executeAction(room, { kind: 'SKIP_BUYOUT' });
      }
    } else if (phase === 'CHAMPIONSHIP_SELECTION') {
      const target = botPickChampionshipTarget(
        bot,
        room.match.properties,
        room.match.boardModifiers,
        room.match.isFreeChampionship,
        room.match.players,
        room.match.matchMode,
        room.botDifficulty
      );
      if (target !== null) {
        this.executeAction(room, { kind: 'CONFIRM_CHAMPIONSHIP', targetTile: target });
      } else {
        this.executeAction(room, { kind: 'SKIP_CHAMPIONSHIP' });
      }
    } else if (phase === 'WORLD_TOUR') {
      const dest = botPickWorldTourTarget(
        bot,
        room.match.properties,
        room.match.boardModifiers,
        room.match.players,
        room.match.matchMode,
        room.botDifficulty
      );
      if (dest !== null) {
        this.executeAction(room, { kind: 'SELECT_WORLD_TOUR', targetTile: dest });
      } else {
        this.executeAction(room, { kind: 'SKIP_WORLD_TOUR' });
      }
    } else if (phase === 'CARD_REVEAL') {
      this.executeAction(room, { kind: 'CONFIRM_CARD' });
    } else if (phase === 'CARD_TARGET_SELECTION' && room.match.pendingTacticalCard) {
      const target = botPickTacticalCardTarget(
        room.match.pendingTacticalCard,
        bot,
        room.match.players,
        room.match.properties,
        room.match.boardModifiers,
        room.match.matchMode,
        room.botDifficulty
      );
      if (target !== null) {
        this.executeAction(room, { kind: 'APPLY_TACTICAL_CARD', targetTile: target });
      } else {
        this.executeAction(room, { kind: 'SKIP_TACTICAL_CARD' });
      }
    } else if (phase === 'DEBT_RESOLUTION' && room.match.pendingDebt) {
      const cashNeeded = Math.max(0, room.match.pendingDebt.amount - Math.max(0, bot.cash));
      if (cashNeeded === 0) {
        this.executeAction(room, { kind: 'SELL_AND_PAY_DEBT', tileIndicesToSell: [] });
        return;
      }
      const plan = computeOptimalAutoSale(
        bot.id,
        cashNeeded,
        room.match.properties,
        room.match.boardModifiers,
        room.match.players,
        room.match.matchMode
      );
      if (!plan.sufficient) {
        this.executeAction(room, { kind: 'DECLARE_BANKRUPTCY' });
      } else {
        this.executeAction(room, {
          kind: 'SELL_AND_PAY_DEBT',
          tileIndicesToSell: plan.tileIndicesToSell,
        });
      }
    }
  }

  private ensureSubPhaseTimeFloor(match: MatchRecord, minSeconds = 18): void {
    match.turnTimeLeft = Math.max(match.turnTimeLeft, minSeconds);
  }

  private triggerBotQuip(room: RoomRecord, payload: BotQuipPayload | null): void {
    if (!payload || !this.generateBotQuip) return;
    const epoch = room.matchEpoch;
    this.emitVisualEvent(room, {
      kind: 'BOT_QUIP',
      botId: payload.botId,
      botName: payload.botName,
      eventKind: payload.eventKind,
      status: 'loading',
      text: 'Đang nghĩ câu bình luận...',
    });

    const finalizeQuip = (rawQuip: string | null | undefined) => {
      if (this.disposed || room.matchEpoch !== epoch || !room.match) return;
      const quip = (rawQuip && rawQuip.trim()) || generateOfflineBotQuip(payload);
      const botPlayer = room.match.players.find((p) => p.id === payload.botId);
      this.emitVisualEvent(room, {
        kind: 'BOT_QUIP',
        botId: payload.botId,
        botName: payload.botName,
        eventKind: payload.eventKind,
        status: 'ready',
        text: quip,
      });
      this.addLog(room, `💬 ${payload.botName}: “${quip}”`, botPlayer?.color, 'highlight');
      this.broadcastSnapshot(room);
    };

    void this.generateBotQuip({ ...payload, sessionId: `room:${room.roomCode}:${epoch}` })
      .then((quip) => {
        finalizeQuip(quip);
      })
      .catch(() => {
        finalizeQuip(null);
      });
  }

  private executeSafeTimeoutAction(
    room: RoomRecord,
    match: MatchRecord,
    active: PlayerState
  ): void {
    const phase = match.turnPhase;
    if (phase === 'AWAIT_ROLL') {
      match.turnTimeLeft = 15;
      this.executeAction(room, { kind: 'ROLL_DICE' });
    } else if (phase === 'REROLL_DECISION') {
      const isThirdDouble =
        !active.inJail &&
        Boolean(match.lastDice) &&
        match.lastDice![0] === match.lastDice![1] &&
        active.doublesStreak >= 2;
      active.doublesStreak = 0;
      match.turnTimeLeft = 15;
      void this.performConfirmRollMove(room, room.matchEpoch, true, isThirdDouble);
    } else if (phase === 'BUY_DECISION') {
      active.doublesStreak = 0;
      this.executeAction(room, { kind: 'SKIP_BUY' });
    } else if (phase === 'UPGRADE_DECISION') {
      active.doublesStreak = 0;
      this.executeAction(room, { kind: 'SKIP_UPGRADE' });
    } else if (phase === 'BUYOUT_DECISION') {
      active.doublesStreak = 0;
      this.executeAction(room, { kind: 'SKIP_BUYOUT' });
    } else if (phase === 'CHAMPIONSHIP_SELECTION') {
      active.doublesStreak = 0;
      this.executeAction(room, { kind: 'SKIP_CHAMPIONSHIP' });
    } else if (phase === 'WORLD_TOUR') {
      active.doublesStreak = 0;
      match.turnTimeLeft = 15;
      this.executeAction(room, { kind: 'SKIP_WORLD_TOUR' });
    } else if (phase === 'CARD_REVEAL') {
      active.doublesStreak = 0;
      match.turnTimeLeft = 15;
      this.executeAction(room, { kind: 'CONFIRM_CARD' });
    } else if (phase === 'CARD_TARGET_SELECTION') {
      active.doublesStreak = 0;
      this.executeAction(room, { kind: 'SKIP_TACTICAL_CARD' });
    } else if (phase === 'DEBT_RESOLUTION' && match.pendingDebt) {
      active.doublesStreak = 0;
      match.turnTimeLeft = 15;
      const cashNeeded = Math.max(0, match.pendingDebt.amount - Math.max(0, active.cash));
      const plan = computeOptimalAutoSale(
        active.id,
        cashNeeded,
        match.properties,
        match.boardModifiers,
        match.players,
        match.matchMode
      );
      if (!plan.sufficient) {
        this.executeAction(room, { kind: 'DECLARE_BANKRUPTCY' });
      } else {
        this.executeAction(room, {
          kind: 'SELL_AND_PAY_DEBT',
          tileIndicesToSell: plan.tileIndicesToSell,
        });
      }
    }
  }

  private runBotWatchdogIfNeeded(
    room: RoomRecord,
    match: MatchRecord,
    active: PlayerState,
    now: number,
    timedOut: boolean
  ): void {
    // 1. Bot is currently executing a synchronous action or awaiting an async beat -> do NOT interfere.
    if (room.botActionExecuting || room.inFlightBeatCount > 0) {
      return;
    }

    // 2. Bot already has a scheduled timer -> check if it matches the current decision and is not overdue.
    if (room.botActionTimer !== null) {
      const meta = room.botScheduledMeta;
      const matchesCurrentDecision =
        meta !== null &&
        meta.epoch === room.matchEpoch &&
        meta.turnCount === match.turnCount &&
        meta.decisionRevision === match.decisionRevision &&
        meta.playerId === active.id &&
        meta.phase === match.turnPhase;
      const overdueThresholdMs = meta ? Math.max(5000, meta.expectedDelayMs + 5000) : 5000;
      const isOverdue = meta ? now - meta.scheduledAt > overdueThresholdMs : true;

      if (matchesCurrentDecision && !isOverdue) {
        // Legitimately waiting for scheduled timer -> do not spawn duplicate concurrent actions.
        return;
      }
      // Stale or overdue timer -> clear before attempting bounded recovery.
      this.clearBotActionTimer(room);
    }

    // 3. Bot is genuinely stranded (no timer, not executing, no async beat in flight).
    const decisionKey = `${room.matchEpoch}:${match.turnCount}:${match.decisionRevision}:${active.id}:${match.turnPhase}`;
    if (room.botWatchdogKey !== decisionKey) {
      room.botWatchdogKey = decisionKey;
      room.botWatchdogAttempts = 0;
    }

    // Hard cap per decision prevents any possibility of an infinite watchdog loop.
    if (room.botWatchdogAttempts >= 2) {
      return;
    }

    if (room.botWatchdogAttempts === 0) {
      room.botWatchdogAttempts = 1;
      if (match.turnTimeLeft <= 0) {
        match.turnTimeLeft = 15;
      }
      this.scheduleBotTurnIfNeeded(room);
      return;
    }

    // Second recovery attempt only if the turn clock also expired after rescheduling failed to advance state.
    if (timedOut) {
      room.botWatchdogAttempts = 2;
      room.botActionExecuting = true;
      try {
        this.executeSafeTimeoutAction(room, match, active);
      } finally {
        room.botActionExecuting = false;
      }
    }
  }

  public tickOneSecond(): void {
    if (this.disposed) return;
    const now = Date.now();
    for (const room of this.rooms.values()) {
      if (room.status === 'gameover') {
        if (this.promoteConnectedHostIfNeeded(room)) {
          this.broadcastSnapshot(room);
        }
        continue;
      }

      const match = room.match;
      if (room.status !== 'playing' || !match) continue;

      // 20-minute match countdown & Net Worth Sudden Death (BUG-04)
      if (match.matchTimeLeft > 0) {
        match.matchTimeLeft -= 1;
      }
      if (match.matchTimeLeft <= 0) {
        const outstandingDebts: PendingDebt[] = [
          ...(match.pendingDebt ? [match.pendingDebt] : []),
          ...match.pendingDebtQueue,
        ];
        const activeDebtorId = match.players[match.activePlayerIndex]?.id;
        const timeResult = evaluateTimeLimitWinner(
          match.players,
          match.properties,
          match.matchMode,
          outstandingDebts,
          activeDebtorId
        );
        if (timeResult) {
          match.pendingDebt = null;
          match.pendingDebtQueue = [];
          match.debtReturnToPlayerIndex = null;
          match.drawnCard = null;
          match.pendingTacticalCard = null;
          match.landingCueText = null;
          match.matchWinnerResult = timeResult;
          this.setTurnPhase(match, 'GAME_OVER');
          room.status = 'gameover';
          this.clearMatchTimers(room);
          this.promoteConnectedHostIfNeeded(room);
          this.scheduleGraceCleanupIfEmpty(room);
          this.emitSound(room, 'victory');
          this.addLog(
            room,
            `⏱️ Hết giờ (20:00)! ${timeResult.winner.name} VÔ ĐỊCH — ${timeResult.label}`,
            timeResult.winner.color,
            'highlight'
          );
          this.broadcastSnapshot(room);
          continue;
        }
      }

      // Convert disconnected humans to temporary Bot AI takeover after 90s offline
      let takeoverChanged = false;
      for (const seat of room.humans) {
        if (
          !seat.connected &&
          !seat.explicitlyLeft &&
          seat.disconnectedAt !== null &&
          now - seat.disconnectedAt >= DISCONNECT_BOT_TAKEOVER_MS &&
          seat.playerId !== null
        ) {
          const player = match.players.find((p) => p.id === seat.playerId);
          if (player && !player.bankrupt && !player.isBot) {
            player.isBot = true;
            player.onlineBotTakeover = true;
            takeoverChanged = true;
            this.addLog(
              room,
              `🤖 ${player.name} mất kết nối lâu — Bot AI tạm thời tiếp quản!`,
              player.color,
              'neutral'
            );
          }
        }
      }
      if (takeoverChanged) {
        this.promoteConnectedHostIfNeeded(room);
        this.broadcastSnapshot(room);
        this.scheduleBotTurnIfNeeded(room);
      }

      if (
        match.turnPhase === 'ROLLING_DICE' ||
        match.turnPhase === 'MOVING_TOKEN' ||
        match.turnPhase === 'GAME_OVER' ||
        room.inFlightBeatCount > 0
      ) {
        continue;
      }

      const active = match.players[match.activePlayerIndex];
      if (!active || active.bankrupt) continue;

      if (active.isBot) {
        const timedOut = match.turnTimeLeft <= 1;
        match.turnTimeLeft = timedOut ? 0 : match.turnTimeLeft - 1;
        this.runBotWatchdogIfNeeded(room, match, active, now, timedOut);
        continue;
      }

      // Speed up offline human wait slightly (cap at 12s)
      if (active.onlineConnected === false && match.turnTimeLeft > 12) {
        match.turnTimeLeft = 12;
        this.broadcastSnapshot(room);
        continue;
      }

      if (match.turnTimeLeft > 1) {
        match.turnTimeLeft -= 1;
        continue;
      }

      match.turnTimeLeft = 0;

      const isOutOfTurnDebtPrompt =
        match.debtReturnToPlayerIndex !== null &&
        match.debtReturnToPlayerIndex !== match.activePlayerIndex;
      const alreadyInteractedThisTurn =
        match.lastHumanActionTurnCountByPlayer[active.id] === match.turnCount;
      const alreadyCountedThisTurn =
        match.lastMissedTurnCountByPlayer[active.id] === match.turnCount;

      if (!isOutOfTurnDebtPrompt && !alreadyInteractedThisTurn && !alreadyCountedThisTurn) {
        const missed = (match.missedTurnsByPlayer[active.id] || 0) + 1;
        match.missedTurnsByPlayer[active.id] = missed;
        match.lastMissedTurnCountByPlayer[active.id] = match.turnCount;

        if (missed >= 2) {
          active.isBot = true;
          active.onlineBotTakeover = true;
          this.promoteConnectedHostIfNeeded(room);
          this.addLog(
            room,
            active.onlineConnected === false
              ? `🤖 ${active.name} mất kết nối lâu — Bot AI tạm thời tiếp quản!`
              : `🤖 ${active.name} AFK 2 lượt liên tiếp — Bot AI tạm thời tiếp quản!`,
            active.color,
            'neutral'
          );
        }
      }

      this.executeSafeTimeoutAction(room, match, active);
    }
  }
}
