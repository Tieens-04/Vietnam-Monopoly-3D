import crypto from 'node:crypto';
import { CHARACTER_PERSONAS } from '../game/avatarLogic';
import { BOARD_TILES, CHANCE_CARDS } from '../game/boardData';
import {
  ClientToServerMessage,
  LobbySeatInfo,
  OnlineGameAction,
  OnlineMatchSnapshot,
  OnlineRoomSnapshot,
  OnlineRoomStatus,
  OnlineSoundEffect,
  OnlineVisualEvent,
  ServerToClientMessage,
  TokenArchetype,
} from '../game/onlineTypes';
import {
  applyChampionshipHost,
  applyEarthquakeToTile,
  applyPowerOutageToTile,
  applyShieldToTile,
  botChooseJailAction,
  botPickChampionshipTarget,
  botPickInitialPurchaseTier,
  botPickOnTileUpgradeTargetLevel,
  botPickStartUpgradePlan,
  botPickTacticalCardTarget,
  botPickWorldTourTarget,
  botShouldBuyoutProperty,
  botShouldBuyProperty,
  buildBotBuyQuipPayload,
  buildBotPenaltyQuipPayload,
  buildBotRentCollectedQuipPayload,
  calculateBankruptcyCreditorPayout,
  calculateRent,
  calculatePropertyInvestedValue,
  calculateTaxAmount,
  canBuyoutProperty,
  canUpgradeProperty,
  CHAMPIONSHIP_FEE,
  clearDisownedModifiers,
  clearTileOutage,
  computeForwardSteps,
  computeOptimalAutoSale,
  computePathToTile,
  computeTokenHopTiming,
  createDefaultBoardModifiers,
  createInitialProperties,
  evaluateMatchWinner,
  formatBusinessTourCompact,
  formatBusinessTourSpaced,
  getNextActivePlayerIndex,
  getStartUpgradableTileIndices,
  getValidTacticalCardTargets,
  isPurchasableTile,
  isValidWorldTourTarget,
  JAIL_FINE,
  LOST_ISLAND_TILE_INDEX,
  MAX_JAIL_TURNS,
  MIN_BIG_RENT_FOR_QUIP,
  resolveIslandRollOutcome,
  resolveWorldTourMovement,
  shouldGrantImmediateDoublesRoll,
  START_SALARY,
  TURN_COUNTDOWN_SECONDS,
  WORLD_TOUR_FEE,
  WORLD_TOUR_TILE_INDEX,
} from '../game/rules';
import {
  BotQuipPayload,
  GameLogEntry,
  LuckCard,
  MatchBoardModifiers,
  MatchWinnerResult,
  PendingDebt,
  PlayerState,
  PropertyState,
  TacticalCardActionKind,
  TileKind,
  TurnPhase,
} from '../game/types';
import { generateOfflineBotQuip } from '../game/visualTheme';

const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const ALL_TOKENS: TokenArchetype[] = ['car', 'yacht', 'jet', 'crown'];
const DISCONNECT_BOT_TAKEOVER_MS = 90_000;
const EMPTY_LOBBY_CLEANUP_MS = 10_000;

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

function sanitizePlayerName(raw: string | undefined, fallback: string): string {
  const cleaned = (raw || '').replace(/\s+/g, ' ').trim().slice(0, 22);
  return cleaned.length > 0 ? cleaned : fallback;
}

function normalizeMaxPlayers(val: unknown): 2 | 3 | 4 {
  if (val === 2 || val === 3 || val === 4) return val;
  return 4;
}

function normalizeStartingCash(val: unknown): number {
  return val === 3_000_000 ? 3_000_000 : 2_000_000;
}

interface HumanSeatRecord {
  seatIndex: number;
  sessionToken: string;
  clientId: string | null;
  playerName: string;
  tokenType: TokenArchetype;
  connected: boolean;
  disconnectedAt: number | null;
  explicitlyLeft: boolean;
  playerId: number | null;
}

interface MatchRecord {
  players: PlayerState[];
  properties: Record<number, PropertyState>;
  activePlayerIndex: number;
  turnPhase: TurnPhase;
  turnCount: number;
  lastDice: [number, number] | null;
  lastDiceSum: number;
  lastRentPaid: number;
  boardModifiers: MatchBoardModifiers;
  isFreeChampionship: boolean;
  upgradeTargetTileIndex: number | null;
  pendingTacticalCard: TacticalCardActionKind | null;
  turnTimeLeft: number;
  drawnCard: LuckCard | null;
  pendingDebt: PendingDebt | null;
  matchWinnerResult: MatchWinnerResult | null;
  logs: GameLogEntry[];
  landingCueText: string | null;
  chanceDeck: LuckCard[];
  nextLogId: number;
  missedTurnsByPlayer: Record<number, number>;
}

interface RoomRecord {
  roomCode: string;
  status: OnlineRoomStatus;
  maxPlayers: 2 | 3 | 4;
  startingCash: number;
  fillBots: boolean;
  hostSeatIndex: number;
  humans: HumanSeatRecord[];
  match: MatchRecord | null;
  matchEpoch: number;
  eventSeq: number;
  pendingTimers: Set<ReturnType<typeof setTimeout>>;
  botActionTimer: ReturnType<typeof setTimeout> | null;
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
  }

  private clearRoomTimers(room: RoomRecord): void {
    for (const t of room.pendingTimers) {
      clearTimeout(t);
    }
    room.pendingTimers.clear();
    if (room.botActionTimer) {
      clearTimeout(room.botActionTimer);
      room.botActionTimer = null;
    }
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
    return new Promise((resolve) => {
      this.scheduleRoomTimeout(room, rawMs, () => {
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

  private buildRoomSnapshot(room: RoomRecord): OnlineRoomSnapshot {
    const usedByHumans = new Set(room.humans.map((h) => h.tokenType));
    const freeTokens = ALL_TOKENS.filter((t) => !usedByHumans.has(t));
    let freeTokenIdx = 0;

    const seats: LobbySeatInfo[] = [];
    for (let s = 0; s < room.maxPlayers; s++) {
      const human = room.humans.find((h) => h.seatIndex === s);
      if (human) {
        const meta = TOKEN_COLORS[human.tokenType];
        seats.push({
          seatIndex: s,
          occupiedByHuman: true,
          playerName: human.playerName,
          tokenType: human.tokenType,
          color: meta.color,
          colorName: meta.colorName,
          connected: human.connected,
          isHost: s === room.hostSeatIndex,
        });
      } else {
        const tok = freeTokens[freeTokenIdx++] || ALL_TOKENS[s % ALL_TOKENS.length];
        const meta = TOKEN_COLORS[tok];
        const persona = CHARACTER_PERSONAS[tok];
        seats.push({
          seatIndex: s,
          occupiedByHuman: false,
          playerName: room.fillBots ? persona.botDefaultName : 'Đang chờ người chơi...',
          tokenType: tok,
          color: meta.color,
          colorName: meta.colorName,
          connected: false,
          isHost: false,
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
          lastDice: room.match.lastDice,
          lastDiceSum: room.match.lastDiceSum,
          lastRentPaid: room.match.lastRentPaid,
          boardModifiers: room.match.boardModifiers,
          isFreeChampionship: room.match.isFreeChampionship,
          upgradeTargetTileIndex: room.match.upgradeTargetTileIndex,
          pendingTacticalCard: room.match.pendingTacticalCard,
          turnTimeLeft: room.match.turnTimeLeft,
          drawnCard: room.match.drawnCard,
          pendingDebt: room.match.pendingDebt,
          matchWinnerResult: room.match.matchWinnerResult,
          logs: room.match.logs,
          landingCueText: room.match.landingCueText,
        }
      : null;

    return {
      roomCode: room.roomCode,
      status: room.status,
      maxPlayers: room.maxPlayers,
      startingCash: room.startingCash,
      fillBots: room.fillBots,
      seats,
      hostSeatIndex: room.hostSeatIndex,
      match: matchSnap,
    };
  }

  private broadcastSnapshot(room: RoomRecord): void {
    const snapshot = this.buildRoomSnapshot(room);
    for (const h of room.humans) {
      if (h.connected && h.clientId) {
        this.sendMessage(h.clientId, {
          type: 'ROOM_SNAPSHOT',
          yourSeatIndex: h.seatIndex,
          yourPlayerId: h.playerId,
          snapshot,
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
  ): void {
    room.eventSeq += 1;
    const event = {
      ...eventPayload,
      eventSeq: room.eventSeq,
    } as OnlineVisualEvent;

    for (const h of room.humans) {
      if (h.connected && h.clientId) {
        this.sendMessage(h.clientId, { type: 'GAME_EVENT', event });
      }
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
    if (msg.type === 'PING') {
      this.sendMessage(clientId, { type: 'PONG' });
      return;
    }

    if (msg.type === 'CREATE_ROOM') {
      this.detachClientIfAny(clientId, false);
      const roomCode = this.generateUniqueRoomCode();
      const tokenType = isTokenArchetype(msg.tokenType) ? msg.tokenType : 'car';
      const sessionToken = crypto.randomBytes(18).toString('hex');
      const creator: HumanSeatRecord = {
        seatIndex: 0,
        sessionToken,
        clientId,
        playerName: sanitizePlayerName(msg.playerName, 'Chủ phòng'),
        tokenType,
        connected: true,
        disconnectedAt: null,
        explicitlyLeft: false,
        playerId: null,
      };

      const room: RoomRecord = {
        roomCode,
        status: 'lobby',
        maxPlayers: normalizeMaxPlayers(msg.maxPlayers),
        startingCash: normalizeStartingCash(msg.startingCash),
        fillBots: Boolean(msg.fillBots),
        hostSeatIndex: 0,
        humans: [creator],
        match: null,
        matchEpoch: 1,
        eventSeq: 0,
        pendingTimers: new Set(),
        botActionTimer: null,
        cleanupTimer: null,
      };

      this.rooms.set(roomCode, room);
      this.clientSessions.set(clientId, { roomCode, sessionToken });

      this.sendMessage(clientId, {
        type: 'ROOM_JOINED',
        roomCode,
        sessionToken,
        yourSeatIndex: 0,
        yourPlayerId: null,
        snapshot: this.buildRoomSnapshot(room),
      });
      return;
    }

    if (msg.type === 'JOIN_ROOM') {
      const code = (msg.roomCode || '').trim().toUpperCase();
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

      this.detachClientIfAny(clientId, false);

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

      if (room.cleanupTimer) {
        clearTimeout(room.cleanupTimer);
        room.cleanupTimer = null;
      }

      const tokenType = this.pickAvailableToken(room, msg.tokenType);
      const sessionToken = crypto.randomBytes(18).toString('hex');
      const joiner: HumanSeatRecord = {
        seatIndex: freeSeat,
        sessionToken,
        clientId,
        playerName: sanitizePlayerName(msg.playerName, `Người chơi ${freeSeat + 1}`),
        tokenType,
        connected: true,
        disconnectedAt: null,
        explicitlyLeft: false,
        playerId: null,
      };

      room.humans.push(joiner);
      this.clientSessions.set(clientId, { roomCode: room.roomCode, sessionToken });

      this.sendMessage(clientId, {
        type: 'ROOM_JOINED',
        roomCode: room.roomCode,
        sessionToken,
        yourSeatIndex: freeSeat,
        yourPlayerId: null,
        snapshot: this.buildRoomSnapshot(room),
      });
      this.broadcastSnapshot(room);
      return;
    }

    if (msg.type === 'RECONNECT_ROOM') {
      const code = (msg.roomCode || '').trim().toUpperCase();
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

      if (seat.clientId && seat.clientId !== clientId) {
        this.clientSessions.delete(seat.clientId);
      }
      if (room.cleanupTimer) {
        clearTimeout(room.cleanupTimer);
        room.cleanupTimer = null;
      }

      seat.clientId = clientId;
      seat.connected = true;
      seat.disconnectedAt = null;
      this.clientSessions.set(clientId, { roomCode: room.roomCode, sessionToken: seat.sessionToken });

      if (room.match && seat.playerId !== null) {
        const player = room.match.players.find((p) => p.id === seat.playerId);
        if (player) {
          player.onlineConnected = true;
          room.match.missedTurnsByPlayer[player.id] = 0;
          if (player.onlineBotTakeover && !player.bankrupt) {
            player.isBot = false;
            player.onlineBotTakeover = false;
            this.addLog(room, `🟢 ${player.name} đã kết nối lại ván đấu!`, player.color, 'positive');
          }
        }
      }

      this.sendMessage(clientId, {
        type: 'ROOM_JOINED',
        roomCode: room.roomCode,
        sessionToken: seat.sessionToken,
        yourSeatIndex: seat.seatIndex,
        yourPlayerId: seat.playerId,
        snapshot: this.buildRoomSnapshot(room),
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
      this.sendError(clientId, 'ROOM_NOT_FOUND', 'Phòng không còn tồn tại.');
      return;
    }
    const seat = room.humans.find((h) => h.sessionToken === session.sessionToken);
    if (!seat) {
      this.clientSessions.delete(clientId);
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

      if (msg.maxPlayers !== undefined) {
        const targetMax = normalizeMaxPlayers(msg.maxPlayers);
        if (targetMax < room.humans.length) {
          this.sendError(
            clientId,
            'INVALID_MAX_PLAYERS',
            'Số người tối đa không thể nhỏ hơn số người đang có mặt trong phòng.'
          );
          return;
        }
        room.maxPlayers = targetMax;
        // Compact seats downward if any human currently sits at >= targetMax
        const sorted = [...room.humans].sort((a, b) => a.seatIndex - b.seatIndex);
        for (const h of sorted) {
          if (h.seatIndex >= targetMax) {
            for (let s = 0; s < targetMax; s++) {
              if (!room.humans.some((other) => other !== h && other.seatIndex === s)) {
                const wasHost = h.seatIndex === room.hostSeatIndex;
                h.seatIndex = s;
                if (wasHost) room.hostSeatIndex = s;
                break;
              }
            }
          }
        }
      }

      if (msg.startingCash !== undefined) {
        room.startingCash = normalizeStartingCash(msg.startingCash);
      }
      if (msg.fillBots !== undefined) {
        room.fillBots = Boolean(msg.fillBots);
      }
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
      this.returnRoomToLobby(room);
      return;
    }

    if (msg.type === 'SEND_EMOTE') {
      if (room.status !== 'playing' || !room.match || seat.playerId === null) return;
      const emoteText = (msg.emoteText || '').replace(/\s+/g, ' ').trim().slice(0, 48);
      if (!emoteText) return;
      this.emitVisualEvent(room, {
        kind: 'PLAYER_EMOTE',
        playerId: seat.playerId,
        playerName: seat.playerName,
        emoteText,
      });
      return;
    }

    if (msg.type === 'GAME_ACTION') {
      this.handleHumanGameAction(room, seat, clientId, msg.action);
    }
  }

  public handleDisconnect(clientId: string): void {
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
    seat.disconnectedAt = Date.now();

    if (room.match && seat.playerId !== null) {
      const player = room.match.players.find((p) => p.id === seat.playerId);
      if (player) {
        player.onlineConnected = false;
      }
    }

    // In lobby, promote another connected human to host if host disconnected
    if (room.status === 'lobby' && seat.seatIndex === room.hostSeatIndex) {
      const nextHost = room.humans.find((h) => h.connected && h !== seat);
      if (nextHost) {
        room.hostSeatIndex = nextHost.seatIndex;
      }
    }

    this.broadcastSnapshot(room);

    if (scheduleGraceCleanup) {
      const anyConnected = room.humans.some((h) => h.connected);
      if (!anyConnected && !room.cleanupTimer) {
        const waitMs = room.status === 'lobby' ? EMPTY_LOBBY_CLEANUP_MS : DISCONNECT_BOT_TAKEOVER_MS;
        room.cleanupTimer = this.scheduleRoomTimeout(room, waitMs, () => {
          room.cleanupTimer = null;
          if (!room.humans.some((h) => h.connected)) {
            this.clearRoomTimers(room);
            this.rooms.delete(room.roomCode);
          }
        });
      }
    }
  }

  private handleExplicitLeave(room: RoomRecord, seat: HumanSeatRecord, clientId: string): void {
    this.clientSessions.delete(clientId);
    this.sendMessage(clientId, { type: 'LEFT_ROOM' });

    if (room.status === 'lobby') {
      room.humans = room.humans.filter((h) => h !== seat);
      if (room.humans.length === 0) {
        this.clearRoomTimers(room);
        this.rooms.delete(room.roomCode);
        return;
      }
      if (seat.seatIndex === room.hostSeatIndex) {
        const nextHost =
          room.humans.find((h) => h.connected) ||
          [...room.humans].sort((a, b) => a.seatIndex - b.seatIndex)[0];
        room.hostSeatIndex = nextHost.seatIndex;
      }
      this.broadcastSnapshot(room);
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

    const activeHumans = room.humans.filter((h) => !h.explicitlyLeft && h.connected);
    if (activeHumans.length === 0) {
      this.clearRoomTimers(room);
      this.rooms.delete(room.roomCode);
      return;
    }

    if (seat.seatIndex === room.hostSeatIndex) {
      const nextHost = activeHumans[0];
      if (nextHost) room.hostSeatIndex = nextHost.seatIndex;
    }

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
    room.humans = room.humans.filter((h) => !h.explicitlyLeft && h.connected);
    for (const h of room.humans) {
      h.playerId = null;
    }
    if (room.humans.length === 0) {
      this.rooms.delete(room.roomCode);
      return;
    }
    if (!room.humans.some((h) => h.seatIndex === room.hostSeatIndex)) {
      room.hostSeatIndex = room.humans[0].seatIndex;
    }
    this.broadcastSnapshot(room);
  }

  private startMatch(room: RoomRecord, requesterClientId: string): void {
    const orderedHumans = [...room.humans]
      .filter((h) => !h.explicitlyLeft)
      .sort((a, b) => a.seatIndex - b.seatIndex);

    const botSlotsNeeded = room.fillBots ? Math.max(0, room.maxPlayers - orderedHumans.length) : 0;
    const totalCount = orderedHumans.length + botSlotsNeeded;

    if (totalCount < 2) {
      this.sendError(
        requesterClientId,
        'NOT_ENOUGH_PLAYERS',
        'Cần ít nhất 2 người chơi (hoặc bật "Bù Bot AI") để bắt đầu ván đấu!'
      );
      return;
    }

    room.matchEpoch += 1;
    this.clearRoomTimers(room);

    const players: PlayerState[] = [];
    const usedTokens = new Set<TokenArchetype>(orderedHumans.map((h) => h.tokenType));

    for (let i = 0; i < orderedHumans.length; i++) {
      const h = orderedHumans[i];
      const meta = TOKEN_COLORS[h.tokenType];
      h.playerId = i;
      players.push({
        id: i,
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
        onlineConnected: h.connected,
        onlineBotTakeover: false,
      });
    }

    const remainingTokens = ALL_TOKENS.filter((t) => !usedTokens.has(t));
    for (let b = 0; b < botSlotsNeeded; b++) {
      const tok = remainingTokens[b] || ALL_TOKENS[(orderedHumans.length + b) % ALL_TOKENS.length];
      const meta = TOKEN_COLORS[tok];
      const persona = CHARACTER_PERSONAS[tok];
      const botId = players.length;
      players.push({
        id: botId,
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
      });
    }

    room.status = 'playing';
    room.match = {
      players,
      properties: createInitialProperties(),
      activePlayerIndex: 0,
      turnPhase: 'AWAIT_ROLL',
      turnCount: 1,
      lastDice: null,
      lastDiceSum: 0,
      lastRentPaid: 0,
      boardModifiers: createDefaultBoardModifiers(),
      isFreeChampionship: false,
      upgradeTargetTileIndex: null,
      pendingTacticalCard: null,
      turnTimeLeft: TURN_COUNTDOWN_SECONDS,
      drawnCard: null,
      pendingDebt: null,
      matchWinnerResult: null,
      logs: [
        {
          id: 1,
          turn: 1,
          text: `Ván đấu Online Phòng ${room.roomCode} bắt đầu với ${players.length} tỷ phú · Ngân sách ${formatBusinessTourSpaced(room.startingCash)}!`,
          tone: 'highlight',
        },
      ],
      landingCueText: null,
      chanceDeck: shuffleCards(CHANCE_CARDS),
      nextLogId: 2,
      missedTurnsByPlayer: {},
    };

    this.broadcastSnapshot(room);
    this.scheduleBotTurnIfNeeded(room);
  }

  private handleHumanGameAction(
    room: RoomRecord,
    seat: HumanSeatRecord,
    clientId: string,
    action: OnlineGameAction
  ): void {
    const match = room.match;
    if (room.status !== 'playing' || !match || seat.playerId === null) {
      this.sendError(clientId, 'INVALID_STATE', 'Phòng chưa ở trạng thái đang chơi.');
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
    if (match.turnPhase === 'ROLLING_DICE' || match.turnPhase === 'MOVING_TOKEN') {
      return;
    }

    match.missedTurnsByPlayer[activePlayer.id] = 0;
    this.executeAction(room, action);
  }

  private executeAction(room: RoomRecord, action: OnlineGameAction): void {
    const match = room.match;
    if (!match || room.status !== 'playing') return;

    const activePlayer = match.players[match.activePlayerIndex];
    if (!activePlayer || activePlayer.bankrupt) return;

    switch (action.kind) {
      case 'ROLL_DICE':
        if (match.turnPhase !== 'AWAIT_ROLL') return;
        void this.performRollDice(room, room.matchEpoch);
        return;

      case 'PAY_JAIL_FINE':
        if (match.turnPhase !== 'AWAIT_ROLL' || !activePlayer.inJail || activePlayer.cash < JAIL_FINE) {
          return;
        }
        activePlayer.cash -= JAIL_FINE;
        activePlayer.inJail = false;
        activePlayer.jailTurns = 0;
        activePlayer.doublesStreak = 0;
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
        return;

      case 'USE_JAIL_CARD':
        if (match.turnPhase !== 'AWAIT_ROLL' || !activePlayer.inJail || activePlayer.jailFreeCards <= 0) {
          return;
        }
        activePlayer.jailFreeCards -= 1;
        activePlayer.inJail = false;
        activePlayer.jailTurns = 0;
        activePlayer.doublesStreak = 0;
        this.emitSound(room, 'cardDraw');
        this.addLog(
          room,
          `${activePlayer.name} sử dụng Thẻ Thoát Đảo để rời Đảo Hoang!`,
          activePlayer.color,
          'positive'
        );
        this.broadcastSnapshot(room);
        this.scheduleBotTurnIfNeeded(room);
        return;

      case 'BUY_PROPERTY':
        if (match.turnPhase !== 'BUY_DECISION') return;
        this.performBuyProperty(room, action.initialLevel);
        return;

      case 'SKIP_BUY':
        if (match.turnPhase !== 'BUY_DECISION') return;
        this.addLog(
          room,
          `${activePlayer.name} bỏ qua cơ hội mua ${BOARD_TILES[activePlayer.position]?.name || ''}.`,
          activePlayer.color
        );
        this.completeTurnAfterAction(room, activePlayer);
        return;

      case 'SELECT_START_UPGRADE_CITY':
        if (match.turnPhase !== 'START_UPGRADE_SELECTION') return;
        this.performSelectStartUpgradeCity(room, action.targetTile);
        return;

      case 'BACK_TO_START_UPGRADE':
        if (match.turnPhase !== 'UPGRADE_DECISION' || match.upgradeTargetTileIndex === null) return;
        match.upgradeTargetTileIndex = null;
        match.turnPhase = 'START_UPGRADE_SELECTION';
        this.ensureSubPhaseTimeFloor(match, 18);
        this.broadcastSnapshot(room);
        this.scheduleBotTurnIfNeeded(room);
        return;

      case 'SKIP_START_UPGRADE':
        if (match.turnPhase !== 'START_UPGRADE_SELECTION') return;
        match.upgradeTargetTileIndex = null;
        this.addLog(
          room,
          `${activePlayer.name} bỏ qua đặc quyền nâng cấp thành phố tại ô BẮT ĐẦU.`,
          activePlayer.color
        );
        this.completeTurnAfterAction(room, activePlayer);
        return;

      case 'UPGRADE_PROPERTY':
        if (match.turnPhase !== 'UPGRADE_DECISION') return;
        this.performOnTileUpgrade(room, action.targetLevel);
        return;

      case 'SKIP_UPGRADE':
        if (match.turnPhase !== 'UPGRADE_DECISION') return;
        match.upgradeTargetTileIndex = null;
        this.completeTurnAfterAction(room, activePlayer);
        return;

      case 'CONFIRM_BUYOUT':
        if (match.turnPhase !== 'BUYOUT_DECISION') return;
        this.performConfirmBuyout(room);
        return;

      case 'SKIP_BUYOUT':
        if (match.turnPhase !== 'BUYOUT_DECISION') return;
        this.completeTurnAfterAction(room, activePlayer);
        return;

      case 'CONFIRM_CHAMPIONSHIP':
        if (match.turnPhase !== 'CHAMPIONSHIP_SELECTION') return;
        this.performConfirmChampionship(room, action.targetTile);
        return;

      case 'SKIP_CHAMPIONSHIP':
        if (match.turnPhase !== 'CHAMPIONSHIP_SELECTION') return;
        match.isFreeChampionship = false;
        this.addLog(room, `${activePlayer.name} bỏ qua quyền đăng cai Cúp Quốc Gia.`, activePlayer.color);
        this.completeTurnAfterAction(room, activePlayer);
        return;

      case 'SELECT_WORLD_TOUR':
        if (match.turnPhase !== 'WORLD_TOUR') return;
        void this.performWorldTour(room, action.targetTile, room.matchEpoch);
        return;

      case 'SKIP_WORLD_TOUR':
        if (match.turnPhase !== 'WORLD_TOUR') return;
        this.performSkipWorldTour(room);
        return;

      case 'CONFIRM_CARD':
        if (match.turnPhase !== 'CARD_REVEAL' || !match.drawnCard) return;
        void this.performConfirmCard(room, room.matchEpoch);
        return;

      case 'APPLY_TACTICAL_CARD':
        if (match.turnPhase !== 'CARD_TARGET_SELECTION' || !match.pendingTacticalCard) return;
        this.performApplyTacticalCard(room, action.targetTile);
        return;

      case 'SKIP_TACTICAL_CARD':
        if (match.turnPhase !== 'CARD_TARGET_SELECTION') return;
        match.pendingTacticalCard = null;
        this.addLog(room, `${activePlayer.name} bỏ qua tác động của thẻ chiến thuật.`, activePlayer.color);
        this.completeTurnAfterAction(room, activePlayer);
        return;

      case 'SELL_AND_PAY_DEBT':
        if (match.turnPhase !== 'DEBT_RESOLUTION' || !match.pendingDebt) return;
        this.performSellAndPayDebt(room, action.tileIndicesToSell);
        return;

      case 'DECLARE_BANKRUPTCY':
        if (match.turnPhase !== 'DEBT_RESOLUTION') return;
        this.performDeclareBankruptcy(room);
        return;

      case 'END_TURN':
        if (match.turnPhase !== 'AWAIT_END_TURN') return;
        this.performEndTurn(room);
        return;
    }
  }

  private async performRollDice(room: RoomRecord, epoch: number): Promise<void> {
    const match = room.match;
    if (!match || room.matchEpoch !== epoch) return;
    const player = match.players[match.activePlayerIndex];
    if (!player || player.bankrupt) return;

    const [die1, die2] = this.diceRng();
    const sum = die1 + die2;
    const isDoubles = die1 === die2;

    match.lastDice = [die1, die2];
    match.lastDiceSum = sum;
    match.turnPhase = 'ROLLING_DICE';
    this.emitVisualEvent(room, { kind: 'DICE_ROLLED', playerId: player.id, die1, die2 });
    this.broadcastSnapshot(room);

    if (!(await this.waitRoomBeat(room, 1450, epoch))) return;

    let moveSteps = sum;
    if (player.inJail) {
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
        moveSteps = outcome.moveSteps;
      } else {
        this.addLog(
          room,
          `${player.name} đổ (${die1}-${die2}) không ra đôi, tiếp tục ở Đảo Hoang (${outcome.nextJailTurns}/${MAX_JAIL_TURNS}).`,
          player.color
        );
        player.jailTurns = outcome.nextJailTurns;
        player.doublesStreak = 0;
        this.completeTurnAfterAction(room, player);
        return;
      }
    } else {
      const nextStreak = isDoubles ? player.doublesStreak + 1 : 0;
      if (nextStreak >= 3) {
        this.emitSound(room, 'jailAlert');
        this.addLog(
          room,
          `${player.name} đổ ra đôi 3 lần liên tiếp (${die1}-${die2}) — bị đưa thẳng ra Đảo Hoang!`,
          player.color,
          'negative'
        );
        match.turnPhase = 'MOVING_TOKEN';
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

      player.doublesStreak = nextStreak;
      this.addLog(
        room,
        `${player.name} đổ xúc xắc được ${die1} + ${die2} = ${sum}${isDoubles ? ' (Ra đôi!)' : ''}.`,
        player.color
      );
    }

    const { path, finalTile, passedStart } = computeForwardSteps(player.position, moveSteps);
    match.turnPhase = 'MOVING_TOKEN';
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
      const upgradable = getStartUpgradableTileIndices(player, match.properties);
      if (upgradable.length > 0) {
        this.addLog(
          room,
          `🏗️ ${player.name} dừng trực tiếp tại BẮT ĐẦU — được chọn nâng cấp ngay 1 thành phố sở hữu!`,
          player.color,
          'highlight'
        );
        match.landingCueText = '🏗️ Đặc quyền BẮT ĐẦU — Chọn thành phố nâng cấp!';
        this.broadcastSnapshot(room);
        if (!(await this.waitRoomBeat(room, 580, epoch))) return;
        match.landingCueText = null;
        match.upgradeTargetTileIndex = null;
        match.turnPhase = 'START_UPGRADE_SELECTION';
        this.ensureSubPhaseTimeFloor(match, 18);
        this.broadcastSnapshot(room);
        this.scheduleBotTurnIfNeeded(room);
        return;
      }
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
      if (ownsCity && player.cash >= CHAMPIONSHIP_FEE) {
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
        match.turnPhase = 'CHAMPIONSHIP_SELECTION';
        this.ensureSubPhaseTimeFloor(match, 18);
        this.broadcastSnapshot(room);
        this.scheduleBotTurnIfNeeded(room);
        return;
      }
      this.addLog(
        room,
        ownsCity
          ? `${player.name} dừng tại ${tile.name} nhưng không đủ ${formatBusinessTourCompact(CHAMPIONSHIP_FEE)} để đăng cai.`
          : `${player.name} dừng tại ${tile.name} (cần sở hữu ít nhất 1 Thành phố để đăng cai).`,
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
        match.turnPhase = 'BUY_DECISION';
        this.ensureSubPhaseTimeFloor(match, 18);
        this.broadcastSnapshot(room);
        this.scheduleBotTurnIfNeeded(room);
        return;
      }

      if (prop.ownerId === player.id) {
        if (match.boardModifiers.outageTileIndices?.includes(tileIndex)) {
          match.boardModifiers = clearTileOutage(match.boardModifiers, tileIndex);
          this.addLog(
            room,
            `🔌 Đã khôi phục điện lưới tại ${tile.name}!`,
            player.color,
            'positive'
          );
        }
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
          match.upgradeTargetTileIndex = null;
          match.turnPhase = 'UPGRADE_DECISION';
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
        if (canBuyoutProperty(player, tileIndex, match.properties, match.boardModifiers).allowed) {
          match.turnPhase = 'BUYOUT_DECISION';
          this.ensureSubPhaseTimeFloor(match, 18);
          this.broadcastSnapshot(room);
          this.scheduleBotTurnIfNeeded(room);
          return;
        }
        this.completeTurnAfterAction(room, player);
        return;
      }

      const rent = calculateRent(tileIndex, match.properties, match.boardModifiers);
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
      match.turnPhase = 'CARD_REVEAL';
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
        canBuyoutProperty(payer, originTileIndex, match.properties, match.boardModifiers).allowed
      ) {
        match.turnPhase = 'BUYOUT_DECISION';
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

    match.turnPhase = 'DEBT_RESOLUTION';
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

  private performSelectStartUpgradeCity(room: RoomRecord, targetTile: number): void {
    const match = room.match;
    if (!match) return;
    const player = match.players[match.activePlayerIndex];
    const upgradable = getStartUpgradableTileIndices(player, match.properties);
    if (!upgradable.includes(targetTile)) {
      return;
    }
    match.upgradeTargetTileIndex = targetTile;
    match.turnPhase = 'UPGRADE_DECISION';
    this.ensureSubPhaseTimeFloor(match, 18);
    this.broadcastSnapshot(room);
    this.scheduleBotTurnIfNeeded(room);
  }

  private performBuyProperty(room: RoomRecord, requestedInitialLevel: number): void {
    const match = room.match;
    if (!match) return;
    const player = match.players[match.activePlayerIndex];
    const tile = BOARD_TILES[player.position];
    const basePrice = tile?.price || 0;
    if (!tile) {
      this.completeTurnAfterAction(room, player);
      return;
    }

    const maxInitialLevel = tile.kind === TileKind.PROPERTY ? (player.laps === 0 ? 2 : 3) : 0;
    const safeLevel =
      tile.kind === TileKind.PROPERTY
        ? Math.max(0, Math.min(maxInitialLevel, Math.floor(requestedInitialLevel)))
        : 0;
    const totalCost = basePrice + safeLevel * (tile.houseCost ?? 0);

    if (player.cash < totalCost) {
      this.completeTurnAfterAction(room, player);
      return;
    }

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
  }

  private performOnTileUpgrade(room: RoomRecord, targetLevel: number): void {
    const match = room.match;
    if (!match) return;
    const player = match.players[match.activePlayerIndex];
    const isRemoteFromStart = match.upgradeTargetTileIndex !== null;
    const tileIndex = match.upgradeTargetTileIndex ?? player.position;
    match.upgradeTargetTileIndex = null;

    const check = canUpgradeProperty(player, tileIndex, match.properties, {
      isOnTileLanding: !isRemoteFromStart,
      allowRemoteFromStart: isRemoteFromStart,
      targetLevel,
    });
    if (!check.allowed) {
      this.completeTurnAfterAction(room, player);
      return;
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
  }

  private performConfirmBuyout(room: RoomRecord): void {
    const match = room.match;
    if (!match) return;
    const buyer = match.players[match.activePlayerIndex];
    const tileIndex = buyer.position;
    const prop = match.properties[tileIndex];
    const check = canBuyoutProperty(buyer, tileIndex, match.properties, match.boardModifiers);
    if (!check.allowed || !prop || prop.ownerId === null) {
      this.completeTurnAfterAction(room, buyer);
      return;
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
  }

  private performConfirmChampionship(room: RoomRecord, targetTile: number): void {
    const match = room.match;
    if (!match) return;
    const player = match.players[match.activePlayerIndex];
    const prop = match.properties[targetTile];
    const tile = BOARD_TILES[targetTile];
    const fee = match.isFreeChampionship ? 0 : CHAMPIONSHIP_FEE;
    if (
      !tile ||
      tile.kind !== TileKind.PROPERTY ||
      !prop ||
      prop.ownerId !== player.id ||
      player.cash < fee
    ) {
      match.isFreeChampionship = false;
      this.completeTurnAfterAction(room, player);
      return;
    }

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
    match.turnPhase = 'AWAIT_ROLL';
    this.broadcastSnapshot(room);
    this.scheduleBotTurnIfNeeded(room);
  }

  private async performWorldTour(room: RoomRecord, targetTile: number, epoch: number): Promise<void> {
    const match = room.match;
    if (!match || room.matchEpoch !== epoch) return;
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
      match.turnPhase = 'AWAIT_ROLL';
      this.broadcastSnapshot(room);
      this.scheduleBotTurnIfNeeded(room);
      return;
    }

    if (!isValidWorldTourTarget(player, targetTile, match.properties)) {
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

    match.turnPhase = 'MOVING_TOKEN';
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
    const player = match.players[match.activePlayerIndex];
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
      for (const p of match.players) {
        if (p.id === player.id || p.bankrupt) continue;
        const give = Math.min(Math.max(0, p.cash), eff.amountEach);
        p.cash -= give;
        collected += give;
      }
      player.cash += collected;
      this.emitSound(room, 'cashGain');
      this.addLog(
        room,
        `${player.name} nhận quà mừng tổng cộng +${formatBusinessTourCompact(collected)} từ các người chơi khác!`,
        player.color,
        'positive'
      );
      this.completeTurnAfterAction(room, player);
    } else if (eff.type === 'JAIL_FREE_CARD') {
      player.jailFreeCards += 1;
      this.addLog(room, `${player.name} cất giữ 1 Thẻ Thoát Đảo.`, player.color, 'positive');
      this.completeTurnAfterAction(room, player);
    } else if (eff.type === 'GO_TO_JAIL') {
      this.emitSound(room, 'jailAlert');
      match.turnPhase = 'MOVING_TOKEN';
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
      match.turnPhase = 'MOVING_TOKEN';
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
      match.turnPhase = 'CHAMPIONSHIP_SELECTION';
      this.ensureSubPhaseTimeFloor(match, 18);
      this.broadcastSnapshot(room);
      this.scheduleBotTurnIfNeeded(room);
    } else if (eff.type === 'GO_TO_WORLD_TOUR') {
      const { path, passedStart } = computePathToTile(player.position, WORLD_TOUR_TILE_INDEX, true);
      match.turnPhase = 'MOVING_TOKEN';
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
        match.boardModifiers
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
      match.turnPhase = 'CARD_TARGET_SELECTION';
      this.ensureSubPhaseTimeFloor(match, 18);
      this.broadcastSnapshot(room);
      this.scheduleBotTurnIfNeeded(room);
    }
  }

  private performApplyTacticalCard(room: RoomRecord, targetTile: number): void {
    const match = room.match;
    if (!match || !match.pendingTacticalCard) return;
    const player = match.players[match.activePlayerIndex];
    const kind = match.pendingTacticalCard;

    const validTargets = getValidTacticalCardTargets(
      kind,
      player.id,
      match.properties,
      match.boardModifiers
    );
    if (!validTargets.includes(targetTile)) {
      return;
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
      return;
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
      return;
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
  }

  private performSellAndPayDebt(room: RoomRecord, tileIndicesToSell: number[]): void {
    const match = room.match;
    if (!match || !match.pendingDebt) return;
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
    if (availableCash < amount) return;

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

    if (this.checkVictory(room)) return;

    if (
      originTileIndex !== undefined &&
      creditorId !== null &&
      canBuyoutProperty(player, originTileIndex, match.properties, match.boardModifiers).allowed
    ) {
      match.turnPhase = 'BUYOUT_DECISION';
      this.ensureSubPhaseTimeFloor(match, 18);
      this.broadcastSnapshot(room);
      this.scheduleBotTurnIfNeeded(room);
      return;
    }

    this.completeTurnAfterAction(room, player);
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
    match.upgradeTargetTileIndex = null;
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

    this.advanceToNextPlayerTurn(room);
  }

  private performEndTurn(room: RoomRecord): void {
    const match = room.match;
    if (!match) return;
    const current = match.players[match.activePlayerIndex];

    if (this.checkVictory(room)) return;

    if (shouldGrantImmediateDoublesRoll(current)) {
      this.addLog(
        room,
        `${current.name} được thưởng thêm 1 lượt đổ xúc xắc nhờ ra đôi!`,
        current.color,
        'highlight'
      );
      this.enterRollPhaseForPlayer(room, current);
      return;
    }

    this.advanceToNextPlayerTurn(room);
  }

  private advanceToNextPlayerTurn(room: RoomRecord): void {
    const match = room.match;
    if (!match) return;
    match.upgradeTargetTileIndex = null;
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
    match.upgradeTargetTileIndex = null;
    match.pendingTacticalCard = null;

    if (!player || player.bankrupt) {
      match.turnPhase = 'AWAIT_ROLL';
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
        match.turnPhase = 'WORLD_TOUR';
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

    match.turnPhase = 'AWAIT_ROLL';
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
    const result = evaluateMatchWinner(match.players, match.properties);
    if (!result) return false;

    match.matchWinnerResult = result;
    match.turnPhase = 'GAME_OVER';
    room.status = 'gameover';
    this.emitSound(room, 'victory');
    this.addLog(room, `🏆 ${result.winner.name} VÔ ĐỊCH — ${result.label}`, result.winner.color, 'highlight');
    this.broadcastSnapshot(room);
    return true;
  }

  private scheduleBotTurnIfNeeded(room: RoomRecord): void {
    const match = room.match;
    if (!match || room.status !== 'playing') return;
    const current = match.players[match.activePlayerIndex];
    if (!current || !current.isBot || current.bankrupt) return;

    if (room.botActionTimer) {
      clearTimeout(room.botActionTimer);
      room.botActionTimer = null;
    }

    const phase = match.turnPhase;
    if (phase === 'ROLLING_DICE' || phase === 'MOVING_TOKEN' || phase === 'GAME_OVER') return;

    const delayMs = phase === 'CARD_REVEAL' ? 2800 : 1250;
    const epoch = room.matchEpoch;
    room.botActionTimer = this.scheduleRoomTimeout(room, delayMs, () => {
      room.botActionTimer = null;
      if (room.matchEpoch !== epoch || room.status !== 'playing' || !room.match) return;
      const bot = room.match.players[room.match.activePlayerIndex];
      if (!bot || !bot.isBot || bot.bankrupt || room.match.turnPhase !== phase) return;

      if (phase === 'AWAIT_ROLL') {
        if (bot.inJail) {
          const decision = botChooseJailAction(bot);
          if (decision === 'USE_CARD') {
            this.executeAction(room, { kind: 'USE_JAIL_CARD' });
            return;
          }
          if (decision === 'PAY_FINE') {
            this.executeAction(room, { kind: 'PAY_JAIL_FINE' });
            return;
          }
        }
        this.executeAction(room, { kind: 'ROLL_DICE' });
      } else if (phase === 'BUY_DECISION') {
        if (botShouldBuyProperty(bot, bot.position, room.match.players, room.match.properties)) {
          const tier = botPickInitialPurchaseTier(bot, bot.position, room.match.properties);
          this.executeAction(room, { kind: 'BUY_PROPERTY', initialLevel: tier });
        } else {
          this.executeAction(room, { kind: 'SKIP_BUY' });
        }
      } else if (phase === 'START_UPGRADE_SELECTION') {
        const plan = botPickStartUpgradePlan(
          bot,
          room.match.properties,
          room.match.boardModifiers
        );
        if (plan) {
          this.executeAction(room, {
            kind: 'SELECT_START_UPGRADE_CITY',
            targetTile: plan.tileIndex,
          });
        } else {
          this.executeAction(room, { kind: 'SKIP_START_UPGRADE' });
        }
      } else if (phase === 'UPGRADE_DECISION') {
        const targetTile = room.match.upgradeTargetTileIndex ?? bot.position;
        if (room.match.upgradeTargetTileIndex !== null) {
          const plan = botPickStartUpgradePlan(
            bot,
            room.match.properties,
            room.match.boardModifiers
          );
          const lvl =
            plan && plan.tileIndex === targetTile
              ? plan.targetLevel
              : (room.match.properties[targetTile]?.level ?? 0) + 1;
          this.executeAction(room, { kind: 'UPGRADE_PROPERTY', targetLevel: lvl });
        } else {
          const lvl = botPickOnTileUpgradeTargetLevel(bot, targetTile, room.match.properties);
          if (lvl !== null) {
            this.executeAction(room, { kind: 'UPGRADE_PROPERTY', targetLevel: lvl });
          } else {
            this.executeAction(room, { kind: 'SKIP_UPGRADE' });
          }
        }
      } else if (phase === 'BUYOUT_DECISION') {
        if (
          botShouldBuyoutProperty(
            bot,
            bot.position,
            room.match.players,
            room.match.properties,
            room.match.boardModifiers
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
          room.match.isFreeChampionship
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
          room.match.players
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
          room.match.boardModifiers
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
          room.match.boardModifiers
        );
        if (!plan.sufficient) {
          this.executeAction(room, { kind: 'DECLARE_BANKRUPTCY' });
        } else {
          this.executeAction(room, {
            kind: 'SELL_AND_PAY_DEBT',
            tileIndicesToSell: plan.tileIndicesToSell,
          });
        }
      } else if (phase === 'AWAIT_END_TURN') {
        this.executeAction(room, { kind: 'END_TURN' });
      }
    });
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

  public tickOneSecond(): void {
    const now = Date.now();
    for (const room of this.rooms.values()) {
      const match = room.match;
      if (room.status !== 'playing' || !match) continue;

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
        this.broadcastSnapshot(room);
        this.scheduleBotTurnIfNeeded(room);
      }

      if (
        match.turnPhase === 'ROLLING_DICE' ||
        match.turnPhase === 'MOVING_TOKEN' ||
        match.turnPhase === 'GAME_OVER'
      ) {
        continue;
      }

      const active = match.players[match.activePlayerIndex];
      if (!active || active.bankrupt) continue;

      // Speed up offline human wait slightly (cap at 12s)
      if (!active.isBot && active.onlineConnected === false && match.turnTimeLeft > 12) {
        match.turnTimeLeft = 12;
        this.broadcastSnapshot(room);
        continue;
      }

      if (match.turnTimeLeft > 1) {
        match.turnTimeLeft -= 1;
        continue;
      }

      match.turnTimeLeft = 0;

      if (!active.isBot) {
        const missed = (match.missedTurnsByPlayer[active.id] || 0) + 1;
        match.missedTurnsByPlayer[active.id] = missed;

        if (active.onlineConnected === false && missed >= 2) {
          active.isBot = true;
          active.onlineBotTakeover = true;
          this.addLog(
            room,
            `🤖 ${active.name} mất kết nối lâu — Bot AI tạm thời tiếp quản!`,
            active.color,
            'neutral'
          );
        }

        const phase = match.turnPhase;
        if (phase === 'AWAIT_ROLL') {
          match.turnTimeLeft = 15;
          this.executeAction(room, { kind: 'ROLL_DICE' });
        } else if (phase === 'BUY_DECISION') {
          this.executeAction(room, { kind: 'SKIP_BUY' });
        } else if (phase === 'START_UPGRADE_SELECTION') {
          this.executeAction(room, { kind: 'SKIP_START_UPGRADE' });
        } else if (phase === 'UPGRADE_DECISION') {
          this.executeAction(room, { kind: 'SKIP_UPGRADE' });
        } else if (phase === 'BUYOUT_DECISION') {
          this.executeAction(room, { kind: 'SKIP_BUYOUT' });
        } else if (phase === 'CHAMPIONSHIP_SELECTION') {
          this.executeAction(room, { kind: 'SKIP_CHAMPIONSHIP' });
        } else if (phase === 'WORLD_TOUR') {
          match.turnTimeLeft = 15;
          this.executeAction(room, { kind: 'SKIP_WORLD_TOUR' });
        } else if (phase === 'CARD_REVEAL') {
          match.turnTimeLeft = 15;
          this.executeAction(room, { kind: 'CONFIRM_CARD' });
        } else if (phase === 'CARD_TARGET_SELECTION') {
          this.executeAction(room, { kind: 'SKIP_TACTICAL_CARD' });
        } else if (phase === 'DEBT_RESOLUTION' && match.pendingDebt) {
          match.turnTimeLeft = 15;
          const cashNeeded = Math.max(0, match.pendingDebt.amount - Math.max(0, active.cash));
          const plan = computeOptimalAutoSale(
            active.id,
            cashNeeded,
            match.properties,
            match.boardModifiers
          );
          if (!plan.sufficient) {
            this.executeAction(room, { kind: 'DECLARE_BANKRUPTCY' });
          } else {
            this.executeAction(room, {
              kind: 'SELL_AND_PAY_DEBT',
              tileIndicesToSell: plan.tileIndicesToSell,
            });
          }
        } else if (phase === 'AWAIT_END_TURN') {
          this.executeAction(room, { kind: 'END_TURN' });
        }
      }
    }
  }
}
