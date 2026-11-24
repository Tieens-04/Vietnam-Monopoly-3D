import React, { useEffect, useRef, useState } from 'react';
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
import { CurrencyStyleId, MatchBoardModifiers, MatchMode, PlayerState, PropertyState, TileKind, BotChatBubbleState, BotQuipEventKind } from '../game/types';
import {
  readPrefersReducedMotion,
  subscribePrefersReducedMotion,
} from '../three/animationDirector';
import { CurrencyStyleIcon } from './CurrencyStyleBadge';
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

const BOARD_TAUNT_OPTIONS: ReadonlyArray<{
  kind: BoardTauntKind;
  emoji: string;
  label: string;
}> = [
  { kind: 'slipper', emoji: '🩴', label: 'Dép tổ ong' },
  { kind: 'tomato', emoji: '🍅', label: 'Cà chua' },
  { kind: 'confetti', emoji: '🎉', label: 'Pháo giấy' },
  { kind: 'cash_stack', emoji: '💸', label: 'Cọc tiền' },
];

function getBubbleBadgeMeta(kind: BotQuipEventKind): {
  label: string;
  textClass: string;
} {
  if (kind === 'BUY_PRIME_LAND') {
    return {
      label: 'Thâu tóm đất đẹp',
      textClass: 'text-[#15803d]',
    };
  }
  if (kind === 'COLLECT_BIG_RENT') {
    return {
      label: 'Thu phí thuê lớn',
      textClass: 'text-[#b45309]',
    };
  }
  return {
    label: 'Nộp phạt / Trả phí',
    textClass: 'text-[#e11d48]',
  };
}

interface BannerColorPalette {
  topHex: string;
  bottomHex: string;
  lipHex: string;
}

function getPlayerBannerPalette(colorHex: string): BannerColorPalette {
  const upper = colorHex.toUpperCase();
  // Player 1: Vibrant Yellow/Gold (#F5B800)
  if (upper === '#F5B800' || upper.startsWith('#F5') || upper.startsWith('#D9')) {
    return {
      topHex: '#FFD426',
      bottomHex: '#E59F00',
      lipHex: '#B47100',
    };
  }
  // Player 2: Lime Green (#66C61C)
  if (upper === '#66C61C' || upper.startsWith('#66') || upper.startsWith('#10')) {
    return {
      topHex: '#84E635',
      bottomHex: '#52B110',
      lipHex: '#377D07',
    };
  }
  // Player 3: Hot Pink/Magenta (#E91E63)
  if (upper === '#E91E63' || upper.startsWith('#E9') || upper.startsWith('#F4')) {
    return {
      topHex: '#FF4F8B',
      bottomHex: '#D81557',
      lipHex: '#980B3B',
    };
  }
  // Player 4: Sky Blue (#29B6F6)
  return {
    topHex: '#56CCF8',
    bottomHex: '#0E94D8',
    lipHex: '#06669B',
  };
}

/**
 * Smoothly animates cash changes in Business Tour spaced format (`1 435 000` / `4 500 000`)
 * with live 3D currency style iconography and incoming/outgoing visual pulse.
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
      // power2.out ease
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
    ? `border-rose-500 ring-2 ring-rose-400/80 ${reducedMotion ? '' : 'animate-pulse'}`
    : delta !== null && !bankrupt
      ? delta > 0
        ? 'border-emerald-500 ring-2 ring-emerald-300/75'
        : 'border-rose-500 ring-2 ring-rose-300/75'
      : 'border-black/10';

  return (
    <div
      className={`relative w-full rounded-full bg-white ${deltaRingClass} shadow-[inset_0_2px_3px_rgba(15,23,42,0.12)] px-2.5 py-1 flex items-center justify-between gap-1.5 transition-shadow duration-150`}
    >
      <div className="flex items-center gap-1.5 min-w-0">
        <CurrencyStyleIcon
          styleId={currencyStyle}
          className="h-4 w-4 sm:h-4.5 sm:w-4.5 shrink-0"
        />
        <span
          className={`font-mono-num text-xs sm:text-[15px] font-extrabold tracking-tight leading-none truncate ${
            bankrupt || isInDebt ? 'text-rose-600' : 'text-slate-800'
          }`}
        >
          {bankrupt ? '0' : formatBusinessTourSpaced(displayed)}
        </span>
      </div>

      {delta !== null && !bankrupt && (
        <span
          className={`font-mono-num text-[10px] font-extrabold shrink-0 ${
            reducedMotion ? '' : 'animate-pop-in'
          } ${delta > 0 ? 'text-[#16A34A]' : 'text-rose-600'}`}
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
  // Slot 0: Top-Left (Player 1 - Yellow/Gold)
  {
    containerClass:
      'top-[max(0.5rem,env(safe-area-inset-top,0px))] left-[max(0.5rem,env(safe-area-inset-left,0px))] sm:top-3.5 sm:left-3.5',
    isRight: false,
    isBottom: false,
  },
  // Slot 1: Top-Right (Player 2 - Lime Green)
  {
    containerClass:
      'top-[max(0.5rem,env(safe-area-inset-top,0px))] right-[max(0.5rem,env(safe-area-inset-right,0px))] sm:top-3.5 sm:right-3.5',
    isRight: true,
    isBottom: false,
  },
  // Slot 2: Bottom-Right (Player 3 - Hot Pink)
  {
    containerClass:
      'bottom-[max(0.5rem,env(safe-area-inset-bottom,0px))] right-[max(0.5rem,env(safe-area-inset-right,0px))] sm:bottom-3.5 sm:right-3.5',
    isRight: true,
    isBottom: true,
  },
  // Slot 3: Bottom-Left (Player 4 - Sky Blue)
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
  const palette = getPlayerBannerPalette(player.color);
  const isOnTauntCooldown = tauntCooldownSecondsLeft > 0;

  return (
    <div
      className={`fixed ${corner.containerClass} ${
        isTauntOpen ? 'z-30' : ''
      } w-[46.5vw] max-w-[266px] sm:w-[266px] bt-hud-corner ${
        corner.isRight ? 'bt-hud-corner-right' : ''
      }`}
    >
      <div
        data-testid={`player-card-${player.id}`}
        className={`pointer-events-auto relative flex ${
          corner.isBottom ? 'flex-col-reverse' : 'flex-col'
        } gap-1.5 transition-transform duration-150 ${
          isActive && !player.bankrupt ? 'scale-[1.03]' : ''
        }`}
      >
        {/* Bold Glossy Color-Coded Business Tour Banner */}
        <div
          className={`relative rounded-2xl p-1.5 sm:p-2 flex items-center gap-1.5 sm:gap-2 border-[2.5px] border-white ${
            corner.isRight ? 'flex-row-reverse' : 'flex-row'
          } ${player.bankrupt ? 'saturate-75' : ''}`}
          style={{
            background: `linear-gradient(to bottom var(--in-oklab), ${palette.topHex} 0%, ${palette.bottomHex} 100%)`,
            boxShadow: isActive
              ? `0 4px 0 ${palette.lipHex}, 0 0 0 3px rgba(255,255,255,0.88), 0 14px 28px -6px rgba(15,23,42,0.38), inset 0 2px 1px rgba(255,255,255,0.58)`
              : `0 4px 0 ${palette.lipHex}, 0 10px 22px -6px rgba(15,23,42,0.28), inset 0 2px 1px rgba(255,255,255,0.52)`,
          }}
        >
          {/* Large Square Character Portrait on Outer Corner Edge + Tilted BANKRUPT Rubber Stamp */}
          <div
            data-testid={`player-avatar-ring-${player.id}`}
            data-speaking={isSpeaking ? 'true' : 'false'}
            className={`relative shrink-0 rounded-xl transition-shadow ${
              isSpeaking
                ? 'ring-4 ring-emerald-400 shadow-[0_0_16px_rgba(52,211,153,0.85)]'
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
              className="!rounded-xl !border-[2.5px] !border-white shadow-md"
              ariaLabel={`Chân dung 3D ${player.name} (${persona.personaName})`}
            />

            {player.bankrupt && (
              <div
                data-testid={`bankrupt-stamp-${player.id}`}
                className="pointer-events-none absolute inset-0 flex items-center justify-center z-10"
              >
                <span className="-rotate-12 px-1.5 py-[2px] rounded-[4px] bg-[#E11D48]/95 border-2 border-[#FFE4E6] text-[9px] sm:text-[10px] font-display font-black uppercase tracking-wider text-white shadow-lg whitespace-nowrap">
                  PHÁ SẢN
                </span>
              </div>
            )}
          </div>

          {/* Colored Header Strip (Uppercase White Name) + Inner White Cash Pill */}
          <div className="flex-1 min-w-0 flex flex-col justify-center gap-1">
            <div
              className={`w-full flex items-center justify-between gap-1 px-0.5 ${
                corner.isRight ? 'flex-row-reverse' : 'flex-row'
              }`}
            >
              <div className="flex items-center gap-1 min-w-0">
                <span
                  className="font-display text-xs sm:text-[13px] font-black uppercase tracking-wide text-white truncate leading-tight"
                  style={{
                    textShadow: '0 1.5px 2px rgba(15, 23, 42, 0.55)',
                  }}
                >
                  {player.name}
                </span>
                {isLocalHuman && (
                  <span className="px-1.5 py-[1px] rounded-full bg-white text-[9px] font-black uppercase text-sky-900 shrink-0 shadow-2xs">
                    BẠN
                  </span>
                )}
                {(matchMode === 'TEAMS_2V2' || player.teamId !== undefined) &&
                  player.teamId !== undefined && (
                    <span
                      title={player.teamId === 0 ? 'Đội A (Xanh)' : 'Đội B (Đỏ)'}
                      className={`px-1.5 py-[1px] rounded-full text-[9px] font-black uppercase shrink-0 shadow-2xs ${
                        player.teamId === 0
                          ? 'bg-sky-950/85 text-sky-200 border border-sky-300/70'
                          : 'bg-rose-950/85 text-rose-200 border border-rose-300/70'
                      }`}
                    >
                      {player.teamId === 0 ? 'Đội A' : 'Đội B'}
                    </span>
                  )}
              </div>

              <div className="flex items-center gap-1 shrink-0">
                {!player.bankrupt && player.onlineConnected === false && !player.isBot ? (
                  <span className="px-1.5 py-[1px] rounded-full bg-rose-900/80 text-[9px] font-extrabold text-amber-200 shrink-0">
                    ⚠️ Mất mạng
                  </span>
                ) : !player.bankrupt && player.onlineBotTakeover ? (
                  <span className="px-1.5 py-[1px] rounded-full bg-slate-900/65 text-[9px] font-extrabold text-sky-200 shrink-0">
                    🤖 Thế chỗ
                  </span>
                ) : !player.bankrupt && player.inJail ? (
                  <span className="px-1.5 py-[1px] rounded-full bg-black/25 text-[9px] font-extrabold uppercase text-white shrink-0 tabular-nums">
                    Đảo {player.jailTurns}/3
                  </span>
                ) : !player.bankrupt && bubble?.status === 'loading' ? (
                  <span
                    data-testid={`bot-chat-thinking-${player.id}`}
                    className="px-1.5 py-[1px] rounded-full bg-white/30 text-[9px] font-extrabold text-white shrink-0"
                  >
                    ...
                  </span>
                ) : !player.bankrupt && isActive ? (
                  <span className="h-2.5 w-2.5 rounded-full bg-white shadow-[0_0_8px_#ffffff] shrink-0" />
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
                    className={`icon-hit-target h-5 sm:h-5.5 min-w-5 px-1 rounded-full border border-white/95 text-[10px] font-black flex items-center justify-center gap-0.5 shadow-xs transition-transform shrink-0 ${
                      isOnTauntCooldown
                        ? 'bg-slate-200/95 text-slate-700 cursor-not-allowed opacity-85 font-mono-num'
                        : isTauntOpen
                          ? 'bg-[#F5B800] text-slate-950 scale-105 cursor-pointer'
                          : 'bg-white/95 hover:bg-white text-slate-900 hover:scale-105 cursor-pointer'
                    }`}
                  >
                    <span aria-hidden="true">🎯</span>
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

            {!player.bankrupt && (
              <div
                className={`w-full flex items-center justify-between gap-1 px-1 text-[10px] font-extrabold text-white/95 ${
                  corner.isRight ? 'flex-row-reverse' : 'flex-row'
                }`}
                style={{ textShadow: '0 1px 1.5px rgba(15, 23, 42, 0.5)' }}
              >
                <span>
                  Vòng {player.laps + 1}
                  {player.pendingWorldTour ? ' · ✈️ Sẵn bay' : ''}
                </span>
                <span>
                  Tổng: <span className="font-mono-num">{formatBusinessTourCompact(netWorth)}</span>
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Owned Cities & Resorts Color-Coded Mini Tabs */}
        {ownedProps.length > 0 && !player.bankrupt && (
          <div
            className={`flex items-center flex-wrap gap-1 px-1 ${
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
                  title={`${tile.name}${isResort ? ' (Khu nghỉ dưỡng)' : pr.level > 0 ? ` (Cấp ${pr.level})` : ''}${isFestival ? ' · 🎉 Lễ Hội ×2' : ''}${isCup ? ' · 🏆 Cúp Quốc Gia' : ''}${isShielded ? ' · 🛡️ Khiên Bảo Hộ' : ''}${isOutage ? ' · ⚡ Mất điện' : ''}`}
                  aria-label={`Xem ô ${tile.name}`}
                  className={`icon-hit-target-y h-5 w-4.5 rounded-[4px] bg-white border shadow-sm flex flex-col items-center justify-between cursor-pointer hover:-translate-y-0.5 transition-transform ${
                    isOutage
                      ? 'border-slate-500 ring-1 ring-slate-400 opacity-75'
                      : isCup
                        ? 'border-amber-400 ring-1 ring-amber-400'
                        : isShielded
                          ? 'border-sky-400 ring-1 ring-sky-400'
                          : isFestival
                            ? 'border-orange-400 ring-1 ring-orange-300'
                            : 'border-white'
                  }`}
                >
                  <span
                    className="w-full h-1.5 shrink-0 rounded-t-[3px]"
                    style={{ backgroundColor: headerColor }}
                  />
                  <span className="font-mono-num text-[8px] leading-none font-extrabold text-slate-800 pb-[1px]">
                    {isOutage
                      ? '⚡'
                      : isCup
                        ? '🏆'
                        : isShielded
                          ? '🛡️'
                          : isResort
                            ? '🏖️'
                            : pr.level === 4
                              ? '★'
                              : pr.level > 0
                                ? pr.level
                                : ''}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Quick Emote Speech Pill for Online/Human Players */}
      {emoteText && !player.bankrupt && (
        <div
          data-testid={`player-emote-${player.id}`}
          className={`pointer-events-none mt-1.5 flex ${
            corner.isRight ? 'justify-end' : 'justify-start'
          }`}
        >
          <div className="px-3 py-1 rounded-2xl bg-white border-2 border-sky-300 shadow-lg text-xs font-extrabold text-slate-800 animate-pop-in">
            {emoteText}
          </div>
        </div>
      )}

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
            className={`px-3 py-1.5 rounded-2xl border-2 shadow-lg text-xs font-extrabold leading-snug animate-pop-in break-words [overflow-wrap:anywhere] ${
              chatBubble.isTeam
                ? 'bg-sky-50 border-sky-400 text-sky-950'
                : 'bg-white border-sky-300 text-slate-900'
            }`}
          >
            {chatBubble.isTeam && (
              <span className="mr-1 px-1.5 py-[0.5px] rounded-md bg-sky-600 text-white text-[10px] font-black align-middle">
                [Đội]
              </span>
            )}
            <span>{chatBubble.text}</span>
          </div>
        </div>
      )}

      {/* Quick Taunt Projectile Picker Popover */}
      {canTaunt && isTauntOpen && !isOnTauntCooldown && (
        <div
          data-testid={`bt-taunt-popover-p${player.id}`}
          data-bt-taunt-root="true"
          role="menu"
          aria-label={`Chọn vật phẩm ném tới ${player.name}`}
          className={`pointer-events-auto absolute z-40 w-56 max-w-[calc(100vw-1rem)] bt-casual-modal rounded-2xl overflow-hidden animate-pop-in ${
            corner.isRight ? 'right-0' : 'left-0'
          } ${corner.isBottom ? 'bottom-full mb-2' : 'top-full mt-2'}`}
        >
          <div className="bt-header-sky px-3 py-1.5 flex items-center justify-between gap-2">
            <span className="font-display text-[11px] font-black uppercase tracking-wide truncate">
              🎯 Ném {player.name}
            </span>
            <button
              type="button"
              onClick={() => onToggleTauntPopover?.(false)}
              aria-label="Đóng bảng chọn ném đồ"
              className="icon-hit-target h-5 w-5 rounded-full bg-white/25 hover:bg-white/40 text-white text-[10px] font-bold flex items-center justify-center cursor-pointer shrink-0"
            >
              ✕
            </button>
          </div>
          <div className="p-2 grid grid-cols-2 gap-1.5">
            {BOARD_TAUNT_OPTIONS.map((opt) => (
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
                className="px-2 py-1.5 rounded-xl bg-sky-50 hover:bg-sky-100 border border-sky-200 flex items-center gap-1.5 text-left text-[11px] font-extrabold text-slate-800 transition-colors cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed"
              >
                <span className="text-sm leading-none shrink-0" aria-hidden="true">
                  {opt.emoji}
                </span>
                <span className="truncate">{opt.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Directional Bot AI Comic Speech Card */}
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
            <div className="relative rounded-2xl bt-casual-modal px-3.5 py-2.5 text-slate-900">
              <div className="flex items-center justify-between gap-2 mb-1">
                <span className={`text-[11px] font-extrabold uppercase ${badgeMeta.textClass}`}>
                  {badgeMeta.label}
                </span>
                <button
                  type="button"
                  onClick={() => onDismissBubble(player.id)}
                  aria-label={`Đóng bình luận của ${player.name}`}
                  className="icon-hit-target h-5 w-5 rounded-full bg-sky-100 text-sky-700 hover:bg-sky-200 flex items-center justify-center text-xs font-bold cursor-pointer"
                >
                  ✕
                </button>
              </div>

              {bubble.status === 'error' ? (
                <p className="text-[11px] font-semibold text-rose-600 leading-snug">
                  {bubble.text}
                </p>
              ) : (
                <p className="text-xs font-semibold text-slate-800 leading-snug">
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

  useEffect(() => {
    if (openTauntTargetId === null) return;
    if (tauntCooldownSecondsLeft > 0 || !onSendBoardTaunt) {
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
  }, [openTauntTargetId, tauntCooldownSecondsLeft, onSendBoardTaunt]);

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
            localPlayerId !== null &&
            localPlayerId !== undefined &&
            player.id !== localPlayerId &&
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
