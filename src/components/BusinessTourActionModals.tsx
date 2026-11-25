import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Flame, Plane, Shield, Trophy, X, Zap } from 'lucide-react';
import { BOARD_TILES, COLOR_GROUP_META } from '../game/boardData';
import {
  applyChampionshipHost,
  BOARD_SIDES,
  calculateBuyoutPrice,
  calculateRent,
  canUpgradeProperty,
  CHAMPIONSHIP_FEE,
  formatBusinessTourCompact,
  formatBusinessTourSpaced,
  getValidTacticalCardTargets,
  isValidWorldTourTarget,
  ownsFullColorGroup,
  resolveWorldTourMovement,
  START_SALARY,
  WORLD_TOUR_FEE,
  wouldOwnTileWinMatch,
} from '../game/rules';
import {
  MatchBoardModifiers,
  MatchMode,
  PlayerState,
  PropertyState,
  TacticalCardActionKind,
  TileKind,
} from '../game/types';
import { resolveDeedGroupPalette } from '../three/textures';
import { CityLandmarkBadge } from './CityLandmarkBadge';
import { BuildingLevelVisual } from './GameUiPrimitives';
import { PlayerAvatar3D } from './PlayerAvatar3D';
import { useDialogFocusTrap } from './TileModalAndDialogs';

/* ============================================================================
 * 1. BUSINESS TOUR UPGRADE MODAL (On-Tile Revisit)
 * ============================================================================ */
interface UpgradeDecisionModalProps {
  tileIndex: number;
  player: PlayerState;
  properties: Record<number, PropertyState>;
  boardModifiers: MatchBoardModifiers;
  players?: PlayerState[];
  matchMode?: MatchMode;
  trapFocus?: boolean;
  onUpgradeToLevel: (targetLevel: number) => void;
  onSkip: () => void;
}

export const UpgradeDecisionModal: React.FC<UpgradeDecisionModalProps> = ({
  tileIndex,
  player,
  properties,
  boardModifiers,
  players = [],
  matchMode = 'FFA',
  trapFocus = true,
  onUpgradeToLevel,
  onSkip,
}) => {
  const dialogRef = useRef<HTMLDivElement>(null);
  useDialogFocusTrap(dialogRef, trapFocus);

  const tile = BOARD_TILES[tileIndex];
  const prop = properties[tileIndex];
  const currentLevel = prop?.level ?? 0;

  const options = useMemo(() => {
    const list: Array<{
      level: number;
      label: string;
      note?: string;
      lockReason?: string;
      cost: number;
      rentAfter: number;
      allowed: boolean;
    }> = [];

    for (let lvl = currentLevel + 1; lvl <= 4; lvl++) {
      const check = canUpgradeProperty(player, tileIndex, properties, {
        isOnTileLanding: true,
        targetLevel: lvl,
      });
      const simProps: Record<number, PropertyState> = {
        ...properties,
        [tileIndex]: {
          ...prop,
          tileIndex,
          ownerId: player.id,
          level: lvl,
        },
      };
      list.push({
        level: lvl,
        label: lvl === 4 ? 'Khách Sạn Biểu Tượng (Cấp 4 ★)' : `Nhà Cấp ${lvl}`,
        note: lvl === 4 ? 'Miễn mua đứt & chống Động đất' : undefined,
        lockReason: check.allowed ? undefined : check.reason,
        cost: check.cost,
        rentAfter: calculateRent(tileIndex, simProps, boardModifiers, players, matchMode),
        allowed: check.allowed,
      });
    }
    return list;
  }, [boardModifiers, currentLevel, matchMode, player, players, prop, properties, tileIndex]);

  const defaultTarget = useMemo(() => {
    const allowed = options.filter((o) => o.allowed);
    if (allowed.length === 0) return currentLevel + 1;
    return allowed[allowed.length - 1].level;
  }, [currentLevel, options]);

  const [selectedLevel, setSelectedLevel] = useState<number>(defaultTarget);

  useEffect(() => {
    setSelectedLevel(defaultTarget);
  }, [tileIndex, defaultTarget]);

  const selectedOpt = options.find((o) => o.level === selectedLevel) || options[0];
  const upgPal = resolveDeedGroupPalette(tile.group, tile.groupColor);

  return (
    <div
      ref={dialogRef}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-labelledby="upgrade-modal-title"
      data-testid="upgrade-decision-modal"
      className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-25 w-[min(460px,93vw)] max-h-[calc(100dvh-1.5rem)] flex flex-col bt-casual-modal rounded-2xl overflow-hidden animate-pop-in pointer-events-auto"
    >
      <div
        className="shrink-0 px-5 py-3.5 text-white border-b border-black/15 flex items-center justify-between gap-2.5"
        style={{
          background: `linear-gradient(180deg, ${upgPal.topHex} 0%, ${upgPal.bottomHex} 100%)`,
          textShadow: '0 1px 2px rgba(15, 23, 42, 0.4)',
        }}
      >
        <div className="flex items-center gap-3 min-w-0">
          <CityLandmarkBadge tileIndex={tileIndex} size={46} />
          <div className="min-w-0">
            <div className="text-[10px] font-extrabold uppercase tracking-wider text-white/90">
              {`Nâng Cấp Đô Thị · Vòng ${player.laps + 1}`}
            </div>
            <h3
              id="upgrade-modal-title"
              className="font-display text-xl sm:text-2xl font-black uppercase leading-tight text-white truncate"
            >
              {tile.name}
            </h3>
          </div>
        </div>
        <div className="text-right text-xs font-extrabold text-white shrink-0 bg-black/25 rounded-lg px-2.5 py-1">
          {currentLevel === 0 ? 'Đất trống' : `Cấp ${currentLevel}`}
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto slim-scroll p-4 sm:p-5 space-y-2.5">
        <div className="text-[11px] font-bold text-[#525e73]">
          {player.laps === 0
            ? 'Vòng 1 xây tối đa 2 Nhà (qua Bắt Đầu mở Cấp 3).'
            : currentLevel < 3
              ? 'Chọn cấp công trình muốn nâng cấp:'
              : 'Đã đủ 3 Nhà — sẵn sàng lên Khách sạn Biểu tượng (★):'}
        </div>

        <div className="space-y-1.5">
          {options.map((opt) => {
            const isSelected = opt.level === selectedLevel;
            return (
              <button
                key={opt.level}
                type="button"
                disabled={!opt.allowed}
                onClick={() => setSelectedLevel(opt.level)}
                className={`w-full px-3.5 py-2.5 rounded-xl border flex items-center justify-between gap-2.5 text-left transition-all cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed ${
                  isSelected && opt.allowed
                    ? 'bg-emerald-50 border-emerald-600 ring-1 ring-emerald-500/25'
                    : 'bg-white border-[#ded8ca] hover:border-[#b7ae9c]'
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <BuildingLevelVisual level={opt.level} className="h-6 w-7 shrink-0" />
                  <div className="min-w-0">
                    <div className="flex items-baseline gap-1.5 flex-wrap">
                      <span className="font-display text-sm font-black text-[#141c2b]">
                        {opt.label}
                      </span>
                      {opt.note && (
                        <span className="text-[10.5px] font-bold text-rose-700">
                          · {opt.note}
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-[#525e73] mt-0.5">
                      Thuê mới:{' '}
                      <span className="font-mono-num font-extrabold text-emerald-700">
                        {formatBusinessTourCompact(opt.rentAfter)}
                      </span>
                    </div>
                    {opt.lockReason && (
                      <div className="text-[10px] font-bold text-rose-600 mt-0.5 leading-snug">
                        {opt.lockReason}
                      </div>
                    )}
                  </div>
                </div>
                <span className="font-mono-num text-sm sm:text-base font-black text-[#141c2b] shrink-0">
                  -{formatBusinessTourCompact(opt.cost)}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="shrink-0 px-4 sm:px-5 py-3 bg-[#f3efe6] border-t border-[#dad3c4] grid grid-cols-2 gap-2.5">
        <button
          type="button"
          data-testid="bt-confirm-upgrade-btn"
          disabled={!selectedOpt?.allowed}
          onClick={() => selectedOpt?.allowed && onUpgradeToLevel(selectedOpt.level)}
          className="bt-btn-green py-2.5 px-3 rounded-xl disabled:opacity-40 font-black text-xs sm:text-sm uppercase tracking-wide cursor-pointer whitespace-normal leading-tight"
        >
          {selectedOpt?.allowed
            ? `Nâng Cấp (-${formatBusinessTourCompact(selectedOpt.cost)})`
            : 'Chưa Đủ Điều Kiện'}
        </button>
        <button
          type="button"
          onClick={onSkip}
          className="bt-btn-white py-2.5 px-3 rounded-xl font-extrabold text-xs sm:text-sm uppercase tracking-wide cursor-pointer whitespace-normal leading-tight"
        >
          Giữ Nguyên
        </button>
      </div>
    </div>
  );
};

/* ============================================================================
 * 2. BUSINESS TOUR OPPONENT CITY BUYOUT MODAL (2x Takeover after paying rent!)
 * ============================================================================ */
interface BuyoutDecisionModalProps {
  tileIndex: number;
  buyer: PlayerState;
  owner: PlayerState;
  players?: PlayerState[];
  properties: Record<number, PropertyState>;
  boardModifiers: MatchBoardModifiers;
  matchMode?: MatchMode;
  rentPaid: number;
  trapFocus?: boolean;
  onConfirmBuyout: () => void;
  onSkipBuyout: () => void;
}

export const BuyoutDecisionModal: React.FC<BuyoutDecisionModalProps> = ({
  tileIndex,
  buyer,
  owner,
  players = [],
  properties,
  boardModifiers,
  matchMode = 'FFA',
  rentPaid,
  trapFocus = true,
  onConfirmBuyout,
  onSkipBuyout,
}) => {
  const dialogRef = useRef<HTMLDivElement>(null);
  useDialogFocusTrap(dialogRef, trapFocus);

  const tile = BOARD_TILES[tileIndex];
  const prop = properties[tileIndex];
  const level = prop?.level ?? 0;
  const buyoutCost = calculateBuyoutPrice(tileIndex, level);

  const rentAfterBuyout = useMemo(() => {
    const simProps: Record<number, PropertyState> = {
      ...properties,
      [tileIndex]: { tileIndex, ownerId: buyer.id, level },
    };
    return calculateRent(tileIndex, simProps, boardModifiers, players, matchMode);
  }, [boardModifiers, buyer.id, level, matchMode, players, properties, tileIndex]);

  const strategicBonus = useMemo(() => {
    const instantWin = wouldOwnTileWinMatch(buyer.id, tileIndex, players, properties, matchMode);
    if (instantWin) {
      return `Mua đứt thành công sẽ THẮNG NGAY (${
        instantWin.condition === 'TRIPLE_MONOPOLY'
          ? 'Độc quyền 3 bộ màu'
          : instantWin.condition === 'SIDE_MONOPOLY'
            ? 'Thống trị cả cạnh bàn cờ'
            : 'Chiến thắng đặc biệt'
      })!`;
    }
    const buyerTeamIds =
      matchMode === 'TEAMS_2V2' && buyer.teamId !== undefined && players.length > 0
        ? new Set(
            players.filter((p) => !p.bankrupt && p.teamId === buyer.teamId).map((p) => p.id)
          )
        : new Set([buyer.id]);

    if (tile.group) {
      const groupIndices = COLOR_GROUP_META[tile.group].tileIndices;
      const completesMono = groupIndices.every((idx) => {
        if (idx === tileIndex) return true;
        const oid = properties[idx]?.ownerId;
        return oid !== null && oid !== undefined && buyerTeamIds.has(oid);
      });
      if (completesMono) {
        return `Hoàn tất trọn bộ màu ${COLOR_GROUP_META[tile.group].label} (×2 tiền thuê)!`;
      }
      if (ownsFullColorGroup(owner.id, tile.group, properties, players, matchMode)) {
        return `Phá vỡ thế Độc quyền màu của ${owner.name}!`;
      }
    }
    const completesSide = BOARD_SIDES.find(
      (side) =>
        side.tileIndices.includes(tileIndex) &&
        side.tileIndices.every((idx) => {
          if (idx === tileIndex) return true;
          const oid = properties[idx]?.ownerId;
          return oid !== null && oid !== undefined && buyerTeamIds.has(oid);
        })
    );
    if (completesSide) {
      return `Mua thành công sẽ THẮNG NGAY (${completesSide.label})!`;
    }
    return null;
  }, [buyer.id, buyer.teamId, matchMode, owner.id, owner.name, players, properties, tile.group, tileIndex]);

  return (
    <div
      ref={dialogRef}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-labelledby="buyout-modal-title"
      data-testid="buyout-decision-modal"
      className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-25 w-[min(450px,93vw)] max-h-[calc(100dvh-1.5rem)] flex flex-col bt-casual-modal rounded-2xl overflow-hidden animate-pop-in pointer-events-auto"
    >
      <div className="shrink-0 bt-header-sky px-5 py-3.5 flex items-center justify-between gap-2">
        <div>
          <div className="text-[10px] font-extrabold uppercase tracking-wider text-amber-300">
            Quyền Thâu Tóm Đô Thị (Giá 2×)
          </div>
          <h3
            id="buyout-modal-title"
            className="font-display text-xl sm:text-2xl font-black uppercase leading-tight text-white"
          >
            Mua Lại {tile.name}?
          </h3>
        </div>
        <div className="text-right shrink-0">
          <div className="text-[9.5px] font-bold uppercase text-slate-300">Giá mua lại</div>
          <div className="font-mono-num text-lg font-black text-amber-300 leading-none">
            {formatBusinessTourCompact(buyoutCost)}
          </div>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto slim-scroll p-4 sm:p-5 space-y-3">
        <div className="flex items-center justify-between gap-3 p-3 rounded-xl bg-white border border-[#ded8ca]">
          <div className="flex items-center gap-2.5 min-w-0">
            <PlayerAvatar3D
              archetype={owner.tokenType}
              phaseSeed={owner.id}
              size="sm"
            />
            <div className="min-w-0">
              <div className="text-[11px] font-medium text-[#64748b]">Chủ hiện tại</div>
              <div className="font-display text-sm font-black text-[#141c2b] truncate">
                {owner.name}
              </div>
            </div>
          </div>
          <div className="text-right text-xs">
            <div className="text-[#64748b] font-medium">Hiện trạng</div>
            <div className="font-extrabold text-[#141c2b]">
              {level === 0 ? 'Đất khởi điểm' : `Nhà Cấp ${level}`}
            </div>
          </div>
        </div>

        <p className="text-xs text-[#334155] leading-relaxed">
          Bạn vừa trả{' '}
          <span className="font-mono-num font-black text-rose-600">
            {formatBusinessTourCompact(rentPaid)}
          </span>{' '}
          phí thuê. Chi{' '}
          <span className="font-mono-num font-black text-[#141c2b]">
            {formatBusinessTourCompact(buyoutCost)}
          </span>{' '}
          để mua đứt {tile.name} (giữ nguyên cấp nhà, phí thuê mới:{' '}
          <span className="font-mono-num font-black text-emerald-700">
            {formatBusinessTourCompact(rentAfterBuyout)}
          </span>
          ).
        </p>

        {strategicBonus && (
          <div className="px-3.5 py-2 rounded-xl bg-amber-50 border border-amber-300 text-xs font-extrabold text-amber-950">
            Lợi thế: {strategicBonus}
          </div>
        )}
      </div>

      <div className="shrink-0 px-4 sm:px-5 py-3 bg-[#f3efe6] border-t border-[#dad3c4] grid grid-cols-2 gap-2.5">
        <button
          type="button"
          disabled={buyer.cash < buyoutCost}
          onClick={onConfirmBuyout}
          className="bt-btn-gold py-2.5 px-3 rounded-xl disabled:opacity-40 font-black text-xs sm:text-sm uppercase tracking-wide cursor-pointer whitespace-normal leading-tight"
        >
          Thâu Tóm (-{formatBusinessTourCompact(buyoutCost)})
        </button>
        <button
          type="button"
          onClick={onSkipBuyout}
          className="bt-btn-white py-2.5 px-3 rounded-xl font-extrabold text-xs sm:text-sm uppercase tracking-wide cursor-pointer whitespace-normal leading-tight"
        >
          Bỏ Qua
        </button>
      </div>
    </div>
  );
};

/* ============================================================================
 * 3. COMPACT DOCKED WORLD CHAMPIONSHIPS SELECTOR
 * ============================================================================ */
interface ChampionshipDecisionModalProps {
  player: PlayerState;
  players?: PlayerState[];
  properties: Record<number, PropertyState>;
  boardModifiers: MatchBoardModifiers;
  matchMode?: MatchMode;
  isFree: boolean;
  onSelectCity: (tileIndex: number) => void;
  onSkip: () => void;
}

export const ChampionshipDecisionModal: React.FC<ChampionshipDecisionModalProps> = ({
  player,
  players = [],
  properties,
  boardModifiers,
  matchMode = 'FFA',
  isFree,
  onSelectCity,
  onSkip,
}) => {
  const fee = isFree ? 0 : CHAMPIONSHIP_FEE;
  const nextMult =
    boardModifiers.championshipMultiplier < 2
      ? 2
      : boardModifiers.championshipMultiplier + 1;

  const candidateCities = useMemo(() => {
    return Object.values(properties)
      .filter(
        (pr) => pr.ownerId === player.id && BOARD_TILES[pr.tileIndex]?.kind === TileKind.PROPERTY
      )
      .map((pr) => {
        const tile = BOARD_TILES[pr.tileIndex];
        const nextMods = applyChampionshipHost(boardModifiers, pr.tileIndex);
        const projectedRent = calculateRent(pr.tileIndex, properties, nextMods, players, matchMode);
        return {
          tileIndex: pr.tileIndex,
          name: tile.name,
          color: tile.groupColor || player.color,
          level: pr.level,
          projectedRent,
          isFestival: boardModifiers.festivalTileIndices.includes(pr.tileIndex),
          isCurrentCup: boardModifiers.championshipTileIndex === pr.tileIndex,
        };
      })
      .sort((a, b) => b.projectedRent - a.projectedRent);
  }, [boardModifiers, matchMode, player.color, player.id, players, properties]);

  return (
    <div
      data-testid="championship-decision-modal"
      role="region"
      aria-label="Chọn thành phố đặt Cúp Quốc Gia"
      className="fixed bottom-3 sm:bottom-4 left-1/2 -translate-x-1/2 z-25 w-[min(560px,94vw)] max-h-[calc(100dvh-1.5rem)] flex flex-col bt-casual-modal rounded-2xl overflow-hidden animate-pop-in pointer-events-auto"
    >
      <div className="shrink-0 bt-header-sky px-4 sm:px-5 py-2.5 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[10px] font-extrabold uppercase tracking-wider text-amber-300">
            {fee === 0
              ? 'Đăng Cai Cúp Quốc Gia · Miễn Phí 0K'
              : `Sân Vận Động Trung Tâm · Phí ${formatBusinessTourCompact(fee)}`}
          </div>
          <h3 className="font-display text-base sm:text-lg font-black uppercase leading-tight text-white flex items-center gap-1.5 truncate">
            <Trophy className="h-4 w-4 text-amber-400 shrink-0" aria-hidden="true" />
            <span className="truncate">Chọn Thành Phố Đặt Cúp (×{nextMult})</span>
          </h3>
        </div>
        <button
          type="button"
          onClick={onSkip}
          className="px-3 py-1.5 rounded-lg bg-white/15 hover:bg-white/25 text-xs font-extrabold text-white cursor-pointer whitespace-nowrap shrink-0"
        >
          Bỏ Qua
        </button>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto slim-scroll p-3 sm:p-3.5 space-y-2">
        <p className="text-[11px] sm:text-xs text-[#525e73] leading-snug">
          Nhấn trực tiếp vào <strong className="font-bold text-[#141c2b]">thành phố của bạn trên bàn cờ 3D</strong> hoặc chọn nhanh để nhân <strong className="font-black text-amber-700">×{nextMult}</strong> tiền thuê:
        </p>

        <div className="max-h-36 overflow-y-auto slim-scroll grid grid-cols-1 sm:grid-cols-2 gap-1.5 pr-1">
          {candidateCities.map((city) => (
            <button
              key={city.tileIndex}
              type="button"
              onClick={() => onSelectCity(city.tileIndex)}
              className="px-3 py-2 rounded-xl bg-white hover:bg-amber-50 border border-[#ded8ca] hover:border-amber-400 flex items-center justify-between gap-2 text-left transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className="h-5 w-1.5 rounded-full shrink-0"
                  style={{ backgroundColor: city.color }}
                />
                <div className="min-w-0">
                  <div className="font-display text-xs font-black text-[#141c2b] truncate">
                    {city.name}
                    {city.isFestival ? ' · Lễ Hội' : ''}
                    {city.isCurrentCup ? ' · Đang giữ Cúp' : ''}
                  </div>
                  <div className="text-[10px] font-semibold text-[#64748b]">
                    {city.level === 4
                      ? 'Khách sạn ★'
                      : city.level > 0
                        ? `Nhà Cấp ${city.level}`
                        : 'Đất trống'}
                  </div>
                </div>
              </div>
              <div className="font-mono-num text-xs font-black text-emerald-700 shrink-0">
                {formatBusinessTourCompact(city.projectedRent)}
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

/* ============================================================================
 * 4. COMPACT DOCKED WORLD TOUR FLIGHT SELECTOR
 * ============================================================================ */
interface WorldTourPromptProps {
  player: PlayerState;
  players?: PlayerState[];
  properties: Record<number, PropertyState>;
  boardModifiers?: MatchBoardModifiers;
  matchMode?: MatchMode;
  onSelectTargetTile: (targetTileIndex: number) => void;
  onSkipWorldTour: () => void;
}

export const WorldTourPrompt: React.FC<WorldTourPromptProps> = ({
  player,
  players = [],
  properties,
  boardModifiers: _boardModifiers,
  matchMode = 'FFA',
  onSelectTargetTile,
  onSkipWorldTour,
}) => {
  const recommendedDestinations = useMemo(() => {
    const picks: Array<{ tileIndex: number; tag: string }> = [];
    const seen = new Set<number>();

    const validTiles = BOARD_TILES.filter((t) =>
      isValidWorldTourTarget(player, t.index, properties)
    );

    const teamOwnerIds =
      matchMode === 'TEAMS_2V2' && player.teamId !== undefined && players.length > 0
        ? new Set(
            players.filter((p) => !p.bankrupt && p.teamId === player.teamId).map((p) => p.id)
          )
        : new Set([player.id]);

    for (const t of validTiles) {
      if (!isPurchasableTileSafe(t.kind)) continue;
      if (properties[t.index]?.ownerId !== null || !t.price) continue;
      const move = resolveWorldTourMovement(player.position, t.index);
      const budget = player.cash + (move.passedStart ? START_SALARY : 0) - WORLD_TOUR_FEE;
      if (budget < t.price) continue;

      const instantWin = wouldOwnTileWinMatch(player.id, t.index, players, properties, matchMode);
      if (instantWin && !seen.has(t.index)) {
        const winTag =
          instantWin.condition === 'RESORT_MONOPOLY'
            ? 'Đủ 4 Khu nghỉ dưỡng (THẮNG)!'
            : instantWin.condition === 'TRIPLE_MONOPOLY'
              ? 'Đủ 3 bộ màu (THẮNG)!'
              : 'Thắng Cạnh (THẮNG)!';
        picks.push({ tileIndex: t.index, tag: winTag });
        seen.add(t.index);
        continue;
      }

      if (t.group && !seen.has(t.index)) {
        const grp = COLOR_GROUP_META[t.group];
        const owned = grp.tileIndices.filter((i) => {
          const oid = properties[i]?.ownerId;
          return oid !== null && oid !== undefined && teamOwnerIds.has(oid);
        }).length;
        if (owned === grp.tileIndices.length - 1) {
          picks.push({ tileIndex: t.index, tag: `Đủ bộ ${grp.label}` });
          seen.add(t.index);
        }
      }
    }

    for (const pr of Object.values(properties)) {
      if (picks.length >= 6) break;
      if (
        pr.ownerId !== player.id ||
        BOARD_TILES[pr.tileIndex]?.kind !== TileKind.PROPERTY ||
        pr.level >= 4 ||
        !isValidWorldTourTarget(player, pr.tileIndex, properties) ||
        seen.has(pr.tileIndex)
      ) {
        continue;
      }
      const move = resolveWorldTourMovement(player.position, pr.tileIndex);
      const simPlayer: PlayerState = {
        ...player,
        laps: player.laps + move.lapsDelta,
        cash: player.cash + (move.passedStart ? START_SALARY : 0) - WORLD_TOUR_FEE,
      };
      let bestTargetLevel: number | null = null;
      for (let lvl = 4; lvl > pr.level; lvl--) {
        if (
          canUpgradeProperty(simPlayer, pr.tileIndex, properties, {
            isOnTileLanding: true,
            targetLevel: lvl,
          }).allowed
        ) {
          bestTargetLevel = lvl;
          break;
        }
      }
      if (bestTargetLevel !== null) {
        picks.push({
          tileIndex: pr.tileIndex,
          tag:
            bestTargetLevel === 4
              ? 'Nâng lên Khách sạn ★'
              : `Nâng lên Nhà Cấp ${bestTargetLevel}`,
        });
        seen.add(pr.tileIndex);
      }
    }

    for (const t of [...validTiles].reverse()) {
      if (picks.length >= 6) break;
      const move = resolveWorldTourMovement(player.position, t.index);
      const postFlightCash = player.cash + (move.passedStart ? START_SALARY : 0);
      if (
        isPurchasableTileSafe(t.kind) &&
        properties[t.index]?.ownerId === null &&
        !seen.has(t.index) &&
        postFlightCash >= WORLD_TOUR_FEE + (t.price ?? 0)
      ) {
        picks.push({
          tileIndex: t.index,
          tag:
            t.kind === TileKind.RESORT
              ? `Khu nghỉ dưỡng (${formatBusinessTourCompact(t.price ?? 0)})`
              : `Đất trống ${formatBusinessTourCompact(t.price ?? 0)}`,
        });
        seen.add(t.index);
      }
    }

    return picks.slice(0, 6);
  }, [matchMode, player, players, properties]);

  return (
    <div
      data-testid="world-tour-modal"
      role="region"
      aria-label="Chọn điểm đến Du Lịch Xuyên Việt"
      className="fixed bottom-3 sm:bottom-4 left-1/2 -translate-x-1/2 z-25 w-[min(580px,94vw)] max-h-[calc(100dvh-1.5rem)] flex flex-col bt-casual-modal rounded-2xl overflow-hidden animate-pop-in pointer-events-auto"
    >
      <div className="shrink-0 bt-header-green px-4 sm:px-5 py-2.5 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[10px] font-extrabold uppercase tracking-wider text-emerald-200">
            Chuyến Bay Đầu Lượt · Vé Bay {formatBusinessTourCompact(WORLD_TOUR_FEE)}
          </div>
          <h3 className="font-display text-base sm:text-lg font-black uppercase leading-tight text-white flex items-center gap-1.5 truncate">
            <Plane className="h-4 w-4 text-emerald-200 shrink-0" aria-hidden="true" />
            <span className="truncate">Du Lịch Xuyên Việt — Chọn Điểm Đến</span>
          </h3>
        </div>
        <button
          type="button"
          onClick={onSkipWorldTour}
          className="px-3 py-1.5 rounded-lg bg-white/15 hover:bg-white/25 text-xs font-extrabold text-white cursor-pointer whitespace-nowrap shrink-0"
        >
          Đổ Xúc Xắc Thường
        </button>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto slim-scroll p-3 sm:p-3.5 space-y-2">
        <p className="text-[11px] sm:text-xs text-[#525e73] leading-snug">
          Nhấn vào <strong className="font-bold text-[#141c2b]">ô đất trống hoặc tài sản của bạn trên bàn cờ 3D</strong> (qua Bắt Đầu nhận{' '}
          <span className="font-mono-num font-black text-emerald-700">
            +{formatBusinessTourSpaced(START_SALARY)}
          </span>
          ) hoặc chọn nhanh:
        </p>

        <div className="max-h-36 overflow-y-auto slim-scroll grid grid-cols-2 sm:grid-cols-3 gap-1.5 pr-1">
          {recommendedDestinations.map((item) => {
            const t = BOARD_TILES[item.tileIndex];
            return (
              <button
                key={item.tileIndex}
                type="button"
                onClick={() => onSelectTargetTile(item.tileIndex)}
                className="p-2 rounded-xl bg-white hover:bg-[#efece4] border border-[#ded8ca] hover:border-[#b7ae9c] text-left transition-colors cursor-pointer"
              >
                <div className="font-display text-xs font-black text-[#141c2b] truncate">
                  {t.name}
                </div>
                <div className="text-[10px] font-bold text-emerald-700 truncate mt-0.5">
                  {item.tag}
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};

function isPurchasableTileSafe(kind: TileKind): boolean {
  return kind === TileKind.PROPERTY || kind === TileKind.RESORT;
}

/* ============================================================================
 * 5. COMPACT DOCKED TACTICAL CHANCE CARD TARGET SELECTOR
 * ============================================================================ */
interface TacticalCardTargetModalProps {
  kind: TacticalCardActionKind;
  player: PlayerState;
  players: PlayerState[];
  properties: Record<number, PropertyState>;
  boardModifiers: MatchBoardModifiers;
  matchMode?: MatchMode;
  onSelectTarget: (tileIndex: number) => void;
  onSkip: () => void;
}

export const TacticalCardTargetModal: React.FC<TacticalCardTargetModalProps> = ({
  kind,
  player,
  players,
  properties,
  boardModifiers,
  matchMode = 'FFA',
  onSelectTarget,
  onSkip,
}) => {
  const meta =
    kind === 'SHIELD_CITY'
      ? {
          badge: 'Thẻ Chiến Thuật Phòng Thủ',
          title: 'Chọn Thành Phố Của Bạn Để Dựng Khiên',
          hint: 'Khiên Bảo Hộ chặn Mua đứt 2× và hấp thụ 1 đòn Động đất hoặc Mất điện.',
          headerClass: 'bt-header-sky',
          icon: <Shield className="h-4 w-4 text-sky-300 shrink-0" aria-hidden="true" />,
        }
      : kind === 'POWER_OUTAGE'
        ? {
            badge: 'Thẻ Chiến Thuật Tấn Công',
            title: 'Chọn Đô Thị Đối Thủ Để Cắt Điện (Thuê = 0K)',
            hint: 'Nhấn trực tiếp vào đô thị đối thủ trên bàn cờ 3D hoặc chọn trong danh sách:',
            headerClass: 'bt-header-pink',
            icon: <Zap className="h-4 w-4 text-amber-300 shrink-0" aria-hidden="true" />,
          }
        : {
            badge: 'Thẻ Chiến Thuật Tấn Công',
            title: 'Chọn Thành Phố Đối Thủ Để Gây Địa Chấn',
            hint: 'Hạ 1 cấp nhà của đối thủ, hoặc san phẳng đất trống về Ngân hàng (Khách sạn ★ miễn nhiễm):',
            headerClass: 'bt-header-pink',
            icon: <Flame className="h-4 w-4 text-amber-300 shrink-0" aria-hidden="true" />,
          };

  const candidates = useMemo(() => {
    const valid = getValidTacticalCardTargets(
      kind,
      player.id,
      properties,
      boardModifiers,
      players,
      matchMode
    );
    const shieldSet = new Set(boardModifiers.shieldedTileIndices ?? []);
    return valid
      .map((idx) => {
        const tile = BOARD_TILES[idx];
        const pr = properties[idx];
        const owner = players.find((p) => p.id === pr?.ownerId);
        return {
          tileIndex: idx,
          name: tile.name,
          ownerName: owner?.name || '',
          color: owner?.color || tile.groupColor || '#182232',
          level: pr?.level ?? 0,
          isResort: tile.kind === TileKind.RESORT,
          isShielded: shieldSet.has(idx),
          rent: calculateRent(idx, properties, boardModifiers, players, matchMode),
        };
      })
      .filter((c) => c.ownerName.length > 0)
      .sort((a, b) => b.rent - a.rent);
  }, [boardModifiers, kind, matchMode, player.id, players, properties]);

  return (
    <div
      data-testid="tactical-card-target-modal"
      role="region"
      aria-label={meta.title}
      className="fixed bottom-3 sm:bottom-4 left-1/2 -translate-x-1/2 z-25 w-[min(560px,94vw)] max-h-[calc(100dvh-1.5rem)] flex flex-col bt-casual-modal rounded-2xl overflow-hidden animate-pop-in pointer-events-auto"
    >
      <div className={`shrink-0 ${meta.headerClass} px-4 sm:px-5 py-2.5 flex items-center justify-between gap-2`}>
        <div className="min-w-0">
          <div className="text-[10px] font-extrabold uppercase tracking-wider text-amber-300">
            {meta.badge}
          </div>
          <h3 className="font-display text-base sm:text-lg font-black uppercase leading-tight text-white flex items-center gap-1.5 truncate">
            {meta.icon}
            <span className="truncate">{meta.title}</span>
          </h3>
        </div>
        <button
          type="button"
          onClick={onSkip}
          className="px-3 py-1.5 rounded-lg bg-white/15 hover:bg-white/25 text-xs font-extrabold text-white cursor-pointer whitespace-nowrap shrink-0"
        >
          Bỏ Qua
        </button>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto slim-scroll p-3 sm:p-3.5 space-y-2">
        <p className="text-[11px] sm:text-xs text-[#525e73] leading-snug">{meta.hint}</p>

        <div className="max-h-36 overflow-y-auto slim-scroll grid grid-cols-1 sm:grid-cols-2 gap-1.5 pr-1">
          {candidates.map((c) => (
            <button
              key={c.tileIndex}
              type="button"
              onClick={() => onSelectTarget(c.tileIndex)}
              className="px-3 py-2 rounded-xl bg-white hover:bg-[#efece4] border border-[#ded8ca] hover:border-[#b7ae9c] flex items-center justify-between gap-2 text-left transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className="h-5 w-1.5 rounded-full shrink-0"
                  style={{ backgroundColor: c.color }}
                />
                <div className="min-w-0">
                  <div className="font-display text-xs font-black text-[#141c2b] flex items-center gap-1 truncate">
                    <span className="truncate">{c.name}</span>
                    {c.isShielded && <Shield className="h-3 w-3 text-sky-600 shrink-0" aria-hidden="true" />}
                  </div>
                  <div className="text-[10px] font-semibold text-[#64748b] truncate">
                    {kind === 'SHIELD_CITY' ? '' : `${c.ownerName} · `}
                    {c.isResort
                      ? 'Khu nghỉ dưỡng'
                      : c.level === 4
                        ? 'Khách sạn ★'
                        : c.level > 0
                          ? `Nhà Cấp ${c.level}`
                          : 'Đất trống'}
                  </div>
                </div>
              </div>
              <div className="font-mono-num text-xs font-black text-rose-700 shrink-0">
                {formatBusinessTourCompact(c.rent)}
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

/* ============================================================================
 * 6. CLEAN RULEBOOK MODAL
 * ============================================================================ */
interface RulebookModalProps {
  onClose: () => void;
}

export const RulebookModal: React.FC<RulebookModalProps> = ({ onClose }) => {
  const dialogRef = useRef<HTMLDivElement>(null);
  useDialogFocusTrap(dialogRef, true);

  return (
    <div
      data-testid="rulebook-modal"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-slate-950/50 pointer-events-auto"
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="rulebook-modal-title"
        className="w-full max-w-2xl bt-casual-modal rounded-2xl overflow-hidden animate-pop-in flex flex-col max-h-[calc(100dvh-1.5rem)]"
      >
        <div className="shrink-0 bt-header-sky px-5 sm:px-6 py-4 flex items-center justify-between gap-3">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-wider text-amber-300">
              Cẩm Nang Quy Tắc Business Tour 32 Ô Chuẩn Hóa
            </div>
            <h2
              id="rulebook-modal-title"
              className="font-display text-xl sm:text-2xl font-black uppercase text-white"
            >
              Sổ Tay Luật Cờ Tỷ Phú 3D
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng sổ tay luật chơi"
            className="icon-hit-target h-8 w-8 rounded-full bg-white/15 hover:bg-white/25 flex items-center justify-center text-white cursor-pointer shrink-0"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <div className="flex-1 min-h-0 p-5 sm:p-6 overflow-y-auto slim-scroll space-y-3 text-xs sm:text-sm text-[#334155]">
          <section className="p-3.5 rounded-xl bg-white border border-[#ded8ca] space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded-md bg-[#182232] text-amber-300 font-mono-num text-[11px] font-black">
                01
              </span>
              <h3 className="font-display font-black text-[#141c2b]">
                Xây Công Trình · Lên Khách Sạn ★ &amp; Ô Bắt Đầu
              </h3>
            </div>
            <p className="text-xs leading-relaxed">
              Đi qua hoặc dừng tại <strong className="font-bold text-emerald-700">Ô Bắt Đầu (Ô 0)</strong> nhận lương <strong className="font-mono-num text-emerald-700">+300K</strong> và mở khóa Vòng mới. Vòng 1 xây tối đa <strong className="font-bold text-[#141c2b]">2 Nhà</strong>; từ Vòng 2 trở đi xây tối đa <strong className="font-bold text-[#141c2b]">3 Nhà</strong>. Chỉ nâng cấp lên <strong className="font-bold text-rose-700">Khách sạn Biểu tượng (★)</strong> khi ghé lại thành phố đã có sẵn <strong className="font-bold text-[#141c2b]">3 Nhà</strong>.
            </p>
          </section>

          <section className="p-3.5 rounded-xl bg-white border border-[#ded8ca] space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded-md bg-[#182232] text-amber-300 font-mono-num text-[11px] font-black">
                02
              </span>
              <h3 className="font-display font-black text-[#141c2b]">
                Thâu Tóm Đô Thị (Mua Lại 2×) · Khu Nghỉ Dưỡng &amp; Khiên Bảo Hộ
              </h3>
            </div>
            <p className="text-xs leading-relaxed">
              Sau khi trả đủ tiền thuê tại thành phố Cấp 0–3 của đối thủ, bạn có thể chi <strong className="font-bold text-amber-700">2× tổng vốn đầu tư</strong> để mua đứt. <strong className="font-bold text-[#141c2b]">Khách sạn ★, Khu nghỉ dưỡng và thành phố có Khiên Bảo Hộ</strong> miễn nhiễm mua lại. 4 Khu nghỉ dưỡng có bảng thuê lũy tiến: <strong className="font-mono-num font-bold text-[#141c2b]">50K / 150K / 400K / 1M</strong>.
            </p>
          </section>

          <section className="p-3.5 rounded-xl bg-white border border-[#ded8ca] space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded-md bg-[#182232] text-amber-300 font-mono-num text-[11px] font-black">
                03
              </span>
              <h3 className="font-display font-black text-[#141c2b]">
                Cúp Quốc Gia (0K) · Lễ Hội (×2) · Du Lịch (50K) · Đảo Hoang &amp; Thuế
              </h3>
            </div>
            <p className="text-xs leading-relaxed">
              <strong className="font-bold text-amber-700">Cúp Quốc Gia (Ô 16, 0K)</strong>: Chỉ 1 thành phố giữ Cúp tại một thời điểm — người dừng chọn miễn phí 1 thành phố của mình đăng cai và tăng hệ số giải <strong className="font-bold text-amber-700">2× → 3× → 4×...</strong>.{' '}
              <strong className="font-bold text-[#141c2b]">Lễ Hội Đầu Mùa (×2, tùy chọn sảnh)</strong>: Chọn ngẫu nhiên 3 thành phố cố định suốt trận nhân <strong className="font-bold">×2</strong> tiền thuê.{' '}
              <strong className="font-bold text-emerald-700">Du Lịch (Ô 24, 50K)</strong>: Đầu lượt kế tiếp bay tới bất kỳ ô đất trống hoặc tài sản của chính bạn.{' '}
              <strong className="font-bold text-[#141c2b]">Đảo Hoang (Ô 8)</strong>: Đổ ra Đôi, dùng Thẻ Thoát Đảo hoặc nộp 200K; sang lượt thứ 3 tự giải cứu miễn phí <strong className="font-mono-num">0K</strong>.{' '}
              <strong className="font-bold text-rose-700">Cơ Quan Thuế (Ô 30)</strong>: Nộp <strong className="font-bold">Thuế 10%</strong> tổng vốn bất động sản.{' '}
              <strong className="font-bold text-[#141c2b]">Thẻ Cơ Hội (?)</strong>: Gồm Tiệc Sinh Nhật 25K, Địa Chấn, Mất Điện và Khiên Bảo Hộ.
            </p>
          </section>

          <section className="p-3.5 rounded-xl bg-white border border-[#ded8ca] space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded-md bg-[#182232] text-amber-300 font-mono-num text-[11px] font-black">
                04
              </span>
              <h3 className="font-display font-black text-[#141c2b]">
                Tự Động Qua Lượt · Bán Trả Nợ 100% &amp; Tùy Chọn Phòng Chờ
              </h3>
            </div>
            <p className="text-xs leading-relaxed">
              Hoàn thành hành động sẽ tự động chuyển lượt (ra Đôi lần 1–2 được đổ tiếp ngay). Khi thiếu tiền trả nợ, bán thành phố về Ngân hàng hoàn <strong className="font-bold text-emerald-700">100% vốn</strong>. Trong Phòng chờ (mặc định tắt), bạn có thể bật <strong className="font-bold text-[#141c2b]">Xúc xắc chiến thuật</strong> (Chẵn/Lẻ 3 lượt, Đổ lại 2 lượt) hoặc <strong className="font-bold text-[#141c2b]">Lễ Hội Đầu Mùa</strong>.
            </p>
          </section>

          <section className="p-3.5 rounded-xl bg-white border border-[#ded8ca] space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded-md bg-amber-400 text-[#141c2b] font-mono-num text-[11px] font-black">
                05
              </span>
              <h3 className="font-display font-black text-[#141c2b]">
                Chiến Thắng Tức Thì · Đồng Hồ 20 Phút &amp; Đấu Đội 2v2
              </h3>
            </div>
            <p className="text-xs leading-relaxed">
              Thắng ngay khi đạt <strong className="font-bold text-[#141c2b]">Độc Quyền 3 Bộ Màu</strong>, sở hữu <strong className="font-bold text-[#141c2b]">Trọn 1 Cạnh Bàn Cờ</strong>, gom đủ <strong className="font-bold text-[#141c2b]">4 Khu Nghỉ Dưỡng</strong>, hoặc người cuối cùng trụ vững. Hết <strong className="font-mono-num text-[#141c2b]">20 phút (20:00)</strong> phân định theo Tổng Tài Sản Ròng. Chế độ <strong className="font-bold text-[#141c2b]">Đấu Đội 2v2</strong> miễn tiền thuê giữa đồng đội và gộp tài sản để xét bộ độc quyền.
            </p>
          </section>
        </div>

        <div className="shrink-0 px-5 py-3 bg-[#f3efe6] border-t border-[#dad3c4] flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="bt-btn-green px-7 py-2.5 rounded-xl text-sm font-black uppercase tracking-wide cursor-pointer whitespace-nowrap"
          >
            Đã Hiểu Luật Chơi
          </button>
        </div>
      </div>
    </div>
  );
};
