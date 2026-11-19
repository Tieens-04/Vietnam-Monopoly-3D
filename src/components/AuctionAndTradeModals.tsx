import React, { useMemo, useState } from 'react';
import { BOARD_TILES } from '../game/boardData';
import {
  BT_DISPLAY_MULTIPLIER,
  canPropertyBeTraded,
  evaluateBotTradeOffer,
  formatBusinessTourCompact,
  formatBusinessTourSpaced,
  ownsFullColorGroup,
  validateTradeOffer,
} from '../game/rules';
import { PlayerState, PropertyState, TradeOffer } from '../game/types';
import { PlayerAvatar3D } from './PlayerAvatar3D';

const K_PER_INTERNAL_UNIT = BT_DISPLAY_MULTIPLIER / 1000; // 3K per 1 internal unit

/* ==========================================
 * PROPERTY & CASH TRADE MODAL (GIAO DỊCH BUSINESS TOUR)
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
      className="fixed inset-0 z-30 flex items-center justify-center p-4 bg-slate-950/38 pointer-events-auto"
    >
      <div className="w-full max-w-3xl bt-casual-modal rounded-3xl overflow-hidden animate-pop-in flex flex-col max-h-[88vh]">
        <div className="bt-header-sky px-6 py-4 flex items-center justify-between">
          <div>
            <h3 className="font-display text-lg sm:text-xl font-black uppercase text-white leading-tight">
              Đàm Phán & Giao Dịch Bất Động Sản
            </h3>
            <p className="text-xs font-bold text-white/90 mt-0.5">
              Đề nghị mua lại thành phố bằng tiền mặt hoặc trao đổi sổ đỏ với đối thủ
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng cửa sổ giao dịch"
            className="h-8 w-8 rounded-full bg-white/20 hover:bg-white/35 flex items-center justify-center text-white font-black cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* Partner Selector Bar */}
        <div className="px-6 py-2.5 bg-sky-50 border-b border-sky-200 flex flex-wrap items-center gap-2">
          <span className="text-xs font-extrabold text-sky-900 mr-1">
            Đối tác:
          </span>
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
                className={`px-3 py-1.5 rounded-xl text-xs font-extrabold flex items-center gap-1.5 border-2 transition-colors cursor-pointer whitespace-nowrap ${
                  isSelected
                    ? 'bg-[#0284C7] text-white border-[#38BDF8] shadow-xs'
                    : 'bg-white text-slate-800 border-sky-200 hover:border-sky-400'
                }`}
              >
                <PlayerAvatar3D
                  archetype={pt.tokenType}
                  phaseSeed={pt.id}
                  mood={isSelected ? 'active' : 'idle'}
                  isActive={isSelected}
                  size="xs"
                />
                <span>{pt.name}</span>
                <span
                  className={`font-mono-num ${
                    isSelected ? 'text-[#FEF08A]' : 'text-slate-500'
                  }`}
                >
                  ({formatBusinessTourCompact(pt.cash)} · {propCount} ô)
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
              <div className="rounded-2xl border-2 border-sky-200 bg-sky-50/70 overflow-hidden flex flex-col">
                <div className="id-subheader-strip px-4 py-2 flex items-center justify-between text-xs font-extrabold">
                  <div className="flex items-center gap-2">
                    <PlayerAvatar3D
                      archetype={proposer.tokenType}
                      phaseSeed={proposer.id}
                      mood="active"
                      isActive
                      size="xs"
                    />
                    <span className="text-slate-900">Bên Đề Nghị ({proposer.name})</span>
                  </div>
                  <span className="font-mono-num text-[#16A34A]">
                    Có {formatBusinessTourSpaced(proposer.cash)}
                  </span>
                </div>

                <div className="p-4 flex flex-col gap-3">
                  <div className="space-y-1.5">
                    <label
                      htmlFor="trade-offered-cash"
                      className="block text-xs font-extrabold text-slate-700"
                    >
                      Tiền mặt bạn đưa thêm (đơn vị K)
                    </label>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <div className="relative flex items-center">
                        <input
                          id="trade-offered-cash"
                          type="number"
                          min={0}
                          max={proposer.cash * K_PER_INTERNAL_UNIT}
                          step={30}
                          value={offeredCash * K_PER_INTERNAL_UNIT}
                          onChange={(e) => {
                            const enteredK = Math.max(0, Math.floor(Number(e.target.value) || 0));
                            const val = Math.max(
                              0,
                              Math.min(
                                proposer.cash,
                                Math.round(enteredK / K_PER_INTERNAL_UNIT)
                              )
                            );
                            setOfferedCash(val);
                            if (val > 0) setRequestedCash(0);
                            setFeedback(null);
                            setAwaitingHumanPartnerConfirm(false);
                          }}
                          className="w-28 pl-3 pr-6 py-1.5 rounded-xl bg-white border-2 border-sky-200 text-slate-900 font-mono-num font-black text-sm"
                        />
                        <span className="absolute right-2.5 text-xs font-black text-slate-400 pointer-events-none">
                          K
                        </span>
                      </div>
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
                          className="px-2.5 py-1.5 rounded-xl bg-white hover:bg-sky-100 border border-sky-300 disabled:opacity-35 text-sky-900 text-xs font-mono-num font-black cursor-pointer whitespace-nowrap"
                        >
                          +{formatBusinessTourCompact(inc)}
                        </button>
                      ))}
                      {offeredCash > 0 && (
                        <button
                          type="button"
                          onClick={() => {
                            setOfferedCash(0);
                            setFeedback(null);
                          }}
                          className="px-2 py-1.5 rounded-xl text-xs font-extrabold text-rose-600 hover:text-rose-800 cursor-pointer"
                        >
                          Xóa
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <div className="text-xs font-extrabold text-slate-700">
                      Đất của bạn đem trao đổi ({offeredTileIndices.length} đã chọn)
                    </div>
                    {proposerOwnedProps.length === 0 ? (
                      <div className="text-xs text-slate-500 py-4 text-center bg-white rounded-xl border border-dashed border-sky-200">
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
                              className={`flex items-center justify-between gap-2 p-2 rounded-xl border-2 text-xs ${
                                !tradable
                                  ? 'bg-slate-100 border-slate-200 opacity-55 cursor-not-allowed'
                                  : checked
                                    ? 'bg-emerald-50 border-[#58B916] cursor-pointer'
                                    : 'bg-white border-sky-200 hover:border-sky-400 cursor-pointer'
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
                                  className="h-3.5 w-2 rounded-[2px] shrink-0"
                                  style={{
                                    backgroundColor: tile.groupColor || '#29B6F6',
                                  }}
                                />
                                <span className="font-extrabold text-slate-900 truncate">
                                  {tile.name}
                                </span>
                              </div>
                              <span className="shrink-0 font-mono-num text-slate-700 font-bold">
                                {tradable
                                  ? formatBusinessTourCompact(tile.price || 0)
                                  : 'Đang có nhà'}
                              </span>
                            </label>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Right Column: Partner Assets Requested */}
              <div className="rounded-2xl border-2 border-sky-200 bg-sky-50/70 overflow-hidden flex flex-col">
                <div className="id-subheader-strip px-4 py-2 flex items-center justify-between text-xs font-extrabold">
                  <div className="flex items-center gap-2">
                    <PlayerAvatar3D
                      archetype={selectedPartner.tokenType}
                      phaseSeed={selectedPartner.id}
                      mood="idle"
                      size="xs"
                    />
                    <span className="text-slate-900">Bên Đối Tác ({selectedPartner.name})</span>
                  </div>
                  <span className="font-mono-num text-[#16A34A]">
                    Có {formatBusinessTourSpaced(selectedPartner.cash)}
                  </span>
                </div>

                <div className="p-4 flex flex-col gap-3">
                  <div className="space-y-1.5">
                    <label
                      htmlFor="trade-requested-cash"
                      className="block text-xs font-extrabold text-slate-700"
                    >
                      Tiền mặt yêu cầu đối tác bù thêm (đơn vị K)
                    </label>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <div className="relative flex items-center">
                        <input
                          id="trade-requested-cash"
                          type="number"
                          min={0}
                          max={selectedPartner.cash * K_PER_INTERNAL_UNIT}
                          step={30}
                          value={requestedCash * K_PER_INTERNAL_UNIT}
                          onChange={(e) => {
                            const enteredK = Math.max(0, Math.floor(Number(e.target.value) || 0));
                            const val = Math.max(
                              0,
                              Math.min(
                                selectedPartner.cash,
                                Math.round(enteredK / K_PER_INTERNAL_UNIT)
                              )
                            );
                            setRequestedCash(val);
                            if (val > 0) setOfferedCash(0);
                            setFeedback(null);
                            setAwaitingHumanPartnerConfirm(false);
                          }}
                          className="w-28 pl-3 pr-6 py-1.5 rounded-xl bg-white border-2 border-sky-200 text-slate-900 font-mono-num font-black text-sm"
                        />
                        <span className="absolute right-2.5 text-xs font-black text-slate-400 pointer-events-none">
                          K
                        </span>
                      </div>
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
                          className="px-2.5 py-1.5 rounded-xl bg-white hover:bg-sky-100 border border-sky-300 disabled:opacity-35 text-sky-900 text-xs font-mono-num font-black cursor-pointer whitespace-nowrap"
                        >
                          +{formatBusinessTourCompact(inc)}
                        </button>
                      ))}
                      {requestedCash > 0 && (
                        <button
                          type="button"
                          onClick={() => {
                            setRequestedCash(0);
                            setFeedback(null);
                          }}
                          className="px-2 py-1.5 rounded-xl text-xs font-extrabold text-rose-600 hover:text-rose-800 cursor-pointer"
                        >
                          Xóa
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <div className="text-xs font-extrabold text-slate-700">
                      Đất muốn mua / nhận từ {selectedPartner.name} (
                      {requestedTileIndices.length} đã chọn)
                    </div>
                    {partnerOwnedProps.length === 0 ? (
                      <div className="text-xs text-slate-500 py-4 text-center bg-white rounded-xl border border-dashed border-sky-200">
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
                              className={`flex items-center justify-between gap-2 p-2 rounded-xl border-2 text-xs ${
                                !tradable
                                  ? 'bg-slate-100 border-slate-200 opacity-55 cursor-not-allowed'
                                  : checked
                                    ? 'bg-amber-50 border-[#F5B800] cursor-pointer'
                                    : 'bg-white border-sky-200 hover:border-sky-400 cursor-pointer'
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
                                  className="h-3.5 w-2 rounded-[2px] shrink-0"
                                  style={{
                                    backgroundColor: tile.groupColor || '#29B6F6',
                                  }}
                                />
                                <span className="font-extrabold text-slate-900 truncate">
                                  {tile.name}
                                </span>
                                {isMono && (
                                  <span className="text-[10px] font-extrabold text-[#D97706]">
                                    · Bộ màu
                                  </span>
                                )}
                              </div>
                              <span className="shrink-0 font-mono-num text-slate-700 font-bold">
                                {tradable
                                  ? formatBusinessTourCompact(tile.price || 0)
                                  : 'Đang có nhà'}
                              </span>
                            </label>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Feedback / Bot Response Banner */}
            {feedback && (
              <div
                data-testid="trade-feedback-banner"
                className={`p-3.5 rounded-2xl border-2 text-xs font-extrabold ${
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
              <div className="p-3.5 rounded-2xl bg-emerald-50 border-2 border-emerald-300 flex flex-wrap items-center justify-between gap-3">
                <span className="text-xs font-extrabold text-emerald-950">
                  Xác nhận từ {selectedPartner.name}: Bạn có đồng ý thực hiện thương vụ này?
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => onExecuteTrade(currentOffer)}
                    className="bt-btn-green px-4 py-1.5 rounded-xl text-xs font-black uppercase cursor-pointer whitespace-nowrap"
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
                    className="id-btn-crimson px-4 py-1.5 rounded-xl text-xs font-black uppercase cursor-pointer whitespace-nowrap"
                  >
                    Từ Chối
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="p-8 text-center text-sm font-bold text-slate-500">
            Không còn đối tác nào khả dụng để giao dịch.
          </div>
        )}

        {/* Footer Actions */}
        <div className="px-6 py-3 bg-sky-50 border-t border-sky-200 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onClose}
            className="bt-btn-white px-5 py-2 rounded-2xl text-sm font-extrabold cursor-pointer whitespace-nowrap"
          >
            Đóng
          </button>

          {!awaitingHumanPartnerConfirm && selectedPartner && (
            <button
              type="button"
              onClick={handlePropose}
              className="bt-btn-gold px-6 py-2 rounded-2xl text-sm font-black uppercase tracking-wide cursor-pointer whitespace-nowrap"
            >
              Gửi Đề Nghị Giao Dịch
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
