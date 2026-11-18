import React, { useEffect, useRef } from 'react';
import { BOARD_TILES, COLOR_GROUP_META } from '../game/boardData';
import {
  calculateNetWorth,
  canUpgradeProperty,
  getHouseSellRefund,
  getPropertySellRefund,
  ownsFullColorGroup,
} from '../game/rules';
import {
  LuckCard,
  PendingDebt,
  PlayerState,
  PropertyState,
  TileKind,
} from '../game/types';

/* ==========================================
 * 1. RAYCASTED TILE INSPECTOR POPOVER CARD
 * ========================================== */
interface TileInspectorProps {
  tileIndex: number;
  players: PlayerState[];
  properties: Record<number, PropertyState>;
  currentPlayer: PlayerState | null;
  canActOnAssets: boolean;
  onUpgrade: (tileIndex: number) => void;
  onSellHouse: (tileIndex: number) => void;
  onClose: () => void;
}

export const TileInspectorCard: React.FC<TileInspectorProps> = ({
  tileIndex,
  players,
  properties,
  currentPlayer,
  canActOnAssets,
  onUpgrade,
  onSellHouse,
  onClose,
}) => {
  const tile = BOARD_TILES[tileIndex];
  const prop = properties[tileIndex];
  const owner =
    prop && prop.ownerId !== null
      ? players.find((p) => p.id === prop.ownerId) || null
      : null;

  const isOwnedByActiveHuman =
    currentPlayer &&
    !currentPlayer.isBot &&
    owner?.id === currentPlayer.id &&
    canActOnAssets;

  const upgradeCheck =
    currentPlayer && isOwnedByActiveHuman
      ? canUpgradeProperty(currentPlayer, tileIndex, properties)
      : { allowed: false, cost: tile.houseCost || 0 };

  return (
    <div
      data-testid="tile-inspector-card"
      className="fixed right-4 top-28 z-25 w-80 hud-card-light rounded-2xl overflow-hidden animate-pop-in pointer-events-auto"
    >
      {/* Authentic Monopoly Title-Deed Header Banner */}
      <div
        className="px-4 py-3 flex items-start justify-between gap-2 text-white border-b-2 border-amber-300/70"
        style={{
          backgroundColor:
            tile.groupColor ||
            (tile.kind === TileKind.TRANSPORT
              ? '#1E293B'
              : tile.kind === TileKind.UTILITY
                ? '#CA8A04'
                : '#0F172A'),
        }}
      >
        <div>
          {tile.groupLabel && (
            <div className="text-[10px] font-bold tracking-wider uppercase text-white/90">
              Bằng Khoán · {tile.groupLabel}
            </div>
          )}
          <h3 className="font-display text-xl font-extrabold leading-tight drop-shadow-xs">
            {tile.name}
          </h3>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Đóng thông tin ô đất"
          className="h-7 w-7 rounded-lg bg-black/20 hover:bg-black/35 flex items-center justify-center text-white text-sm font-bold cursor-pointer"
        >
          ✕
        </button>
      </div>

      <div className="p-4 space-y-3 text-sm text-slate-700">
        <p className="text-xs text-slate-600 leading-relaxed">{tile.description}</p>

        {/* Price & Owner Summary */}
        {prop && (
          <div className="flex items-center justify-between py-2 border-y border-slate-200 text-xs">
            <div>
              <span className="text-slate-500">Giá mua: </span>
              <span className="font-extrabold text-slate-900 tabular-nums">
                ${tile.price}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-slate-500">Chủ sở hữu:</span>
              {owner ? (
                <span className="font-bold text-slate-900 flex items-center gap-1">
                  <span
                    className="inline-block h-2.5 w-2.5 rounded-xs"
                    style={{ backgroundColor: owner.color }}
                  />
                  {owner.name}
                </span>
              ) : (
                <span className="font-semibold text-emerald-700">Đất trống</span>
              )}
            </div>
          </div>
        )}

        {/* Rent Schedule Table for City Properties */}
        {tile.kind === TileKind.PROPERTY && tile.rents && (
          <div className="space-y-1 text-xs">
            <div className="font-bold text-slate-900 mb-1">Bảng giá thuê theo cấp công trình</div>
            {[
              { label: 'Đất trống cơ bản', val: tile.rents[0], active: prop?.level === 0 },
              {
                label: 'Sở hữu trọn bộ màu (×2)',
                val: tile.rents[0] * 2,
                active:
                  prop?.level === 0 &&
                  owner !== null &&
                  tile.group !== undefined &&
                  ownsFullColorGroup(owner.id, tile.group, properties),
              },
              { label: '1 Nhà xanh', val: tile.rents[1], active: prop?.level === 1 },
              { label: '2 Nhà xanh', val: tile.rents[2], active: prop?.level === 2 },
              { label: '3 Nhà xanh', val: tile.rents[3], active: prop?.level === 3 },
              { label: 'Khách sạn (Cấp 4)', val: tile.rents[4], active: prop?.level === 4 },
            ].map((row, idx) => (
              <div
                key={idx}
                className={`flex items-center justify-between py-1 px-2 rounded-md ${
                  row.active ? 'bg-amber-100 text-slate-950 font-bold' : 'text-slate-700'
                }`}
              >
                <span>{row.label}</span>
                <span className="tabular-nums font-semibold">${row.val}</span>
              </div>
            ))}
            <div className="pt-1 flex items-center justify-between text-[11px] text-slate-500">
              <span>Chi phí nâng cấp mỗi cấp</span>
              <span className="font-bold text-slate-800 tabular-nums">
                ${tile.houseCost}
              </span>
            </div>
          </div>
        )}

        {/* Quick Build / Sell Actions if owned by active human player */}
        {isOwnedByActiveHuman && tile.kind === TileKind.PROPERTY && prop && (
          <div className="pt-2 flex items-center gap-2 border-t border-slate-200">
            <button
              type="button"
              disabled={!upgradeCheck.allowed}
              onClick={() => onUpgrade(tileIndex)}
              className="flex-1 py-2 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white text-xs font-bold transition-colors cursor-pointer whitespace-nowrap"
            >
              {prop.level === 3
                ? `Xây Khách Sạn (-$${tile.houseCost})`
                : prop.level >= 4
                  ? 'Đã đạt cấp tối đa'
                  : `Xây Nhà (-$${tile.houseCost})`}
            </button>
            {prop.level > 0 && (
              <button
                type="button"
                onClick={() => onSellHouse(tileIndex)}
                className="py-2 px-3 rounded-lg bg-amber-100 hover:bg-amber-200 text-amber-950 text-xs font-bold transition-colors cursor-pointer whitespace-nowrap"
              >
                Bán Nhà (+${getHouseSellRefund(tileIndex)})
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

/* ==========================================
 * 2. BUY UNOWNED PROPERTY DECISION PROMPT
 * ========================================== */
interface BuyDecisionModalProps {
  tileIndex: number;
  player: PlayerState;
  properties: Record<number, PropertyState>;
  onBuy: () => void;
  onSkip: () => void;
}

export const BuyDecisionModal: React.FC<BuyDecisionModalProps> = ({
  tileIndex,
  player,
  properties,
  onBuy,
  onSkip,
}) => {
  const tile = BOARD_TILES[tileIndex];
  const price = tile.price || 0;
  const canAfford = player.cash >= price;

  let groupInfo = '';
  if (tile.group) {
    const groupMeta = COLOR_GROUP_META[tile.group];
    const ownedInGroup = groupMeta.tileIndices.filter(
      (idx) => properties[idx]?.ownerId === player.id
    ).length;
    groupInfo = `Nhóm ${groupMeta.label} (${ownedInGroup}/${groupMeta.tileIndices.length} ô đã sở hữu)`;
  }

  return (
    <div className="fixed bottom-30 left-1/2 -translate-x-1/2 z-25 w-[min(430px,92vw)] hud-card-light rounded-2xl overflow-hidden animate-pop-in pointer-events-auto">
      <div
        className="px-5 py-3 text-white border-b-2 border-amber-300/80"
        style={{ backgroundColor: tile.groupColor || '#0F172A' }}
      >
        <div className="text-[11px] font-bold tracking-wider uppercase text-white/90">
          Bằng Khoán Bất Động Sản
        </div>
        <h3 className="font-display text-2xl font-extrabold leading-tight">{tile.name}</h3>
      </div>

      <div className="p-5 space-y-4">
        {groupInfo && <div className="text-xs font-semibold text-slate-600">{groupInfo}</div>}
        <p className="text-sm text-slate-700">{tile.description}</p>

        <div className="flex items-center justify-between p-3 rounded-xl bg-amber-50/80 border border-amber-200/80 text-sm">
          <div>
            <div className="text-xs text-slate-500">Giá niêm yết</div>
            <div className="font-display text-xl font-extrabold text-slate-900 tabular-nums">
              ${price}
            </div>
          </div>
          {tile.rents && (
            <div className="text-right">
              <div className="text-xs text-slate-500">Giá thuê cơ bản / Khách sạn</div>
              <div className="text-sm font-bold text-emerald-700 tabular-nums">
                ${tile.rents[0]} → ${tile.rents[4]}
              </div>
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-2.5">
          <button
            type="button"
            disabled={!canAfford}
            onClick={onBuy}
            className="btn-3d-roll py-2.5 px-4 rounded-xl disabled:opacity-40 text-white font-extrabold text-sm cursor-pointer whitespace-nowrap"
          >
            {canAfford ? `Mua Đất ($${price})` : 'Không đủ tiền'}
          </button>
          <button
            type="button"
            onClick={onSkip}
            className="btn-3d-gold py-2.5 px-4 rounded-xl text-slate-950 font-extrabold text-sm cursor-pointer whitespace-nowrap"
          >
            Bỏ Qua · Đấu Giá
          </button>
        </div>
      </div>
    </div>
  );
};

/* ==========================================
 * 3. CHANCE & COMMUNITY CHEST CARD MODAL
 * ========================================== */
interface LuckCardModalProps {
  card: LuckCard;
  isBot: boolean;
  onConfirm: () => void;
}

export const LuckCardModal: React.FC<LuckCardModalProps> = ({ card, isBot, onConfirm }) => {
  const isChance = card.deck === 'CHANCE';

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center p-4 bg-slate-950/30 pointer-events-auto">
      <div className="w-full max-w-md hud-card-light rounded-2xl overflow-hidden animate-pop-in">
        <div
          className={`px-6 py-4 text-white ${
            isChance ? 'bg-amber-600' : 'bg-blue-600'
          }`}
        >
          <div className="text-xs font-bold tracking-wide text-white/90">
            {isChance ? 'THẺ CƠ HỘI' : 'THẺ KHÍ VẬN'}
          </div>
          <h3 className="text-xl font-extrabold mt-0.5">{card.title}</h3>
        </div>

        <div className="p-6 space-y-5">
          <p className="text-base text-slate-800 leading-relaxed">{card.description}</p>

          {!isBot ? (
            <button
              type="button"
              onClick={onConfirm}
              className="w-full py-3 px-5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-sm transition-colors cursor-pointer"
            >
              Chấp Nhận & Tiếp Tục
            </button>
          ) : (
            <div className="text-xs font-semibold text-slate-500 text-center">
              Đang tự động áp dụng thẻ cho Bot AI...
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

/* ==========================================
 * 4. PROPERTY MANAGEMENT & DEBT RESOLUTION MODAL
 * ========================================== */
interface AssetManagementModalProps {
  player: PlayerState;
  properties: Record<number, PropertyState>;
  pendingDebt: PendingDebt | null;
  onUpgrade: (tileIndex: number) => void;
  onSellHouse: (tileIndex: number) => void;
  onSellProperty: (tileIndex: number) => void;
  onPayPendingDebt: () => void;
  onDeclareBankruptcy: () => void;
  onClose: () => void;
}

export const AssetManagementModal: React.FC<AssetManagementModalProps> = ({
  player,
  properties,
  pendingDebt,
  onUpgrade,
  onSellHouse,
  onSellProperty,
  onPayPendingDebt,
  onDeclareBankruptcy,
  onClose,
}) => {
  const owned = Object.values(properties)
    .filter((p) => p.ownerId === player.id)
    .sort((a, b) => a.tileIndex - b.tileIndex);

  const canCoverDebtNow = pendingDebt ? player.cash >= pendingDebt.amount : true;

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center p-4 bg-slate-950/45 pointer-events-auto">
      <div className="w-full max-w-2xl hud-card-light rounded-2xl overflow-hidden animate-pop-in flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between">
          <div>
            <h3 className="text-lg font-extrabold">
              {pendingDebt
                ? 'Cầm Cố / Bán Tài Sản Để Thanh Toán Nợ'
                : 'Quản Lý Tài Sản & Xây Nhà 3D'}
            </h3>
            <p className="text-xs text-slate-300 mt-0.5 tabular-nums">
              Số dư hiện tại của {player.name}:{' '}
              <span className="font-bold text-emerald-400">
                ${player.cash.toLocaleString('en-US')}
              </span>
            </p>
          </div>
          {!pendingDebt && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Đóng bảng tài sản"
              className="h-8 w-8 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center text-white font-bold cursor-pointer"
            >
              ✕
            </button>
          )}
        </div>

        {/* Debt Alert Banner if in DEBT_RESOLUTION */}
        {pendingDebt && (
          <div className="px-6 py-3 bg-rose-50 border-b border-rose-200 flex flex-wrap items-center justify-between gap-2">
            <div className="text-xs text-rose-900">
              <span className="font-bold">{pendingDebt.reason}:</span> Cần thanh toán{' '}
              <span className="font-extrabold tabular-nums">${pendingDebt.amount}</span>. Hãy bán
              nhà hoặc bán đất (nhận lại 50% giá trị) để đủ tiền mặt, hoặc tuyên bố phá sản.
            </div>
            <div className="flex items-center gap-2">
              {canCoverDebtNow && (
                <button
                  type="button"
                  onClick={onPayPendingDebt}
                  className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold cursor-pointer whitespace-nowrap"
                >
                  Thanh Toán Ngay (${pendingDebt.amount})
                </button>
              )}
              <button
                type="button"
                onClick={onDeclareBankruptcy}
                className="px-3.5 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold cursor-pointer whitespace-nowrap"
              >
                Tuyên Bố Phá Sản
              </button>
            </div>
          </div>
        )}

        {/* Owned Properties List */}
        <div className="p-6 overflow-y-auto slim-scroll space-y-2.5 flex-1">
          {owned.length === 0 ? (
            <div className="text-center py-10 text-sm text-slate-500">
              Bạn hiện chưa sở hữu bất động sản nào trên bàn cờ.
            </div>
          ) : (
            owned.map((prop) => {
              const tile = BOARD_TILES[prop.tileIndex];
              const upg = canUpgradeProperty(player, prop.tileIndex, properties);
              const houseRefund = getHouseSellRefund(prop.tileIndex);
              const propRefund = getPropertySellRefund(prop.tileIndex);
              const isMono =
                tile.group && ownsFullColorGroup(player.id, tile.group, properties);

              return (
                <div
                  key={prop.tileIndex}
                  className="flex flex-wrap items-center justify-between gap-3 p-3.5 rounded-xl bg-slate-50 border border-slate-200"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className="h-10 w-3 rounded-sm shrink-0"
                      style={{ backgroundColor: tile.groupColor || '#475569' }}
                    />
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-900 text-sm">{tile.name}</span>
                        {isMono && (
                          <span className="text-[11px] font-semibold text-emerald-700">
                            · Trọn bộ màu
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-slate-600 tabular-nums mt-0.5">
                        {tile.kind === TileKind.PROPERTY ? (
                          <>
                            Cấp công trình:{' '}
                            <span className="font-semibold text-slate-900">
                              {prop.level === 0
                                ? 'Đất trống'
                                : prop.level === 4
                                  ? 'Khách sạn (Cấp 4)'
                                  : `${prop.level} Nhà xanh`}
                            </span>
                          </>
                        ) : (
                          <span>Hạ tầng đặc biệt · Giá gốc ${tile.price}</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Upgrade / Sell Buttons */}
                  <div className="flex items-center gap-2">
                    {tile.kind === TileKind.PROPERTY && !pendingDebt && (
                      <button
                        type="button"
                        disabled={!upg.allowed}
                        onClick={() => onUpgrade(prop.tileIndex)}
                        className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-35 text-white text-xs font-bold transition-colors cursor-pointer whitespace-nowrap"
                      >
                        {prop.level === 3
                          ? `Lên Khách Sạn (-$${tile.houseCost})`
                          : prop.level >= 4
                            ? 'Tối đa'
                            : `Xây Nhà (-$${tile.houseCost})`}
                      </button>
                    )}

                    {prop.level > 0 ? (
                      <button
                        type="button"
                        onClick={() => onSellHouse(prop.tileIndex)}
                        className="px-3 py-1.5 rounded-lg bg-amber-100 hover:bg-amber-200 text-amber-950 text-xs font-bold transition-colors cursor-pointer whitespace-nowrap"
                      >
                        Bán 1 Nhà (+${houseRefund})
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => onSellProperty(prop.tileIndex)}
                        className="px-3 py-1.5 rounded-lg bg-rose-100 hover:bg-rose-200 text-rose-900 text-xs font-bold transition-colors cursor-pointer whitespace-nowrap"
                      >
                        Bán Đất (+${propRefund})
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {!pendingDebt && (
          <div className="px-6 py-3.5 bg-slate-100 border-t border-slate-200 flex justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-sm font-bold cursor-pointer"
            >
              Hoàn Tất
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

/* ==========================================
 * 5. PAUSE MODAL & VICTORY CONFETTI MODAL
 * ========================================== */
export const PauseModal: React.FC<{
  onResume: () => void;
  onRestartToTitle: () => void;
}> = ({ onResume, onRestartToTitle }) => (
  <div className="fixed inset-0 z-30 flex items-center justify-center p-4 bg-slate-950/45 pointer-events-auto">
    <div className="w-full max-w-sm hud-card-light rounded-2xl p-6 space-y-4 animate-pop-in text-center">
      <h2 className="text-2xl font-extrabold text-slate-900">Tạm Dừng Ván Đấu</h2>
      <p className="text-sm text-slate-600">
        Bàn cờ đang được giữ nguyên trạng thái hiện tại.
      </p>
      <div className="space-y-2.5 pt-2">
        <button
          type="button"
          onClick={onResume}
          className="w-full py-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold text-sm cursor-pointer"
        >
          Tiếp Tục Chơi
        </button>
        <button
          type="button"
          onClick={onRestartToTitle}
          className="w-full py-3 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold text-sm cursor-pointer"
        >
          Tạo Ván Đấu Mới
        </button>
      </div>
    </div>
  </div>
);

const ConfettiOverlay: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const colors = ['#EF4444', '#F59E0B', '#10B981', '#3B82F6', '#EC4899', '#FACC15'];
    const pieces = Array.from({ length: 90 }, () => ({
      x: Math.random() * canvas.width,
      y: Math.random() * -canvas.height,
      w: 7 + Math.random() * 6,
      h: 12 + Math.random() * 8,
      vy: 2.2 + Math.random() * 3.4,
      vx: (Math.random() - 0.5) * 2,
      rot: Math.random() * Math.PI * 2,
      vRot: (Math.random() - 0.5) * 0.14,
      color: colors[Math.floor(Math.random() * colors.length)],
    }));

    let raf = 0;
    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
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
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);

    return () => cancelAnimationFrame(raf);
  }, []);

  return <canvas ref={canvasRef} className="fixed inset-0 pointer-events-none z-35" />;
};

export const VictoryModal: React.FC<{
  winner: PlayerState;
  players: PlayerState[];
  properties: Record<number, PropertyState>;
  turnCount: number;
  onPlayAgain: () => void;
}> = ({ winner, players, properties, turnCount, onPlayAgain }) => {
  const ranked = [...players].sort(
    (a, b) => calculateNetWorth(b, properties) - calculateNetWorth(a, properties)
  );

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center p-4 bg-slate-950/50 pointer-events-auto">
      <ConfettiOverlay />
      <div className="relative z-40 w-full max-w-md hud-card-light rounded-2xl overflow-hidden animate-pop-in">
        <div
          className="px-6 py-6 text-center text-white"
          style={{ backgroundColor: winner.color }}
        >
          <div className="text-xs font-bold tracking-wide text-white/90">
            NHÀ VÔ ĐỊCH CỜ TỶ PHÚ VIỆT NAM
          </div>
          <h2 className="text-3xl font-extrabold mt-1">{winner.name}</h2>
          <p className="text-sm text-white/90 mt-1 tabular-nums">
            Chiến thắng thuyết phục sau {turnCount} lượt đấu
          </p>
        </div>

        <div className="p-6 space-y-4">
          <div className="space-y-2">
            <div className="text-xs font-bold text-slate-500">Bảng tổng sắp tài sản ròng</div>
            {ranked.map((pl, i) => {
              const worth = calculateNetWorth(pl, properties);
              return (
                <div
                  key={pl.id}
                  className="flex items-center justify-between p-2.5 rounded-xl bg-slate-100 text-sm"
                >
                  <div className="flex items-center gap-2.5">
                    <span className="font-extrabold text-slate-500 tabular-nums">#{i + 1}</span>
                    <span
                      className="h-3 w-3 rounded-xs"
                      style={{ backgroundColor: pl.color }}
                    />
                    <span className="font-bold text-slate-900">{pl.name}</span>
                  </div>
                  <span className="font-extrabold text-slate-900 tabular-nums">
                    {pl.bankrupt ? 'Phá sản' : `$${worth.toLocaleString('en-US')}`}
                  </span>
                </div>
              );
            })}
          </div>

          <button
            type="button"
            data-start="true"
            onClick={onPlayAgain}
            className="btn-3d-crimson w-full py-3.5 rounded-xl text-white font-extrabold text-base cursor-pointer"
          >
            Chơi Ván Mới
          </button>
        </div>
      </div>
    </div>
  );
};
