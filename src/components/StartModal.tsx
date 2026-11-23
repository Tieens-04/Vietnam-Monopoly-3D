import React, { useEffect, useRef, useState } from 'react';
import { CHARACTER_PERSONAS } from '../game/avatarLogic';
import {
  formatBusinessTourCompact,
  formatBusinessTourSpaced,
  START_SALARY,
  WORLD_TOUR_FEE,
} from '../game/rules';
import {
  CurrencyStyleId,
  GraphicsQualityPref,
  GraphicsQualityTier,
  MatchMode,
  PlayerSetupConfig,
  TeamId,
} from '../game/types';
import type { useOnlineMultiplayer } from '../utils/onlineClient';
import { CurrencyStylePicker } from './CurrencyStyleBadge';
import { GraphicsQualityPicker } from './GraphicsQualityPicker';
import { OnlineLobbyPanel } from './OnlineLobbyPanel';
import { PlayerAvatar3D } from './PlayerAvatar3D';
import { useDialogFocusTrap } from './TileModalAndDialogs';

interface StartModalProps {
  initialConfigs: PlayerSetupConfig[];
  initialStartingCash: number;
  initialMatchMode?: MatchMode;
  initialTacticalDice?: boolean;
  initialFestivalEnabled?: boolean;
  isRulebookOpen?: boolean;
  currencyStyle: CurrencyStyleId;
  onChangeCurrencyStyle: (next: CurrencyStyleId) => void;
  graphicsQualityPref: GraphicsQualityPref;
  effectiveQualityTier: GraphicsQualityTier;
  gpuLabel?: string;
  onChangeGraphicsQuality: (next: GraphicsQualityPref) => void;
  online?: ReturnType<typeof useOnlineMultiplayer>;
  onStartGame: (
    configs: PlayerSetupConfig[],
    startingCash: number,
    matchMode: MatchMode,
    tacticalDiceEnabled: boolean,
    festivalEnabled: boolean
  ) => void;
  onOpenRulebook: () => void;
}

const ALL_TOKENS: Array<PlayerSetupConfig['tokenType']> = ['car', 'yacht', 'jet', 'crown'];

const TOKEN_SIGNATURE_HEX: Record<PlayerSetupConfig['tokenType'], string> = {
  car: '#F5B800',
  yacht: '#66C61C',
  jet: '#E91E63',
  crown: '#29B6F6',
};

const TOKEN_SIGNATURE_COLOR_NAME: Record<PlayerSetupConfig['tokenType'], string> = {
  car: 'Vàng kim',
  yacht: 'Xanh cốm',
  jet: 'Hồng đậm',
  crown: 'Xanh da trời',
};

/**
 * Playful Casual 3D Business Tour Globe & Hot-Pink Dice Emblem
 */
const BusinessTourCrestSvg: React.FC = () => (
  <svg
    viewBox="0 0 68 68"
    className="bt-lobby-crest h-10 w-10 sm:h-13 sm:w-13 shrink-0 drop-shadow-[0_4px_8px_rgba(3,52,86,0.35)]"
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
  initialMatchMode = 'FFA',
  initialTacticalDice = false,
  initialFestivalEnabled = false,
  isRulebookOpen = false,
  currencyStyle,
  onChangeCurrencyStyle,
  graphicsQualityPref,
  effectiveQualityTier,
  gpuLabel,
  onChangeGraphicsQuality,
  online,
  onStartGame,
  onOpenRulebook,
}) => {
  const dialogRef = useRef<HTMLDivElement>(null);
  useDialogFocusTrap(dialogRef, !isRulebookOpen);

  const [lobbyMode, setLobbyMode] = useState<'offline' | 'online'>(() =>
    online && (online.initialInviteCode || online.roomSnapshot) ? 'online' : 'offline'
  );
  const [matchMode, setMatchMode] = useState<MatchMode>(initialMatchMode);
  const [tacticalDiceEnabled, setTacticalDiceEnabled] = useState<boolean>(initialTacticalDice);
  const [festivalEnabled, setFestivalEnabled] = useState<boolean>(initialFestivalEnabled);
  const [playerCount, setPlayerCount] = useState<number>(() =>
    initialMatchMode === 'TEAMS_2V2'
      ? 4
      : initialConfigs.filter((c) => c.enabled).length || 4
  );
  const [configs, setConfigs] = useState<PlayerSetupConfig[]>(() =>
    initialMatchMode === 'TEAMS_2V2'
      ? initialConfigs.map((c, idx) => ({
          ...c,
          enabled: true,
          teamId: (idx % 2) as TeamId,
        }))
      : initialConfigs
  );
  const [startingCash, setStartingCash] = useState<number>(initialStartingCash);
  const [validationError, setValidationError] = useState<string | null>(null);

  useEffect(() => {
    if (online?.roomSnapshot) {
      setLobbyMode('online');
    }
  }, [online?.roomSnapshot]);

  const leadPlayer = configs[0];
  const leadPersona = CHARACTER_PERSONAS[leadPlayer.tokenType];

  const handleMatchModeChange = (nextMode: MatchMode) => {
    setMatchMode(nextMode);
    if (nextMode === 'TEAMS_2V2') {
      setPlayerCount(4);
      setConfigs((prev) =>
        prev.map((c, idx) => ({
          ...c,
          enabled: true,
          teamId: (idx % 2) as TeamId,
        }))
      );
    } else {
      setConfigs((prev) =>
        prev.map((c) => ({
          ...c,
          teamId: undefined,
        }))
      );
    }
    setValidationError(null);
  };

  const handleCountChange = (count: number) => {
    if (matchMode === 'TEAMS_2V2' && count !== 4) return;
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
          const prevLeadBotDefault = CHARACTER_PERSONAS[currentLeadToken].botDefaultName;
          const nextLeadBotDefault = CHARACTER_PERSONAS[nextToken].botDefaultName;
          return {
            ...p,
            tokenType: nextToken,
            color: swappedSlot ? swappedSlot.color : TOKEN_SIGNATURE_HEX[nextToken],
            colorName: swappedSlot
              ? swappedSlot.colorName
              : TOKEN_SIGNATURE_COLOR_NAME[nextToken],
            name: p.isBot && p.name === prevLeadBotDefault ? nextLeadBotDefault : p.name,
          };
        }
        if (idx === swapIdx) {
          const prevBotDefault = CHARACTER_PERSONAS[p.tokenType].botDefaultName;
          const nextBotDefault = CHARACTER_PERSONAS[currentLeadToken].botDefaultName;
          return {
            ...p,
            tokenType: currentLeadToken,
            color: lead.color,
            colorName: lead.colorName,
            name: p.isBot && p.name === prevBotDefault ? nextBotDefault : p.name,
          };
        }
        return p;
      });
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const effectiveCount = matchMode === 'TEAMS_2V2' ? 4 : playerCount;
    const active = configs.slice(0, effectiveCount);
    const hasEmptyName = active.some((p) => p.name.trim().length === 0);
    if (hasEmptyName) {
      setValidationError('Vui lòng nhập tên cho tất cả người chơi tham gia!');
      return;
    }
    const finalConfigs = configs.map((c, idx) => ({
      ...c,
      enabled: idx < effectiveCount,
      name: c.name.trim(),
      teamId: matchMode === 'TEAMS_2V2' ? ((idx % 2) as TeamId) : undefined,
    }));
    onStartGame(finalConfigs, startingCash, matchMode, tacticalDiceEnabled, festivalEnabled);
  };

  return (
    <div
      className="fixed inset-0 z-30 flex flex-col items-center justify-center p-2.5 sm:p-4 pointer-events-auto overflow-y-auto overscroll-contain"
      style={{
        background:
          'radial-gradient(circle at 50% 18%, rgba(125, 211, 252, 0.55) 0%, rgba(186, 230, 253, 0.42) 48%, rgba(251, 207, 232, 0.52) 100%)',
      }}
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="start-modal-title"
        data-testid="bt-casual-lobby"
        className="w-full max-w-5xl shrink-0 my-auto bt-casual-modal rounded-[28px] overflow-hidden animate-pop-in flex flex-col max-h-[calc(100dvh-1.25rem)] sm:max-h-[calc(100dvh-2rem)]"
      >
        {/* Playful Glossy Sky-Cyan Game Lobby Banner */}
        <div className="bt-lobby-compact-header shrink-0 bt-header-sky px-3.5 sm:px-6 py-2 sm:py-2.5 flex items-center justify-between gap-2.5">
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
            <BusinessTourCrestSvg />
            <div className="min-w-0">
              <h1
                id="start-modal-title"
                className="font-display text-base sm:text-2xl md:text-[25px] font-black uppercase tracking-wide text-white leading-tight"
                style={{
                  textWrap: 'balance',
                  textShadow: '0 2px 0 rgba(3, 82, 130, 0.75)',
                }}
              >
                Cờ Tỷ Phú Việt Nam 3D
              </h1>
              <div className="bt-lobby-subtitle hidden sm:flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] sm:text-xs font-bold text-sky-100 mt-0.5">
                <span>Sảnh Đấu Business Tour</span>
                <span aria-hidden="true">·</span>
                <span>32 Ô Bàn Cờ Việt Nam</span>
                <span aria-hidden="true">·</span>
                <span>Chơi Offline &amp; Online</span>
              </div>
            </div>
          </div>

          <div className="shrink-0">
            <button
              type="button"
              onClick={onOpenRulebook}
              className="bt-btn-white px-3.5 sm:px-4 py-1.5 sm:py-2 rounded-full text-[11px] sm:text-xs font-black uppercase tracking-wide cursor-pointer whitespace-nowrap"
            >
              Luật Chơi
            </button>
          </div>
        </div>

        {/* Mode Switcher Tabs (Offline vs Online Multiplayer) */}
        {online && (
          <div className="bt-lobby-compact-tabs shrink-0 px-3.5 sm:px-6 pt-2">
            <div
              role="tablist"
              aria-label="Chế độ sảnh đấu"
              className="grid grid-cols-2 gap-1.5 sm:gap-2 p-1 sm:p-1.5 rounded-2xl bg-sky-100 border-2 border-sky-200 max-w-2xl mx-auto"
            >
              <button
                id="bt-tab-offline"
                type="button"
                role="tab"
                aria-selected={lobbyMode === 'offline'}
                data-testid="bt-tab-offline"
                onClick={() => setLobbyMode('offline')}
                className={`py-1.5 sm:py-2 px-2 sm:px-4 rounded-xl text-[11px] sm:text-sm font-black uppercase tracking-wide transition-all cursor-pointer whitespace-normal sm:whitespace-nowrap text-center leading-tight ${
                  lobbyMode === 'offline'
                    ? 'bt-btn-cyan'
                    : 'text-sky-900 hover:bg-white/60'
                }`}
              >
                🎮 Chơi Với Máy / Cùng Máy
              </button>
              <button
                id="bt-tab-online"
                type="button"
                role="tab"
                aria-selected={lobbyMode === 'online'}
                data-testid="bt-tab-online"
                onClick={() => {
                  setLobbyMode('online');
                  online.ensureConnected();
                }}
                className={`py-1.5 sm:py-2 px-2 sm:px-4 rounded-xl text-[11px] sm:text-sm font-black uppercase tracking-wide transition-all cursor-pointer whitespace-normal sm:whitespace-nowrap text-center leading-tight ${
                  lobbyMode === 'online'
                    ? 'bt-btn-green'
                    : 'text-sky-900 hover:bg-white/60'
                }`}
              >
                🌐 Chơi Online Cùng Bạn Bè
              </button>
            </div>
          </div>
        )}

        <div
          role={online ? 'tabpanel' : undefined}
          aria-labelledby={
            online ? (lobbyMode === 'online' ? 'bt-tab-online' : 'bt-tab-offline') : undefined
          }
          className="flex-1 min-h-0 flex flex-col overflow-hidden"
        >
          {lobbyMode === 'online' && online ? (
            <OnlineLobbyPanel online={online} />
          ) : (
            <form onSubmit={handleSubmit} className="flex-1 min-h-0 flex flex-col">
              <div className="flex-1 min-h-0 overflow-y-auto slim-scroll p-2.5 sm:px-4 sm:py-2.5">
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-stretch">
                  {/* LEFT COLUMN: Casual Match Rules & Starting Pot */}
                  <div className="lg:col-span-4 rounded-2xl bg-sky-50/90 border-2 border-sky-200 flex flex-col justify-between p-2.5 sm:p-3 space-y-1.5">
                    <div className="space-y-1.5">
                      <div className="pb-1.5 border-b border-sky-200 flex items-center justify-between">
                        <h2 className="font-display text-sm font-black uppercase tracking-wide text-sky-900">
                          Thiết Lập Bàn Đấu
                        </h2>
                        <span className="text-xs font-extrabold text-[#16A34A]">
                          Luật Business Tour
                        </span>
                      </div>

                      <div>
                        <span className="block text-xs font-extrabold text-slate-600 mb-1">
                          Thể thức đấu
                        </span>
                        <div className="grid grid-cols-2 gap-1.5 p-1 rounded-2xl bg-sky-100 border border-sky-200">
                          <button
                            type="button"
                            data-testid="bt-mode-ffa"
                            aria-pressed={matchMode === 'FFA'}
                            onClick={() => handleMatchModeChange('FFA')}
                            className={`py-1.5 px-2 rounded-xl text-xs font-black uppercase transition-all cursor-pointer whitespace-normal text-center leading-tight ${
                              matchMode === 'FFA'
                                ? 'bt-btn-cyan'
                                : 'text-sky-900 hover:bg-white/60'
                            }`}
                          >
                            Đấu Đơn (FFA)
                          </button>
                          <button
                            type="button"
                            data-testid="bt-mode-2v2"
                            aria-pressed={matchMode === 'TEAMS_2V2'}
                            onClick={() => handleMatchModeChange('TEAMS_2V2')}
                            className={`py-1.5 px-2 rounded-xl text-xs font-black uppercase transition-all cursor-pointer whitespace-normal text-center leading-tight ${
                              matchMode === 'TEAMS_2V2'
                                ? 'bt-btn-green'
                                : 'text-sky-900 hover:bg-white/60'
                            }`}
                          >
                            Đấu Đội 2v2
                          </button>
                        </div>
                        {matchMode === 'TEAMS_2V2' && (
                          <p className="mt-1 text-[11px] font-bold text-sky-900 leading-snug">
                            Đội A (P1 &amp; P3) vs Đội B (P2 &amp; P4) · Miễn thuê &amp; gộp độc quyền
                          </p>
                        )}
                      </div>

                      <div>
                        <span className="block text-xs font-extrabold text-slate-600 mb-1">
                          Số người chơi {matchMode === 'TEAMS_2V2' ? '(Khóa 4 cho 2v2)' : ''}
                        </span>
                        <div className="grid grid-cols-3 gap-1.5 p-1 rounded-2xl bg-sky-100 border border-sky-200">
                          {[2, 3, 4].map((num) => {
                            const disabledForTeams = matchMode === 'TEAMS_2V2' && num < 4;
                            return (
                              <button
                                key={num}
                                type="button"
                                disabled={disabledForTeams}
                                aria-pressed={playerCount === num}
                                onClick={() => handleCountChange(num)}
                                className={`py-1.5 px-2 rounded-xl text-xs font-black uppercase transition-all whitespace-nowrap ${
                                  playerCount === num
                                    ? 'bt-btn-cyan'
                                    : 'text-sky-900 hover:bg-white/60'
                                } ${disabledForTeams ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}
                              >
                                {num} Người
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      <div>
                        <span className="block text-xs font-extrabold text-slate-600 mb-1">
                          Ngân sách khởi điểm
                        </span>
                        <div className="grid grid-cols-2 gap-1.5 p-1 rounded-2xl bg-sky-100 border border-sky-200">
                          {[2_000_000, 3_000_000].map((cash) => (
                            <button
                              key={cash}
                              type="button"
                              aria-pressed={startingCash === cash}
                              onClick={() => setStartingCash(cash)}
                              className={`py-1.5 px-2 rounded-xl text-xs font-black font-mono-num transition-all cursor-pointer whitespace-nowrap ${
                                startingCash === cash
                                  ? 'bt-btn-gold text-slate-950'
                                  : 'text-sky-900 hover:bg-white/60'
                              }`}
                            >
                              {formatBusinessTourSpaced(cash)}
                            </button>
                          ))}
                        </div>
                      </div>

                      <button
                        type="button"
                        data-testid="bt-tactical-dice-toggle"
                        aria-pressed={tacticalDiceEnabled}
                        onClick={() => setTacticalDiceEnabled((v) => !v)}
                        className="w-full px-2.5 py-1.5 rounded-xl bg-white border border-sky-200 flex items-center justify-between gap-2 text-xs font-extrabold text-slate-800 cursor-pointer hover:border-sky-300"
                      >
                        <span className="text-left leading-tight">
                          Xúc xắc chiến thuật (Chẵn/Lẻ/Đổ lại)
                        </span>
                        <span
                          className={`shrink-0 px-2 py-0.5 rounded-full text-[10px] font-black uppercase ${
                            tacticalDiceEnabled
                              ? 'bg-emerald-100 text-emerald-700'
                              : 'bg-slate-200 text-slate-700'
                          }`}
                        >
                          {tacticalDiceEnabled ? 'Đang Bật' : 'Đang Tắt'}
                        </span>
                      </button>

                      <button
                        type="button"
                        data-testid="bt-festival-toggle"
                        aria-pressed={festivalEnabled}
                        onClick={() => setFestivalEnabled((v) => !v)}
                        className="w-full px-2.5 py-1.5 rounded-xl bg-white border border-sky-200 flex items-center justify-between gap-2 text-xs font-extrabold text-slate-800 cursor-pointer hover:border-sky-300"
                      >
                        <span className="text-left leading-tight">
                          🎉 Lễ Hội đầu mùa (3 thành phố ×2 thuê)
                        </span>
                        <span
                          className={`shrink-0 px-2 py-0.5 rounded-full text-[10px] font-black uppercase ${
                            festivalEnabled
                              ? 'bg-emerald-100 text-emerald-700'
                              : 'bg-slate-200 text-slate-700'
                          }`}
                        >
                          {festivalEnabled ? 'Đang Bật' : 'Đang Tắt'}
                        </span>
                      </button>
                    </div>

                    <div className="pt-1.5 border-t border-sky-200 grid grid-cols-2 gap-x-2 gap-y-0.5 text-[10.5px] leading-snug">
                      <div className="truncate">
                        <span className="text-slate-600 font-semibold">Bàn: </span>
                        <span className="font-extrabold text-slate-900">32 ô · 8 Bộ · 4 Đảo</span>
                      </div>
                      <div className="truncate text-right">
                        <span className="text-slate-600 font-semibold">Xây: </span>
                        <span className="font-extrabold text-slate-900">Vòng 2 Cấp 3 · ★</span>
                      </div>
                      <div className="truncate">
                        <span className="text-slate-600 font-semibold">Cúp: </span>
                        <span className="font-extrabold text-[#16A34A]">0K · Bán hoàn 100%</span>
                      </div>
                      <div className="truncate text-right">
                        <span className="text-slate-600 font-semibold">Qua BĐ: </span>
                        <span className="font-black text-[#16A34A] font-mono-num">
                          +{formatBusinessTourCompact(START_SALARY)} (Bay {formatBusinessTourCompact(WORLD_TOUR_FEE)})
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* CENTER COLUMN: Vibrant Animated 3D Character Podium */}
                  <div
                    className="lg:col-span-3 rounded-2xl border-2 border-sky-200 p-3.5 flex flex-col items-center justify-between text-center"
                    style={{
                      background:
                        'radial-gradient(circle at 50% 32%, #FFFFFF 0%, #E0F2FE 65%, #BAE6FD 100%)',
                    }}
                  >
                    <div className="w-full pb-1.5 border-b border-sky-200/80 text-center">
                      <h2 className="font-display text-sm font-black uppercase tracking-wide text-sky-900">
                        Nhân Vật 3D Của Bạn
                      </h2>
                    </div>

                    <div className="my-1.5 animate-float-gentle">
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
                      className="mt-2.5 grid grid-cols-4 gap-2 w-full pt-2.5 border-t border-sky-200/80"
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
                            aria-pressed={selected}
                            onClick={() => handleSelectLeadToken(tok)}
                            title={`${meta.personaName}`}
                            aria-label={`Chọn nhân vật ${meta.personaName}`}
                            className={`h-9.5 rounded-xl flex items-center justify-center border-2 transition-transform cursor-pointer ${
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

                  {/* RIGHT COLUMN: Color-Coded Player Slots & 3D Presentation Pickers */}
                  <div className="lg:col-span-5 rounded-2xl bg-sky-50/90 border-2 border-sky-200 p-2.5 sm:p-3 flex flex-col justify-between gap-2">
                    <div>
                      <div className="pb-1.5 border-b border-sky-200 flex items-center justify-between text-xs">
                        <h2 className="font-display text-sm font-black uppercase tracking-wide text-sky-900">
                          Phòng Chờ Tỷ Phú ({playerCount}/4)
                        </h2>
                        <span className="text-sky-700 font-extrabold">Vai trò</span>
                      </div>

                      <div className="bt-player-roster-wrap pt-1.5 space-y-1.5">
                        {configs.slice(0, playerCount).map((player, idx) => {
                          const slotPersona = CHARACTER_PERSONAS[player.tokenType];
                          return (
                            <div
                              key={player.id}
                              className="bt-player-slot-row relative flex items-center gap-1 px-1.5 py-1 rounded-2xl bg-white border-2 border-sky-100 shadow-xs overflow-hidden"
                            >
                              <span
                                className="w-1.5 min-h-8 self-stretch rounded-full shrink-0"
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

                              <div className="bt-player-name-cell flex-1 min-w-0">
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
                                  className="w-full min-w-0 px-1.5 py-1 text-xs font-extrabold text-slate-900 bg-sky-50/70 border border-sky-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#29B6F6]"
                                />
                              </div>

                              <div className="bt-player-slot-actions flex items-center gap-1 shrink-0">
                                {matchMode === 'TEAMS_2V2' && (
                                  <span
                                    className={`shrink-0 px-1.5 py-0.5 rounded-full text-[9px] font-black uppercase whitespace-nowrap ${
                                      idx % 2 === 0
                                        ? 'bg-sky-100 text-sky-800 border border-sky-300'
                                        : 'bg-rose-100 text-rose-800 border border-rose-300'
                                    }`}
                                  >
                                    {idx % 2 === 0 ? 'Đội A' : 'Đội B'}
                                  </span>
                                )}

                                <div className="bt-player-role-group flex items-center p-0.5 bg-sky-100 rounded-xl border border-sky-200 shrink-0">
                                  <button
                                    type="button"
                                    aria-pressed={!player.isBot}
                                    onClick={() =>
                                      updatePlayer(idx, {
                                        isBot: false,
                                        name: player.isBot ? `Người chơi ${idx + 1}` : player.name,
                                      })
                                    }
                                    className={`px-1.5 py-1 text-[10px] font-black uppercase rounded-lg transition-all cursor-pointer whitespace-nowrap ${
                                      !player.isBot
                                        ? 'bg-[#66C61C] text-white shadow-xs'
                                        : 'text-sky-900 hover:text-slate-950'
                                    }`}
                                  >
                                    Người
                                  </button>
                                  <button
                                    type="button"
                                    aria-pressed={player.isBot}
                                    onClick={() =>
                                      updatePlayer(idx, {
                                        isBot: true,
                                        name: !player.isBot ? slotPersona.botDefaultName : player.name,
                                      })
                                    }
                                    className={`px-1.5 py-1 text-[10px] font-black uppercase rounded-lg transition-all cursor-pointer whitespace-nowrap ${
                                      player.isBot
                                        ? 'bg-[#0284C7] text-white shadow-xs'
                                        : 'text-sky-900 hover:text-slate-950'
                                    }`}
                                  >
                                    Bot AI
                                  </button>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    <div className="pt-1.5 border-t border-sky-200 space-y-1.5">
                      <div>
                        <span className="block text-[11px] font-extrabold text-slate-600 mb-1">
                          Hình thức Tiền tệ 3D
                        </span>
                        <CurrencyStylePicker
                          value={currencyStyle}
                          onChange={onChangeCurrencyStyle}
                          compact
                        />
                      </div>

                      <div>
                        <span className="block text-[11px] font-extrabold text-slate-600 mb-1">
                          Chất lượng Đồ họa 3D
                        </span>
                        <GraphicsQualityPicker
                          value={graphicsQualityPref}
                          effectiveTier={effectiveQualityTier}
                          gpuLabel={gpuLabel}
                          compact
                          onChange={onChangeGraphicsQuality}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Pinned Chunky Glossy 3D Lime-Green Start Match CTA (Always Visible!) */}
              <div className="bt-lobby-compact-cta shrink-0 px-3.5 sm:px-4 py-2 bg-sky-50/95 border-t border-sky-200/90 flex flex-col items-center gap-1.5">
                {validationError && (
                  <p
                    role="alert"
                    className="w-full max-w-lg px-3 py-1 rounded-xl bg-rose-50 border-2 border-rose-200 text-xs font-extrabold text-rose-700 text-center"
                  >
                    {validationError}
                  </p>
                )}
                <button
                  type="submit"
                  data-start="true"
                  className="bt-btn-green w-full sm:w-auto sm:min-w-[320px] py-2 sm:py-2.5 px-6 sm:px-12 rounded-full font-black text-sm sm:text-lg uppercase tracking-wider cursor-pointer whitespace-normal sm:whitespace-nowrap"
                >
                  🎲 Bắt Đầu Ván Đấu!
                </button>
              </div>
            </form>
          )}
        </div>

        {/* Clean inline control hint inside dialog (desktop/tablet with pointer/keyboard) */}
        <p className="bt-lobby-mouse-hint hidden sm:block shrink-0 px-4 py-1.5 border-t border-sky-200/80 bg-sky-100/70 text-[11px] sm:text-xs font-extrabold text-slate-800 text-center select-none">
          Kéo chuột Xoay bàn cờ 3D · Cuộn chuột Thu phóng · Nhấn ô đất Xem chi tiết
          {lobbyMode === 'offline' ? ' · Phím Space Đổ xúc xắc' : ''}
        </p>
      </div>
    </div>
  );
};
