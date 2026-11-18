import React, { useEffect, useRef, useState } from 'react';
import { BOARD_TILES } from '../game/boardData';
import {
  BotChatBubbleState,
  BotQuipEventKind,
  GameLogEntry,
  PlayerState,
  PropertyState,
} from '../game/types';

interface PlayerHUDProps {
  players: PlayerState[];
  activePlayerIndex: number;
  properties: Record<number, PropertyState>;
  logs: GameLogEntry[];
  botBubbles: Record<number, BotChatBubbleState>;
  onDismissBubble: (botId: number) => void;
  onSelectTile: (tileIndex: number) => void;
}

const PlayerTokenAvatar: React.FC<{
  tokenType: PlayerState['tokenType'];
  color: string;
}> = ({ tokenType, color }) => (
  <span
    aria-hidden="true"
    className="h-8 w-8 rounded-lg shrink-0 border-2 border-amber-300/90 flex items-center justify-center text-white shadow-sm"
    style={{
      background: `linear-gradient(180deg, ${color} 0%, rgba(15, 23, 42, 0.42) 160%)`,
    }}
  >
    {tokenType === 'yacht' ? (
      <svg viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current stroke-2">
        <path d="M12 4v9l5-3-5-6z" />
        <path d="M3 16l2.5 3h13L21 16H3z" />
      </svg>
    ) : tokenType === 'jet' ? (
      <svg viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current stroke-2">
        <path d="M21 15l-8-4V4.5a1.5 1.5 0 0 0-3 0V11l-8 4v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-4.5l8 2.5v-2z" />
      </svg>
    ) : tokenType === 'crown' ? (
      <svg viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current stroke-2">
        <path d="M3 18h18v2H3v-2zm0-11l4.5 4L12 5l4.5 6L21 7l-2 9H5L3 7z" />
      </svg>
    ) : (
      <svg viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current stroke-2">
        <path d="M5 11l1.5-4.5h11L19 11M3 11h18v6H3v-6z" />
        <circle cx="7" cy="17" r="1.5" />
        <circle cx="17" cy="17" r="1.5" />
      </svg>
    )}
  </span>
);

function getBubbleBadgeMeta(kind: BotQuipEventKind): {
  label: string;
  accentClass: string;
} {
  if (kind === 'BUY_PRIME_LAND') {
    return {
      label: 'Chốt đất đẹp',
      accentClass: 'text-emerald-700 bg-emerald-50 border-emerald-200',
    };
  }
  if (kind === 'COLLECT_BIG_RENT') {
    return {
      label: 'Thu tiền thuê lớn',
      accentClass: 'text-amber-800 bg-amber-50 border-amber-200',
    };
  }
  return {
    label: 'Bị phạt tiền',
    accentClass: 'text-rose-700 bg-rose-50 border-rose-200',
  };
}

/**
 * Smoothly animates cash changes with rolling integer count and brief +/- delta indicator.
 */
const AnimatedCash: React.FC<{ value: number }> = ({ value }) => {
  const [displayed, setDisplayed] = useState(value);
  const [delta, setDelta] = useState<number | null>(null);
  const prevRef = useRef(value);

  useEffect(() => {
    const startVal = prevRef.current;
    const diff = value - startVal;
    if (diff === 0) return;

    prevRef.current = value;
    setDelta(diff);

    const duration = 380;
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

    const hideTimer = window.setTimeout(() => {
      setDelta(null);
    }, 1400);

    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(hideTimer);
    };
  }, [value]);

  return (
    <div className="flex items-baseline gap-1.5">
      <span
        className={`font-display text-xl sm:text-2xl font-extrabold tabular-nums tracking-tight leading-none ${
          value < 0 ? 'text-rose-400' : 'text-amber-300'
        }`}
      >
        {displayed < 0 ? `-$${Math.abs(displayed).toLocaleString('en-US')}` : `$${displayed.toLocaleString('en-US')}`}
      </span>
      {delta !== null && (
        <span
          className={`text-xs font-bold tabular-nums ${
            delta > 0 ? 'text-emerald-400' : 'text-rose-400'
          }`}
        >
          {delta > 0 ? `+$${delta}` : `-$${Math.abs(delta)}`}
        </span>
      )}
    </div>
  );
};

export const PlayerHUD: React.FC<PlayerHUDProps> = ({
  players,
  activePlayerIndex,
  properties,
  logs,
  botBubbles,
  onDismissBubble,
  onSelectTile,
}) => {
  const [logExpanded, setLogExpanded] = useState(true);

  return (
    <div className="fixed inset-x-0 top-0 z-20 p-3 sm:p-4 pointer-events-none">
      <div className="mx-auto max-w-[1400px] flex flex-col gap-2.5">
        {/* Top Strip: 2 to 4 Player Cards */}
        <div
          className={`grid gap-2.5 ${
            players.length <= 2
              ? 'grid-cols-2 max-w-2xl'
              : players.length === 3
                ? 'grid-cols-3 max-w-4xl'
                : 'grid-cols-2 lg:grid-cols-4'
          }`}
        >
          {players.map((player, idx) => {
            const isActive = idx === activePlayerIndex && !player.bankrupt;
            const ownedProps = Object.values(properties)
              .filter((pr) => pr.ownerId === player.id)
              .sort((a, b) => a.tileIndex - b.tileIndex);
            const bubble = player.isBot ? botBubbles[player.id] : undefined;
            const badgeMeta = bubble ? getBubbleBadgeMeta(bubble.eventKind) : null;

            return (
              <div key={player.id} className="relative">
                <div
                  data-testid={`player-card-${player.id}`}
                  className={`pointer-events-auto rounded-2xl px-3.5 py-2.5 transition-all hud-panel ${
                    player.bankrupt
                      ? 'opacity-45 grayscale'
                      : isActive
                        ? 'ring-2 ring-amber-400 shadow-lg shadow-amber-500/20 translate-y-0.5'
                        : ''
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <PlayerTokenAvatar
                        tokenType={player.tokenType}
                        color={player.color}
                      />
                      <div className="min-w-0 flex items-baseline gap-1.5">
                        <span className="font-display text-base font-extrabold text-white truncate">
                          {player.name}
                        </span>
                        <span className="text-[11px] font-medium text-sky-200/75 shrink-0">
                          · {player.isBot ? 'Bot AI' : 'Người'}
                        </span>
                      </div>
                    </div>

                    {player.bankrupt ? (
                      <span className="text-[11px] font-semibold text-rose-400 shrink-0">
                        Phá sản
                      </span>
                    ) : bubble?.status === 'loading' ? (
                      <span
                        data-testid={`bot-chat-thinking-${player.id}`}
                        className="px-1.5 py-0.5 rounded-sm bg-white/10 text-[10px] font-semibold text-sky-200 shrink-0"
                      >
                        💬 Đang nghĩ...
                      </span>
                    ) : isActive ? (
                      <span className="px-2 py-0.5 rounded-md bg-amber-400/20 border border-amber-300/40 text-[11px] font-bold text-amber-300 shrink-0">
                        Đang tới lượt
                      </span>
                    ) : null}
                  </div>

                  {/* Cash + Status Row */}
                  <div className="mt-1.5 flex items-center justify-between gap-2">
                    <AnimatedCash value={player.cash} />
                    <div className="flex items-center gap-1.5 text-[11px] font-medium text-sky-100 shrink-0">
                      {player.inJail && (
                        <span className="text-orange-300 font-semibold">
                          Nhà Tù ({player.jailTurns}/3)
                        </span>
                      )}
                      {player.jailFreeCards > 0 && (
                        <span className="text-sky-300">Thẻ Ra Tù ×{player.jailFreeCards}</span>
                      )}
                    </div>
                  </div>

                  {/* Mini Monopoly Title-Deed Owned Property Badges */}
                  <div className="mt-1.5 flex items-center flex-wrap gap-1 min-h-[18px]">
                    {ownedProps.length === 0 ? (
                      <span className="text-[11px] text-sky-200/65">Chưa sở hữu bất động sản</span>
                    ) : (
                      ownedProps.map((pr) => {
                        const tile = BOARD_TILES[pr.tileIndex];
                        const dotColor = tile.groupColor || '#64748B';
                        return (
                          <button
                            key={pr.tileIndex}
                            type="button"
                            onClick={() => onSelectTile(pr.tileIndex)}
                            title={`${tile.name}${pr.level > 0 ? ` (Cấp ${pr.level})` : ''}`}
                            aria-label={`Xem ô ${tile.name}`}
                            className="h-4.5 w-3.5 rounded-[3px] bg-amber-50 border border-white/80 overflow-hidden flex flex-col items-center justify-between shadow-xs cursor-pointer hover:scale-115 transition-transform"
                          >
                            <span
                              className="w-full h-1.5 shrink-0"
                              style={{ backgroundColor: dotColor }}
                            />
                            <span className="text-[8px] leading-none font-extrabold text-slate-900 pb-0.5 tabular-nums">
                              {pr.level === 4 ? 'H' : pr.level > 0 ? pr.level : ''}
                            </span>
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>

                {/* Witty Gemini Bot AI Speech Bubble Anchored Directly Beneath Bot Avatar */}
                {bubble &&
                  badgeMeta &&
                  !player.bankrupt &&
                  (bubble.status === 'ready' || bubble.status === 'error') && (
                    <div
                      role="status"
                      aria-live="polite"
                      data-testid={`bot-chat-bubble-${player.id}`}
                      className="pointer-events-auto absolute left-0 right-0 top-full mt-2 z-30 animate-pop-in"
                    >
                      <div
                        className="relative rounded-xl bg-white text-slate-900 px-3 py-2 shadow-xl border-2"
                        style={{ borderColor: player.color }}
                      >
                        {/* Upward Speech Pointer Tail Aligned Under Bot Avatar */}
                        <span
                          aria-hidden="true"
                          className="absolute -top-2 left-5 h-3.5 w-3.5 rotate-45 bg-white border-l-2 border-t-2"
                          style={{ borderColor: player.color }}
                        />

                        <div className="relative flex items-center justify-between gap-2 mb-1">
                          <span
                            className={`px-1.5 py-0.5 rounded-sm border text-[10px] font-bold tracking-tight ${badgeMeta.accentClass}`}
                          >
                            {badgeMeta.label}
                          </span>
                          <button
                            type="button"
                            onClick={() => onDismissBubble(player.id)}
                            aria-label={`Đóng bình luận của ${player.name}`}
                            className="h-4 w-4 rounded-xs text-slate-400 hover:text-slate-700 flex items-center justify-center text-xs font-bold cursor-pointer"
                          >
                            ×
                          </button>
                        </div>

                        {bubble.status === 'error' ? (
                          <p className="text-[11px] font-medium text-rose-700 leading-snug">
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
          })}
        </div>

        {/* Compact Collapsible Match Log on Left Edge */}
        <div className="w-72 sm:w-80 pointer-events-auto">
          <div className="hud-panel rounded-xl overflow-hidden">
            <button
              type="button"
              onClick={() => setLogExpanded((v) => !v)}
              aria-expanded={logExpanded}
              className="w-full flex items-center justify-between px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-white/5 transition-colors cursor-pointer"
            >
              <span>Nhật ký trận đấu ({logs.length})</span>
              <span className="text-slate-400">{logExpanded ? '▾ Thu gọn' : '▸ Mở'}</span>
            </button>
            {logExpanded && (
              <div className="px-3 pb-2.5 max-h-32 overflow-y-auto slim-scroll space-y-1 border-t border-white/10 pt-2">
                {logs.slice(0, 8).map((entry) => (
                  <div
                    key={entry.id}
                    className="text-xs leading-snug flex items-start gap-1.5 text-slate-200"
                  >
                    {entry.playerColor && (
                      <span
                        className="mt-1 h-2 w-2 rounded-xs shrink-0"
                        style={{ backgroundColor: entry.playerColor }}
                      />
                    )}
                    <span
                      className={
                        entry.tone === 'positive'
                          ? 'text-emerald-300'
                          : entry.tone === 'negative'
                            ? 'text-rose-300'
                            : entry.tone === 'highlight'
                              ? 'text-amber-300 font-semibold'
                              : 'text-slate-200'
                      }
                    >
                      {entry.text}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
