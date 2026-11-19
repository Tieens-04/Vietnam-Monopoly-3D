import React, { useEffect, useRef, useState } from 'react';
import { deriveAvatarMood, getPlayerPersona } from '../game/avatarLogic';
import { BOARD_TILES } from '../game/boardData';
import { formatBusinessTourSpaced } from '../game/rules';
import {
  BotChatBubbleState,
  BotQuipEventKind,
  PlayerState,
  PropertyState,
} from '../game/types';
import { PlayerAvatar3D } from './PlayerAvatar3D';

interface PlayerHUDProps {
  players: PlayerState[];
  activePlayerIndex: number;
  properties: Record<number, PropertyState>;
  botBubbles: Record<number, BotChatBubbleState>;
  onDismissBubble: (botId: number) => void;
  onSelectTile: (tileIndex: number) => void;
}

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
 * Green Business Tour Money / Leaf Icon inside the white rounded cash pill.
 */
const GreenMoneyLeafIcon: React.FC = () => (
  <svg
    viewBox="0 0 24 24"
    aria-hidden="true"
    className="h-4 w-4 sm:h-4.5 sm:w-4.5 shrink-0"
  >
    <rect
      x="2"
      y="5"
      width="20"
      height="14"
      rx="3.5"
      fill="#22C55E"
      stroke="#15803D"
      strokeWidth="1.6"
    />
    <circle cx="12" cy="12" r="3.4" fill="#DCFCE7" />
    <path
      d="M12 9.4c1.5 0 2.4 1.1 2.4 2.6 0 1.4-1.1 2.6-2.4 2.6-1.3 0-2.4-1.2-2.4-2.6 0-1.5.9-2.6 2.4-2.6z"
      fill="#16A34A"
    />
    <circle cx="5.2" cy="8.5" r="1" fill="#BBF7D0" />
    <circle cx="18.8" cy="15.5" r="1" fill="#BBF7D0" />
  </svg>
);

/**
 * Smoothly animates cash changes in Business Tour spaced format (`1 435 000` / `4 500 000`).
 */
const AnimatedCashPill: React.FC<{
  value: number;
  delta: number | null;
  bankrupt: boolean;
}> = ({ value, delta, bankrupt }) => {
  const [displayed, setDisplayed] = useState(value);
  const prevRef = useRef(value);

  useEffect(() => {
    const startVal = prevRef.current;
    const diff = value - startVal;
    if (diff === 0) return;

    prevRef.current = value;
    const duration = 360;
    const t0 = performance.now();
    let raf = 0;

    const step = (now: number) => {
      const p = Math.min(1, (now - t0) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      setDisplayed(Math.round(startVal + diff * eased));
      if (p < 1) {
        raf = requestAnimationFrame(step);
      }
    };
    raf = requestAnimationFrame(step);

    return () => cancelAnimationFrame(raf);
  }, [value]);

  return (
    <div className="relative w-full rounded-full bg-white border border-black/10 shadow-[inset_0_2px_3px_rgba(15,23,42,0.12)] px-2.5 py-1 flex items-center justify-between gap-1.5">
      <div className="flex items-center gap-1.5 min-w-0">
        <GreenMoneyLeafIcon />
        <span
          className={`font-mono-num text-xs sm:text-[15px] font-extrabold tracking-tight leading-none truncate ${
            bankrupt || value < 0 ? 'text-rose-600' : 'text-slate-800'
          }`}
        >
          {bankrupt ? '0' : formatBusinessTourSpaced(displayed)}
        </span>
      </div>

      {delta !== null && !bankrupt && (
        <span
          className={`font-mono-num text-[10px] font-extrabold shrink-0 ${
            delta > 0 ? 'text-[#16A34A]' : 'text-rose-600'
          }`}
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
    containerClass: 'top-2.5 left-2.5 sm:top-3.5 sm:left-3.5',
    isRight: false,
    isBottom: false,
  },
  // Slot 1: Top-Right (Player 2 - Lime Green)
  {
    containerClass: 'top-2.5 right-2.5 sm:top-3.5 sm:right-3.5',
    isRight: true,
    isBottom: false,
  },
  // Slot 2: Bottom-Right (Player 3 - Hot Pink)
  {
    containerClass: 'bottom-2.5 right-2.5 sm:bottom-3.5 sm:right-3.5',
    isRight: true,
    isBottom: true,
  },
  // Slot 3: Bottom-Left (Player 4 - Sky Blue)
  {
    containerClass: 'bottom-2.5 left-2.5 sm:bottom-3.5 sm:left-3.5',
    isRight: false,
    isBottom: true,
  },
];

interface PlayerCornerCardProps {
  player: PlayerState;
  slotIndex: number;
  corner: CornerPositionSpec;
  isActive: boolean;
  ownedProps: PropertyState[];
  bubble?: BotChatBubbleState;
  onDismissBubble: (botId: number) => void;
  onSelectTile: (tileIndex: number) => void;
}

const PlayerCornerCard: React.FC<PlayerCornerCardProps> = ({
  player,
  slotIndex,
  corner,
  isActive,
  ownedProps,
  bubble,
  onDismissBubble,
  onSelectTile,
}) => {
  const [recentDelta, setRecentDelta] = useState<number | null>(null);
  const prevCashRef = useRef(player.cash);

  useEffect(() => {
    const diff = player.cash - prevCashRef.current;
    if (diff === 0) return;
    prevCashRef.current = player.cash;
    setRecentDelta(diff);
    const timer = window.setTimeout(() => setRecentDelta(null), 1900);
    return () => window.clearTimeout(timer);
  }, [player.cash]);

  const persona = getPlayerPersona(player);
  const mood = deriveAvatarMood({
    bankrupt: player.bankrupt,
    inJail: player.inJail,
    cash: player.cash,
    isActive,
    recentCashDelta: recentDelta,
    bubble,
  });
  const badgeMeta = bubble ? getBubbleBadgeMeta(bubble.eventKind) : null;
  const palette = getPlayerBannerPalette(player.color);

  return (
    <div
      className={`fixed ${corner.containerClass} w-[46.5vw] max-w-[266px] sm:w-[266px]`}
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
          className={`relative rounded-2xl p-1.5 sm:p-2 flex items-center gap-2 border-[2.5px] border-white ${
            corner.isRight ? 'flex-row-reverse' : 'flex-row'
          } ${player.bankrupt ? 'saturate-75' : ''}`}
          style={{
            background: `linear-gradient(180deg, ${palette.topHex} 0%, ${palette.bottomHex} 100%)`,
            boxShadow: isActive
              ? `0 4px 0 ${palette.lipHex}, 0 0 0 3px rgba(255,255,255,0.85), 0 14px 28px -6px rgba(15,23,42,0.38), inset 0 2px 1px rgba(255,255,255,0.55)`
              : `0 4px 0 ${palette.lipHex}, 0 10px 22px -6px rgba(15,23,42,0.28), inset 0 2px 1px rgba(255,255,255,0.5)`,
          }}
        >
          {/* Large Square Character Portrait on Outer Corner Edge + Tilted BANKRUPT Rubber Stamp */}
          <div className="relative shrink-0">
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
                  BANKRUPT
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
              <span
                className="font-display text-xs sm:text-[13px] font-black uppercase tracking-wide text-white truncate leading-tight"
                style={{
                  textShadow: '0 1.5px 2px rgba(15, 23, 42, 0.55)',
                }}
              >
                {player.name}
              </span>

              {!player.bankrupt && player.inJail ? (
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
            </div>

            <AnimatedCashPill
              value={player.cash}
              delta={recentDelta}
              bankrupt={player.bankrupt}
            />
          </div>
        </div>

        {/* Owned Cities Color-Coded Mini Tabs */}
        {ownedProps.length > 0 && !player.bankrupt && (
          <div
            className={`flex items-center flex-wrap gap-1 px-1 ${
              corner.isRight ? 'justify-end' : 'justify-start'
            }`}
          >
            {ownedProps.map((pr) => {
              const tile = BOARD_TILES[pr.tileIndex];
              const headerColor = tile.groupColor || player.color;
              return (
                <button
                  key={pr.tileIndex}
                  type="button"
                  onClick={() => onSelectTile(pr.tileIndex)}
                  title={`${tile.name}${pr.level > 0 ? ` (Cấp ${pr.level})` : ''}`}
                  aria-label={`Xem ô ${tile.name}`}
                  className="h-5 w-4.5 rounded-[4px] bg-white border border-white shadow-sm overflow-hidden flex flex-col items-center justify-between cursor-pointer hover:-translate-y-0.5 transition-transform"
                >
                  <span
                    className="w-full h-1.5 shrink-0"
                    style={{ backgroundColor: headerColor }}
                  />
                  <span className="font-mono-num text-[8px] leading-none font-extrabold text-slate-800 pb-[1px]">
                    {pr.level === 4 ? '★' : pr.level > 0 ? pr.level : ''}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

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
                  className="h-5 w-5 rounded-full bg-sky-100 text-sky-700 hover:bg-sky-200 flex items-center justify-center text-xs font-bold cursor-pointer"
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

export const PlayerHUD: React.FC<PlayerHUDProps> = ({
  players,
  activePlayerIndex,
  properties,
  botBubbles,
  onDismissBubble,
  onSelectTile,
}) => {
  return (
    <div className="fixed inset-0 z-20 pointer-events-none">
      {players.slice(0, 4).map((player, idx) => {
        const corner = CORNER_SPECS[idx] || CORNER_SPECS[0];
        const isActive = idx === activePlayerIndex && !player.bankrupt;
        const ownedProps = Object.values(properties)
          .filter((pr) => pr.ownerId === player.id)
          .sort((a, b) => a.tileIndex - b.tileIndex);
        const bubble = player.isBot ? botBubbles[player.id] : undefined;

        return (
          <PlayerCornerCard
            key={player.id}
            player={player}
            slotIndex={idx}
            corner={corner}
            isActive={isActive}
            ownedProps={ownedProps}
            bubble={bubble}
            onDismissBubble={onDismissBubble}
            onSelectTile={onSelectTile}
          />
        );
      })}
    </div>
  );
};
