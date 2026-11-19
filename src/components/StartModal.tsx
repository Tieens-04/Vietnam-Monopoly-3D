import React, { useState } from 'react';
import { CHARACTER_PERSONAS } from '../game/avatarLogic';
import {
  formatBusinessTourCompact,
  formatBusinessTourSpaced,
  START_SALARY,
  WORLD_TOUR_FEE,
} from '../game/rules';
import { PlayerSetupConfig } from '../game/types';
import { PlayerAvatar3D } from './PlayerAvatar3D';

interface StartModalProps {
  initialConfigs: PlayerSetupConfig[];
  initialStartingCash: number;
  onStartGame: (configs: PlayerSetupConfig[], startingCash: number) => void;
  onOpenRulebook: () => void;
}

const ALL_TOKENS: Array<PlayerSetupConfig['tokenType']> = ['car', 'yacht', 'jet', 'crown'];

const TOKEN_SIGNATURE_HEX: Record<PlayerSetupConfig['tokenType'], string> = {
  car: '#F5B800',
  yacht: '#66C61C',
  jet: '#E91E63',
  crown: '#29B6F6',
};

/**
 * Playful Casual 3D Business Tour Globe & Hot-Pink Dice Emblem
 */
const BusinessTourCrestSvg: React.FC = () => (
  <svg
    viewBox="0 0 68 68"
    className="h-13 w-13 sm:h-15 sm:w-15 shrink-0 drop-shadow-[0_4px_8px_rgba(3,52,86,0.35)]"
    role="img"
    aria-label="Biểu tượng Cờ Tỷ Phú Việt Nam 3D"
  >
    {/* Bright Golden Starburst Badge */}
    <circle cx="34" cy="34" r="30" fill="#FFD426" stroke="#FFFFFF" strokeWidth="3.5" />
    <circle cx="34" cy="34" r="24" fill="#29B6F6" />
    {/* Lime Green Continents */}
    <path
      d="M18 26 Q28 18 36 24 Q42 30 34 38 Q22 36 18 26 Z"
      fill="#84E635"
    />
    <path
      d="M38 36 Q48 32 52 42 Q45 52 36 46 Z"
      fill="#84E635"
    />
    {/* Glossy Hot-Pink 3D Die Floating Front-Center */}
    <g transform="translate(34,35) rotate(-10)">
      <rect
        x="-14"
        y="-14"
        width="28"
        height="28"
        rx="6.5"
        fill="#E91E63"
        stroke="#FFFFFF"
        strokeWidth="2.5"
      />
      <circle cx="-6.5" cy="-6.5" r="2.5" fill="#FFFFFF" />
      <circle cx="0" cy="0" r="2.7" fill="#FFFFFF" />
      <circle cx="6.5" cy="6.5" r="2.5" fill="#FFFFFF" />
      <circle cx="6.5" cy="-6.5" r="2.5" fill="#FFFFFF" />
      <circle cx="-6.5" cy="6.5" r="2.5" fill="#FFFFFF" />
    </g>
  </svg>
);

export const StartModal: React.FC<StartModalProps> = ({
  initialConfigs,
  initialStartingCash,
  onStartGame,
  onOpenRulebook,
}) => {
  const [playerCount, setPlayerCount] = useState<number>(
    initialConfigs.filter((c) => c.enabled).length || 4
  );
  const [configs, setConfigs] = useState<PlayerSetupConfig[]>(initialConfigs);
  const [startingCash, setStartingCash] = useState<number>(initialStartingCash);
  const [validationError, setValidationError] = useState<string | null>(null);

  const leadPlayer = configs[0];
  const leadPersona = CHARACTER_PERSONAS[leadPlayer.tokenType];

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

  const handleSelectLeadToken = (nextToken: PlayerSetupConfig['tokenType']) => {
    setConfigs((prev) => {
      const lead = prev[0];
      const currentLeadToken = lead.tokenType;
      if (currentLeadToken === nextToken) return prev;
      const swapIdx = prev.findIndex((p, idx) => idx > 0 && p.tokenType === nextToken);
      const swappedSlot = swapIdx >= 0 ? prev[swapIdx] : null;

      return prev.map((p, idx) => {
        if (idx === 0) {
          return {
            ...p,
            tokenType: nextToken,
            color: swappedSlot ? swappedSlot.color : TOKEN_SIGNATURE_HEX[nextToken],
          };
        }
        if (idx === swapIdx) {
          const prevBotDefault = CHARACTER_PERSONAS[p.tokenType].botDefaultName;
          const nextBotDefault = CHARACTER_PERSONAS[currentLeadToken].botDefaultName;
          return {
            ...p,
            tokenType: currentLeadToken,
            color: lead.color,
            name: p.isBot && p.name === prevBotDefault ? nextBotDefault : p.name,
          };
        }
        return p;
      });
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const active = configs.slice(0, playerCount);
    const hasEmptyName = active.some((p) => p.name.trim().length === 0);
    if (hasEmptyName) {
      setValidationError('Vui lòng nhập tên cho tất cả người chơi tham gia!');
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
    <div
      className="fixed inset-0 z-30 flex flex-col items-center justify-between p-3 sm:p-5 pointer-events-auto overflow-y-auto"
      style={{
        background:
          'radial-gradient(circle at 50% 18%, rgba(125, 211, 252, 0.55) 0%, rgba(186, 230, 253, 0.42) 48%, rgba(251, 207, 232, 0.52) 100%)',
      }}
    >
      <div
        data-testid="bt-casual-lobby"
        className="w-full max-w-5xl my-auto bt-casual-modal rounded-[28px] overflow-hidden animate-pop-in"
      >
        {/* Playful Glossy Sky-Cyan Game Lobby Banner */}
        <div className="bt-header-sky px-5 sm:px-7 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3.5 min-w-0">
            <BusinessTourCrestSvg />
            <div className="min-w-0">
              <h1
                className="font-display text-xl sm:text-2xl md:text-[28px] font-black uppercase tracking-wide text-white leading-tight"
                style={{
                  textWrap: 'balance',
                  textShadow: '0 2px 0 rgba(3, 82, 130, 0.75)',
                }}
              >
                Cờ Tỷ Phú Việt Nam 3D
              </h1>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs font-bold text-sky-100 mt-0.5">
                <span>Sảnh Đấu Business Tour</span>
                <span aria-hidden="true">·</span>
                <span>28 Điểm Đến Việt Nam</span>
                <span aria-hidden="true">·</span>
                <span>Đấu Trí AI 3D</span>
              </div>
            </div>
          </div>

          <div className="shrink-0">
            <button
              type="button"
              onClick={onOpenRulebook}
              className="bt-btn-white px-4 py-2 rounded-full text-xs font-black uppercase tracking-wide cursor-pointer whitespace-nowrap"
            >
              Luật Chơi
            </button>
          </div>
        </div>

        {/* 3-Column Casual Game Setup Body */}
        <form onSubmit={handleSubmit} className="p-4 sm:p-6 space-y-5">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
            {/* LEFT COLUMN: Casual Match Rules & Starting Pot */}
            <div className="lg:col-span-4 rounded-2xl bg-sky-50/90 border-2 border-sky-200 flex flex-col justify-between p-4 space-y-4">
              <div className="space-y-3.5">
                <div className="pb-2 border-b border-sky-200 flex items-center justify-between">
                  <h2 className="font-display text-sm font-black uppercase tracking-wide text-sky-900">
                    Thiết Lập Bàn Đấu
                  </h2>
                  <span className="text-xs font-extrabold text-[#16A34A]">
                    Luật Business Tour
                  </span>
                </div>

                <div>
                  <span className="block text-xs font-extrabold text-slate-600 mb-1.5">
                    Số người chơi
                  </span>
                  <div className="grid grid-cols-3 gap-1.5 p-1 rounded-2xl bg-sky-100 border border-sky-200">
                    {[2, 3, 4].map((num) => (
                      <button
                        key={num}
                        type="button"
                        onClick={() => handleCountChange(num)}
                        className={`py-2 px-2 rounded-xl text-xs font-black uppercase transition-all cursor-pointer whitespace-nowrap ${
                          playerCount === num
                            ? 'bt-btn-cyan'
                            : 'text-sky-900 hover:bg-white/60'
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
                    {[1500, 2500].map((cash) => (
                      <button
                        key={cash}
                        type="button"
                        onClick={() => setStartingCash(cash)}
                        className={`py-2 px-2 rounded-xl text-xs font-black font-mono-num transition-all cursor-pointer whitespace-nowrap ${
                          startingCash === cash
                            ? 'bt-btn-gold'
                            : 'text-sky-900 hover:bg-white/60'
                        }`}
                      >
                        {formatBusinessTourSpaced(cash)}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="pt-3 border-t border-sky-200 space-y-1.5 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-slate-600 font-semibold">Xây công trình</span>
                  <span className="font-extrabold text-slate-900 text-right">
                    Xây ngay · Khiên Khách sạn ★
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-slate-600 font-semibold">Đặc quyền</span>
                  <span className="font-extrabold text-[#16A34A] text-right">
                    Mua lại 2× · Vé Bay {formatBusinessTourCompact(WORLD_TOUR_FEE)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-600 font-semibold">Thưởng qua Bắt Đầu</span>
                  <span className="font-black text-[#16A34A] font-mono-num">
                    +{formatBusinessTourSpaced(START_SALARY)}
                  </span>
                </div>
              </div>
            </div>

            {/* CENTER COLUMN: Vibrant Animated 3D Character Podium */}
            <div
              className="lg:col-span-3 rounded-2xl border-2 border-sky-200 p-4 flex flex-col items-center justify-between text-center"
              style={{
                background:
                  'radial-gradient(circle at 50% 32%, #FFFFFF 0%, #E0F2FE 65%, #BAE6FD 100%)',
              }}
            >
              <div className="w-full pb-2 border-b border-sky-200/80 text-center">
                <h2 className="font-display text-sm font-black uppercase tracking-wide text-sky-900">
                  Nhân Vật 3D Của Bạn
                </h2>
              </div>

              <div className="my-2 animate-float-gentle">
                <PlayerAvatar3D
                  archetype={leadPlayer.tokenType}
                  mood="celebrating"
                  phaseSeed={0}
                  isActive
                  size="xl"
                  className="!border-4 !border-white shadow-xl"
                  ariaLabel={`Chân dung 3D ${leadPersona.personaName}`}
                />
              </div>

              <div>
                <div className="font-display text-base font-black text-slate-900 leading-snug">
                  {leadPersona.personaName}
                </div>
                <div className="text-xs font-bold text-sky-800 mt-0.5">
                  {leadPersona.roleTitle}
                </div>
              </div>

              {/* 4 Signature Color Character Buttons */}
              <div
                className="mt-3 grid grid-cols-4 gap-2 w-full pt-3 border-t border-sky-200/80"
                role="group"
                aria-label="Chọn nhân vật tỷ phú 3D"
              >
                {ALL_TOKENS.map((tok) => {
                  const selected = leadPlayer.tokenType === tok;
                  const meta = CHARACTER_PERSONAS[tok];
                  const swatchHex = TOKEN_SIGNATURE_HEX[tok];
                  return (
                    <button
                      key={tok}
                      type="button"
                      onClick={() => handleSelectLeadToken(tok)}
                      title={`${meta.personaName}`}
                      aria-label={`Chọn nhân vật ${meta.personaName}`}
                      className={`h-10 rounded-xl flex items-center justify-center border-2 transition-transform cursor-pointer ${
                        selected
                          ? 'border-slate-900 scale-108 shadow-md'
                          : 'border-white opacity-85 hover:opacity-100 hover:scale-105 shadow-xs'
                      }`}
                      style={{ backgroundColor: swatchHex }}
                    >
                      <span className="h-3.5 w-3.5 rounded-full bg-white/95 shadow-2xs" />
                    </button>
                  );
                })}
              </div>
            </div>

            {/* RIGHT COLUMN: Color-Coded Player Slots */}
            <div className="lg:col-span-5 rounded-2xl bg-sky-50/90 border-2 border-sky-200 p-4 flex flex-col">
              <div className="pb-2 border-b border-sky-200 flex items-center justify-between text-xs">
                <h2 className="font-display text-sm font-black uppercase tracking-wide text-sky-900">
                  Phòng Chờ Tỷ Phú ({playerCount}/4)
                </h2>
                <span className="text-sky-700 font-extrabold">Vai trò</span>
              </div>

              <div className="pt-3 space-y-2.5 flex-1 flex flex-col justify-center">
                {configs.slice(0, playerCount).map((player, idx) => {
                  const slotPersona = CHARACTER_PERSONAS[player.tokenType];
                  return (
                    <div
                      key={player.id}
                      className="relative flex items-center gap-2.5 p-2 rounded-2xl bg-white border-2 border-sky-100 shadow-xs overflow-hidden"
                    >
                      <span
                        className="w-1.5 self-stretch rounded-full shrink-0"
                        style={{ backgroundColor: player.color }}
                      />

                      <PlayerAvatar3D
                        archetype={player.tokenType}
                        mood={idx === 0 ? 'active' : 'idle'}
                        phaseSeed={idx}
                        isBot={player.isBot}
                        showBotStamp
                        size="sm"
                        className="!rounded-xl !border-2 !border-white"
                        ariaLabel={slotPersona.personaName}
                      />

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
                          placeholder={`Người chơi ${idx + 1}`}
                          className="w-full px-2 py-1.5 text-xs font-extrabold text-slate-900 bg-sky-50/70 border border-sky-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#29B6F6]"
                        />
                      </div>

                      <div className="flex items-center p-0.5 bg-sky-100 rounded-xl border border-sky-200 shrink-0">
                        <button
                          type="button"
                          onClick={() =>
                            updatePlayer(idx, {
                              isBot: false,
                              name: player.isBot ? `Người chơi ${idx + 1}` : player.name,
                            })
                          }
                          className={`px-2 py-1 text-[10px] font-black uppercase rounded-lg transition-all cursor-pointer whitespace-nowrap ${
                            !player.isBot
                              ? 'bg-[#66C61C] text-white shadow-xs'
                              : 'text-sky-900 hover:text-slate-950'
                          }`}
                        >
                          Người
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            updatePlayer(idx, {
                              isBot: true,
                              name: !player.isBot ? slotPersona.botDefaultName : player.name,
                            })
                          }
                          className={`px-2 py-1 text-[10px] font-black uppercase rounded-lg transition-all cursor-pointer whitespace-nowrap ${
                            player.isBot
                              ? 'bg-[#0284C7] text-white shadow-xs'
                              : 'text-sky-900 hover:text-slate-950'
                          }`}
                        >
                          Bot AI
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {validationError && (
            <p
              role="alert"
              className="px-3.5 py-2 rounded-xl bg-rose-50 border-2 border-rose-200 text-xs font-extrabold text-rose-700 text-center"
            >
              {validationError}
            </p>
          )}

          {/* Chunky Glossy 3D Lime-Green Start Match CTA */}
          <div className="pt-1 flex justify-center">
            <button
              type="submit"
              data-start="true"
              className="bt-btn-green w-full sm:w-auto sm:min-w-[320px] py-3.5 px-12 rounded-full font-black text-base sm:text-xl uppercase tracking-wider cursor-pointer whitespace-nowrap"
            >
              🎲 Bắt Đầu Ván Đấu!
            </button>
          </div>
        </form>
      </div>

      {/* Clean inline control hint in bottom safe margin */}
      <p
        className="mt-2 text-xs font-extrabold text-slate-900 text-center select-none"
        style={{
          textShadow:
            '0 0 8px rgba(255,255,255,0.98), 0 1px 2px rgba(255,255,255,0.98)',
        }}
      >
        Kéo chuột Xoay bàn cờ 3D · Cuộn chuột Thu phóng · Nhấn ô đất Xem chi tiết · Phím Space Đổ xúc xắc
      </p>
    </div>
  );
};
