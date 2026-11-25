import React, { useEffect, useRef, useState } from 'react';
import {
  Bot,
  Lock,
  Plane,
  Target,
  WifiOff,
  X,
} from 'lucide-react';
import {
  AvatarMood,
  deriveAvatarMood,
  getPlayerPersona,
} from '../game/avatarLogic';
import { BOARD_TILES } from '../game/boardData';
import { BoardTauntKind } from '../game/onlineTypes';
import {
  calculateNetWorth,
  formatBusinessTourCompact,
  formatBusinessTourSpaced,
} from '../game/rules';
import {
  BotChatBubbleState,
  BotQuipEventKind,
  CurrencyStyleId,
  MatchBoardModifiers,
  MatchMode,
  PlayerState,
  PropertyState,
  TileKind,
} from '../game/types';
import {
  readPrefersReducedMotion,
  subscribePrefersReducedMotion,
} from '../three/animationDirector';
import { CurrencyStyleIcon } from './CurrencyStyleBadge';
import {
  Emote3DIcon,
  getEmote3DMeta,
  parseEmote3DKey,
  TAUNT_3D_CATALOG,
  Taunt3DItemIcon,
} from './EmoteAndTaunt3D';
import { TileStatusMiniIcon } from './GameUiPrimitives';
import {
  PlayerAvatar3D,
  subscribeAvatarMoodBurst,
} from './PlayerAvatar3D';

interface PlayerHUDProps {
  players: PlayerState[];
  activePlayerIndex: number;
  properties: Record<number, PropertyState>;
  boardModifiers: MatchBoardModifiers;
  matchMode?: MatchMode;
  currencyStyle?: CurrencyStyleId;
  debtPlayerId?: number | null;
  botBubbles: Record<number, BotChatBubbleState>;
  localPlayerId?: number | null;
  /** Player ID allowed to throw avatar interactions (defaults to localPlayerId). */
  tauntActorPlayerId?: number | null;
  playerEmotes?: Record<number, string>;
  speakingPlayerIds?: Record<number, boolean>;
  playerChatBubbles?: Record<number, { id: number; text: string; isTeam?: boolean }>;
  onDismissBubble: (botId: number) => void;
  onSelectTile: (tileIndex: number) => void;
  onSendBoardTaunt?: (targetPlayerId: number, kind: BoardTauntKind) => void;
  tauntCooldownUntil?: number;
  openTauntTargetPlayerId?: number | null;
  onChangeOpenTauntTargetPlayerId?: (targetPlayerId: number | null) => void;
}

function getBubbleBadgeMeta(kind: BotQuipEventKind): {
  label: string;
  textClass: string;
} {
  if (kind === 'BUY_PRIME_LAND') {
    return {
      label: 'Thâu tóm đất đẹp',
      textClass: 'text-emerald-700',
    };
  }
  if (kind === 'COLLECT_BIG_RENT') {
    return {
      label: 'Thu phí thuê lớn',
      textClass: 'text-amber-700',
    };
  }
  return {
    label: 'Nộp phạt / Trả phí',
    textClass: 'text-rose-700',
  };
}

/**
 * Smoothly animates cash changes in Business Tour spaced format (`1 435 000`)
 * inside a clean recessed tabletop cash pill.
 */
const AnimatedCashPill: React.FC<{
  value: number;
  delta: number | null;
  bankrupt: boolean;
  isDebtTarget?: boolean;
  reducedMotion: boolean;
  currencyStyle: CurrencyStyleId;
}> = ({ value, delta, bankrupt, isDebtTarget = false, reducedMotion, currencyStyle }) => {
  const [displayed, setDisplayed] = useState(value);
  const prevRef = useRef(value);

  useEffect(() => {
    const startVal = prevRef.current;
    const diff = value - startVal;
    if (diff === 0) return;

    prevRef.current = value;
    if (reducedMotion) {
      setDisplayed(value);
      return;
    }

    const duration = 420;
    const t0 = performance.now();
    let raf = 0;

    const step = (now: number) => {
      const p = Math.min(1, (now - t0) / duration);
      const eased = 1 - Math.pow(1 - p, 2);
      setDisplayed(Math.round(startVal + diff * eased));
      if (p < 1) {
        raf = requestAnimationFrame(step);
      }
    };
    raf = requestAnimationFrame(step);

    return () => cancelAnimationFrame(raf);
  }, [value, reducedMotion]);

  const isInDebt = !bankrupt && (value < 0 || isDebtTarget);
  const deltaRingClass = isInDebt
    ? `border-rose-500 ring-2 ring-rose-300/80 ${reducedMotion ? '' : 'animate-pulse'}`
    : delta !== null && !bankrupt
      ? delta > 0
        ? 'border-emerald-500 ring-2 ring-emerald-200'
        : 'border-rose-500 ring-2 ring-rose-200'
      : 'border-[#dcd5c6]';

  return (
    <div
      className={`relative w-full rounded-lg bg-[#efece4] border ${deltaRingClass} px-2 py-1 flex items-center justify-between gap-1.5 transition-shadow duration-150`}
    >
      <div className="flex items-center gap-1.5 min-w-0">
        <CurrencyStyleIcon
          styleId={currencyStyle}
          className="h-4 w-4 shrink-0"
        />
        <span
          className={`font-mono-num text-xs sm:text-[14px] font-black tracking-tight leading-none truncate ${
            bankrupt || isInDebt ? 'text-rose-600' : 'text-[#141c2b]'
          }`}
        >
          {bankrupt ? '0' : formatBusinessTourSpaced(displayed)}
        </span>
      </div>

      {delta !== null && !bankrupt && (
        <span
          className={`font-mono-num text-[10px] font-black shrink-0 ${
            reducedMotion ? '' : 'animate-pop-in'
          } ${delta > 0 ? 'text-emerald-700' : 'text-rose-600'}`}
        >
          {delta > 0
            ? `+${formatBusinessTourSpaced(delta)}`
            : formatBusinessTourSpaced(delta)}
        </span>
      )}
    </div>
  );
};

interface CornerPositionSpec {
  containerClass: string;
  isRight: boolean;
  isBottom: boolean;
}

const CORNER_SPECS: CornerPositionSpec[] = [
  // Slot 0: Top-Left
  {
    containerClass:
      'top-[max(0.5rem,env(safe-area-inset-top,0px))] left-[max(0.5rem,env(safe-area-inset-left,0px))] sm:top-3.5 sm:left-3.5',
    isRight: false,
    isBottom: false,
  },
  // Slot 1: Top-Right
  {
    containerClass:
      'top-[max(0.5rem,env(safe-area-inset-top,0px))] right-[max(0.5rem,env(safe-area-inset-right,0px))] sm:top-3.5 sm:right-3.5',
    isRight: true,
    isBottom: false,
  },
  // Slot 2: Bottom-Right
  {
    containerClass:
      'bottom-[max(0.5rem,env(safe-area-inset-bottom,0px))] right-[max(0.5rem,env(safe-area-inset-right,0px))] sm:bottom-3.5 sm:right-3.5',
    isRight: true,
    isBottom: true,
  },
  // Slot 3: Bottom-Left
  {
    containerClass:
      'bottom-[max(0.5rem,env(safe-area-inset-bottom,0px))] left-[max(0.5rem,env(safe-area-inset-left,0px))] sm:bottom-3.5 sm:left-3.5',
    isRight: false,
    isBottom: true,
  },
];

interface PlayerCornerCardProps {
  player: PlayerState;
  slotIndex: number;
  corner: CornerPositionSpec;
  isActive: boolean;
  isLocalHuman: boolean;
  isDebtTarget: boolean;
  reducedMotion: boolean;
  matchMode: MatchMode;
  emoteText?: string;
  isSpeaking?: boolean;
  chatBubble?: { id: number; text: string; isTeam?: boolean };
  ownedProps: PropertyState[];
  netWorth: number;
  boardModifiers: MatchBoardModifiers;
  currencyStyle: CurrencyStyleId;
  bubble?: BotChatBubbleState;
  onDismissBubble: (botId: number) => void;
  onSelectTile: (tileIndex: number) => void;
  canTaunt?: boolean;
  isTauntOpen?: boolean;
  tauntCooldownSecondsLeft?: number;
  onToggleTauntPopover?: (open: boolean) => void;
  onSendBoardTaunt?: (targetPlayerId: number, kind: BoardTauntKind) => void;
}

const PlayerCornerCardInner: React.FC<PlayerCornerCardProps> = ({
  player,
  slotIndex,
  corner,
  isActive,
  isLocalHuman,
  isDebtTarget,
  reducedMotion,
  matchMode,
  emoteText,
  isSpeaking = false,
  chatBubble,
  ownedProps,
  netWorth,
  boardModifiers,
  currencyStyle,
  bubble,
  onDismissBubble,
  onSelectTile,
  canTaunt = false,
  isTauntOpen = false,
  tauntCooldownSecondsLeft = 0,
  onToggleTauntPopover,
  onSendBoardTaunt,
}) => {
  const [recentDelta, setRecentDelta] = useState<number | null>(null);
  const [burstMood, setBurstMood] = useState<AvatarMood | null>(null);
  const prevCashRef = useRef(player.cash);
  const burstTimerRef = useRef<number | null>(null);

  useEffect(() => {
    const diff = player.cash - prevCashRef.current;
    if (diff === 0) return;
    prevCashRef.current = player.cash;
    setRecentDelta(diff);
    const timer = window.setTimeout(() => setRecentDelta(null), 1900);
    return () => window.clearTimeout(timer);
  }, [player.cash]);

  useEffect(() => {
    const unsub = subscribeAvatarMoodBurst((burst) => {
      if (burst.playerId !== player.id) return;
      if (burstTimerRef.current !== null) {
        window.clearTimeout(burstTimerRef.current);
      }
      setBurstMood(burst.mood);
      const ms = Math.max(250, burst.durationMs ?? 1200);
      burstTimerRef.current = window.setTimeout(() => {
        burstTimerRef.current = null;
        setBurstMood(null);
      }, ms);
    });
    return () => {
      unsub();
      if (burstTimerRef.current !== null) {
        window.clearTimeout(burstTimerRef.current);
        burstTimerRef.current = null;
      }
    };
  }, [player.id]);

  const persona = getPlayerPersona(player);
  const derivedMood = deriveAvatarMood({
    bankrupt: player.bankrupt,
    inJail: player.inJail,
    cash: player.cash,
    isActive,
    recentCashDelta: recentDelta,
    bubble,
  });
  const mood: AvatarMood = player.bankrupt ? 'bankrupt' : (burstMood ?? derivedMood);
  const badgeMeta = bubble ? getBubbleBadgeMeta(bubble.eventKind) : null;
  const isOnTauntCooldown = tauntCooldownSecondsLeft > 0;

  return (
    <div
      className={`fixed ${corner.containerClass} ${
        isTauntOpen ? 'z-30' : ''
      } w-[46.5vw] max-w-[272px] sm:w-[272px] bt-hud-corner ${
        corner.isRight ? 'bt-hud-corner-right' : ''
      }`}
    >
      <div
        data-testid={`player-card-${player.id}`}
        className={`pointer-events-auto relative flex ${
          corner.isBottom ? 'flex-col-reverse' : 'flex-col'
        } gap-1.5 transition-transform duration-150 ${
          isActive && !player.bankrupt ? 'scale-[1.02]' : ''
        }`}
      >
        {/* Warm Ivory Tactile Card with Player Accent Spine & Crisp Active State */}
        <div
          className={`relative rounded-2xl p-1.5 sm:p-2 flex items-center gap-2 transition-all ${
            corner.isRight ? 'flex-row-reverse' : 'flex-row'
          } ${
            player.bankrupt
              ? 'bg-[#efece4]/90 border border-[#cfc8b8] opacity-80 saturate-50'
              : isActive
                ? 'bg-[#fdfcfa] border-2'
                : 'bg-[#faf8f3]/96 border border-[#d5cec0]'
          }`}
          style={{
            borderColor: player.bankrupt
              ? '#cfc8b8'
              : isActive
                ? player.color
                : '#d5cec0',
            boxShadow: isActive && !player.bankrupt
              ? `0 3px 0 ${player.color}, 0 12px 26px -6px rgba(20, 28, 43, 0.34)`
              : '0 3px 0 rgba(20, 28, 43, 0.08), 0 8px 18px -6px rgba(20, 28, 43, 0.2)',
          }}
        >
          {/* Accent Spine on Outer Corner */}
          <span
            aria-hidden="true"
            className="w-1 self-stretch rounded-full shrink-0"
            style={{ backgroundColor: player.color }}
          />

          {/* 3D Character Portrait (clickable on opponents to open 3D interaction picker) */}
          <div
            data-testid={`player-avatar-ring-${player.id}`}
            data-speaking={isSpeaking ? 'true' : 'false'}
            data-bt-taunt-root={canTaunt ? 'true' : undefined}
            onClick={
              canTaunt && !isOnTauntCooldown
                ? (e) => {
                    e.stopPropagation();
                    onToggleTauntPopover?.(!isTauntOpen);
                  }
                : undefined
            }
            title={
              canTaunt
                ? isOnTauntCooldown
                  ? `Hồi chiêu tương tác (${tauntCooldownSecondsLeft}s)`
                  : `Nhấn vào avatar để tương tác với ${player.name}`
                : undefined
            }
            className={`relative shrink-0 rounded-xl transition-all ${
              isSpeaking
                ? 'ring-3 ring-emerald-500 shadow-[0_0_14px_rgba(16,185,129,0.75)]'
                : canTaunt && !isOnTauntCooldown
                  ? 'cursor-pointer hover:ring-2 hover:ring-amber-400 hover:scale-[1.03]'
                  : ''
            }`}
          >
            <PlayerAvatar3D
              archetype={player.tokenType}
              mood={mood}
              phaseSeed={slotIndex}
              facingSign={corner.isRight ? -1 : 1}
              isBot={player.isBot}
              isActive={isActive}
              showBotStamp={!player.bankrupt}
              size="md"
              className="!rounded-xl !border-2 !border-white shadow-sm"
              ariaLabel={`Chân dung 3D ${player.name} (${persona.personaName})`}
            />

            {player.bankrupt && (
              <div
                data-testid={`bankrupt-stamp-${player.id}`}
                className="pointer-events-none absolute inset-0 flex items-center justify-center z-10"
              >
                <span className="-rotate-12 px-1.5 py-[2px] rounded-[4px] bg-rose-700/95 border border-rose-200 text-[9px] sm:text-[10px] font-display font-black uppercase tracking-wider text-white shadow-md whitespace-nowrap">
                  PHÁ SẢN
                </span>
              </div>
            )}
          </div>

          {/* Info Column — Unified Left-to-Right Hierarchy Across All 4 Corners */}
          <div className="flex-1 min-w-0 flex flex-col justify-center gap-1">
            <div className="w-full flex items-center justify-between gap-1 px-0.5">
              <div className="flex items-center gap-1 min-w-0">
                <span className="font-display text-xs sm:text-[13px] font-black tracking-tight text-[#141c2b] truncate leading-tight">
                  {player.name}
                </span>
                {isLocalHuman && (
                  <span className="px-1.5 py-[1px] rounded-md bg-[#182232] text-[9px] font-black uppercase text-amber-300 shrink-0">
                    BẠN
                  </span>
                )}
                {(matchMode === 'TEAMS_2V2' || player.teamId !== undefined) &&
                  player.teamId !== undefined && (
                    <span
                      title={player.teamId === 0 ? 'Đội A (Xanh)' : 'Đội B (Đỏ)'}
                      className={`px-1.5 py-[1px] rounded-md text-[9px] font-black uppercase shrink-0 border ${
                        player.teamId === 0
                          ? 'bg-sky-50 text-sky-800 border-sky-200'
                          : 'bg-rose-50 text-rose-800 border-rose-200'
                      }`}
                    >
                      {player.teamId === 0 ? 'Đội A' : 'Đội B'}
                    </span>
                  )}
              </div>

              <div className="flex items-center gap-1 shrink-0">
                {!player.bankrupt && player.onlineConnected === false && !player.isBot ? (
                  <span className="inline-flex items-center gap-0.5 px-1.5 py-[1px] rounded-md bg-rose-50 border border-rose-200 text-[9px] font-extrabold text-rose-700 shrink-0">
                    <WifiOff className="h-2.5 w-2.5" aria-hidden="true" />
                    <span>Mất mạng</span>
                  </span>
                ) : !player.bankrupt && player.onlineBotTakeover ? (
                  <span className="inline-flex items-center gap-0.5 px-1.5 py-[1px] rounded-md bg-slate-100 border border-slate-200 text-[9px] font-extrabold text-slate-700 shrink-0">
                    <Bot className="h-2.5 w-2.5" aria-hidden="true" />
                    <span>Thế chỗ</span>
                  </span>
                ) : !player.bankrupt && player.inJail ? (
                  <span className="inline-flex items-center gap-0.5 px-1.5 py-[1px] rounded-md bg-amber-50 border border-amber-300 text-[9px] font-extrabold uppercase text-amber-900 shrink-0 tabular-nums">
                    <Lock className="h-2.5 w-2.5" aria-hidden="true" />
                    <span>Đảo {player.jailTurns}/3</span>
                  </span>
                ) : !player.bankrupt && bubble?.status === 'loading' ? (
                  <span
                    data-testid={`bot-chat-thinking-${player.id}`}
                    className="px-1.5 py-[1px] rounded-md bg-[#eae4d6] text-[9px] font-extrabold text-[#525e73] shrink-0"
                  >
                    ...
                  </span>
                ) : !player.bankrupt && isActive ? (
                  <span
                    className="px-1.5 py-[1px] rounded-md text-[8.5px] font-black uppercase tracking-wide text-white shrink-0"
                    style={{ backgroundColor: player.color === '#F5B800' ? '#b45309' : player.color }}
                  >
                    Lượt
                  </span>
                ) : null}

                {canTaunt && (
                  <button
                    type="button"
                    data-testid={`bt-taunt-trigger-p${player.id}`}
                    data-bt-taunt-root="true"
                    disabled={isOnTauntCooldown}
                    aria-expanded={isTauntOpen && !isOnTauntCooldown}
                    aria-haspopup="menu"
                    aria-label={
                      isOnTauntCooldown
                        ? `Hồi chiêu ném đồ tới ${player.name} (${tauntCooldownSecondsLeft}s)`
                        : `Ném đồ trêu chọc ${player.name}`
                    }
                    title={
                      isOnTauntCooldown
                        ? `Hồi chiêu ném đồ (${tauntCooldownSecondsLeft}s)`
                        : `Ném đồ trêu chọc ${player.name}`
                    }
                    onClick={(e) => {
                      e.stopPropagation();
                      if (e.detail > 0) e.currentTarget.blur();
                      if (isOnTauntCooldown) return;
                      onToggleTauntPopover?.(!isTauntOpen);
                    }}
                    className={`icon-hit-target h-5 sm:h-5.5 min-w-5 px-1 rounded-md border text-[10px] font-black flex items-center justify-center gap-0.5 transition-colors shrink-0 ${
                      isOnTauntCooldown
                        ? 'bg-[#efece4] border-[#d5cec0] text-[#525e73] cursor-not-allowed font-mono-num'
                        : isTauntOpen
                          ? 'bg-[#182232] border-[#0f172a] text-amber-300 cursor-pointer'
                          : 'bg-white hover:bg-[#efece4] border-[#d5cec0] text-[#182232] cursor-pointer'
                    }`}
                  >
                    <Target className="h-3 w-3 shrink-0" aria-hidden="true" />
                    {isOnTauntCooldown && (
                      <span className="leading-none">{tauntCooldownSecondsLeft}s</span>
                    )}
                  </button>
                )}
              </div>
            </div>

            <AnimatedCashPill
              value={player.cash}
              delta={recentDelta}
              bankrupt={player.bankrupt}
              isDebtTarget={isDebtTarget}
              reducedMotion={reducedMotion}
              currencyStyle={currencyStyle}
            />

            {/* Consistent Metadata Row Order (Vòng · Đất · Tổng) */}
            {!player.bankrupt && (
              <div className="w-full flex items-center justify-between gap-1 px-0.5 text-[10px] font-bold text-[#525e73]">
                <span className="inline-flex items-center gap-1 truncate">
                  <span>Vòng {player.laps + 1}</span>
                  {ownedProps.length > 0 && (
                    <span className="text-[#788497]">· {ownedProps.length} đất</span>
                  )}
                  {player.pendingWorldTour && (
                    <span className="inline-flex items-center gap-0.5 text-emerald-700 font-extrabold">
                      · <Plane className="h-2.5 w-2.5 inline" aria-hidden="true" /> Bay
                    </span>
                  )}
                </span>
                <span className="shrink-0">
                  Tổng: <span className="font-mono-num font-extrabold text-[#141c2b]">{formatBusinessTourCompact(netWorth)}</span>
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Owned Cities & Resorts Mini Property Deed Tabs */}
        {ownedProps.length > 0 && !player.bankrupt && (
          <div
            className={`flex items-center flex-wrap gap-1 px-0.5 ${
              corner.isRight ? 'justify-end' : 'justify-start'
            }`}
          >
            {ownedProps.map((pr) => {
              const tile = BOARD_TILES[pr.tileIndex];
              const isResort = tile.kind === TileKind.RESORT;
              const isCup = boardModifiers.championshipTileIndex === pr.tileIndex;
              const isFestival = boardModifiers.festivalTileIndices.includes(pr.tileIndex);
              const isOutage = Boolean(boardModifiers.outageTileIndices?.includes(pr.tileIndex));
              const isShielded = Boolean(boardModifiers.shieldedTileIndices?.includes(pr.tileIndex));
              const headerColor = isResort ? '#0EA5E9' : tile.groupColor || player.color;
              return (
                <button
                  key={pr.tileIndex}
                  type="button"
                  onClick={() => onSelectTile(pr.tileIndex)}
                  title={`${tile.name}${isResort ? ' (Khu nghỉ dưỡng)' : pr.level > 0 ? ` (Cấp ${pr.level})` : ''}${isFestival ? ' · Lễ Hội ×2' : ''}${isCup ? ' · Cúp Quốc Gia' : ''}${isShielded ? ' · Khiên Bảo Hộ' : ''}${isOutage ? ' · Mất điện' : ''}`}
                  aria-label={`Xem ô ${tile.name}`}
                  className={`icon-hit-target-y h-5 w-4.5 rounded-[4px] bg-[#faf8f3] border shadow-2xs flex flex-col items-center justify-between cursor-pointer hover:-translate-y-0.5 transition-transform ${
                    isOutage
                      ? 'border-slate-500 ring-1 ring-slate-400 opacity-75'
                      : isCup
                        ? 'border-amber-500 ring-1 ring-amber-400'
                        : isShielded
                          ? 'border-sky-500 ring-1 ring-sky-400'
                          : isFestival
                            ? 'border-orange-400 ring-1 ring-orange-300'
                            : 'border-[#d5cec0]'
                  }`}
                >
                  <span
                    className="w-full h-1.5 shrink-0 rounded-t-[3px]"
                    style={{ backgroundColor: headerColor }}
                  />
                  <span className="font-mono-num text-[8px] leading-none font-black text-[#141c2b] pb-[1px] flex items-center justify-center">
                    {isOutage ? (
                      <TileStatusMiniIcon kind="outage" />
                    ) : isCup ? (
                      <TileStatusMiniIcon kind="cup" />
                    ) : isShielded ? (
                      <TileStatusMiniIcon kind="shield" />
                    ) : isResort ? (
                      <TileStatusMiniIcon kind="resort" />
                    ) : pr.level === 4 ? (
                      '★'
                    ) : pr.level > 0 ? (
                      pr.level
                    ) : (
                      ''
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Floating 3D Emoji Badge (no text for 3D emotes; graceful fallback for legacy text) */}
      {emoteText && !player.bankrupt && (() => {
        const emote3dKey = parseEmote3DKey(emoteText);
        if (emote3dKey) {
          const emoteMeta = getEmote3DMeta(emote3dKey);
          return (
            <div
              data-testid={`player-emote-${player.id}`}
              aria-label={emoteMeta.label}
              className={`pointer-events-none absolute z-35 ${
                corner.isRight ? 'right-1' : 'left-1'
              } ${corner.isBottom ? 'bottom-full mb-1.5' : 'top-full mt-1.5'}`}
            >
              <div className="bt-emote-3d-float h-15 w-15 rounded-2xl bg-[#faf8f3]/95 border-2 border-white shadow-[0_4px_0_rgba(24,34,50,0.14),0_12px_24px_-4px_rgba(20,28,43,0.32)] flex items-center justify-center">
                <Emote3DIcon emoteKey={emote3dKey} className="h-12 w-12" />
              </div>
            </div>
          );
        }
        return (
          <div
            data-testid={`player-emote-${player.id}`}
            className={`pointer-events-none mt-1.5 flex ${
              corner.isRight ? 'justify-end' : 'justify-start'
            }`}
          >
            <div className="px-3 py-1 rounded-xl bg-[#faf8f3] border border-[#d5cec0] shadow-md text-xs font-extrabold text-[#141c2b] animate-pop-in">
              {emoteText}
            </div>
          </div>
        );
      })()}

      {/* Live Online Chat Bubble (4s auto-dismiss) */}
      {chatBubble && (
        <div
          role="status"
          aria-live="polite"
          data-testid={`bt-hud-chat-bubble-p${player.id}`}
          className={`pointer-events-none absolute z-30 max-w-[240px] sm:max-w-[266px] flex ${
            corner.isRight ? 'right-0 justify-end' : 'left-0 justify-start'
          } ${corner.isBottom ? 'bottom-full mb-1.5' : 'top-full mt-1.5'}`}
        >
          <div
            className={`px-3 py-1.5 rounded-xl border shadow-md text-xs font-bold leading-snug animate-pop-in break-words [overflow-wrap:anywhere] ${
              chatBubble.isTeam
                ? 'bg-sky-50 border-sky-400 text-sky-950'
                : 'bg-[#faf8f3] border-[#c5bdaa] text-[#141c2b]'
            }`}
          >
            {chatBubble.isTeam && (
              <span className="mr-1 px-1.5 py-[0.5px] rounded-md bg-sky-700 text-white text-[10px] font-black align-middle">
                [Đội]
              </span>
            )}
            <span>{chatBubble.text}</span>
          </div>
        </div>
      )}

      {/* 3D Avatar-to-Avatar Interaction Picker Popover */}
      {canTaunt && isTauntOpen && !isOnTauntCooldown && (
        <div
          data-testid={`bt-taunt-popover-p${player.id}`}
          data-bt-taunt-root="true"
          role="menu"
          aria-label={`Chọn tương tác 3D gửi tới ${player.name}`}
          className={`pointer-events-auto absolute z-40 w-64 max-w-[calc(100vw-1rem)] bt-casual-modal rounded-2xl overflow-hidden animate-pop-in ${
            corner.isRight ? 'right-0' : 'left-0'
          } ${corner.isBottom ? 'bottom-full mb-2' : 'top-full mt-2'}`}
        >
          <div className="bt-header-sky px-3.5 py-2 flex items-center justify-between gap-2">
            <span className="font-display text-[11px] font-black uppercase tracking-wide flex items-center gap-1.5 truncate">
              <Target className="h-3.5 w-3.5 text-amber-300 shrink-0" aria-hidden="true" />
              <span className="truncate">Tương tác · {player.name}</span>
            </span>
            <button
              type="button"
              onClick={() => onToggleTauntPopover?.(false)}
              aria-label="Đóng bảng chọn ném đồ"
              className="icon-hit-target h-5.5 w-5.5 rounded-full bg-white/15 hover:bg-white/25 text-white flex items-center justify-center cursor-pointer shrink-0"
            >
              <X className="h-3 w-3" aria-hidden="true" />
            </button>
          </div>
          <div className="p-2.5 grid grid-cols-2 gap-2">
            {TAUNT_3D_CATALOG.map((opt) => (
              <button
                key={opt.kind}
                type="button"
                role="menuitem"
                data-testid={`bt-taunt-option-p${player.id}-${opt.kind}`}
                disabled={isOnTauntCooldown}
                onClick={() => {
                  onToggleTauntPopover?.(false);
                  onSendBoardTaunt?.(player.id, opt.kind);
                }}
                className="group px-2 py-2.5 rounded-2xl bg-white hover:bg-[#f7f4ec] border border-[#ded8ca] shadow-[0_3px_0_#d5cec0] hover:shadow-[0_4px_0_#c4bcae] hover:-translate-y-0.5 active:translate-y-0.5 active:shadow-none flex flex-col items-center justify-center gap-1 text-center transition-all cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed"
              >
                <Taunt3DItemIcon
                  kind={opt.kind}
                  className="h-10 w-10 transition-transform duration-150 group-hover:scale-112"
                />
                <span className="text-[11px] font-extrabold text-[#141c2b] leading-tight whitespace-nowrap">
                  {opt.label}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Bot AI Speech Card */}
      {bubble &&
        badgeMeta &&
        !player.bankrupt &&
        (bubble.status === 'ready' || bubble.status === 'error') && (
          <div
            role="status"
            aria-live="polite"
            data-testid={`bot-chat-bubble-${player.id}`}
            className={`pointer-events-auto absolute z-30 w-60 sm:w-68 animate-pop-in ${
              corner.isRight ? 'right-0' : 'left-0'
            } ${corner.isBottom ? 'bottom-full mb-2' : 'top-full mt-2'}`}
          >
            <div className="relative rounded-2xl bt-casual-modal px-3.5 py-2.5 text-[#141c2b]">
              <div className="flex items-center justify-between gap-2 mb-1">
                <span className={`text-[10.5px] font-extrabold uppercase tracking-wide ${badgeMeta.textClass}`}>
                  {badgeMeta.label}
                </span>
                <button
                  type="button"
                  onClick={() => onDismissBubble(player.id)}
                  aria-label={`Đóng bình luận của ${player.name}`}
                  className="icon-hit-target h-5 w-5 rounded-full bg-[#efece4] text-[#525e73] hover:bg-[#e2dcd0] flex items-center justify-center cursor-pointer"
                >
                  <X className="h-3 w-3" aria-hidden="true" />
                </button>
              </div>

              {bubble.status === 'error' ? (
                <p className="text-[11px] font-semibold text-rose-600 leading-snug">
                  {bubble.text}
                </p>
              ) : (
                <p className="text-xs font-semibold text-[#1e293b] leading-snug">
                  “{bubble.text}”
                </p>
              )}
            </div>
          </div>
        )}
    </div>
  );
};

const PlayerCornerCard = React.memo(PlayerCornerCardInner);

const PlayerHUDInner: React.FC<PlayerHUDProps> = ({
  players,
  activePlayerIndex,
  properties,
  boardModifiers,
  matchMode = 'FFA',
  currencyStyle = 'mixed',
  debtPlayerId = null,
  botBubbles,
  localPlayerId,
  tauntActorPlayerId,
  playerEmotes,
  speakingPlayerIds,
  playerChatBubbles,
  onDismissBubble,
  onSelectTile,
  onSendBoardTaunt,
  tauntCooldownUntil = 0,
  openTauntTargetPlayerId: controlledOpenTauntTargetId,
  onChangeOpenTauntTargetPlayerId,
}) => {
  const [reducedMotion, setReducedMotion] = useState<boolean>(() =>
    readPrefersReducedMotion()
  );
  const [localOpenTauntTargetId, setLocalOpenTauntTargetId] = useState<number | null>(null);
  const [cooldownNowMs, setCooldownNowMs] = useState<number>(() => Date.now());

  const openTauntTargetId =
    controlledOpenTauntTargetId !== undefined
      ? controlledOpenTauntTargetId
      : localOpenTauntTargetId;

  const setOpenTauntTargetId = (nextId: number | null) => {
    if (onChangeOpenTauntTargetPlayerId) {
      onChangeOpenTauntTargetPlayerId(nextId);
    } else {
      setLocalOpenTauntTargetId(nextId);
    }
  };

  const setOpenTauntTargetIdRef = useRef(setOpenTauntTargetId);
  setOpenTauntTargetIdRef.current = setOpenTauntTargetId;

  useEffect(() => {
    return subscribePrefersReducedMotion(setReducedMotion);
  }, []);

  useEffect(() => {
    const now = Date.now();
    setCooldownNowMs(now);
    if (!tauntCooldownUntil || tauntCooldownUntil <= now) return;
    const interval = window.setInterval(() => {
      const current = Date.now();
      setCooldownNowMs(current);
      if (current >= tauntCooldownUntil) {
        window.clearInterval(interval);
      }
    }, 250);
    const expiryTimer = window.setTimeout(() => {
      setCooldownNowMs(Date.now());
      window.clearInterval(interval);
    }, Math.max(0, tauntCooldownUntil - now) + 20);
    return () => {
      window.clearInterval(interval);
      window.clearTimeout(expiryTimer);
    };
  }, [tauntCooldownUntil]);

  const tauntCooldownSecondsLeft =
    tauntCooldownUntil > cooldownNowMs
      ? Math.ceil((tauntCooldownUntil - cooldownNowMs) / 1000)
      : 0;

  const effectiveTauntActorId =
    tauntActorPlayerId !== undefined ? tauntActorPlayerId : localPlayerId;

  useEffect(() => {
    if (openTauntTargetId === null) return;
    const targetPlayer = players.slice(0, 4).find((p) => p.id === openTauntTargetId);
    const targetStillValid = Boolean(
      targetPlayer &&
        !targetPlayer.bankrupt &&
        effectiveTauntActorId !== null &&
        effectiveTauntActorId !== undefined &&
        targetPlayer.id !== effectiveTauntActorId
    );
    if (tauntCooldownSecondsLeft > 0 || !onSendBoardTaunt || !targetStillValid) {
      setOpenTauntTargetIdRef.current(null);
      return;
    }
    const handleOutsidePointerDown = (event: PointerEvent) => {
      if (
        event.target instanceof Element &&
        event.target.closest('[data-bt-taunt-root="true"]')
      ) {
        return;
      }
      setOpenTauntTargetIdRef.current(null);
    };
    document.addEventListener('pointerdown', handleOutsidePointerDown);
    return () => document.removeEventListener('pointerdown', handleOutsidePointerDown);
  }, [openTauntTargetId, tauntCooldownSecondsLeft, onSendBoardTaunt, players, effectiveTauntActorId]);

  return (
    <div className="fixed inset-0 z-20 pointer-events-none">
      {players.slice(0, 4).map((player, idx) => {
        const corner = CORNER_SPECS[idx] || CORNER_SPECS[0];
        const isActive = idx === activePlayerIndex && !player.bankrupt;
        const ownedProps = Object.values(properties)
          .filter((pr) => pr.ownerId === player.id)
          .sort((a, b) => a.tileIndex - b.tileIndex);
        const netWorth = calculateNetWorth(player, properties);
        const bubble = player.isBot ? botBubbles[player.id] : undefined;
        const isLocalHuman =
          localPlayerId !== null && localPlayerId !== undefined && player.id === localPlayerId;
        const canTaunt = Boolean(
          onSendBoardTaunt &&
            effectiveTauntActorId !== null &&
            effectiveTauntActorId !== undefined &&
            player.id !== effectiveTauntActorId &&
            !player.bankrupt
        );
        const isTauntOpen = canTaunt && openTauntTargetId === player.id;

        return (
          <PlayerCornerCard
            key={player.id}
            player={player}
            slotIndex={idx}
            corner={corner}
            isActive={isActive}
            isLocalHuman={isLocalHuman}
            isDebtTarget={debtPlayerId !== null && player.id === debtPlayerId}
            reducedMotion={reducedMotion}
            matchMode={matchMode}
            emoteText={playerEmotes?.[player.id]}
            isSpeaking={Boolean(speakingPlayerIds?.[player.id])}
            chatBubble={playerChatBubbles?.[player.id]}
            ownedProps={ownedProps}
            netWorth={netWorth}
            boardModifiers={boardModifiers}
            currencyStyle={currencyStyle}
            bubble={bubble}
            onDismissBubble={onDismissBubble}
            onSelectTile={onSelectTile}
            canTaunt={canTaunt}
            isTauntOpen={isTauntOpen}
            tauntCooldownSecondsLeft={tauntCooldownSecondsLeft}
            onToggleTauntPopover={(open) => setOpenTauntTargetId(open ? player.id : null)}
            onSendBoardTaunt={onSendBoardTaunt}
          />
        );
      })}
    </div>
  );
};

export const PlayerHUD = React.memo(PlayerHUDInner);
