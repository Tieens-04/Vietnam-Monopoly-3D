import React, { useEffect, useRef, useState } from 'react';
import { BOARD_TILES, COLOR_GROUP_META } from '../game/boardData';
import {
  botPickAssetToLiquidate,
  calculateBuyoutPrice,
  calculateNetWorth,
  canSellHouse,
  formatBusinessTourCompact,
  formatBusinessTourSpaced,
  getHouseSellRefund,
  getInitialPurchaseTiers,
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
import { PlayerAvatar3D } from './PlayerAvatar3D';

/* ==========================================
 * 1. RAYCASTED TILE INSPECTOR POPOVER CARD
 * ========================================== */
interface TileInspectorProps {
  tileIndex: number;
  players: PlayerState[];
  properties: Record<number, PropertyState>;
  currentPlayer: PlayerState | null;
  canActOnAssets: boolean;
  onSellHouse: (tileIndex: number) => void;
  onClose: () => void;
}

export const TileInspectorCard: React.FC<TileInspectorProps> = ({
  tileIndex,
  players,
  properties,
  currentPlayer,
  canActOnAssets,
  onSellHouse,
  onClose,
}) => {
  const tile = BOARD_TILES[tileIndex];
  const prop = properties[tileIndex];
  const owner =
    prop && prop.ownerId !== null
      ? players.find((p) => p.id === prop.ownerId) || null
      : null;

  const isOwnedByActiveHuman = Boolean(
    currentPlayer &&
      !currentPlayer.isBot &&
      owner?.id === currentPlayer.id &&
      canActOnAssets
  );

  const sellHouseCheck =
    currentPlayer && isOwnedByActiveHuman
      ? canSellHouse(currentPlayer.id, tileIndex, properties)
      : { allowed: false, refund: getHouseSellRefund(tileIndex), reason: undefined };

  const hasColorMono =
    owner !== null &&
    tile.group !== undefined &&
    ownsFullColorGroup(owner.id, tile.group, properties);

  const btMult = hasColorMono ? 2 : 1;

  const statusNotes: string[] = [];
  if (prop && prop.level >= 4) {
    statusNotes.push('Khiên bảo vệ (Miễn mua lại)');
  }
  if (hasColorMono) {
    statusNotes.push('Độc quyền bộ màu (×2)');
  }

  return (
    <div
      data-testid="tile-inspector-card"
      className="fixed left-3 sm:left-4 top-1/2 -translate-y-1/2 z-25 w-80 bt-casual-modal rounded-3xl overflow-hidden animate-pop-in pointer-events-auto"
    >
      {/* Glossy Color Header Banner */}
      <div
        className="px-4 py-3 flex items-start justify-between gap-2 text-white border-b-2 border-white/50"
        style={{
          background: `linear-gradient(180deg, ${
            owner?.color ||
            tile.groupColor ||
            (tile.kind === TileKind.TRANSPORT
              ? '#29B6F6'
              : tile.kind === TileKind.UTILITY
                ? '#F5B800'
                : '#0284C7')
          } 0%, ${
            owner?.color ||
            tile.groupColor ||
            (tile.kind === TileKind.TRANSPORT
              ? '#0284C7'
              : tile.kind === TileKind.UTILITY
                ? '#D97706'
                : '#0369A1')
          } 100%)`,
          textShadow: '0 1.5px 2px rgba(15, 23, 42, 0.45)',
        }}
      >
        <div>
          {tile.groupLabel && (
            <div className="text-[10px] font-black uppercase tracking-wider text-white/90">
              Cụm {tile.groupLabel}
            </div>
          )}
          <h3 className="font-display text-lg font-black uppercase leading-snug text-white">
            {tile.name}
          </h3>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Đóng thông tin ô đất"
          className="h-7 w-7 rounded-full bg-black/25 hover:bg-black/40 flex items-center justify-center text-white text-xs font-black cursor-pointer"
        >
          ✕
        </button>
      </div>

      <div className="p-4 space-y-3 text-sm text-slate-800">
        <p className="text-xs text-slate-600 leading-relaxed">{tile.description}</p>

        {statusNotes.length > 0 && (
          <div className="text-[11px] font-extrabold text-[#16A34A] leading-snug">
            {statusNotes.join(' · ')}
          </div>
        )}

        {/* Price & Owner Summary */}
        {prop && (
          <div className="flex items-center justify-between py-2 border-y border-sky-100 text-xs">
            <div>
              <span className="text-slate-500 font-semibold">Giá ô đất: </span>
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
                <span className="font-extrabold text-[#16A34A]">Đất trống</span>
              )}
            </div>
          </div>
        )}

        {/* Rent Schedule Table for City Properties */}
        {tile.kind === TileKind.PROPERTY && tile.rents && (
          <div className="rounded-2xl bg-sky-50/90 border border-sky-200 overflow-hidden text-xs">
            <div className="id-subheader-strip px-3 py-1.5 font-extrabold text-[11px] uppercase flex items-center justify-between">
              <span>Bảng Phí Thuê</span>
              {btMult === 2 && <span className="text-[#16A34A]">×2 Bộ màu</span>}
            </div>
            <div className="p-2 space-y-0.5">
              {[
                {
                  label: 'Đất khởi điểm',
                  val: tile.rents[0] * btMult,
                  active: prop?.ownerId !== null && prop?.level === 0,
                },
                {
                  label: 'Nhà Cấp 1',
                  val: tile.rents[1] * btMult,
                  active: prop?.ownerId !== null && prop?.level === 1,
                },
                {
                  label: 'Nhà Cấp 2',
                  val: tile.rents[2] * btMult,
                  active: prop?.ownerId !== null && prop?.level === 2,
                },
                {
                  label: 'Nhà Cấp 3',
                  val: tile.rents[3] * btMult,
                  active: prop?.ownerId !== null && prop?.level === 3,
                },
                {
                  label: 'Khách Sạn (Khiên ★)',
                  val: tile.rents[4] * btMult,
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
                {prop && prop.ownerId !== null && prop.level < 4 && (
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

        {/* Quick Sell House Action & On-Tile Upgrade Note if owned by active human player */}
        {isOwnedByActiveHuman && prop && tile.kind === TileKind.PROPERTY && (
          <div className="pt-0.5 space-y-1.5">
            {prop.level > 0 && (
              <button
                type="button"
                disabled={!sellHouseCheck.allowed}
                onClick={() => onSellHouse(tileIndex)}
                className="w-full bt-btn-gold py-2 px-3 rounded-xl disabled:opacity-40 text-xs font-extrabold cursor-pointer whitespace-nowrap"
              >
                Bán Nhà (+{formatBusinessTourCompact(sellHouseCheck.refund)})
              </button>
            )}
            {prop.level < 4 && (
              <p className="text-[11px] font-medium text-slate-500 leading-snug">
                Ghé lại đúng ô đất này ở vòng sau để nâng cấp lên Khách sạn Cấp 4 (★).
              </p>
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
  onBuy: (initialLevel?: number) => void;
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
  const tiers = getInitialPurchaseTiers(player, tileIndex);
  const [selectedLevel, setSelectedLevel] = useState<0 | 1 | 2 | 3>(0);

  const isBtCity = tile.kind === TileKind.PROPERTY;
  const activeTier =
    tiers.find((t) => t.level === (isBtCity ? selectedLevel : 0)) || tiers[0];
  const totalCost = activeTier ? activeTier.totalCost : price;
  const canAfford = player.cash >= totalCost;

  let groupInfo = '';
  let completesMono = false;
  if (tile.group) {
    const groupMeta = COLOR_GROUP_META[tile.group];
    const ownedInGroup = groupMeta.tileIndices.filter(
      (idx) => properties[idx]?.ownerId === player.id
    ).length;
    completesMono = ownedInGroup === groupMeta.tileIndices.length - 1;
    groupInfo = `Cụm ${groupMeta.label} (${ownedInGroup}/${groupMeta.tileIndices.length})`;
  }

  return (
    <div
      data-testid="buy-decision-modal"
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
            {isBtCity ? 'Mua Ô Đất & Xây Dựng' : 'Đầu Tư Bất Động Sản'}
          </div>
          <h3 className="font-display text-xl sm:text-2xl font-black uppercase leading-tight text-white">
            {tile.name}
          </h3>
        </div>
        <div className="text-right font-mono-num shrink-0 bg-black/20 rounded-xl px-3 py-1.5 border border-white/30">
          <div className="text-[9px] font-bold uppercase text-white/90">Tổng chi phí</div>
          <div className="text-base sm:text-lg font-black leading-none">
            {formatBusinessTourCompact(totalCost)}
          </div>
        </div>
      </div>

      <div className="p-4 sm:p-5 space-y-3.5">
        {groupInfo && (
          <div className="flex flex-wrap items-center gap-1.5 text-xs font-extrabold text-sky-900">
            <span>{groupInfo}</span>
            {completesMono && (
              <>
                <span aria-hidden="true">·</span>
                <span className="text-[#16A34A] font-black">Đủ bộ màu ×2!</span>
              </>
            )}
          </div>
        )}
        <p className="text-xs text-slate-600 leading-relaxed">{tile.description}</p>

        {isBtCity && tile.rents && (
          <div className="space-y-2">
            <div className="text-xs font-bold text-slate-700">
              Chọn cấp công trình xây ngay (Khách sạn ★ mở khi ghé lại):
            </div>
            <div className="grid grid-cols-2 gap-2">
              {tiers.map((t) => {
                const isSelected = selectedLevel === t.level;
                const rentVal = tile.rents![t.level] * (completesMono ? 2 : 1);
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

        <div className="grid grid-cols-2 gap-2.5 pt-1">
          <button
            type="button"
            disabled={!canAfford}
            onClick={() => onBuy(isBtCity ? selectedLevel : 0)}
            className="bt-btn-green py-2.5 px-4 rounded-2xl disabled:opacity-40 font-black text-sm uppercase tracking-wide cursor-pointer whitespace-nowrap"
          >
            {canAfford
              ? `Mua Ngay (${formatBusinessTourCompact(totalCost)})`
              : 'Không Đủ Tiền'}
          </button>
          <button
            type="button"
            onClick={onSkip}
            className="bt-btn-white py-2.5 px-4 rounded-2xl font-black text-sm uppercase tracking-wide cursor-pointer whitespace-nowrap"
          >
            Bỏ Qua
          </button>
        </div>
      </div>
    </div>
  );
};

/* ==========================================
 * 3. FULL-SCREEN ILLUSTRATED BUSINESS TOUR EVENT POPUP
 *    (Rich 2D Cartoon Illustration + Cream Parchment Ribbon Banner
 *     with Bold Red/Orange Uppercase Alert Text)
 * ========================================== */
interface LuckCardModalProps {
  card: LuckCard;
  isBot: boolean;
  onConfirm: () => void;
}

const EventCartoonIllustration: React.FC<{ card: LuckCard }> = ({ card }) => {
  const kind = card.effect.type;

  // 1. Power Outage / Earthquake / Urban Repair Cartoon Scene
  if (kind === 'HOUSE_REPAIR') {
    return (
      <svg
        viewBox="0 0 280 200"
        className="w-56 sm:w-64 h-auto mx-auto drop-shadow-[0_12px_20px_rgba(15,23,42,0.35)]"
        role="img"
        aria-label={card.title}
      >
        <defs>
          <radialGradient id="evtBurstStorm" cx="50%" cy="50%" r="52%">
            <stop offset="0%" stopColor="#FEF08A" />
            <stop offset="65%" stopColor="#38BDF8" />
            <stop offset="100%" stopColor="#0284C7" />
          </radialGradient>
        </defs>
        <circle cx="140" cy="102" r="88" fill="url(#evtBurstStorm)" stroke="#FFFFFF" strokeWidth="6" />
        {/* Green hill */}
        <path d="M62 146 Q140 120 218 146 L206 172 Q140 194 74 172 Z" fill="#8CD756" />
        {/* Tilted cartoon houses */}
        <g transform="translate(88,96) rotate(-7)">
          <rect x="0" y="18" width="38" height="34" rx="4" fill="#FFFBEB" stroke="#1E293B" strokeWidth="3" />
          <polygon points="-5,20 19,-2 43,20" fill="#E91E63" stroke="#1E293B" strokeWidth="3" />
          <rect x="12" y="28" width="14" height="14" rx="2" fill="#FDE047" stroke="#1E293B" strokeWidth="2.2" />
        </g>
        <g transform="translate(148,88) rotate(6)">
          <rect x="0" y="16" width="44" height="42" rx="4" fill="#F8FAFC" stroke="#1E293B" strokeWidth="3" />
          <polygon points="-5,18 22,-6 49,18" fill="#F5B800" stroke="#1E293B" strokeWidth="3" />
          <rect x="9" y="26" width="10" height="10" rx="2" fill="#38BDF8" stroke="#1E293B" strokeWidth="2" />
          <rect x="25" y="26" width="10" height="10" rx="2" fill="#38BDF8" stroke="#1E293B" strokeWidth="2" />
        </g>
        {/* Cartoon Storm Cloud & Bright Lightning Bolt */}
        <g transform="translate(92,22)">
          <path
            d="M24 44 C10 44, 4 33, 12 23 C14 10, 30 6, 41 14 C50 4, 72 6, 78 20 C90 21, 94 35, 84 44 Z"
            fill="#334155"
            stroke="#FFFFFF"
            strokeWidth="3"
          />
          <polygon
            points="52,40 34,74 49,74 39,104 72,64 55,64"
            fill="#FACC15"
            stroke="#EA580C"
            strokeWidth="2.8"
          />
        </g>
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
        {/* Ocean rim */}
        <path d="M58 134 Q140 118 222 134 Q206 178 140 186 Q74 178 58 134 Z" fill="#0284C7" />
        {/* Golden Sand Island */}
        <ellipse cx="140" cy="136" rx="54" ry="20" fill="#FDE68A" stroke="#F59E0B" strokeWidth="3" />
        {/* Cartoon Palm Trunk & Fronds */}
        <path d="M136 132 Q122 92 146 58" fill="none" stroke="#92400E" strokeWidth="10" strokeLinecap="round" />
        <path d="M146 58 Q112 46 96 68 Q122 66 146 58 Z" fill="#66C61C" stroke="#15803D" strokeWidth="2.5" />
        <path d="M146 58 Q182 44 198 68 Q170 66 146 58 Z" fill="#84E635" stroke="#15803D" strokeWidth="2.5" />
        <path d="M146 58 Q144 26 172 34 Q158 48 146 58 Z" fill="#66C61C" stroke="#15803D" strokeWidth="2.5" />
        <circle cx="143" cy="64" r="5.5" fill="#78350F" />
        <circle cx="152" cy="66" r="5.5" fill="#78350F" />
        {/* Red/White Life Buoy */}
        <circle cx="176" cy="142" r="14" fill="#FFFFFF" stroke="#EF4444" strokeWidth="6" strokeDasharray="11 11" />
      </svg>
    );
  }

  // 3. World Tour / Championship Travel Cartoon Scene
  if (kind === 'MOVE_TO' || kind === 'MOVE_RELATIVE') {
    return (
      <svg
        viewBox="0 0 280 200"
        className="w-56 sm:w-64 h-auto mx-auto drop-shadow-[0_12px_20px_rgba(15,23,42,0.35)]"
        role="img"
        aria-label={card.title}
      >
        <circle cx="140" cy="102" r="88" fill="#7DD3FC" stroke="#FFFFFF" strokeWidth="6" />
        {/* Fluffy clouds */}
        <ellipse cx="94" cy="138" rx="34" ry="16" fill="#FFFFFF" />
        <ellipse cx="184" cy="144" rx="38" ry="18" fill="#FFFFFF" />
        {/* Rainbow swoosh trail */}
        <path d="M68 142 Q115 112 152 94" fill="none" stroke="#F5B800" strokeWidth="8" strokeLinecap="round" />
        <path d="M74 150 Q120 120 156 102" fill="none" stroke="#E91E63" strokeWidth="6" strokeLinecap="round" />
        {/* Cartoon Jetliner */}
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

  // 4. Penalty / Tax Alert Cartoon Scene
  if (kind === 'PAY_CASH') {
    return (
      <svg
        viewBox="0 0 280 200"
        className="w-56 sm:w-64 h-auto mx-auto drop-shadow-[0_12px_20px_rgba(15,23,42,0.35)]"
        role="img"
        aria-label={card.title}
      >
        <circle cx="140" cy="102" r="88" fill="#FCA5A5" stroke="#FFFFFF" strokeWidth="6" />
        {/* Official Tax Bill Scroll */}
        <rect x="96" y="48" width="88" height="106" rx="12" fill="#FFFBEB" stroke="#B45309" strokeWidth="3.5" />
        <rect x="112" y="66" width="56" height="10" rx="4" fill="#EF4444" />
        <rect x="112" y="86" width="56" height="7" rx="3.5" fill="#94A3B8" />
        <rect x="112" y="101" width="42" height="7" rx="3.5" fill="#94A3B8" />
        {/* Winged Gold Coins Flying Out */}
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

  // 5. Default Treasure Chest / Cash Jackpot / VIP Pass Cartoon Scene
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
      {/* Green Cash Bills Fanning Behind */}
      <g transform="translate(105,62) rotate(-16)">
        <rect x="0" y="0" width="66" height="36" rx="5" fill="#22C55E" stroke="#14532D" strokeWidth="3" />
        <circle cx="33" cy="18" r="9" fill="#BBF7D0" />
      </g>
      <g transform="translate(116,56) rotate(14)">
        <rect x="0" y="0" width="66" height="36" rx="5" fill="#4ADE80" stroke="#14532D" strokeWidth="3" />
        <circle cx="33" cy="18" r="9" fill="#DCFCE7" />
      </g>
      {/* Overflowing Golden Treasure / Trophy */}
      <rect x="88" y="96" width="104" height="58" rx="10" fill="#B45309" stroke="#78350F" strokeWidth="4" />
      <rect x="88" y="86" width="104" height="20" rx="8" fill="#F59E0B" stroke="#78350F" strokeWidth="3.5" />
      <circle cx="122" cy="92" r="11" fill="#FEF08A" stroke="#CA8A04" strokeWidth="2.5" />
      <circle cx="142" cy="88" r="13" fill="#FACC15" stroke="#CA8A04" strokeWidth="2.5" />
      <circle cx="162" cy="93" r="11" fill="#FEF08A" stroke="#CA8A04" strokeWidth="2.5" />
      <rect x="131" y="106" width="18" height="22" rx="4" fill="#FDE047" stroke="#78350F" strokeWidth="3" />
    </svg>
  );
};

export const LuckCardModal: React.FC<LuckCardModalProps> = ({ card, isBot, onConfirm }) => {
  const isNegative =
    card.effect.type === 'PAY_CASH' ||
    card.effect.type === 'GO_TO_JAIL' ||
    card.effect.type === 'HOUSE_REPAIR';

  return (
    <div
      data-testid="luck-card-modal"
      className="fixed inset-0 z-35 flex items-center justify-center p-4 bg-slate-950/55 pointer-events-auto"
    >
      <div className="w-full max-w-lg flex flex-col items-center text-center animate-pop-in">
        {/* Top Deck Category Banner */}
        <div className="mb-2 px-4 py-1 rounded-full bg-white/95 border-2 border-[#F5B800] shadow-md">
          <span className="font-display text-xs font-black uppercase tracking-widest text-[#B45309]">
            {card.deck === 'CHANCE' ? '★ Sự Kiện Cơ Hội ★' : '★ Sự Kiện Khí Vận ★'}
          </span>
        </div>

        {/* Center Rich 2D Cartoon Illustration */}
        <div className="relative animate-float-gentle">
          <EventCartoonIllustration card={card} />
        </div>

        {/* Sculpted Cream Parchment Ribbon Banner Below with Bold Red/Orange Uppercase Alert Text */}
        <div className="relative -mt-4 w-full max-w-md px-3">
          {/* Left & Right Folded Parchment Swallowtail Ends */}
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
            className="rounded-2xl px-6 py-4 border-[3px] border-[#D97706] shadow-[0_14px_30px_rgba(15,23,42,0.42),inset_0_2px_0_#FFFFFF]"
            style={{
              background: 'linear-gradient(180deg, #FFFDF2 0%, #FDE68A 100%)',
            }}
          >
            <h3
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

        {/* Glossy Casual Action CTA (Human & Bot both allow reading time + immediate skip/continue) */}
        <div className="mt-4 w-full max-w-xs space-y-2">
          {isBot && (
            <div className="text-xs font-extrabold text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.65)]">
              Bot đang đọc thẻ sự kiện...
            </div>
          )}
          <button
            type="button"
            onClick={onConfirm}
            className="bt-btn-green w-full py-3 px-8 rounded-full font-black text-base uppercase tracking-wider cursor-pointer whitespace-nowrap"
          >
            Tiếp Tục Ngay
          </button>
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
  const suggestedLiquidation = pendingDebt
    ? botPickAssetToLiquidate(player.id, properties)
    : null;

  const handleAutoSellStep = () => {
    if (!suggestedLiquidation) return;
    if (suggestedLiquidation.action === 'SELL_HOUSE') {
      onSellHouse(suggestedLiquidation.tileIndex);
    } else {
      onSellProperty(suggestedLiquidation.tileIndex);
    }
  };

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center p-4 bg-slate-950/42 pointer-events-auto">
      <div className="w-full max-w-2xl bt-casual-modal rounded-3xl overflow-hidden animate-pop-in flex flex-col max-h-[85vh]">
        <div
          className={`px-6 py-4 flex items-center justify-between ${
            pendingDebt ? 'bt-header-pink' : 'bt-header-sky'
          }`}
        >
          <div>
            <h3 className="font-display text-lg sm:text-xl font-black uppercase text-white leading-tight">
              {pendingDebt ? 'Huy Động Vốn Trả Nợ' : 'Danh Mục Tài Sản Của Bạn'}
            </h3>
            <p className="text-xs font-bold text-white/90 mt-0.5">
              Tiền mặt của {player.name}:{' '}
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
              className="h-8 w-8 rounded-full bg-white/20 hover:bg-white/35 flex items-center justify-center text-white font-black cursor-pointer"
            >
              ✕
            </button>
          )}
        </div>

        {/* Debt Alert Banner */}
        {pendingDebt && (
          <div className="px-6 py-3 bg-rose-50 border-b border-rose-200 flex flex-wrap items-center justify-between gap-2.5">
            <div className="text-xs text-rose-950 font-semibold">
              <strong className="font-black">{pendingDebt.reason}:</strong> Cần thanh toán{' '}
              <span className="font-mono-num font-black text-rose-600">
                {formatBusinessTourSpaced(pendingDebt.amount)}
              </span>
              . Hãy bán bớt nhà hoặc thành phố để đủ tiền mặt!
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {canCoverDebtNow ? (
                <button
                  type="button"
                  onClick={onPayPendingDebt}
                  className="bt-btn-green px-4 py-1.5 rounded-xl text-xs font-black uppercase cursor-pointer whitespace-nowrap"
                >
                  Thanh Toán ({formatBusinessTourCompact(pendingDebt.amount)})
                </button>
              ) : (
                suggestedLiquidation && (
                  <button
                    type="button"
                    onClick={handleAutoSellStep}
                    className="bt-btn-cyan px-3.5 py-1.5 rounded-xl text-xs font-black uppercase cursor-pointer whitespace-nowrap"
                  >
                    Bán Nhanh Gợi Ý
                  </button>
                )
              )}
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

        <div className="id-subheader-strip px-6 py-2 flex items-center justify-between text-xs font-extrabold uppercase">
          <span>Ô Đất Sở Hữu ({owned.length})</span>
          <span>Thao Tác</span>
        </div>

        {/* Owned Properties List */}
        <div className="p-5 overflow-y-auto slim-scroll divide-y divide-sky-100 flex-1">
          {owned.length === 0 ? (
            <div className="text-center py-10 text-sm font-bold text-slate-400">
              Bạn chưa sở hữu ô đất nào trên bàn cờ.
            </div>
          ) : (
            owned.map((prop) => {
              const tile = BOARD_TILES[prop.tileIndex];
              const sellHouse = canSellHouse(player.id, prop.tileIndex, properties);
              const propRefund = getPropertySellRefund(prop.tileIndex);
              const isMono =
                tile.group && ownsFullColorGroup(player.id, tile.group, properties);

              const tags: string[] = [];
              if (isMono) tags.push('Độc quyền ×2');
              if (prop.level >= 4) tags.push('Khiên bảo vệ ★');

              return (
                <div
                  key={prop.tileIndex}
                  className="py-3 first:pt-0 last:pb-0 flex flex-wrap items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className="h-9 w-3.5 rounded-md shrink-0 border border-white shadow-xs"
                      style={{
                        backgroundColor: tile.groupColor || player.color,
                      }}
                    />
                    <div>
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
                        {tile.kind === TileKind.PROPERTY ? (
                          <span className="font-bold text-slate-700">
                            {prop.level === 0
                              ? 'Đất khởi điểm'
                              : prop.level === 4
                                ? 'Khách sạn Cấp 4 (★)'
                                : `Nhà Cấp ${prop.level}`}
                          </span>
                        ) : (
                          <span>
                            Giá trị: {formatBusinessTourCompact(tile.price || 0)}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Sell House / Sell Land Buttons */}
                  <div className="flex flex-wrap items-center gap-2">
                    {prop.level > 0 ? (
                      <button
                        type="button"
                        disabled={!sellHouse.allowed}
                        title={sellHouse.reason}
                        onClick={() => onSellHouse(prop.tileIndex)}
                        className="bt-btn-gold px-3 py-1.5 rounded-xl disabled:opacity-40 text-xs font-extrabold cursor-pointer whitespace-nowrap"
                      >
                        Bán Nhà (+{formatBusinessTourCompact(sellHouse.refund)})
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => onSellProperty(prop.tileIndex)}
                        className="id-btn-crimson px-3 py-1.5 rounded-xl text-xs font-extrabold cursor-pointer whitespace-nowrap"
                      >
                        Bán Đất (+{formatBusinessTourCompact(propRefund)})
                      </button>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {!pendingDebt && (
          <div className="px-6 py-3 bg-sky-50 border-t border-sky-200 flex justify-end">
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
  onResume: () => void;
  onOpenRulebook: () => void;
  onResetCamera: () => void;
  onRestartToTitle: () => void;
}> = ({ onResume, onOpenRulebook, onResetCamera, onRestartToTitle }) => (
  <div className="fixed inset-0 z-30 flex items-center justify-center p-4 bg-slate-950/42 pointer-events-auto">
    <div className="w-full max-w-sm bt-casual-modal rounded-3xl overflow-hidden animate-pop-in text-center">
      <div className="bt-header-sky px-6 py-4">
        <h2 className="font-display text-xl font-black uppercase tracking-wide text-white">
          Tạm Dừng Ván Đấu
        </h2>
      </div>
      <div className="p-6 space-y-3">
        <button
          type="button"
          onClick={onResume}
          className="bt-btn-green w-full py-2.5 rounded-2xl font-black text-sm sm:text-base uppercase tracking-wide cursor-pointer whitespace-nowrap"
        >
          Tiếp Tục Chơi
        </button>
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
          Sảnh Chờ Mới
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

    const colors = ['#F5B800', '#66C61C', '#E91E63', '#29B6F6', '#FACC15', '#4ADE80'];
    const pieces = Array.from({ length: 90 }, () => ({
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
  victoryLabel?: string;
  players: PlayerState[];
  properties: Record<number, PropertyState>;
  turnCount: number;
  onPlayAgain: () => void;
}> = ({ winner, victoryLabel, players, properties, turnCount, onPlayAgain }) => {
  const ranked = [...players].sort(
    (a, b) => calculateNetWorth(b, properties) - calculateNetWorth(a, properties)
  );

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center p-4 bg-slate-950/48 pointer-events-auto">
      <ConfettiOverlay />
      <div className="relative z-40 w-full max-w-lg bt-casual-modal rounded-3xl overflow-hidden animate-pop-in">
        <div className="bt-header-sky px-6 py-5 text-center">
          <div className="text-xs font-extrabold uppercase tracking-wider text-white/90">
            Chung Cuộc · {turnCount} Lượt Đấu
          </div>
          <h2 className="font-display text-2xl sm:text-3xl font-black uppercase text-[#FEF08A] mt-1">
            🏆 {winner.name} Chiến Thắng!
          </h2>
          {victoryLabel && (
            <p className="mt-1 text-xs font-extrabold text-white">{victoryLabel}</p>
          )}
        </div>

        <div className="p-6 space-y-4">
          <div className="rounded-2xl bg-sky-50 border border-sky-200 overflow-hidden">
            <div className="id-subheader-strip px-4 py-2 grid grid-cols-12 text-xs font-black uppercase">
              <span className="col-span-2">Hạng</span>
              <span className="col-span-6">Tỷ Phú</span>
              <span className="col-span-4 text-right">Tổng Tài Sản</span>
            </div>
            <div className="divide-y divide-sky-100">
              {ranked.map((pl, i) => {
                const worth = calculateNetWorth(pl, properties);
                return (
                  <div
                    key={pl.id}
                    className={`px-4 py-2.5 grid grid-cols-12 items-center text-sm ${
                      pl.id === winner.id ? 'bg-[#F5B800]/20' : ''
                    }`}
                  >
                    <span className="col-span-2 font-mono-num font-black text-sky-800">
                      #{i + 1}
                    </span>
                    <div className="col-span-6 flex items-center gap-2.5 min-w-0">
                      <PlayerAvatar3D
                        archetype={pl.tokenType}
                        mood={
                          pl.id === winner.id
                            ? 'celebrating'
                            : pl.bankrupt
                              ? 'bankrupt'
                              : 'idle'
                        }
                        phaseSeed={pl.id}
                        size="xs"
                      />
                      <span className="font-extrabold text-slate-900 truncate">
                        {pl.name}
                      </span>
                    </div>
                    <span
                      className={`col-span-4 text-right font-mono-num font-black ${
                        pl.bankrupt ? 'text-rose-600 text-xs uppercase' : 'text-[#16A34A]'
                      }`}
                    >
                      {pl.bankrupt ? 'BANKRUPT' : formatBusinessTourSpaced(worth)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          <button
            type="button"
            data-start="true"
            onClick={onPlayAgain}
            className="bt-btn-green w-full py-3.5 rounded-full font-black text-base sm:text-lg uppercase tracking-wider cursor-pointer whitespace-nowrap"
          >
            Chơi Ván Mới
          </button>
        </div>
      </div>
    </div>
  );
};
