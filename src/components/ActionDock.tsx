import React, { useState } from 'react';
import { GRAPHICS_TIER_LABELS } from '../game/graphicsQuality';
import { formatBusinessTourCompact, JAIL_FINE } from '../game/rules';
import {
  CurrencyStyleId,
  GameLogEntry,
  GraphicsQualityPref,
  GraphicsQualityTier,
  PlayerState,
  TacticalDiceChoice,
  TurnPhase,
} from '../game/types';
import { CurrencyStylePicker } from './CurrencyStyleBadge';
import { GraphicsQualityPicker } from './GraphicsQualityPicker';

export type ActionDockMenuKind = 'none' | 'emotes' | 'settings' | 'logs';

interface ActionDockProps {
  currentPlayer: PlayerState;
  turnPhase: TurnPhase;
  logs: GameLogEntry[];
  ownedCount: number;
  canAct?: boolean;
  isActionPending?: boolean;
  isOnlineMatch?: boolean;
  isOnlineBotTakeover?: boolean;
  tacticalDiceEnabled?: boolean;
  selectedDiceChoice?: TacticalDiceChoice;
  lastDice?: [number, number] | null;
  lastDiceSum?: number;
  openMenu?: ActionDockMenuKind;
  onChangeOpenMenu?: (next: ActionDockMenuKind) => void;
  currencyStyle: CurrencyStyleId;
  graphicsQualityPref: GraphicsQualityPref;
  effectiveQualityTier: GraphicsQualityTier;
  gpuLabel?: string;
  speedMultiplier: 1 | 2;
  cinematicCamera: boolean;
  nightMode: boolean;
  soundMuted: boolean;
  onRollDice: () => void;
  onSelectDiceChoice?: (choice: TacticalDiceChoice) => void;
  onRerollDice?: () => void;
  onConfirmRollMove?: () => void;
  onReclaimControl?: () => void;
  onPayJailFine: () => void;
  onUseJailCard: () => void;
  onOpenAssetsModal: () => void;
  onOpenRulebook: () => void;
  onChangeCurrencyStyle: (next: CurrencyStyleId) => void;
  onChangeGraphicsQuality: (next: GraphicsQualityPref) => void;
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
  { emoji: '🏆', label: 'Đăng cai Cúp thôi!' },
];

const ActionDockInner: React.FC<ActionDockProps> = ({
  currentPlayer,
  logs,
  turnPhase,
  ownedCount,
  canAct,
  isActionPending = false,
  isOnlineMatch = false,
  isOnlineBotTakeover = false,
  tacticalDiceEnabled = false,
  selectedDiceChoice = 'NORMAL',
  lastDice = null,
  lastDiceSum,
  openMenu: controlledOpenMenu,
  onChangeOpenMenu,
  currencyStyle,
  graphicsQualityPref,
  effectiveQualityTier,
  gpuLabel,
  speedMultiplier,
  cinematicCamera,
  nightMode,
  soundMuted,
  onRollDice,
  onSelectDiceChoice,
  onRerollDice,
  onConfirmRollMove,
  onReclaimControl,
  onPayJailFine,
  onUseJailCard,
  onOpenAssetsModal,
  onOpenRulebook,
  onChangeCurrencyStyle,
  onChangeGraphicsQuality,
  onChangeSpeed,
  onToggleCinematic,
  onToggleNightMode,
  onResetCamera,
  onToggleSound,
  onOpenPause,
  onTriggerEmote,
}) => {
  const [localOpenMenu, setLocalOpenMenu] = useState<ActionDockMenuKind>('none');
  const openMenu = controlledOpenMenu ?? localOpenMenu;
  const setOpenMenu = (
    updater: ActionDockMenuKind | ((prev: ActionDockMenuKind) => ActionDockMenuKind)
  ) => {
    const next = typeof updater === 'function' ? updater(openMenu) : updater;
    if (onChangeOpenMenu) {
      onChangeOpenMenu(next);
    } else {
      setLocalOpenMenu(next);
    }
  };

  const isHumanTurn =
    canAct !== undefined ? canAct : !currentPlayer.isBot && !currentPlayer.bankrupt;

  const canHumanManageAssets =
    isHumanTurn &&
    (turnPhase === 'AWAIT_ROLL' ||
      turnPhase === 'REROLL_DECISION' ||
      turnPhase === 'DEBT_RESOLUTION');

  const isModalDecisionPhase =
    turnPhase === 'BUY_DECISION' ||
    turnPhase === 'UPGRADE_DECISION' ||
    turnPhase === 'BUYOUT_DECISION' ||
    turnPhase === 'CHAMPIONSHIP_SELECTION' ||
    turnPhase === 'WORLD_TOUR' ||
    turnPhase === 'CARD_REVEAL' ||
    turnPhase === 'CARD_TARGET_SELECTION' ||
    turnPhase === 'DEBT_RESOLUTION';

  const toggleMenu = (target: 'emotes' | 'settings' | 'logs') => {
    setOpenMenu((prev) => (prev === target ? 'none' : target));
  };

  const resolvedDiceSum =
    lastDiceSum ?? (lastDice ? lastDice[0] + lastDice[1] : 0);
  const evenOddCharges = currentPlayer.evenOddCharges ?? 0;
  const rerollCharges = currentPlayer.rerollCharges ?? 0;

  return (
    <>
      {/* =================================================================
          1. MIDDLE-RIGHT 3 CIRCULAR GLOSSY CYAN/BLUE FLOATING UTILITY BUTTONS
             (Emotes, Audio/Settings, Pause — Business Tour Signature Layout)
          ================================================================= */}
      <div
        data-testid="bt-right-utility-rail"
        className="bt-utility-rail fixed right-[max(0.55rem,env(safe-area-inset-right,0px))] sm:right-4 top-1/2 -translate-y-1/2 z-25 flex flex-col items-center gap-2.5 sm:gap-3 pointer-events-none"
      >
        {/* Button 1: Emotes / Quick Chat */}
        <button
          type="button"
          data-testid="bt-btn-emotes"
          onClick={(e) => {
            if (e.detail > 0) e.currentTarget.blur();
            toggleMenu('emotes');
          }}
          aria-expanded={openMenu === 'emotes'}
          aria-label="Biểu cảm và Trò chuyện nhanh"
          title="Biểu cảm nhân vật"
          className={`bt-utility-rail-btn pointer-events-auto h-11 w-11 sm:h-13 sm:w-13 rounded-full flex items-center justify-center cursor-pointer ${
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
          onClick={(e) => {
            if (e.detail > 0) e.currentTarget.blur();
            toggleMenu('settings');
          }}
          aria-expanded={openMenu === 'settings'}
          aria-label="Âm thanh và Cài đặt bàn cờ"
          title="Âm thanh & Cài đặt"
          className={`bt-utility-rail-btn pointer-events-auto relative h-11 w-11 sm:h-13 sm:w-13 rounded-full flex items-center justify-center cursor-pointer ${
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
          {!isOnlineMatch && speedMultiplier === 2 && (
            <span className="pointer-events-none absolute -top-1 -left-1 px-1.5 py-[1px] rounded-full bg-[#F5B800] border border-white text-[9px] font-mono-num font-black text-slate-950 shadow-xs">
              2×
            </span>
          )}
        </button>

        {/* Button 3: Pause Match */}
        <button
          type="button"
          data-testid="bt-btn-pause"
          onClick={(e) => {
            if (e.detail > 0) e.currentTarget.blur();
            setOpenMenu('none');
            onOpenPause();
          }}
          aria-label="Tạm dừng trò chơi"
          title="Tạm dừng [Esc]"
          className="bt-utility-rail-btn pointer-events-auto h-11 w-11 sm:h-13 sm:w-13 rounded-full bt-float-circle-cyan flex items-center justify-center cursor-pointer"
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
          className="fixed right-16 sm:right-20 top-1/2 -translate-y-1/2 z-30 w-60 max-w-[calc(100vw-5.5rem)] max-h-[calc(100dvh-1.5rem)] flex flex-col bt-casual-modal rounded-2xl overflow-hidden animate-pop-in pointer-events-auto"
        >
          <div className="shrink-0 bt-header-sky px-3.5 py-2 flex items-center justify-between">
            <span className="font-display text-xs font-black uppercase tracking-wide">
              Biểu Cảm Nhân Vật
            </span>
            <button
              type="button"
              onClick={() => setOpenMenu('none')}
              aria-label="Đóng biểu cảm"
              className="icon-hit-target h-6 w-6 rounded-full bg-white/25 hover:bg-white/40 text-white text-xs font-bold flex items-center justify-center cursor-pointer shrink-0"
            >
              ✕
            </button>
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto slim-scroll p-2.5 grid grid-cols-1 gap-1.5">
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
          className="fixed right-14 sm:right-20 top-1/2 -translate-y-1/2 z-30 w-72 max-w-[calc(100vw-4.25rem)] max-h-[calc(100dvh-1.5rem)] flex flex-col bt-casual-modal rounded-2xl overflow-hidden animate-pop-in pointer-events-auto"
        >
          <div className="shrink-0 bt-header-sky px-4 py-2.5 flex items-center justify-between">
            <span className="font-display text-xs font-black uppercase tracking-wide">
              Âm Thanh & Tuỳ Chỉnh
            </span>
            <button
              type="button"
              onClick={() => setOpenMenu('none')}
              aria-label="Đóng cài đặt"
              className="icon-hit-target h-6 w-6 rounded-full bg-white/25 hover:bg-white/40 text-white text-xs font-bold flex items-center justify-center cursor-pointer shrink-0"
            >
              ✕
            </button>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto slim-scroll p-3 space-y-2 text-xs">
            <div className="rounded-xl bg-sky-50/90 border border-sky-200 p-2 space-y-1.5">
              <div className="flex items-center justify-between px-0.5 gap-1">
                <span className="font-extrabold text-slate-800">
                  Đồ họa 3D & Hiệu năng
                </span>
                <span className="text-[10px] font-black uppercase text-[#16A34A] truncate">
                  {graphicsQualityPref === 'auto'
                    ? `Tự động · ${GRAPHICS_TIER_LABELS[effectiveQualityTier]}`
                    : `Mức ${GRAPHICS_TIER_LABELS[effectiveQualityTier]}`}
                </span>
              </div>
              <GraphicsQualityPicker
                value={graphicsQualityPref}
                effectiveTier={effectiveQualityTier}
                gpuLabel={gpuLabel}
                onChange={onChangeGraphicsQuality}
                compact
              />
            </div>

            <div className="rounded-xl bg-sky-50/90 border border-sky-200 p-2 space-y-1.5">
              <div className="flex items-center justify-between px-0.5">
                <span className="font-extrabold text-slate-800">
                  Kho bạc Tiền tệ 3D
                </span>
                <span className="text-[10px] font-black uppercase text-sky-700">
                  Đổi tức thì
                </span>
              </div>
              <CurrencyStylePicker
                value={currencyStyle}
                onChange={onChangeCurrencyStyle}
                compact
              />
            </div>

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
              disabled={isOnlineMatch}
              onClick={() => {
                if (!isOnlineMatch) {
                  onChangeSpeed(speedMultiplier === 1 ? 2 : 1);
                }
              }}
              className={`w-full px-3 py-2 rounded-xl bg-sky-50 border border-sky-200 flex items-center justify-between font-bold text-slate-800 ${
                isOnlineMatch
                  ? 'opacity-65 cursor-not-allowed'
                  : 'hover:bg-sky-100 cursor-pointer'
              }`}
            >
              <span>Tốc độ lượt chơi</span>
              <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 font-mono-num font-black">
                {isOnlineMatch ? '1× (Khóa Online)' : `${speedMultiplier}×`}
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
              <span>Chế độ ánh sáng</span>
              <span className="px-2 py-0.5 rounded-full bg-pink-100 text-pink-800 text-[10px] font-black uppercase">
                {nightMode ? 'Ban đêm' : 'Ban ngày'}
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
        <div className="fixed right-16 sm:right-20 top-1/2 -translate-y-1/2 z-30 w-[min(360px,82vw)] max-w-[calc(100vw-5.5rem)] max-h-[calc(100dvh-1.5rem)] flex flex-col bt-casual-modal rounded-2xl overflow-hidden animate-pop-in pointer-events-auto">
          <div className="shrink-0 bt-header-sky px-4 py-2.5 flex items-center justify-between">
            <span className="font-display text-xs font-black uppercase tracking-wide">
              Nhật Ký Trận Đấu ({logs.length})
            </span>
            <button
              type="button"
              onClick={() => setOpenMenu('none')}
              aria-label="Đóng nhật ký trận đấu"
              className="icon-hit-target h-6 w-6 rounded-full bg-white/25 hover:bg-white/40 text-white text-xs font-bold flex items-center justify-center cursor-pointer shrink-0"
            >
              ✕
            </button>
          </div>
          <div className="flex-1 min-h-0 p-3 overflow-y-auto slim-scroll divide-y divide-sky-100">
            {logs.map((entry) => (
              <div
                key={entry.id}
                className="py-1.5 text-xs leading-snug flex items-start gap-2"
              >
                <span className="font-mono-num text-[10px] font-bold text-sky-600 shrink-0 mt-0.5">
                  L{entry.turn}
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
        (turnPhase === 'AWAIT_ROLL' || turnPhase === 'REROLL_DECISION') && (
          <div
            data-dice-sum={turnPhase === 'REROLL_DECISION' ? resolvedDiceSum : undefined}
            className="fixed bottom-[124px] sm:bottom-[136px] lg:bottom-[max(0.9rem,env(safe-area-inset-bottom,0px))] left-1/2 -translate-x-1/2 z-25 w-max max-w-[calc(100vw-1rem)] sm:max-w-[calc(100vw-9rem)] lg:max-w-[min(780px,calc(100vw-580px))] flex flex-wrap items-center justify-center gap-2 pointer-events-none"
          >
            {turnPhase === 'AWAIT_ROLL' ? (
              currentPlayer.inJail ? (
                <div className="pointer-events-auto flex flex-wrap items-center justify-center gap-2">
                  <button
                    type="button"
                    data-testid="bt-jail-roll-btn"
                    disabled={isActionPending}
                    onClick={(e) => {
                      e.currentTarget.blur();
                      onRollDice();
                    }}
                    className="bt-btn-pink px-4 sm:px-5 py-2.5 rounded-full disabled:opacity-45 font-black text-xs sm:text-sm uppercase tracking-wide cursor-pointer disabled:cursor-not-allowed whitespace-nowrap"
                  >
                    🎲 Đổ Săn Đôi
                  </button>
                  <button
                    type="button"
                    data-testid="bt-jail-bail-btn"
                    disabled={isActionPending || currentPlayer.cash < JAIL_FINE}
                    onClick={(e) => {
                      e.currentTarget.blur();
                      onPayJailFine();
                    }}
                    className="bt-btn-green px-3.5 sm:px-4 py-2.5 rounded-full disabled:opacity-45 font-extrabold text-xs sm:text-sm uppercase cursor-pointer disabled:cursor-not-allowed whitespace-nowrap"
                  >
                    Bảo Lãnh ({formatBusinessTourCompact(JAIL_FINE)})
                  </button>
                  {currentPlayer.jailFreeCards > 0 && (
                    <button
                      type="button"
                      data-testid="bt-jail-card-btn"
                      disabled={isActionPending}
                      onClick={(e) => {
                        e.currentTarget.blur();
                        onUseJailCard();
                      }}
                      className="bt-btn-cyan px-3.5 sm:px-4 py-2.5 rounded-full disabled:opacity-45 font-extrabold text-xs sm:text-sm uppercase cursor-pointer disabled:cursor-not-allowed whitespace-nowrap"
                    >
                      Dùng Thẻ Thoát Đảo
                    </button>
                  )}
                </div>
              ) : (
                <>
                  {tacticalDiceEnabled && (
                    <div className="pointer-events-auto flex flex-wrap items-center justify-center gap-1.5 px-2 py-1 rounded-full bt-casual-modal">
                      <button
                        type="button"
                        disabled={isActionPending}
                        aria-pressed={selectedDiceChoice === 'NORMAL'}
                        onClick={() => onSelectDiceChoice?.('NORMAL')}
                        className={`px-2.5 py-1.5 rounded-full text-[11px] font-black uppercase transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer whitespace-nowrap ${
                          selectedDiceChoice === 'NORMAL'
                            ? 'bt-btn-cyan'
                            : 'text-sky-900 hover:bg-sky-100'
                        }`}
                      >
                        Thường
                      </button>
                      <button
                        type="button"
                        data-testid="bt-dice-even-btn"
                        disabled={isActionPending || evenOddCharges <= 0}
                        aria-pressed={evenOddCharges > 0 && selectedDiceChoice === 'EVEN'}
                        onClick={() =>
                          onSelectDiceChoice?.(
                            selectedDiceChoice === 'EVEN' ? 'NORMAL' : 'EVEN'
                          )
                        }
                        className={`px-2.5 py-1.5 rounded-full text-[11px] font-black uppercase transition-colors whitespace-nowrap disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer ${
                          evenOddCharges > 0 && selectedDiceChoice === 'EVEN'
                            ? 'bt-btn-gold text-slate-950'
                            : 'text-sky-900 hover:bg-sky-100'
                        }`}
                      >
                        Chẵn ({evenOddCharges})
                      </button>
                      <button
                        type="button"
                        data-testid="bt-dice-odd-btn"
                        disabled={isActionPending || evenOddCharges <= 0}
                        aria-pressed={evenOddCharges > 0 && selectedDiceChoice === 'ODD'}
                        onClick={() =>
                          onSelectDiceChoice?.(
                            selectedDiceChoice === 'ODD' ? 'NORMAL' : 'ODD'
                          )
                        }
                        className={`px-2.5 py-1.5 rounded-full text-[11px] font-black uppercase transition-colors whitespace-nowrap disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer ${
                          evenOddCharges > 0 && selectedDiceChoice === 'ODD'
                            ? 'bt-btn-gold text-slate-950'
                            : 'text-sky-900 hover:bg-sky-100'
                        }`}
                      >
                        Lẻ ({evenOddCharges})
                      </button>
                    </div>
                  )}

                  <button
                    type="button"
                    data-testid="bt-roll-dice-btn"
                    disabled={isActionPending}
                    onClick={(e) => {
                      e.currentTarget.blur();
                      onRollDice();
                    }}
                    className="pointer-events-auto bt-btn-pink px-6 sm:px-8 py-2.5 sm:py-3 rounded-full disabled:opacity-45 font-black text-sm sm:text-base uppercase tracking-wide flex items-center gap-2 cursor-pointer disabled:cursor-not-allowed whitespace-nowrap"
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
                </>
              )
            ) : (
              <div
                data-dice-sum={resolvedDiceSum}
                className="pointer-events-auto flex flex-wrap items-center justify-center gap-2"
              >
                {lastDice && (
                  <div className="px-3.5 py-2 rounded-full bt-casual-modal text-xs sm:text-sm font-black text-sky-950 font-mono-num whitespace-nowrap">
                    🎲 {lastDice[0]} + {lastDice[1]} = {resolvedDiceSum}
                  </div>
                )}
                <button
                  type="button"
                  data-testid="bt-reroll-dice-btn"
                  data-dice-sum={resolvedDiceSum}
                  disabled={isActionPending || rerollCharges <= 0}
                  onClick={(e) => {
                    e.currentTarget.blur();
                    onRerollDice?.();
                  }}
                  className="bt-btn-gold text-slate-950 px-4 sm:px-5 py-2.5 rounded-full font-black text-xs sm:text-sm uppercase tracking-wide disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer whitespace-nowrap"
                >
                  🔄 Đổ Lại ({rerollCharges})
                </button>
                <button
                  type="button"
                  data-testid="bt-confirm-roll-btn"
                  data-dice-sum={resolvedDiceSum}
                  disabled={isActionPending}
                  onClick={(e) => {
                    e.currentTarget.blur();
                    onConfirmRollMove?.();
                  }}
                  className="bt-btn-green px-4 sm:px-5 py-2.5 rounded-full disabled:opacity-45 font-black text-xs sm:text-sm uppercase tracking-wide cursor-pointer disabled:cursor-not-allowed whitespace-nowrap"
                >
                  ✓ Giữ &amp; Đi ({resolvedDiceSum} bước)
                </button>
              </div>
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
          </div>
        )}

      {/* Online Waiting Indicator when it's another player's or bot's turn */}
      {isOnlineMatch &&
        !isHumanTurn &&
        !isModalDecisionPhase &&
        (turnPhase === 'AWAIT_ROLL' || turnPhase === 'REROLL_DECISION') && (
          <div className="fixed bottom-[124px] sm:bottom-[136px] lg:bottom-[max(0.9rem,env(safe-area-inset-bottom,0px))] left-1/2 -translate-x-1/2 z-25 w-max max-w-[calc(100vw-1rem)] sm:max-w-[calc(100vw-9rem)] lg:max-w-[min(780px,calc(100vw-580px))] flex flex-wrap items-center justify-center gap-2 pointer-events-none">
            <div className="px-5 py-2.5 rounded-full bt-casual-modal text-xs sm:text-sm font-black text-sky-900 whitespace-normal text-center">
              ⏳ Đang chờ {currentPlayer.name}...
            </div>
          </div>
        )}

      {/* Online AFK Bot Takeover Reclaim CTA (BUG-12) */}
      {isOnlineMatch && isOnlineBotTakeover && onReclaimControl && (
        <div className="fixed bottom-[174px] sm:bottom-[188px] lg:bottom-[4.5rem] left-1/2 -translate-x-1/2 z-26 w-max max-w-[calc(100vw-1rem)] pointer-events-auto animate-pop-in">
          <button
            type="button"
            data-testid="bt-reclaim-control-btn"
            disabled={isActionPending}
            onClick={onReclaimControl}
            className="bt-btn-gold text-slate-950 px-5 py-2.5 rounded-full disabled:opacity-45 font-black text-xs sm:text-sm uppercase tracking-wide cursor-pointer disabled:cursor-not-allowed shadow-xl whitespace-normal text-center"
          >
            🙋 Lấy Lại Quyền Điều Khiển
          </button>
        </div>
      )}
    </>
  );
};

export const ActionDock = React.memo(ActionDockInner);
