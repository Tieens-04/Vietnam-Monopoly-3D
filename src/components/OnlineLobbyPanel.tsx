import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowLeftRight,
  ArrowRight,
  Check,
  Clock,
  Copy,
  Crown,
  Dices,
  Eye,
  Link2,
  LogIn,
  Mic,
  Pencil,
  RotateCcw,
  Sparkles,
  UserX,
  X,
} from 'lucide-react';
import { CHARACTER_PERSONAS } from '../game/avatarLogic';
import { BotDifficulty, TokenArchetype } from '../game/onlineTypes';
import { formatBusinessTourSpaced } from '../game/rules';
import { MatchMode } from '../game/types';
import type { useOnlineMultiplayer } from '../utils/onlineClient';
import { ToggleSwitch } from './GameUiPrimitives';
import { PlayerAvatar3D } from './PlayerAvatar3D';

const ALL_TOKENS: TokenArchetype[] = ['car', 'yacht', 'jet', 'crown'];

const TOKEN_SIGNATURE_HEX: Record<TokenArchetype, string> = {
  car: '#F5B800',
  yacht: '#66C61C',
  jet: '#E91E63',
  crown: '#29B6F6',
};

const BOT_DIFFICULTY_OPTIONS: ReadonlyArray<{
  value: BotDifficulty;
  label: string;
  activeBtnClass: string;
  badgeClass: string;
}> = [
  {
    value: 'easy',
    label: 'Tập sự',
    activeBtnClass: 'bt-segment-active-light',
    badgeClass: 'bg-slate-100 border-slate-300 text-slate-800',
  },
  {
    value: 'normal',
    label: 'Sành sỏi',
    activeBtnClass: 'bt-segment-active-light ring-1 ring-amber-400/80 text-amber-900',
    badgeClass: 'bg-amber-50 border-amber-300 text-amber-900',
  },
  {
    value: 'hard',
    label: 'Cá mập',
    activeBtnClass: 'bt-segment-active-light ring-1 ring-rose-400/80 text-rose-800',
    badgeClass: 'bg-rose-50 border-rose-300 text-rose-800',
  },
];

interface BotDifficultyPickerProps {
  value: BotDifficulty;
  disabled: boolean;
  showBadge: boolean;
  onSelect: (difficulty: BotDifficulty) => void;
}

const BotDifficultyPicker: React.FC<BotDifficultyPickerProps> = ({
  value,
  disabled,
  showBadge,
  onSelect,
}) => {
  const activeMeta =
    BOT_DIFFICULTY_OPTIONS.find((opt) => opt.value === value) ?? BOT_DIFFICULTY_OPTIONS[1];

  return (
    <div>
      <div className="flex items-center justify-between gap-2 mb-1">
        <span className="text-[11px] font-bold text-[#525e73]">Độ khó Bot AI</span>
        {showBadge && (
          <span
            data-testid="bt-bot-difficulty-badge"
            className={`px-2 py-0.5 rounded-md border text-[10px] font-extrabold uppercase ${activeMeta.badgeClass}`}
          >
            {activeMeta.label}
          </span>
        )}
      </div>
      <div className="bt-segment-well grid grid-cols-3 gap-1 p-1 rounded-xl">
        {BOT_DIFFICULTY_OPTIONS.map((opt) => {
          const isSelected = value === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              data-testid={`bt-bot-difficulty-${opt.value}`}
              disabled={disabled}
              aria-pressed={isSelected}
              onClick={() => {
                if (!disabled && !isSelected) {
                  onSelect(opt.value);
                }
              }}
              className={`py-1.5 px-1.5 rounded-lg text-[11px] font-extrabold uppercase transition-all whitespace-nowrap ${
                isSelected
                  ? opt.activeBtnClass
                  : 'text-[#4b566a] hover:bg-white/60 disabled:opacity-45'
              } ${disabled ? 'cursor-not-allowed' : 'cursor-pointer'}`}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
};

interface OnlineLobbyPanelProps {
  online: ReturnType<typeof useOnlineMultiplayer>;
  voiceBarNode?: React.ReactNode;
  onlineChatNode?: React.ReactNode;
  speakingParticipantIds?: Record<string, boolean>;
}

export const OnlineLobbyPanel: React.FC<OnlineLobbyPanelProps> = ({
  online,
  voiceBarNode,
  onlineChatNode,
  speakingParticipantIds,
}) => {
  const [nickname, setNickname] = useState<string>(
    () => online.savedPlayerName || 'Tỷ Phú Mới'
  );
  const [selectedToken, setSelectedToken] = useState<TokenArchetype>('car');
  const [maxPlayers, setMaxPlayers] = useState<2 | 3 | 4>(4);
  const [matchMode, setMatchMode] = useState<MatchMode>('FFA');
  const [tacticalDiceEnabled, setTacticalDiceEnabled] = useState<boolean>(false);
  const [festivalEnabled, setFestivalEnabled] = useState<boolean>(false);
  const [startingCash, setStartingCash] = useState<number>(2_000_000);
  const [fillBots, setFillBots] = useState<boolean>(true);
  const [botDifficulty, setBotDifficulty] = useState<BotDifficulty>('normal');
  const [joinCode, setJoinCode] = useState<string>(
    () => online.initialInviteCode || ''
  );
  const [copiedMode, setCopiedMode] = useState<'none' | 'link' | 'code'>('none');
  const [editingName, setEditingName] = useState<string>('');
  const [swapModeActive, setSwapModeActive] = useState<boolean>(false);
  const [swapSourceSeat, setSwapSourceSeat] = useState<number | null>(null);

  const room = online.roomSnapshot;
  const isHost = Boolean(
    room && online.yourSeatIndex !== null && online.yourSeatIndex === room.hostSeatIndex
  );
  const mySeat =
    room && online.yourSeatIndex !== null
      ? room.seats.find((s) => s.seatIndex === online.yourSeatIndex) || null
      : null;
  const seatsSignature =
    room?.seats
      .map((s) => `${s.seatIndex}:${s.occupiedByHuman ? s.participantId ?? 'human' : 'empty'}`)
      .join('|') ?? '';
  const prevSeatsSignatureRef = useRef<string>(seatsSignature);

  useEffect(() => {
    if (mySeat) {
      setEditingName(mySeat.playerName);
    }
  }, [mySeat?.playerName]);

  useEffect(() => {
    if (!room || room.status !== 'lobby' || !isHost) {
      if (swapModeActive) setSwapModeActive(false);
      if (swapSourceSeat !== null) setSwapSourceSeat(null);
      return;
    }
    if (!swapModeActive) {
      if (swapSourceSeat !== null) setSwapSourceSeat(null);
      return;
    }
    if (swapSourceSeat !== null && swapSourceSeat >= room.maxPlayers) {
      setSwapSourceSeat(null);
    }
  }, [room?.status, room?.maxPlayers, isHost, swapModeActive, swapSourceSeat]);

  useEffect(() => {
    if (prevSeatsSignatureRef.current !== seatsSignature) {
      prevSeatsSignatureRef.current = seatsSignature;
      if (swapSourceSeat !== null) {
        setSwapSourceSeat(null);
      }
    }
  }, [seatsSignature, swapSourceSeat]);

  const handleCopy = async (kind: 'link' | 'code') => {
    if (!room) return;
    const text = kind === 'link' ? online.getInviteUrl() : room.roomCode;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedMode(kind);
      window.setTimeout(() => setCopiedMode('none'), 2200);
    } catch {
      // ignore clipboard errors
    }
  };

  if (room && room.status === 'lobby') {
    const humanCount = room.seats.filter((s) => s.occupiedByHuman).length;
    const isTeams2v2 = (room.matchMode ?? 'FFA') === 'TEAMS_2V2';
    const currentBotDifficulty: BotDifficulty = room.botDifficulty ?? 'normal';
    const spectators = room.spectators ?? [];
    const sortedSeriesStandings = [...(room.seriesStandings ?? [])].sort(
      (a, b) =>
        b.seriesPoints - a.seriesPoints ||
        b.wins - a.wins ||
        a.playerName.localeCompare(b.playerName) ||
        a.participantId.localeCompare(b.participantId)
    );
    const pendingSwap = room.pendingSeatSwap ?? null;
    const isIncomingSwapRecipient = Boolean(
      pendingSwap && online.yourParticipantId && pendingSwap.toParticipantId === online.yourParticipantId
    );
    const isOutgoingSwapSender = Boolean(
      pendingSwap && online.yourParticipantId && pendingSwap.fromParticipantId === online.yourParticipantId
    );
    const unreadyConnectedGuests = room.seats.filter(
      (s) => s.occupiedByHuman && s.connected && !s.isHost && !s.ready
    );
    const hasUnreadyGuests = unreadyConnectedGuests.length > 0;
    const enoughPlayers = isTeams2v2
      ? humanCount === 4 || (room.fillBots && room.maxPlayers === 4)
      : humanCount >= 2 || (room.fillBots && room.maxPlayers >= 2);
    const canStart = isHost && enoughPlayers && !hasUnreadyGuests;

    const otherConnectedSeatedCount = room.seats.filter(
      (s) => s.occupiedByHuman && s.connected && s.seatIndex !== online.yourSeatIndex
    ).length;
    const canMoveToSpectator = Boolean(
      mySeat && spectators.length < 4 && (!isHost || otherConnectedSeatedCount > 0)
    );

    const startHintText =
      isTeams2v2 && humanCount < 4 && !room.fillBots
        ? 'Chế độ Đấu Đội 2v2 yêu cầu đủ 4 người chơi (hoặc bật "Bù Bot AI")!'
        : !isTeams2v2 && humanCount < 2 && !room.fillBots
          ? 'Cần ít nhất 2 người chơi (hoặc bật "Bù Bot AI") để bắt đầu ván đấu!'
          : hasUnreadyGuests
            ? `Còn ${unreadyConnectedGuests.length} khách chưa nhấn Sẵn sàng (${unreadyConnectedGuests
                .map((g) => g.playerName)
                .join(', ')}).`
            : null;

    const handleToggleSwapMode = () => {
      if (!isHost) return;
      setSwapModeActive((prev) => {
        if (prev) {
          setSwapSourceSeat(null);
          return false;
        }
        setSwapSourceSeat(null);
        return true;
      });
    };

    const handleSwapSeatPick = (seatIndex: number) => {
      if (!isHost || !swapModeActive) return;
      if (swapSourceSeat === null) {
        setSwapSourceSeat(seatIndex);
        return;
      }
      if (swapSourceSeat === seatIndex) {
        setSwapSourceSeat(null);
        return;
      }
      const sourceSeatObj = room.seats.find((s) => s.seatIndex === swapSourceSeat);
      const targetSeatObj = room.seats.find((s) => s.seatIndex === seatIndex);
      if (!sourceSeatObj?.occupiedByHuman && !targetSeatObj?.occupiedByHuman) {
        return;
      }
      online.hostSwapSeats(swapSourceSeat, seatIndex);
      setSwapSourceSeat(null);
      setSwapModeActive(false);
    };

    return (
      <div className="flex-1 min-h-0 flex flex-col">
        {/* Top Room Code + Invite Link + Voice Bar Strip */}
        <div className="relative z-20 shrink-0 px-3.5 sm:px-4 pt-2.5 pb-2 border-b border-[#dad3c4] bg-[#f3efe6]">
          <div className="rounded-xl bg-white border border-[#ded8ca] p-2 sm:px-3 flex flex-col sm:flex-row items-center justify-between gap-2 shadow-2xs">
            <div className="flex items-center gap-3 min-w-0">
              <div className="px-3 py-1 rounded-lg bg-[#182232] text-center shrink-0">
                <div className="text-[9px] font-bold uppercase tracking-wider text-amber-300">
                  Mã Phòng Online
                </div>
                <div
                  data-testid="bt-online-room-code"
                  className="font-mono-num text-base sm:text-lg font-black tracking-widest text-white leading-tight"
                >
                  {room.roomCode}
                </div>
              </div>
              <div className="text-xs font-medium text-[#525e73] space-y-0.5 min-w-0">
                <div className="truncate text-[#141c2b] font-semibold">
                  Gửi mã hoặc link mời để bạn bè tham gia chung bàn
                </div>
                <div className="flex items-center gap-1.5 text-[11px] font-bold">
                  <span
                    aria-hidden="true"
                    className={`h-2 w-2 rounded-full shrink-0 ${
                      online.connectionStatus === 'connected' ? 'bg-emerald-500' : 'bg-amber-500'
                    }`}
                  />
                  <span className={online.connectionStatus === 'connected' ? 'text-emerald-700' : 'text-amber-700'}>
                    {online.connectionStatus === 'connected'
                      ? 'Kết nối ổn định'
                      : 'Đang đồng bộ lại kết nối...'}
                  </span>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0 flex-wrap justify-center">
              {voiceBarNode}
              <button
                type="button"
                onClick={() => void handleCopy('link')}
                className="bt-btn-white px-3 py-1.5 rounded-xl text-xs font-extrabold uppercase tracking-wide flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
              >
                {copiedMode === 'link' ? (
                  <>
                    <Check className="h-3.5 w-3.5 text-emerald-600 shrink-0" aria-hidden="true" />
                    <span className="text-emerald-700">Đã Chép Link!</span>
                  </>
                ) : (
                  <>
                    <Link2 className="h-3.5 w-3.5 text-[#182232] shrink-0" aria-hidden="true" />
                    <span>Copy Link Mời</span>
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={() => void handleCopy('code')}
                className="bt-btn-white px-3 py-1.5 rounded-xl text-xs font-extrabold uppercase tracking-wide flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
              >
                {copiedMode === 'code' ? (
                  <>
                    <Check className="h-3.5 w-3.5 text-emerald-600 shrink-0" aria-hidden="true" />
                    <span className="text-emerald-700">Đã Chép Mã</span>
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5 text-[#182232] shrink-0" aria-hidden="true" />
                    <span>Copy Mã</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto slim-scroll p-3.5 sm:p-4 space-y-3">
          {online.errorMessage && (
            <div
              role="alert"
              className="px-3.5 py-2 rounded-xl bg-rose-50 border border-rose-200 text-xs font-bold text-rose-700 flex items-center justify-between gap-2"
            >
              <span>{online.errorMessage}</span>
              <button
                type="button"
                onClick={online.clearError}
                aria-label="Đóng thông báo lỗi"
                className="icon-hit-target h-6 w-6 rounded-full flex items-center justify-center shrink-0 text-rose-800 hover:bg-rose-100 cursor-pointer"
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </div>
          )}

          {pendingSwap && isIncomingSwapRecipient && (
            <div
              role="status"
              aria-live="polite"
              data-testid="bt-seat-swap-incoming-banner"
              className="px-3.5 py-2.5 rounded-xl bg-amber-50 border border-amber-300 text-xs font-bold text-amber-950 flex flex-col sm:flex-row sm:items-center justify-between gap-2 shadow-2xs"
            >
              <span className="flex items-center gap-1.5">
                <ArrowLeftRight className="h-4 w-4 text-amber-700 shrink-0" aria-hidden="true" />
                <span>
                  <strong>{pendingSwap.fromPlayerName}</strong> (Ghế {pendingSwap.fromSeatIndex + 1}) muốn đổi chỗ sang ghế của bạn (Ghế{' '}
                  {pendingSwap.toSeatIndex + 1}).
                </span>
              </span>
              <div className="flex items-center gap-2 shrink-0 justify-end">
                <button
                  type="button"
                  data-testid="bt-seat-swap-accept-btn"
                  onClick={() => online.respondSeatSwap(pendingSwap.requestId, true)}
                  className="bt-btn-green px-3 py-1 rounded-lg text-xs font-extrabold uppercase cursor-pointer"
                >
                  Đồng ý
                </button>
                <button
                  type="button"
                  data-testid="bt-seat-swap-decline-btn"
                  onClick={() => online.respondSeatSwap(pendingSwap.requestId, false)}
                  className="id-btn-crimson px-3 py-1 rounded-lg text-xs font-extrabold uppercase cursor-pointer"
                >
                  Từ chối
                </button>
              </div>
            </div>
          )}

          {pendingSwap && isOutgoingSwapSender && (
            <div
              role="status"
              aria-live="polite"
              data-testid="bt-seat-swap-outgoing-notice"
              className="px-3.5 py-2 rounded-xl bg-amber-50/80 border border-amber-200 text-xs font-bold text-amber-900 flex items-center gap-1.5"
            >
              <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>Đã gửi lời mời đổi sang Ghế {pendingSwap.toSeatIndex + 1} — đang chờ phản hồi...</span>
            </div>
          )}

          {/* Balanced Grid: Wider Seat Roster (5fr) so names never truncate */}
          <div
            className={`grid grid-cols-1 gap-3 items-stretch ${
              onlineChatNode
                ? 'lg:grid-cols-[minmax(0,3.6fr)_minmax(0,5fr)_minmax(0,3.4fr)]'
                : 'lg:grid-cols-12'
            }`}
          >
            {/* Left: Room Rules */}
            <div
              className={`${
                onlineChatNode ? '' : 'lg:col-span-5'
              } rounded-2xl bg-[#f3efe6] border border-[#dad3c4] p-3 space-y-2 flex flex-col justify-between`}
            >
              <div className="space-y-2">
                <div className="pb-1.5 border-b border-[#dad3c4] flex items-center justify-between gap-2">
                  <h2 className="font-display text-xs sm:text-sm font-black uppercase tracking-wide text-[#141c2b]">
                    Cấu Hình Phòng
                  </h2>
                  <span className="inline-flex items-center gap-1 text-[11px] font-bold text-[#525e73]">
                    {isHost ? (
                      <>
                        <Crown className="h-3.5 w-3.5 text-amber-600 shrink-0" aria-hidden="true" />
                        <span className="text-amber-800">Bạn là Chủ phòng</span>
                      </>
                    ) : online.isSpectator ? (
                      <>
                        <Eye className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                        <span>Khán giả</span>
                      </>
                    ) : (
                      <span>Khách mời</span>
                    )}
                  </span>
                </div>

                <div>
                  <span className="block text-[11px] font-bold text-[#525e73] mb-1">
                    Thể thức đấu
                  </span>
                  <div className="bt-segment-well grid grid-cols-2 gap-1 p-1 rounded-xl">
                    <button
                      type="button"
                      data-testid="bt-mode-ffa"
                      disabled={!isHost}
                      aria-pressed={(room.matchMode ?? 'FFA') === 'FFA'}
                      onClick={() => online.updateLobbySettings({ matchMode: 'FFA' })}
                      className={`py-1.5 px-2 rounded-lg text-[11px] font-extrabold uppercase transition-all whitespace-normal text-center leading-tight ${
                        (room.matchMode ?? 'FFA') === 'FFA'
                          ? 'bt-segment-active-light'
                          : 'text-[#4b566a] hover:bg-white/60 disabled:opacity-45'
                      } ${isHost ? 'cursor-pointer' : 'cursor-not-allowed'}`}
                    >
                      Đấu Đơn (FFA)
                    </button>
                    <button
                      type="button"
                      data-testid="bt-mode-2v2"
                      disabled={!isHost}
                      aria-pressed={(room.matchMode ?? 'FFA') === 'TEAMS_2V2'}
                      onClick={() =>
                        online.updateLobbySettings({
                          matchMode: 'TEAMS_2V2',
                          maxPlayers: 4,
                        })
                      }
                      className={`py-1.5 px-2 rounded-lg text-[11px] font-extrabold uppercase transition-all whitespace-normal text-center leading-tight ${
                        (room.matchMode ?? 'FFA') === 'TEAMS_2V2'
                          ? 'bt-segment-active-light ring-1 ring-emerald-500/60 text-emerald-800'
                          : 'text-[#4b566a] hover:bg-white/60 disabled:opacity-45'
                      } ${isHost ? 'cursor-pointer' : 'cursor-not-allowed'}`}
                    >
                      Đấu Đội 2v2
                    </button>
                  </div>
                </div>

                <div>
                  <span className="block text-[11px] font-bold text-[#525e73] mb-1">
                    Số người chơi tối đa{' '}
                    {(room.matchMode ?? 'FFA') === 'TEAMS_2V2' ? '(Khóa 4 cho 2v2)' : ''}
                  </span>
                  <div className="bt-segment-well grid grid-cols-3 gap-1 p-1 rounded-xl">
                    {([2, 3, 4] as const).map((num) => {
                      const lockedFor2v2 = (room.matchMode ?? 'FFA') === 'TEAMS_2V2' && num < 4;
                      const disabledBtn = !isHost || num < humanCount || lockedFor2v2;
                      return (
                        <button
                          key={num}
                          type="button"
                          disabled={disabledBtn}
                          aria-pressed={room.maxPlayers === num}
                          onClick={() => online.updateLobbySettings({ maxPlayers: num })}
                          className={`py-1.5 px-2 rounded-lg text-[11px] font-extrabold uppercase transition-all whitespace-nowrap ${
                            room.maxPlayers === num
                              ? 'bt-segment-active-light'
                              : 'text-[#4b566a] hover:bg-white/60 disabled:opacity-40'
                          } ${!disabledBtn ? 'cursor-pointer' : 'cursor-not-allowed'}`}
                        >
                          {num} Người
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <span className="block text-[11px] font-bold text-[#525e73] mb-1">
                    Ngân sách khởi điểm
                  </span>
                  <div className="bt-segment-well grid grid-cols-2 gap-1 p-1 rounded-xl">
                    {[2_000_000, 3_000_000].map((cash) => (
                      <button
                        key={cash}
                        type="button"
                        disabled={!isHost}
                        aria-pressed={room.startingCash === cash}
                        onClick={() => online.updateLobbySettings({ startingCash: cash })}
                        className={`py-1.5 px-2 rounded-lg text-xs font-black font-mono-num transition-all whitespace-nowrap ${
                          room.startingCash === cash
                            ? 'bt-btn-gold'
                            : 'text-[#4b566a] hover:bg-white/60 disabled:opacity-50'
                        } ${isHost ? 'cursor-pointer' : 'cursor-not-allowed'}`}
                      >
                        {formatBusinessTourSpaced(cash)}
                      </button>
                    ))}
                  </div>
                </div>

                <BotDifficultyPicker
                  value={currentBotDifficulty}
                  disabled={!isHost}
                  showBadge={true}
                  onSelect={(nextDifficulty) =>
                    online.updateLobbySettings({ botDifficulty: nextDifficulty })
                  }
                />

                {/* Flat divider-separated option rows */}
                <div className="rounded-xl bg-white border border-[#ded8ca] divide-y divide-[#ede8dc] overflow-hidden">
                  <button
                    type="button"
                    disabled={!isHost}
                    aria-pressed={room.fillBots}
                    onClick={() => online.updateLobbySettings({ fillBots: !room.fillBots })}
                    className={`w-full px-2.5 py-2 flex items-center justify-between gap-2 text-left transition-colors ${
                      isHost ? 'cursor-pointer hover:bg-[#faf8f3]' : 'opacity-65 cursor-not-allowed'
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-[#141c2b] leading-tight">
                        Bù Bot AI vào ghế trống
                      </div>
                      <div className="text-[10.5px] font-medium text-[#64748b] leading-tight">
                        Tự điền Bot đủ {room.maxPlayers} người khi bắt đầu
                      </div>
                    </div>
                    <ToggleSwitch checked={room.fillBots} disabled={!isHost} size="sm" />
                  </button>

                  <button
                    type="button"
                    data-testid="bt-tactical-dice-toggle"
                    disabled={!isHost}
                    aria-pressed={Boolean(room.tacticalDiceEnabled)}
                    onClick={() =>
                      online.updateLobbySettings({
                        tacticalDiceEnabled: !room.tacticalDiceEnabled,
                      })
                    }
                    className={`w-full px-2.5 py-2 flex items-center justify-between gap-2 text-xs font-bold text-[#141c2b] transition-colors ${
                      isHost ? 'cursor-pointer hover:bg-[#faf8f3]' : 'opacity-65 cursor-not-allowed'
                    }`}
                  >
                    <span className="text-left leading-tight">
                      Xúc xắc chiến thuật (Chẵn/Lẻ/Đổ lại)
                    </span>
                    <ToggleSwitch checked={Boolean(room.tacticalDiceEnabled)} disabled={!isHost} size="sm" />
                  </button>

                  <button
                    type="button"
                    data-testid="bt-festival-toggle"
                    disabled={!isHost}
                    aria-pressed={Boolean(room.festivalEnabled)}
                    onClick={() =>
                      online.updateLobbySettings({
                        festivalEnabled: !room.festivalEnabled,
                      })
                    }
                    className={`w-full px-2.5 py-2 flex items-center justify-between gap-2 text-xs font-bold text-[#141c2b] transition-colors ${
                      isHost ? 'cursor-pointer hover:bg-[#faf8f3]' : 'opacity-65 cursor-not-allowed'
                    }`}
                  >
                    <span className="text-left leading-tight flex items-center gap-1.5">
                      <Sparkles className="h-3.5 w-3.5 text-amber-600 shrink-0" aria-hidden="true" />
                      <span>Lễ Hội đầu mùa (3 thành phố ×2 thuê)</span>
                    </span>
                    <ToggleSwitch checked={Boolean(room.festivalEnabled)} disabled={!isHost} size="sm" />
                  </button>
                </div>
              </div>
            </div>

            {/* Center: Seat Roster + Spectators + Personal Profile */}
            <div
              className={`${
                onlineChatNode ? '' : 'lg:col-span-7'
              } rounded-2xl bg-[#f3efe6] border border-[#dad3c4] p-3 flex flex-col justify-between gap-2.5`}
            >
              <div className="space-y-2">
                <div className="pb-1.5 border-b border-[#dad3c4] flex items-center justify-between gap-2 text-xs">
                  <h2 className="font-display text-xs sm:text-sm font-black uppercase tracking-wide text-[#141c2b]">
                    Danh Sách Ghế Ngồi ({humanCount}/{room.maxPlayers} Người)
                  </h2>
                  {isHost ? (
                    <button
                      type="button"
                      data-testid="bt-host-swap-mode-btn"
                      aria-pressed={swapModeActive}
                      onClick={handleToggleSwapMode}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-extrabold uppercase flex items-center gap-1 transition-colors cursor-pointer shrink-0 ${
                        swapModeActive
                          ? 'bg-amber-400 text-[#141c2b] shadow-2xs'
                          : 'bg-white border border-[#d5cec0] text-[#182232] hover:bg-[#faf8f3]'
                      }`}
                    >
                      {swapModeActive ? (
                        <>
                          <X className="h-3 w-3" aria-hidden="true" />
                          <span>Hủy hoán đổi</span>
                        </>
                      ) : (
                        <>
                          <ArrowLeftRight className="h-3 w-3" aria-hidden="true" />
                          <span>Hoán đổi ghế</span>
                        </>
                      )}
                    </button>
                  ) : (
                    <span className="text-[#525e73] font-bold">Trạng thái</span>
                  )}
                </div>

                {isHost && swapModeActive && (
                  <div
                    data-testid="bt-host-swap-banner"
                    className="px-2.5 py-1.5 rounded-xl bg-amber-50 border border-amber-300 text-[11px] font-bold text-amber-900 flex items-center gap-1.5"
                  >
                    <ArrowLeftRight className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    <span>
                      {swapSourceSeat === null
                        ? 'Bấm chọn ghế thứ nhất muốn hoán đổi.'
                        : `Đã chọn Ghế ${swapSourceSeat + 1} — bấm chọn ghế thứ hai để đổi chỗ.`}
                    </span>
                  </div>
                )}

                <div className="space-y-1.5">
                  {room.seats.map((seat) => {
                    const persona = CHARACTER_PERSONAS[seat.tokenType];
                    const isYou = seat.seatIndex === online.yourSeatIndex;
                    const seatParticipant = seat.occupiedByHuman
                      ? room.participants.find(
                          (p) =>
                            p.seatIndex === seat.seatIndex ||
                            (Boolean(seat.participantId) && p.participantId === seat.participantId)
                        )
                      : undefined;
                    const isSpeaking = Boolean(
                      seatParticipant && speakingParticipantIds?.[seatParticipant.participantId]
                    );
                    const isSwapSource =
                      isHost && swapModeActive && swapSourceSeat === seat.seatIndex;
                    const isSwapTargetCandidate =
                      isHost && swapModeActive && swapSourceSeat !== null && swapSourceSeat !== seat.seatIndex;

                    let seatClickHandler: (() => void) | undefined;
                    let seatClickDisabled = false;
                    let seatActionLabel: string | null = null;
                    let seatActionTitle: string | undefined;

                    if (isHost && swapModeActive) {
                      const sourceSeatObj =
                        swapSourceSeat !== null
                          ? room.seats.find((s) => s.seatIndex === swapSourceSeat)
                          : undefined;
                      const bothEmpty =
                        swapSourceSeat !== null &&
                        swapSourceSeat !== seat.seatIndex &&
                        !sourceSeatObj?.occupiedByHuman &&
                        !seat.occupiedByHuman;
                      seatClickHandler = () => handleSwapSeatPick(seat.seatIndex);
                      seatClickDisabled = bothEmpty;
                      seatActionLabel = isSwapSource
                        ? 'Đang chọn (Hủy)'
                        : bothEmpty
                          ? '2 ghế cùng trống'
                          : isSwapTargetCandidate
                            ? `Đổi với ghế #${swapSourceSeat + 1}`
                            : 'Chọn đổi chỗ';
                      seatActionTitle = bothEmpty
                        ? 'Không thể hoán đổi hai ghế cùng đang trống'
                        : undefined;
                    } else if (!seat.occupiedByHuman) {
                      seatClickHandler = () => online.moveToSeat(seat.seatIndex);
                      seatActionLabel = 'Vào ghế này';
                      seatActionTitle = online.isSpectator
                        ? `Tham gia ngồi vào Ghế ${seat.seatIndex + 1}`
                        : `Chuyển sang Ghế ${seat.seatIndex + 1}`;
                    } else if (!isHost && !online.isSpectator && !isYou) {
                      seatClickHandler = () => online.requestSeatSwap(seat.seatIndex);
                      seatClickDisabled = !seat.connected || Boolean(pendingSwap);
                      seatActionLabel = 'Mời đổi chỗ';
                      seatActionTitle = !seat.connected
                        ? 'Người chơi ở ghế này đang mất kết nối'
                        : pendingSwap
                          ? 'Đang có lời mời đổi chỗ chờ phản hồi'
                          : `Gửi lời mời đổi ghế với ${seat.playerName}`;
                    }

                    const statusBadge = seat.occupiedByHuman ? (
                      !seat.connected ? (
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-extrabold uppercase bg-rose-50 border border-rose-200 text-rose-700">
                          Mất mạng
                        </span>
                      ) : seat.isHost ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-extrabold uppercase bg-amber-50 border border-amber-300 text-amber-900">
                          <Crown className="h-3 w-3 text-amber-600 shrink-0" aria-hidden="true" />
                          <span>Chủ phòng</span>
                        </span>
                      ) : seat.ready ? (
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-extrabold uppercase bg-emerald-50 border border-emerald-200 text-emerald-700">
                          Sẵn sàng
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-extrabold uppercase bg-amber-50 border border-amber-200 text-amber-800">
                          Chờ sẵn sàng
                        </span>
                      )
                    ) : room.fillBots ? (
                      <span className="px-2 py-0.5 rounded-md bg-[#ebe6da] text-[#475569] text-[10px] font-extrabold uppercase">
                        Bot AI Bù
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-500 text-[10px] font-extrabold uppercase">
                        Ghế Trống
                      </span>
                    );

                    const showHostSeatControls = Boolean(
                      isHost &&
                        !swapModeActive &&
                        seat.occupiedByHuman &&
                        !isYou &&
                        seatParticipant
                    );

                    const showInlineAction = Boolean(seatClickHandler || showHostSeatControls);

                    return (
                      <div
                        key={seat.seatIndex}
                        data-testid={`bt-lobby-seat-${seat.seatIndex}`}
                        data-speaking={isSpeaking ? 'true' : 'false'}
                        className={`rounded-xl border transition-all overflow-hidden ${
                          isSwapSource
                            ? 'bg-amber-50 border-amber-400 ring-2 ring-amber-300/60'
                            : isSpeaking
                              ? 'bg-emerald-50/80 border-emerald-400 ring-2 ring-emerald-300/70'
                              : isYou
                                ? 'bg-amber-50/55 border-amber-300'
                                : 'bg-white border-[#ded8ca]'
                        }`}
                      >
                        <div data-testid={`bt-seat-card-${seat.seatIndex}`}>
                          <div className="w-full flex items-center gap-2.5 px-2.5 py-2">
                            <span
                              className="w-1 self-stretch rounded-full shrink-0"
                              style={{ backgroundColor: seat.color }}
                            />

                            <div
                              className={`relative shrink-0 rounded-lg transition-shadow ${
                                isSpeaking
                                  ? 'ring-2 ring-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.7)]'
                                  : ''
                              }`}
                            >
                              <PlayerAvatar3D
                                archetype={seat.tokenType}
                                mood={
                                  seat.isHost
                                    ? 'celebrating'
                                    : seat.occupiedByHuman
                                      ? 'active'
                                      : 'idle'
                                }
                                phaseSeed={seat.seatIndex}
                                isBot={!seat.occupiedByHuman && room.fillBots}
                                showBotStamp={!seat.occupiedByHuman && room.fillBots}
                                size="sm"
                                className="!rounded-lg !border !border-[#e6e0d3]"
                                ariaLabel={persona.personaName}
                              />
                            </div>

                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="font-display text-[13px] font-black text-[#141c2b] truncate">
                                  {seat.playerName}
                                </span>
                                {seat.isHost && !seat.connected && (
                                  <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-amber-50 border border-amber-300 text-[9px] font-extrabold text-amber-800">
                                    <Crown className="h-2.5 w-2.5" aria-hidden="true" />
                                    <span>Chủ phòng</span>
                                  </span>
                                )}
                                {isYou && (
                                  <span className="px-1.5 py-0.5 rounded-md bg-emerald-50 border border-emerald-200 text-[9px] font-extrabold text-emerald-700 uppercase">
                                    Bạn
                                  </span>
                                )}
                                {isTeams2v2 && (
                                  <span
                                    className={`px-1.5 py-0.5 rounded-md text-[9px] font-extrabold border ${
                                      (seat.teamId ?? seat.seatIndex % 2) === 0
                                        ? 'bg-sky-50 border-sky-200 text-sky-800'
                                        : 'bg-rose-50 border-rose-200 text-rose-800'
                                    }`}
                                  >
                                    {(seat.teamId ?? seat.seatIndex % 2) === 0
                                      ? 'Đội A'
                                      : 'Đội B'}
                                  </span>
                                )}
                              </div>
                              <div className="text-[11px] font-medium text-[#64748b] truncate">
                                Ghế {seat.seatIndex + 1} · {persona.personaName} · {seat.colorName}
                              </div>
                            </div>

                            <div className="shrink-0 text-right flex items-center gap-1.5">
                              {seat.occupiedByHuman && seatParticipant?.micEnabled && (
                                <span
                                  title="Micro đang bật"
                                  className="h-5 w-5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 flex items-center justify-center shrink-0"
                                >
                                  <Mic className="h-3 w-3" aria-hidden="true" />
                                </span>
                              )}
                              {statusBadge}
                            </div>
                          </div>

                          {showInlineAction && (
                            <div className="flex items-center justify-end gap-1.5 flex-wrap px-2.5 pb-1.5 pt-1 border-t border-[#efeae0] bg-[#faf8f3]">
                              {seatClickHandler && seatActionLabel && (
                                <button
                                  type="button"
                                  data-testid={`bt-seat-action-${seat.seatIndex}`}
                                  disabled={seatClickDisabled}
                                  aria-pressed={isHost && swapModeActive ? isSwapSource : undefined}
                                  title={seatActionTitle}
                                  onClick={seatClickHandler}
                                  className={`px-2.5 py-0.5 rounded-md border text-[10px] font-extrabold inline-flex items-center gap-1 transition-colors ${
                                    isSwapSource
                                      ? 'bg-amber-300 border-amber-500 text-[#141c2b] hover:bg-amber-200 cursor-pointer'
                                      : isSwapTargetCandidate && !seatClickDisabled
                                        ? 'bg-[#182232] border-[#0f172a] text-white hover:bg-[#243247] cursor-pointer'
                                        : 'bg-white hover:bg-[#f3efe6] border-[#d5cec0] text-[#182232] cursor-pointer'
                                  } disabled:opacity-45 disabled:cursor-not-allowed`}
                                >
                                  {!seat.occupiedByHuman && !swapModeActive ? (
                                    <LogIn className="h-3 w-3 shrink-0" aria-hidden="true" />
                                  ) : (
                                    <ArrowLeftRight className="h-3 w-3 shrink-0" aria-hidden="true" />
                                  )}
                                  <span>{seatActionLabel}</span>
                                </button>
                              )}

                              {showHostSeatControls && seatParticipant && (
                                <>
                                  <button
                                    type="button"
                                    data-testid={`bt-transfer-host-${seat.seatIndex}`}
                                    disabled={!seat.connected}
                                    aria-label={`Chuyển quyền Chủ phòng cho ${seat.playerName}`}
                                    title={
                                      seat.connected
                                        ? `Chuyển quyền Chủ phòng cho ${seat.playerName}`
                                        : 'Chỉ chuyển được cho người chơi đang kết nối'
                                    }
                                    onClick={() => online.transferHost(seatParticipant.participantId)}
                                    className="px-2 py-0.5 rounded-md bg-amber-50 hover:bg-amber-100 border border-amber-300 text-[10px] font-extrabold text-amber-900 inline-flex items-center gap-1 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                                  >
                                    <Crown className="h-2.5 w-2.5 shrink-0" aria-hidden="true" />
                                    <span>Chuyển Host</span>
                                  </button>
                                  <button
                                    type="button"
                                    data-testid={`bt-kick-seat-${seat.seatIndex}`}
                                    aria-label={`Kick ${seat.playerName} khỏi phòng`}
                                    title={`Mời ${seat.playerName} khỏi phòng`}
                                    onClick={() => online.kickParticipant(seatParticipant.participantId)}
                                    className="px-2 py-0.5 rounded-md bg-rose-50 hover:bg-rose-100 border border-rose-200 text-[10px] font-extrabold text-rose-700 inline-flex items-center gap-1 transition-colors cursor-pointer"
                                  >
                                    <UserX className="h-2.5 w-2.5 shrink-0" aria-hidden="true" />
                                    <span>Kick</span>
                                  </button>
                                </>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Spectator Strip */}
                <div
                  data-testid="bt-spectators-strip"
                  className="rounded-xl bg-white border border-[#ded8ca] p-2.5 space-y-1.5"
                >
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <span className="inline-flex items-center gap-1.5 text-xs font-extrabold text-[#141c2b]">
                      <Eye className="h-3.5 w-3.5 text-[#525e73] shrink-0" aria-hidden="true" />
                      <span>Khán giả ({spectators.length}/4)</span>
                    </span>
                    {mySeat ? (
                      <button
                        type="button"
                        data-testid="bt-move-to-spectator-btn"
                        disabled={!canMoveToSpectator}
                        title={
                          spectators.length >= 4
                            ? 'Khu vực khán giả đã đủ 4/4 người'
                            : isHost && otherConnectedSeatedCount === 0
                              ? 'Cần ít nhất 1 người chơi khác đang kết nối ngồi ghế để giữ quyền Chủ phòng'
                              : 'Chuyển xuống khu vực khán giả'
                        }
                        onClick={online.moveToSpectator}
                        className="px-2.5 py-1 rounded-lg bg-[#f3efe6] hover:bg-[#eae4d6] border border-[#d5cec0] text-[11px] font-bold text-[#182232] inline-flex items-center gap-1 transition-colors cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed"
                      >
                        <Eye className="h-3 w-3 shrink-0" aria-hidden="true" />
                        <span>Xuống làm Khán giả</span>
                      </button>
                    ) : (
                      <span className="text-[11px] font-semibold text-[#525e73]">
                        Bấm ghế trống phía trên để lên chơi
                      </span>
                    )}
                  </div>

                  {spectators.length === 0 ? (
                    <div className="text-[11px] font-medium text-[#788497]">
                      Chưa có khán giả nào trong phòng.
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {spectators.map((spec) => {
                        const isMe = spec.participantId === online.yourParticipantId;
                        const isSpecSpeaking = Boolean(
                          speakingParticipantIds?.[spec.participantId]
                        );
                        return (
                          <div
                            key={spec.participantId}
                            data-testid={`bt-lobby-spectator-${spec.participantId}`}
                            data-speaking={isSpecSpeaking ? 'true' : 'false'}
                            className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-lg border text-[11px] font-bold transition-shadow ${
                              isSpecSpeaking
                                ? 'bg-emerald-50 border-emerald-400 ring-2 ring-emerald-300/70 text-emerald-950'
                                : isMe
                                  ? 'bg-amber-50 border-amber-300 text-[#141c2b]'
                                  : 'bg-[#faf8f3] border-[#ded8ca] text-[#141c2b]'
                            }`}
                          >
                            <span className="truncate max-w-[120px]">{spec.playerName}</span>
                            {isMe && (
                              <span className="px-1.5 py-0.5 rounded-md bg-emerald-50 text-emerald-700 text-[9px] font-extrabold uppercase">
                                Bạn
                              </span>
                            )}
                            {!spec.connected && (
                              <span className="px-1.5 py-0.5 rounded-md bg-rose-50 text-rose-700 text-[9px] font-extrabold">
                                Mất mạng
                              </span>
                            )}
                            {spec.micEnabled && (
                              <span
                                title="Micro đang bật"
                                className="h-4 w-4 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 flex items-center justify-center shrink-0"
                              >
                                <Mic className="h-2.5 w-2.5" aria-hidden="true" />
                              </span>
                            )}
                            {isHost && !isMe && (
                              <button
                                type="button"
                                data-testid={`bt-kick-spectator-${spec.participantId}`}
                                aria-label={`Kick khán giả ${spec.playerName}`}
                                title={`Mời ${spec.playerName} khỏi phòng`}
                                onClick={() => online.kickParticipant(spec.participantId)}
                                className="px-1.5 py-0.5 rounded-md bg-rose-50 hover:bg-rose-100 border border-rose-200 text-[9px] font-extrabold text-rose-700 inline-flex items-center gap-0.5 cursor-pointer"
                              >
                                <UserX className="h-2.5 w-2.5" aria-hidden="true" />
                                <span>Kick</span>
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              {/* Personal Profile Quick Switcher */}
              {mySeat && (
                <div className="pt-2 border-t border-[#dad3c4] space-y-1.5">
                  <div className="text-[11px] font-bold text-[#525e73]">
                    Hồ sơ của bạn trong phòng
                  </div>
                  <div
                    className={`flex flex-col gap-2 ${
                      onlineChatNode ? '' : 'sm:flex-row sm:items-center'
                    }`}
                  >
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        if (editingName.trim()) {
                          online.updateMyProfile({ playerName: editingName.trim() });
                        }
                      }}
                      className="flex gap-1.5 flex-1 min-w-0"
                    >
                      <label htmlFor="online-editing-name-input" className="sr-only">
                        Tên hiển thị
                      </label>
                      <div className="relative flex-1 min-w-0 flex items-center">
                        <input
                          id="online-editing-name-input"
                          type="text"
                          maxLength={22}
                          value={editingName}
                          onChange={(e) => setEditingName(e.target.value)}
                          placeholder="Tên hiển thị"
                          className="w-full min-w-0 pl-2.5 pr-7 py-1.5 text-xs font-bold text-[#141c2b] bg-white border border-[#d5cec0] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#182232]/25"
                        />
                        <Pencil
                          className="pointer-events-none absolute right-2.5 h-3.5 w-3.5 text-[#8c96a8]"
                          aria-hidden="true"
                        />
                      </div>
                      <button
                        type="submit"
                        className="bt-btn-cyan px-3 py-1.5 rounded-xl text-xs font-extrabold cursor-pointer whitespace-nowrap shrink-0"
                      >
                        Lưu Tên
                      </button>
                    </form>

                    <div
                      className={`grid grid-cols-4 gap-1.5 shrink-0 ${
                        onlineChatNode ? 'w-full' : 'sm:w-44'
                      }`}
                    >
                      {ALL_TOKENS.map((tok) => {
                        const isMine = mySeat.tokenType === tok;
                        const takenByOther = room.seats.some(
                          (s) =>
                            s.occupiedByHuman &&
                            s.seatIndex !== mySeat.seatIndex &&
                            s.tokenType === tok
                        );
                        const meta = CHARACTER_PERSONAS[tok];
                        return (
                          <button
                            key={tok}
                            type="button"
                            disabled={takenByOther}
                            aria-pressed={isMine}
                            aria-label={`Chọn nhân vật ${meta.personaName}`}
                            onClick={() => online.updateMyProfile({ tokenType: tok })}
                            title={
                              takenByOther
                                ? `${meta.personaName} (Đã có người chọn)`
                                : meta.personaName
                            }
                            className={`h-8 rounded-lg flex items-center justify-center border-2 transition-transform ${
                              isMine
                                ? 'border-[#141c2b] scale-105 shadow-xs cursor-pointer'
                                : takenByOther
                                  ? 'border-slate-300 opacity-35 cursor-not-allowed'
                                  : 'border-white opacity-85 hover:opacity-100 cursor-pointer'
                            }`}
                            style={{ backgroundColor: TOKEN_SIGNATURE_HEX[tok] }}
                          >
                            {isMine ? (
                              <Check className="h-3.5 w-3.5 text-white stroke-[3]" aria-hidden="true" />
                            ) : (
                              <span className="h-2 w-2 rounded-full bg-white/90" />
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {onlineChatNode && (
              <div className="flex flex-col min-h-0">
                {onlineChatNode}
              </div>
            )}
          </div>

          {sortedSeriesStandings.length > 0 && (
            <section
              data-testid="bt-series-standings-card"
              aria-label="Bảng điểm chuỗi trận"
              className="rounded-2xl bg-[#f3efe6] border border-[#dad3c4] p-3.5 space-y-2.5"
            >
              <div className="pb-1.5 border-b border-[#dad3c4] flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2 min-w-0">
                  <h2 className="font-display text-sm font-black uppercase tracking-wide text-[#141c2b]">
                    Bảng Điểm Chuỗi Trận
                  </h2>
                  <span className="px-2 py-0.5 rounded-md bg-white border border-[#d5cec0] text-[10px] font-bold text-[#525e73] whitespace-nowrap">
                    {sortedSeriesStandings.length} người chơi
                  </span>
                </div>

                {isHost && (
                  <button
                    type="button"
                    data-testid="bt-reset-series-btn"
                    onClick={online.resetSeriesScore}
                    className="px-2.5 py-1 rounded-lg bg-white hover:bg-rose-50 border border-rose-200 text-[11px] font-bold text-rose-700 inline-flex items-center gap-1 transition-colors cursor-pointer shrink-0 whitespace-nowrap"
                  >
                    <RotateCcw className="h-3 w-3" aria-hidden="true" />
                    <span>Reset điểm</span>
                  </button>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {sortedSeriesStandings.map((entry, idx) => {
                  const isMe = Boolean(
                    online.yourParticipantId && entry.participantId === online.yourParticipantId
                  );
                  const tokenColor = entry.tokenType
                    ? TOKEN_SIGNATURE_HEX[entry.tokenType]
                    : '#182232';
                  return (
                    <div
                      key={entry.participantId}
                      data-testid={`bt-series-standing-row-${idx + 1}`}
                      className={`rounded-xl px-3 py-2 border flex items-center justify-between gap-2 min-w-0 ${
                        idx === 0
                          ? 'bg-amber-50 border-amber-300'
                          : isMe
                            ? 'bg-[#faf8f3] border-[#c5bdaa]'
                            : 'bg-white border-[#ded8ca]'
                      }`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className={`font-mono-num text-xs font-black shrink-0 ${
                            idx === 0 ? 'text-amber-700' : 'text-[#525e73]'
                          }`}
                        >
                          #{idx + 1}
                        </span>
                        <span
                          aria-hidden="true"
                          className="h-2.5 w-2.5 rounded-full shrink-0 border border-white shadow-2xs"
                          style={{ backgroundColor: tokenColor }}
                        />
                        <span className="text-xs font-bold text-[#141c2b] truncate">
                          {entry.playerName}
                        </span>
                        {isMe && (
                          <span className="px-1.5 py-0.5 rounded-md bg-emerald-50 text-emerald-700 text-[9px] font-extrabold shrink-0">
                            Bạn
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5 sm:gap-2 shrink-0 text-[11px] font-extrabold whitespace-nowrap">
                        <span className="px-2 py-0.5 rounded-md bg-amber-100/80 text-amber-900 font-mono-num">
                          {entry.wins} Cúp
                        </span>
                        <span className="text-[#64748b] font-semibold hidden md:inline font-mono-num">
                          {entry.matchesPlayed} trận
                        </span>
                        <span className="px-2 py-0.5 rounded-md bg-[#eae4d6] text-[#141c2b] font-mono-num">
                          {entry.seriesPoints} điểm
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          )}
        </div>

        {/* Pinned Bottom Action Bar */}
        <div className="bt-lobby-compact-cta shrink-0 px-3.5 sm:px-4 py-2.5 bg-[#f3efe6] border-t border-[#dad3c4] rounded-b-[22px] sm:rounded-b-none flex flex-wrap sm:flex-nowrap items-center justify-between gap-2">
          <button
            type="button"
            onClick={online.leaveRoom}
            className="id-btn-crimson shrink-0 px-3.5 sm:px-4 py-2 rounded-xl text-xs font-extrabold uppercase tracking-wide cursor-pointer whitespace-nowrap"
          >
            Rời Phòng
          </button>

          {isHost ? (
            <div className="flex flex-col sm:flex-row items-center gap-2 w-full sm:w-auto sm:flex-1 min-w-0 justify-end">
              {startHintText && (
                <div
                  data-testid="bt-online-start-hint"
                  className="w-full sm:w-auto sm:flex-1 min-w-0 text-[11px] font-bold text-amber-900 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-lg leading-tight text-center sm:text-right"
                >
                  {startHintText}
                </div>
              )}
              <button
                type="button"
                data-testid="bt-online-start-btn"
                disabled={!canStart}
                onClick={online.startMatch}
                className="bt-btn-green shrink-0 w-full sm:w-auto sm:min-w-[220px] py-2 sm:py-2.5 px-5 sm:px-7 rounded-xl font-black text-xs sm:text-sm uppercase tracking-wider flex items-center justify-center gap-2 disabled:opacity-45 cursor-pointer disabled:cursor-not-allowed whitespace-normal sm:whitespace-nowrap text-center leading-tight"
              >
                <Dices className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span>Bắt Đầu Ván Online!</span>
              </button>
            </div>
          ) : mySeat ? (
            <div className="flex flex-wrap items-center gap-2 justify-end flex-1 min-w-0">
              <span className="hidden sm:inline px-3 py-1.5 rounded-lg bg-white border border-[#ded8ca] text-xs font-semibold text-[#525e73] text-center">
                {mySeat.ready
                  ? 'Đang chờ Chủ phòng bắt đầu ván đấu...'
                  : 'Bấm Sẵn sàng để Chủ phòng bắt đầu'}
              </span>
              <button
                type="button"
                data-testid="bt-ready-toggle-btn"
                disabled={!mySeat.connected}
                aria-pressed={Boolean(mySeat.ready)}
                onClick={() => online.setReady(!mySeat.ready)}
                className={`shrink-0 px-5 py-2 rounded-xl text-xs sm:text-sm font-black uppercase tracking-wide inline-flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed whitespace-nowrap ${
                  mySeat.ready
                    ? 'bg-emerald-50 border border-emerald-400 text-emerald-800 hover:bg-emerald-100'
                    : 'bt-btn-green'
                }`}
              >
                <Check className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span>{mySeat.ready ? 'Đã Sẵn sàng' : 'Sẵn sàng'}</span>
              </button>
            </div>
          ) : (
            <div className="px-3.5 py-2 rounded-lg bg-white border border-[#ded8ca] text-xs font-bold text-[#525e73] inline-flex items-center gap-1.5 text-center">
              <Eye className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>Đang ở chế độ Khán giả — chọn ghế trống để lên chơi</span>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Not yet in a room: Create or Join view
  const leadPersona = CHARACTER_PERSONAS[selectedToken];

  return (
    <div className="flex-1 min-h-0 overflow-y-auto slim-scroll p-3.5 sm:p-4 space-y-3">
      {online.errorMessage && (
        <div
          role="alert"
          className="px-3.5 py-2 rounded-xl bg-rose-50 border border-rose-200 text-xs font-bold text-rose-700 flex items-center justify-between gap-2"
        >
          <span>{online.errorMessage}</span>
          <button
            type="button"
            onClick={online.clearError}
            aria-label="Đóng thông báo lỗi"
            className="icon-hit-target h-6 w-6 rounded-full flex items-center justify-center shrink-0 text-rose-800 hover:bg-rose-100 cursor-pointer"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
      )}

      {online.connectionStatus === 'reconnecting' && (
        <div className="px-3.5 py-2 rounded-xl bg-amber-50 border border-amber-300 text-xs font-bold text-amber-800 text-center">
          Đang thử kết nối lại phòng cũ...
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3.5 items-stretch">
        {/* Identity Column */}
        <div
          className="lg:col-span-4 rounded-2xl border border-[#dad3c4] p-3.5 flex flex-col items-center justify-between text-center space-y-3"
          style={{
            background:
              'radial-gradient(circle at 50% 30%, #FFFFFF 0%, #F7F4EC 64%, #ECE6D8 100%)',
          }}
        >
          <div className="w-full pb-1.5 border-b border-[#dad3c4]">
            <h2 className="font-display text-sm font-black uppercase tracking-wide text-[#141c2b]">
              Hồ Sơ Tỷ Phú Online
            </h2>
          </div>

          <div className="animate-float-gentle my-1">
            <PlayerAvatar3D
              archetype={selectedToken}
              mood="celebrating"
              phaseSeed={0}
              isActive
              size="lg"
              className="!border-[3px] !border-white shadow-lg ring-1 ring-[#d5cec0]"
              ariaLabel={`Chân dung ${leadPersona.personaName}`}
            />
          </div>

          <div className="w-full space-y-2.5">
            <div>
              <div className="font-display text-sm font-black text-[#141c2b]">
                {leadPersona.personaName}
              </div>
              <div className="text-[11px] font-medium text-[#64748b]">
                {leadPersona.roleTitle}
              </div>
            </div>

            <div className="text-left">
              <label
                htmlFor="online-nickname-input"
                className="block text-[11px] font-bold text-[#525e73] mb-1"
              >
                Tên hiển thị của bạn
              </label>
              <div className="relative flex items-center">
                <input
                  id="online-nickname-input"
                  type="text"
                  maxLength={22}
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value)}
                  placeholder="Nhập tên của bạn..."
                  className="w-full pl-3 pr-8 py-2 text-xs font-bold text-[#141c2b] bg-white border border-[#d5cec0] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#182232]/25"
                />
                <Pencil
                  className="pointer-events-none absolute right-2.5 h-3.5 w-3.5 text-[#8c96a8]"
                  aria-hidden="true"
                />
              </div>
            </div>

            <div className="grid grid-cols-4 gap-2 pt-0.5">
              {ALL_TOKENS.map((tok) => {
                const selected = selectedToken === tok;
                const meta = CHARACTER_PERSONAS[tok];
                return (
                  <button
                    key={tok}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => setSelectedToken(tok)}
                    title={meta.personaName}
                    aria-label={`Chọn nhân vật ${meta.personaName}`}
                    className={`h-9 rounded-xl flex items-center justify-center border-2 transition-transform cursor-pointer ${
                      selected
                        ? 'border-[#141c2b] scale-105 shadow-sm'
                        : 'border-white opacity-80 hover:opacity-100'
                    }`}
                    style={{ backgroundColor: TOKEN_SIGNATURE_HEX[tok] }}
                  >
                    {selected ? (
                      <Check className="h-4 w-4 text-white stroke-[3]" aria-hidden="true" />
                    ) : (
                      <span className="h-2.5 w-2.5 rounded-full bg-white/90" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Create Room Card */}
        <div className="lg:col-span-4 rounded-2xl bg-[#f3efe6] border border-[#dad3c4] p-3.5 flex flex-col justify-between space-y-3">
          <div className="space-y-2">
            <div className="pb-1.5 border-b border-[#dad3c4]">
              <h2 className="font-display text-sm font-black uppercase tracking-wide text-[#141c2b]">
                1. Tạo Phòng Mới
              </h2>
            </div>

            <div>
              <span className="block text-[11px] font-bold text-[#525e73] mb-1">
                Thể thức đấu
              </span>
              <div className="bt-segment-well grid grid-cols-2 gap-1 p-1 rounded-xl">
                <button
                  type="button"
                  data-testid="bt-mode-ffa"
                  aria-pressed={matchMode === 'FFA'}
                  onClick={() => setMatchMode('FFA')}
                  className={`py-1.5 px-2 rounded-lg text-[11px] font-extrabold uppercase transition-all cursor-pointer whitespace-normal text-center leading-tight ${
                    matchMode === 'FFA' ? 'bt-segment-active-light' : 'text-[#4b566a] hover:bg-white/60'
                  }`}
                >
                  Đấu Đơn (FFA)
                </button>
                <button
                  type="button"
                  data-testid="bt-mode-2v2"
                  aria-pressed={matchMode === 'TEAMS_2V2'}
                  onClick={() => {
                    setMatchMode('TEAMS_2V2');
                    setMaxPlayers(4);
                  }}
                  className={`py-1.5 px-2 rounded-lg text-[11px] font-extrabold uppercase transition-all cursor-pointer whitespace-normal text-center leading-tight ${
                    matchMode === 'TEAMS_2V2'
                      ? 'bt-segment-active-light ring-1 ring-emerald-500/60 text-emerald-800'
                      : 'text-[#4b566a] hover:bg-white/60'
                  }`}
                >
                  Đấu Đội 2v2
                </button>
              </div>
            </div>

            <div>
              <span className="block text-[11px] font-bold text-[#525e73] mb-1">
                Số người chơi {matchMode === 'TEAMS_2V2' ? '(Khóa 4 cho 2v2)' : ''}
              </span>
              <div className="bt-segment-well grid grid-cols-3 gap-1 p-1 rounded-xl">
                {([2, 3, 4] as const).map((num) => {
                  const lockedFor2v2 = matchMode === 'TEAMS_2V2' && num < 4;
                  return (
                    <button
                      key={num}
                      type="button"
                      disabled={lockedFor2v2}
                      aria-pressed={maxPlayers === num}
                      onClick={() => setMaxPlayers(num)}
                      className={`py-1.5 px-2 rounded-lg text-[11px] font-extrabold uppercase transition-all whitespace-nowrap ${
                        maxPlayers === num ? 'bt-segment-active-light' : 'text-[#4b566a] hover:bg-white/60'
                      } ${lockedFor2v2 ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}
                    >
                      {num} Người
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <span className="block text-[11px] font-bold text-[#525e73] mb-1">
                Ngân sách khởi điểm
              </span>
              <div className="bt-segment-well grid grid-cols-2 gap-1 p-1 rounded-xl">
                {[2_000_000, 3_000_000].map((cash) => (
                  <button
                    key={cash}
                    type="button"
                    aria-pressed={startingCash === cash}
                    onClick={() => setStartingCash(cash)}
                    className={`py-1.5 px-2 rounded-lg text-xs font-black font-mono-num transition-all cursor-pointer whitespace-nowrap ${
                      startingCash === cash ? 'bt-btn-gold' : 'text-[#4b566a] hover:bg-white/60'
                    }`}
                  >
                    {formatBusinessTourSpaced(cash)}
                  </button>
                ))}
              </div>
            </div>

            <BotDifficultyPicker
              value={botDifficulty}
              disabled={false}
              showBadge={false}
              onSelect={setBotDifficulty}
            />

            <div className="rounded-xl bg-white border border-[#ded8ca] divide-y divide-[#ede8dc] overflow-hidden">
              <button
                type="button"
                aria-pressed={fillBots}
                onClick={() => setFillBots((v) => !v)}
                className="w-full px-2.5 py-1.5 flex items-center justify-between gap-2 text-xs font-bold text-[#141c2b] cursor-pointer hover:bg-[#faf8f3] transition-colors"
              >
                <span>Bù Bot AI nếu thiếu người</span>
                <ToggleSwitch checked={fillBots} size="sm" />
              </button>

              <button
                type="button"
                data-testid="bt-tactical-dice-toggle"
                aria-pressed={tacticalDiceEnabled}
                onClick={() => setTacticalDiceEnabled((v) => !v)}
                className="w-full px-2.5 py-1.5 flex items-center justify-between gap-2 text-xs font-bold text-[#141c2b] cursor-pointer hover:bg-[#faf8f3] transition-colors"
              >
                <span className="text-left leading-tight">
                  Xúc xắc chiến thuật (Chẵn/Lẻ/Đổ lại)
                </span>
                <ToggleSwitch checked={tacticalDiceEnabled} size="sm" />
              </button>

              <button
                type="button"
                data-testid="bt-festival-toggle"
                aria-pressed={festivalEnabled}
                onClick={() => setFestivalEnabled((v) => !v)}
                className="w-full px-2.5 py-1.5 flex items-center justify-between gap-2 text-xs font-bold text-[#141c2b] cursor-pointer hover:bg-[#faf8f3] transition-colors"
              >
                <span className="text-left leading-tight flex items-center gap-1.5">
                  <Sparkles className="h-3.5 w-3.5 text-amber-600 shrink-0" aria-hidden="true" />
                  <span>Lễ Hội đầu mùa (3 thành phố ×2 thuê)</span>
                </span>
                <ToggleSwitch checked={festivalEnabled} size="sm" />
              </button>
            </div>
          </div>

          <button
            type="button"
            data-testid="bt-create-room-btn"
            onClick={() =>
              online.createRoom({
                playerName: nickname.trim() || 'Chủ phòng',
                tokenType: selectedToken,
                maxPlayers: matchMode === 'TEAMS_2V2' ? 4 : maxPlayers,
                startingCash,
                fillBots,
                botDifficulty,
                matchMode,
                tacticalDiceEnabled,
                festivalEnabled,
              })
            }
            className="bt-btn-green w-full py-2.5 rounded-xl font-black text-sm uppercase tracking-wide cursor-pointer whitespace-nowrap"
          >
            Tạo Phòng &amp; Lấy Mã
          </button>
        </div>

        {/* Join Room Card — Action placed immediately below input (no dead vertical gap) */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (joinCode.trim().length >= 4) {
              online.joinRoom({
                roomCode: joinCode,
                playerName: nickname.trim() || 'Khách mời',
                tokenType: selectedToken,
              });
            }
          }}
          className="lg:col-span-4 rounded-2xl bg-[#f3efe6] border border-[#dad3c4] p-3.5 flex flex-col justify-between space-y-3"
        >
          <div className="space-y-3">
            <div className="pb-1.5 border-b border-[#dad3c4]">
              <h2 className="font-display text-sm font-black uppercase tracking-wide text-[#141c2b]">
                2. Vào Phòng Bằng Mã
              </h2>
            </div>

            <div className="space-y-2.5">
              <div>
                <label
                  htmlFor="online-room-code-input"
                  className="block text-[11px] font-bold text-[#525e73] mb-1.5"
                >
                  Mã phòng (6 ký tự)
                </label>
                <input
                  id="online-room-code-input"
                  type="text"
                  maxLength={8}
                  value={joinCode}
                  onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                  placeholder="VD: VN2026"
                  className="w-full px-3 py-2.5 text-center font-mono-num text-lg font-black uppercase tracking-widest text-[#141c2b] bg-white border border-[#c5bdaa] rounded-xl focus:outline-none focus:ring-2 focus:ring-[#182232]/25"
                />
              </div>

              <button
                type="submit"
                data-testid="bt-join-room-btn"
                disabled={joinCode.trim().length < 4}
                className="bt-btn-cyan w-full py-2.5 rounded-xl font-black text-sm uppercase tracking-wide flex items-center justify-center gap-1.5 disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed whitespace-nowrap"
              >
                <span>Vào Phòng Ngay</span>
                <ArrowRight className="h-4 w-4 shrink-0" aria-hidden="true" />
              </button>
            </div>
          </div>

          <div className="rounded-xl bg-white/80 border border-[#ded8ca] p-3 space-y-1.5 text-xs text-[#525e73]">
            <div className="font-extrabold text-[#141c2b] text-[11px] uppercase tracking-wide">
              Tham gia nhanh
            </div>
            <p className="text-[11px] leading-relaxed">
              Xin mã phòng từ chủ phòng hoặc mở trực tiếp đường dẫn mời dạng{' '}
              <span className="font-mono-num font-bold text-[#141c2b]">?room=...</span> để vào thẳng bàn đấu.
            </p>
            <p className="text-[11px] leading-relaxed text-[#64748b]">
              Nếu trận đấu đã bắt đầu, bạn sẽ vào ở chế độ Khán giả và có thể xin thế chỗ Bot AI.
            </p>
          </div>
        </form>
      </div>
    </div>
  );
};
