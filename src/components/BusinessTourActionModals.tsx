import React, { useEffect, useMemo, useState } from 'react';
import { BOARD_TILES, COLOR_GROUP_META } from '../game/boardData';
import {
  applyChampionshipHost,
  BOARD_SIDES,
  calculateBuyoutPrice,
  calculateRent,
  canBuyoutProperty,
  canUpgradeProperty,
  CHAMPIONSHIP_FEE,
  formatBusinessTourCompact,
  formatBusinessTourSpaced,
  getStartUpgradableTileIndices,
  getValidTacticalCardTargets,
  isValidWorldTourTarget,
  ownsFullColorGroup,
  RESORT_TILE_INDICES,
  resolveWorldTourMovement,
  START_SALARY,
  WORLD_CHAMPIONSHIPS_TILE_INDEX,
  WORLD_TOUR_FEE,
  wouldOwnTileWinMatch,
} from '../game/rules';
import {
  MatchBoardModifiers,
  PlayerState,
  PropertyState,
  TacticalCardActionKind,
  TileKind,
} from '../game/types';
import { resolveDeedGroupPalette } from '../three/textures';
import { CityLandmarkBadge } from './CityLandmarkBadge';
import { PlayerAvatar3D } from './PlayerAvatar3D';

/* ============================================================================
 * 1. BUSINESS TOUR UPGRADE MODAL (On-Tile Revisit OR Remote from START Tile 0)
 * ============================================================================ */
interface UpgradeDecisionModalProps {
  tileIndex: number;
  player: PlayerState;
  properties: Record<number, PropertyState>;
  boardModifiers: MatchBoardModifiers;
  isFromStart?: boolean;
  onBackToCitySelect?: () => void;
  onUpgradeToLevel: (targetLevel: number) => void;
  onSkip: () => void;
}

export const UpgradeDecisionModal: React.FC<UpgradeDecisionModalProps> = ({
  tileIndex,
  player,
  properties,
  boardModifiers,
  isFromStart = false,
  onBackToCitySelect,
  onUpgradeToLevel,
  onSkip,
}) => {
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
        isOnTileLanding: !isFromStart,
        allowRemoteFromStart: isFromStart,
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
        rentAfter: calculateRent(tileIndex, simProps, boardModifiers),
        allowed: check.allowed,
      });
    }
    return list;
  }, [boardModifiers, currentLevel, isFromStart, player, prop, properties, tileIndex]);

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
      data-testid="upgrade-decision-modal"
      className="fixed left-1/2 top-[48%] -translate-x-1/2 -translate-y-1/2 z-25 w-[min(460px,93vw)] bt-casual-modal rounded-3xl overflow-hidden animate-pop-in pointer-events-auto"
    >
      <div
        className="px-5 py-3.5 text-white border-b-2 border-white/50 flex items-center justify-between gap-2.5"
        style={{
          background: `linear-gradient(to bottom var(--in-oklab), ${upgPal.topHex} 0%, ${upgPal.bottomHex} 100%)`,
          textShadow: '0 1.5px 2px rgba(15, 23, 42, 0.45)',
        }}
      >
        <div className="flex items-center gap-3 min-w-0">
          <CityLandmarkBadge tileIndex={tileIndex} size={48} />
          <div className="min-w-0">
            <div className="text-[10px] font-black uppercase tracking-wider text-white/90">
              {isFromStart
                ? `Đặc Quyền Ô Bắt Đầu · Vòng ${player.laps + 1}`
                : `Ghé Thăm Đô Thị Sở Hữu · Vòng ${player.laps + 1}`}
            </div>
            <h3 className="font-display text-xl sm:text-2xl font-black uppercase leading-tight text-white">
              {tile.name}
            </h3>
          </div>
        </div>
        <div className="text-right text-xs font-extrabold text-white/95 shrink-0 bg-black/20 rounded-xl px-3 py-1.5 border border-white/30">
          Hiện tại: {currentLevel === 0 ? 'Đất khởi điểm' : `Nhà Cấp ${currentLevel}`}
        </div>
      </div>

      <div className="p-4 sm:p-5 space-y-3.5">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs text-slate-700 leading-relaxed">
            {player.laps === 0
              ? 'Vòng đầu tiên cho phép xây tối đa 2 Nhà. Đi qua ô BẮT ĐẦU để mở khóa Cấp 3 & Khách sạn ★!'
              : 'Từ Vòng 2 trở đi, bạn có thể bù tiền chênh lệch để nâng thẳng lên Khách sạn Biểu tượng (★) ngay!'}
          </p>
          {isFromStart && onBackToCitySelect && (
            <button
              type="button"
              onClick={onBackToCitySelect}
              className="bt-btn-cyan px-2.5 py-1.5 rounded-xl text-[11px] font-black shrink-0 cursor-pointer whitespace-nowrap"
            >
              ← Đổi Đô Thị
            </button>
          )}
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
                className={`w-full px-3.5 py-2.5 rounded-2xl border-2 flex items-center justify-between gap-2 text-left transition-all cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed ${
                  isSelected && opt.allowed
                    ? 'bg-emerald-50 border-[#58B916] shadow-xs'
                    : 'bg-sky-50/70 border-sky-200 hover:border-sky-400'
                }`}
              >
                <div className="min-w-0">
                  <div className="flex items-baseline gap-1.5 flex-wrap">
                    <span className="font-display text-sm font-black text-slate-900">
                      {opt.label}
                    </span>
                    {opt.note && (
                      <span className="text-[11px] font-extrabold text-rose-700">
                        · {opt.note}
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-slate-600 mt-0.5">
                    Phí thuê mới:{' '}
                    <span className="font-mono-num font-extrabold text-[#16A34A]">
                      {formatBusinessTourCompact(opt.rentAfter)}
                    </span>
                  </div>
                  {opt.lockReason && (
                    <div className="text-[10px] font-bold text-rose-600 mt-0.5 leading-snug">
                      {opt.lockReason}
                    </div>
                  )}
                </div>
                <span className="font-mono-num text-base font-black text-sky-900 shrink-0">
                  -{formatBusinessTourCompact(opt.cost)}
                </span>
              </button>
            );
          })}
        </div>

        <div className="grid grid-cols-2 gap-2.5 pt-1">
          <button
            type="button"
            disabled={!selectedOpt?.allowed}
            onClick={() => selectedOpt?.allowed && onUpgradeToLevel(selectedOpt.level)}
            className="bt-btn-green py-2.5 px-4 rounded-2xl disabled:opacity-40 font-black text-sm uppercase tracking-wide cursor-pointer whitespace-nowrap"
          >
            {selectedOpt?.allowed
              ? `Nâng Cấp (-${formatBusinessTourCompact(selectedOpt.cost)})`
              : 'Chưa Đủ Điều Kiện'}
          </button>
          <button
            type="button"
            onClick={onSkip}
            className="bt-btn-white py-2.5 px-4 rounded-2xl font-black text-sm uppercase tracking-wide cursor-pointer whitespace-nowrap"
          >
            Giữ Nguyên
          </button>
        </div>
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
  properties: Record<number, PropertyState>;
  boardModifiers: MatchBoardModifiers;
  rentPaid: number;
  onConfirmBuyout: () => void;
  onSkipBuyout: () => void;
}

export const BuyoutDecisionModal: React.FC<BuyoutDecisionModalProps> = ({
  tileIndex,
  buyer,
  owner,
  properties,
  boardModifiers,
  rentPaid,
  onConfirmBuyout,
  onSkipBuyout,
}) => {
  const tile = BOARD_TILES[tileIndex];
  const prop = properties[tileIndex];
  const level = prop?.level ?? 0;
  const buyoutCost = calculateBuyoutPrice(tileIndex, level);

  const rentAfterBuyout = useMemo(() => {
    const simProps: Record<number, PropertyState> = {
      ...properties,
      [tileIndex]: { tileIndex, ownerId: buyer.id, level },
    };
    return calculateRent(tileIndex, simProps, boardModifiers);
  }, [boardModifiers, buyer.id, level, properties, tileIndex]);

  const strategicBonus = useMemo(() => {
    const instantWin = wouldOwnTileWinMatch(buyer.id, tileIndex, [], properties);
    if (instantWin) {
      return `🏆 Mua đứt thành công sẽ THẮNG NGAY (${
        instantWin.condition === 'TRIPLE_MONOPOLY'
          ? 'Độc quyền 3 bộ màu'
          : instantWin.condition === 'SIDE_MONOPOLY'
            ? 'Thống trị cả cạnh bàn cờ'
            : 'Chiến thắng đặc biệt'
      })!`;
    }
    if (tile.group) {
      const groupIndices = COLOR_GROUP_META[tile.group].tileIndices;
      const completesMono = groupIndices.every(
        (idx) => idx === tileIndex || properties[idx]?.ownerId === buyer.id
      );
      if (completesMono) {
        return `Hoàn tất trọn bộ màu ${COLOR_GROUP_META[tile.group].label} (×2 tiền thuê)!`;
      }
      if (ownsFullColorGroup(owner.id, tile.group, properties)) {
        return `Phá vỡ thế Độc quyền màu của ${owner.name}!`;
      }
    }
    const completesSide = BOARD_SIDES.find(
      (side) =>
        side.tileIndices.includes(tileIndex) &&
        side.tileIndices.every((idx) => idx === tileIndex || properties[idx]?.ownerId === buyer.id)
    );
    if (completesSide) {
      return `Mua thành công sẽ THẮNG NGAY (${completesSide.label})!`;
    }
    return null;
  }, [buyer.id, owner.id, owner.name, properties, tile.group, tileIndex]);

  return (
    <div
      data-testid="buyout-decision-modal"
      className="fixed left-1/2 top-[48%] -translate-x-1/2 -translate-y-1/2 z-25 w-[min(450px,93vw)] bt-casual-modal rounded-3xl overflow-hidden animate-pop-in pointer-events-auto"
    >
      <div className="bt-header-sky px-5 py-3.5 flex items-center justify-between gap-2">
        <div>
          <div className="text-[10px] font-black uppercase tracking-wider text-[#FEF08A]">
            Quyền Thâu Tóm Đô Thị (Giá 2×)
          </div>
          <h3 className="font-display text-xl sm:text-2xl font-black uppercase leading-tight text-white">
            Mua Lại {tile.name}?
          </h3>
        </div>
        <div className="text-right shrink-0 bg-black/20 rounded-xl px-3 py-1.5 border border-white/30">
          <div className="text-[9px] font-bold uppercase text-white/90">Giá mua lại</div>
          <div className="font-mono-num text-lg font-black text-[#FEF08A] leading-none">
            {formatBusinessTourCompact(buyoutCost)}
          </div>
        </div>
      </div>

      <div className="p-4 sm:p-5 space-y-3.5">
        <div className="flex items-center justify-between gap-3 p-3 rounded-2xl bg-sky-50 border border-sky-200">
          <div className="flex items-center gap-2.5 min-w-0">
            <PlayerAvatar3D
              archetype={owner.tokenType}
              phaseSeed={owner.id}
              size="sm"
            />
            <div className="min-w-0">
              <div className="text-[11px] font-semibold text-slate-500">Chủ hiện tại</div>
              <div className="font-display text-sm font-black text-slate-900 truncate">
                {owner.name}
              </div>
            </div>
          </div>
          <div className="text-right text-xs">
            <div className="text-slate-500 font-semibold">Hiện trạng</div>
            <div className="font-extrabold text-slate-900">
              {level === 0 ? 'Đất khởi điểm' : `Nhà Cấp ${level}`}
            </div>
          </div>
        </div>

        <p className="text-xs text-slate-700 leading-relaxed">
          Bạn vừa thanh toán{' '}
          <span className="font-mono-num font-black text-rose-600">
            {formatBusinessTourCompact(rentPaid)}
          </span>{' '}
          phí thuê. Chi{' '}
          <span className="font-mono-num font-black text-slate-900">
            {formatBusinessTourCompact(buyoutCost)}
          </span>{' '}
          để mua đứt {tile.name} (giữ nguyên cấp nhà, tiền thuê khi bạn sở hữu:{' '}
          <span className="font-mono-num font-black text-[#16A34A]">
            {formatBusinessTourCompact(rentAfterBuyout)}
          </span>
          ).
        </p>

        {strategicBonus && (
          <div className="px-3.5 py-2 rounded-xl bg-amber-50 border border-amber-300 text-xs font-extrabold text-amber-950">
            Lợi thế chiến thuật: {strategicBonus}
          </div>
        )}

        <div className="grid grid-cols-2 gap-2.5 pt-1">
          <button
            type="button"
            disabled={buyer.cash < buyoutCost}
            onClick={onConfirmBuyout}
            className="bt-btn-gold py-2.5 px-4 rounded-2xl disabled:opacity-40 font-black text-sm uppercase tracking-wide cursor-pointer whitespace-nowrap"
          >
            Thâu Tóm (-{formatBusinessTourCompact(buyoutCost)})
          </button>
          <button
            type="button"
            onClick={onSkipBuyout}
            className="bt-btn-white py-2.5 px-4 rounded-2xl font-black text-sm uppercase tracking-wide cursor-pointer whitespace-nowrap"
          >
            Bỏ Qua
          </button>
        </div>
      </div>
    </div>
  );
};

/* ============================================================================
 * 3. COMPACT DOCKED WORLD CHAMPIONSHIPS SELECTOR (Unobstructed 3D Board!)
 * ============================================================================ */
interface ChampionshipDecisionModalProps {
  player: PlayerState;
  properties: Record<number, PropertyState>;
  boardModifiers: MatchBoardModifiers;
  isFree: boolean;
  onSelectCity: (tileIndex: number) => void;
  onSkip: () => void;
}

export const ChampionshipDecisionModal: React.FC<ChampionshipDecisionModalProps> = ({
  player,
  properties,
  boardModifiers,
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
        const projectedRent = calculateRent(pr.tileIndex, properties, nextMods);
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
  }, [boardModifiers, player.color, player.id, properties]);

  return (
    <div
      data-testid="championship-decision-modal"
      className="fixed bottom-3 sm:bottom-4 left-1/2 -translate-x-1/2 z-25 w-[min(560px,94vw)] bt-casual-modal rounded-3xl overflow-hidden animate-pop-in pointer-events-auto"
    >
      <div className="bt-header-sky px-4 sm:px-5 py-2.5 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[10px] font-black uppercase tracking-wider text-[#FEF08A]">
            {fee === 0
              ? 'Đăng Cai Cúp Quốc Gia · Miễn Phí 0K'
              : `Sân Vận Động Trung Tâm · Phí ${formatBusinessTourCompact(fee)}`}
          </div>
          <h3 className="font-display text-base sm:text-lg font-black uppercase leading-tight text-white truncate">
            🏆 Chọn Thành Phố Đặt Cúp (×{nextMult})
          </h3>
        </div>
        <button
          type="button"
          onClick={onSkip}
          className="px-3 py-1.5 rounded-xl bg-white/20 hover:bg-white/30 text-xs font-extrabold text-white cursor-pointer whitespace-nowrap shrink-0"
        >
          Bỏ Qua
        </button>
      </div>

      <div className="p-3 sm:p-3.5 space-y-2">
        <p className="text-[11px] sm:text-xs text-slate-700 leading-snug">
          Nhấn trực tiếp vào <strong className="font-bold text-[#0284C7]">thành phố của bạn trên bàn cờ 3D</strong> hoặc chọn nhanh bên dưới để nhân <strong className="font-black text-[#D97706]">×{nextMult}</strong> tiền thuê:
        </p>

        <div className="max-h-36 overflow-y-auto slim-scroll grid grid-cols-1 sm:grid-cols-2 gap-1.5 pr-1">
          {candidateCities.map((city) => (
            <button
              key={city.tileIndex}
              type="button"
              onClick={() => onSelectCity(city.tileIndex)}
              className="px-3 py-2 rounded-2xl bg-amber-50/80 hover:bg-amber-100 border-2 border-amber-200 hover:border-[#F5B800] flex items-center justify-between gap-2 text-left transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className="h-5 w-2 rounded-full shrink-0"
                  style={{ backgroundColor: city.color }}
                />
                <div className="min-w-0">
                  <div className="font-display text-xs font-black text-slate-900 truncate">
                    {city.name}
                    {city.isFestival ? ' 🎉' : ''}
                    {city.isCurrentCup ? ' 🏆' : ''}
                  </div>
                  <div className="text-[10px] font-semibold text-slate-600">
                    {city.level === 4
                      ? 'Khách sạn ★'
                      : city.level > 0
                        ? `Nhà Cấp ${city.level}`
                        : 'Đất trống'}
                  </div>
                </div>
              </div>
              <div className="font-mono-num text-xs font-black text-[#16A34A] shrink-0">
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
 * 4. COMPACT DOCKED WORLD TOUR FLIGHT SELECTOR (Unobstructed 3D Board!)
 * ============================================================================ */
interface WorldTourPromptProps {
  player: PlayerState;
  properties: Record<number, PropertyState>;
  boardModifiers?: MatchBoardModifiers;
  onSelectTargetTile: (targetTileIndex: number) => void;
  onSkipWorldTour: () => void;
}

export const WorldTourPrompt: React.FC<WorldTourPromptProps> = ({
  player,
  properties,
  boardModifiers,
  onSelectTargetTile,
  onSkipWorldTour,
}) => {
  const recommendedDestinations = useMemo(() => {
    const picks: Array<{ tileIndex: number; tag: string }> = [];
    const seen = new Set<number>();

    const validTiles = BOARD_TILES.filter((t) =>
      isValidWorldTourTarget(player, t.index, properties)
    );

    // 1. Unowned tiles completing Resort, Color Group, or Side Monopoly (accounting for Start salary along flight)
    for (const t of validTiles) {
      if (!isPurchasableTileSafe(t.kind)) continue;
      if (properties[t.index]?.ownerId !== null || !t.price) continue;
      const move = resolveWorldTourMovement(player.position, t.index);
      const budget = player.cash + (move.passedStart ? START_SALARY : 0) - WORLD_TOUR_FEE;
      if (budget < t.price) continue;

      const instantWin = wouldOwnTileWinMatch(player.id, t.index, [], properties);
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
        const owned = grp.tileIndices.filter(
          (i) => properties[i]?.ownerId === player.id
        ).length;
        if (owned === grp.tileIndices.length - 1) {
          picks.push({ tileIndex: t.index, tag: `Đủ bộ ${grp.label}` });
          seen.add(t.index);
        }
      }
    }

    // 2. Opponent unprotected cities eligible for 2x Buyout monopoly/side steal!
    for (const t of validTiles) {
      if (picks.length >= 6) break;
      const pr = properties[t.index];
      if (!pr || pr.ownerId === null || pr.ownerId === player.id || t.kind !== TileKind.PROPERTY) {
        continue;
      }
      const move = resolveWorldTourMovement(player.position, t.index);
      const wasOutage = Boolean(boardModifiers?.outageTileIndices?.includes(t.index));
      const rent = wasOutage ? 0 : calculateRent(t.index, properties, boardModifiers);
      const cashAfterRent = player.cash + (move.passedStart ? START_SALARY : 0) - WORLD_TOUR_FEE - rent;
      if (cashAfterRent < 0) continue;
      const buyoutCheck = canBuyoutProperty(
        { ...player, cash: cashAfterRent },
        t.index,
        properties,
        boardModifiers
      );
      if (!buyoutCheck.allowed) continue;

      const instantWin = wouldOwnTileWinMatch(player.id, t.index, [], properties);
      const completesMono =
        Boolean(t.group) &&
        COLOR_GROUP_META[t.group!].tileIndices.every(
          (i) => i === t.index || properties[i]?.ownerId === player.id
        );
      if ((instantWin || completesMono) && !seen.has(t.index)) {
        picks.push({
          tileIndex: t.index,
          tag: instantWin
            ? `Thâu tóm 2× (${formatBusinessTourCompact(buyoutCheck.cost)}) · THẮNG NGAY!`
            : `Thâu tóm 2× (${formatBusinessTourCompact(buyoutCheck.cost)}) · Đủ bộ!`,
        });
        seen.add(t.index);
      }
    }

    // 3. Own PROPERTY cities genuinely upgradable upon arrival (respecting post-flight lap & cash!)
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

    // 4. World Championships (16) or Start (0)
    if (
      picks.length < 6 &&
      isValidWorldTourTarget(player, WORLD_CHAMPIONSHIPS_TILE_INDEX, properties) &&
      !seen.has(WORLD_CHAMPIONSHIPS_TILE_INDEX)
    ) {
      picks.push({
        tileIndex: WORLD_CHAMPIONSHIPS_TILE_INDEX,
        tag: 'Đăng cai Cúp Quốc Gia (0K)',
      });
      seen.add(WORLD_CHAMPIONSHIPS_TILE_INDEX);
    }

    if (picks.length < 6 && !seen.has(0)) {
      const startSimPlayer: PlayerState = {
        ...player,
        laps: player.laps + 1,
        cash: player.cash + START_SALARY - WORLD_TOUR_FEE,
      };
      const canRemoteUpgradeAtStart =
        getStartUpgradableTileIndices(startSimPlayer, properties).length > 0;
      picks.push({
        tileIndex: 0,
        tag: canRemoteUpgradeAtStart
          ? `+${formatBusinessTourCompact(START_SALARY)} & Nâng cấp nhà`
          : `Nhận lương +${formatBusinessTourCompact(START_SALARY)}`,
      });
      seen.add(0);
    }

    // 5. Prime unowned Resorts / Cities
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
  }, [boardModifiers, player, properties]);

  return (
    <div
      data-testid="world-tour-modal"
      className="fixed bottom-3 sm:bottom-4 left-1/2 -translate-x-1/2 z-25 w-[min(580px,94vw)] bt-casual-modal rounded-3xl overflow-hidden animate-pop-in pointer-events-auto"
    >
      <div className="bt-header-green px-4 sm:px-5 py-2.5 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[10px] font-black uppercase tracking-wider text-[#FEF08A]">
            Chuyến Bay Đầu Lượt · Vé Bay {formatBusinessTourCompact(WORLD_TOUR_FEE)}
          </div>
          <h3 className="font-display text-base sm:text-lg font-black uppercase leading-tight text-white truncate">
            ✈️ Du Lịch Xuyên Việt — Chọn Điểm Đến
          </h3>
        </div>
        <button
          type="button"
          onClick={onSkipWorldTour}
          className="px-3 py-1.5 rounded-xl bg-white/20 hover:bg-white/30 text-xs font-extrabold text-white cursor-pointer whitespace-nowrap shrink-0"
        >
          Đổ Xúc Xắc Thường
        </button>
      </div>

      <div className="p-3 sm:p-3.5 space-y-2">
        <p className="text-[11px] sm:text-xs text-slate-700 leading-snug">
          Nhấn trực tiếp vào <strong className="font-bold text-[#0284C7]">bất kỳ ô sáng trên bàn cờ 3D</strong> (đất trống, đất bạn, đất đối thủ để Mua đứt 2×, Cúp Quốc Gia hoặc Ô Bắt Đầu; qua Bắt Đầu nhận{' '}
          <span className="font-mono-num font-black text-[#16A34A]">
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
                className="p-2 rounded-2xl bg-sky-50 hover:bg-sky-100 border-2 border-sky-200 hover:border-[#29B6F6] text-left transition-colors cursor-pointer"
              >
                <div className="font-display text-xs font-black text-slate-900 truncate">
                  {t.name}
                </div>
                <div className="text-[10px] font-extrabold text-[#16A34A] truncate mt-0.5">
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
 * 5. COMPACT DOCKED START TILE UPGRADE CITY SELECTOR (Tile 0 Bonus!)
 * ============================================================================ */
interface StartUpgradeModalProps {
  player: PlayerState;
  properties: Record<number, PropertyState>;
  boardModifiers: MatchBoardModifiers;
  onSelectCity: (tileIndex: number) => void;
  onSkip: () => void;
}

export const StartUpgradeModal: React.FC<StartUpgradeModalProps> = ({
  player,
  properties,
  boardModifiers,
  onSelectCity,
  onSkip,
}) => {
  const cities = useMemo(() => {
    const indices = getStartUpgradableTileIndices(player, properties);
    return indices
      .map((idx) => {
        const tile = BOARD_TILES[idx];
        const pr = properties[idx];
        return {
          tileIndex: idx,
          name: tile.name,
          color: tile.groupColor || player.color,
          level: pr?.level ?? 0,
          houseCost: tile.houseCost ?? 0,
          currentRent: calculateRent(idx, properties, boardModifiers),
        };
      })
      .sort((a, b) => b.currentRent - a.currentRent);
  }, [boardModifiers, player, properties]);

  return (
    <div
      data-testid="start-upgrade-modal"
      className="fixed bottom-3 sm:bottom-4 left-1/2 -translate-x-1/2 z-25 w-[min(560px,94vw)] bt-casual-modal rounded-3xl overflow-hidden animate-pop-in pointer-events-auto"
    >
      <div className="bt-header-green px-4 sm:px-5 py-2.5 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[10px] font-black uppercase tracking-wider text-[#FEF08A]">
            Đặc Quyền Dừng Tại Ô Bắt Đầu · Vòng {player.laps + 1}
          </div>
          <h3 className="font-display text-base sm:text-lg font-black uppercase leading-tight text-white truncate">
            🏗️ Chọn Thành Phố Của Bạn Để Nâng Cấp
          </h3>
        </div>
        <button
          type="button"
          onClick={onSkip}
          className="px-3 py-1.5 rounded-xl bg-white/20 hover:bg-white/30 text-xs font-extrabold text-white cursor-pointer whitespace-nowrap shrink-0"
        >
          Bỏ Qua
        </button>
      </div>

      <div className="p-3 sm:p-3.5 space-y-2">
        <p className="text-[11px] sm:text-xs text-slate-700 leading-snug">
          Nhấn trực tiếp vào <strong className="font-bold text-[#16A34A]">thành phố của bạn trên bàn cờ 3D</strong> hoặc chọn bên dưới để xây thêm nhà / lên Khách sạn ★:
        </p>

        <div className="max-h-36 overflow-y-auto slim-scroll grid grid-cols-1 sm:grid-cols-2 gap-1.5 pr-1">
          {cities.map((c) => (
            <button
              key={c.tileIndex}
              type="button"
              onClick={() => onSelectCity(c.tileIndex)}
              className="px-3 py-2 rounded-2xl bg-emerald-50/80 hover:bg-emerald-100 border-2 border-emerald-200 hover:border-[#16A34A] flex items-center justify-between gap-2 text-left transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className="h-5 w-2 rounded-full shrink-0"
                  style={{ backgroundColor: c.color }}
                />
                <div className="min-w-0">
                  <div className="font-display text-xs font-black text-slate-900 truncate">
                    {c.name}
                  </div>
                  <div className="text-[10px] font-semibold text-slate-600">
                    {c.level === 0 ? 'Đất trống' : `Nhà Cấp ${c.level}`} · +{formatBusinessTourCompact(c.houseCost)}/cấp
                  </div>
                </div>
              </div>
              <div className="font-mono-num text-xs font-black text-[#16A34A] shrink-0">
                Thuê {formatBusinessTourCompact(c.currentRent)}
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

/* ============================================================================
 * 6. COMPACT DOCKED TACTICAL CHANCE CARD TARGET SELECTOR
 *    (EARTHQUAKE 🌋 · POWER_OUTAGE ⚡ · SHIELD_CITY 🛡️)
 * ============================================================================ */
interface TacticalCardTargetModalProps {
  kind: TacticalCardActionKind;
  player: PlayerState;
  players: PlayerState[];
  properties: Record<number, PropertyState>;
  boardModifiers: MatchBoardModifiers;
  onSelectTarget: (tileIndex: number) => void;
  onSkip: () => void;
}

export const TacticalCardTargetModal: React.FC<TacticalCardTargetModalProps> = ({
  kind,
  player,
  players,
  properties,
  boardModifiers,
  onSelectTarget,
  onSkip,
}) => {
  const meta =
    kind === 'SHIELD_CITY'
      ? {
          badge: 'Thẻ Chiến Thuật Phòng Thủ',
          title: '🛡️ Chọn Thành Phố Của Bạn Để Dựng Khiên',
          hint: 'Khiên Bảo Hộ chặn Mua đứt 2× và hấp thụ 1 đòn Động đất hoặc Mất điện!',
          headerClass: 'bt-header-sky',
        }
      : kind === 'POWER_OUTAGE'
        ? {
            badge: 'Thẻ Chiến Thuật Tấn Công',
            title: '⚡ Chọn Đô Thị Đối Thủ Để Cắt Điện (Thuê = 0K)',
            hint: 'Nhấn trực tiếp vào đô thị đối thủ trên bàn cờ 3D hoặc chọn trong danh sách:',
            headerClass: 'bt-header-pink',
          }
        : {
            badge: 'Thẻ Chiến Thuật Tấn Công',
            title: '🌋 Chọn Thành Phố Đối Thủ Để Gây Địa Chấn',
            hint: 'Hạ 1 cấp nhà của đối thủ, hoặc san phẳng đất trống về Ngân hàng (Khách sạn ★ miễn nhiễm):',
            headerClass: 'bt-header-pink',
          };

  const candidates = useMemo(() => {
    const valid = getValidTacticalCardTargets(kind, player.id, properties, boardModifiers);
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
          color: owner?.color || tile.groupColor || '#0284C7',
          level: pr?.level ?? 0,
          isResort: tile.kind === TileKind.RESORT,
          isShielded: shieldSet.has(idx),
          rent: calculateRent(idx, properties, boardModifiers),
        };
      })
      .filter((c) => c.ownerName.length > 0)
      .sort((a, b) => b.rent - a.rent);
  }, [boardModifiers, kind, player.id, players, properties]);

  return (
    <div
      data-testid="tactical-card-target-modal"
      className="fixed bottom-3 sm:bottom-4 left-1/2 -translate-x-1/2 z-25 w-[min(560px,94vw)] bt-casual-modal rounded-3xl overflow-hidden animate-pop-in pointer-events-auto"
    >
      <div className={`${meta.headerClass} px-4 sm:px-5 py-2.5 flex items-center justify-between gap-2`}>
        <div className="min-w-0">
          <div className="text-[10px] font-black uppercase tracking-wider text-[#FEF08A]">
            {meta.badge}
          </div>
          <h3 className="font-display text-base sm:text-lg font-black uppercase leading-tight text-white truncate">
            {meta.title}
          </h3>
        </div>
        <button
          type="button"
          onClick={onSkip}
          className="px-3 py-1.5 rounded-xl bg-white/20 hover:bg-white/30 text-xs font-extrabold text-white cursor-pointer whitespace-nowrap shrink-0"
        >
          Bỏ Qua
        </button>
      </div>

      <div className="p-3 sm:p-3.5 space-y-2">
        <p className="text-[11px] sm:text-xs text-slate-700 leading-snug">{meta.hint}</p>

        <div className="max-h-36 overflow-y-auto slim-scroll grid grid-cols-1 sm:grid-cols-2 gap-1.5 pr-1">
          {candidates.map((c) => (
            <button
              key={c.tileIndex}
              type="button"
              onClick={() => onSelectTarget(c.tileIndex)}
              className="px-3 py-2 rounded-2xl bg-sky-50 hover:bg-sky-100 border-2 border-sky-200 hover:border-[#0284C7] flex items-center justify-between gap-2 text-left transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className="h-5 w-2 rounded-full shrink-0"
                  style={{ backgroundColor: c.color }}
                />
                <div className="min-w-0">
                  <div className="font-display text-xs font-black text-slate-900 truncate">
                    {c.name} {c.isShielded ? '🛡️' : ''}
                  </div>
                  <div className="text-[10px] font-semibold text-slate-600 truncate">
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
 * 7. PURE BUSINESS TOUR 32-TILE RULEBOOK MODAL
 * ============================================================================ */
interface RulebookModalProps {
  onClose: () => void;
}

export const RulebookModal: React.FC<RulebookModalProps> = ({ onClose }) => {
  return (
    <div
      data-testid="rulebook-modal"
      className="fixed inset-0 z-40 flex items-center justify-center p-3 sm:p-5 bg-slate-950/45 pointer-events-auto"
    >
      <div className="w-full max-w-2xl bt-casual-modal rounded-3xl overflow-hidden animate-pop-in flex flex-col max-h-[88vh]">
        <div className="bt-header-sky px-5 sm:px-6 py-4 flex items-center justify-between gap-3">
          <div>
            <div className="text-xs font-extrabold text-[#FEF08A]">
              Cẩm Nang Quy Tắc Business Tour 32 Ô Chuẩn Hóa
            </div>
            <h2 className="font-display text-xl sm:text-2xl font-black uppercase text-white">
              Sổ Tay Luật Cờ Tỷ Phú 3D
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng sổ tay luật chơi"
            className="h-8 w-8 rounded-full bg-white/20 hover:bg-white/35 flex items-center justify-center text-white font-black cursor-pointer"
          >
            ✕
          </button>
        </div>

        <div className="p-5 sm:p-6 overflow-y-auto slim-scroll divide-y divide-sky-100 text-xs sm:text-sm text-slate-700 flex-1">
          <div className="pb-3.5 space-y-1">
            <div className="font-display font-black text-slate-900">
              01. Xây Công Trình · Lên Khách Sạn ★ &amp; Đặc Quyền Ô Bắt Đầu
            </div>
            <p className="text-xs leading-relaxed">
              Vòng 1 mua đất trống xây tối đa <strong className="font-bold text-[#16A34A]">2 Nhà</strong>; từ Vòng 2 trở đi mua đất trống xây tối đa <strong className="font-bold text-[#16A34A]">3 Nhà</strong>. Khi ghé lại thành phố của mình từ Vòng 2+ (hoặc <strong className="font-bold text-[#0284C7]">dừng trực tiếp tại Ô Bắt Đầu</strong>), bạn có thể bù tiền nâng thẳng lên <strong className="font-bold text-rose-700">Khách sạn Biểu tượng (★)</strong> ngay lập tức!
            </p>
          </div>

          <div className="py-3.5 space-y-1">
            <div className="font-display font-black text-slate-900">
              02. Thâu Tóm Đô Thị (Mua Lại 2×) &amp; Khiên Bảo Hộ
            </div>
            <p className="text-xs leading-relaxed">
              Sau khi trả đủ tiền thuê tại thành phố Cấp 0–3 của đối thủ, bạn được quyền chi <strong className="font-bold text-[#D97706]">2× tổng vốn đầu tư</strong> để mua đứt thành phố đó. <strong className="font-bold text-slate-900">Khách sạn ★, 4 Khu nghỉ dưỡng và thành phố có Khiên Bảo Hộ 🛡️</strong> miễn nhiễm mua lại.
            </p>
          </div>

          <div className="py-3.5 space-y-1">
            <div className="font-display font-black text-slate-900">
              03. Cúp Quốc Gia (0K) · Du Lịch (50K) &amp; Thẻ Cơ Hội Chiến Thuật
            </div>
            <p className="text-xs leading-relaxed">
              <strong className="font-bold text-[#D97706]">Cúp Quốc Gia (Ô 16)</strong>: Chọn miễn phí 1 thành phố của bạn đăng cai nhân tiền thuê lũy tiến 2× → 3× → 4×...{' '}
              <strong className="font-bold text-[#16A34A]">Du Lịch (Ô 24)</strong>: Đầu lượt kế tiếp trả 50K bay tới bất kỳ ô chiến thuật nào (đất trống, đất bạn, đất đối thủ để Mua đứt 2×, Cúp Quốc Gia hoặc Ô Bắt Đầu).{' '}
              <strong className="font-bold text-rose-700">Thẻ Cơ Hội (?)</strong>: Có thêm Địa Chấn 🌋 (hạ cấp nhà / san phẳng đất trống), Mất Điện ⚡ (tắt tiền thuê về 0K) và Khiên Bảo Hộ 🛡️!
            </p>
          </div>

          <div className="py-3.5 space-y-1">
            <div className="font-display font-black text-slate-900">
              04. Tự Động Qua Lượt · Bán Trả Nợ Hoàn 100% &amp; Phá Sản
            </div>
            <p className="text-xs leading-relaxed">
              Hoàn thành hành động trên ô sẽ <strong className="font-bold text-[#0284C7]">tự động chuyển lượt</strong> mượt mà (ra Đôi lần 1–2 được đổ tiếp ngay). Khi thiếu tiền mặt trả nợ, bán thành phố về Ngân hàng được hoàn <strong className="font-bold text-[#16A34A]">100% vốn</strong>. Nếu phá sản trước đối thủ, chủ nợ nhận đủ tiền mặt + 100% giá trị thanh lý tài sản của người phá sản, còn các ô đất trả về Ngân hàng.
            </p>
          </div>

          <div className="pt-3.5 space-y-1">
            <div className="font-display font-black text-[#D97706]">
              05. Bốn Điều Kiện Chiến Thắng Tức Thì
            </div>
            <p className="text-xs leading-relaxed">
              Thắng ngay khi đạt <strong className="font-bold text-slate-900">Độc Quyền 3 Bộ Màu</strong>, sở hữu <strong className="font-bold text-slate-900">Trọn 1 Cạnh Bàn Cờ</strong>, gom đủ <strong className="font-bold text-slate-900">4 Khu Nghỉ Dưỡng</strong> (Vịnh Hạ Long, Lý Sơn, Côn Đảo, Phú Quốc), hoặc là người cuối cùng trụ vững!
            </p>
          </div>
        </div>

        <div className="px-5 py-3 bg-sky-50 border-t border-sky-200 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="bt-btn-green px-7 py-2.5 rounded-2xl text-sm font-black uppercase tracking-wide cursor-pointer whitespace-nowrap"
          >
            Đã Hiểu Luật Chơi
          </button>
        </div>
      </div>
    </div>
  );
};
