import React, { useEffect, useRef, useState } from 'react';
import {
  BookOpen,
  Check,
  Dices,
  Gamepad2,
  Globe,
  Sparkles,
} from 'lucide-react';
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
import { ToggleSwitch } from './GameUiPrimitives';
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
  voiceBarNode?: React.ReactNode;
  onlineChatNode?: React.ReactNode;
  speakingParticipantIds?: Record<string, boolean>;
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
 * Refined Tactile Tabletop Crest Emblem (Gold Medallion + Crimson Die)
 */
const BusinessTourCrestSvg: React.FC = () => (
  <svg
    viewBox="0 0 68 68"
    className="bt-lobby-crest h-9 w-9 sm:h-11 sm:w-11 shrink-0 drop-shadow-[0_3px_6px_rgba(0,0,0,0.28)]"
    role="img"
    aria-label="Biểu tượng Cờ Tỷ Phú Việt Nam 3D"
  >
    <circle cx="34" cy="34" r="30" fill="#F5B800" stroke="#FEF08A" strokeWidth="2.5" />
    <circle cx="34" cy="34" r="24" fill="#182232" />
    <g transform="translate(34,34) rotate(-10)">
      <rect
        x="-14"
        y="-14"
        width="28"
        height="28"
        rx="6"
        fill="#E11D48"
        stroke="#FFFFFF"
        strokeWidth="2.2"
      />
      <circle cx="-6.5" cy="-6.5" r="2.3" fill="#FFFFFF" />
      <circle cx="0" cy="0" r="2.5" fill="#FFFFFF" />
      <circle cx="6.5" cy="6.5" r="2.3" fill="#FFFFFF" />
      <circle cx="6.5" cy="-6.5" r="2.3" fill="#FFFFFF" />
      <circle cx="-6.5" cy="6.5" r="2.3" fill="#FFFFFF" />
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
  voiceBarNode,
  onlineChatNode,
  speakingParticipantIds,
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
          'radial-gradient(circle at 50% 25%, rgba(20, 28, 43, 0.24) 0%, rgba(15, 23, 42, 0.46) 100%)',
      }}
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="start-modal-title"
        data-testid="bt-casual-lobby"
        className="w-full max-w-5xl shrink-0 my-auto bt-casual-modal rounded-[24px] animate-pop-in flex flex-col max-h-[calc(100dvh-1.25rem)] sm:max-h-[calc(100dvh-2rem)]"
      >
        {/* Deep Slate Ink Lobby Header */}
        <div className="bt-lobby-compact-header shrink-0 bt-header-sky rounded-t-[22px] px-4 sm:px-6 py-2 sm:py-2.5 flex items-center justify-between gap-2.5">
          <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
            <BusinessTourCrestSvg />
            <div className="min-w-0">
              <h1
                id="start-modal-title"
                className="font-display text-base sm:text-xl md:text-[22px] font-black uppercase tracking-wide text-white leading-tight"
                style={{ textWrap: 'balance' }}
              >
                Cờ Tỷ Phú Việt Nam 3D
              </h1>
              <div className="bt-lobby-subtitle hidden sm:flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] font-semibold text-slate-300 mt-0.5">
                <span>Sảnh Đấu Business Tour</span>
                <span aria-hidden="true" className="text-amber-400">·</span>
                <span>32 Ô Bàn Cờ Việt Nam</span>
                <span aria-hidden="true" className="text-amber-400">·</span>
                <span>Offline &amp; Online</span>
              </div>
            </div>
          </div>

          <div className="shrink-0">
            <button
              type="button"
              onClick={onOpenRulebook}
              className="bt-btn-white px-3 sm:px-3.5 py-1.5 rounded-xl text-[11px] sm:text-xs font-extrabold uppercase tracking-wide flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
            >
              <BookOpen className="h-3.5 w-3.5 text-[#182232] shrink-0" aria-hidden="true" />
              <span>Luật Chơi</span>
            </button>
          </div>
        </div>

        {/* Unified Mode Switcher Tabs (Offline vs Online Multiplayer) */}
        {online && (
          <div className="bt-lobby-compact-tabs shrink-0 px-3.5 sm:px-6 pt-2">
            <div
              role="tablist"
              aria-label="Chế độ sảnh đấu"
              className="bt-segment-well grid grid-cols-2 gap-1 p-1 rounded-xl max-w-xl mx-auto"
            >
              <button
                id="bt-tab-offline"
                type="button"
                role="tab"
                aria-selected={lobbyMode === 'offline'}
                data-testid="bt-tab-offline"
                onClick={() => setLobbyMode('offline')}
                className={`py-1.5 px-2 sm:px-4 rounded-lg text-[11px] sm:text-xs font-extrabold uppercase tracking-wide flex items-center justify-center gap-1.5 transition-all cursor-pointer whitespace-normal sm:whitespace-nowrap text-center leading-tight ${
                  lobbyMode === 'offline'
                    ? 'bg-[#182232] text-white shadow-xs'
                    : 'text-[#424d61] hover:bg-white/65 hover:text-[#141c2b]'
                }`}
              >
                <Gamepad2 className="h-3.5 w-3.5 shrink-0 hidden sm:inline" aria-hidden="true" />
                <span>Chơi Với Máy / Cùng Máy</span>
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
                className={`py-1.5 px-2 sm:px-4 rounded-lg text-[11px] sm:text-xs font-extrabold uppercase tracking-wide flex items-center justify-center gap-1.5 transition-all cursor-pointer whitespace-normal sm:whitespace-nowrap text-center leading-tight ${
                  lobbyMode === 'online'
                    ? 'bg-[#182232] text-white shadow-xs'
                    : 'text-[#424d61] hover:bg-white/65 hover:text-[#141c2b]'
                }`}
              >
                <Globe className="h-3.5 w-3.5 shrink-0 hidden sm:inline" aria-hidden="true" />
                <span>Chơi Online Cùng Bạn Bè</span>
              </button>
            </div>
          </div>
        )}

        <div
          role={online ? 'tabpanel' : undefined}
          aria-labelledby={
            online ? (lobbyMode === 'online' ? 'bt-tab-online' : 'bt-tab-offline') : undefined
          }
          className={`flex-1 min-h-0 flex flex-col ${
            lobbyMode === 'offline' ? 'overflow-hidden' : ''
          }`}
        >
          {lobbyMode === 'online' && online ? (
            <OnlineLobbyPanel
              online={online}
              voiceBarNode={voiceBarNode}
              onlineChatNode={onlineChatNode}
              speakingParticipantIds={speakingParticipantIds}
            />
          ) : (
            <form onSubmit={handleSubmit} className="flex-1 min-h-0 flex flex-col">
              <div className="flex-1 min-h-0 overflow-y-auto slim-scroll p-2.5 sm:px-4 sm:py-2.5">
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-2.5 sm:gap-3 items-stretch">
                  {/* LEFT COLUMN: Match Setup */}
                  <div className="lg:col-span-4 rounded-2xl bg-[#f3efe6] border border-[#dad3c4] flex flex-col justify-between p-2.5 sm:p-3 space-y-2">
                    <div className="space-y-1.5">
                      <div className="pb-1.5 border-b border-[#dad3c4] flex items-center justify-between">
                        <h2 className="font-display text-xs sm:text-sm font-black uppercase tracking-wide text-[#141c2b]">
                          Thiết Lập Bàn Đấu
                        </h2>
                        <span className="text-[11px] font-bold text-emerald-700">
                          Luật Business Tour
                        </span>
                      </div>

                      <div>
                        <span className="block text-[11px] font-bold text-[#525e73] mb-1">
                          Thể thức đấu
                        </span>
                        <div className="bt-segment-well grid grid-cols-2 gap-1 p-1 rounded-xl">
                          <button
                            type="button"
                            data-testid="bt-mode-ffa"
                            aria-pressed={matchMode === 'FFA'}
                            onClick={() => handleMatchModeChange('FFA')}
                            className={`py-1.5 px-2 rounded-lg text-[11px] font-extrabold uppercase transition-all cursor-pointer whitespace-normal text-center leading-tight ${
                              matchMode === 'FFA'
                                ? 'bt-segment-active-light'
                                : 'text-[#4b566a] hover:bg-white/60'
                            }`}
                          >
                            Đấu Đơn (FFA)
                          </button>
                          <button
                            type="button"
                            data-testid="bt-mode-2v2"
                            aria-pressed={matchMode === 'TEAMS_2V2'}
                            onClick={() => handleMatchModeChange('TEAMS_2V2')}
                            className={`py-1.5 px-2 rounded-lg text-[11px] font-extrabold uppercase transition-all cursor-pointer whitespace-normal text-center leading-tight ${
                              matchMode === 'TEAMS_2V2'
                                ? 'bt-segment-active-light ring-1 ring-emerald-500/60 text-emerald-800'
                                : 'text-[#4b566a] hover:bg-white/60'
                            }`}
                          >
                            Đấu Đội 2v2
                          </button>
                        </div>
                        {matchMode === 'TEAMS_2V2' && (
                          <p className="mt-1 text-[10.5px] font-semibold text-[#525e73] leading-snug">
                            Đội A (P1 &amp; P3) vs Đội B (P2 &amp; P4) · Miễn thuê đồng đội
                          </p>
                        )}
                      </div>

                      <div>
                        <span className="block text-[11px] font-bold text-[#525e73] mb-1">
                          Số người chơi {matchMode === 'TEAMS_2V2' ? '(Khóa 4 cho 2v2)' : ''}
                        </span>
                        <div className="bt-segment-well grid grid-cols-3 gap-1 p-1 rounded-xl">
                          {[2, 3, 4].map((num) => {
                            const disabledForTeams = matchMode === 'TEAMS_2V2' && num < 4;
                            return (
                              <button
                                key={num}
                                type="button"
                                disabled={disabledForTeams}
                                aria-pressed={playerCount === num}
                                onClick={() => handleCountChange(num)}
                                className={`py-1.5 px-2 rounded-lg text-[11px] font-extrabold uppercase transition-all whitespace-nowrap ${
                                  playerCount === num
                                    ? 'bt-segment-active-light'
                                    : 'text-[#4b566a] hover:bg-white/60'
                                } ${disabledForTeams ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}
                              >
                                {num} Người
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      <div>
                        <span className="block text-[11px] font-bold text-[#525e73] mb-1">
                          Ngân sách khởi điểm
                        </span>
                        <div className="bt-segment-well grid grid-cols-2 gap-1 p-1 rounded-xl">
                          {[2_000_000, 3_000_000].map((cash) => (
                            <button
                              key={cash}
                              type="button"
                              aria-pressed={startingCash === cash}
                              onClick={() => setStartingCash(cash)}
                              className={`py-1.5 px-2 rounded-lg text-xs font-black font-mono-num transition-all cursor-pointer whitespace-nowrap ${
                                startingCash === cash
                                  ? 'bt-btn-gold'
                                  : 'text-[#4b566a] hover:bg-white/60'
                              }`}
                            >
                              {formatBusinessTourSpaced(cash)}
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Clean divider-separated Toggle Switches */}
                      <div className="rounded-xl bg-white border border-[#ded8ca] divide-y divide-[#ede8dc] overflow-hidden">
                        <button
                          type="button"
                          data-testid="bt-tactical-dice-toggle"
                          aria-pressed={tacticalDiceEnabled}
                          onClick={() => setTacticalDiceEnabled((v) => !v)}
                          className="w-full px-2.5 py-2 flex items-center justify-between gap-2 text-xs font-bold text-[#141c2b] cursor-pointer hover:bg-[#faf8f3] transition-colors"
                        >
                          <span className="text-left leading-tight">
                            Xúc xắc chiến thuật (Chẵn/Lẻ/Đổ lại)
                          </span>
                          <ToggleSwitch checked={tacticalDiceEnabled} size="sm" />
                        </button>

                        <button
                          type="button"
                          data-testid="bt-festival-toggle"
                          aria-pressed={festivalEnabled}
                          onClick={() => setFestivalEnabled((v) => !v)}
                          className="w-full px-2.5 py-2 flex items-center justify-between gap-2 text-xs font-bold text-[#141c2b] cursor-pointer hover:bg-[#faf8f3] transition-colors"
                        >
                          <span className="text-left leading-tight flex items-center gap-1.5">
                            <Sparkles className="h-3.5 w-3.5 text-amber-600 shrink-0" aria-hidden="true" />
                            <span>Lễ Hội đầu mùa (3 thành phố ×2 thuê)</span>
                          </span>
                          <ToggleSwitch checked={festivalEnabled} size="sm" />
                        </button>
                      </div>
                    </div>

                    <div className="pt-1.5 border-t border-[#dad3c4] grid grid-cols-2 gap-x-2 gap-y-0.5 text-[10.5px] leading-snug">
                      <div className="truncate">
                        <span className="text-[#525e73] font-medium">Bàn: </span>
                        <span className="font-bold text-[#141c2b]">32 ô · 8 Bộ · 4 Đảo</span>
                      </div>
                      <div className="truncate text-right">
                        <span className="text-[#525e73] font-medium">Xây: </span>
                        <span className="font-bold text-[#141c2b]">Vòng 2 Cấp 3 · ★</span>
                      </div>
                      <div className="truncate">
                        <span className="text-[#525e73] font-medium">Cúp: </span>
                        <span className="font-bold text-emerald-700">0K · Hoàn 100%</span>
                      </div>
                      <div className="truncate text-right">
                        <span className="text-[#525e73] font-medium">Qua BĐ: </span>
                        <span className="font-bold text-emerald-700 font-mono-num">
                          +{formatBusinessTourCompact(START_SALARY)} (Bay {formatBusinessTourCompact(WORLD_TOUR_FEE)})
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* CENTER COLUMN: 3D Character Pedestal */}
                  <div
                    className="lg:col-span-3 rounded-2xl border border-[#dad3c4] p-3 flex flex-col items-center justify-between text-center"
                    style={{
                      background:
                        'radial-gradient(circle at 50% 34%, #FFFFFF 0%, #F7F4EC 62%, #ECE6D8 100%)',
                    }}
                  >
                    <div className="w-full pb-1.5 border-b border-[#dad3c4] text-center">
                      <h2 className="font-display text-xs sm:text-sm font-black uppercase tracking-wide text-[#141c2b]">
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
                        className="!border-[3px] !border-white shadow-lg ring-1 ring-[#d5cec0]"
                        ariaLabel={`Chân dung 3D ${leadPersona.personaName}`}
                      />
                    </div>

                    <div>
                      <div className="font-display text-base font-black text-[#141c2b] leading-snug">
                        {leadPersona.personaName}
                      </div>
                      <div className="text-xs font-semibold text-[#525e73] mt-0.5">
                        {leadPersona.roleTitle}
                      </div>
                    </div>

                    <div
                      className="mt-2 grid grid-cols-4 gap-2 w-full pt-2 border-t border-[#dad3c4]"
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
                            title={meta.personaName}
                            aria-label={`Chọn nhân vật ${meta.personaName}`}
                            className={`h-9 rounded-xl flex items-center justify-center border-2 transition-transform cursor-pointer ${
                              selected
                                ? 'border-[#141c2b] scale-105 shadow-sm ring-2 ring-[#141c2b]/15'
                                : 'border-white opacity-80 hover:opacity-100 hover:scale-103 shadow-2xs'
                            }`}
                            style={{ backgroundColor: swatchHex }}
                          >
                            {selected ? (
                              <Check className="h-4 w-4 text-white drop-shadow-xs stroke-[3]" aria-hidden="true" />
                            ) : (
                              <span className="h-2.5 w-2.5 rounded-full bg-white/90" />
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* RIGHT COLUMN: Player Roster & Compact 3D Presentation */}
                  <div className="lg:col-span-5 rounded-2xl bg-[#f3efe6] border border-[#dad3c4] p-2.5 sm:p-3 flex flex-col justify-between gap-2">
                    <div>
                      <div className="pb-1.5 border-b border-[#dad3c4] flex items-center justify-between text-xs">
                        <h2 className="font-display text-xs sm:text-sm font-black uppercase tracking-wide text-[#141c2b]">
                          Phòng Chờ Tỷ Phú ({playerCount}/4)
                        </h2>
                        <span className="text-[#525e73] font-bold">Vai trò</span>
                      </div>

                      <div className="bt-player-roster-wrap pt-1.5 space-y-1.5">
                        {configs.slice(0, playerCount).map((player, idx) => {
                          const slotPersona = CHARACTER_PERSONAS[player.tokenType];
                          return (
                            <div
                              key={player.id}
                              className="bt-player-slot-row relative flex items-center gap-1.5 px-2 py-1 rounded-xl bg-white border border-[#ded8ca] shadow-2xs overflow-hidden"
                            >
                              <span
                                className="w-1 min-h-7 self-stretch rounded-full shrink-0"
                                style={{ backgroundColor: player.color }}
                              />

                              <PlayerAvatar3D
                                archetype={player.tokenType}
                                mood={idx === 0 ? 'active' : 'idle'}
                                phaseSeed={idx}
                                isBot={player.isBot}
                                showBotStamp
                                size="sm"
                                className="!rounded-lg !border !border-[#e6e0d3]"
                                ariaLabel={slotPersona.personaName}
                              />

                              <div className="bt-player-name-cell flex-1 min-w-0 flex items-center">
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
                                  className="w-full min-w-0 px-1.5 py-1 text-[11.5px] font-bold text-[#141c2b] bg-[#faf8f3] border border-[#ded8ca] hover:border-[#b7ae9c] rounded-lg focus:outline-none focus:ring-2 focus:ring-[#182232]/25 focus:bg-white"
                                />
                              </div>

                              <div className="bt-player-slot-actions flex items-center gap-1 shrink-0">
                                {matchMode === 'TEAMS_2V2' && (
                                  <span
                                    className={`shrink-0 px-1.5 py-0.5 rounded-md text-[9px] font-black uppercase whitespace-nowrap border ${
                                      idx % 2 === 0
                                        ? 'bg-sky-50 text-sky-800 border-sky-200'
                                        : 'bg-rose-50 text-rose-800 border-rose-200'
                                    }`}
                                  >
                                    {idx % 2 === 0 ? 'Đội A' : 'Đội B'}
                                  </span>
                                )}

                                <div className="bt-player-role-group bt-segment-well flex items-center p-0.5 rounded-lg shrink-0">
                                  <button
                                    type="button"
                                    aria-pressed={!player.isBot}
                                    onClick={() =>
                                      updatePlayer(idx, {
                                        isBot: false,
                                        name: player.isBot ? `Người chơi ${idx + 1}` : player.name,
                                      })
                                    }
                                    className={`px-1.5 py-0.5 text-[10px] font-extrabold uppercase rounded-md transition-all cursor-pointer whitespace-nowrap ${
                                      !player.isBot
                                        ? 'bg-emerald-600 text-white shadow-2xs'
                                        : 'text-[#525e73] hover:text-[#141c2b]'
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
                                    className={`px-1.5 py-0.5 text-[10px] font-extrabold uppercase rounded-md transition-all cursor-pointer whitespace-nowrap ${
                                      player.isBot
                                        ? 'bg-[#182232] text-white shadow-2xs'
                                        : 'text-[#525e73] hover:text-[#141c2b]'
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

                    <div className="pt-1.5 border-t border-[#dad3c4] space-y-1.5">
                      <div>
                        <span className="block text-[10.5px] font-bold text-[#525e73] mb-0.5">
                          Hình thức Tiền tệ 3D
                        </span>
                        <CurrencyStylePicker
                          value={currencyStyle}
                          onChange={onChangeCurrencyStyle}
                          compact
                        />
                      </div>

                      <div>
                        <span className="block text-[10.5px] font-bold text-[#525e73] mb-0.5">
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

              {/* Pinned Start Match CTA */}
              <div className="bt-lobby-compact-cta shrink-0 px-3.5 sm:px-4 py-2 bg-[#f3efe6] border-t border-[#dad3c4] rounded-b-[22px] sm:rounded-b-none flex flex-col items-center gap-1.5">
                {validationError && (
                  <p
                    role="alert"
                    className="w-full max-w-lg px-3 py-1 rounded-xl bg-rose-50 border border-rose-200 text-xs font-bold text-rose-700 text-center"
                  >
                    {validationError}
                  </p>
                )}
                <button
                  type="submit"
                  data-start="true"
                  className="bt-btn-green w-full sm:w-auto sm:min-w-[300px] py-2 sm:py-2.5 px-6 sm:px-10 rounded-xl font-black text-sm sm:text-base uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer whitespace-normal sm:whitespace-nowrap"
                >
                  <Dices className="h-5 w-5 shrink-0" aria-hidden="true" />
                  <span>Bắt Đầu Ván Đấu!</span>
                </button>
              </div>
            </form>
          )}
        </div>

        {/* Clean control hint */}
        <p className="bt-lobby-mouse-hint hidden sm:block shrink-0 px-4 py-1.5 border-t border-[#dad3c4] bg-[#eae4d6] rounded-b-[22px] text-[11px] font-semibold text-[#525e73] text-center select-none">
          Kéo chuột Xoay bàn cờ 3D · Cuộn chuột Thu phóng · Nhấn ô đất Xem chi tiết
          {lobbyMode === 'offline' ? ' · Phím Space Đổ xúc xắc' : ''}
        </p>
      </div>
    </div>
  );
};
