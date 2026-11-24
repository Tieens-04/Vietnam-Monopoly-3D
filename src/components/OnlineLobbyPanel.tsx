import React, { useEffect, useState } from 'react';
import { Mic } from 'lucide-react';
import { CHARACTER_PERSONAS } from '../game/avatarLogic';
import { BotDifficulty, TokenArchetype } from '../game/onlineTypes';
import { formatBusinessTourSpaced } from '../game/rules';
import { MatchMode } from '../game/types';
import type { useOnlineMultiplayer } from '../utils/onlineClient';
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
    activeBtnClass: 'bt-btn-cyan',
    badgeClass: 'bg-sky-100 border-sky-300 text-sky-800',
  },
  {
    value: 'normal',
    label: 'Sành sỏi',
    activeBtnClass: 'bt-btn-gold text-slate-950',
    badgeClass: 'bg-amber-100 border-amber-300 text-amber-800',
  },
  {
    value: 'hard',
    label: 'Cá mập',
    activeBtnClass: 'bt-btn-pink',
    badgeClass: 'bg-rose-100 border-rose-300 text-rose-800',
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
        <span className="text-xs font-extrabold text-slate-600">Độ khó Bot AI</span>
        {showBadge && (
          <span
            data-testid="bt-bot-difficulty-badge"
            className={`px-2 py-0.5 rounded-full border text-[10px] font-black uppercase ${activeMeta.badgeClass}`}
          >
            {activeMeta.label}
          </span>
        )}
      </div>
      <div className="grid grid-cols-3 gap-1.5 p-1 rounded-2xl bg-sky-100 border border-sky-200">
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
              className={`py-1.5 px-1.5 rounded-xl text-xs font-black uppercase transition-all whitespace-nowrap ${
                isSelected
                  ? opt.activeBtnClass
                  : 'text-sky-900 hover:bg-white/60 disabled:opacity-45'
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

  useEffect(() => {
    if (mySeat) {
      setEditingName(mySeat.playerName);
    }
  }, [mySeat?.playerName]);

  useEffect(() => {
    if (!room || room.status !== 'lobby' || !isHost) {
      setSwapModeActive(false);
      setSwapSourceSeat(null);
      return;
    }
    if (swapSourceSeat !== null && swapSourceSeat >= room.maxPlayers) {
      setSwapSourceSeat(null);
    }
  }, [room?.status, room?.maxPlayers, isHost, swapSourceSeat]);

  const handleCopy = async (kind: 'link' | 'code') => {
    if (!room) return;
    const text = kind === 'link' ? online.getInviteUrl() : room.roomCode;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedMode(kind);
      window.setTimeout(() => setCopiedMode('none'), 2200);
    } catch {
      // Fallback: select via prompt or ignore
    }
  };

  if (room && room.status === 'lobby') {
    const humanCount = room.seats.filter((s) => s.occupiedByHuman).length;
    const isTeams2v2 = (room.matchMode ?? 'FFA') === 'TEAMS_2V2';
    const currentBotDifficulty: BotDifficulty = room.botDifficulty ?? 'normal';
    const spectators = room.spectators ?? [];
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
      online.hostSwapSeats(swapSourceSeat, seatIndex);
      setSwapSourceSeat(null);
      setSwapModeActive(false);
    };

    return (
      <div className="flex-1 min-h-0 flex flex-col">
        {/* Top Room Code + Invite Link + Voice Bar Strip (kept outside overflow-y-auto so Voice popover never clips) */}
        <div className="relative z-20 shrink-0 px-3.5 sm:px-4 pt-2.5 pb-2 border-b border-sky-200/80 bg-sky-50/70">
          <div className="rounded-2xl bg-sky-50 border-2 border-sky-200 p-2 sm:p-2.5 flex flex-col sm:flex-row items-center justify-between gap-2">
            <div className="flex items-center gap-3 min-w-0">
              <div className="px-3 py-1 rounded-xl bg-white border-2 border-sky-300 shadow-xs text-center shrink-0">
                <div className="text-[10px] font-extrabold uppercase tracking-wider text-sky-700">
                  Mã Phòng Online
                </div>
                <div
                  data-testid="bt-online-room-code"
                  className="font-mono-num text-lg sm:text-xl font-black tracking-widest text-slate-900 leading-tight"
                >
                  {room.roomCode}
                </div>
              </div>
              <div className="text-xs font-bold text-slate-700 space-y-0.5 min-w-0">
                <div className="truncate">Gửi mã hoặc link mời để bạn bè tham gia chung bàn!</div>
                <div className="text-sky-700 font-extrabold">
                  {online.connectionStatus === 'connected'
                    ? '🟢 Kết nối ổn định'
                    : '🟡 Đang đồng bộ lại kết nối...'}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0 flex-wrap justify-center">
              {voiceBarNode}
              <button
                type="button"
                onClick={() => void handleCopy('link')}
                className="bt-btn-green px-3 py-1.5 rounded-xl text-xs font-black uppercase tracking-wide cursor-pointer whitespace-nowrap"
              >
                {copiedMode === 'link' ? '✓ Đã Chép Link!' : '📋 Copy Link Mời'}
              </button>
              <button
                type="button"
                onClick={() => void handleCopy('code')}
                className="bt-btn-white px-3 py-1.5 rounded-xl text-xs font-extrabold uppercase tracking-wide cursor-pointer whitespace-nowrap"
              >
                {copiedMode === 'code' ? '✓ Đã Chép Mã' : 'Copy Mã'}
              </button>
            </div>
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto slim-scroll p-3.5 sm:p-4 space-y-3">
          {online.errorMessage && (
            <div
              role="alert"
              className="px-3.5 py-2 rounded-xl bg-rose-50 border-2 border-rose-200 text-xs font-extrabold text-rose-700 flex items-center justify-between gap-2"
            >
              <span>{online.errorMessage}</span>
              <button
                type="button"
                onClick={online.clearError}
                aria-label="Đóng thông báo lỗi"
                className="icon-hit-target h-6 w-6 rounded-full flex items-center justify-center shrink-0 text-rose-800 hover:text-rose-950 font-black cursor-pointer"
              >
                ✕
              </button>
            </div>
          )}

          {pendingSwap && isIncomingSwapRecipient && (
            <div
              data-testid="bt-seat-swap-incoming-banner"
              className="px-3.5 py-2.5 rounded-2xl bg-amber-50 border-2 border-amber-300 text-xs font-extrabold text-amber-950 flex flex-col sm:flex-row sm:items-center justify-between gap-2 shadow-xs"
            >
              <span>
                🔄 <strong>{pendingSwap.fromPlayerName}</strong> (Ghế {pendingSwap.fromSeatIndex + 1}) muốn đổi chỗ sang ghế của bạn (Ghế{' '}
                {pendingSwap.toSeatIndex + 1}).
              </span>
              <div className="flex items-center gap-2 shrink-0 justify-end">
                <button
                  type="button"
                  data-testid="bt-seat-swap-accept-btn"
                  onClick={() => online.respondSeatSwap(pendingSwap.requestId, true)}
                  className="bt-btn-green px-3 py-1 rounded-xl text-xs font-black uppercase cursor-pointer"
                >
                  Đồng ý
                </button>
                <button
                  type="button"
                  data-testid="bt-seat-swap-decline-btn"
                  onClick={() => online.respondSeatSwap(pendingSwap.requestId, false)}
                  className="id-btn-crimson px-3 py-1 rounded-xl text-xs font-black uppercase cursor-pointer"
                >
                  Từ chối
                </button>
              </div>
            </div>
          )}

          {pendingSwap && isOutgoingSwapSender && (
            <div
              data-testid="bt-seat-swap-outgoing-notice"
              className="px-3.5 py-2 rounded-xl bg-sky-100 border border-sky-300 text-xs font-extrabold text-sky-900"
            >
              ⏳ Đã gửi lời mời đổi sang Ghế {pendingSwap.toSeatIndex + 1} — đang chờ phản hồi...
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-3.5 items-stretch">
            {/* Left: Room Rules */}
            <div
              className={`${
                onlineChatNode ? 'lg:col-span-4' : 'lg:col-span-5'
              } rounded-2xl bg-sky-50/90 border-2 border-sky-200 p-3.5 space-y-2.5 flex flex-col justify-between`}
            >
              <div className="space-y-2.5">
                <div className="pb-1.5 border-b border-sky-200 flex items-center justify-between">
                  <h2 className="font-display text-sm font-black uppercase tracking-wide text-sky-900">
                    Cấu Hình Phòng
                  </h2>
                  <span className="text-[11px] font-extrabold text-[#0284C7]">
                    {isHost
                      ? '👑 Bạn là Chủ phòng'
                      : online.isSpectator
                        ? '👁️ Khán giả'
                        : 'Khách mời'}
                  </span>
                </div>

                <div>
                  <span className="block text-xs font-extrabold text-slate-600 mb-1">
                    Thể thức đấu
                  </span>
                  <div className="grid grid-cols-2 gap-1.5 p-1 rounded-2xl bg-sky-100 border border-sky-200">
                    <button
                      type="button"
                      data-testid="bt-mode-ffa"
                      disabled={!isHost}
                      aria-pressed={(room.matchMode ?? 'FFA') === 'FFA'}
                      onClick={() => online.updateLobbySettings({ matchMode: 'FFA' })}
                      className={`py-1.5 px-2 rounded-xl text-xs font-black uppercase transition-all whitespace-normal text-center leading-tight ${
                        (room.matchMode ?? 'FFA') === 'FFA'
                          ? 'bt-btn-cyan'
                          : 'text-sky-900 hover:bg-white/60 disabled:opacity-45'
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
                      className={`py-1.5 px-2 rounded-xl text-xs font-black uppercase transition-all whitespace-normal text-center leading-tight ${
                        (room.matchMode ?? 'FFA') === 'TEAMS_2V2'
                          ? 'bt-btn-green'
                          : 'text-sky-900 hover:bg-white/60 disabled:opacity-45'
                      } ${isHost ? 'cursor-pointer' : 'cursor-not-allowed'}`}
                    >
                      Đấu Đội 2v2
                    </button>
                  </div>
                </div>

                <div>
                  <span className="block text-xs font-extrabold text-slate-600 mb-1">
                    Số người chơi tối đa{' '}
                    {(room.matchMode ?? 'FFA') === 'TEAMS_2V2' ? '(Khóa 4 cho 2v2)' : ''}
                  </span>
                  <div className="grid grid-cols-3 gap-1.5 p-1 rounded-2xl bg-sky-100 border border-sky-200">
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
                          className={`py-1.5 px-2 rounded-xl text-xs font-black uppercase transition-all whitespace-nowrap ${
                            room.maxPlayers === num
                              ? 'bt-btn-cyan'
                              : 'text-sky-900 hover:bg-white/60 disabled:opacity-40'
                          } ${!disabledBtn ? 'cursor-pointer' : 'cursor-not-allowed'}`}
                        >
                          {num} Người
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <span className="block text-xs font-extrabold text-slate-600 mb-1">
                    Ngân sách khởi điểm
                  </span>
                  <div className="grid grid-cols-2 gap-1.5 p-1 rounded-2xl bg-sky-100 border border-sky-200">
                    {[2_000_000, 3_000_000].map((cash) => (
                      <button
                        key={cash}
                        type="button"
                        disabled={!isHost}
                        aria-pressed={room.startingCash === cash}
                        onClick={() => online.updateLobbySettings({ startingCash: cash })}
                        className={`py-1.5 px-2 rounded-xl text-xs font-black font-mono-num transition-all whitespace-nowrap ${
                          room.startingCash === cash
                            ? 'bt-btn-gold text-slate-950'
                            : 'text-sky-900 hover:bg-white/60 disabled:opacity-50'
                        } ${isHost ? 'cursor-pointer' : 'cursor-not-allowed'}`}
                      >
                        {formatBusinessTourSpaced(cash)}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex items-center justify-between gap-2 px-3 py-1.5 rounded-xl bg-white border border-sky-200">
                  <div>
                    <div className="text-xs font-extrabold text-slate-800">
                      Bù Bot AI vào ghế trống
                    </div>
                    <div className="text-[11px] font-semibold text-slate-500">
                      Tự điền Bot cho đủ {room.maxPlayers} người khi bắt đầu
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={!isHost}
                    aria-pressed={room.fillBots}
                    onClick={() => online.updateLobbySettings({ fillBots: !room.fillBots })}
                    className={`px-3 py-1 rounded-full text-xs font-black uppercase transition-colors shrink-0 ${
                      room.fillBots
                        ? 'bg-[#66C61C] text-white'
                        : 'bg-slate-200 text-slate-700'
                    } ${isHost ? 'cursor-pointer' : 'opacity-65 cursor-not-allowed'}`}
                  >
                    {room.fillBots ? 'Đang Bật' : 'Đang Tắt'}
                  </button>
                </div>

                <BotDifficultyPicker
                  value={currentBotDifficulty}
                  disabled={!isHost}
                  showBadge={true}
                  onSelect={(nextDifficulty) =>
                    online.updateLobbySettings({ botDifficulty: nextDifficulty })
                  }
                />

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
                  className={`w-full px-3 py-2 rounded-xl bg-white border border-sky-200 flex items-center justify-between gap-2 text-xs font-extrabold text-slate-800 ${
                    isHost ? 'cursor-pointer hover:border-sky-300' : 'opacity-65 cursor-not-allowed'
                  }`}
                >
                  <span className="text-left leading-tight">
                    Xúc xắc chiến thuật (Chẵn/Lẻ/Đổ lại)
                  </span>
                  <span
                    className={`shrink-0 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase ${
                      room.tacticalDiceEnabled
                        ? 'bg-emerald-100 text-emerald-700'
                        : 'bg-slate-200 text-slate-700'
                    }`}
                  >
                    {room.tacticalDiceEnabled ? 'Đang Bật' : 'Đang Tắt'}
                  </span>
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
                  className={`w-full px-3 py-2 rounded-xl bg-white border border-sky-200 flex items-center justify-between gap-2 text-xs font-extrabold text-slate-800 ${
                    isHost ? 'cursor-pointer hover:border-sky-300' : 'opacity-65 cursor-not-allowed'
                  }`}
                >
                  <span className="text-left leading-tight">
                    🎉 Lễ Hội đầu mùa (3 thành phố ×2 thuê)
                  </span>
                  <span
                    className={`shrink-0 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase ${
                      room.festivalEnabled
                        ? 'bg-emerald-100 text-emerald-700'
                        : 'bg-slate-200 text-slate-700'
                    }`}
                  >
                    {room.festivalEnabled ? 'Đang Bật' : 'Đang Tắt'}
                  </span>
                </button>
              </div>
            </div>

            {/* Right: Live Lobby Seat Roster + Spectators + Personal Profile Switcher */}
            <div
              className={`${
                onlineChatNode ? 'lg:col-span-4' : 'lg:col-span-7'
              } rounded-2xl bg-sky-50/90 border-2 border-sky-200 p-3.5 flex flex-col justify-between gap-2.5`}
            >
              <div className="space-y-2">
                <div className="pb-1.5 border-b border-sky-200 flex items-center justify-between gap-2 text-xs">
                  <h2 className="font-display text-sm font-black uppercase tracking-wide text-sky-900">
                    Danh Sách Ghế Ngồi ({humanCount}/{room.maxPlayers} Người)
                  </h2>
                  {isHost ? (
                    <button
                      type="button"
                      data-testid="bt-host-swap-mode-btn"
                      aria-pressed={swapModeActive}
                      onClick={handleToggleSwapMode}
                      className={`px-2.5 py-1 rounded-xl text-[11px] font-black uppercase transition-colors cursor-pointer shrink-0 ${
                        swapModeActive
                          ? 'bg-amber-400 text-slate-950 shadow-xs'
                          : 'bg-white border border-sky-300 text-sky-800 hover:bg-sky-100'
                      }`}
                    >
                      {swapModeActive ? '✕ Hủy hoán đổi' : '⇄ Hoán đổi ghế'}
                    </button>
                  ) : (
                    <span className="text-sky-700 font-extrabold">Trạng thái</span>
                  )}
                </div>

                {isHost && swapModeActive && (
                  <div
                    data-testid="bt-host-swap-banner"
                    className="px-2.5 py-1.5 rounded-xl bg-amber-50 border border-amber-300 text-[11px] font-extrabold text-amber-900 flex items-center justify-between gap-2"
                  >
                    <span>
                      {swapSourceSeat === null
                        ? '🔄 Bấm chọn ghế thứ nhất muốn hoán đổi.'
                        : `🔄 Đã chọn Ghế ${swapSourceSeat + 1} — bấm chọn ghế thứ hai để đổi chỗ.`}
                    </span>
                  </div>
                )}

                <div className="space-y-2">
                  {room.seats.map((seat) => {
                    const persona = CHARACTER_PERSONAS[seat.tokenType];
                    const isYou = seat.seatIndex === online.yourSeatIndex;
                    const seatParticipant = seat.occupiedByHuman
                      ? room.participants.find((p) => p.seatIndex === seat.seatIndex)
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
                    let seatActionHint: string | null = null;

                    if (isHost && swapModeActive) {
                      seatClickHandler = () => handleSwapSeatPick(seat.seatIndex);
                      seatActionHint = isSwapSource
                        ? 'Đang chọn'
                        : isSwapTargetCandidate
                          ? `Đổi với Ghế ${swapSourceSeat + 1}`
                          : 'Chọn ghế';
                    } else if (!seat.occupiedByHuman) {
                      seatClickHandler = () => online.moveToSeat(seat.seatIndex);
                      seatActionHint = online.isSpectator ? 'Ngồi vào' : 'Chuyển sang';
                    } else if (!isHost && !online.isSpectator && !isYou) {
                      seatClickHandler = () => online.requestSeatSwap(seat.seatIndex);
                      seatClickDisabled = !seat.connected || Boolean(pendingSwap);
                      seatActionHint = seat.connected && !pendingSwap ? '⇄ Mời đổi' : null;
                    }

                    const statusBadge = seat.occupiedByHuman ? (
                      !seat.connected ? (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-rose-100 text-rose-700">
                          Mất mạng
                        </span>
                      ) : seat.isHost ? (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-amber-100 border border-amber-300 text-amber-800">
                          👑 Chủ phòng
                        </span>
                      ) : seat.ready ? (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-emerald-100 text-emerald-800">
                          Sẵn sàng
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-amber-100 text-amber-800">
                          Chờ sẵn sàng
                        </span>
                      )
                    ) : room.fillBots ? (
                      <span className="px-2 py-0.5 rounded-full bg-sky-100 text-sky-800 text-[10px] font-black uppercase">
                        Bot AI Bù
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 text-[10px] font-black uppercase">
                        Ghế Trống
                      </span>
                    );

                    const mainContent = (
                      <>
                        <span
                          className="w-1.5 self-stretch rounded-full shrink-0"
                          style={{ backgroundColor: seat.color }}
                        />

                        <div
                          className={`relative shrink-0 rounded-xl transition-shadow ${
                            isSpeaking
                              ? 'ring-4 ring-emerald-400 shadow-[0_0_16px_rgba(52,211,153,0.85)]'
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
                            className="!rounded-xl !border-2 !border-white"
                            ariaLabel={persona.personaName}
                          />
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1 flex-wrap">
                            <span className="font-display text-sm font-black text-slate-900 truncate">
                              {seat.playerName}
                            </span>
                            {seat.isHost && !seat.connected && (
                              <span className="px-2 py-0.5 rounded-full bg-amber-100 border border-amber-300 text-[10px] font-black text-amber-800">
                                👑 Chủ phòng
                              </span>
                            )}
                            {isYou && (
                              <span className="px-2 py-0.5 rounded-full bg-emerald-100 border border-emerald-300 text-[10px] font-black text-emerald-800">
                                Bạn
                              </span>
                            )}
                            {isTeams2v2 && (
                              <span
                                className={`px-2 py-0.5 rounded-full text-[10px] font-black border ${
                                  (seat.teamId ?? seat.seatIndex % 2) === 0
                                    ? 'bg-sky-100 border-sky-300 text-sky-800'
                                    : 'bg-rose-100 border-rose-300 text-rose-800'
                                }`}
                              >
                                {(seat.teamId ?? seat.seatIndex % 2) === 0
                                  ? 'Đội A (Xanh)'
                                  : 'Đội B (Đỏ)'}
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] font-semibold text-slate-500 truncate">
                            Ghế {seat.seatIndex + 1} · {persona.personaName} · {seat.colorName}
                          </div>
                        </div>

                        <div className="shrink-0 text-right flex flex-col items-end gap-1">
                          <div className="flex items-center gap-1">
                            {seat.occupiedByHuman && seatParticipant?.micEnabled && (
                              <span
                                title="Micro đang bật"
                                className="h-5 w-5 rounded-full bg-emerald-100 border border-emerald-300 text-emerald-700 flex items-center justify-center shrink-0"
                              >
                                <Mic className="h-3 w-3" aria-hidden="true" />
                              </span>
                            )}
                            {statusBadge}
                          </div>
                          {seatActionHint && (
                            <span
                              className={`text-[10px] font-black uppercase ${
                                isSwapSource
                                  ? 'text-amber-700'
                                  : isSwapTargetCandidate
                                    ? 'text-sky-700'
                                    : 'text-[#0284C7]'
                              }`}
                            >
                              {seatActionHint}
                            </span>
                          )}
                        </div>
                      </>
                    );

                    const showHostSeatControls = Boolean(
                      isHost &&
                        !swapModeActive &&
                        seat.occupiedByHuman &&
                        !isYou &&
                        seatParticipant
                    );

                    return (
                      <div
                        key={seat.seatIndex}
                        data-testid={`bt-lobby-seat-${seat.seatIndex}`}
                        data-speaking={isSpeaking ? 'true' : 'false'}
                        className={`rounded-2xl border-2 shadow-xs transition-all overflow-hidden ${
                          isSwapSource
                            ? 'bg-amber-50 border-amber-400 ring-2 ring-amber-300'
                            : isSpeaking
                              ? 'bg-emerald-50/75 border-emerald-400 ring-2 ring-emerald-300/80 shadow-[0_0_16px_rgba(52,211,153,0.45)]'
                              : isYou
                                ? 'bg-amber-50/75 border-amber-300'
                                : seatClickHandler && !seatClickDisabled
                                  ? 'bg-white border-sky-200 hover:border-sky-400'
                                  : 'bg-white border-sky-100'
                        }`}
                      >
                        {seatClickHandler ? (
                          <button
                            type="button"
                            disabled={seatClickDisabled}
                            onClick={seatClickHandler}
                            className={`w-full flex items-center gap-2.5 p-2 text-left transition-colors ${
                              seatClickDisabled
                                ? 'cursor-not-allowed opacity-75'
                                : 'cursor-pointer hover:bg-sky-50/60'
                            }`}
                          >
                            {mainContent}
                          </button>
                        ) : (
                          <div className="w-full flex items-center gap-2.5 p-2">
                            {mainContent}
                          </div>
                        )}

                        {showHostSeatControls && seatParticipant && (
                          <div className="flex items-center justify-end gap-1.5 px-2 pb-1.5 pt-1 border-t border-sky-100/90 bg-sky-50/40">
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
                              className="px-2 py-0.5 rounded-lg bg-amber-100 hover:bg-amber-200 border border-amber-300 text-[10px] font-black text-amber-900 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                              👑 Chuyển Host
                            </button>
                            <button
                              type="button"
                              data-testid={`bt-kick-seat-${seat.seatIndex}`}
                              aria-label={`Kick ${seat.playerName} khỏi phòng`}
                              title={`Mời ${seat.playerName} khỏi phòng`}
                              onClick={() => online.kickParticipant(seatParticipant.participantId)}
                              className="px-2 py-0.5 rounded-lg bg-rose-100 hover:bg-rose-200 border border-rose-300 text-[10px] font-black text-rose-800 transition-colors cursor-pointer"
                            >
                              🚫 Kick
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Spectator Strip */}
                <div
                  data-testid="bt-spectators-strip"
                  className="rounded-xl bg-white/90 border border-sky-200 p-2.5 space-y-1.5"
                >
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <span className="text-xs font-black text-sky-900">
                      👁️ Khán giả ({spectators.length}/4)
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
                        className="px-2.5 py-1 rounded-lg bg-sky-100 hover:bg-sky-200 border border-sky-300 text-[11px] font-black text-sky-900 transition-colors cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed"
                      >
                        👁️ Xuống làm Khán giả
                      </button>
                    ) : (
                      <span className="text-[11px] font-bold text-sky-700">
                        Bấm ghế trống phía trên để lên chơi
                      </span>
                    )}
                  </div>

                  {spectators.length === 0 ? (
                    <div className="text-[11px] font-semibold text-slate-500">
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
                            className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-xl border text-[11px] font-extrabold transition-shadow ${
                              isSpecSpeaking
                                ? 'bg-emerald-50 border-emerald-400 ring-2 ring-emerald-300/80 text-emerald-950'
                                : isMe
                                  ? 'bg-amber-50 border-amber-300 text-slate-900'
                                  : 'bg-sky-50 border-sky-200 text-slate-800'
                            }`}
                          >
                            <span className="truncate max-w-[120px]">{spec.playerName}</span>
                            {isMe && (
                              <span className="px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[9px] font-black">
                                Bạn
                              </span>
                            )}
                            {!spec.connected && (
                              <span className="px-1.5 py-0.5 rounded-full bg-rose-100 text-rose-700 text-[9px] font-black">
                                Mất mạng
                              </span>
                            )}
                            {spec.micEnabled && (
                              <span
                                title="Micro đang bật"
                                className="h-4 w-4 rounded-full bg-emerald-100 border border-emerald-300 text-emerald-700 flex items-center justify-center shrink-0"
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
                                className="px-1.5 py-0.5 rounded-md bg-rose-100 hover:bg-rose-200 border border-rose-300 text-[9px] font-black text-rose-800 cursor-pointer"
                              >
                                🚫 Kick
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
                <div className="pt-2.5 border-t border-sky-200 space-y-1.5">
                  <div className="text-xs font-extrabold text-sky-900">Hồ sơ của bạn trong phòng</div>
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
                      <input
                        id="online-editing-name-input"
                        type="text"
                        maxLength={22}
                        value={editingName}
                        onChange={(e) => setEditingName(e.target.value)}
                        placeholder="Tên hiển thị"
                        className="flex-1 min-w-0 px-2.5 py-1.5 text-xs font-extrabold text-slate-900 bg-white border border-sky-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#29B6F6]"
                      />
                      <button
                        type="submit"
                        className="bt-btn-cyan px-3 py-1.5 rounded-xl text-xs font-black cursor-pointer whitespace-nowrap shrink-0"
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
                            className={`h-8.5 rounded-xl flex items-center justify-center border-2 transition-transform ${
                              isMine
                                ? 'border-slate-900 scale-105 shadow-md cursor-pointer'
                                : takenByOther
                                  ? 'border-slate-300 opacity-35 cursor-not-allowed'
                                  : 'border-white opacity-85 hover:opacity-100 cursor-pointer'
                            }`}
                            style={{ backgroundColor: TOKEN_SIGNATURE_HEX[tok] }}
                          >
                            <span className="h-2.5 w-2.5 rounded-full bg-white/95" />
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {onlineChatNode && (
              <div className="lg:col-span-4 flex flex-col min-h-0">
                {onlineChatNode}
              </div>
            )}
          </div>
        </div>

        {/* Pinned Bottom Action Bar (Leave Room & Ready / Start Online Match Always Visible!) */}
        <div className="bt-lobby-compact-cta shrink-0 px-3.5 sm:px-4 py-2 bg-sky-50/95 border-t border-sky-200/90 rounded-b-[25px] sm:rounded-b-none flex flex-wrap sm:flex-nowrap items-center justify-between gap-2">
          <button
            type="button"
            onClick={online.leaveRoom}
            className="id-btn-crimson shrink-0 px-3.5 sm:px-4 py-2 rounded-2xl text-xs font-black uppercase tracking-wide cursor-pointer whitespace-nowrap"
          >
            Rời Phòng
          </button>

          {isHost ? (
            <div className="flex flex-col sm:flex-row items-center gap-2 w-full sm:w-auto sm:flex-1 min-w-0 justify-end">
              {startHintText && (
                <div
                  data-testid="bt-online-start-hint"
                  className="w-full sm:w-auto sm:flex-1 min-w-0 text-[11px] font-extrabold text-amber-800 bg-amber-50 border border-amber-200 px-2 py-1 rounded-xl leading-tight text-center sm:text-right"
                >
                  {startHintText}
                </div>
              )}
              <button
                type="button"
                data-testid="bt-online-start-btn"
                disabled={!canStart}
                onClick={online.startMatch}
                className="bt-btn-green shrink-0 w-full sm:w-auto sm:min-w-[220px] py-2 sm:py-2.5 px-4 sm:px-7 rounded-full font-black text-xs sm:text-base uppercase tracking-wider disabled:opacity-45 cursor-pointer disabled:cursor-not-allowed whitespace-normal sm:whitespace-nowrap text-center leading-tight"
              >
                🎲 Bắt Đầu Ván Online!
              </button>
            </div>
          ) : mySeat ? (
            <div className="flex flex-wrap items-center gap-2 justify-end flex-1 min-w-0">
              <span className="hidden sm:inline px-3 py-1.5 rounded-full bg-sky-100 border border-sky-200 text-xs font-extrabold text-sky-900 text-center">
                {mySeat.ready
                  ? '⏳ Đang chờ Chủ phòng bắt đầu ván đấu...'
                  : '👉 Bấm Sẵn sàng để Chủ phòng bắt đầu'}
              </span>
              <button
                type="button"
                data-testid="bt-ready-toggle-btn"
                disabled={!mySeat.connected}
                aria-pressed={Boolean(mySeat.ready)}
                onClick={() => online.setReady(!mySeat.ready)}
                className={`shrink-0 px-5 py-2 rounded-full text-xs sm:text-sm font-black uppercase tracking-wide transition-all cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed whitespace-nowrap ${
                  mySeat.ready
                    ? 'bg-emerald-100 border-2 border-emerald-400 text-emerald-900 hover:bg-emerald-200/80'
                    : 'bt-btn-green'
                }`}
              >
                {mySeat.ready ? '✅ Đã Sẵn sàng' : '✅ Sẵn sàng'}
              </button>
            </div>
          ) : (
            <div className="px-3.5 py-2 rounded-full bg-sky-100 border border-sky-200 text-xs font-extrabold text-sky-900 text-center">
              👁️ Đang ở chế độ Khán giả — chọn ghế trống để lên chơi
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
          className="px-3.5 py-2 rounded-xl bg-rose-50 border-2 border-rose-200 text-xs font-extrabold text-rose-700 flex items-center justify-between gap-2"
        >
          <span>{online.errorMessage}</span>
          <button
            type="button"
            onClick={online.clearError}
            aria-label="Đóng thông báo lỗi"
            className="icon-hit-target h-6 w-6 rounded-full flex items-center justify-center shrink-0 text-rose-800 hover:text-rose-950 font-black cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {online.connectionStatus === 'reconnecting' && (
        <div className="px-3.5 py-2 rounded-xl bg-amber-50 border border-amber-300 text-xs font-extrabold text-amber-800 text-center">
          🟡 Đang thử kết nối lại phòng cũ...
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch">
        {/* Identity Column */}
        <div
          className="lg:col-span-4 rounded-2xl border-2 border-sky-200 p-3.5 flex flex-col items-center justify-between text-center space-y-2.5"
          style={{
            background:
              'radial-gradient(circle at 50% 28%, #FFFFFF 0%, #E0F2FE 68%, #BAE6FD 100%)',
          }}
        >
          <div className="w-full pb-1.5 border-b border-sky-200/80">
            <h2 className="font-display text-sm font-black uppercase tracking-wide text-sky-900">
              Hồ Sơ Tỷ Phú Online
            </h2>
          </div>

          <div className="animate-float-gentle">
            <PlayerAvatar3D
              archetype={selectedToken}
              mood="celebrating"
              phaseSeed={0}
              isActive
              size="lg"
              className="!border-4 !border-white shadow-xl"
              ariaLabel={`Chân dung ${leadPersona.personaName}`}
            />
          </div>

          <div className="w-full space-y-2">
            <div className="font-display text-sm font-black text-slate-900">
              {leadPersona.personaName}
            </div>
            <label htmlFor="online-nickname-input" className="sr-only">
              Tên hiển thị của bạn
            </label>
            <input
              id="online-nickname-input"
              type="text"
              maxLength={22}
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              placeholder="Nhập tên của bạn..."
              className="w-full px-3 py-1.5 text-xs font-extrabold text-slate-900 bg-white border-2 border-sky-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#29B6F6] text-center"
            />
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
                        ? 'border-slate-900 scale-108 shadow-md'
                        : 'border-white opacity-85 hover:opacity-100'
                    }`}
                    style={{ backgroundColor: TOKEN_SIGNATURE_HEX[tok] }}
                  >
                    <span className="h-3 w-3 rounded-full bg-white/95" />
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Create Room Card */}
        <div className="lg:col-span-4 rounded-2xl bg-sky-50/90 border-2 border-sky-200 p-3.5 flex flex-col justify-between space-y-3">
          <div className="space-y-2.5">
            <div className="pb-1.5 border-b border-sky-200">
              <h2 className="font-display text-sm font-black uppercase tracking-wide text-sky-900">
                1. Tạo Phòng Mới
              </h2>
            </div>

            <div>
              <span className="block text-xs font-extrabold text-slate-600 mb-1">
                Thể thức đấu
              </span>
              <div className="grid grid-cols-2 gap-1.5 p-1 rounded-2xl bg-sky-100 border border-sky-200">
                <button
                  type="button"
                  data-testid="bt-mode-ffa"
                  aria-pressed={matchMode === 'FFA'}
                  onClick={() => setMatchMode('FFA')}
                  className={`py-1.5 px-2 rounded-xl text-xs font-black uppercase transition-all cursor-pointer whitespace-normal text-center leading-tight ${
                    matchMode === 'FFA' ? 'bt-btn-cyan' : 'text-sky-900 hover:bg-white/60'
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
                  className={`py-1.5 px-2 rounded-xl text-xs font-black uppercase transition-all cursor-pointer whitespace-normal text-center leading-tight ${
                    matchMode === 'TEAMS_2V2' ? 'bt-btn-green' : 'text-sky-900 hover:bg-white/60'
                  }`}
                >
                  Đấu Đội 2v2
                </button>
              </div>
            </div>

            <div>
              <span className="block text-xs font-extrabold text-slate-600 mb-1">
                Số người chơi {matchMode === 'TEAMS_2V2' ? '(Khóa 4 cho 2v2)' : ''}
              </span>
              <div className="grid grid-cols-3 gap-1.5 p-1 rounded-2xl bg-sky-100 border border-sky-200">
                {([2, 3, 4] as const).map((num) => {
                  const lockedFor2v2 = matchMode === 'TEAMS_2V2' && num < 4;
                  return (
                    <button
                      key={num}
                      type="button"
                      disabled={lockedFor2v2}
                      aria-pressed={maxPlayers === num}
                      onClick={() => setMaxPlayers(num)}
                      className={`py-1.5 px-2 rounded-xl text-xs font-black uppercase transition-all whitespace-nowrap ${
                        maxPlayers === num ? 'bt-btn-cyan' : 'text-sky-900 hover:bg-white/60'
                      } ${lockedFor2v2 ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}
                    >
                      {num} Người
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <span className="block text-xs font-extrabold text-slate-600 mb-1">
                Ngân sách khởi điểm
              </span>
              <div className="grid grid-cols-2 gap-1.5 p-1 rounded-2xl bg-sky-100 border border-sky-200">
                {[2_000_000, 3_000_000].map((cash) => (
                  <button
                    key={cash}
                    type="button"
                    aria-pressed={startingCash === cash}
                    onClick={() => setStartingCash(cash)}
                    className={`py-1.5 px-2 rounded-xl text-xs font-black font-mono-num transition-all cursor-pointer whitespace-nowrap ${
                      startingCash === cash ? 'bt-btn-gold text-slate-950' : 'text-sky-900 hover:bg-white/60'
                    }`}
                  >
                    {formatBusinessTourSpaced(cash)}
                  </button>
                ))}
              </div>
            </div>

            <button
              type="button"
              aria-pressed={fillBots}
              onClick={() => setFillBots((v) => !v)}
              className="w-full px-3 py-1.5 rounded-xl bg-white border border-sky-200 flex items-center justify-between text-xs font-extrabold text-slate-800 cursor-pointer"
            >
              <span>Bù Bot AI nếu thiếu người</span>
              <span
                className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase ${
                  fillBots ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'
                }`}
              >
                {fillBots ? 'Bật' : 'Tắt'}
              </span>
            </button>

            <BotDifficultyPicker
              value={botDifficulty}
              disabled={false}
              showBadge={false}
              onSelect={setBotDifficulty}
            />

            <button
              type="button"
              data-testid="bt-tactical-dice-toggle"
              aria-pressed={tacticalDiceEnabled}
              onClick={() => setTacticalDiceEnabled((v) => !v)}
              className="w-full px-3 py-1.5 rounded-xl bg-white border border-sky-200 flex items-center justify-between gap-2 text-xs font-extrabold text-slate-800 cursor-pointer hover:border-sky-300"
            >
              <span className="text-left leading-tight">
                Xúc xắc chiến thuật (Chẵn/Lẻ/Đổ lại)
              </span>
              <span
                className={`shrink-0 px-2 py-0.5 rounded-full text-[10px] font-black uppercase ${
                  tacticalDiceEnabled ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-700'
                }`}
              >
                {tacticalDiceEnabled ? 'Đang Bật' : 'Đang Tắt'}
              </span>
            </button>

            <button
              type="button"
              data-testid="bt-festival-toggle"
              aria-pressed={festivalEnabled}
              onClick={() => setFestivalEnabled((v) => !v)}
              className="w-full px-3 py-1.5 rounded-xl bg-white border border-sky-200 flex items-center justify-between gap-2 text-xs font-extrabold text-slate-800 cursor-pointer hover:border-sky-300"
            >
              <span className="text-left leading-tight">
                🎉 Lễ Hội đầu mùa (3 thành phố ×2 thuê)
              </span>
              <span
                className={`shrink-0 px-2 py-0.5 rounded-full text-[10px] font-black uppercase ${
                  festivalEnabled ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-700'
                }`}
              >
                {festivalEnabled ? 'Đang Bật' : 'Đang Tắt'}
              </span>
            </button>
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
            className="bt-btn-green w-full py-2.5 rounded-full font-black text-sm uppercase tracking-wide cursor-pointer whitespace-nowrap"
          >
            ✨ Tạo Phòng &amp; Lấy Mã
          </button>
        </div>

        {/* Join Room Card */}
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
          className="lg:col-span-4 rounded-2xl bg-sky-50/90 border-2 border-sky-200 p-3.5 flex flex-col justify-between space-y-3"
        >
          <div className="space-y-2.5">
            <div className="pb-1.5 border-b border-sky-200">
              <h2 className="font-display text-sm font-black uppercase tracking-wide text-sky-900">
                2. Vào Phòng Bằng Mã
              </h2>
            </div>

            <p className="text-xs font-semibold text-slate-600 leading-relaxed">
              Nhập mã phòng 6 ký tự từ bạn bè (hoặc mở trực tiếp link mời có dạng{' '}
              <span className="font-mono-num font-bold text-sky-800">?room=...</span>).
            </p>

            <div>
              <label htmlFor="online-room-code-input" className="block text-xs font-extrabold text-slate-600 mb-1.5">
                Mã phòng
              </label>
              <input
                id="online-room-code-input"
                type="text"
                maxLength={8}
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                placeholder="VD: VN2026"
                className="w-full px-3 py-2 text-center font-mono-num text-lg font-black uppercase tracking-widest text-slate-900 bg-white border-2 border-sky-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#29B6F6]"
              />
            </div>
          </div>

          <button
            type="submit"
            data-testid="bt-join-room-btn"
            disabled={joinCode.trim().length < 4}
            className="bt-btn-cyan w-full py-2.5 rounded-full font-black text-sm uppercase tracking-wide disabled:opacity-45 cursor-pointer whitespace-nowrap"
          >
            🚀 Vào Phòng Ngay
          </button>
        </form>
      </div>
    </div>
  );
};
