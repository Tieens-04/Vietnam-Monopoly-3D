import React, { useEffect, useMemo, useState } from 'react';
import { BOARD_TILES } from '../game/boardData';
import {
  canPropertyBeTraded,
  evaluateBotTradeOffer,
  getMinimumNextBid,
  ownsFullColorGroup,
  validateTradeOffer,
} from '../game/rules';
import {
  AuctionState,
  PlayerState,
  PropertyState,
  TileKind,
  TradeOffer,
} from '../game/types';

/* ==========================================
 * 1. LIVE PUBLIC AUCTION MODAL (ĐẤU GIÁ CÔNG KHAI)
 * ========================================== */
interface AuctionModalProps {
  auction: AuctionState;
  players: PlayerState[];
  onBid: (bidderId: number, amount: number) => void;
  onPass: (bidderId: number) => void;
}

export const AuctionModal: React.FC<AuctionModalProps> = ({
  auction,
  players,
  onBid,
  onPass,
}) => {
  const tile = BOARD_TILES[auction.tileIndex];
  const minNextBid = getMinimumNextBid(auction);
  const currentTurnBidder =
    players.find((p) => p.id === auction.currentTurnBidderId) || null;
  const highestBidder =
    auction.highestBidderId !== null
      ? players.find((p) => p.id === auction.highestBidderId) || null
      : null;

  const [customBidInput, setCustomBidInput] = useState<string>(String(minNextBid));

  useEffect(() => {
    setCustomBidInput(String(minNextBid));
  }, [minNextBid, auction.currentTurnBidderId]);

  const isHumanTurn = Boolean(
    currentTurnBidder && !currentTurnBidder.isBot && !currentTurnBidder.bankrupt
  );
  const bidderCash = currentTurnBidder?.cash ?? 0;

  const parsedCustomBid = Math.floor(Number(customBidInput) || 0);
  const canSubmitCustom =
    isHumanTurn && parsedCustomBid >= minNextBid && parsedCustomBid <= bidderCash;

  const quickIncrements = [
    { label: `Đặt $${minNextBid}`, amount: minNextBid },
    { label: `Đặt $${minNextBid + 20}`, amount: minNextBid + 20 },
    { label: `Đặt $${minNextBid + 50}`, amount: minNextBid + 50 },
  ];

  return (
    <div
      data-testid="auction-modal"
      className="fixed inset-0 z-30 flex items-center justify-center p-4 bg-slate-950/45 pointer-events-auto"
    >
      <div className="w-full max-w-lg hud-card-light rounded-2xl overflow-hidden animate-pop-in">
        {/* Property Header Banner */}
        <div
          className="px-6 py-4 text-white flex items-center justify-between gap-3"
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
            <div className="text-xs font-bold tracking-wide text-white/90">
              PHIÊN ĐẤU GIÁ CÔNG KHAI
            </div>
            <h3 className="text-xl font-extrabold mt-0.5">{tile.name}</h3>
            {tile.groupLabel && (
              <div className="text-xs text-white/85 mt-0.5">Nhóm {tile.groupLabel}</div>
            )}
          </div>
          <div className="text-right tabular-nums shrink-0">
            <div className="text-[11px] text-white/80">Giá niêm yết</div>
            <div className="text-lg font-extrabold">${tile.price}</div>
          </div>
        </div>

        <div className="p-5 space-y-4">
          {/* Highest Bid Spotlight */}
          <div className="p-3.5 rounded-xl bg-slate-900 text-white flex items-center justify-between gap-3">
            <div>
              <div className="text-xs text-slate-400">
                {highestBidder ? 'Mức giá dẫn đầu hiện tại' : 'Giá khởi điểm (50%)'}
              </div>
              <div className="text-2xl font-extrabold text-amber-400 tabular-nums mt-0.5">
                ${highestBidder ? auction.currentBid : auction.startingBid}
              </div>
            </div>

            <div className="text-right">
              <div className="text-xs text-slate-400">Người trả cao nhất</div>
              {highestBidder ? (
                <div className="flex items-center justify-end gap-1.5 mt-0.5">
                  <span
                    className="h-3 w-3 rounded-xs shrink-0"
                    style={{ backgroundColor: highestBidder.color }}
                  />
                  <span className="text-sm font-bold text-white">
                    {highestBidder.name}
                  </span>
                </div>
              ) : (
                <div className="text-sm font-semibold text-slate-300 mt-0.5">
                  Chưa có lượt đặt
                </div>
              )}
            </div>
          </div>

          {/* Bidders Status Grid */}
          <div className="grid grid-cols-2 gap-2">
            {players
              .filter((p) => !p.bankrupt)
              .map((pl) => {
                const isActiveInAuction = auction.activeBidderIds.includes(pl.id);
                const isCurrentTurn = auction.currentTurnBidderId === pl.id;
                const isLeader = auction.highestBidderId === pl.id;

                return (
                  <div
                    key={pl.id}
                    className={`px-3 py-2 rounded-xl border text-xs flex items-center justify-between gap-2 ${
                      isCurrentTurn
                        ? 'bg-amber-50 border-amber-400 text-slate-950'
                        : isActiveInAuction
                          ? 'bg-slate-50 border-slate-200 text-slate-800'
                          : 'bg-slate-100/70 border-slate-200/70 text-slate-400 line-through'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span
                        className="h-2.5 w-2.5 rounded-xs shrink-0"
                        style={{ backgroundColor: pl.color }}
                      />
                      <span className="font-bold truncate">{pl.name}</span>
                    </div>
                    <div className="shrink-0 tabular-nums font-semibold">
                      {!isActiveInAuction
                        ? 'Đã bỏ'
                        : isLeader
                          ? 'Dẫn đầu'
                          : `$${pl.cash}`}
                    </div>
                  </div>
                );
              })}
          </div>

          {/* Active Turn Controls (Human vs Bot AI) */}
          {currentTurnBidder && (
            <div className="p-4 rounded-xl bg-slate-100 border border-slate-200 space-y-3">
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-1.5">
                  <span
                    className="h-2.5 w-2.5 rounded-xs"
                    style={{ backgroundColor: currentTurnBidder.color }}
                  />
                  <span className="font-bold text-slate-900">
                    Lượt trả giá: {currentTurnBidder.name}
                  </span>
                </div>
                <span className="text-slate-600 tabular-nums font-semibold">
                  Số dư: ${currentTurnBidder.cash.toLocaleString('en-US')}
                </span>
              </div>

              {isHumanTurn ? (
                <div className="space-y-2.5">
                  {/* Quick Bid Buttons */}
                  <div className="grid grid-cols-3 gap-2">
                    {quickIncrements.map((item) => (
                      <button
                        key={item.amount}
                        type="button"
                        disabled={bidderCash < item.amount}
                        onClick={() => onBid(currentTurnBidder.id, item.amount)}
                        className="py-2 px-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-35 text-white font-bold text-xs tabular-nums transition-colors cursor-pointer whitespace-nowrap"
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>

                  {/* Custom Bid + Pass Row */}
                  <div className="flex items-center gap-2">
                    <label htmlFor="custom-auction-bid" className="sr-only">
                      Nhập mức giá đấu tùy chỉnh
                    </label>
                    <input
                      id="custom-auction-bid"
                      type="number"
                      min={minNextBid}
                      max={bidderCash}
                      step={10}
                      value={customBidInput}
                      onChange={(e) => setCustomBidInput(e.target.value)}
                      className="w-28 px-3 py-2 rounded-lg bg-white border border-slate-300 text-slate-900 font-bold text-xs tabular-nums"
                    />
                    <button
                      type="button"
                      disabled={!canSubmitCustom}
                      onClick={() => onBid(currentTurnBidder.id, parsedCustomBid)}
                      className="px-3.5 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 disabled:opacity-35 text-white font-bold text-xs transition-colors cursor-pointer whitespace-nowrap"
                    >
                      Trả Giá
                    </button>
                    <button
                      type="button"
                      onClick={() => onPass(currentTurnBidder.id)}
                      className="ml-auto px-3.5 py-2 rounded-lg bg-rose-100 hover:bg-rose-200 text-rose-900 font-bold text-xs transition-colors cursor-pointer whitespace-nowrap"
                    >
                      Bỏ Lượt Đấu Giá
                    </button>
                  </div>
                </div>
              ) : (
                <div className="py-2 text-center text-xs font-semibold text-amber-800 bg-amber-100/80 rounded-lg">
                  {currentTurnBidder.name} đang tính toán mức giá đấu hợp lý...
                </div>
              )}
            </div>
          )}

          {/* Compact Live Auction History */}
          <div className="space-y-1">
            <div className="text-[11px] font-bold text-slate-500">
              Diễn biến phiên đấu giá
            </div>
            <div className="max-h-24 overflow-y-auto slim-scroll rounded-lg bg-slate-50 border border-slate-200 p-2.5 space-y-1 text-xs text-slate-700">
              {auction.history.map((line, i) => (
                <div
                  key={i}
                  className={i === 0 ? 'font-bold text-slate-950' : 'text-slate-600'}
                >
                  • {line}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

/* ==========================================
 * 2. PROPERTY & CASH TRADE MODAL (GIAO DỊCH)
 * ========================================== */
interface TradeModalProps {
  proposer: PlayerState;
  players: PlayerState[];
  properties: Record<number, PropertyState>;
  onExecuteTrade: (offer: TradeOffer) => void;
  onClose: () => void;
}

export const TradeModal: React.FC<TradeModalProps> = ({
  proposer,
  players,
  properties,
  onExecuteTrade,
  onClose,
}) => {
  const partners = useMemo(
    () => players.filter((p) => p.id !== proposer.id && !p.bankrupt),
    [players, proposer.id]
  );

  const [selectedPartnerId, setSelectedPartnerId] = useState<number>(() => {
    // Prefer a partner who owns at least 1 tradable (unimproved) property
    const withTradableLand = partners.find((pt) =>
      Object.values(properties).some((pr) =>
        canPropertyBeTraded(pr.tileIndex, pt.id, properties)
      )
    );
    if (withTradableLand) return withTradableLand.id;
    const withAnyLand = partners.find((pt) =>
      Object.values(properties).some((pr) => pr.ownerId === pt.id)
    );
    return withAnyLand ? withAnyLand.id : partners[0]?.id ?? -1;
  });

  const [offeredTileIndices, setOfferedTileIndices] = useState<number[]>([]);
  const [requestedTileIndices, setRequestedTileIndices] = useState<number[]>([]);
  const [offeredCash, setOfferedCash] = useState<number>(0);
  const [requestedCash, setRequestedCash] = useState<number>(0);
  const [feedback, setFeedback] = useState<{
    tone: 'error' | 'rejected' | 'info';
    message: string;
  } | null>(null);
  const [awaitingHumanPartnerConfirm, setAwaitingHumanPartnerConfirm] =
    useState<boolean>(false);

  const selectedPartner =
    partners.find((p) => p.id === selectedPartnerId) || partners[0] || null;

  // Reset selections when switching partner
  const handleSelectPartner = (partnerId: number) => {
    setSelectedPartnerId(partnerId);
    setOfferedTileIndices([]);
    setRequestedTileIndices([]);
    setOfferedCash(0);
    setRequestedCash(0);
    setFeedback(null);
    setAwaitingHumanPartnerConfirm(false);
  };

  const proposerOwnedProps = useMemo(
    () =>
      Object.values(properties)
        .filter((pr) => pr.ownerId === proposer.id)
        .sort((a, b) => a.tileIndex - b.tileIndex),
    [properties, proposer.id]
  );

  const partnerOwnedProps = useMemo(
    () =>
      selectedPartner
        ? Object.values(properties)
            .filter((pr) => pr.ownerId === selectedPartner.id)
            .sort((a, b) => a.tileIndex - b.tileIndex)
        : [],
    [properties, selectedPartner]
  );

  const toggleOfferedTile = (tileIdx: number) => {
    setFeedback(null);
    setAwaitingHumanPartnerConfirm(false);
    setOfferedTileIndices((prev) =>
      prev.includes(tileIdx) ? prev.filter((x) => x !== tileIdx) : [...prev, tileIdx]
    );
  };

  const toggleRequestedTile = (tileIdx: number) => {
    setFeedback(null);
    setAwaitingHumanPartnerConfirm(false);
    setRequestedTileIndices((prev) =>
      prev.includes(tileIdx) ? prev.filter((x) => x !== tileIdx) : [...prev, tileIdx]
    );
  };

  const currentOffer: TradeOffer | null = selectedPartner
    ? {
        fromPlayerId: proposer.id,
        toPlayerId: selectedPartner.id,
        offeredTileIndices,
        requestedTileIndices,
        offeredCash,
        requestedCash,
      }
    : null;

  const handlePropose = () => {
    if (!currentOffer || !selectedPartner) return;

    const validation = validateTradeOffer(currentOffer, players, properties);
    if (!validation.valid) {
      setFeedback({
        tone: 'error',
        message: validation.reason || 'Đề nghị giao dịch chưa hợp lệ.',
      });
      return;
    }

    if (selectedPartner.isBot) {
      const botDecision = evaluateBotTradeOffer(currentOffer, players, properties);
      if (!botDecision.accepted) {
        setFeedback({
          tone: 'rejected',
          message: botDecision.reason,
        });
        return;
      }
      onExecuteTrade(currentOffer);
    } else {
      // Human-to-Human local multiplayer confirmation step
      setAwaitingHumanPartnerConfirm(true);
      setFeedback({
        tone: 'info',
        message: `Mời ${selectedPartner.name} xem xét và xác nhận đề nghị giao dịch này.`,
      });
    }
  };

  return (
    <div
      data-testid="trade-modal"
      className="fixed inset-0 z-30 flex items-center justify-center p-4 bg-slate-950/45 pointer-events-auto"
    >
      <div className="w-full max-w-3xl hud-card-light rounded-2xl overflow-hidden animate-pop-in flex flex-col max-h-[88vh]">
        {/* Header */}
        <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between">
          <div>
            <h3 className="text-lg font-extrabold">
              Đàm Phán Mua Lại & Trao Đổi Bất Động Sản
            </h3>
            <p className="text-xs text-slate-300 mt-0.5">
              Đề nghị mua đất bằng tiền mặt hoặc đổi đất kèm tiền bù chênh lệch với đối thủ
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng cửa sổ giao dịch"
            className="h-8 w-8 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center text-white font-bold cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* Partner Selector Bar */}
        <div className="px-6 py-3 bg-slate-100 border-b border-slate-200 flex flex-wrap items-center gap-2">
          <span className="text-xs font-bold text-slate-600 mr-1">Chọn đối tác:</span>
          {partners.map((pt) => {
            const propCount = Object.values(properties).filter(
              (pr) => pr.ownerId === pt.id
            ).length;
            const isSelected = selectedPartner?.id === pt.id;
            return (
              <button
                key={pt.id}
                type="button"
                onClick={() => handleSelectPartner(pt.id)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 border transition-colors cursor-pointer whitespace-nowrap ${
                  isSelected
                    ? 'bg-slate-900 text-white border-slate-900'
                    : 'bg-white text-slate-800 border-slate-300 hover:bg-slate-50'
                }`}
              >
                <span
                  className="h-2.5 w-2.5 rounded-xs shrink-0"
                  style={{ backgroundColor: pt.color }}
                />
                <span>{pt.name}</span>
                <span
                  className={`tabular-nums ${
                    isSelected ? 'text-amber-300' : 'text-slate-500'
                  }`}
                >
                  (${pt.cash} · {propCount} đất)
                </span>
              </button>
            );
          })}
        </div>

        {/* Two-Column Trade Builder */}
        {selectedPartner ? (
          <div className="p-5 overflow-y-auto slim-scroll space-y-4 flex-1">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Left Column: Proposer Offers */}
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 flex flex-col gap-3">
                <div className="flex items-center justify-between pb-2 border-b border-slate-200">
                  <div className="flex items-center gap-2">
                    <span
                      className="h-3 w-3 rounded-xs"
                      style={{ backgroundColor: proposer.color }}
                    />
                    <span className="font-extrabold text-sm text-slate-900">
                      Bên Đề Nghị ({proposer.name})
                    </span>
                  </div>
                  <span className="text-xs font-bold text-emerald-700 tabular-nums">
                    Có ${proposer.cash.toLocaleString('en-US')}
                  </span>
                </div>

                {/* Cash Offered Input */}
                <div className="space-y-1.5">
                  <label
                    htmlFor="trade-offered-cash"
                    className="block text-xs font-bold text-slate-700"
                  >
                    Tiền mặt bạn đưa thêm ($)
                  </label>
                  <div className="flex items-center gap-1.5">
                    <input
                      id="trade-offered-cash"
                      type="number"
                      min={0}
                      max={proposer.cash}
                      step={10}
                      value={offeredCash}
                      onChange={(e) => {
                        const val = Math.max(
                          0,
                          Math.min(proposer.cash, Math.floor(Number(e.target.value) || 0))
                        );
                        setOfferedCash(val);
                        if (val > 0) setRequestedCash(0);
                        setFeedback(null);
                        setAwaitingHumanPartnerConfirm(false);
                      }}
                      className="w-28 px-3 py-1.5 rounded-lg bg-white border border-slate-300 text-slate-900 font-bold text-sm tabular-nums"
                    />
                    {[50, 100, 200].map((inc) => (
                      <button
                        key={inc}
                        type="button"
                        disabled={proposer.cash < offeredCash + inc}
                        onClick={() => {
                          const next = Math.min(proposer.cash, offeredCash + inc);
                          setOfferedCash(next);
                          if (next > 0) setRequestedCash(0);
                          setFeedback(null);
                          setAwaitingHumanPartnerConfirm(false);
                        }}
                        className="px-2 py-1.5 rounded-lg bg-slate-200 hover:bg-slate-300 disabled:opacity-35 text-slate-800 text-xs font-bold tabular-nums cursor-pointer whitespace-nowrap"
                      >
                        +${inc}
                      </button>
                    ))}
                    {offeredCash > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          setOfferedCash(0);
                          setFeedback(null);
                        }}
                        className="px-2 py-1.5 rounded-lg text-xs font-semibold text-slate-500 hover:text-slate-800 cursor-pointer"
                      >
                        Xóa
                      </button>
                    )}
                  </div>
                </div>

                {/* Proposer Properties */}
                <div className="space-y-1.5">
                  <div className="text-xs font-bold text-slate-700">
                    Đất của bạn đem trao đổi ({offeredTileIndices.length} đã chọn)
                  </div>
                  {proposerOwnedProps.length === 0 ? (
                    <div className="text-xs text-slate-500 py-4 text-center bg-white rounded-lg border border-dashed border-slate-200">
                      Bạn chưa có đất nào (vẫn có thể dùng tiền mặt để hỏi mua đất).
                    </div>
                  ) : (
                    <div className="max-h-44 overflow-y-auto slim-scroll space-y-1.5 pr-1">
                      {proposerOwnedProps.map((pr) => {
                        const tile = BOARD_TILES[pr.tileIndex];
                        const tradable = canPropertyBeTraded(
                          pr.tileIndex,
                          proposer.id,
                          properties
                        );
                        const checked = offeredTileIndices.includes(pr.tileIndex);
                        return (
                          <label
                            key={pr.tileIndex}
                            className={`flex items-center justify-between gap-2 p-2 rounded-lg border text-xs ${
                              !tradable
                                ? 'bg-slate-100 border-slate-200 opacity-55 cursor-not-allowed'
                                : checked
                                  ? 'bg-emerald-50 border-emerald-500 cursor-pointer'
                                  : 'bg-white border-slate-200 hover:border-slate-300 cursor-pointer'
                            }`}
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <input
                                type="checkbox"
                                disabled={!tradable}
                                checked={checked}
                                onChange={() => toggleOfferedTile(pr.tileIndex)}
                                className="rounded border-slate-300"
                              />
                              <span
                                className="h-3.5 w-2 rounded-xs shrink-0"
                                style={{ backgroundColor: tile.groupColor || '#475569' }}
                              />
                              <span className="font-bold text-slate-900 truncate">
                                {tile.name}
                              </span>
                            </div>
                            <span className="shrink-0 tabular-nums text-slate-600 font-semibold">
                              {tradable ? `$${tile.price}` : 'Đang có nhà'}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

              {/* Right Column: Partner Assets Requested */}
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 flex flex-col gap-3">
                <div className="flex items-center justify-between pb-2 border-b border-slate-200">
                  <div className="flex items-center gap-2">
                    <span
                      className="h-3 w-3 rounded-xs"
                      style={{ backgroundColor: selectedPartner.color }}
                    />
                    <span className="font-extrabold text-sm text-slate-900">
                      Bên Đối Tác ({selectedPartner.name})
                    </span>
                  </div>
                  <span className="text-xs font-bold text-emerald-700 tabular-nums">
                    Có ${selectedPartner.cash.toLocaleString('en-US')}
                  </span>
                </div>

                {/* Cash Requested Input */}
                <div className="space-y-1.5">
                  <label
                    htmlFor="trade-requested-cash"
                    className="block text-xs font-bold text-slate-700"
                  >
                    Tiền mặt yêu cầu đối tác bù thêm ($)
                  </label>
                  <div className="flex items-center gap-1.5">
                    <input
                      id="trade-requested-cash"
                      type="number"
                      min={0}
                      max={selectedPartner.cash}
                      step={10}
                      value={requestedCash}
                      onChange={(e) => {
                        const val = Math.max(
                          0,
                          Math.min(
                            selectedPartner.cash,
                            Math.floor(Number(e.target.value) || 0)
                          )
                        );
                        setRequestedCash(val);
                        if (val > 0) setOfferedCash(0);
                        setFeedback(null);
                        setAwaitingHumanPartnerConfirm(false);
                      }}
                      className="w-28 px-3 py-1.5 rounded-lg bg-white border border-slate-300 text-slate-900 font-bold text-sm tabular-nums"
                    />
                    {[50, 100].map((inc) => (
                      <button
                        key={inc}
                        type="button"
                        disabled={selectedPartner.cash < requestedCash + inc}
                        onClick={() => {
                          const next = Math.min(
                            selectedPartner.cash,
                            requestedCash + inc
                          );
                          setRequestedCash(next);
                          if (next > 0) setOfferedCash(0);
                          setFeedback(null);
                          setAwaitingHumanPartnerConfirm(false);
                        }}
                        className="px-2 py-1.5 rounded-lg bg-slate-200 hover:bg-slate-300 disabled:opacity-35 text-slate-800 text-xs font-bold tabular-nums cursor-pointer whitespace-nowrap"
                      >
                        +${inc}
                      </button>
                    ))}
                    {requestedCash > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          setRequestedCash(0);
                          setFeedback(null);
                        }}
                        className="px-2 py-1.5 rounded-lg text-xs font-semibold text-slate-500 hover:text-slate-800 cursor-pointer"
                      >
                        Xóa
                      </button>
                    )}
                  </div>
                </div>

                {/* Partner Properties */}
                <div className="space-y-1.5">
                  <div className="text-xs font-bold text-slate-700">
                    Đất muốn mua / nhận từ {selectedPartner.name} (
                    {requestedTileIndices.length} đã chọn)
                  </div>
                  {partnerOwnedProps.length === 0 ? (
                    <div className="text-xs text-slate-500 py-4 text-center bg-white rounded-lg border border-dashed border-slate-200">
                      {selectedPartner.name} hiện chưa sở hữu mảnh đất nào.
                    </div>
                  ) : (
                    <div className="max-h-44 overflow-y-auto slim-scroll space-y-1.5 pr-1">
                      {partnerOwnedProps.map((pr) => {
                        const tile = BOARD_TILES[pr.tileIndex];
                        const tradable = canPropertyBeTraded(
                          pr.tileIndex,
                          selectedPartner.id,
                          properties
                        );
                        const checked = requestedTileIndices.includes(pr.tileIndex);
                        const isMono =
                          tile.group &&
                          ownsFullColorGroup(selectedPartner.id, tile.group, properties);
                        return (
                          <label
                            key={pr.tileIndex}
                            className={`flex items-center justify-between gap-2 p-2 rounded-lg border text-xs ${
                              !tradable
                                ? 'bg-slate-100 border-slate-200 opacity-55 cursor-not-allowed'
                                : checked
                                  ? 'bg-amber-50 border-amber-500 cursor-pointer'
                                  : 'bg-white border-slate-200 hover:border-slate-300 cursor-pointer'
                            }`}
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <input
                                type="checkbox"
                                disabled={!tradable}
                                checked={checked}
                                onChange={() => toggleRequestedTile(pr.tileIndex)}
                                className="rounded border-slate-300"
                              />
                              <span
                                className="h-3.5 w-2 rounded-xs shrink-0"
                                style={{ backgroundColor: tile.groupColor || '#475569' }}
                              />
                              <span className="font-bold text-slate-900 truncate">
                                {tile.name}
                              </span>
                              {isMono && (
                                <span className="text-[10px] font-semibold text-amber-700">
                                  · Bộ màu
                                </span>
                              )}
                            </div>
                            <span className="shrink-0 tabular-nums text-slate-600 font-semibold">
                              {tradable ? `$${tile.price}` : 'Đang có nhà'}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Feedback / Bot Response Banner */}
            {feedback && (
              <div
                data-testid="trade-feedback-banner"
                className={`p-3.5 rounded-xl border text-xs font-semibold ${
                  feedback.tone === 'error' || feedback.tone === 'rejected'
                    ? 'bg-rose-50 border-rose-200 text-rose-900'
                    : 'bg-amber-50 border-amber-300 text-amber-950'
                }`}
              >
                {feedback.message}
              </div>
            )}

            {/* Human-to-Human Confirmation Prompt */}
            {awaitingHumanPartnerConfirm && currentOffer && (
              <div className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-300 flex flex-wrap items-center justify-between gap-3">
                <span className="text-xs font-bold text-emerald-950">
                  Xác nhận từ {selectedPartner.name}: Bạn có đồng ý thực hiện thương vụ này?
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onExecuteTrade(currentOffer)}
                    className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold cursor-pointer whitespace-nowrap"
                  >
                    Đồng Ý Giao Dịch
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setAwaitingHumanPartnerConfirm(false);
                      setFeedback({
                        tone: 'rejected',
                        message: `${selectedPartner.name} đã từ chối lời đề nghị giao dịch.`,
                      });
                    }}
                    className="px-3.5 py-1.5 rounded-lg bg-rose-100 hover:bg-rose-200 text-rose-900 text-xs font-bold cursor-pointer whitespace-nowrap"
                  >
                    Từ Chối
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="p-8 text-center text-sm text-slate-500">
            Không còn đối tác nào khả dụng để giao dịch.
          </div>
        )}

        {/* Footer Actions */}
        <div className="px-6 py-3.5 bg-slate-100 border-t border-slate-200 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-800 text-sm font-bold cursor-pointer whitespace-nowrap"
          >
            Đóng
          </button>

          {!awaitingHumanPartnerConfirm && selectedPartner && (
            <button
              type="button"
              onClick={handlePropose}
              className="px-5 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-sm font-extrabold shadow-xs transition-colors cursor-pointer whitespace-nowrap"
            >
              Gửi Đề Nghị Giao Dịch
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
