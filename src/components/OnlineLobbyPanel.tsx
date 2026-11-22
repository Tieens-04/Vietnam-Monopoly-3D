import React, { useEffect, useState } from 'react';
import { CHARACTER_PERSONAS } from '../game/avatarLogic';
import { TokenArchetype } from '../game/onlineTypes';
import { formatBusinessTourSpaced } from '../game/rules';
import type { useOnlineMultiplayer } from '../utils/onlineClient';
import { PlayerAvatar3D } from './PlayerAvatar3D';

const ALL_TOKENS: TokenArchetype[] = ['car', 'yacht', 'jet', 'crown'];

const TOKEN_SIGNATURE_HEX: Record<TokenArchetype, string> = {
  car: '#F5B800',
  yacht: '#66C61C',
  jet: '#E91E63',
  crown: '#29B6F6',
};

interface OnlineLobbyPanelProps {
  online: ReturnType<typeof useOnlineMultiplayer>;
}

export const OnlineLobbyPanel: React.FC<OnlineLobbyPanelProps> = ({ online }) => {
  const [nickname, setNickname] = useState<string>(
    () => online.savedPlayerName || 'Tỷ Phú Mới'
  );
  const [selectedToken, setSelectedToken] = useState<TokenArchetype>('car');
  const [maxPlayers, setMaxPlayers] = useState<2 | 3 | 4>(4);
  const [startingCash, setStartingCash] = useState<number>(2_000_000);
  const [fillBots, setFillBots] = useState<boolean>(true);
  const [joinCode, setJoinCode] = useState<string>(
    () => online.initialInviteCode || ''
  );
  const [copiedMode, setCopiedMode] = useState<'none' | 'link' | 'code'>('none');
  const [editingName, setEditingName] = useState<string>('');

  const room = online.roomSnapshot;
  const mySeat =
    room && online.yourSeatIndex !== null
      ? room.seats.find((s) => s.seatIndex === online.yourSeatIndex) || null
      : null;

  useEffect(() => {
    if (mySeat) {
      setEditingName(mySeat.playerName);
    }
  }, [mySeat?.playerName]);

  const handleCopy = async (kind: 'link' | 'code') => {
    if (!room) return;
    const text = kind === 'link' ? online.getInviteUrl() : room.roomCode;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedMode(kind);
      window.setTimeout(() => setCopiedMode('none'), 2200);
    } catch {
      // Fallback: select via prompt or ignore
    }
  };

  if (room && room.status === 'lobby') {
    const isHost = online.yourSeatIndex === room.hostSeatIndex;
    const humanCount = room.seats.filter((s) => s.occupiedByHuman).length;
    const canStart = isHost && (humanCount >= 2 || (room.fillBots && room.maxPlayers >= 2));

    return (
      <div className="p-4 sm:p-6 space-y-4">
        {/* Top Room Code + Invite Link Strip */}
        <div className="rounded-2xl bg-sky-50 border-2 border-sky-200 p-3.5 sm:p-4 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="px-3.5 py-2 rounded-xl bg-white border-2 border-sky-300 shadow-xs text-center">
              <div className="text-[10px] font-extrabold uppercase tracking-wider text-sky-700">
                Mã Phòng Online
              </div>
              <div
                data-testid="bt-online-room-code"
                className="font-mono-num text-xl sm:text-2xl font-black tracking-widest text-slate-900 leading-tight"
              >
                {room.roomCode}
              </div>
            </div>
            <div className="text-xs font-bold text-slate-700 space-y-0.5">
              <div>Gửi mã hoặc link mời để bạn bè tham gia chung bàn!</div>
              <div className="text-sky-700 font-extrabold">
                {online.connectionStatus === 'connected'
                  ? '🟢 Kết nối ổn định'
                  : '🟡 Đang đồng bộ lại kết nối...'}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0 flex-wrap justify-center">
            <button
              type="button"
              onClick={() => void handleCopy('link')}
              className="bt-btn-green px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wide cursor-pointer whitespace-nowrap"
            >
              {copiedMode === 'link' ? '✓ Đã Chép Link!' : '📋 Copy Link Mời'}
            </button>
            <button
              type="button"
              onClick={() => void handleCopy('code')}
              className="bt-btn-white px-3.5 py-2 rounded-xl text-xs font-extrabold uppercase tracking-wide cursor-pointer whitespace-nowrap"
            >
              {copiedMode === 'code' ? '✓ Đã Chép Mã' : 'Copy Mã'}
            </button>
          </div>
        </div>

        {online.errorMessage && (
          <div
            role="alert"
            className="px-3.5 py-2 rounded-xl bg-rose-50 border-2 border-rose-200 text-xs font-extrabold text-rose-700 flex items-center justify-between gap-2"
          >
            <span>{online.errorMessage}</span>
            <button
              type="button"
              onClick={online.clearError}
              className="text-rose-800 hover:text-rose-950 font-black cursor-pointer"
            >
              ✕
            </button>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch">
          {/* Left: Room Rules & Profile Customization */}
          <div className="lg:col-span-5 rounded-2xl bg-sky-50/90 border-2 border-sky-200 p-4 space-y-3.5 flex flex-col justify-between">
            <div className="space-y-3">
              <div className="pb-2 border-b border-sky-200 flex items-center justify-between">
                <h2 className="font-display text-sm font-black uppercase tracking-wide text-sky-900">
                  Cấu Hình Phòng
                </h2>
                <span className="text-[11px] font-extrabold text-[#0284C7]">
                  {isHost ? '👑 Bạn là Chủ phòng' : 'Khách mời'}
                </span>
              </div>

              <div>
                <span className="block text-xs font-extrabold text-slate-600 mb-1.5">
                  Số người chơi tối đa
                </span>
                <div className="grid grid-cols-3 gap-1.5 p-1 rounded-2xl bg-sky-100 border border-sky-200">
                  {([2, 3, 4] as const).map((num) => (
                    <button
                      key={num}
                      type="button"
                      disabled={!isHost || num < humanCount}
                      onClick={() => online.updateLobbySettings({ maxPlayers: num })}
                      className={`py-1.5 px-2 rounded-xl text-xs font-black uppercase transition-all whitespace-nowrap ${
                        room.maxPlayers === num
                          ? 'bt-btn-cyan'
                          : 'text-sky-900 hover:bg-white/60 disabled:opacity-40'
                      } ${isHost && num >= humanCount ? 'cursor-pointer' : 'cursor-not-allowed'}`}
                    >
                      {num} Người
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <span className="block text-xs font-extrabold text-slate-600 mb-1.5">
                  Ngân sách khởi điểm
                </span>
                <div className="grid grid-cols-2 gap-1.5 p-1 rounded-2xl bg-sky-100 border border-sky-200">
                  {[2_000_000, 3_000_000].map((cash) => (
                    <button
                      key={cash}
                      type="button"
                      disabled={!isHost}
                      onClick={() => online.updateLobbySettings({ startingCash: cash })}
                      className={`py-1.5 px-2 rounded-xl text-xs font-black font-mono-num transition-all whitespace-nowrap ${
                        room.startingCash === cash
                          ? 'bt-btn-gold'
                          : 'text-sky-900 hover:bg-white/60 disabled:opacity-50'
                      } ${isHost ? 'cursor-pointer' : 'cursor-not-allowed'}`}
                    >
                      {formatBusinessTourSpaced(cash)}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-white border border-sky-200">
                <div>
                  <div className="text-xs font-extrabold text-slate-800">
                    Bù Bot AI vào ghế trống
                  </div>
                  <div className="text-[11px] font-semibold text-slate-500">
                    Tự điền Bot cho đủ {room.maxPlayers} người khi bắt đầu
                  </div>
                </div>
                <button
                  type="button"
                  disabled={!isHost}
                  onClick={() => online.updateLobbySettings({ fillBots: !room.fillBots })}
                  className={`px-3 py-1 rounded-full text-xs font-black uppercase transition-colors ${
                    room.fillBots
                      ? 'bg-[#66C61C] text-white'
                      : 'bg-slate-200 text-slate-700'
                  } ${isHost ? 'cursor-pointer' : 'opacity-65 cursor-not-allowed'}`}
                >
                  {room.fillBots ? 'Đang Bật' : 'Đang Tắt'}
                </button>
              </div>
            </div>

            {/* Personal Profile Quick Switcher */}
            {mySeat && (
              <div className="pt-3 border-t border-sky-200 space-y-2">
                <div className="text-xs font-extrabold text-sky-900">Hồ sơ của bạn trong phòng</div>
                <div className="flex gap-1.5">
                  <input
                    type="text"
                    maxLength={22}
                    value={editingName}
                    onChange={(e) => setEditingName(e.target.value)}
                    placeholder="Tên hiển thị"
                    className="flex-1 px-2.5 py-1.5 text-xs font-extrabold text-slate-900 bg-white border border-sky-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#29B6F6]"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (editingName.trim()) {
                        online.updateMyProfile({ playerName: editingName.trim() });
                      }
                    }}
                    className="bt-btn-cyan px-3 py-1.5 rounded-xl text-xs font-black cursor-pointer whitespace-nowrap"
                  >
                    Lưu Tên
                  </button>
                </div>
                <div className="grid grid-cols-4 gap-2 pt-1">
                  {ALL_TOKENS.map((tok) => {
                    const isMine = mySeat.tokenType === tok;
                    const takenByOther = room.seats.some(
                      (s) => s.occupiedByHuman && s.seatIndex !== mySeat.seatIndex && s.tokenType === tok
                    );
                    const meta = CHARACTER_PERSONAS[tok];
                    return (
                      <button
                        key={tok}
                        type="button"
                        disabled={takenByOther}
                        onClick={() => online.updateMyProfile({ tokenType: tok })}
                        title={takenByOther ? `${meta.personaName} (Đã có người chọn)` : meta.personaName}
                        className={`h-9 rounded-xl flex items-center justify-center border-2 transition-transform ${
                          isMine
                            ? 'border-slate-900 scale-105 shadow-md cursor-pointer'
                            : takenByOther
                              ? 'border-slate-300 opacity-35 cursor-not-allowed'
                              : 'border-white opacity-85 hover:opacity-100 cursor-pointer'
                        }`}
                        style={{ backgroundColor: TOKEN_SIGNATURE_HEX[tok] }}
                      >
                        <span className="h-3 w-3 rounded-full bg-white/95" />
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Right: Live Lobby Seat Roster */}
          <div className="lg:col-span-7 rounded-2xl bg-sky-50/90 border-2 border-sky-200 p-4 flex flex-col justify-between space-y-3">
            <div className="pb-2 border-b border-sky-200 flex items-center justify-between text-xs">
              <h2 className="font-display text-sm font-black uppercase tracking-wide text-sky-900">
                Danh Sách Ghế Ngồi ({humanCount}/{room.maxPlayers} Người)
              </h2>
              <span className="text-sky-700 font-extrabold">Trạng thái</span>
            </div>

            <div className="space-y-2.5 flex-1 flex flex-col justify-center">
              {room.seats.map((seat) => {
                const persona = CHARACTER_PERSONAS[seat.tokenType];
                const isYou = seat.seatIndex === online.yourSeatIndex;
                return (
                  <div
                    key={seat.seatIndex}
                    className={`flex items-center gap-3 p-2.5 rounded-2xl border-2 shadow-xs ${
                      isYou
                        ? 'bg-amber-50/75 border-amber-300'
                        : 'bg-white border-sky-100'
                    }`}
                  >
                    <span
                      className="w-1.5 self-stretch rounded-full shrink-0"
                      style={{ backgroundColor: seat.color }}
                    />

                    <PlayerAvatar3D
                      archetype={seat.tokenType}
                      mood={seat.isHost ? 'celebrating' : seat.occupiedByHuman ? 'active' : 'idle'}
                      phaseSeed={seat.seatIndex}
                      isBot={!seat.occupiedByHuman && room.fillBots}
                      showBotStamp={!seat.occupiedByHuman && room.fillBots}
                      size="sm"
                      className="!rounded-xl !border-2 !border-white"
                      ariaLabel={persona.personaName}
                    />

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-display text-sm font-black text-slate-900 truncate">
                          {seat.playerName}
                        </span>
                        {seat.isHost && (
                          <span className="px-2 py-0.5 rounded-full bg-amber-100 border border-amber-300 text-[10px] font-black text-amber-800">
                            👑 Chủ phòng
                          </span>
                        )}
                        {isYou && (
                          <span className="px-2 py-0.5 rounded-full bg-emerald-100 border border-emerald-300 text-[10px] font-black text-emerald-800">
                            Bạn
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] font-semibold text-slate-500">
                        {persona.personaName} · {seat.colorName}
                      </div>
                    </div>

                    <div className="shrink-0 text-right">
                      {seat.occupiedByHuman ? (
                        <span
                          className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase ${
                            seat.connected
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-rose-100 text-rose-700'
                          }`}
                        >
                          {seat.connected ? 'Sẵn sàng' : 'Mất mạng'}
                        </span>
                      ) : room.fillBots ? (
                        <span className="px-2.5 py-1 rounded-full bg-sky-100 text-sky-800 text-[10px] font-black uppercase">
                          Bot AI Bù
                        </span>
                      ) : (
                        <span className="px-2.5 py-1 rounded-full bg-slate-100 text-slate-500 text-[10px] font-black uppercase">
                          Ghế Trống
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="pt-2 flex flex-wrap items-center justify-between gap-2.5">
              <button
                type="button"
                onClick={online.leaveRoom}
                className="id-btn-crimson px-4 py-2.5 rounded-2xl text-xs font-black uppercase tracking-wide cursor-pointer whitespace-nowrap"
              >
                Rời Phòng
              </button>

              {isHost ? (
                <button
                  type="button"
                  data-testid="bt-online-start-btn"
                  disabled={!canStart}
                  onClick={online.startMatch}
                  className="bt-btn-green flex-1 sm:flex-initial sm:min-w-[240px] py-3 px-6 rounded-full font-black text-sm sm:text-base uppercase tracking-wider disabled:opacity-45 cursor-pointer whitespace-nowrap"
                >
                  🎲 Bắt Đầu Ván Online!
                </button>
              ) : (
                <div className="px-4 py-2.5 rounded-full bg-sky-100 border border-sky-200 text-xs font-extrabold text-sky-900">
                  ⏳ Đang chờ Chủ phòng bắt đầu ván đấu...
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Not yet in a room: Create or Join view
  const leadPersona = CHARACTER_PERSONAS[selectedToken];

  return (
    <div className="p-4 sm:p-6 space-y-4">
      {online.errorMessage && (
        <div
          role="alert"
          className="px-3.5 py-2.5 rounded-xl bg-rose-50 border-2 border-rose-200 text-xs font-extrabold text-rose-700 flex items-center justify-between gap-2"
        >
          <span>{online.errorMessage}</span>
          <button
            type="button"
            onClick={online.clearError}
            className="text-rose-800 hover:text-rose-950 font-black cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {online.connectionStatus === 'reconnecting' && (
        <div className="px-3.5 py-2 rounded-xl bg-amber-50 border border-amber-300 text-xs font-extrabold text-amber-800 text-center">
          🟡 Đang thử kết nối lại phòng cũ...
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
        {/* Identity Column */}
        <div
          className="lg:col-span-4 rounded-2xl border-2 border-sky-200 p-4 flex flex-col items-center justify-between text-center space-y-3"
          style={{
            background:
              'radial-gradient(circle at 50% 28%, #FFFFFF 0%, #E0F2FE 68%, #BAE6FD 100%)',
          }}
        >
          <div className="w-full pb-2 border-b border-sky-200/80">
            <h2 className="font-display text-sm font-black uppercase tracking-wide text-sky-900">
              Hồ Sơ Tỷ Phú Online
            </h2>
          </div>

          <div className="animate-float-gentle">
            <PlayerAvatar3D
              archetype={selectedToken}
              mood="celebrating"
              phaseSeed={0}
              isActive
              size="lg"
              className="!border-4 !border-white shadow-xl"
              ariaLabel={`Chân dung ${leadPersona.personaName}`}
            />
          </div>

          <div className="w-full space-y-2">
            <div className="font-display text-sm font-black text-slate-900">
              {leadPersona.personaName}
            </div>
            <label htmlFor="online-nickname-input" className="sr-only">
              Tên hiển thị của bạn
            </label>
            <input
              id="online-nickname-input"
              type="text"
              maxLength={22}
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              placeholder="Nhập tên của bạn..."
              className="w-full px-3 py-2 text-xs font-extrabold text-slate-900 bg-white border-2 border-sky-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#29B6F6] text-center"
            />
            <div className="grid grid-cols-4 gap-2 pt-1">
              {ALL_TOKENS.map((tok) => {
                const selected = selectedToken === tok;
                const meta = CHARACTER_PERSONAS[tok];
                return (
                  <button
                    key={tok}
                    type="button"
                    onClick={() => setSelectedToken(tok)}
                    title={meta.personaName}
                    aria-label={`Chọn nhân vật ${meta.personaName}`}
                    className={`h-9 rounded-xl flex items-center justify-center border-2 transition-transform cursor-pointer ${
                      selected
                        ? 'border-slate-900 scale-108 shadow-md'
                        : 'border-white opacity-85 hover:opacity-100'
                    }`}
                    style={{ backgroundColor: TOKEN_SIGNATURE_HEX[tok] }}
                  >
                    <span className="h-3 w-3 rounded-full bg-white/95" />
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Create Room Card */}
        <div className="lg:col-span-4 rounded-2xl bg-sky-50/90 border-2 border-sky-200 p-4 flex flex-col justify-between space-y-3.5">
          <div className="space-y-3">
            <div className="pb-2 border-b border-sky-200">
              <h2 className="font-display text-sm font-black uppercase tracking-wide text-sky-900">
                1. Tạo Phòng Mới
              </h2>
            </div>

            <div>
              <span className="block text-xs font-extrabold text-slate-600 mb-1.5">
                Số người chơi
              </span>
              <div className="grid grid-cols-3 gap-1.5 p-1 rounded-2xl bg-sky-100 border border-sky-200">
                {([2, 3, 4] as const).map((num) => (
                  <button
                    key={num}
                    type="button"
                    onClick={() => setMaxPlayers(num)}
                    className={`py-1.5 px-2 rounded-xl text-xs font-black uppercase transition-all cursor-pointer whitespace-nowrap ${
                      maxPlayers === num ? 'bt-btn-cyan' : 'text-sky-900 hover:bg-white/60'
                    }`}
                  >
                    {num} Người
                  </button>
                ))}
              </div>
            </div>

            <div>
              <span className="block text-xs font-extrabold text-slate-600 mb-1.5">
                Ngân sách khởi điểm
              </span>
              <div className="grid grid-cols-2 gap-1.5 p-1 rounded-2xl bg-sky-100 border border-sky-200">
                {[2_000_000, 3_000_000].map((cash) => (
                  <button
                    key={cash}
                    type="button"
                    onClick={() => setStartingCash(cash)}
                    className={`py-1.5 px-2 rounded-xl text-xs font-black font-mono-num transition-all cursor-pointer whitespace-nowrap ${
                      startingCash === cash ? 'bt-btn-gold' : 'text-sky-900 hover:bg-white/60'
                    }`}
                  >
                    {formatBusinessTourSpaced(cash)}
                  </button>
                ))}
              </div>
            </div>

            <button
              type="button"
              onClick={() => setFillBots((v) => !v)}
              className="w-full px-3 py-2 rounded-xl bg-white border border-sky-200 flex items-center justify-between text-xs font-extrabold text-slate-800 cursor-pointer"
            >
              <span>Bù Bot AI nếu thiếu người</span>
              <span
                className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase ${
                  fillBots ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'
                }`}
              >
                {fillBots ? 'Bật' : 'Tắt'}
              </span>
            </button>
          </div>

          <button
            type="button"
            data-testid="bt-create-room-btn"
            onClick={() =>
              online.createRoom({
                playerName: nickname.trim() || 'Chủ phòng',
                tokenType: selectedToken,
                maxPlayers,
                startingCash,
                fillBots,
              })
            }
            className="bt-btn-green w-full py-3 rounded-full font-black text-sm uppercase tracking-wide cursor-pointer whitespace-nowrap"
          >
            ✨ Tạo Phòng & Lấy Mã
          </button>
        </div>

        {/* Join Room Card */}
        <div className="lg:col-span-4 rounded-2xl bg-sky-50/90 border-2 border-sky-200 p-4 flex flex-col justify-between space-y-3.5">
          <div className="space-y-3">
            <div className="pb-2 border-b border-sky-200">
              <h2 className="font-display text-sm font-black uppercase tracking-wide text-sky-900">
                2. Vào Phòng Bằng Mã
              </h2>
            </div>

            <p className="text-xs font-semibold text-slate-600 leading-relaxed">
              Nhập mã phòng 6 ký tự từ bạn bè (hoặc mở trực tiếp link mời có dạng{' '}
              <span className="font-mono-num font-bold text-sky-800">?room=...</span>).
            </p>

            <div>
              <label htmlFor="online-room-code-input" className="block text-xs font-extrabold text-slate-600 mb-1.5">
                Mã phòng
              </label>
              <input
                id="online-room-code-input"
                type="text"
                maxLength={8}
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                placeholder="VD: VN2026"
                className="w-full px-3 py-2.5 text-center font-mono-num text-lg font-black uppercase tracking-widest text-slate-900 bg-white border-2 border-sky-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#29B6F6]"
              />
            </div>
          </div>

          <button
            type="button"
            data-testid="bt-join-room-btn"
            disabled={joinCode.trim().length < 4}
            onClick={() =>
              online.joinRoom({
                roomCode: joinCode,
                playerName: nickname.trim() || 'Khách mời',
                tokenType: selectedToken,
              })
            }
            className="bt-btn-cyan w-full py-3 rounded-full font-black text-sm uppercase tracking-wide disabled:opacity-45 cursor-pointer whitespace-nowrap"
          >
            🚀 Vào Phòng Ngay
          </button>
        </div>
      </div>
    </div>
  );
};
