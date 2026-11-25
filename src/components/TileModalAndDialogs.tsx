import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  BookOpen,
  Check,
  Compass,
  Copy,
  Crosshair,
  Download,
  Hourglass,
  Link2,
  LogOut,
  Play,
  RotateCcw,
  Shield,
  Sparkles,
  Trophy,
  X,
  Zap,
} from 'lucide-react';
import { BOARD_TILES, COLOR_GROUP_META } from '../game/boardData';
import { PostMatchAward, SeriesStandingEntry, TilePingIntent } from '../game/onlineTypes';
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
import { resolveDeedGroupPalette } from '../three/textures';
import { waitForGameFonts } from '../utils/fontLoader';
import {
  copyVictoryCardToClipboard,
  downloadVictoryCardPng,
  renderVictoryCardCanvas,
  type VictoryCardExportData,
} from '../utils/victoryCardExport';
import { CityLandmarkBadge } from './CityLandmarkBadge';
import { BuildingLevelVisual, GroupProgressDots } from './GameUiPrimitives';
import { PlayerAvatar3D } from './PlayerAvatar3D';

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
  canPingTile?: boolean;
  pingCooldownUntil?: number;
  onPingTile?: (tileIndex: number, intent: TilePingIntent) => void;
  onClose: () => void;
}

export const TileInspectorCard: React.FC<TileInspectorProps> = ({
  tileIndex,
  players,
  properties,
  boardModifiers,
  matchMode = 'FFA',
  canPingTile = false,
  pingCooldownUntil = 0,
  onPingTile,
  onClose,
}) => {
  const [pingNowMs, setPingNowMs] = useState<number>(() => Date.now());

  useEffect(() => {
    const now = Date.now();
    setPingNowMs(now);
    if (!pingCooldownUntil || pingCooldownUntil <= now) return;
    const interval = window.setInterval(() => {
      const current = Date.now();
      setPingNowMs(current);
      if (current >= pingCooldownUntil) {
        window.clearInterval(interval);
      }
    }, 250);
    const expiryTimer = window.setTimeout(() => {
      setPingNowMs(Date.now());
      window.clearInterval(interval);
    }, Math.max(0, pingCooldownUntil - now) + 20);
    return () => {
      window.clearInterval(interval);
      window.clearTimeout(expiryTimer);
    };
  }, [pingCooldownUntil]);

  const pingCooldownSecondsLeft =
    pingCooldownUntil > pingNowMs
      ? Math.ceil((pingCooldownUntil - pingNowMs) / 1000)
      : 0;
  const isOnPingCooldown = pingCooldownSecondsLeft > 0;
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
    statusNotes.push('Khu nghỉ dưỡng · Miễn mua lại');
  } else if (prop && prop.level >= 4) {
    statusNotes.push('Khách sạn ★ (Miễn mua lại & Động đất)');
  }
  if (isShielded) statusNotes.push('Khiên Bảo Hộ (Chặn mua lại & 1 đòn phá hoại)');
  if (isOutage) statusNotes.push('Đang mất điện (Thuê 0K lượt ghé tới)');
  if (hasColorMono) statusNotes.push('Độc quyền bộ màu (×2)');
  if (isFestival) statusNotes.push('Lễ Hội (×2)');
  if (isCup) statusNotes.push(`Cúp Quốc Gia (×${cupMult})`);

  const headerPal =
    tile.kind === TileKind.PROPERTY
      ? resolveDeedGroupPalette(tile.group, tile.groupColor)
      : {
          topHex: tile.kind === TileKind.RESORT ? '#0284C7' : '#1F2B3D',
          bottomHex: tile.kind === TileKind.RESORT ? '#0369A1' : '#141C29',
        };

  return (
    <div
      data-testid="tile-inspector-card"
      role="region"
      aria-label={`Thông tin ${tile.name}`}
      className="fixed left-3 sm:left-4 top-1/2 -translate-y-1/2 z-25 w-[min(320px,calc(100vw-1.5rem))] max-h-[calc(100dvh-1.5rem)] flex flex-col bt-casual-modal rounded-2xl overflow-hidden animate-pop-in pointer-events-auto"
    >
      <div
        className="shrink-0 px-4 py-3 flex items-center justify-between gap-2.5 text-white border-b border-black/15"
        style={{
          background: `linear-gradient(180deg, ${
            owner?.color || headerPal.topHex
          } 0%, ${owner?.color || headerPal.bottomHex} 100%)`,
          textShadow: '0 1px 2px rgba(15, 23, 42, 0.4)',
        }}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <CityLandmarkBadge tileIndex={tileIndex} size={42} />
          <div className="min-w-0">
            {tile.groupLabel && (
              <div className="text-[10px] font-extrabold uppercase tracking-wider text-white/90">
                Cụm {tile.groupLabel}
              </div>
            )}
            {tile.kind === TileKind.RESORT && (
              <div className="text-[10px] font-extrabold uppercase tracking-wider text-amber-200">
                Khu Nghỉ Dưỡng Đảo / Vịnh
              </div>
            )}
            <h3 className="font-display text-lg font-black uppercase leading-snug text-white truncate">
              {tile.name}
            </h3>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Đóng thông tin ô đất"
          className="icon-hit-target h-7 w-7 rounded-full bg-black/25 hover:bg-black/40 flex items-center justify-center text-white cursor-pointer shrink-0"
        >
          <X className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto slim-scroll p-3.5 space-y-3 text-sm text-[#141c2b]">
        <p className="text-xs text-[#525e73] leading-relaxed">{tile.description}</p>

        {statusNotes.length > 0 && (
          <div className="px-2.5 py-1.5 rounded-lg bg-[#efece4] border border-[#dcd5c6] text-[11px] font-bold text-[#141c2b] leading-snug">
            {statusNotes.join(' · ')}
          </div>
        )}

        {prop && (
          <div className="flex items-center justify-between py-2 border-y border-[#e2dcd0] text-xs">
            <div>
              <span className="text-[#525e73] font-medium">Giá gốc: </span>
              <span className="font-mono-num font-black text-[#141c2b]">
                {formatBusinessTourCompact(tile.price || 0)}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-[#525e73] font-medium">Chủ:</span>
              {owner ? (
                <span className="font-extrabold text-[#141c2b] flex items-center gap-1.5">
                  <PlayerAvatar3D
                    archetype={owner.tokenType}
                    phaseSeed={owner.id}
                    size="xs"
                  />
                  {owner.name}
                </span>
              ) : (
                <span className="font-extrabold text-emerald-700">Chưa có chủ</span>
              )}
            </div>
          </div>
        )}

        {tile.kind === TileKind.PROPERTY && tile.rents && (
          <div className="rounded-xl bg-[#f3efe6] border border-[#dad3c4] overflow-hidden text-xs">
            <div className="id-subheader-strip px-3 py-1.5 font-extrabold text-[10.5px] uppercase tracking-wide flex items-center justify-between">
              <span>Bảng Phí Thuê</span>
              {totalPropertyMult > 1 && (
                <span className="text-emerald-700">×{totalPropertyMult} Hệ Số</span>
              )}
            </div>
            <div className="p-2 space-y-0.5 bg-white/70">
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
                      ? 'bg-amber-100/90 border border-amber-300 text-[#141c2b] font-black'
                      : 'text-[#475569] font-medium'
                  }`}
                >
                  <span>{row.label}</span>
                  <span className="font-mono-num font-bold">
                    {formatBusinessTourCompact(row.val)}
                  </span>
                </div>
              ))}
              <div className="pt-1.5 mt-1 border-t border-[#e2dcd0] px-2 space-y-0.5 text-[11px] text-[#525e73]">
                <div className="flex items-center justify-between">
                  <span>Giá xây mỗi cấp</span>
                  <span className="font-mono-num font-extrabold text-[#141c2b]">
                    {formatBusinessTourCompact(tile.houseCost || 0)}
                  </span>
                </div>
                {prop && prop.ownerId !== null && prop.level < 4 && !isShielded && (
                  <div className="flex items-center justify-between">
                    <span>Giá mua lại (2×)</span>
                    <span className="font-mono-num font-extrabold text-amber-700">
                      {formatBusinessTourCompact(calculateBuyoutPrice(tileIndex, prop.level))}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {tile.kind === TileKind.RESORT && (
          <div className="rounded-xl bg-[#f3efe6] border border-[#dad3c4] overflow-hidden text-xs">
            <div className="id-subheader-strip px-3 py-1.5 font-extrabold text-[10.5px] uppercase tracking-wide flex items-center justify-between">
              <span>Phí Thuê Khu Nghỉ Dưỡng</span>
              {isOutage ? (
                <span className="text-rose-600 inline-flex items-center gap-0.5">
                  <Zap className="h-3 w-3" aria-hidden="true" /> Mất Điện · 0K
                </span>
              ) : (
                <span className="text-[#141c2b]">4/4 Thắng Ngay</span>
              )}
            </div>
            <div className="p-2 space-y-0.5 bg-white/70">
              {RESORT_RENTS.map((rentVal, idx) => {
                const countNeeded = idx + 1;
                const active = ownedResortsByOwner === countNeeded;
                const effectiveRent = isOutage ? 0 : rentVal;
                return (
                  <div
                    key={countNeeded}
                    className={`flex items-center justify-between py-1 px-2 rounded-lg ${
                      active
                        ? 'bg-amber-100/90 border border-amber-300 text-[#141c2b] font-black'
                        : 'text-[#475569] font-medium'
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
          <div className="rounded-xl bg-rose-50 border border-rose-200 p-3 text-xs font-semibold text-rose-900 leading-relaxed">
            Thuế bằng <span className="font-black">10% tổng giá trị vốn</span> toàn bộ thành phố và khu nghỉ dưỡng bạn đang sở hữu.
          </div>
        )}
      </div>

      {canPingTile && onPingTile && (
        <div className="shrink-0 px-3 py-2.5 bg-[#f3efe6] border-t border-[#dad3c4] space-y-1.5">
          <div className="flex items-center justify-between px-0.5 text-[10px] font-extrabold uppercase tracking-wide text-[#525e73]">
            <span>Ping công khai trên bàn cờ</span>
            {isOnPingCooldown && (
              <span className="font-mono-num text-amber-700 inline-flex items-center gap-0.5">
                <Hourglass className="h-3 w-3" aria-hidden="true" />
                <span>{pingCooldownSecondsLeft}s</span>
              </span>
            )}
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            <button
              type="button"
              data-testid="bt-tile-ping-TARGET"
              disabled={isOnPingCooldown}
              onClick={() => onPingTile(tileIndex, 'TARGET')}
              className="bt-btn-white py-1.5 px-1.5 rounded-xl text-[10.5px] font-extrabold leading-tight flex items-center justify-center gap-1 disabled:opacity-45 cursor-pointer disabled:cursor-not-allowed"
            >
              <Crosshair className="h-3.5 w-3.5 text-sky-600 shrink-0" aria-hidden="true" />
              <span>Nhắm ô này</span>
            </button>
            <button
              type="button"
              data-testid="bt-tile-ping-DANGER"
              disabled={isOnPingCooldown}
              onClick={() => onPingTile(tileIndex, 'DANGER')}
              className="bt-btn-white py-1.5 px-1.5 rounded-xl text-[10.5px] font-extrabold leading-tight flex items-center justify-center gap-1 disabled:opacity-45 cursor-pointer disabled:cursor-not-allowed"
            >
              <AlertTriangle className="h-3.5 w-3.5 text-rose-600 shrink-0" aria-hidden="true" />
              <span>Coi chừng</span>
            </button>
            <button
              type="button"
              data-testid="bt-tile-ping-TROPHY"
              disabled={isOnPingCooldown}
              onClick={() => onPingTile(tileIndex, 'TROPHY')}
              className="bt-btn-white py-1.5 px-1.5 rounded-xl text-[10.5px] font-extrabold leading-tight flex items-center justify-center gap-1 disabled:opacity-45 cursor-pointer disabled:cursor-not-allowed"
            >
              <Trophy className="h-3.5 w-3.5 text-amber-600 shrink-0" aria-hidden="true" />
              <span>Đặt Cúp đây</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

/* ==========================================
 * 2. AUTHENTIC TITLE DEED ("SỔ ĐỎ") BUY MODAL
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

  let groupLabel = '';
  let ownedInSet = 0;
  let totalInSet = 0;
  let setColorHex = tile.groupColor || '#0284C7';
  let completesMono = false;
  let ownedResortsCount = 0;

  if (tile.group) {
    const groupMeta = COLOR_GROUP_META[tile.group];
    ownedInSet = groupMeta.tileIndices.filter((idx) => {
      const oid = properties[idx]?.ownerId;
      return oid !== null && oid !== undefined && teamOwnerIds.has(oid);
    }).length;
    totalInSet = groupMeta.tileIndices.length;
    completesMono = ownedInSet === totalInSet - 1;
    groupLabel = `Cụm ${groupMeta.label}`;
  } else if (tile.kind === TileKind.RESORT) {
    ownedResortsCount = RESORT_TILE_INDICES.filter((idx) => {
      const oid = properties[idx]?.ownerId;
      return oid !== null && oid !== undefined && teamOwnerIds.has(oid);
    }).length;
    ownedInSet = ownedResortsCount;
    totalInSet = 4;
    setColorHex = '#0284C7';
    completesMono = ownedResortsCount === RESORT_TILE_INDICES.length - 1;
    groupLabel = 'Khu nghỉ dưỡng';
  }

  const instantWin = wouldOwnTileWinMatch(player.id, tileIndex, players, properties, matchMode);
  const isFestival = boardModifiers.festivalTileIndices.includes(tileIndex);
  const buyPal = isBtCity
    ? resolveDeedGroupPalette(tile.group, tile.groupColor)
    : { topHex: '#0284C7', bottomHex: '#0369A1' };

  return (
    <div
      ref={dialogRef}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-labelledby="buy-modal-title"
      data-testid="buy-decision-modal"
      className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-25 w-[min(470px,93vw)] max-h-[calc(100dvh-1.5rem)] flex flex-col bt-casual-modal rounded-2xl overflow-hidden animate-pop-in pointer-events-auto"
    >
      {/* Title Deed Color Band Header (Zero Redundant Price Box) */}
      <div
        className="shrink-0 px-5 py-3.5 text-white border-b border-black/15 flex items-center justify-between gap-3"
        style={{
          background: `linear-gradient(180deg, ${buyPal.topHex} 0%, ${buyPal.bottomHex} 100%)`,
          textShadow: '0 1px 2px rgba(15, 23, 42, 0.42)',
        }}
      >
        <div className="flex items-center gap-3 min-w-0">
          <CityLandmarkBadge tileIndex={tileIndex} size={46} />
          <div className="min-w-0">
            <div className="text-[10px] font-extrabold uppercase tracking-wider text-white/90">
              {isBtCity ? `Sổ Địa Ốc · Vòng ${player.laps + 1}` : 'Sổ Khu Nghỉ Dưỡng'}
            </div>
            <h3
              id="buy-modal-title"
              className="font-display text-xl sm:text-2xl font-black uppercase leading-tight text-white truncate"
            >
              {tile.name}
            </h3>
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-[10px] font-bold uppercase text-white/85">Giá đất gốc</div>
          <div className="font-mono-num text-base sm:text-lg font-black leading-none text-white">
            {formatBusinessTourCompact(price)}
          </div>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto slim-scroll p-4 sm:p-5 space-y-3">
        {/* Set Progress Dots + Strategic Badges */}
        {groupLabel && (
          <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-[#e6e0d3]">
            <div className="flex items-center gap-2 text-xs font-extrabold text-[#141c2b]">
              <GroupProgressDots
                ownedCount={ownedInSet}
                totalCount={totalInSet}
                colorHex={setColorHex}
              />
              <span>
                {groupLabel} ({ownedInSet}/{totalInSet})
              </span>
            </div>

            <div className="flex items-center gap-1.5 flex-wrap">
              {isFestival && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-50 border border-amber-300 text-[10.5px] font-extrabold text-amber-800">
                  <Sparkles className="h-3 w-3 shrink-0" aria-hidden="true" />
                  <span>Lễ Hội ×2</span>
                </span>
              )}
              {instantWin ? (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-50 border border-emerald-300 text-[10.5px] font-black text-emerald-700">
                  <Trophy className="h-3 w-3 shrink-0" aria-hidden="true" />
                  <span>Mua ô này THẮNG NGAY!</span>
                </span>
              ) : (
                completesMono && (
                  <span className="px-2 py-0.5 rounded-md bg-emerald-50 border border-emerald-300 text-[10.5px] font-black text-emerald-700">
                    {tile.kind === TileKind.RESORT ? 'Đủ 4/4 THẮNG NGAY!' : 'Đủ bộ màu ×2!'}
                  </span>
                )
              )}
            </div>
          </div>
        )}

        <p className="text-xs text-[#525e73] leading-relaxed">{tile.description}</p>

        {tile.kind === TileKind.RESORT && (
          <div className="px-3.5 py-2.5 rounded-xl bg-[#f3efe6] border border-[#dad3c4] flex items-center justify-between text-xs">
            <span className="font-bold text-[#334155]">Phí thuê sau khi sở hữu</span>
            <span className="font-mono-num font-black text-emerald-700 text-sm">
              {formatBusinessTourCompact(RESORT_RENTS[Math.min(3, ownedResortsCount)])}
            </span>
          </div>
        )}

        {/* Symmetrical Construction Tier Row (Zero Orphan Grid Cell, Preserves Lap-1 No-3-House Rule) */}
        {isBtCity && tile.rents && (
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2 text-[11px] font-bold text-[#525e73]">
              <span>Chọn quy mô xây dựng</span>
              {player.laps === 0 && (
                <span className="text-[#788497]">Vòng 2 mở khóa xây cấp 3</span>
              )}
            </div>
            <div
              className={`grid gap-2 ${
                tiers.length <= 3 ? 'grid-cols-3' : 'grid-cols-2 sm:grid-cols-4'
              }`}
            >
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
                    className={`p-2.5 rounded-xl border text-center flex flex-col items-center gap-1 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                      isSelected
                        ? 'bg-emerald-50 border-emerald-600 ring-2 ring-emerald-500/25 shadow-xs'
                        : 'bg-white border-[#ded8ca] hover:border-[#b7ae9c]'
                    }`}
                  >
                    <BuildingLevelVisual level={t.level} className="h-6 w-7 shrink-0" />
                    <span className="font-display text-xs font-black text-[#141c2b] leading-tight">
                      {t.label}
                    </span>
                    <span className="font-mono-num text-xs font-black text-[#182232]">
                      {formatBusinessTourCompact(t.totalCost)}
                    </span>
                    <span className="font-mono-num text-[10.5px] font-bold text-emerald-700">
                      Thuê {formatBusinessTourCompact(rentVal)}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <div className="shrink-0 px-4 sm:px-5 py-3 bg-[#f3efe6] border-t border-[#dad3c4] grid grid-cols-2 gap-2.5">
        <button
          type="button"
          disabled={!canAfford}
          onClick={() => onBuy(isBtCity ? selectedLevel : 0)}
          className="bt-btn-green py-2.5 px-3 rounded-xl disabled:opacity-40 font-black text-xs sm:text-sm uppercase tracking-wide cursor-pointer whitespace-normal leading-tight"
        >
          {canAfford
            ? `Mua Ngay (${formatBusinessTourCompact(totalCost)})`
            : 'Không Đủ Tiền'}
        </button>
        <button
          type="button"
          onClick={onSkip}
          className="bt-btn-white py-2.5 px-3 rounded-xl font-extrabold text-xs sm:text-sm uppercase tracking-wide cursor-pointer whitespace-normal leading-tight"
        >
          Bỏ Qua
        </button>
      </div>
    </div>
  );
};

/* ==========================================
 * 3. ILLUSTRATED EVENT CARD MODAL
 * ========================================== */
interface LuckCardModalProps {
  card: LuckCard;
  isBot: boolean;
  trapFocus?: boolean;
  onConfirm: () => void;
}

const EventCartoonIllustration: React.FC<{ card: LuckCard }> = ({ card }) => {
  const kind = card.effect.type;

  if (kind === 'HOST_CHAMPIONSHIP') {
    return (
      <svg
        viewBox="0 0 280 200"
        className="w-52 sm:w-60 h-auto mx-auto drop-shadow-[0_12px_20px_rgba(15,23,42,0.35)]"
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

  if (kind === 'GO_TO_JAIL') {
    return (
      <svg
        viewBox="0 0 280 200"
        className="w-52 sm:w-60 h-auto mx-auto drop-shadow-[0_12px_20px_rgba(15,23,42,0.35)]"
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

  if (kind === 'MOVE_TO' || kind === 'GO_TO_WORLD_TOUR') {
    return (
      <svg
        viewBox="0 0 280 200"
        className="w-52 sm:w-60 h-auto mx-auto drop-shadow-[0_12px_20px_rgba(15,23,42,0.35)]"
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

  if (kind === 'PAY_CASH' || kind === 'EARTHQUAKE' || kind === 'POWER_OUTAGE') {
    return (
      <svg
        viewBox="0 0 280 200"
        className="w-52 sm:w-60 h-auto mx-auto drop-shadow-[0_12px_20px_rgba(15,23,42,0.35)]"
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

  return (
    <svg
      viewBox="0 0 280 200"
      className="w-52 sm:w-60 h-auto mx-auto drop-shadow-[0_12px_20px_rgba(15,23,42,0.35)]"
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
        <div className="bt-luck-card-badge mb-2 px-4 py-1 rounded-full bg-[#182232] border border-amber-400/70 shadow-md">
          <span className="font-display text-[11px] font-black uppercase tracking-widest text-amber-300">
            Sự Kiện Cơ Hội
          </span>
        </div>

        <div className="bt-luck-card-art relative animate-float-gentle">
          <EventCartoonIllustration card={card} />
        </div>

        <div className="bt-luck-card-body relative -mt-4 w-full max-w-md px-3">
          <div
            className="bt-luck-card-box rounded-2xl px-6 py-4 border-2 border-[#d97706] shadow-[0_16px_32px_rgba(20,28,43,0.42),inset_0_1px_0_#FFFFFF]"
            style={{
              background: 'linear-gradient(180deg, #FDFCFA 0%, #FEF3C7 100%)',
            }}
          >
            <h3
              id="luck-card-title"
              className={`font-display text-xl sm:text-2xl font-black uppercase tracking-wide leading-tight ${
                isNegative ? 'text-rose-700' : 'text-[#b45309]'
              }`}
            >
              {card.title}
            </h3>
            <p className="mt-1.5 text-sm sm:text-[15px] font-semibold text-[#334155] leading-snug">
              {card.description}
            </p>
          </div>
        </div>

        <div className="bt-luck-card-cta mt-4 w-full max-w-xs space-y-2">
          {isBot ? (
            <div className="px-5 py-2.5 rounded-full bg-[#182232]/90 border border-white/25 text-xs font-extrabold text-white inline-flex items-center justify-center gap-1.5 shadow-lg">
              <Hourglass className="h-3.5 w-3.5 text-amber-300 shrink-0" aria-hidden="true" />
              <span>Đang thực hiện thẻ sự kiện...</span>
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
      className="fixed inset-0 z-40 flex items-center justify-center p-3 sm:p-4 bg-slate-950/48 pointer-events-auto"
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="asset-modal-title"
        className="w-full max-w-2xl bt-casual-modal rounded-2xl overflow-hidden animate-pop-in flex flex-col max-h-[calc(100dvh-1.5rem)]"
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
            <p className="text-xs font-semibold text-white/85 mt-0.5">
              Tiền mặt hiện có của {player.name}:{' '}
              <span className="font-mono-num font-black text-amber-300">
                {formatBusinessTourSpaced(player.cash)}
              </span>
            </p>
          </div>
          {!pendingDebt && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Đóng bảng tài sản"
              className="icon-hit-target h-8 w-8 rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center text-white cursor-pointer shrink-0"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          )}
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto slim-scroll flex flex-col">
          {pendingDebt && (
            <div className="shrink-0 px-5 sm:px-6 py-3 bg-rose-50/90 border-b border-rose-200 space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <div className="text-rose-950 font-semibold">
                  <strong className="font-black">{pendingDebt.reason}:</strong> Cần trả{' '}
                  <span className="font-mono-num font-black text-rose-700">
                    {formatBusinessTourSpaced(pendingDebt.amount)}
                  </span>
                </div>
                <div className="flex items-center gap-3 font-black">
                  {shortfall > 0 ? (
                    <span className="text-rose-700">
                      Còn thiếu: <span className="font-mono-num">{formatBusinessTourSpaced(shortfall)}</span>
                    </span>
                  ) : (
                    <span className="text-emerald-700">
                      Tiền dư sau trả nợ:{' '}
                      <span className="font-mono-num">{formatBusinessTourSpaced(surplus)}</span>
                    </span>
                  )}
                </div>
              </div>

              {autoPlan && !autoPlan.sufficient && (
                <div className="px-3 py-2 rounded-xl bg-rose-100 border border-rose-300 text-xs font-bold text-rose-800">
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
                      className="bt-btn-white px-3.5 py-1.5 rounded-xl text-xs font-extrabold uppercase cursor-pointer whitespace-nowrap"
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
                  className="bt-btn-danger-solid px-3.5 py-1.5 rounded-xl text-xs font-black uppercase cursor-pointer whitespace-nowrap"
                >
                  Phá Sản
                </button>
              </div>
            </div>
          )}

          <div className="id-subheader-strip shrink-0 px-5 sm:px-6 py-2 flex items-center justify-between text-[11px] font-extrabold uppercase tracking-wide">
            <span>Bất Động Sản Sở Hữu ({owned.length})</span>
            <span>{pendingDebt ? 'Giá Trị Hoàn 100%' : 'Giá Trị / Phí Thuê'}</span>
          </div>

          <div className="p-4 sm:p-5 space-y-2">
            {owned.length === 0 ? (
              <div className="text-center py-10 text-sm font-semibold text-[#788497]">
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
                  tags.push('Lễ Hội ×2');
                }
                if (boardModifiers.championshipTileIndex === prop.tileIndex) {
                  tags.push(`Cúp ×${boardModifiers.championshipMultiplier}`);
                }
                if (boardModifiers.shieldedTileIndices?.includes(prop.tileIndex)) {
                  tags.push('Khiên Bảo Hộ');
                }
                if (boardModifiers.outageTileIndices?.includes(prop.tileIndex)) {
                  tags.push('Mất điện');
                }

                const rowBody = (
                  <div className="flex items-center justify-between gap-3 w-full">
                    <div className="flex items-center gap-3 min-w-0">
                      {pendingDebt && (
                        <span
                          className={`h-5 w-5 rounded-md border-2 flex items-center justify-center shrink-0 ${
                            isSelected
                              ? 'bg-rose-600 border-rose-600 text-white'
                              : 'bg-white border-[#c5bdaa] text-transparent'
                          }`}
                        >
                          <Check className="h-3.5 w-3.5 stroke-[3]" aria-hidden="true" />
                        </span>
                      )}
                      <div
                        className="h-9 w-2 rounded-full shrink-0"
                        style={{
                          backgroundColor:
                            tile.kind === TileKind.RESORT
                              ? '#0EA5E9'
                              : tile.groupColor || player.color,
                        }}
                      />
                      <BuildingLevelVisual
                        level={prop.level}
                        isResort={tile.kind === TileKind.RESORT}
                        className="h-6 w-7 shrink-0"
                      />
                      <div className="min-w-0 text-left">
                        <div className="flex flex-wrap items-baseline gap-1.5">
                          <span className="font-display font-black text-[#141c2b] text-sm sm:text-base leading-tight">
                            {tile.name}
                          </span>
                          {tags.length > 0 && (
                            <span className="text-[11px] font-bold text-emerald-700">
                              · {tags.join(' · ')}
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-[#525e73] tabular-nums mt-0.5">
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
                      <div className="font-mono-num text-sm font-black text-[#141c2b]">
                        {formatBusinessTourCompact(investedVal)}
                      </div>
                      {pendingDebt && (
                        <div className="text-[10px] font-bold text-[#64748b]">Hoàn 100%</div>
                      )}
                    </div>
                  </div>
                );

                return pendingDebt ? (
                  <button
                    key={prop.tileIndex}
                    type="button"
                    onClick={() => toggleSelectTile(prop.tileIndex)}
                    className={`w-full p-3 rounded-xl border transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-rose-50 border-rose-500 ring-1 ring-rose-300'
                        : 'bg-white border-[#ded8ca] hover:border-[#b7ae9c]'
                    }`}
                  >
                    {rowBody}
                  </button>
                ) : (
                  <div
                    key={prop.tileIndex}
                    className="p-3 rounded-xl bg-white border border-[#ded8ca]"
                  >
                    {rowBody}
                  </div>
                );
              })
            )}
          </div>
        </div>

        {!pendingDebt && (
          <div className="shrink-0 px-5 sm:px-6 py-3 bg-[#f3efe6] border-t border-[#dad3c4] flex justify-end">
            <button
              type="button"
              onClick={onClose}
              className="bt-btn-green px-6 py-2 rounded-xl text-sm font-black uppercase cursor-pointer whitespace-nowrap"
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
 * 5. PAUSE MENU & VICTORY MODAL (Strict Button Hierarchy)
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
    <div className="fixed inset-0 z-45 flex items-center justify-center p-3 sm:p-4 bg-slate-950/48 pointer-events-auto">
      <div
        ref={dialogRef}
        tabIndex={-1}
        data-testid="pause-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="pause-modal-title"
        className="w-full max-w-sm max-h-[calc(100dvh-1.5rem)] flex flex-col bt-casual-modal rounded-2xl overflow-hidden animate-pop-in text-center"
      >
        <div className="shrink-0 bt-header-sky px-6 py-3.5">
          <h2
            id="pause-modal-title"
            className="font-display text-lg font-black uppercase tracking-wide text-white"
          >
            {onlineRoomCode ? `Phòng Online ${onlineRoomCode}` : 'Tạm Dừng Ván Đấu'}
          </h2>
          {showOnlineNote && (
            <p className="text-[11px] font-medium text-slate-300 mt-0.5 leading-snug">
              Đồng hồ trận Online vẫn tiếp tục chạy
            </p>
          )}
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto slim-scroll p-5 space-y-2.5">
          <button
            type="button"
            onClick={onResume}
            className="bt-btn-green w-full py-2.5 px-4 rounded-xl font-black text-sm uppercase tracking-wide flex items-center justify-center gap-2 cursor-pointer whitespace-nowrap"
          >
            <Play className="h-4 w-4 fill-current shrink-0" aria-hidden="true" />
            <span>Tiếp Tục Chơi</span>
          </button>

          <div className="space-y-2 pt-1">
            {onlineRoomCode && onCopyInviteLink && (
              <button
                type="button"
                onClick={onCopyInviteLink}
                className="bt-btn-white w-full py-2.5 px-4 rounded-xl font-bold text-sm flex items-center justify-center gap-2 cursor-pointer whitespace-nowrap"
              >
                {copiedInviteToast ? (
                  <>
                    <Check className="h-4 w-4 text-emerald-600 shrink-0" aria-hidden="true" />
                    <span className="text-emerald-700 font-extrabold">Đã Chép Link Mời!</span>
                  </>
                ) : (
                  <>
                    <Link2 className="h-4 w-4 text-[#525e73] shrink-0" aria-hidden="true" />
                    <span>Copy Link Mời Bạn Bè</span>
                  </>
                )}
              </button>
            )}
            <button
              type="button"
              onClick={onOpenRulebook}
              className="bt-btn-white w-full py-2.5 px-4 rounded-xl font-bold text-sm flex items-center justify-center gap-2 cursor-pointer whitespace-nowrap"
            >
              <BookOpen className="h-4 w-4 text-[#525e73] shrink-0" aria-hidden="true" />
              <span>Sổ Tay Luật Chơi</span>
            </button>
            <button
              type="button"
              onClick={onResetCamera}
              className="bt-btn-white w-full py-2.5 px-4 rounded-xl font-bold text-sm flex items-center justify-center gap-2 cursor-pointer whitespace-nowrap"
            >
              <Compass className="h-4 w-4 text-[#525e73] shrink-0" aria-hidden="true" />
              <span>Đặt Lại Góc Nhìn 3D</span>
            </button>
          </div>

          <div className="pt-2 border-t border-[#e2dcd0]">
            <button
              type="button"
              onClick={onRestartToTitle}
              className="id-btn-crimson w-full py-2.5 px-4 rounded-xl font-extrabold text-sm flex items-center justify-center gap-2 cursor-pointer whitespace-nowrap"
            >
              <LogOut className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{onlineRoomCode ? 'Rời Phòng Online' : 'Sảnh Chờ Mới'}</span>
            </button>
          </div>
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
  roomCode?: string;
  postMatchAwards?: PostMatchAward[];
  seriesStandings?: SeriesStandingEntry[];
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
  roomCode,
  postMatchAwards,
  seriesStandings,
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
  const [exportBusy, setExportBusy] = useState(false);
  const [exportFeedback, setExportFeedback] = useState<string | null>(null);
  const exportFeedbackTimerRef = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (exportFeedbackTimerRef.current !== null) {
        window.clearTimeout(exportFeedbackTimerRef.current);
      }
    },
    []
  );

  const showExportFeedback = (message: string) => {
    if (exportFeedbackTimerRef.current !== null) {
      window.clearTimeout(exportFeedbackTimerRef.current);
    }
    setExportFeedback(message);
    exportFeedbackTimerRef.current = window.setTimeout(() => {
      exportFeedbackTimerRef.current = null;
      setExportFeedback(null);
    }, 4200);
  };

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

  const sortedSeriesStandings = useMemo(
    () =>
      [...(seriesStandings ?? [])].sort(
        (a, b) =>
          b.seriesPoints - a.seriesPoints ||
          b.wins - a.wins ||
          a.playerName.localeCompare(b.playerName) ||
          a.participantId.localeCompare(b.participantId)
      ),
    [seriesStandings]
  );

  const buildExportData = (): VictoryCardExportData => {
    const exportWinnerName = isTeamVictory
      ? `Đội ${winningTeamId === 0 ? 'A (Xanh)' : 'B (Đỏ)'}`
      : winner.name;
    const exportVictoryLabel =
      victoryLabel ||
      (victoryCondition === 'TIME_LIMIT'
        ? `Hết giờ (20:00) · ${turnCount} Lượt Đấu`
        : `Chung cuộc · ${turnCount} Lượt Đấu`);

    return {
      roomCode,
      winnerName: exportWinnerName,
      victoryLabel: exportVictoryLabel,
      rankedPlayers: ranked.map((pl, idx) => ({
        rank: idx + 1,
        name: pl.name,
        color: pl.color,
        netWorthText: pl.bankrupt ? 'PHÁ SẢN' : formatBusinessTourSpaced(worthOf(pl)),
        isWinner: isTeamVictory
          ? !pl.bankrupt && pl.teamId === winningTeamId
          : pl.id === winner.id,
      })),
      awards: postMatchAwards ?? [],
      seriesStandings: sortedSeriesStandings,
    };
  };

  const cleanCode = roomCode?.trim().toLowerCase();
  const exportFilename = cleanCode
    ? `co-ty-phu-${cleanCode}-tong-ket.png`
    : 'co-ty-phu-tong-ket.png';

  const handleCopyVictoryCard = async () => {
    if (exportBusy) return;
    setExportBusy(true);
    try {
      await waitForGameFonts(1200).catch(() => false);
      const canvas = renderVictoryCardCanvas(buildExportData());
      const outcome = await copyVictoryCardToClipboard(canvas, exportFilename);
      showExportFeedback(
        outcome === 'copied'
          ? 'Đã copy ảnh vào Clipboard!'
          : 'Trình duyệt không hỗ trợ copy ảnh — đã tự tải file PNG!'
      );
    } catch {
      showExportFeedback('Không thể tạo ảnh lúc này — vui lòng thử lại!');
    } finally {
      setExportBusy(false);
    }
  };

  const handleDownloadVictoryCard = async () => {
    if (exportBusy) return;
    setExportBusy(true);
    try {
      await waitForGameFonts(1200).catch(() => false);
      const canvas = renderVictoryCardCanvas(buildExportData());
      downloadVictoryCardPng(canvas, exportFilename);
      showExportFeedback('Đã tải xuống ảnh PNG tổng kết!');
    } catch {
      showExportFeedback('Không thể tạo ảnh lúc này — vui lòng thử lại!');
    } finally {
      setExportBusy(false);
    }
  };

  return (
    <div
      data-testid="victory-modal"
      className="fixed inset-0 z-30 flex items-center justify-center p-2.5 sm:p-4 bg-slate-950/42 pointer-events-auto"
    >
      <ConfettiOverlay graphicsQualityTier={graphicsQualityTier} />
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="victory-modal-title"
        className="relative z-40 w-full max-w-xl max-h-[calc(100dvh-1.25rem)] flex flex-col bt-casual-modal rounded-2xl overflow-hidden animate-pop-in"
      >
        <div className="shrink-0 bt-header-sky px-4 sm:px-6 py-3.5 sm:py-4 text-center">
          <div className="text-[11px] font-bold uppercase tracking-wider text-slate-300">
            Chung Cuộc · {turnCount} Lượt Đấu
            {victoryCondition === 'TIME_LIMIT' ? ' · Hết giờ (20:00)' : ''}
            {roomCode ? ` · Phòng ${roomCode}` : ''}
          </div>
          <h2
            id="victory-modal-title"
            className="font-display text-xl sm:text-2xl font-black uppercase text-amber-300 mt-1 flex items-center justify-center gap-2"
          >
            <Trophy className="h-6 w-6 text-amber-400 shrink-0" aria-hidden="true" />
            <span>
              {isTeamVictory
                ? `Đội ${winningTeamId === 0 ? 'A (Xanh)' : 'B (Đỏ)'} Chiến Thắng!`
                : `${winner.name} Chiến Thắng!`}
            </span>
          </h2>
          {victoryCondition === 'TIME_LIMIT' && (
            <div className="mt-1 inline-block px-3 py-0.5 rounded-full bg-white/15 text-[11px] font-bold text-white">
              Hết giờ (20:00) — Tổng Tài Sản
            </div>
          )}
          {victoryLabel && (
            <p className="mt-1 text-xs font-semibold text-slate-200">{victoryLabel}</p>
          )}
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto slim-scroll p-4 sm:p-5 space-y-3.5">
          {isTeamVictory && (
            <div className="grid grid-cols-2 gap-2">
              <div
                className={`p-2.5 rounded-xl border text-center ${
                  winningTeamId === 0
                    ? 'bg-sky-50 border-sky-400 ring-1 ring-sky-200'
                    : 'bg-white border-[#ded8ca]'
                }`}
              >
                <div className="text-[11px] font-extrabold uppercase text-sky-800 inline-flex items-center gap-1">
                  <span>Đội A (Xanh)</span>
                  {winningTeamId === 0 && <Trophy className="h-3 w-3 text-amber-600" aria-hidden="true" />}
                </div>
                <div className="font-mono-num text-sm sm:text-base font-black text-[#141c2b]">
                  {formatBusinessTourSpaced(teamATotal)}
                </div>
              </div>
              <div
                className={`p-2.5 rounded-xl border text-center ${
                  winningTeamId === 1
                    ? 'bg-rose-50 border-rose-400 ring-1 ring-rose-200'
                    : 'bg-white border-[#ded8ca]'
                }`}
              >
                <div className="text-[11px] font-extrabold uppercase text-rose-800 inline-flex items-center gap-1">
                  <span>Đội B (Đỏ)</span>
                  {winningTeamId === 1 && <Trophy className="h-3 w-3 text-amber-600" aria-hidden="true" />}
                </div>
                <div className="font-mono-num text-sm sm:text-base font-black text-[#141c2b]">
                  {formatBusinessTourSpaced(teamBTotal)}
                </div>
              </div>
            </div>
          )}

          <div className="rounded-xl bg-white border border-[#dad3c4] overflow-hidden">
            <div className="id-subheader-strip px-4 py-2 grid grid-cols-[46px_minmax(0,1fr)_auto] gap-2 text-[11px] font-extrabold uppercase tracking-wide">
              <span>Hạng</span>
              <span>Tỷ Phú</span>
              <span className="text-right">Tổng Tài Sản</span>
            </div>
            <div className="divide-y divide-[#ede8dc]">
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
                      isChamp ? 'bg-amber-50/85' : ''
                    }`}
                  >
                    <span className="font-mono-num font-black text-[#525e73]">
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
                        <span className="font-extrabold text-[#141c2b] truncate">
                          {pl.name}
                        </span>
                        {matchMode === 'TEAMS_2V2' && pl.teamId !== undefined && (
                          <span
                            className={`shrink-0 px-1.5 py-0.5 rounded-md text-[9px] font-extrabold uppercase border ${
                              pl.teamId === 0
                                ? 'bg-sky-50 text-sky-800 border-sky-200'
                                : 'bg-rose-50 text-rose-800 border-rose-200'
                            }`}
                          >
                            {pl.teamId === 0 ? 'Đội A' : 'Đội B'}
                          </span>
                        )}
                        {isChamp && (
                          <span className="shrink-0 px-1.5 py-0.5 rounded-md bg-amber-300/80 text-[10px] font-black uppercase tracking-wide text-[#141c2b]">
                            Vô địch
                          </span>
                        )}
                      </div>
                    </div>
                    <span
                      className={`text-right font-black whitespace-nowrap ${
                        pl.bankrupt
                          ? 'font-display text-rose-600 text-xs uppercase tracking-wide'
                          : 'font-mono-num text-emerald-700'
                      }`}
                    >
                      {pl.bankrupt ? 'PHÁ SẢN' : formatBusinessTourSpaced(worth)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {postMatchAwards && postMatchAwards.length > 0 && (
            <div
              data-testid="bt-post-match-awards"
              className="rounded-xl bg-[#f3efe6] border border-[#dad3c4] p-3 space-y-2"
            >
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-display text-xs font-black uppercase tracking-wide text-[#141c2b]">
                  Danh hiệu Trận đấu
                </h3>
                <span className="text-[10px] font-bold text-[#64748b]">
                  Khoảnh khắc nổi bật
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {postMatchAwards.map((award) => (
                  <div
                    key={award.id}
                    data-testid={`bt-post-match-award-${award.id}`}
                    className="rounded-xl bg-white border border-[#ded8ca] p-2.5 flex items-start gap-2 min-w-0"
                    style={{
                      borderLeftWidth: '4px',
                      borderLeftColor: award.playerColor || '#F5B800',
                    }}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-1.5">
                        <span className="text-xs font-black text-[#141c2b] truncate">
                          {award.title}
                        </span>
                        <span className="px-1.5 py-0.5 rounded-md bg-[#efece4] text-[#141c2b] font-mono-num text-[10px] font-black shrink-0">
                          {award.valueLabel}
                        </span>
                      </div>
                      <div className="text-[11px] font-bold text-[#334155] truncate">
                        {award.playerName}
                      </div>
                      <div className="text-[10px] font-medium text-[#64748b] leading-snug">
                        {award.subtitle}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {sortedSeriesStandings.length > 0 && (
            <div
              data-testid="bt-victory-series-standings"
              className="rounded-xl bg-white border border-[#dad3c4] overflow-hidden"
            >
              <div className="id-subheader-strip px-3.5 py-1.5 flex items-center justify-between text-[11px] font-extrabold uppercase">
                <span>Chuỗi trận phòng đấu</span>
                <span>Cúp · Điểm</span>
              </div>
              <div className="divide-y divide-[#ede8dc]">
                {sortedSeriesStandings.map((entry, idx) => (
                  <div
                    key={entry.participantId}
                    data-testid={`bt-victory-series-row-${idx + 1}`}
                    className={`px-3.5 py-2 flex items-center justify-between gap-2 text-xs ${
                      idx === 0 ? 'bg-amber-50/75' : 'bg-white'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-mono-num font-black text-[#525e73] shrink-0">
                        #{idx + 1}
                      </span>
                      <span className="font-extrabold text-[#141c2b] truncate">
                        {entry.playerName}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 sm:gap-2 shrink-0 font-mono-num font-black whitespace-nowrap">
                      <span className="px-2 py-0.5 rounded-md bg-amber-100 text-amber-900 text-[10px]">
                        {entry.wins} Cúp
                      </span>
                      <span className="text-[#64748b] font-semibold text-[11px] hidden sm:inline">
                        {entry.matchesPlayed} trận
                      </span>
                      <span className="px-2 py-0.5 rounded-md bg-[#eae4d6] text-[#141c2b] text-[11px]">
                        {entry.seriesPoints} điểm
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="rounded-xl bg-[#f3efe6] border border-[#dad3c4] p-2.5 space-y-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <button
                type="button"
                data-testid="bt-copy-victory-card-btn"
                disabled={exportBusy}
                onClick={() => void handleCopyVictoryCard()}
                className="bt-btn-white py-2 px-3 rounded-xl text-xs font-extrabold uppercase tracking-wide flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-55 whitespace-nowrap"
              >
                <Copy className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span>Copy Ảnh</span>
              </button>
              <button
                type="button"
                data-testid="bt-download-victory-card-btn"
                disabled={exportBusy}
                onClick={() => void handleDownloadVictoryCard()}
                className="bt-btn-gold py-2 px-3 rounded-xl text-xs font-black uppercase tracking-wide flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-55 whitespace-nowrap"
              >
                <Download className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span>Tải Ảnh PNG</span>
              </button>
            </div>
            {exportFeedback && (
              <div
                role="status"
                aria-live="polite"
                data-testid="bt-victory-export-feedback"
                className="px-3 py-1.5 rounded-lg bg-emerald-50 border border-emerald-200 text-[11px] font-bold text-emerald-800 text-center"
              >
                {exportFeedback}
              </div>
            )}
          </div>

          {isOnlineMatch && onlineChatNode && (
            <div className="pt-1">
              {onlineChatNode}
            </div>
          )}
        </div>

        <div className="shrink-0 px-4 sm:px-6 py-3 bg-[#f3efe6] border-t border-[#dad3c4]">
          {isOnlineMatch ? (
            <div className="space-y-2">
              {isOnlineHost && onReturnToOnlineLobby ? (
                <button
                  type="button"
                  data-start="true"
                  onClick={onReturnToOnlineLobby}
                  className="bt-btn-green w-full py-2.5 sm:py-3 rounded-xl font-black text-sm sm:text-base uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer whitespace-normal sm:whitespace-nowrap leading-tight"
                >
                  <RotateCcw className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>Về Sảnh Phòng Chơi Tiếp</span>
                </button>
              ) : (
                <div className="px-4 py-2 rounded-xl bg-white border border-[#ded8ca] text-xs font-bold text-[#525e73] text-center">
                  Đang chờ Chủ phòng mở ván mới...
                </div>
              )}
              <button
                type="button"
                onClick={onPlayAgain}
                className="id-btn-crimson w-full py-2 rounded-xl font-extrabold text-xs sm:text-sm uppercase tracking-wide cursor-pointer whitespace-nowrap"
              >
                Rời Phòng
              </button>
            </div>
          ) : (
            <button
              type="button"
              data-start="true"
              onClick={onPlayAgain}
              className="bt-btn-green w-full py-2.5 sm:py-3 rounded-xl font-black text-sm sm:text-base uppercase tracking-wider cursor-pointer whitespace-nowrap"
            >
              Chơi Ván Mới
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
