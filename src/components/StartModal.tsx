import React, { useState } from 'react';
import { PlayerSetupConfig } from '../game/types';

interface StartModalProps {
  initialConfigs: PlayerSetupConfig[];
  initialStartingCash: number;
  onStartGame: (configs: PlayerSetupConfig[], startingCash: number) => void;
}

function TokenBadgeIcon({ type }: { type: PlayerSetupConfig['tokenType'] }) {
  if (type === 'car') {
    return (
      <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current" aria-hidden="true">
        <path d="M5 11l1.5-4.5A2 2 0 0 1 8.4 5h7.2a2 2 0 0 1 1.9 1.5L19 11h1a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1h-1v1a1 1 0 0 1-2 0v-1H7v1a1 1 0 0 1-2 0v-1H4a1 1 0 0 1-1-1v-4a1 1 0 0 1 1-1h1zm2.2-4l-1 3h11.6l-1-3H7.2zM6.5 15a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zm11 0a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z" />
      </svg>
    );
  }
  if (type === 'yacht') {
    return (
      <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current" aria-hidden="true">
        <path d="M12 3l6 9H6l6-9zm-9 11h18l-2.4 4.2A2 2 0 0 1 16.9 19H7.1a2 2 0 0 1-1.7-.8L3 14z" />
      </svg>
    );
  }
  if (type === 'jet') {
    return (
      <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current" aria-hidden="true">
        <path d="M21 16v-2l-8-5V3.5a1.5 1.5 0 0 0-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current" aria-hidden="true">
      <path d="M3 7l4.5 4L12 5l4.5 6L21 7l-2 11H5L3 7zm2 13h14v2H5v-2z" />
    </svg>
  );
}

export const StartModal: React.FC<StartModalProps> = ({
  initialConfigs,
  initialStartingCash,
  onStartGame,
}) => {
  const [playerCount, setPlayerCount] = useState<number>(
    initialConfigs.filter((c) => c.enabled).length || 4
  );
  const [configs, setConfigs] = useState<PlayerSetupConfig[]>(initialConfigs);
  const [startingCash, setStartingCash] = useState<number>(initialStartingCash);
  const [validationError, setValidationError] = useState<string | null>(null);

  const handleCountChange = (count: number) => {
    setPlayerCount(count);
    setConfigs((prev) =>
      prev.map((c, idx) => ({
        ...c,
        enabled: idx < count,
      }))
    );
    setValidationError(null);
  };

  const updatePlayer = (idx: number, patch: Partial<PlayerSetupConfig>) => {
    setConfigs((prev) => prev.map((c, i) => (i === idx ? { ...c, ...patch } : c)));
    setValidationError(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const active = configs.slice(0, playerCount);
    const hasEmptyName = active.some((p) => p.name.trim().length === 0);
    if (hasEmptyName) {
      setValidationError('Vui lòng nhập tên đầy đủ cho tất cả người chơi tham gia.');
      return;
    }
    const finalConfigs = configs.map((c, idx) => ({
      ...c,
      enabled: idx < playerCount,
      name: c.name.trim(),
    }));
    onStartGame(finalConfigs, startingCash);
  };

  return (
    <div className="fixed inset-0 z-30 flex flex-col items-center justify-between p-4 sm:p-6 pointer-events-auto bg-slate-950/30">
      <div className="w-full max-w-xl my-auto hud-card-light rounded-3xl overflow-hidden animate-pop-in">
        {/* Festive MONOPOLY GO! Crimson & Brushed-Gold Header Banner */}
        <div
          className="px-6 py-5 flex items-center gap-4 border-b-4 border-amber-400"
          style={{
            background: 'linear-gradient(180deg, #ef4444 0%, #dc2626 55%, #b91c1c 100%)',
          }}
        >
          <svg
            viewBox="0 0 64 64"
            className="h-14 w-14 shrink-0 drop-shadow-sm"
            role="img"
            aria-label="Biểu tượng Cờ Tỷ Phú Việt Nam 3D"
          >
            <rect x="3" y="3" width="58" height="58" rx="15" fill="#FFFBEB" />
            <rect
              x="7"
              y="7"
              width="50"
              height="50"
              rx="11"
              fill="#DC2626"
              stroke="#F59E0B"
              strokeWidth="3"
            />
            <polygon
              points="32,14 36.9,24.2 48,25.8 39.9,33.7 41.9,44.8 32,39.5 22.1,44.8 24.1,33.7 16,25.8 27.1,24.2"
              fill="#FDE047"
            />
            <circle cx="32" cy="31" r="4" fill="#991B1B" />
          </svg>
          <div>
            <h1
              className="font-display text-2xl sm:text-3xl font-extrabold tracking-tight text-white drop-shadow-xs"
              style={{ textWrap: 'balance' }}
            >
              Cờ Tỷ Phú Việt Nam 3D
            </h1>
            <p className="text-xs sm:text-sm font-semibold text-amber-100 mt-0.5">
              28 địa danh Việt Nam · Đô thị 3D sống động · Bot AI thông minh
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="p-6 sm:p-7 space-y-5">
          {/* Top Controls: Player Count & Starting Capital */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <span className="block text-xs font-semibold text-slate-600 mb-2">
                Số lượng người tham gia
              </span>
              <div className="grid grid-cols-3 gap-1.5 p-1 bg-slate-100 rounded-xl">
                {[2, 3, 4].map((num) => (
                  <button
                    key={num}
                    type="button"
                    onClick={() => handleCountChange(num)}
                    className={`py-2 px-3 rounded-lg text-sm font-semibold transition-colors whitespace-nowrap ${
                      playerCount === num
                        ? 'bg-slate-900 text-white shadow-sm'
                        : 'text-slate-700 hover:bg-slate-200/70'
                    }`}
                  >
                    {num} Người
                  </button>
                ))}
              </div>
            </div>

            <div>
              <span className="block text-xs font-semibold text-slate-600 mb-2">
                Vốn khởi đầu mỗi người
              </span>
              <div className="grid grid-cols-2 gap-1.5 p-1 bg-slate-100 rounded-xl">
                {[1500, 2500].map((cash) => (
                  <button
                    key={cash}
                    type="button"
                    onClick={() => setStartingCash(cash)}
                    className={`py-2 px-3 rounded-lg text-sm font-semibold tabular-nums transition-colors whitespace-nowrap ${
                      startingCash === cash
                        ? 'bg-emerald-600 text-white shadow-sm'
                        : 'text-slate-700 hover:bg-slate-200/70'
                    }`}
                  >
                    ${cash.toLocaleString('en-US')}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Player Slots Configuration */}
          <div className="space-y-2.5">
            <span className="block text-xs font-semibold text-slate-600">
              Thiết lập danh sách người chơi & quân cờ 3D
            </span>
            <div className="space-y-2">
              {configs.slice(0, playerCount).map((player, idx) => (
                <div
                  key={player.id}
                  className="flex items-center gap-3 p-2.5 rounded-xl bg-slate-50 border border-slate-200/90"
                >
                  {/* Color & Token Avatar */}
                  <div
                    className="h-9 w-9 rounded-lg flex items-center justify-center text-white shrink-0 shadow-sm"
                    style={{ backgroundColor: player.color }}
                    title={`Quân cờ màu ${player.colorName}`}
                  >
                    <TokenBadgeIcon type={player.tokenType} />
                  </div>

                  {/* Player Name Input */}
                  <div className="flex-1 min-w-0">
                    <label htmlFor={`player-name-${idx}`} className="sr-only">
                      Tên người chơi vị trí {idx + 1}
                    </label>
                    <input
                      id={`player-name-${idx}`}
                      type="text"
                      maxLength={22}
                      value={player.name}
                      onChange={(e) => updatePlayer(idx, { name: e.target.value })}
                      placeholder={`Nhập tên vị trí ${idx + 1}`}
                      className="w-full px-3 py-1.5 text-sm font-semibold text-slate-900 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-900"
                    />
                  </div>

                  {/* Human vs Bot AI Segmented Toggle */}
                  <div className="flex items-center p-0.5 bg-slate-200/80 rounded-lg shrink-0">
                    <button
                      type="button"
                      onClick={() =>
                        updatePlayer(idx, {
                          isBot: false,
                          name: player.isBot ? `Người chơi ${idx + 1}` : player.name,
                        })
                      }
                      className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
                        !player.isBot
                          ? 'bg-white text-slate-900 shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Người chơi
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        updatePlayer(idx, {
                          isBot: true,
                          name: !player.isBot ? `Bot AI ${player.colorName}` : player.name,
                        })
                      }
                      className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
                        player.isBot
                          ? 'bg-slate-900 text-white shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Máy (Bot AI)
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {validationError && (
            <p role="alert" className="text-xs font-semibold text-red-600">
              {validationError}
            </p>
          )}

          {/* Primary Start Action */}
          <div className="pt-1">
            <button
              type="submit"
              data-start="true"
              className="btn-3d-crimson w-full py-3.5 px-6 rounded-2xl text-white font-extrabold text-lg cursor-pointer whitespace-nowrap"
            >
              Bắt Đầu Ván Đấu
            </button>
          </div>
        </form>
      </div>

      {/* Single flat inline control hint at bottom safe margin */}
      <p className="text-xs font-semibold text-white hud-panel px-4 py-1.5 rounded-lg">
        Kéo chuột Xoay góc nhìn 3D · Cuộn chuột Thu phóng · Click ô đất Xem bảng giá thuê · Phím Space Đổ xúc xắc
      </p>
    </div>
  );
};
