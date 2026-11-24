import React, { useEffect, useMemo, useRef, useState } from 'react';
import { BOARD_TILES, COLOR_GROUP_META } from '../game/boardData';
import {
  calculateBuyoutPrice,
  calculateNetWorth,
  calculatePropertyInvestedValue,
  calculateRent,
  computeOptimalAutoSale,
  formatBusinessTourCompact,
  formatBusinessTourSpaced,
  getInitialPurchaseTiers,
  ownsFullColorGroup,
  rankPlayersForVictory,
  RESORT_RENTS,
  RESORT_TILE_INDICES,
  wouldOwnTileWinMatch,
} from '../game/rules';
import {
  GraphicsQualityTier,
  LuckCard,
  MatchBoardModifiers,
  MatchMode,
  PendingDebt,
  PlayerState,
  PropertyState,
  TeamId,
  TileKind,
  VictoryConditionKind,
} from '../game/types';
import { CityLandmarkBadge } from './CityLandmarkBadge';
import { PlayerAvatar3D } from './PlayerAvatar3D';
import { resolveDeedGroupPalette } from '../three/textures';

function getFocusableElements(container: HTMLElement): HTMLElement[] {
  const selector = [
    'a[href]',
    'area[href]',
    'button:not([disabled])',
    'input:not([disabled]):not([type="hidden"])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
  ].join(', ');

  return Array.from(container.querySelectorAll<HTMLElement>(selector)).filter((el) => {
    if (el.closest('[aria-hidden="true"]')) return false;
    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden') return false;
    return el.getClientRects().length > 0;
  });
}

export function useDialogFocusTrap(
  containerRef: React.RefObject<HTMLElement | null>,
  enabled: boolean
): void {
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!enabled) return;
    const container = containerRef.current;
    if (!container) return;

    previousFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    if (!container.contains(document.activeElement)) {
      const focusables = getFocusableElements(container);
      const target = focusables[0] ?? container;
      target.focus({ preventScroll: true });
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const currentContainer = containerRef.current;
      if (!currentContainer) return;

      const focusables = getFocusableElements(currentContainer);
      if (focusables.length === 0) {
        e.preventDefault();
        currentContainer.focus({ preventScroll: true });
        return;
      }

      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement;

      if (!(active instanceof HTMLElement) || !currentContainer.contains(active)) {
        e.preventDefault();
        (e.shiftKey ? last : first).focus({ preventScroll: true });
        return;
      }

      if (e.shiftKey) {
        if (active === first || active === currentContainer) {
          e.preventDefault();
          last.focus({ preventScroll: true });
        }
      } else if (active === last) {
        e.preventDefault();
        first.focus({ preventScroll: true });
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      const prev = previousFocusRef.current;
      previousFocusRef.current = null;
      if (
        prev &&
        prev.isConnected &&
        (!document.activeElement ||
          document.activeElement === document.body ||
          container.contains(document.activeElement))
      ) {
        prev.focus({ preventScroll: true });
      }
    };
  }, [containerRef, enabled]);
}

/* ==========================================
 * 1. RAYCASTED TILE INSPECTOR POPOVER CARD
 * ========================================== */
interface TileInspectorProps {
  tileIndex: number;
  players: PlayerState[];
  properties: Record<number, PropertyState>;
  boardModifiers: MatchBoardModifiers;
  matchMode?: MatchMode;
  onClose: () => void;
}

export const TileInspectorCard: React.FC<TileInspectorProps> = ({
  tileIndex,
  players,
  properties,
  boardModifiers,
  matchMode = 'FFA',
  onClose,
}) => {
  const tile = BOARD_TILES[tileIndex];
  const prop = properties[tileIndex];
  const owner =
    prop && prop.ownerId !== null
      ? players.find((p) => p.id === prop.ownerId) || null
      : null;

  const hasColorMono =
    owner !== null &&
    tile.group !== undefined &&
    ownsFullColorGroup(owner.id, tile.group, properties, players, matchMode);
  const isFestival = boardModifiers.festivalTileIndices.includes(tileIndex);
  const isCup = boardModifiers.championshipTileIndex === tileIndex;
  const isOutage = Boolean(boardModifiers.outageTileIndices?.includes(tileIndex));
  const isShielded = Boolean(boardModifiers.shieldedTileIndices?.includes(tileIndex));
  const cupMult = isCup ? Math.max(1, boardModifiers.championshipMultiplier) : 1;
  const totalPropertyMult = isOutage
    ? 0
    : (hasColorMono ? 2 : 1) * (isFestival ? 2 : 1) * cupMult;

  const ownedResortsByOwner = useMemo(() => {
    if (!owner) return 0;
    if (matchMode === 'TEAMS_2V2' && owner.teamId !== undefined) {
      const teamIds = new Set(
        players
          .filter((p) => !p.bankrupt && p.teamId === owner.teamId)
          .map((p) => p.id)
      );
      return RESORT_TILE_INDICES.filter((idx) => {
        const oid = properties[idx]?.ownerId;
        return oid !== null && oid !== undefined && teamIds.has(oid);
      }).length;
    }
    return RESORT_TILE_INDICES.filter((idx) => properties[idx]?.ownerId === owner.id).length;
  }, [matchMode, owner, players, properties]);

  const statusNotes: string[] = [];
  if (tile.kind === TileKind.RESORT) {
    statusNotes.push('Khu nghỉ dưỡng · Miễn nhiễm Mua lại');
  } else if (prop && prop.level >= 4) {
    statusNotes.push('Khách sạn ★ (Miễn mua lại & Động đất)');
  }
  if (isShielded) statusNotes.push('🛡️ Khiên Bảo Hộ (Miễn mua lại & chặn 1 đòn phá hoại)');
  if (isOutage) statusNotes.push('⚡ Đang mất điện (Thuê 0K lượt ghé tới)');
  if (hasColorMono) statusNotes.push('Độc quyền bộ màu (×2)');
  if (isFestival) statusNotes.push('🎉 Lễ Hội (×2)');
  if (isCup) statusNotes.push(`🏆 Cúp Quốc Gia (×${cupMult})`);

  const headerPal =
    tile.kind === TileKind.PROPERTY
      ? resolveDeedGroupPalette(tile.group, tile.groupColor)
      : {
          topHex: tile.kind === TileKind.RESORT ? '#22B8F8' : '#38BDF8',
          bottomHex: tile.kind === TileKind.RESORT ? '#0284C7' : '#0369A1',
        };

  return (
    <div
      data-testid="tile-inspector-card"
      role="region"
      aria-label={`Thông tin ${tile.name}`}
      className="fixed left-3 sm:left-4 top-1/2 -translate-y-1/2 z-25 w-[min(320px,calc(100vw-1.5rem))] max-h-[calc(100dvh-1.5rem)] flex flex-col bt-casual-modal rounded-3xl overflow-hidden animate-pop-in pointer-events-auto"
    >
      <div
        className="shrink-0 px-4 py-3 flex items-center justify-between gap-2.5 text-white border-b-2 border-white/50"
        style={{
          background: `linear-gradient(to bottom var(--in-oklab), ${
            owner?.color || headerPal.topHex
          } 0%, ${owner?.color || headerPal.bottomHex} 100%)`,
          textShadow: '0 1.5px 2px rgba(15, 23, 42, 0.45)',
        }}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <CityLandmarkBadge tileIndex={tileIndex} size={44} />
          <div className="min-w-0">
            {tile.groupLabel && (
              <div className="text-[10px] font-black uppercase tracking-wider text-white/90">
                Cụm {tile.groupLabel}
              </div>
            )}
            {tile.kind === TileKind.RESORT && (
              <div className="text-[10px] font-black uppercase tracking-wider text-[#FEF08A]">
                Khu Nghỉ Dưỡng Đảo / Vịnh
              </div>
            )}
            <h3 className="font-display text-lg font-black uppercase leading-snug text-white">
              {tile.name}
            </h3>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Đóng thông tin ô đất"
          className="icon-hit-target h-7 w-7 rounded-full bg-black/25 hover:bg-black/40 flex items-center justify-center text-white text-xs font-black cursor-pointer shrink-0"
        >
          ✕
        </button>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto slim-scroll p-4 space-y-3 text-sm text-slate-800">
        <p className="text-xs text-slate-600 leading-relaxed">{tile.description}</p>

        {statusNotes.length > 0 && (
          <div className="text-[11px] font-extrabold text-[#16A34A] leading-snug">
            {statusNotes.join(' · ')}
          </div>
        )}

        {prop && (
          <div className="flex items-center justify-between py-2 border-y border-sky-100 text-xs">
            <div>
              <span className="text-slate-500 font-semibold">Giá gốc: </span>
              <span className="font-mono-num font-black text-slate-900">
                {formatBusinessTourCompact(tile.price || 0)}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-slate-500 font-semibold">Chủ:</span>
              {owner ? (
                <span className="font-extrabold text-slate-900 flex items-center gap-1.5">
                  <PlayerAvatar3D
                    archetype={owner.tokenType}
                    phaseSeed={owner.id}
                    size="xs"
                  />
                  {owner.name}
                </span>
              ) : (
                <span className="font-extrabold text-[#16A34A]">Chưa có chủ</span>
              )}
            </div>
          </div>
        )}

        {tile.kind === TileKind.PROPERTY && tile.rents && (
          <div className="rounded-2xl bg-sky-50/90 border border-sky-200 overflow-hidden text-xs">
            <div className="id-subheader-strip px-3 py-1.5 font-extrabold text-[11px] uppercase flex items-center justify-between">
              <span>Bảng Phí Thuê</span>
              {totalPropertyMult > 1 && (
                <span className="text-[#16A34A]">×{totalPropertyMult} Tổng Hệ Số</span>
              )}
            </div>
            <div className="p-2 space-y-0.5">
              {[
                {
                  label: 'Đất khởi điểm',
                  val: tile.rents[0] * totalPropertyMult,
                  active: prop?.ownerId !== null && prop?.level === 0,
                },
                {
                  label: 'Nhà Cấp 1',
                  val: tile.rents[1] * totalPropertyMult,
                  active: prop?.ownerId !== null && prop?.level === 1,
                },
                {
                  label: 'Nhà Cấp 2',
                  val: tile.rents[2] * totalPropertyMult,
                  active: prop?.ownerId !== null && prop?.level === 2,
                },
                {
                  label: 'Nhà Cấp 3',
                  val: tile.rents[3] * totalPropertyMult,
                  active: prop?.ownerId !== null && prop?.level === 3,
                },
                {
                  label: 'Khách Sạn (Khiên ★)',
                  val: tile.rents[4] * totalPropertyMult,
                  active: prop?.ownerId !== null && prop?.level === 4,
                },
              ].map((row, idx) => (
                <div
                  key={idx}
                  className={`flex items-center justify-between py-1 px-2 rounded-lg ${
                    row.active
                      ? 'bg-[#F5B800]/25 text-slate-950 font-black'
                      : 'text-slate-700 font-medium'
                  }`}
                >
                  <span>{row.label}</span>
                  <span className="font-mono-num font-bold">
                    {formatBusinessTourCompact(row.val)}
                  </span>
                </div>
              ))}
              <div className="pt-1.5 mt-1 border-t border-sky-200 px-2 space-y-0.5 text-[11px] text-slate-600">
                <div className="flex items-center justify-between">
                  <span>Giá xây mỗi cấp</span>
                  <span className="font-mono-num font-extrabold text-slate-900">
                    {formatBusinessTourCompact(tile.houseCost || 0)}
                  </span>
                </div>
                {prop && prop.ownerId !== null && prop.level < 4 && !isShielded && (
                  <div className="flex items-center justify-between">
                    <span>Giá mua lại (2×)</span>
                    <span className="font-mono-num font-extrabold text-[#D97706]">
                      {formatBusinessTourCompact(calculateBuyoutPrice(tileIndex, prop.level))}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {tile.kind === TileKind.RESORT && (
          <div className="rounded-2xl bg-sky-50/90 border border-sky-200 overflow-hidden text-xs">
            <div className="id-subheader-strip px-3 py-1.5 font-extrabold text-[11px] uppercase flex items-center justify-between">
              <span>Phí Thuê Khu Nghỉ Dưỡng</span>
              {isOutage ? (
                <span className="text-rose-600">⚡ Mất Điện · 0K</span>
              ) : (
                <span className="text-[#0284C7]">4/4 Thắng Ngay</span>
              )}
            </div>
            <div className="p-2 space-y-0.5">
              {RESORT_RENTS.map((rentVal, idx) => {
                const countNeeded = idx + 1;
                const active = ownedResortsByOwner === countNeeded;
                const effectiveRent = isOutage ? 0 : rentVal;
                return (
                  <div
                    key={countNeeded}
                    className={`flex items-center justify-between py-1 px-2 rounded-lg ${
                      active
                        ? 'bg-[#F5B800]/25 text-slate-950 font-black'
                        : 'text-slate-700 font-medium'
                    }`}
                  >
                    <span>Sở hữu {countNeeded} Khu nghỉ dưỡng</span>
                    <span className="font-mono-num font-bold">
                      {formatBusinessTourCompact(effectiveRent)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {tile.kind === TileKind.TAX && (
          <div className="rounded-2xl bg-rose-50 border border-rose-200 p-3 text-xs font-bold text-rose-900 leading-relaxed">
            Thuế bằng <span className="font-black">10% tổng giá trị vốn</span> toàn bộ thành phố và khu nghỉ dưỡng bạn đang sở hữu.
          </div>
        )}
      </div>
    </div>
  );
};

/* ==========================================
 * 2. BUY UNOWNED PROPERTY / RESORT DECISION PROMPT
 * ========================================== */
interface BuyDecisionModalProps {
  tileIndex: number;
  player: PlayerState;
  players?: PlayerState[];
  properties: Record<number, PropertyState>;
  boardModifiers: MatchBoardModifiers;
  matchMode?: MatchMode;
  trapFocus?: boolean;
  onBuy: (initialLevel?: number) => void;
  onSkip: () => void;
}

export const BuyDecisionModal: React.FC<BuyDecisionModalProps> = ({
  tileIndex,
  player,
  players = [],
  properties,
  boardModifiers,
  matchMode = 'FFA',
  trapFocus = true,
  onBuy,
  onSkip,
}) => {
  const dialogRef = useRef<HTMLDivElement>(null);
  useDialogFocusTrap(dialogRef, trapFocus);

  const tile = BOARD_TILES[tileIndex];
  const price = tile.price || 0;
  const tiers = getInitialPurchaseTiers(player, tileIndex);
  const [selectedLevel, setSelectedLevel] = useState<0 | 1 | 2 | 3>(0);

  useEffect(() => {
    setSelectedLevel(0);
  }, [tileIndex]);

  const isBtCity = tile.kind === TileKind.PROPERTY;
  const activeTier =
    tiers.find((t) => t.level === (isBtCity ? selectedLevel : 0)) || tiers[0];
  const totalCost = activeTier ? activeTier.totalCost : price;
  const canAfford = player.cash >= totalCost;

  const teamOwnerIds = useMemo(() => {
    if (matchMode === 'TEAMS_2V2' && player.teamId !== undefined && players.length > 0) {
      return new Set(
        players.filter((p) => !p.bankrupt && p.teamId === player.teamId).map((p) => p.id)
      );
    }
    return new Set([player.id]);
  }, [matchMode, player.id, player.teamId, players]);

  let groupInfo = '';
  let completesMono = false;
  let ownedResortsCount = 0;
  if (tile.group) {
    const groupMeta = COLOR_GROUP_META[tile.group];
    const ownedInGroup = groupMeta.tileIndices.filter((idx) => {
      const oid = properties[idx]?.ownerId;
      return oid !== null && oid !== undefined && teamOwnerIds.has(oid);
    }).length;
    completesMono = ownedInGroup === groupMeta.tileIndices.length - 1;
    groupInfo = `Cụm ${groupMeta.label} (${ownedInGroup}/${groupMeta.tileIndices.length})`;
  } else if (tile.kind === TileKind.RESORT) {
    ownedResortsCount = RESORT_TILE_INDICES.filter((idx) => {
      const oid = properties[idx]?.ownerId;
      return oid !== null && oid !== undefined && teamOwnerIds.has(oid);
    }).length;
    completesMono = ownedResortsCount === RESORT_TILE_INDICES.length - 1;
    groupInfo = `Khu nghỉ dưỡng (${ownedResortsCount}/4)`;
  }

  const instantWin = wouldOwnTileWinMatch(player.id, tileIndex, players, properties, matchMode);
  const isFestival = boardModifiers.festivalTileIndices.includes(tileIndex);
  const buyPal = isBtCity
    ? resolveDeedGroupPalette(tile.group, tile.groupColor)
    : { topHex: '#22B8F8', bottomHex: '#0284C7' };

  return (
    <div
      ref={dialogRef}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-labelledby="buy-modal-title"
      data-testid="buy-decision-modal"
      className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-25 w-[min(460px,93vw)] max-h-[calc(100dvh-1.5rem)] flex flex-col bt-casual-modal rounded-3xl overflow-hidden animate-pop-in pointer-events-auto"
    >
      <div
        className="shrink-0 px-5 py-3.5 text-white border-b-2 border-white/50 flex items-center justify-between gap-2.5"
        style={{
          background: `linear-gradient(to bottom var(--in-oklab), ${buyPal.topHex} 0%, ${buyPal.bottomHex} 100%)`,
          textShadow: '0 1.5px 2px rgba(15, 23, 42, 0.45)',
        }}
      >
        <div className="flex items-center gap-3 min-w-0">
          <CityLandmarkBadge tileIndex={tileIndex} size={50} />
          <div className="min-w-0">
            <div className="text-[10px] font-black uppercase tracking-wider text-white/90">
              {isBtCity ? `Mua Đô Thị · Vòng ${player.laps + 1}` : 'Mua Khu Nghỉ Dưỡng'}
            </div>
            <h3
              id="buy-modal-title"
              className="font-display text-xl sm:text-2xl font-black uppercase leading-tight text-white"
            >
              {tile.name}
            </h3>
          </div>
        </div>
        <div className="text-right shrink-0 bg-black/20 rounded-xl px-3 py-1.5 border border-white/30">
          <div className="text-[9px] font-bold uppercase text-white/90">Tổng chi phí</div>
          <div className="font-mono-num text-base sm:text-lg font-black leading-none">
            {formatBusinessTourCompact(totalCost)}
          </div>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto slim-scroll p-4 sm:p-5 space-y-3.5">
        {groupInfo && (
          <div className="flex flex-wrap items-center gap-1.5 text-xs font-extrabold text-sky-900">
            <span>{groupInfo}</span>
            {isFestival && (
              <>
                <span aria-hidden="true">·</span>
                <span className="text-[#D97706] font-black">🎉 Lễ Hội ×2!</span>
              </>
            )}
            {instantWin ? (
              <>
                <span aria-hidden="true">·</span>
                <span className="text-[#16A34A] font-black">
                  🏆 Mua ô này THẮNG NGAY!
                </span>
              </>
            ) : (
              completesMono && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="text-[#16A34A] font-black">
                    {tile.kind === TileKind.RESORT ? 'Đủ 4/4 THẮNG NGAY!' : 'Đủ bộ màu ×2!'}
                  </span>
                </>
              )
            )}
          </div>
        )}
        <p className="text-xs text-slate-600 leading-relaxed">{tile.description}</p>

        {tile.kind === TileKind.RESORT && (
          <div className="px-3.5 py-2 rounded-2xl bg-sky-50 border border-sky-200 flex items-center justify-between text-xs">
            <span className="font-bold text-slate-700">Phí thuê sau khi sở hữu</span>
            <span className="font-mono-num font-black text-[#16A34A]">
              {formatBusinessTourCompact(RESORT_RENTS[Math.min(3, ownedResortsCount)])}
            </span>
          </div>
        )}

        {isBtCity && tile.rents && (
          <div className="space-y-2">
            <div className="text-xs font-bold text-slate-700">
              {player.laps === 0
                ? 'Vòng 1 cho phép xây tối đa 2 Nhà (qua Bắt Đầu mở Cấp 3):'
                : 'Chọn cấp công trình xây ngay (Ghé lại thành phố đã có 3 Nhà để nâng lên Khách sạn ★):'}
            </div>
            <div className="grid grid-cols-2 gap-2">
              {tiers.map((t) => {
                const isSelected = selectedLevel === t.level;
                const rentVal =
                  tile.rents![t.level] * (completesMono ? 2 : 1) * (isFestival ? 2 : 1);
                return (
                  <button
                    key={t.level}
                    type="button"
                    disabled={!t.affordable}
                    onClick={() => setSelectedLevel(t.level)}
                    className={`p-2.5 rounded-2xl border-2 text-left transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                      isSelected
                        ? 'bg-emerald-50 border-[#58B916] shadow-sm scale-[1.01]'
                        : 'bg-sky-50/70 border-sky-200 hover:border-sky-400'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span className="font-display text-xs sm:text-sm font-black text-slate-900">
                        {t.label}
                      </span>
                      <span className="font-mono-num text-xs sm:text-sm font-black text-sky-800">
                        {formatBusinessTourCompact(t.totalCost)}
                      </span>
                    </div>
                    <div className="font-mono-num text-[11px] font-extrabold text-[#16A34A] mt-0.5">
                      Thuê: {formatBusinessTourCompact(rentVal)}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <div className="shrink-0 px-4 sm:px-5 py-3 bg-sky-50/95 border-t border-sky-200 grid grid-cols-2 gap-2.5">
        <button
          type="button"
          disabled={!canAfford}
          onClick={() => onBuy(isBtCity ? selectedLevel : 0)}
          className="bt-btn-green py-2.5 px-2.5 sm:px-4 rounded-2xl disabled:opacity-40 font-black text-xs sm:text-sm uppercase tracking-wide cursor-pointer whitespace-normal leading-tight"
        >
          {canAfford
            ? `Mua Ngay (${formatBusinessTourCompact(totalCost)})`
            : 'Không Đủ Tiền'}
        </button>
        <button
          type="button"
          onClick={onSkip}
          className="bt-btn-white py-2.5 px-2.5 sm:px-4 rounded-2xl font-black text-xs sm:text-sm uppercase tracking-wide cursor-pointer whitespace-normal leading-tight"
        >
          Bỏ Qua
        </button>
      </div>
    </div>
  );
};

/* ==========================================
 * 3. FULL-SCREEN ILLUSTRATED BUSINESS TOUR EVENT POPUP
 * ============================================================================ */
interface LuckCardModalProps {
  card: LuckCard;
  isBot: boolean;
  trapFocus?: boolean;
  onConfirm: () => void;
}

const EventCartoonIllustration: React.FC<{ card: LuckCard }> = ({ card }) => {
  const kind = card.effect.type;

  // 1. World Championships Trophy Cartoon Scene
  if (kind === 'HOST_CHAMPIONSHIP') {
    return (
      <svg
        viewBox="0 0 280 200"
        className="w-56 sm:w-64 h-auto mx-auto drop-shadow-[0_12px_20px_rgba(15,23,42,0.35)]"
        role="img"
        aria-label={card.title}
      >
        <defs>
          <radialGradient id="evtBurstChamp" cx="50%" cy="50%" r="52%">
            <stop offset="0%" stopColor="#FEF08A" />
            <stop offset="65%" stopColor="#38BDF8" />
            <stop offset="100%" stopColor="#0284C7" />
          </radialGradient>
        </defs>
        <circle cx="140" cy="102" r="88" fill="url(#evtBurstChamp)" stroke="#FFFFFF" strokeWidth="6" />
        <path d="M96 64 H184 L172 114 Q140 134 108 114 Z" fill="#FACC15" stroke="#B45309" strokeWidth="4" />
        <path d="M96 74 Q72 78 78 100 Q84 114 106 106" fill="none" stroke="#FACC15" strokeWidth="7" strokeLinecap="round" />
        <path d="M184 74 Q208 78 202 100 Q196 114 174 106" fill="none" stroke="#FACC15" strokeWidth="7" strokeLinecap="round" />
        <rect x="131" y="122" width="18" height="24" fill="#F59E0B" stroke="#B45309" strokeWidth="3" />
        <rect x="112" y="144" width="56" height="16" rx="6" fill="#334155" stroke="#FFFFFF" strokeWidth="3" />
        <text x="140" y="98" textAnchor="middle" fontSize="28" fontWeight="900" fill="#B45309">★</text>
      </svg>
    );
  }

  // 2. Lost Island / Go To Jail Tropical Cartoon Scene
  if (kind === 'GO_TO_JAIL') {
    return (
      <svg
        viewBox="0 0 280 200"
        className="w-56 sm:w-64 h-auto mx-auto drop-shadow-[0_12px_20px_rgba(15,23,42,0.35)]"
        role="img"
        aria-label={card.title}
      >
        <circle cx="140" cy="102" r="88" fill="#38BDF8" stroke="#FFFFFF" strokeWidth="6" />
        <path d="M58 134 Q140 118 222 134 Q206 178 140 186 Q74 178 58 134 Z" fill="#0284C7" />
        <ellipse cx="140" cy="136" rx="54" ry="20" fill="#FDE68A" stroke="#F59E0B" strokeWidth="3" />
        <path d="M136 132 Q122 92 146 58" fill="none" stroke="#92400E" strokeWidth="10" strokeLinecap="round" />
        <path d="M146 58 Q112 46 96 68 Q122 66 146 58 Z" fill="#66C61C" stroke="#15803D" strokeWidth="2.5" />
        <path d="M146 58 Q182 44 198 68 Q170 66 146 58 Z" fill="#84E635" stroke="#15803D" strokeWidth="2.5" />
        <path d="M146 58 Q144 26 172 34 Q158 48 146 58 Z" fill="#66C61C" stroke="#15803D" strokeWidth="2.5" />
        <circle cx="143" cy="64" r="5.5" fill="#78350F" />
        <circle cx="152" cy="66" r="5.5" fill="#78350F" />
        <circle cx="176" cy="142" r="14" fill="#FFFFFF" stroke="#EF4444" strokeWidth="6" strokeDasharray="11 11" />
      </svg>
    );
  }

  // 3. World Tour / Move Travel Cartoon Scene
  if (kind === 'MOVE_TO' || kind === 'GO_TO_WORLD_TOUR') {
    return (
      <svg
        viewBox="0 0 280 200"
        className="w-56 sm:w-64 h-auto mx-auto drop-shadow-[0_12px_20px_rgba(15,23,42,0.35)]"
        role="img"
        aria-label={card.title}
      >
        <circle cx="140" cy="102" r="88" fill="#7DD3FC" stroke="#FFFFFF" strokeWidth="6" />
        <ellipse cx="94" cy="138" rx="34" ry="16" fill="#FFFFFF" />
        <ellipse cx="184" cy="144" rx="38" ry="18" fill="#FFFFFF" />
        <path d="M68 142 Q115 112 152 94" fill="none" stroke="#F5B800" strokeWidth="8" strokeLinecap="round" />
        <path d="M74 150 Q120 120 156 102" fill="none" stroke="#E91E63" strokeWidth="6" strokeLinecap="round" />
        <g transform="translate(148,84) rotate(-22)">
          <ellipse cx="0" cy="0" rx="46" ry="14" fill="#FFFFFF" stroke="#0284C7" strokeWidth="3.2" />
          <polygon points="-8,-6 -26,-36 8,-8" fill="#29B6F6" stroke="#0284C7" strokeWidth="3" />
          <polygon points="-4,8 -22,36 12,8" fill="#29B6F6" stroke="#0284C7" strokeWidth="3" />
          <polygon points="-34,-6 -48,-24 -26,-6" fill="#E91E63" stroke="#9F1239" strokeWidth="2.8" />
          <path d="M22 -6 Q38 -4 40 2 Q32 6 22 4 Z" fill="#38BDF8" />
        </g>
      </svg>
    );
  }

  // 4. Penalty / Tax / Earthquake / Outage Alert Cartoon Scene
  if (kind === 'PAY_CASH' || kind === 'EARTHQUAKE' || kind === 'POWER_OUTAGE') {
    return (
      <svg
        viewBox="0 0 280 200"
        className="w-56 sm:w-64 h-auto mx-auto drop-shadow-[0_12px_20px_rgba(15,23,42,0.35)]"
        role="img"
        aria-label={card.title}
      >
        <circle cx="140" cy="102" r="88" fill="#FCA5A5" stroke="#FFFFFF" strokeWidth="6" />
        <rect x="96" y="48" width="88" height="106" rx="12" fill="#FFFBEB" stroke="#B45309" strokeWidth="3.5" />
        <rect x="112" y="66" width="56" height="10" rx="4" fill="#EF4444" />
        <rect x="112" y="86" width="56" height="7" rx="3.5" fill="#94A3B8" />
        <rect x="112" y="101" width="42" height="7" rx="3.5" fill="#94A3B8" />
        <g transform="translate(76,96)">
          <circle cx="0" cy="0" r="16" fill="#FACC15" stroke="#B45309" strokeWidth="3" />
          <text x="0" y="5" textAnchor="middle" fontSize="15" fontWeight="900" fill="#92400E">★</text>
        </g>
        <g transform="translate(202,82)">
          <circle cx="0" cy="0" r="15" fill="#FACC15" stroke="#B45309" strokeWidth="3" />
          <text x="0" y="5" textAnchor="middle" fontSize="14" fontWeight="900" fill="#92400E">★</text>
        </g>
      </svg>
    );
  }

  // 5. Default Treasure Chest / Cash Jackpot / Escape Card Cartoon Scene
  return (
    <svg
      viewBox="0 0 280 200"
      className="w-56 sm:w-64 h-auto mx-auto drop-shadow-[0_12px_20px_rgba(15,23,42,0.35)]"
      role="img"
      aria-label={card.title}
    >
      <defs>
        <radialGradient id="evtBurstGold" cx="50%" cy="50%" r="52%">
          <stop offset="0%" stopColor="#FEF9C3" />
          <stop offset="65%" stopColor="#FDE047" />
          <stop offset="100%" stopColor="#F59E0B" />
        </radialGradient>
      </defs>
      <circle cx="140" cy="102" r="88" fill="url(#evtBurstGold)" stroke="#FFFFFF" strokeWidth="6" />
      <g transform="translate(105,62) rotate(-16)">
        <rect x="0" y="0" width="66" height="36" rx="5" fill="#22C55E" stroke="#14532D" strokeWidth="3" />
        <circle cx="33" cy="18" r="9" fill="#BBF7D0" />
      </g>
      <g transform="translate(116,56) rotate(14)">
        <rect x="0" y="0" width="66" height="36" rx="5" fill="#4ADE80" stroke="#14532D" strokeWidth="3" />
        <circle cx="33" cy="18" r="9" fill="#DCFCE7" />
      </g>
      <rect x="88" y="96" width="104" height="58" rx="10" fill="#B45309" stroke="#78350F" strokeWidth="4" />
      <rect x="88" y="86" width="104" height="20" rx="8" fill="#F59E0B" stroke="#78350F" strokeWidth="3.5" />
      <circle cx="122" cy="92" r="11" fill="#FEF08A" stroke="#CA8A04" strokeWidth="2.5" />
      <circle cx="142" cy="88" r="13" fill="#FACC15" stroke="#CA8A04" strokeWidth="2.5" />
      <circle cx="162" cy="93" r="11" fill="#FEF08A" stroke="#CA8A04" strokeWidth="2.5" />
      <rect x="131" y="106" width="18" height="22" rx="4" fill="#FDE047" stroke="#78350F" strokeWidth="3" />
    </svg>
  );
};

export const LuckCardModal: React.FC<LuckCardModalProps> = ({
  card,
  isBot,
  trapFocus = true,
  onConfirm,
}) => {
  const dialogRef = useRef<HTMLDivElement>(null);
  useDialogFocusTrap(dialogRef, trapFocus);

  const isNegative =
    card.effect.type === 'PAY_CASH' ||
    card.effect.type === 'GO_TO_JAIL' ||
    card.effect.type === 'EARTHQUAKE' ||
    card.effect.type === 'POWER_OUTAGE';

  return (
    <div
      data-testid="luck-card-modal"
      className="bt-luck-card-overlay fixed inset-0 z-35 flex flex-col items-center justify-center p-3 sm:p-4 bg-slate-950/55 pointer-events-auto overflow-y-auto overscroll-contain"
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="luck-card-title"
        className="bt-luck-card-dialog w-full max-w-lg shrink-0 my-auto flex flex-col items-center text-center animate-pop-in"
      >
        <div className="bt-luck-card-badge mb-2 px-4 py-1 rounded-full bg-white/95 border-2 border-[#F5B800] shadow-md">
          <span className="font-display text-xs font-black uppercase tracking-widest text-[#B45309]">
            ★ Sự Kiện Cơ Hội ★
          </span>
        </div>

        <div className="bt-luck-card-art relative animate-float-gentle">
          <EventCartoonIllustration card={card} />
        </div>

        <div className="bt-luck-card-body relative -mt-4 w-full max-w-md px-3">
          <div
            aria-hidden="true"
            className="hidden sm:block absolute -left-2 top-4 h-12 w-8 -z-10 rounded-l-md bg-[#F3D088] border-2 border-[#B45309]"
            style={{ clipPath: 'polygon(0 0, 100% 0, 100% 100%, 0 100%, 30% 50%)' }}
          />
          <div
            aria-hidden="true"
            className="hidden sm:block absolute -right-2 top-4 h-12 w-8 -z-10 rounded-r-md bg-[#F3D088] border-2 border-[#B45309]"
            style={{ clipPath: 'polygon(0 0, 100% 0, 70% 50%, 100% 100%, 0 100%)' }}
          />

          <div
            className="bt-luck-card-box rounded-2xl px-6 py-4 border-[3px] border-[#D97706] shadow-[0_14px_30px_rgba(15,23,42,0.42),inset_0_2px_0_#FFFFFF]"
            style={{
              background: 'linear-gradient(180deg, #FFFDF2 0%, #FDE68A 100%)',
            }}
          >
            <h3
              id="luck-card-title"
              className={`font-display text-xl sm:text-2xl font-black uppercase tracking-wide leading-tight ${
                isNegative ? 'text-[#DC2626]' : 'text-[#EA580C]'
              }`}
              style={{
                textShadow: '0 1px 0 rgba(255,255,255,0.9)',
              }}
            >
              {card.title}
            </h3>
            <p className="mt-1.5 text-sm sm:text-[15px] font-bold text-[#451A03] leading-snug">
              {card.description}
            </p>
          </div>
        </div>

        <div className="bt-luck-card-cta mt-4 w-full max-w-xs space-y-2">
          {isBot ? (
            <div className="px-5 py-2.5 rounded-full bg-slate-900/75 border-2 border-white/60 text-xs font-extrabold text-white shadow-lg">
              ⏳ Đang thực hiện thẻ sự kiện...
            </div>
          ) : (
            <button
              type="button"
              data-testid="luck-card-confirm-btn"
              onClick={onConfirm}
              className="bt-btn-green w-full py-3 px-8 rounded-full font-black text-base uppercase tracking-wider cursor-pointer whitespace-normal sm:whitespace-nowrap"
            >
              Tiếp Tục Ngay
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

/* ==========================================
 * 4. PROPERTY PORTFOLIO & 100% AUTO-SALE DEBT MODAL
 * ========================================== */
interface AssetManagementModalProps {
  player: PlayerState;
  players?: PlayerState[];
  properties: Record<number, PropertyState>;
  boardModifiers: MatchBoardModifiers;
  matchMode?: MatchMode;
  pendingDebt: PendingDebt | null;
  trapFocus?: boolean;
  onExecuteDebtSaleAndPay: (tileIndicesToSell: number[]) => void;
  onDeclareBankruptcy: () => void;
  onClose: () => void;
}

export const AssetManagementModal: React.FC<AssetManagementModalProps> = ({
  player,
  players = [],
  properties,
  boardModifiers,
  matchMode = 'FFA',
  pendingDebt,
  trapFocus = true,
  onExecuteDebtSaleAndPay,
  onDeclareBankruptcy,
  onClose,
}) => {
  const dialogRef = useRef<HTMLDivElement>(null);
  useDialogFocusTrap(dialogRef, trapFocus);

  const [selectedTiles, setSelectedTiles] = useState<number[]>([]);

  useEffect(() => {
    setSelectedTiles([]);
  }, [pendingDebt?.amount, pendingDebt?.reason, player.id]);

  const owned = useMemo(
    () =>
      Object.values(properties)
        .filter((p) => p.ownerId === player.id)
        .sort((a, b) => a.tileIndex - b.tileIndex),
    [player.id, properties]
  );

  const cashNeededFromSales = pendingDebt
    ? Math.max(0, pendingDebt.amount - Math.max(0, player.cash))
    : 0;

  const autoPlan = useMemo(
    () =>
      pendingDebt
        ? computeOptimalAutoSale(
            player.id,
            cashNeededFromSales,
            properties,
            boardModifiers,
            players,
            matchMode
          )
        : null,
    [boardModifiers, cashNeededFromSales, matchMode, pendingDebt, player.id, players, properties]
  );

  const selectedRefund = useMemo(
    () =>
      selectedTiles.reduce((sum, idx) => {
        const pr = properties[idx];
        return sum + calculatePropertyInvestedValue(idx, pr?.level ?? 0);
      }, 0),
    [properties, selectedTiles]
  );

  const projectedCash = player.cash + selectedRefund;
  const shortfall = pendingDebt ? Math.max(0, pendingDebt.amount - projectedCash) : 0;
  const surplus = pendingDebt ? Math.max(0, projectedCash - pendingDebt.amount) : 0;
  const canConfirmSale = Boolean(pendingDebt && shortfall === 0);

  const toggleSelectTile = (tileIndex: number) => {
    setSelectedTiles((prev) =>
      prev.includes(tileIndex)
        ? prev.filter((i) => i !== tileIndex)
        : [...prev, tileIndex]
    );
  };

  const handleApplyAutoSale = () => {
    if (!autoPlan) return;
    setSelectedTiles(autoPlan.tileIndicesToSell);
  };

  return (
    <div
      data-testid="asset-management-modal"
      className="fixed inset-0 z-40 flex items-center justify-center p-3 sm:p-4 bg-slate-950/42 pointer-events-auto"
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="asset-modal-title"
        className="w-full max-w-2xl bt-casual-modal rounded-3xl overflow-hidden animate-pop-in flex flex-col max-h-[calc(100dvh-1.5rem)]"
      >
        <div
          className={`shrink-0 px-5 sm:px-6 py-3.5 sm:py-4 flex items-center justify-between gap-2 ${
            pendingDebt ? 'bt-header-pink' : 'bt-header-sky'
          }`}
        >
          <div>
            <h3
              id="asset-modal-title"
              className="font-display text-lg sm:text-xl font-black uppercase text-white leading-tight"
            >
              {pendingDebt
                ? 'Chọn Thành Phố Để Bán Trả Nợ (Hoàn 100%)'
                : 'Danh Mục Bất Động Sản'}
            </h3>
            <p className="text-xs font-bold text-white/90 mt-0.5">
              Tiền mặt hiện có của {player.name}:{' '}
              <span className="font-mono-num font-black text-[#FEF08A]">
                {formatBusinessTourSpaced(player.cash)}
              </span>
            </p>
          </div>
          {!pendingDebt && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Đóng bảng tài sản"
              className="icon-hit-target h-8 w-8 rounded-full bg-white/20 hover:bg-white/35 flex items-center justify-center text-white font-black cursor-pointer shrink-0"
            >
              ✕
            </button>
          )}
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto slim-scroll flex flex-col">
          {/* Debt Status Bar */}
          {pendingDebt && (
            <div className="shrink-0 px-5 sm:px-6 py-3 bg-rose-50 border-b border-rose-200 space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <div className="text-rose-950 font-semibold">
                  <strong className="font-black">{pendingDebt.reason}:</strong> Cần trả{' '}
                  <span className="font-mono-num font-black text-rose-600">
                    {formatBusinessTourSpaced(pendingDebt.amount)}
                  </span>
                </div>
                <div className="flex items-center gap-3 font-black">
                  {shortfall > 0 ? (
                    <span className="text-rose-600">
                      Còn thiếu: <span className="font-mono-num">{formatBusinessTourSpaced(shortfall)}</span>
                    </span>
                  ) : (
                    <span className="text-[#16A34A]">
                      Tiền dư sau trả nợ:{' '}
                      <span className="font-mono-num">{formatBusinessTourSpaced(surplus)}</span>
                    </span>
                  )}
                </div>
              </div>

              {autoPlan && !autoPlan.sufficient && (
                <div className="px-3 py-2 rounded-xl bg-rose-100 border border-rose-300 text-xs font-extrabold text-rose-800">
                  Tổng giá trị toàn bộ tài sản ({formatBusinessTourSpaced(autoPlan.totalRefund)}) vẫn
                  không đủ thanh toán khoản nợ này — bạn cần tuyên bố Phá Sản!
                </div>
              )}

              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  {autoPlan?.sufficient && (
                    <button
                      type="button"
                      onClick={handleApplyAutoSale}
                      className="bt-btn-cyan px-3.5 py-1.5 rounded-xl text-xs font-black uppercase cursor-pointer whitespace-nowrap"
                    >
                      Bán Tự Động Tối Ưu
                    </button>
                  )}
                  <button
                    type="button"
                    disabled={!canConfirmSale}
                    onClick={() => canConfirmSale && onExecuteDebtSaleAndPay(selectedTiles)}
                    className="bt-btn-green px-4 py-1.5 rounded-xl disabled:opacity-40 text-xs font-black uppercase cursor-pointer whitespace-nowrap"
                  >
                    Xác Nhận Bán &amp; Thanh Toán
                  </button>
                </div>
                <button
                  type="button"
                  onClick={onDeclareBankruptcy}
                  className="id-btn-crimson px-3.5 py-1.5 rounded-xl text-xs font-black uppercase cursor-pointer whitespace-nowrap"
                >
                  Phá Sản
                </button>
              </div>
            </div>
          )}

          <div className="id-subheader-strip shrink-0 px-5 sm:px-6 py-2 flex items-center justify-between text-xs font-extrabold uppercase">
            <span>Bất Động Sản Sở Hữu ({owned.length})</span>
            <span>{pendingDebt ? 'Giá Trị Hoàn 100%' : 'Giá Trị / Phí Thuê'}</span>
          </div>

          <div className="p-4 sm:p-5 space-y-2">
            {owned.length === 0 ? (
              <div className="text-center py-10 text-sm font-bold text-slate-400">
                Bạn chưa sở hữu bất động sản nào trên bàn cờ.
              </div>
            ) : (
              owned.map((prop) => {
                const tile = BOARD_TILES[prop.tileIndex];
                const isSelected = selectedTiles.includes(prop.tileIndex);
                const investedVal = calculatePropertyInvestedValue(prop.tileIndex, prop.level);
                const currentRent = calculateRent(
                  prop.tileIndex,
                  properties,
                  boardModifiers,
                  players,
                  matchMode
                );
                const isMono =
                  tile.group &&
                  ownsFullColorGroup(player.id, tile.group, properties, players, matchMode);

              const tags: string[] = [];
              if (tile.kind === TileKind.RESORT) tags.push('Khu nghỉ dưỡng');
              if (isMono) tags.push('Độc quyền ×2');
              if (prop.level >= 4) tags.push('Khách sạn ★');
              if (boardModifiers.festivalTileIndices.includes(prop.tileIndex)) {
                tags.push('🎉 Lễ Hội ×2');
              }
              if (boardModifiers.championshipTileIndex === prop.tileIndex) {
                tags.push(`🏆 Cúp ×${boardModifiers.championshipMultiplier}`);
              }
              if (boardModifiers.shieldedTileIndices?.includes(prop.tileIndex)) {
                tags.push('🛡️ Khiên Bảo Hộ');
              }
              if (boardModifiers.outageTileIndices?.includes(prop.tileIndex)) {
                tags.push('⚡ Mất điện');
              }

              const rowBody = (
                <div className="flex items-center justify-between gap-3 w-full">
                  <div className="flex items-center gap-3 min-w-0">
                    {pendingDebt && (
                      <span
                        className={`h-5 w-5 rounded-md border-2 flex items-center justify-center text-xs font-black shrink-0 ${
                          isSelected
                            ? 'bg-[#E91E63] border-[#E91E63] text-white'
                            : 'bg-white border-slate-300 text-transparent'
                        }`}
                      >
                        ✓
                      </span>
                    )}
                    <div
                      className="h-9 w-3.5 rounded-md shrink-0 border border-white shadow-xs"
                      style={{
                        backgroundColor:
                          tile.kind === TileKind.RESORT
                            ? '#0EA5E9'
                            : tile.groupColor || player.color,
                      }}
                    />
                    <div className="min-w-0 text-left">
                      <div className="flex flex-wrap items-baseline gap-1.5">
                        <span className="font-display font-black text-slate-900 text-sm sm:text-base leading-tight">
                          {tile.name}
                        </span>
                        {tags.length > 0 && (
                          <span className="text-[11px] font-extrabold text-[#16A34A]">
                            · {tags.join(' · ')}
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-slate-600 tabular-nums mt-0.5">
                        {tile.kind === TileKind.PROPERTY
                          ? prop.level === 0
                            ? 'Đất khởi điểm'
                            : prop.level === 4
                              ? 'Khách sạn Cấp 4 (★)'
                              : `Nhà Cấp ${prop.level}`
                          : 'Khu nghỉ dưỡng biển đảo'}{' '}
                        · Thuê: {formatBusinessTourCompact(currentRent)}
                      </div>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <div className="font-mono-num text-sm font-black text-sky-900">
                      {formatBusinessTourCompact(investedVal)}
                    </div>
                    {pendingDebt && (
                      <div className="text-[10px] font-bold text-slate-500">Hoàn 100%</div>
                    )}
                  </div>
                </div>
              );

              return pendingDebt ? (
                <button
                  key={prop.tileIndex}
                  type="button"
                  onClick={() => toggleSelectTile(prop.tileIndex)}
                  className={`w-full p-3 rounded-2xl border-2 transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-rose-50 border-[#E91E63] shadow-xs'
                      : 'bg-sky-50/60 border-sky-200 hover:border-sky-400'
                  }`}
                >
                  {rowBody}
                </button>
              ) : (
                <div
                  key={prop.tileIndex}
                  className="p-3 rounded-2xl bg-sky-50/60 border border-sky-200"
                >
                  {rowBody}
                </div>
              );
            })
          )}
          </div>
        </div>

        {!pendingDebt && (
          <div className="shrink-0 px-5 sm:px-6 py-3 bg-sky-50 border-t border-sky-200 flex justify-end">
            <button
              type="button"
              onClick={onClose}
              className="bt-btn-green px-6 py-2 rounded-2xl text-sm font-black uppercase cursor-pointer whitespace-nowrap"
            >
              Đóng
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

/* ==========================================
 * 5. PAUSE MENU & VICTORY MODAL
 * ========================================== */
export const PauseModal: React.FC<{
  onlineRoomCode?: string | null;
  isOnlineMatch?: boolean;
  copiedInviteToast?: boolean;
  trapFocus?: boolean;
  onCopyInviteLink?: () => void;
  onResume: () => void;
  onOpenRulebook: () => void;
  onResetCamera: () => void;
  onRestartToTitle: () => void;
}> = ({
  onlineRoomCode,
  isOnlineMatch = false,
  copiedInviteToast = false,
  trapFocus = true,
  onCopyInviteLink,
  onResume,
  onOpenRulebook,
  onResetCamera,
  onRestartToTitle,
}) => {
  const dialogRef = useRef<HTMLDivElement>(null);
  useDialogFocusTrap(dialogRef, trapFocus);
  const showOnlineNote = Boolean(isOnlineMatch || onlineRoomCode);

  return (
    <div className="fixed inset-0 z-45 flex items-center justify-center p-3 sm:p-4 bg-slate-950/42 pointer-events-auto">
      <div
        ref={dialogRef}
        tabIndex={-1}
        data-testid="pause-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="pause-modal-title"
        className="w-full max-w-sm max-h-[calc(100dvh-1.5rem)] flex flex-col bt-casual-modal rounded-3xl overflow-hidden animate-pop-in text-center"
      >
        <div className="shrink-0 bt-header-sky px-6 py-4">
          <h2
            id="pause-modal-title"
            className="font-display text-xl font-black uppercase tracking-wide text-white"
          >
            {onlineRoomCode ? `Phòng Online ${onlineRoomCode}` : 'Tạm Dừng Ván Đấu'}
          </h2>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto slim-scroll p-5 sm:p-6 space-y-3">
          {showOnlineNote && (
            <p className="px-3 py-2 rounded-xl bg-sky-50 border border-sky-200 text-[11px] font-bold text-sky-900 leading-snug">
              Trận Online vẫn tiếp tục đồng hồ trực tiếp trong khi bạn mở menu này
            </p>
          )}
          <button
            type="button"
            onClick={onResume}
            className="bt-btn-green w-full py-2.5 rounded-2xl font-black text-sm sm:text-base uppercase tracking-wide cursor-pointer whitespace-nowrap"
          >
            Tiếp Tục Chơi
          </button>
          {onlineRoomCode && onCopyInviteLink && (
            <button
              type="button"
              onClick={onCopyInviteLink}
              className="bt-btn-gold text-slate-950 w-full py-2.5 rounded-2xl font-extrabold text-sm sm:text-base cursor-pointer whitespace-nowrap"
            >
              {copiedInviteToast ? '✓ Đã Chép Link Mời!' : '📋 Copy Link Mời Bạn Bè'}
            </button>
          )}
          <button
            type="button"
            onClick={onOpenRulebook}
            className="bt-btn-white w-full py-2.5 rounded-2xl font-extrabold text-sm sm:text-base cursor-pointer whitespace-nowrap"
          >
            Sổ Tay Luật Chơi
          </button>
          <button
            type="button"
            onClick={onResetCamera}
            className="bt-btn-cyan w-full py-2.5 rounded-2xl font-extrabold text-sm sm:text-base cursor-pointer whitespace-nowrap"
          >
            Đặt Lại Góc Nhìn 3D
          </button>
          <button
            type="button"
            onClick={onRestartToTitle}
            className="id-btn-crimson w-full py-2.5 rounded-2xl font-extrabold text-sm sm:text-base cursor-pointer whitespace-nowrap"
          >
            {onlineRoomCode ? 'Rời Phòng Online' : 'Sảnh Chờ Mới'}
          </button>
        </div>
      </div>
    </div>
  );
};

const ConfettiOverlay: React.FC<{ graphicsQualityTier?: GraphicsQualityTier }> = ({
  graphicsQualityTier = 'medium',
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const syncSize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    syncSize();
    window.addEventListener('resize', syncSize);

    const mediaQuery =
      typeof window.matchMedia === 'function'
        ? window.matchMedia('(prefers-reduced-motion: reduce)')
        : null;

    let raf = 0;
    let startMs = 0;
    const MAX_DURATION_MS = 3200;
    const FADE_START_MS = 2400;
    const colors = ['#F5B800', '#66C61C', '#E91E63', '#29B6F6', '#FACC15', '#4ADE80'];
    const pieces = Array.from({ length: 72 }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * -canvas.height,
      w: 8 + Math.random() * 6,
      h: 12 + Math.random() * 8,
      vy: 2.4 + Math.random() * 3.4,
      vx: (Math.random() - 0.5) * 2.2,
      rot: Math.random() * Math.PI * 2,
      vRot: (Math.random() - 0.5) * 0.14,
      color: colors[Math.floor(Math.random() * colors.length)],
    }));

    const draw = (nowMs: number) => {
      if (!startMs) startMs = nowMs;
      const elapsedMs = nowMs - startMs;
      if (elapsedMs >= MAX_DURATION_MS) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        raf = 0;
        return;
      }

      const alpha =
        elapsedMs >= FADE_START_MS
          ? Math.max(0, 1 - (elapsedMs - FADE_START_MS) / (MAX_DURATION_MS - FADE_START_MS))
          : 1;

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.save();
      ctx.globalAlpha = alpha;
      for (const p of pieces) {
        p.x += p.vx;
        p.y += p.vy;
        p.rot += p.vRot;
        if (p.y > canvas.height + 20) {
          p.y = -20;
          p.x = Math.random() * canvas.width;
        }
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.restore();
      }
      ctx.restore();
      raf = requestAnimationFrame(draw);
    };

    const startOrStopForMotion = () => {
      cancelAnimationFrame(raf);
      raf = 0;
      startMs = 0;
      if (graphicsQualityTier === 'low' || mediaQuery?.matches) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      } else {
        raf = requestAnimationFrame(draw);
      }
    };

    startOrStopForMotion();
    mediaQuery?.addEventListener?.('change', startOrStopForMotion);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', syncSize);
      mediaQuery?.removeEventListener?.('change', startOrStopForMotion);
    };
  }, [graphicsQualityTier]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      className="fixed inset-0 pointer-events-none z-35"
    />
  );
};

export const VictoryModal: React.FC<{
  winner: PlayerState;
  victoryLabel?: string;
  victoryCondition?: VictoryConditionKind;
  matchMode?: MatchMode;
  winningTeamId?: TeamId;
  effectiveNetWorthByPlayerId?: Record<number, number>;
  effectiveCashByPlayerId?: Record<number, number>;
  players: PlayerState[];
  properties: Record<number, PropertyState>;
  turnCount: number;
  isOnlineMatch?: boolean;
  isOnlineHost?: boolean;
  graphicsQualityTier?: GraphicsQualityTier;
  trapFocus?: boolean;
  onlineChatNode?: React.ReactNode;
  onReturnToOnlineLobby?: () => void;
  onPlayAgain: () => void;
}> = ({
  winner,
  victoryLabel,
  victoryCondition,
  matchMode = 'FFA',
  winningTeamId,
  effectiveNetWorthByPlayerId,
  effectiveCashByPlayerId,
  players,
  properties,
  turnCount,
  isOnlineMatch = false,
  isOnlineHost = false,
  graphicsQualityTier = 'medium',
  trapFocus = true,
  onlineChatNode,
  onReturnToOnlineLobby,
  onPlayAgain,
}) => {
  const dialogRef = useRef<HTMLDivElement>(null);
  useDialogFocusTrap(dialogRef, trapFocus);

  const worthOf = (p: PlayerState): number =>
    effectiveNetWorthByPlayerId && p.id in effectiveNetWorthByPlayerId
      ? effectiveNetWorthByPlayerId[p.id]
      : calculateNetWorth(p, properties);

  const ranked = rankPlayersForVictory(
    players,
    properties,
    winner.id,
    matchMode,
    winningTeamId,
    effectiveNetWorthByPlayerId,
    effectiveCashByPlayerId
  );

  const isTeamVictory = matchMode === 'TEAMS_2V2' && winningTeamId !== undefined;
  const teamATotal = isTeamVictory
    ? players
        .filter((p) => p.teamId === 0)
        .reduce((acc, p) => acc + worthOf(p), 0)
    : 0;
  const teamBTotal = isTeamVictory
    ? players
        .filter((p) => p.teamId === 1)
        .reduce((acc, p) => acc + worthOf(p), 0)
    : 0;

  return (
    <div
      data-testid="victory-modal"
      className="fixed inset-0 z-30 flex items-center justify-center p-3 sm:p-4 bg-slate-950/34 pointer-events-auto"
    >
      <ConfettiOverlay graphicsQualityTier={graphicsQualityTier} />
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="victory-modal-title"
        className="relative z-40 w-full max-w-lg max-h-[calc(100dvh-1.5rem)] flex flex-col bt-casual-modal rounded-3xl overflow-hidden animate-pop-in"
      >
        <div className="shrink-0 bt-header-sky px-6 py-4 sm:py-5 text-center">
          <div className="text-xs font-extrabold uppercase tracking-wider text-white/90">
            Chung Cuộc · {turnCount} Lượt Đấu
            {victoryCondition === 'TIME_LIMIT' ? ' · Hết giờ (20:00)' : ''}
          </div>
          <h2
            id="victory-modal-title"
            className="font-display text-2xl sm:text-3xl font-black uppercase text-[#FEF08A] mt-1"
          >
            {isTeamVictory
              ? `🏆 Đội ${winningTeamId === 0 ? 'A (Xanh)' : 'B (Đỏ)'} Chiến Thắng!`
              : `🏆 ${winner.name} Chiến Thắng!`}
          </h2>
          {victoryCondition === 'TIME_LIMIT' && (
            <div className="mt-1 inline-block px-3 py-0.5 rounded-full bg-white/20 text-[11px] font-black text-white">
              Hết giờ (20:00) — Tổng Tài Sản
            </div>
          )}
          {victoryLabel && (
            <p className="mt-1 text-xs font-extrabold text-white">{victoryLabel}</p>
          )}
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto slim-scroll p-5 sm:p-6 space-y-4">
          {isTeamVictory && (
            <div className="grid grid-cols-2 gap-2">
              <div
                className={`p-2.5 rounded-2xl border-2 text-center ${
                  winningTeamId === 0
                    ? 'bg-sky-50 border-sky-400 ring-2 ring-sky-200'
                    : 'bg-slate-50 border-slate-200'
                }`}
              >
                <div className="text-[11px] font-black uppercase text-sky-800">
                  Đội A (Xanh) {winningTeamId === 0 ? '🏆' : ''}
                </div>
                <div className="font-mono-num text-sm sm:text-base font-black text-slate-900">
                  {formatBusinessTourSpaced(teamATotal)}
                </div>
              </div>
              <div
                className={`p-2.5 rounded-2xl border-2 text-center ${
                  winningTeamId === 1
                    ? 'bg-rose-50 border-rose-400 ring-2 ring-rose-200'
                    : 'bg-slate-50 border-slate-200'
                }`}
              >
                <div className="text-[11px] font-black uppercase text-rose-800">
                  Đội B (Đỏ) {winningTeamId === 1 ? '🏆' : ''}
                </div>
                <div className="font-mono-num text-sm sm:text-base font-black text-slate-900">
                  {formatBusinessTourSpaced(teamBTotal)}
                </div>
              </div>
            </div>
          )}

          <div className="rounded-2xl bg-sky-50 border border-sky-200 overflow-hidden">
            <div className="id-subheader-strip px-4 py-2 grid grid-cols-[46px_minmax(0,1fr)_auto] gap-2 text-xs font-black uppercase">
              <span>Hạng</span>
              <span>Tỷ Phú</span>
              <span className="text-right">Tổng Tài Sản</span>
            </div>
            <div className="divide-y divide-sky-100">
              {ranked.map((pl, i) => {
                const worth = worthOf(pl);
                const isChamp = isTeamVictory
                  ? !pl.bankrupt && pl.teamId === winningTeamId
                  : pl.id === winner.id;
                return (
                  <div
                    key={pl.id}
                    data-testid={`victory-rank-row-${i + 1}`}
                    data-player-id={pl.id}
                    className={`px-4 py-2.5 grid grid-cols-[46px_minmax(0,1fr)_auto] gap-2 items-center text-sm ${
                      isChamp ? 'bg-[#F5B800]/22' : ''
                    }`}
                  >
                    <span className="font-mono-num font-black text-sky-800">
                      #{i + 1}
                    </span>
                    <div className="flex items-center gap-2.5 min-w-0">
                      <PlayerAvatar3D
                        archetype={pl.tokenType}
                        mood={
                          isChamp
                            ? 'celebrating'
                            : pl.bankrupt
                              ? 'bankrupt'
                              : 'idle'
                        }
                        phaseSeed={pl.id}
                        size="xs"
                      />
                      <div className="min-w-0 flex items-center gap-1.5 flex-wrap">
                        <span className="font-extrabold text-slate-900 truncate">
                          {pl.name}
                        </span>
                        {matchMode === 'TEAMS_2V2' && pl.teamId !== undefined && (
                          <span
                            className={`shrink-0 px-1.5 py-0.5 rounded-full text-[9px] font-black uppercase ${
                              pl.teamId === 0
                                ? 'bg-sky-100 text-sky-800 border border-sky-300'
                                : 'bg-rose-100 text-rose-800 border border-rose-300'
                            }`}
                          >
                            {pl.teamId === 0 ? 'Đội A' : 'Đội B'}
                          </span>
                        )}
                        {isChamp && (
                          <span className="shrink-0 px-1.5 py-0.5 rounded-full bg-amber-400/90 text-[10px] font-black uppercase tracking-wide text-amber-950">
                            Vô địch
                          </span>
                        )}
                      </div>
                    </div>
                    <span
                      className={`text-right font-black whitespace-nowrap ${
                        pl.bankrupt
                          ? 'font-display text-rose-600 text-xs uppercase tracking-wide'
                          : 'font-mono-num text-[#16A34A]'
                      }`}
                    >
                      {pl.bankrupt ? 'PHÁ SẢN' : formatBusinessTourSpaced(worth)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {isOnlineMatch && onlineChatNode && (
            <div className="pt-1">
              {onlineChatNode}
            </div>
          )}
        </div>

        <div className="shrink-0 px-5 sm:px-6 py-3.5 bg-sky-50/95 border-t border-sky-200">
          {isOnlineMatch ? (
            <div className="space-y-2">
              {isOnlineHost && onReturnToOnlineLobby ? (
                <button
                  type="button"
                  data-start="true"
                  onClick={onReturnToOnlineLobby}
                  className="bt-btn-green w-full py-3 rounded-full font-black text-base sm:text-lg uppercase tracking-wider cursor-pointer whitespace-nowrap"
                >
                  🔄 Về Sảnh Phòng Chơi Tiếp
                </button>
              ) : (
                <div className="px-4 py-2 rounded-full bg-sky-100 border border-sky-200 text-xs font-extrabold text-sky-900 text-center">
                  ⏳ Đang chờ Chủ phòng mở ván mới...
                </div>
              )}
              <button
                type="button"
                onClick={onPlayAgain}
                className="id-btn-crimson w-full py-2.5 rounded-full font-extrabold text-sm uppercase tracking-wide cursor-pointer whitespace-nowrap"
              >
                Rời Phòng
              </button>
            </div>
          ) : (
            <button
              type="button"
              data-start="true"
              onClick={onPlayAgain}
              className="bt-btn-green w-full py-3 rounded-full font-black text-base sm:text-lg uppercase tracking-wider cursor-pointer whitespace-nowrap"
            >
              Chơi Ván Mới
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
