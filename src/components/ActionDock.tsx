import React from 'react';
import { JAIL_FINE } from '../game/rules';
import { PlayerState, TurnPhase } from '../game/types';

interface ActionDockProps {
  currentPlayer: PlayerState;
  turnPhase: TurnPhase;
  lastDice: [number, number] | null;
  upgradableCount: number;
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
  onEndTurn: () => void;
  onChangeSpeed: (speed: 1 | 2) => void;
  onToggleCinematic: () => void;
  onToggleNightMode: () => void;
  onResetCamera: () => void;
  onToggleSound: () => void;
  onOpenPause: () => void;
}

export const ActionDock: React.FC<ActionDockProps> = ({
  currentPlayer,
  turnPhase,
  lastDice,
  upgradableCount,
  ownedCount,
  canTrade,
  speedMultiplier,
  cinematicCamera,
  nightMode,
  soundMuted,
  dockCollapsed,
  onToggleDock,
  onRollDice,
  onPayJailFine,
  onUseJailCard,
  onOpenAssetsModal,
  onOpenTradeModal,
  onEndTurn,
  onChangeSpeed,
  onToggleCinematic,
  onToggleNightMode,
  onResetCamera,
  onToggleSound,
  onOpenPause,
}) => {
  const isHumanTurn = !currentPlayer.isBot && !currentPlayer.bankrupt;
  const isDoubles = lastDice ? lastDice[0] === lastDice[1] : false;

  return (
    <div
      className="fixed bottom-4 left-1/2 -translate-x-1/2 z-20 w-[min(1340px,97vw)] flex flex-col items-center pointer-events-none"
    >
      {/* Collapse / Expand Drawer Handle */}
      <button
        type="button"
        onClick={onToggleDock}
        className="pointer-events-auto mb-1.5 px-3.5 py-1 rounded-lg hud-panel text-xs font-semibold text-slate-200 hover:text-white transition-colors cursor-pointer whitespace-nowrap"
      >
        {dockCollapsed ? '▴ Mở thanh điều khiển [H]' : '▾ Thu gọn điều khiển [H]'}
      </button>

      {!dockCollapsed && (
        <div className="pointer-events-auto w-full hud-panel rounded-2xl px-4 py-2.5 flex flex-wrap items-center justify-between gap-2.5">
          {/* Left Zone: Turn Indicator & Latest Dice Result */}
          <div className="flex items-center gap-3 min-w-0">
            <div className="flex items-center gap-2.5">
              <span
                className="h-4 w-4 rounded-md shrink-0 border-2 border-amber-300/80 shadow-xs"
                style={{ backgroundColor: currentPlayer.color }}
              />
              <div className="min-w-0">
                <div className="text-[11px] font-semibold text-sky-200/80">Lượt hiện tại</div>
                <div className="font-display text-base font-extrabold text-white truncate max-w-[148px] leading-tight">
                  {currentPlayer.name}
                </div>
              </div>
            </div>

            {lastDice && (
              <div className="flex items-center gap-1.5 pl-3 border-l border-sky-200/20">
                <span className="h-7 w-7 rounded-lg bg-gradient-to-b from-white to-amber-50 border border-amber-300 text-slate-900 font-display font-extrabold text-sm flex items-center justify-center tabular-nums shadow-sm">
                  {lastDice[0]}
                </span>
                <span className="h-7 w-7 rounded-lg bg-gradient-to-b from-white to-amber-50 border border-amber-300 text-slate-900 font-display font-extrabold text-sm flex items-center justify-center tabular-nums shadow-sm">
                  {lastDice[1]}
                </span>
                <div className="ml-1 text-xs text-sky-100 tabular-nums">
                  <span className="font-display font-extrabold text-amber-300 text-sm">
                    ={lastDice[0] + lastDice[1]}
                  </span>
                  {isDoubles && (
                    <span className="ml-1 text-amber-300 font-bold">· Đôi!</span>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Center Zone: Primary MONOPOLY GO! Tactile Gameplay Actions */}
          <div className="flex flex-wrap items-center gap-2">
            {turnPhase === 'AUCTION' ? (
              <div className="px-4 py-2 rounded-xl bg-amber-500/20 border border-amber-300/50 text-amber-200 text-sm font-bold whitespace-nowrap">
                Đang diễn ra Đấu Giá Công Khai...
              </div>
            ) : !isHumanTurn ? (
              <div className="px-4 py-2 rounded-xl bg-slate-900/70 border border-sky-300/20 text-amber-300 text-sm font-semibold whitespace-nowrap">
                {currentPlayer.name} đang suy nghĩ...
              </div>
            ) : turnPhase === 'AWAIT_ROLL' ? (
              <>
                {currentPlayer.inJail ? (
                  <>
                    <button
                      type="button"
                      onClick={onRollDice}
                      className="btn-3d-gold px-4 py-2 rounded-xl text-slate-950 font-extrabold text-sm cursor-pointer whitespace-nowrap"
                    >
                      Đổ Săn Đôi
                    </button>
                    <button
                      type="button"
                      disabled={currentPlayer.cash < JAIL_FINE}
                      onClick={onPayJailFine}
                      className="btn-3d-roll px-3.5 py-2 rounded-xl disabled:opacity-40 text-white font-extrabold text-sm cursor-pointer whitespace-nowrap"
                    >
                      Nộp Phạt ${JAIL_FINE}
                    </button>
                    {currentPlayer.jailFreeCards > 0 && (
                      <button
                        type="button"
                        onClick={onUseJailCard}
                        className="btn-3d-sky px-3.5 py-2 rounded-xl text-white font-bold text-sm cursor-pointer whitespace-nowrap"
                      >
                        Dùng Thẻ Ra Tù
                      </button>
                    )}
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={onRollDice}
                    className="btn-3d-roll px-6 py-2.5 rounded-xl text-white font-extrabold text-base flex items-center gap-2 cursor-pointer whitespace-nowrap"
                  >
                    <svg
                      viewBox="0 0 24 24"
                      aria-hidden="true"
                      className="h-5 w-5 shrink-0 fill-none stroke-current stroke-[2.2]"
                    >
                      <rect x="3" y="3" width="12" height="12" rx="2.5" />
                      <circle cx="6.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
                      <circle cx="11.5" cy="11.5" r="1" fill="currentColor" stroke="none" />
                      <path d="M15 9h3.5A2.5 2.5 0 0 1 21 11.5v7A2.5 2.5 0 0 1 18.5 21h-7A2.5 2.5 0 0 1 9 18.5V15" />
                      <circle cx="16.5" cy="16.5" r="1" fill="currentColor" stroke="none" />
                    </svg>
                    <span>Đổ Xúc Xắc</span>
                  </button>
                )}
              </>
            ) : turnPhase === 'ROLLING_DICE' || turnPhase === 'MOVING_TOKEN' ? (
              <div className="px-4 py-2 rounded-xl bg-slate-900/70 border border-sky-300/20 text-sky-100 text-sm font-semibold whitespace-nowrap">
                {turnPhase === 'ROLLING_DICE' ? 'Đang đổ xúc xắc...' : 'Đang di chuyển quân cờ...'}
              </div>
            ) : turnPhase === 'AWAIT_END_TURN' ? (
              <button
                type="button"
                onClick={onEndTurn}
                className="btn-3d-gold px-5 py-2.5 rounded-xl text-slate-950 font-extrabold text-base cursor-pointer whitespace-nowrap"
              >
                {currentPlayer.doublesStreak > 0 && !currentPlayer.inJail
                  ? 'Đổ Tiếp (Ra Đôi!)'
                  : 'Kết Thúc Lượt'}
              </button>
            ) : null}

            {/* Property & House Upgrade Button */}
            {isHumanTurn &&
              (turnPhase === 'AWAIT_ROLL' ||
                turnPhase === 'AWAIT_END_TURN' ||
                turnPhase === 'DEBT_RESOLUTION') && (
                <button
                  type="button"
                  onClick={onOpenAssetsModal}
                  className="px-3.5 py-2.5 rounded-xl bg-slate-900/80 hover:bg-slate-800 border border-sky-200/25 text-white font-semibold text-sm transition-colors cursor-pointer whitespace-nowrap"
                >
                  Xây Nhà / Tài Sản ({ownedCount})
                  {upgradableCount > 0 ? ` · +${upgradableCount}` : ''}
                </button>
              )}

            {/* Trade (Giao Dịch) Button */}
            {isHumanTurn &&
              canTrade &&
              (turnPhase === 'AWAIT_ROLL' || turnPhase === 'AWAIT_END_TURN') && (
                <button
                  type="button"
                  onClick={onOpenTradeModal}
                  className="btn-3d-sky px-3.5 py-2.5 rounded-xl text-white font-bold text-sm cursor-pointer whitespace-nowrap"
                >
                  Giao Dịch
                </button>
              )}
          </div>

          {/* Right Zone: Speed 1x/2x, Cinematic Camera, Day/Night, Reset Camera, Mute, Pause */}
          <div className="flex items-center gap-1.5">
            {/* Speed Selector */}
            <div
              className="flex items-center p-0.5 bg-slate-800 rounded-lg border border-white/10"
              role="group"
              aria-label="Tốc độ trận đấu"
            >
              {([1, 2] as const).map((sp) => (
                <button
                  key={sp}
                  type="button"
                  onClick={() => onChangeSpeed(sp)}
                  className={`px-2.5 py-1.5 rounded-md text-xs font-bold tabular-nums transition-colors cursor-pointer whitespace-nowrap ${
                    speedMultiplier === sp
                      ? 'bg-amber-400 text-slate-950'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  {sp}x
                </button>
              ))}
            </div>

            {/* Cinematic Camera Toggle Switch */}
            <button
              type="button"
              aria-pressed={cinematicCamera}
              onClick={onToggleCinematic}
              title="Camera Điện Ảnh tự động lia theo quân cờ [C]"
              className={`px-2.5 py-2 rounded-lg border text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap ${
                cinematicCamera
                  ? 'bg-amber-400 text-slate-950 border-amber-300 font-bold'
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white border-white/10'
              }`}
            >
              <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 shrink-0 fill-none stroke-current stroke-2">
                <rect x="2" y="6" width="14" height="12" rx="2" />
                <path d="M16 10l6-3v10l-6-3v-4z" />
              </svg>
              <span>Điện ảnh</span>
              <span
                aria-hidden="true"
                className={`h-3.5 w-6 rounded-sm p-0.5 flex items-center transition-colors ${
                  cinematicCamera ? 'bg-slate-950/85 justify-end' : 'bg-slate-950/60 justify-start'
                }`}
              >
                <span
                  className={`h-2.5 w-2.5 rounded-xs transition-colors ${
                    cinematicCamera ? 'bg-amber-300' : 'bg-slate-400'
                  }`}
                />
              </span>
            </button>

            {/* Day / Night Lighting Cycle Toggle */}
            <button
              type="button"
              aria-pressed={nightMode}
              onClick={onToggleNightMode}
              title="Chuyển đổi ánh sáng Ngày / Đêm [N]"
              className={`px-2.5 py-2 rounded-lg border text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap ${
                nightMode
                  ? 'bg-indigo-500 hover:bg-indigo-400 text-white border-indigo-300 font-bold'
                  : 'bg-slate-800 hover:bg-slate-700 text-amber-300 hover:text-amber-200 border-white/10'
              }`}
            >
              {nightMode ? (
                <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 shrink-0 fill-current">
                  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 shrink-0 fill-none stroke-current stroke-2">
                  <circle cx="12" cy="12" r="4" />
                  <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
                </svg>
              )}
              <span>{nightMode ? 'Ban đêm' : 'Ban ngày'}</span>
            </button>

            {/* Reset Isometric Camera */}
            <button
              type="button"
              onClick={onResetCamera}
              title="Đặt lại góc nhìn 3D mặc định [R]"
              className="px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 border border-white/10 text-xs font-semibold text-slate-200 hover:text-white transition-colors cursor-pointer whitespace-nowrap"
            >
              Đặt lại góc nhìn
            </button>

            {/* Sound Toggle */}
            <button
              type="button"
              onClick={onToggleSound}
              aria-label={soundMuted ? 'Bật âm thanh' : 'Tắt âm thanh'}
              title={soundMuted ? 'Bật âm thanh [M]' : 'Tắt âm thanh [M]'}
              className="h-9 w-9 rounded-lg bg-slate-800 hover:bg-slate-700 border border-white/10 flex items-center justify-center text-slate-200 hover:text-white transition-colors cursor-pointer"
            >
              {soundMuted ? (
                <svg viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current stroke-2">
                  <path d="M11 5L6 9H2v6h4l5 4V5z" />
                  <path d="M23 9l-6 6M17 9l6 6" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" className="h-4 w-4 fill-none stroke-current stroke-2">
                  <path d="M11 5L6 9H2v6h4l5 4V5z" />
                  <path d="M15.54 8.46a5 5 0 0 1 0 7.07M19.07 4.93a10 10 0 0 1 0 14.14" />
                </svg>
              )}
            </button>

            {/* Pause Menu */}
            <button
              type="button"
              onClick={onOpenPause}
              aria-label="Tạm dừng trò chơi"
              title="Tạm dừng / Cài đặt [Esc]"
              className="h-9 w-9 rounded-lg bg-slate-800 hover:bg-slate-700 border border-white/10 flex items-center justify-center text-slate-200 hover:text-white transition-colors cursor-pointer"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current">
                <rect x="6" y="4" width="4" height="16" rx="1" />
                <rect x="14" y="4" width="4" height="16" rx="1" />
              </svg>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
