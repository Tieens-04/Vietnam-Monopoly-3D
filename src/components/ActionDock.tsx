import React, { useEffect, useState } from 'react';
import {
  BookOpen,
  Check,
  Compass,
  Dices,
  Eye,
  Gamepad2,
  Hand,
  Hourglass,
  MessageCircle,
  Pause,
  RotateCcw,
  ScrollText,
  SlidersHorizontal,
  Smile,
  X,
} from 'lucide-react';
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
import {
  EMOTE_3D_CATALOG,
  Emote3DIcon,
  encodeEmote3D,
} from './EmoteAndTaunt3D';
import { ToggleSwitch } from './GameUiPrimitives';
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
  isOnlineSpectator?: boolean;
  isOnlineBotTakeover?: boolean;
  eligibleTakeoverBots?: Array<{ playerId: number; name: string; color: string }>;
  takeoverRequestPending?: boolean;
  onRequestBotTakeover?: (targetPlayerId: number) => void;
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
  disable3dTaunts?: boolean;
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
  onToggleDisable3dTaunts?: () => void;
  onOpenPause: () => void;
  onTriggerEmote: (emoteText: string) => void;
  unreadChatCount?: number;
  chatOpen?: boolean;
  onToggleChat?: () => void;
  voiceBarNode?: React.ReactNode;
}

const ActionDockInner: React.FC<ActionDockProps> = ({
  currentPlayer,
  logs,
  turnPhase,
  ownedCount,
  canAct,
  isActionPending = false,
  isOnlineMatch = false,
  isOnlineSpectator = false,
  isOnlineBotTakeover = false,
  eligibleTakeoverBots = [],
  takeoverRequestPending = false,
  onRequestBotTakeover,
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
  disable3dTaunts = false,
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
  onToggleDisable3dTaunts,
  onOpenPause,
  onTriggerEmote,
  unreadChatCount = 0,
  chatOpen = false,
  onToggleChat,
  voiceBarNode,
}) => {
  const [localOpenMenu, setLocalOpenMenu] = useState<ActionDockMenuKind>('none');
  const [takeoverPickerOpen, setTakeoverPickerOpen] = useState<boolean>(false);
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

  useEffect(() => {
    if (!isOnlineSpectator || takeoverRequestPending || eligibleTakeoverBots.length === 0) {
      setTakeoverPickerOpen(false);
    }
  }, [isOnlineSpectator, takeoverRequestPending, eligibleTakeoverBots.length]);

  const isHumanTurn =
    !isOnlineSpectator &&
    (canAct !== undefined ? canAct : !currentPlayer.isBot && !currentPlayer.bankrupt);

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
    setTakeoverPickerOpen(false);
    setOpenMenu((prev) => (prev === target ? 'none' : target));
  };

  const resolvedDiceSum =
    lastDiceSum ?? (lastDice ? lastDice[0] + lastDice[1] : 0);
  const evenOddCharges = currentPlayer.evenOddCharges ?? 0;
  const rerollCharges = currentPlayer.rerollCharges ?? 0;

  return (
    <>
      {/* =================================================================
          1. UNIFIED RIGHT-EDGE TABLETOP UTILITY DOCK
          ================================================================= */}
      <div
        data-testid="bt-right-utility-rail"
        className="bt-utility-rail fixed right-[max(0.5rem,env(safe-area-inset-right,0px))] sm:right-3.5 top-1/2 -translate-y-1/2 z-25 flex flex-col items-center gap-2 pointer-events-none"
      >
        <div className="bt-dock-shell pointer-events-auto rounded-2xl p-1.5 flex flex-col items-center gap-1.5">
          {/* Emotes */}
          {!isOnlineSpectator && (
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
              className={`bt-utility-rail-btn h-11 w-11 rounded-xl flex items-center justify-center cursor-pointer ${
                openMenu === 'emotes' ? 'bt-float-circle-active' : 'bt-float-circle-cyan'
              }`}
            >
              <Smile className="h-5 w-5 stroke-[2.2]" aria-hidden="true" />
            </button>
          )}

          {/* Audio & Settings (Sliders icon reflects actual content) */}
          <button
            type="button"
            data-testid="bt-btn-settings"
            onClick={(e) => {
              if (e.detail > 0) e.currentTarget.blur();
              toggleMenu('settings');
            }}
            aria-expanded={openMenu === 'settings'}
            aria-label="Âm thanh và Cài đặt bàn cờ"
            title="Cài đặt & Tùy chỉnh"
            className={`bt-utility-rail-btn relative h-11 w-11 rounded-xl flex items-center justify-center cursor-pointer ${
              openMenu === 'settings' ? 'bt-float-circle-active' : 'bt-float-circle-cyan'
            }`}
          >
            <SlidersHorizontal className="h-5 w-5 stroke-[2.2]" aria-hidden="true" />
            {soundMuted && (
              <span
                aria-hidden="true"
                className="pointer-events-none absolute top-1 right-1 h-2 w-2 rounded-full bg-rose-500 border border-white"
              />
            )}
            {!isOnlineMatch && speedMultiplier === 2 && (
              <span className="pointer-events-none absolute -top-1 -left-1 px-1.5 py-[1px] rounded-md bg-[#F5B800] border border-[#141c2b]/20 text-[9px] font-mono-num font-black text-[#141c2b] shadow-2xs">
                2×
              </span>
            )}
          </button>

          {/* Pause */}
          <button
            type="button"
            data-testid="bt-btn-pause"
            onClick={(e) => {
              if (e.detail > 0) e.currentTarget.blur();
              setTakeoverPickerOpen(false);
              setOpenMenu('none');
              onOpenPause();
            }}
            aria-label="Tạm dừng trò chơi"
            title="Tạm dừng [Esc]"
            className="bt-utility-rail-btn h-11 w-11 rounded-xl bt-float-circle-cyan flex items-center justify-center cursor-pointer"
          >
            <Pause className="h-5 w-5 stroke-[2.2]" aria-hidden="true" />
          </button>

          {/* Online Chat Toggle */}
          {isOnlineMatch && (
            <button
              type="button"
              data-testid="bt-action-chat-btn"
              onClick={(e) => {
                if (e.detail > 0) e.currentTarget.blur();
                setTakeoverPickerOpen(false);
                setOpenMenu('none');
                onToggleChat?.();
              }}
              aria-expanded={chatOpen}
              aria-label={
                unreadChatCount > 0
                  ? `Trò chuyện phòng (${unreadChatCount} tin nhắn chưa đọc)`
                  : 'Trò chuyện phòng'
              }
              title="Trò chuyện phòng"
              className={`bt-utility-rail-btn relative h-11 w-11 rounded-xl flex items-center justify-center cursor-pointer ${
                chatOpen ? 'bt-float-circle-active' : 'bt-float-circle-cyan'
              }`}
            >
              <MessageCircle className="h-5 w-5 stroke-[2.2]" aria-hidden="true" />
              {unreadChatCount > 0 && (
                <span
                  data-testid="bt-chat-unread-badge"
                  className="pointer-events-none absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-600 border-2 border-white text-[10px] font-mono-num font-black text-white flex items-center justify-center leading-none shadow-sm"
                >
                  {unreadChatCount > 99 ? '99+' : unreadChatCount}
                </span>
              )}
            </button>
          )}
        </div>

        {/* Unified Voice Control Capsule (Online Match) */}
        {isOnlineMatch && voiceBarNode}
      </div>

      {/* =================================================================
          2. 3×3 PURE 3D EMOJI PICKER POPOVER (NO TEXT LABELS)
             (Close button MUST remain index 0, emotes indices 1..9)
          ================================================================= */}
      {!isOnlineSpectator && openMenu === 'emotes' && (
        <div
          data-testid="bt-emote-popover"
          className="fixed right-16 sm:right-20 top-1/2 -translate-y-1/2 z-30 w-56 max-w-[calc(100vw-5.5rem)] max-h-[calc(100dvh-1.5rem)] flex flex-col bt-casual-modal rounded-2xl overflow-hidden animate-pop-in pointer-events-auto"
        >
          <div className="shrink-0 bt-header-sky px-3.5 py-2 flex items-center justify-between">
            <span className="font-display text-xs font-black uppercase tracking-wide">
              Biểu Cảm 3D
            </span>
            <button
              type="button"
              onClick={() => setOpenMenu('none')}
              aria-label="Đóng biểu cảm"
              className="icon-hit-target h-6 w-6 rounded-full bg-white/15 hover:bg-white/25 text-white flex items-center justify-center cursor-pointer shrink-0"
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto slim-scroll p-2.5 grid grid-cols-3 gap-2">
            {EMOTE_3D_CATALOG.map((em) => (
              <button
                key={em.key}
                type="button"
                aria-label={em.label}
                title={em.label}
                onClick={() => {
                  onTriggerEmote(encodeEmote3D(em.key));
                  setOpenMenu('none');
                }}
                className="group h-14 w-full rounded-2xl bg-white hover:bg-[#f7f4ec] border border-[#ded8ca] shadow-[0_3px_0_#d5cec0] hover:shadow-[0_4px_0_#c4bcae] hover:-translate-y-0.5 active:translate-y-0.5 active:shadow-none flex items-center justify-center transition-all cursor-pointer"
              >
                <Emote3DIcon
                  emoteKey={em.key}
                  className="h-10 w-10 transition-transform duration-150 group-hover:scale-115"
                />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* =================================================================
          3. CLEAN TABLETOP SETTINGS POPOVER (Zero Box-in-Box, Real Switches)
          ================================================================= */}
      {openMenu === 'settings' && (
        <div
          data-testid="bt-settings-popover"
          className="fixed right-16 sm:right-20 top-1/2 -translate-y-1/2 z-30 w-76 max-w-[calc(100vw-4.75rem)] max-h-[calc(100dvh-1.5rem)] flex flex-col bt-casual-modal rounded-2xl overflow-hidden animate-pop-in pointer-events-auto"
        >
          <div className="shrink-0 bt-header-sky px-4 py-2.5 flex items-center justify-between">
            <span className="font-display text-xs font-black uppercase tracking-wide">
              Âm Thanh &amp; Tuỳ Chỉnh
            </span>
            <button
              type="button"
              onClick={() => setOpenMenu('none')}
              aria-label="Đóng cài đặt"
              className="icon-hit-target h-6 w-6 rounded-full bg-white/15 hover:bg-white/25 text-white flex items-center justify-center cursor-pointer shrink-0"
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto slim-scroll divide-y divide-[#e6e0d3] text-xs">
            {/* Section 1: 3D Graphics */}
            <div className="p-3 space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className="font-extrabold text-[#141c2b]">
                  Đồ họa 3D &amp; Hiệu năng
                </span>
                <span className="text-[10px] font-bold uppercase text-emerald-700 truncate">
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

            {/* Section 2: 3D Currency Style */}
            <div className="p-3 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="font-extrabold text-[#141c2b]">
                  Kho bạc Tiền tệ 3D
                </span>
                <span className="text-[10px] font-semibold text-[#525e73]">
                  Đổi tức thì
                </span>
              </div>
              <CurrencyStylePicker
                value={currencyStyle}
                onChange={onChangeCurrencyStyle}
                compact
              />
            </div>

            {/* Section 3: Flat Toggle Rows (No Nested Cards) */}
            <div className="divide-y divide-[#efeae0] bg-white/60">
              <button
                type="button"
                onClick={onToggleSound}
                aria-pressed={!soundMuted}
                className="w-full px-3.5 py-2.5 flex items-center justify-between gap-2 font-bold text-[#141c2b] hover:bg-[#efece4]/60 cursor-pointer transition-colors"
              >
                <span>Âm thanh hiệu ứng</span>
                <ToggleSwitch checked={!soundMuted} size="sm" />
              </button>

              <button
                type="button"
                disabled={isOnlineMatch}
                onClick={() => {
                  if (!isOnlineMatch) {
                    onChangeSpeed(speedMultiplier === 1 ? 2 : 1);
                  }
                }}
                className={`w-full px-3.5 py-2.5 flex items-center justify-between gap-2 font-bold text-[#141c2b] ${
                  isOnlineMatch
                    ? 'opacity-65 cursor-not-allowed'
                    : 'hover:bg-[#efece4]/60 cursor-pointer transition-colors'
                }`}
              >
                <span>Tốc độ lượt chơi</span>
                <span className="px-2 py-0.5 rounded-md bg-[#ebe6da] border border-[#d5cec0] text-[#141c2b] font-mono-num text-[11px] font-black">
                  {isOnlineMatch ? '1× (Khóa Online)' : `${speedMultiplier}×`}
                </span>
              </button>

              <button
                type="button"
                onClick={onToggleCinematic}
                aria-pressed={cinematicCamera}
                className="w-full px-3.5 py-2.5 flex items-center justify-between gap-2 font-bold text-[#141c2b] hover:bg-[#efece4]/60 cursor-pointer transition-colors"
              >
                <span>Camera bám theo quân cờ</span>
                <ToggleSwitch checked={cinematicCamera} size="sm" />
              </button>

              <button
                type="button"
                onClick={onToggleNightMode}
                aria-pressed={nightMode}
                className="w-full px-3.5 py-2.5 flex items-center justify-between gap-2 font-bold text-[#141c2b] hover:bg-[#efece4]/60 cursor-pointer transition-colors"
              >
                <span>Chế độ ánh sáng</span>
                <span
                  className={`px-2 py-0.5 rounded-md border text-[10px] font-extrabold uppercase ${
                    nightMode
                      ? 'bg-[#182232] border-[#0f172a] text-amber-300'
                      : 'bg-amber-50 border-amber-200 text-amber-900'
                  }`}
                >
                  {nightMode ? 'Ban đêm' : 'Ban ngày'}
                </span>
              </button>

              {onToggleDisable3dTaunts && (
                <button
                  type="button"
                  data-testid="bt-disable-3d-taunts-toggle"
                  aria-pressed={disable3dTaunts}
                  onClick={onToggleDisable3dTaunts}
                  className="w-full px-3.5 py-2.5 flex items-center justify-between gap-2 font-bold text-[#141c2b] hover:bg-[#efece4]/60 cursor-pointer transition-colors"
                >
                  <span>Tắt hiệu ứng ném đồ 3D</span>
                  <ToggleSwitch checked={disable3dTaunts} size="sm" />
                </button>
              )}
            </div>

            {/* Section 4: Quick Actions */}
            <div className="p-3 space-y-1.5 bg-[#f3efe6]/70">
              <div className="grid grid-cols-2 gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    onResetCamera();
                    setOpenMenu('none');
                  }}
                  className="bt-btn-white py-1.5 px-2 rounded-xl text-[11px] font-extrabold flex items-center justify-center gap-1 cursor-pointer"
                >
                  <Compass className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  <span>Góc Chuẩn 3D</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setOpenMenu('none');
                    onOpenRulebook();
                  }}
                  className="bt-btn-white py-1.5 px-2 rounded-xl text-[11px] font-extrabold flex items-center justify-center gap-1 cursor-pointer"
                >
                  <BookOpen className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  <span>Luật Chơi</span>
                </button>
              </div>

              <button
                type="button"
                onClick={() => setOpenMenu('logs')}
                className="w-full bt-btn-white py-1.5 px-3 rounded-xl text-[11px] font-extrabold flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <ScrollText className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span>Nhật Ký Ván Đấu ({logs.length})</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =================================================================
          4. MATCH LOG POPOVER
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
              className="icon-hit-target h-6 w-6 rounded-full bg-white/15 hover:bg-white/25 text-white flex items-center justify-center cursor-pointer shrink-0"
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>
          <div className="flex-1 min-h-0 p-3 overflow-y-auto slim-scroll divide-y divide-[#e6e0d3]">
            {logs.map((entry) => (
              <div
                key={entry.id}
                className="py-1.5 text-xs leading-snug flex items-start gap-2"
              >
                <span className="font-mono-num text-[10px] font-bold text-[#64748b] shrink-0 mt-0.5">
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
                          : 'text-[#334155] font-medium'
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
          5. FLOATING HUMAN TURN CONTROLS (BOTTOM-CENTER)
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
                    className="bt-btn-pink px-4 sm:px-5 py-2.5 rounded-full disabled:opacity-45 font-black text-xs sm:text-sm uppercase tracking-wide flex items-center gap-1.5 cursor-pointer disabled:cursor-not-allowed whitespace-nowrap"
                  >
                    <Dices className="h-4 w-4 shrink-0" aria-hidden="true" />
                    <span>Đổ Săn Đôi</span>
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
                      className="bt-btn-white px-3.5 sm:px-4 py-2.5 rounded-full disabled:opacity-45 font-extrabold text-xs sm:text-sm uppercase cursor-pointer disabled:cursor-not-allowed whitespace-nowrap"
                    >
                      Dùng Thẻ Thoát Đảo
                    </button>
                  )}
                </div>
              ) : (
                <>
                  {tacticalDiceEnabled && (
                    <div className="pointer-events-auto bt-casual-modal flex flex-wrap items-center justify-center gap-1 p-1 rounded-full">
                      <button
                        type="button"
                        disabled={isActionPending}
                        aria-pressed={selectedDiceChoice === 'NORMAL'}
                        onClick={() => onSelectDiceChoice?.('NORMAL')}
                        className={`px-2.5 py-1.5 rounded-full text-[11px] font-black uppercase transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer whitespace-nowrap ${
                          selectedDiceChoice === 'NORMAL'
                            ? 'bg-[#182232] text-white'
                            : 'text-[#3f4a5e] hover:bg-[#efece4]'
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
                            ? 'bt-btn-gold'
                            : 'text-[#3f4a5e] hover:bg-[#efece4]'
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
                            ? 'bt-btn-gold'
                            : 'text-[#3f4a5e] hover:bg-[#efece4]'
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
                    className="pointer-events-auto bt-btn-pink px-6 sm:px-7 py-2.5 sm:py-3 rounded-full disabled:opacity-45 font-black text-sm sm:text-base uppercase tracking-wide flex items-center gap-2 cursor-pointer disabled:cursor-not-allowed whitespace-nowrap"
                  >
                    <Dices className="h-5 w-5 shrink-0 stroke-[2.3]" aria-hidden="true" />
                    <span>Đổ Xúc Xắc</span>
                    <kbd className="hidden lg:inline-flex items-center px-1.5 py-0.5 rounded-md bg-black/20 border border-white/25 text-[9px] font-mono-num font-bold tracking-normal text-white/95">
                      Space
                    </kbd>
                  </button>
                </>
              )
            ) : (
              <div
                data-dice-sum={resolvedDiceSum}
                className="pointer-events-auto flex flex-wrap items-center justify-center gap-2"
              >
                {lastDice && (
                  <div className="px-3.5 py-2 rounded-full bt-casual-modal text-xs sm:text-sm font-black text-[#141c2b] font-mono-num flex items-center gap-1.5 whitespace-nowrap">
                    <Dices className="h-4 w-4 text-rose-600 shrink-0" aria-hidden="true" />
                    <span>
                      {lastDice[0]} + {lastDice[1]} = {resolvedDiceSum}
                    </span>
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
                  className="bt-btn-gold px-4 sm:px-5 py-2.5 rounded-full font-black text-xs sm:text-sm uppercase tracking-wide flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer whitespace-nowrap"
                >
                  <RotateCcw className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  <span>Đổ Lại ({rerollCharges})</span>
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
                  className="bt-btn-green px-4 sm:px-5 py-2.5 rounded-full disabled:opacity-45 font-black text-xs sm:text-sm uppercase tracking-wide flex items-center gap-1.5 cursor-pointer disabled:cursor-not-allowed whitespace-nowrap"
                >
                  <Check className="h-4 w-4 shrink-0 stroke-[2.5]" aria-hidden="true" />
                  <span>Giữ &amp; Đi ({resolvedDiceSum} bước)</span>
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
                className="pointer-events-auto bt-btn-white px-3.5 py-2.5 rounded-full text-xs font-extrabold uppercase tracking-wide cursor-pointer whitespace-nowrap"
              >
                Tài Sản ({ownedCount})
              </button>
            )}
          </div>
        )}

      {/* Online Waiting Indicator */}
      {isOnlineMatch &&
        !isOnlineSpectator &&
        !isHumanTurn &&
        !isModalDecisionPhase &&
        (turnPhase === 'AWAIT_ROLL' || turnPhase === 'REROLL_DECISION') && (
          <div className="fixed bottom-[124px] sm:bottom-[136px] lg:bottom-[max(0.9rem,env(safe-area-inset-bottom,0px))] left-1/2 -translate-x-1/2 z-25 w-max max-w-[calc(100vw-1rem)] sm:max-w-[calc(100vw-9rem)] lg:max-w-[min(780px,calc(100vw-580px))] flex flex-wrap items-center justify-center gap-2 pointer-events-none">
            <div className="px-4 py-2 rounded-full bt-casual-modal text-xs sm:text-sm font-bold text-[#334155] flex items-center gap-1.5 whitespace-normal text-center">
              <Hourglass className="h-3.5 w-3.5 text-amber-600 shrink-0" aria-hidden="true" />
              <span>Đang chờ {currentPlayer.name}...</span>
            </div>
          </div>
        )}

      {/* Online AFK Bot Takeover Reclaim CTA */}
      {isOnlineMatch && !isOnlineSpectator && isOnlineBotTakeover && onReclaimControl && (
        <div className="fixed bottom-[174px] sm:bottom-[188px] lg:bottom-[4.5rem] left-1/2 -translate-x-1/2 z-26 w-max max-w-[calc(100vw-1rem)] pointer-events-auto animate-pop-in">
          <button
            type="button"
            data-testid="bt-reclaim-control-btn"
            disabled={isActionPending}
            onClick={onReclaimControl}
            className="bt-btn-gold px-5 py-2.5 rounded-full disabled:opacity-45 font-black text-xs sm:text-sm uppercase tracking-wide flex items-center gap-1.5 cursor-pointer disabled:cursor-not-allowed shadow-lg whitespace-normal text-center"
          >
            <Hand className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>Lấy Lại Quyền Điều Khiển</span>
          </button>
        </div>
      )}

      {/* Online Spectator Status Bar & Hot-Join Bot Takeover Picker */}
      {isOnlineMatch && isOnlineSpectator && turnPhase !== 'GAME_OVER' && (
        <div className="fixed bottom-[124px] sm:bottom-[136px] lg:bottom-[max(0.9rem,env(safe-area-inset-bottom,0px))] left-1/2 -translate-x-1/2 z-25 w-max max-w-[calc(100vw-1rem)] sm:max-w-[calc(100vw-9rem)] lg:max-w-[min(780px,calc(100vw-580px))] flex flex-col items-center gap-2 pointer-events-none">
          {takeoverPickerOpen && eligibleTakeoverBots.length > 0 && !takeoverRequestPending && (
            <div
              data-testid="bt-takeover-bot-picker"
              className="pointer-events-auto bt-casual-modal rounded-2xl p-2.5 shadow-xl animate-pop-in flex flex-col gap-2 max-w-full"
            >
              <div className="flex items-center justify-between gap-3 px-1">
                <span className="text-[11px] font-black uppercase tracking-wide text-[#141c2b]">
                  Chọn Bot muốn thế chỗ
                </span>
                <button
                  type="button"
                  onClick={() => setTakeoverPickerOpen(false)}
                  aria-label="Đóng danh sách chọn Bot"
                  className="icon-hit-target h-5 w-5 rounded-full bg-[#efece4] hover:bg-[#e2dcd0] text-[#525e73] flex items-center justify-center cursor-pointer"
                >
                  <X className="h-3 w-3" aria-hidden="true" />
                </button>
              </div>
              <div className="flex flex-wrap items-center justify-center gap-1.5">
                {eligibleTakeoverBots.map((bot) => (
                  <button
                    key={bot.playerId}
                    type="button"
                    data-testid={`bt-takeover-bot-option-p${bot.playerId}`}
                    onClick={() => {
                      setTakeoverPickerOpen(false);
                      onRequestBotTakeover?.(bot.playerId);
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white hover:bg-[#efece4] border border-[#d5cec0] text-xs font-bold text-[#141c2b] transition-colors cursor-pointer whitespace-nowrap"
                  >
                    <span
                      className="h-2.5 w-2.5 rounded-full shrink-0 border border-white shadow-2xs"
                      style={{ backgroundColor: bot.color }}
                    />
                    <span>{bot.name}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div
            data-testid="bt-spectator-status-bar"
            className="pointer-events-auto bt-casual-modal rounded-2xl sm:rounded-full px-3.5 sm:px-4 py-1.5 sm:py-2 flex flex-wrap items-center justify-center gap-2 sm:gap-3 shadow-lg"
          >
            <span className="text-xs sm:text-sm font-extrabold text-[#141c2b] inline-flex items-center gap-1.5 whitespace-nowrap">
              <Eye className="h-4 w-4 text-[#525e73] shrink-0" aria-hidden="true" />
              <span className="sr-only">👁️ </span>
              <span>Chế độ Khán giả — Đang xem trực tiếp</span>
            </span>
            <button
              type="button"
              data-testid="bt-request-takeover-btn"
              disabled={eligibleTakeoverBots.length === 0 || takeoverRequestPending}
              title={
                takeoverRequestPending
                  ? 'Đang chờ Chủ phòng duyệt yêu cầu thế chỗ'
                  : eligibleTakeoverBots.length === 0
                    ? 'Hiện chưa có Bot AI khả dụng để thế chỗ'
                    : 'Chọn một Bot AI còn hoạt động để vào chơi'
              }
              onClick={() => {
                setOpenMenu('none');
                setTakeoverPickerOpen((prev) => !prev);
              }}
              className="bt-btn-green px-3.5 py-1.5 rounded-full text-xs font-black uppercase tracking-wide inline-flex items-center gap-1.5 disabled:opacity-45 cursor-pointer disabled:cursor-not-allowed whitespace-nowrap"
            >
              {takeoverRequestPending ? (
                <>
                  <Hourglass className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  <span>Đang chờ duyệt...</span>
                </>
              ) : (
                <>
                  <Gamepad2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  <span>Xin thế chỗ Bot</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </>
  );
};

export const ActionDock = React.memo(ActionDockInner);
