import React, { useMemo, useState } from 'react';
import { BOARD_TILES, COLOR_GROUP_META } from '../game/boardData';
import {
  BOARD_SIDES,
  calculateBuyoutPrice,
  calculateRent,
  formatBusinessTourCompact,
  formatBusinessTourSpaced,
  ownsFullColorGroup,
  START_SALARY,
  WORLD_TOUR_FEE,
} from '../game/rules';
import { PlayerState, PropertyState, TileKind } from '../game/types';
import { PlayerAvatar3D } from './PlayerAvatar3D';

/* ============================================================================
 * 1. BUSINESS TOUR ON-TILE UPGRADE MODAL (Revisit Own City -> Up to Level 4!)
 * ============================================================================ */
interface UpgradeDecisionModalProps {
  tileIndex: number;
  player: PlayerState;
  properties: Record<number, PropertyState>;
  onUpgradeToLevel: (targetLevel: number) => void;
  onSkip: () => void;
}

export const UpgradeDecisionModal: React.FC<UpgradeDecisionModalProps> = ({
  tileIndex,
  player,
  properties,
  onUpgradeToLevel,
  onSkip,
}) => {
  const tile = BOARD_TILES[tileIndex];
  const prop = properties[tileIndex];
  const currentLevel = prop?.level ?? 0;
  const houseCost = tile.houseCost ?? 100;

  const options = useMemo(() => {
    const list: Array<{
      level: number;
      label: string;
      note?: string;
      cost: number;
      rentAfter: number;
      affordable: boolean;
    }> = [];

    for (let lvl = currentLevel + 1; lvl <= 4; lvl++) {
      const cost = (lvl - currentLevel) * houseCost;
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
        note: lvl === 4 ? 'Miễn nhiễm mua lại' : undefined,
        cost,
        rentAfter: calculateRent(tileIndex, simProps, 7),
        affordable: player.cash >= cost,
      });
    }
    return list;
  }, [currentLevel, houseCost, player.cash, player.id, prop, properties, tileIndex]);

  const defaultTarget = useMemo(() => {
    const affordable = options.filter((o) => o.affordable);
    if (affordable.length === 0) return currentLevel + 1;
    return affordable[affordable.length - 1].level;
  }, [currentLevel, options]);

  const [selectedLevel, setSelectedLevel] = useState<number>(defaultTarget);
  const selectedOpt = options.find((o) => o.level === selectedLevel) || options[0];

  return (
    <div
      data-testid="upgrade-decision-modal"
      className="fixed left-1/2 top-[48%] -translate-x-1/2 -translate-y-1/2 z-25 w-[min(450px,93vw)] bt-casual-modal rounded-3xl overflow-hidden animate-pop-in pointer-events-auto"
    >
      <div
        className="px-5 py-3.5 text-white border-b-2 border-white/50 flex items-center justify-between gap-2"
        style={{
          background: `linear-gradient(180deg, ${tile.groupColor || '#29B6F6'} 0%, ${
            tile.groupColor || '#0284C7'
          } 100%)`,
          textShadow: '0 1.5px 2px rgba(15, 23, 42, 0.45)',
        }}
      >
        <div>
          <div className="text-[10px] font-black uppercase tracking-wider text-white/90">
            Ghé Thăm Đô Thị Sở Hữu · Nâng Cấp Công Trình
          </div>
          <h3 className="font-display text-xl sm:text-2xl font-black uppercase leading-tight text-white">
            {tile.name}
          </h3>
        </div>
        <div className="text-right text-xs font-extrabold text-white/95 shrink-0 bg-black/20 rounded-xl px-3 py-1.5 border border-white/30">
          Hiện tại: {currentLevel === 0 ? 'Đất khởi điểm' : `Nhà Cấp ${currentLevel}`}
        </div>
      </div>

      <div className="p-4 sm:p-5 space-y-3.5">
        <p className="text-xs text-slate-700 leading-relaxed">
          Chọn cấp công trình muốn nâng cấp tại{' '}
          <strong className="font-bold text-slate-900">{tile.name}</strong>. Đạt{' '}
          <strong className="font-bold text-rose-700">Khách sạn Cấp 4 (★)</strong> sẽ bảo vệ
          thành phố khỏi bị đối thủ mua lại.
        </p>

        <div className="space-y-1.5">
          {options.map((opt) => {
            const isSelected = opt.level === selectedLevel;
            return (
              <button
                key={opt.level}
                type="button"
                disabled={!opt.affordable}
                onClick={() => setSelectedLevel(opt.level)}
                className={`w-full px-3.5 py-2.5 rounded-2xl border-2 flex items-center justify-between gap-2 text-left transition-all cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed ${
                  isSelected
                    ? 'bg-emerald-50 border-[#58B916] shadow-xs'
                    : 'bg-sky-50/70 border-sky-200 hover:border-sky-400'
                }`}
              >
                <div>
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
                  <div className="text-[11px] text-slate-600 font-mono-num mt-0.5">
                    Phí thuê mới:{' '}
                    <span className="font-extrabold text-[#16A34A]">
                      {formatBusinessTourCompact(opt.rentAfter)}
                    </span>
                  </div>
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
            disabled={!selectedOpt?.affordable}
            onClick={() => selectedOpt && onUpgradeToLevel(selectedOpt.level)}
            className="bt-btn-green py-2.5 px-4 rounded-2xl disabled:opacity-40 font-black text-sm uppercase tracking-wide cursor-pointer whitespace-nowrap"
          >
            {selectedOpt
              ? `Nâng Cấp (-${formatBusinessTourCompact(selectedOpt.cost)})`
              : 'Không Đủ Tiền'}
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
  rentPaid: number;
  onConfirmBuyout: () => void;
  onSkipBuyout: () => void;
}

export const BuyoutDecisionModal: React.FC<BuyoutDecisionModalProps> = ({
  tileIndex,
  buyer,
  owner,
  properties,
  rentPaid,
  onConfirmBuyout,
  onSkipBuyout,
}) => {
  const tile = BOARD_TILES[tileIndex];
  const prop = properties[tileIndex];
  const level = prop?.level ?? 0;
  const buyoutCost = calculateBuyoutPrice(tileIndex, level);

  const strategicBonus = useMemo(() => {
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
        <div className="text-right font-mono-num shrink-0 bg-black/20 rounded-xl px-3 py-1.5 border border-white/30">
          <div className="text-[9px] font-bold uppercase text-white/90">Giá mua lại</div>
          <div className="text-lg font-black text-[#FEF08A] leading-none">
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
          phí thuê. Vì thành phố chưa lên Khách sạn Cấp 4, bạn có quyền chi{' '}
          <span className="font-mono-num font-black text-slate-900">
            {formatBusinessTourCompact(buyoutCost)}
          </span>{' '}
          (2× tổng vốn đầu tư) để mua đứt {tile.name} kèm toàn bộ công trình trên đó.
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
 * 3. BUSINESS TOUR WORLD TOUR FLIGHT SELECTOR (Corner 14 — Click Any 3D Tile!)
 * ============================================================================ */
interface WorldTourPromptProps {
  player: PlayerState;
  properties: Record<number, PropertyState>;
  onSelectTargetTile: (targetTileIndex: number) => void;
  onSkipWorldTour: () => void;
}

export const WorldTourPrompt: React.FC<WorldTourPromptProps> = ({
  player,
  properties,
  onSelectTargetTile,
  onSkipWorldTour,
}) => {
  const recommendedDestinations = useMemo(() => {
    const picks: Array<{ tileIndex: number; tag: string }> = [];
    const seen = new Set<number>();

    // 1. Unowned tiles completing a Color Group or Side Monopoly
    for (const t of BOARD_TILES) {
      if (
        properties[t.index]?.ownerId === null &&
        t.price &&
        player.cash >= WORLD_TOUR_FEE + t.price
      ) {
        if (t.group) {
          const grp = COLOR_GROUP_META[t.group];
          const owned = grp.tileIndices.filter(
            (i) => properties[i]?.ownerId === player.id
          ).length;
          if (owned === grp.tileIndices.length - 1) {
            picks.push({ tileIndex: t.index, tag: `Đủ bộ ${grp.label}` });
            seen.add(t.index);
          }
        }
        for (const side of BOARD_SIDES) {
          if (side.tileIndices.includes(t.index) && !seen.has(t.index)) {
            const owned = side.tileIndices.filter(
              (i) => properties[i]?.ownerId === player.id
            ).length;
            if (owned === side.tileIndices.length - 1) {
              picks.push({ tileIndex: t.index, tag: 'Thắng Cạnh!' });
              seen.add(t.index);
            }
          }
        }
      }
    }

    // 2. Own cities ready to upgrade to Protected Hotel
    for (const pr of Object.values(properties)) {
      if (pr.ownerId === player.id && pr.level < 4 && !seen.has(pr.tileIndex)) {
        const t = BOARD_TILES[pr.tileIndex];
        if (t.kind === TileKind.PROPERTY) {
          picks.push({ tileIndex: pr.tileIndex, tag: 'Nâng cấp Nhà/KS' });
          seen.add(pr.tileIndex);
        }
      }
      if (picks.length >= 3) break;
    }

    // 3. Prime unowned cities
    for (const t of [...BOARD_TILES].reverse()) {
      if (picks.length >= 3) break;
      if (
        t.kind === TileKind.PROPERTY &&
        properties[t.index]?.ownerId === null &&
        !seen.has(t.index) &&
        player.cash >= WORLD_TOUR_FEE + (t.price ?? 0)
      ) {
        picks.push({
          tileIndex: t.index,
          tag: `Đất trống ${formatBusinessTourCompact(t.price ?? 0)}`,
        });
        seen.add(t.index);
      }
    }

    // Always include START (+600K)
    if (!seen.has(0)) {
      picks.push({
        tileIndex: 0,
        tag: `Nhận +${formatBusinessTourCompact(START_SALARY)}`,
      });
    }

    return picks.slice(0, 4);
  }, [player.cash, player.id, properties]);

  return (
    <div
      data-testid="world-tour-modal"
      className="fixed left-1/2 top-[50%] -translate-x-1/2 -translate-y-1/2 z-25 w-[min(470px,94vw)] bt-casual-modal rounded-3xl overflow-hidden animate-pop-in pointer-events-auto"
    >
      <div className="bt-header-green px-5 py-3.5 flex items-center justify-between gap-2">
        <div>
          <div className="text-[10px] font-black uppercase tracking-wider text-[#FEF08A]">
            Sân Bay Chuyên Cơ · Vé Bay {formatBusinessTourCompact(WORLD_TOUR_FEE)}
          </div>
          <h3 className="font-display text-xl sm:text-2xl font-black uppercase leading-tight text-white">
            Du Lịch Xuyên Việt
          </h3>
        </div>
        <button
          type="button"
          onClick={onSkipWorldTour}
          className="px-3 py-1.5 rounded-xl bg-white/20 hover:bg-white/30 text-xs font-extrabold text-white cursor-pointer whitespace-nowrap"
        >
          Nghỉ Chân (0K)
        </button>
      </div>

      <div className="p-4 space-y-3">
        <p className="text-xs text-slate-700 leading-relaxed">
          Nhấn trực tiếp vào{' '}
          <strong className="font-bold text-[#0284C7]">bất kỳ ô nào trên bàn cờ 3D</strong>{' '}
          để bay tới đó với phí{' '}
          <span className="font-mono-num font-black text-slate-900">
            -{formatBusinessTourCompact(WORLD_TOUR_FEE)}
          </span>{' '}
          (nếu bay qua ô Bắt Đầu vẫn nhận{' '}
          <span className="font-mono-num font-black text-[#16A34A]">
            +{formatBusinessTourSpaced(START_SALARY)}
          </span>
          ), hoặc chọn nhanh điểm đến gợi ý:
        </p>

        <div className="grid grid-cols-2 gap-2">
          {recommendedDestinations.map((item) => {
            const t = BOARD_TILES[item.tileIndex];
            return (
              <button
                key={item.tileIndex}
                type="button"
                onClick={() => onSelectTargetTile(item.tileIndex)}
                className="p-2.5 rounded-2xl bg-sky-50 hover:bg-sky-100 border-2 border-sky-200 hover:border-[#29B6F6] text-left transition-colors cursor-pointer"
              >
                <div className="font-display text-xs sm:text-sm font-black text-slate-900 truncate">
                  {t.name}
                </div>
                <div className="text-[11px] font-extrabold text-[#16A34A] mt-0.5">
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

/* ============================================================================
 * 4. PURE BUSINESS TOUR RULEBOOK MODAL
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
              Cẩm Nang Quy Tắc Business Tour
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

        {/* Editorial Rule Sections */}
        <div className="p-5 sm:p-6 overflow-y-auto slim-scroll divide-y divide-sky-100 text-xs sm:text-sm text-slate-700 flex-1">
          <div className="pb-3.5 space-y-1">
            <div className="font-display font-black text-slate-900">
              01. Mua Đất & Xây Nhà Ngay Khi Dừng Chân
            </div>
            <p className="text-xs leading-relaxed">
              Khi dừng tại thành phố trống, bạn được chọn mua đất kèm tối đa{' '}
              <strong className="font-bold text-[#16A34A]">Nhà Cấp 1–3 ngay lập tức</strong>. Bạn
              chỉ có thể nâng cấp thêm công trình khi quân cờ quay lại dừng đúng thành phố đó ở các
              vòng sau.
            </p>
          </div>

          <div className="py-3.5 space-y-1">
            <div className="font-display font-black text-slate-900">
              02. Khách Sạn Biểu Tượng Cấp 4 (★) — Miễn Nhiễm Mua Lại
            </div>
            <p className="text-xs leading-relaxed">
              Khi ghé lại thành phố của mình từ vòng sau, bạn có thể nâng cấp lên{' '}
              <strong className="font-bold text-rose-700">Khách sạn Cấp 4 (★)</strong>. Thành phố
              đạt Cấp 4 có khiên bảo vệ tuyệt đối — đối thủ không thể dùng tiền thâu tóm.
            </p>
          </div>

          <div className="py-3.5 space-y-1">
            <div className="font-display font-black text-slate-900">
              03. Thâu Tóm Đô Thị Đối Thủ (Giá 2×)
            </div>
            <p className="text-xs leading-relaxed">
              Sau khi trả đủ tiền thuê tại thành phố Cấp 0–3 của đối thủ, bạn có quyền chi{' '}
              <strong className="font-bold text-[#D97706]">
                gấp đôi (2×) tổng giá trị đất và nhà
              </strong>{' '}
              để mua đứt thành phố đó ngay lập tức. (Bến xe, Điện lực và Khách sạn Cấp 4 miễn nhiễm
              mua lại).
            </p>
          </div>

          <div className="py-3.5 space-y-1">
            <div className="font-display font-black text-slate-900">
              04. Độc Quyền Bộ Màu (×2 Mọi Cấp) & Du Lịch Xuyên Việt (150K)
            </div>
            <p className="text-xs leading-relaxed">
              Sở hữu đủ nhóm màu giúp{' '}
              <strong className="font-bold text-[#16A34A]">
                nhân đôi (×2) phí thuê ở tất cả các cấp công trình
              </strong>
              . Đi qua ô Bắt Đầu nhận thưởng{' '}
              <strong className="font-bold text-[#16A34A]">+600 000</strong>. Dừng tại góc{' '}
              <strong className="font-bold text-[#0284C7]">Du Lịch Xuyên Việt</strong> (ô 14), trả{' '}
              <strong className="font-bold text-slate-900">150K</strong> để bay thẳng đến bất kỳ ô
              nào trên bàn cờ.
            </p>
          </div>

          <div className="pt-3.5 space-y-1">
            <div className="font-display font-black text-[#D97706]">
              05. Ba Điều Kiện Chiến Thắng Tức Thì
            </div>
            <p className="text-xs leading-relaxed">
              Ván đấu kết thúc ngay lập tức khi một tỷ phú đạt{' '}
              <strong className="font-bold text-slate-900">Độc Quyền 3 Bộ Màu</strong>, sở hữu{' '}
              <strong className="font-bold text-slate-900">Trọn Bộ 1 Cạnh Bàn Cờ</strong>, hoặc là
              người cuối cùng không bị phá sản.
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
