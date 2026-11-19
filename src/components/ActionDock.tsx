import React, { useState } from 'react';
import { formatBusinessTourCompact, JAIL_FINE } from '../game/rules';
import { GameLogEntry, PlayerState, TurnPhase } from '../game/types';

interface ActionDockProps {
  currentPlayer: PlayerState;
  turnCount: number;
  turnPhase: TurnPhase;
  lastDice: [number, number] | null;
  logs: GameLogEntry[];
  ownedCount: number;
  canTrade: boolean;
  speedMultiplier: 1 | 2;
  cinematicCamera: boolean;
  nightMode: boolean;
  soundMuted: boolean;
  dockCollapsed: boolean;
  onToggleDock: () => void;
  onRollDice: () => void;
  onPayJailFine: () => void;
  onUseJailCard: () => void;
  onOpenAssetsModal: () => void;
  onOpenTradeModal: () => void;
  onOpenRulebook: () => void;
  onEndTurn: () => void;
  onChangeSpeed: (speed: 1 | 2) => void;
  onToggleCinematic: () => void;
  onToggleNightMode: () => void;
  onResetCamera: () => void;
  onToggleSound: () => void;
  onOpenPause: () => void;
  onTriggerEmote: (emoteText: string) => void;
}

const QUICK_EMOTES: Array<{ emoji: string; label: string }> = [
  { emoji: '🎲', label: 'Đổ lớn nào!' },
  { emoji: '😎', label: 'Đất của tôi!' },
  { emoji: '💸', label: 'Xin tiền thuê nhé!' },
  { emoji: '😱', label: 'Thôi xong rồi!' },
  { emoji: '🔥', label: 'Quyết chiến!' },
  { emoji: '🤝', label: 'Giao dịch nhé!' },
];

export const ActionDock: React.FC<ActionDockProps> = ({
  currentPlayer,
  logs,
  turnPhase,
  ownedCount,
  canTrade,
  speedMultiplier,
  cinematicCamera,
  nightMode,
  soundMuted,
  onRollDice,
  onPayJailFine,
  onUseJailCard,
  onOpenAssetsModal,
  onOpenTradeModal,
  onOpenRulebook,
  onEndTurn,
  onChangeSpeed,
  onToggleCinematic,
  onToggleNightMode,
  onResetCamera,
  onToggleSound,
  onOpenPause,
  onTriggerEmote,
}) => {
  const [openMenu, setOpenMenu] = useState<'none' | 'emotes' | 'settings' | 'logs'>('none');

  const isHumanTurn = !currentPlayer.isBot && !currentPlayer.bankrupt;

  const canHumanManageAssets =
    isHumanTurn &&
    (turnPhase === 'AWAIT_ROLL' ||
      turnPhase === 'AWAIT_END_TURN' ||
      turnPhase === 'DEBT_RESOLUTION');

  const canHumanTradeNow =
    isHumanTurn &&
    canTrade &&
    (turnPhase === 'AWAIT_ROLL' || turnPhase === 'AWAIT_END_TURN');

  const isModalDecisionPhase =
    turnPhase === 'BUY_DECISION' ||
    turnPhase === 'UPGRADE_DECISION' ||
    turnPhase === 'BUYOUT_DECISION' ||
    turnPhase === 'WORLD_TOUR' ||
    turnPhase === 'CARD_REVEAL' ||
    turnPhase === 'DEBT_RESOLUTION';

  const toggleMenu = (target: 'emotes' | 'settings' | 'logs') => {
    setOpenMenu((prev) => (prev === target ? 'none' : target));
  };

  return (
    <>
      {/* =================================================================
          1. MIDDLE-RIGHT 3 CIRCULAR GLOSSY CYAN/BLUE FLOATING UTILITY BUTTONS
             (Emotes, Audio/Settings, Pause — Business Tour Signature Layout)
          ================================================================= */}
      <div
        data-testid="bt-right-utility-rail"
        className="fixed right-3 sm:right-4 top-1/2 -translate-y-1/2 z-25 flex flex-col items-center gap-3 pointer-events-none"
      >
        {/* Button 1: Emotes / Quick Chat */}
        <button
          type="button"
          data-testid="bt-btn-emotes"
          tabIndex={-1}
          onClick={(e) => {
            e.currentTarget.blur();
            toggleMenu('emotes');
          }}
          aria-expanded={openMenu === 'emotes'}
          aria-label="Biểu cảm và Trò chuyện nhanh"
          title="Biểu cảm nhân vật"
          className={`pointer-events-auto h-12 w-12 sm:h-13 sm:w-13 rounded-full flex items-center justify-center cursor-pointer ${
            openMenu === 'emotes' ? 'bt-float-circle-active' : 'bt-float-circle-cyan'
          }`}
        >
          <svg
            viewBox="0 0 24 24"
            aria-hidden="true"
            className="h-6 w-6 fill-none stroke-current stroke-[2.3]"
          >
            <circle cx="12" cy="12" r="9" />
            <path d="M8.5 14.5s1.4 2 3.5 2 3.5-2 3.5-2" strokeLinecap="round" />
            <circle cx="9" cy="10" r="1.1" fill="currentColor" stroke="none" />
            <circle cx="15" cy="10" r="1.1" fill="currentColor" stroke="none" />
          </svg>
        </button>

        {/* Button 2: Audio & Quick Settings */}
        <button
          type="button"
          data-testid="bt-btn-settings"
          tabIndex={-1}
          onClick={(e) => {
            e.currentTarget.blur();
            toggleMenu('settings');
          }}
          aria-expanded={openMenu === 'settings'}
          aria-label="Âm thanh và Cài đặt bàn cờ"
          title="Âm thanh & Cài đặt"
          className={`pointer-events-auto relative h-12 w-12 sm:h-13 sm:w-13 rounded-full flex items-center justify-center cursor-pointer ${
            openMenu === 'settings' ? 'bt-float-circle-active' : 'bt-float-circle-cyan'
          }`}
        >
          {soundMuted ? (
            <svg
              viewBox="0 0 24 24"
              aria-hidden="true"
              className="h-6 w-6 fill-none stroke-current stroke-[2.3]"
            >
              <path d="M11 5L6 9H2v6h4l5 4V5z" strokeLinejoin="round" />
              <path d="M22 9l-6 6M16 9l6 6" strokeLinecap="round" />
            </svg>
          ) : (
            <svg
              viewBox="0 0 24 24"
              aria-hidden="true"
              className="h-6 w-6 fill-none stroke-current stroke-[2.3]"
            >
              <path d="M11 5L6 9H2v6h4l5 4V5z" strokeLinejoin="round" />
              <path d="M15.54 8.46a5 5 0 0 1 0 7.07" strokeLinecap="round" />
              <path d="M19.07 5.5a9.5 9.5 0 0 1 0 13" strokeLinecap="round" />
            </svg>
          )}
          {speedMultiplier === 2 && (
            <span className="pointer-events-none absolute -top-1 -left-1 px-1.5 py-[1px] rounded-full bg-[#F5B800] border border-white text-[9px] font-mono-num font-black text-white shadow-xs">
              2×
            </span>
          )}
        </button>

        {/* Button 3: Pause Match */}
        <button
          type="button"
          data-testid="bt-btn-pause"
          tabIndex={-1}
          onClick={(e) => {
            e.currentTarget.blur();
            setOpenMenu('none');
            onOpenPause();
          }}
          aria-label="Tạm dừng trò chơi"
          title="Tạm dừng [Esc]"
          className="pointer-events-auto h-12 w-12 sm:h-13 sm:w-13 rounded-full bt-float-circle-cyan flex items-center justify-center cursor-pointer"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true" className="h-5.5 w-5.5 fill-current">
            <rect x="6" y="4.5" width="4.2" height="15" rx="1.6" />
            <rect x="13.8" y="4.5" width="4.2" height="15" rx="1.6" />
          </svg>
        </button>
      </div>

      {/* =================================================================
          2. FLOATING EMOTE PICKER POPOVER (Left of Middle-Right Rail)
          ================================================================= */}
      {openMenu === 'emotes' && (
        <div
          data-testid="bt-emote-popover"
          className="fixed right-18 sm:right-20 top-1/2 -translate-y-1/2 z-30 w-60 bt-casual-modal rounded-2xl overflow-hidden animate-pop-in pointer-events-auto"
        >
          <div className="bt-header-sky px-3.5 py-2 flex items-center justify-between">
            <span className="font-display text-xs font-black uppercase tracking-wide">
              Biểu Cảm Nhân Vật
            </span>
            <button
              type="button"
              onClick={() => setOpenMenu('none')}
              aria-label="Đóng biểu cảm"
              className="h-5 w-5 rounded-full bg-white/25 hover:bg-white/40 text-white text-xs font-bold flex items-center justify-center cursor-pointer"
            >
              ✕
            </button>
          </div>
          <div className="p-2.5 grid grid-cols-1 gap-1.5">
            {QUICK_EMOTES.map((em) => (
              <button
                key={em.label}
                type="button"
                onClick={() => {
                  onTriggerEmote(`${em.emoji} ${em.label}`);
                  setOpenMenu('none');
                }}
                className="w-full px-3 py-1.5 rounded-xl bg-sky-50 hover:bg-sky-100 border border-sky-200 flex items-center gap-2 text-left text-xs font-bold text-slate-800 transition-colors cursor-pointer"
              >
                <span className="text-base leading-none">{em.emoji}</span>
                <span>{em.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* =================================================================
          3. FLOATING AUDIO & SETTINGS POPOVER (Left of Middle-Right Rail)
          ================================================================= */}
      {openMenu === 'settings' && (
        <div
          data-testid="bt-settings-popover"
          className="fixed right-18 sm:right-20 top-1/2 -translate-y-1/2 z-30 w-68 bt-casual-modal rounded-2xl overflow-hidden animate-pop-in pointer-events-auto"
        >
          <div className="bt-header-sky px-4 py-2.5 flex items-center justify-between">
            <span className="font-display text-xs font-black uppercase tracking-wide">
              Âm Thanh & Tuỳ Chỉnh
            </span>
            <button
              type="button"
              onClick={() => setOpenMenu('none')}
              aria-label="Đóng cài đặt"
              className="h-5 w-5 rounded-full bg-white/25 hover:bg-white/40 text-white text-xs font-bold flex items-center justify-center cursor-pointer"
            >
              ✕
            </button>
          </div>

          <div className="p-3 space-y-2 text-xs">
            <button
              type="button"
              onClick={onToggleSound}
              className="w-full px-3 py-2 rounded-xl bg-sky-50 hover:bg-sky-100 border border-sky-200 flex items-center justify-between font-bold text-slate-800 cursor-pointer"
            >
              <span>Âm thanh hiệu ứng</span>
              <span
                className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase ${
                  soundMuted ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'
                }`}
              >
                {soundMuted ? 'Đang tắt' : 'Đang bật'}
              </span>
            </button>

            <button
              type="button"
              onClick={() => onChangeSpeed(speedMultiplier === 1 ? 2 : 1)}
              className="w-full px-3 py-2 rounded-xl bg-sky-50 hover:bg-sky-100 border border-sky-200 flex items-center justify-between font-bold text-slate-800 cursor-pointer"
            >
              <span>Tốc độ lượt chơi</span>
              <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 font-mono-num font-black">
                {speedMultiplier}×
              </span>
            </button>

            <button
              type="button"
              onClick={onToggleCinematic}
              className="w-full px-3 py-2 rounded-xl bg-sky-50 hover:bg-sky-100 border border-sky-200 flex items-center justify-between font-bold text-slate-800 cursor-pointer"
            >
              <span>Camera bám theo quân cờ</span>
              <span
                className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase ${
                  cinematicCamera ? 'bg-sky-200 text-sky-900' : 'bg-slate-200 text-slate-600'
                }`}
              >
                {cinematicCamera ? 'Bật' : 'Tắt'}
              </span>
            </button>

            <button
              type="button"
              onClick={onToggleNightMode}
              className="w-full px-3 py-2 rounded-xl bg-sky-50 hover:bg-sky-100 border border-sky-200 flex items-center justify-between font-bold text-slate-800 cursor-pointer"
            >
              <span>Bầu trời Pastel</span>
              <span className="px-2 py-0.5 rounded-full bg-pink-100 text-pink-800 text-[10px] font-black uppercase">
                {nightMode ? 'Hoàng hôn' : 'Ban ngày'}
              </span>
            </button>

            <div className="grid grid-cols-2 gap-1.5 pt-1">
              <button
                type="button"
                onClick={() => {
                  onResetCamera();
                  setOpenMenu('none');
                }}
                className="bt-btn-white py-1.5 px-2 rounded-xl text-[11px] font-extrabold cursor-pointer"
              >
                Góc Chuẩn 3D
              </button>
              <button
                type="button"
                onClick={() => {
                  setOpenMenu('none');
                  onOpenRulebook();
                }}
                className="bt-btn-white py-1.5 px-2 rounded-xl text-[11px] font-extrabold cursor-pointer"
              >
                Luật Chơi
              </button>
            </div>

            <button
              type="button"
              onClick={() => setOpenMenu('logs')}
              className="w-full bt-btn-cyan py-1.5 px-3 rounded-xl text-xs font-extrabold cursor-pointer"
            >
              Nhật Ký Ván Đấu ({logs.length})
            </button>
          </div>
        </div>
      )}

      {/* =================================================================
          4. MATCH LOG POPOVER (Opened from Settings)
          ================================================================= */}
      {openMenu === 'logs' && (
        <div className="fixed right-18 sm:right-20 top-1/2 -translate-y-1/2 z-30 w-[min(360px,82vw)] bt-casual-modal rounded-2xl overflow-hidden animate-pop-in pointer-events-auto">
          <div className="bt-header-sky px-4 py-2.5 flex items-center justify-between">
            <span className="font-display text-xs font-black uppercase tracking-wide">
              Nhật Ký Trận Đấu ({logs.length})
            </span>
            <button
              type="button"
              onClick={() => setOpenMenu('none')}
              aria-label="Đóng nhật ký trận đấu"
              className="h-5 w-5 rounded-full bg-white/25 hover:bg-white/40 text-white text-xs font-bold flex items-center justify-center cursor-pointer"
            >
              ✕
            </button>
          </div>
          <div className="p-3 max-h-64 overflow-y-auto slim-scroll divide-y divide-sky-100">
            {logs.map((entry) => (
              <div
                key={entry.id}
                className="py-1.5 text-xs leading-snug flex items-start gap-2"
              >
                <span className="font-mono-num text-[10px] font-bold text-sky-600 shrink-0 mt-0.5">
                  V{entry.turn}
                </span>
                {entry.playerColor && (
                  <span
                    className="mt-1 h-2.5 w-2.5 rounded-full shrink-0 border border-white shadow-2xs"
                    style={{ backgroundColor: entry.playerColor }}
                  />
                )}
                <span
                  className={
                    entry.tone === 'positive'
                      ? 'text-emerald-700 font-bold'
                      : entry.tone === 'negative'
                        ? 'text-rose-700 font-bold'
                        : entry.tone === 'highlight'
                          ? 'text-amber-700 font-bold'
                          : 'text-slate-700 font-medium'
                  }
                >
                  {entry.text}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* =================================================================
          5. BORDERLESS FLOATING HUMAN TURN PILL CLUSTER (Zero Dark Toolbar!)
          ================================================================= */}
      {isHumanTurn &&
        !isModalDecisionPhase &&
        (turnPhase === 'AWAIT_ROLL' || turnPhase === 'AWAIT_END_TURN') && (
          <div className="fixed bottom-3.5 left-1/2 -translate-x-1/2 z-25 flex items-center gap-2 pointer-events-none">
            {turnPhase === 'AWAIT_ROLL' ? (
              currentPlayer.inJail ? (
                <div className="pointer-events-auto flex items-center gap-2">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.currentTarget.blur();
                      onRollDice();
                    }}
                    className="bt-btn-pink px-4 sm:px-5 py-2.5 rounded-full font-black text-xs sm:text-sm uppercase tracking-wide cursor-pointer whitespace-nowrap"
                  >
                    🎲 Đổ Săn Đôi
                  </button>
                  <button
                    type="button"
                    disabled={currentPlayer.cash < JAIL_FINE}
                    onClick={(e) => {
                      e.currentTarget.blur();
                      onPayJailFine();
                    }}
                    className="bt-btn-green px-3.5 sm:px-4 py-2.5 rounded-full disabled:opacity-45 font-extrabold text-xs sm:text-sm uppercase cursor-pointer whitespace-nowrap"
                  >
                    Bảo Lãnh ({formatBusinessTourCompact(JAIL_FINE)})
                  </button>
                  {currentPlayer.jailFreeCards > 0 && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.currentTarget.blur();
                        onUseJailCard();
                      }}
                      className="bt-btn-cyan px-3.5 sm:px-4 py-2.5 rounded-full font-extrabold text-xs sm:text-sm uppercase cursor-pointer whitespace-nowrap"
                    >
                      Dùng Thẻ VIP
                    </button>
                  )}
                </div>
              ) : (
                <button
                  type="button"
                  data-testid="bt-roll-dice-btn"
                  onClick={(e) => {
                    e.currentTarget.blur();
                    onRollDice();
                  }}
                  className="pointer-events-auto bt-btn-pink px-6 sm:px-8 py-2.5 sm:py-3 rounded-full font-black text-sm sm:text-base uppercase tracking-wide flex items-center gap-2 cursor-pointer whitespace-nowrap"
                >
                  <svg
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                    className="h-5 w-5 shrink-0 fill-none stroke-current stroke-[2.4]"
                  >
                    <rect x="3" y="3" width="12" height="12" rx="2.5" />
                    <circle cx="6.5" cy="6.5" r="1.2" fill="currentColor" stroke="none" />
                    <circle cx="11.5" cy="11.5" r="1.2" fill="currentColor" stroke="none" />
                    <path d="M15 9h3.5A2.5 2.5 0 0 1 21 11.5v7A2.5 2.5 0 0 1 18.5 21h-7A2.5 2.5 0 0 1 9 18.5V15" />
                    <circle cx="16.5" cy="16.5" r="1.2" fill="currentColor" stroke="none" />
                  </svg>
                  <span>Đổ Xúc Xắc</span>
                </button>
              )
            ) : (
              <button
                type="button"
                data-testid="bt-end-turn-btn"
                onClick={(e) => {
                  e.currentTarget.blur();
                  onEndTurn();
                }}
                className={`pointer-events-auto ${
                  currentPlayer.doublesStreak > 0 && !currentPlayer.inJail
                    ? 'bt-btn-gold'
                    : 'bt-btn-green'
                } px-6 sm:px-8 py-2.5 sm:py-3 rounded-full font-black text-sm sm:text-base uppercase tracking-wide cursor-pointer whitespace-nowrap`}
              >
                {currentPlayer.doublesStreak > 0 && !currentPlayer.inJail
                  ? '🎲 Đổ Tiếp (Đôi!)'
                  : '✓ Kết Thúc Lượt'}
              </button>
            )}

            {canHumanManageAssets && ownedCount > 0 && (
              <button
                type="button"
                onClick={(e) => {
                  e.currentTarget.blur();
                  onOpenAssetsModal();
                }}
                aria-label="Quản lý Tài sản"
                className="pointer-events-auto bt-btn-cyan px-3.5 py-2.5 rounded-full text-xs font-black uppercase tracking-wide cursor-pointer whitespace-nowrap"
              >
                Tài Sản ({ownedCount})
              </button>
            )}

            {canHumanTradeNow && ownedCount > 0 && (
              <button
                type="button"
                onClick={(e) => {
                  e.currentTarget.blur();
                  onOpenTradeModal();
                }}
                aria-label="Giao dịch bất động sản"
                className="pointer-events-auto bt-btn-gold px-3.5 py-2.5 rounded-full text-xs font-black uppercase tracking-wide cursor-pointer whitespace-nowrap hidden sm:inline-flex"
              >
                Giao Dịch
              </button>
            )}
          </div>
        )}
    </>
  );
};
