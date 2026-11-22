import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { soundEngine } from './audio/soundEngine';
import { ActionDock } from './components/ActionDock';
import {
  BuyoutDecisionModal,
  ChampionshipDecisionModal,
  RulebookModal,
  StartUpgradeModal,
  TacticalCardTargetModal,
  UpgradeDecisionModal,
  WorldTourPrompt,
} from './components/BusinessTourActionModals';
import { MonopolyCanvas, MonopolyCanvasHandle } from './components/MonopolyCanvas';
import { setAvatarGraphicsTier } from './components/PlayerAvatar3D';
import { PlayerHUD } from './components/PlayerHUD';
import { StartModal } from './components/StartModal';
import {
  AssetManagementModal,
  BuyDecisionModal,
  LuckCardModal,
  PauseModal,
  TileInspectorCard,
  VictoryModal,
} from './components/TileModalAndDialogs';
import {
  BOARD_TILES,
  CHANCE_CARDS,
  DEFAULT_PLAYER_CONFIGS,
} from './game/boardData';
import {
  loadSavedCurrencyStyle,
  saveCurrencyStyle,
} from './game/currencyLogic';
import {
  detectBrowserGpu,
  loadSavedGraphicsQualityPref,
  resolveEffectiveGraphicsTier,
  saveGraphicsQualityPref,
} from './game/graphicsQuality';
import {
  applyChampionshipHost,
  applyEarthquakeToTile,
  applyPowerOutageToTile,
  applyShieldToTile,
  botChooseJailAction,
  botPickChampionshipTarget,
  botPickInitialPurchaseTier,
  botPickOnTileUpgradeTargetLevel,
  botPickStartUpgradePlan,
  botPickTacticalCardTarget,
  botPickWorldTourTarget,
  botShouldBuyoutProperty,
  botShouldBuyProperty,
  buildBotBuyQuipPayload,
  buildBotPenaltyQuipPayload,
  buildBotRentCollectedQuipPayload,
  calculateBankruptcyCreditorPayout,
  calculateRent,
  calculatePropertyInvestedValue,
  calculateTaxAmount,
  calculateTotalRealEstateValue,
  canBuyoutProperty,
  canUpgradeProperty,
  CHAMPIONSHIP_FEE,
  clearDisownedModifiers,
  clearTileOutage,
  computeOptimalAutoSale,
  computeForwardSteps,
  computePathToTile,
  createDefaultBoardModifiers,
  createInitialPlayers,
  createInitialProperties,
  evaluateMatchWinner,
  formatBusinessTourCompact,
  formatBusinessTourSpaced,
  getNextActivePlayerIndex,
  getStartUpgradableTileIndices,
  getValidTacticalCardTargets,
  isPurchasableTile,
  isValidWorldTourTarget,
  JAIL_FINE,
  LOST_ISLAND_TILE_INDEX,
  MAX_JAIL_TURNS,
  MIN_BIG_RENT_FOR_QUIP,
  parseDeterministicDiceQueue,
  resolveIslandRollOutcome,
  resolveWorldTourMovement,
  shouldGrantImmediateDoublesRoll,
  START_SALARY,
  TURN_COUNTDOWN_SECONDS,
  WORLD_TOUR_FEE,
  WORLD_TOUR_TILE_INDEX,
} from './game/rules';
import {
  BotChatBubbleState,
  BotQuipPayload,
  CurrencyStyleId,
  GameLogEntry,
  GameScreenState,
  GraphicsQualityPref,
  LuckCard,
  MatchBoardModifiers,
  MatchWinnerResult,
  PendingDebt,
  PlayerSetupConfig,
  PlayerState,
  PropertyState,
  TacticalCardActionKind,
  TileKind,
  TurnPhase,
} from './game/types';
import type { OnlineVisualEvent } from './game/onlineTypes';
import { fetchBotQuip } from './utils/botQuipClient';
import { useOnlineMultiplayer } from './utils/onlineClient';

function shuffleCards<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export default function App() {
  const { isAutostart, isDemoShowcase, isDemoEvent, initialUrlCash, initialUrlConfigs } =
    useMemo(() => {
      if (typeof window === 'undefined') {
        return {
          isAutostart: false,
          isDemoShowcase: false,
          isDemoEvent: false,
          initialUrlCash: 2_000_000,
          initialUrlConfigs: DEFAULT_PLAYER_CONFIGS,
        };
      }
      const params = new URLSearchParams(window.location.search);
      const demoShowcase = params.get('demo_showcase') === '1';
      const demoEvent = params.get('demo_event') === '1';
      const rawCash = Number(params.get('cash'));
      const urlCash =
        Number.isFinite(rawCash) && rawCash >= 10_000 ? Math.floor(rawCash) : 2_000_000;
      const pCount = Number(params.get('players'));
      const validCount =
        Number.isFinite(pCount) && pCount >= 2 && pCount <= 4 ? Math.floor(pCount) : 4;
      const hotseatAll = params.get('hotseat') === '1';
      const urlConfigs = DEFAULT_PLAYER_CONFIGS.slice(0, validCount).map((cfg, idx) =>
        hotseatAll ? { ...cfg, isBot: false, name: `Người Chơi ${idx + 1}` } : cfg
      );
      return {
        isAutostart: params.get('autostart') === '1' || demoShowcase || demoEvent,
        isDemoShowcase: demoShowcase,
        isDemoEvent: demoEvent,
        initialUrlCash: urlCash,
        initialUrlConfigs: urlConfigs,
      };
    }, []);

  const [setupConfigs, setSetupConfigs] =
    useState<PlayerSetupConfig[]>(initialUrlConfigs);
  const [startingCash, setStartingCash] = useState<number>(initialUrlCash);

  const [screenState, setScreenState] = useState<GameScreenState>(() =>
    isAutostart ? 'playing' : 'title'
  );
  const [players, setPlayers] = useState<PlayerState[]>(() => {
    const base = createInitialPlayers(initialUrlConfigs, initialUrlCash);
    if (!isDemoShowcase) return base;
    return base.map((pl, idx) => {
      if (idx === 0) return { ...pl, position: 7, cash: 2_340_000, laps: 1 };
      if (idx === 1) return { ...pl, position: 15, cash: 1_820_000, laps: 1 };
      if (idx === 2) return { ...pl, position: 23, cash: 1_590_000, laps: 1 };
      return { ...pl, position: 0, cash: 0, bankrupt: true };
    });
  });
  const [properties, setProperties] = useState<Record<number, PropertyState>>(() => {
    const base = createInitialProperties();
    if (!isDemoShowcase) return base;
    return {
      ...base,
      // Player 1 (#F5B800 Yellow/Gold): Lv4 Protected Hotel + Lv2 House
      3: { tileIndex: 3, ownerId: 0, level: 2 },
      7: { tileIndex: 7, ownerId: 0, level: 4 },
      // Player 2 (#66C61C Lime Green): Lv3 Houses + Lv1 House
      15: { tileIndex: 15, ownerId: 1, level: 1 },
      23: { tileIndex: 23, ownerId: 1, level: 3 },
      // Player 3 (#E91E63 Hot Pink): Lv4 Protected Hotel + Lv2 House
      27: { tileIndex: 27, ownerId: 2, level: 4 },
      31: { tileIndex: 31, ownerId: 2, level: 2 },
    };
  });
  const [activePlayerIndex, setActivePlayerIndex] = useState<number>(0);
  const [turnPhase, setTurnPhase] = useState<TurnPhase>(() =>
    isDemoEvent ? 'CARD_REVEAL' : 'AWAIT_ROLL'
  );
  const [turnCount, setTurnCount] = useState<number>(() => (isDemoShowcase ? 8 : 1));
  const [lastDice, setLastDice] = useState<[number, number] | null>(null);
  const [lastDiceSum, setLastDiceSum] = useState<number>(0);
  const [lastRentPaid, setLastRentPaid] = useState<number>(0);
  const [boardModifiers, setBoardModifiers] = useState<MatchBoardModifiers>(() =>
    createDefaultBoardModifiers()
  );
  const [isFreeChampionship, setIsFreeChampionship] = useState<boolean>(false);
  const [upgradeTargetTileIndex, setUpgradeTargetTileIndex] = useState<number | null>(
    null
  );
  const [pendingTacticalCard, setPendingTacticalCard] =
    useState<TacticalCardActionKind | null>(null);
  const [turnTimeLeft, setTurnTimeLeft] = useState<number>(TURN_COUNTDOWN_SECONDS);

  const [selectedTileIndex, setSelectedTileIndex] = useState<number | null>(null);
  const [showAssetsModal, setShowAssetsModal] = useState<boolean>(false);
  const [showRulebookModal, setShowRulebookModal] = useState<boolean>(false);
  const [drawnCard, setDrawnCard] = useState<LuckCard | null>(() =>
    isDemoEvent
      ? CHANCE_CARDS.find((c) => c.effect.type === 'HOST_CHAMPIONSHIP') || CHANCE_CARDS[0]
      : null
  );
  const [pendingDebt, setPendingDebt] = useState<PendingDebt | null>(null);
  const [matchWinnerResult, setMatchWinnerResult] = useState<MatchWinnerResult | null>(
    null
  );
  const [landingCueText, setLandingCueText] = useState<string | null>(null);

  const [speedMultiplier, setSpeedMultiplier] = useState<1 | 2>(1);
  const [currencyStyle, setCurrencyStyle] = useState<CurrencyStyleId>(() =>
    loadSavedCurrencyStyle()
  );
  const [graphicsQualityPref, setGraphicsQualityPref] = useState<GraphicsQualityPref>(
    () => {
      if (typeof window !== 'undefined') {
        const q = new URLSearchParams(window.location.search).get('quality');
        if (q === 'auto' || q === 'low' || q === 'medium' || q === 'high') {
          return q;
        }
      }
      return loadSavedGraphicsQualityPref();
    }
  );
  const detectedGpu = useMemo(() => detectBrowserGpu(), []);
  const effectiveQualityTier = useMemo(
    () => resolveEffectiveGraphicsTier(graphicsQualityPref, detectedGpu),
    [graphicsQualityPref, detectedGpu]
  );
  useLayoutEffect(() => {
    setAvatarGraphicsTier(effectiveQualityTier);
  }, [effectiveQualityTier]);
  const [cinematicCamera, setCinematicCamera] = useState<boolean>(false);
  const [nightMode, setNightMode] = useState<boolean>(false);
  const [soundMuted, setSoundMuted] = useState<boolean>(false);
  const [botBubbles, setBotBubbles] = useState<Record<number, BotChatBubbleState>>({});
  const [offlinePlayerEmotes, setOfflinePlayerEmotes] = useState<Record<number, string>>({});
  const [onlinePlayerEmotes, setOnlinePlayerEmotes] = useState<Record<number, string>>({});
  const [onlinePauseOpen, setOnlinePauseOpen] = useState<boolean>(false);
  const [copiedInviteToast, setCopiedInviteToast] = useState<boolean>(false);

  const [logs, setLogs] = useState<GameLogEntry[]>(() => [
    {
      id: 1,
      turn: 1,
      text: 'Chào mừng đến với Cờ Tỷ Phú Việt Nam 3D (Luật Business Tour 32 ô)! Hãy đổ xúc xắc để khởi hành.',
      tone: 'highlight',
    },
  ]);

  const canvasRef = useRef<MonopolyCanvasHandle | null>(null);
  const logIdRef = useRef<number>(2);
  const sessionEpochRef = useRef<number>(1);
  const quipSeqRef = useRef<number>(1);
  const bubbleTimersRef = useRef<Record<number, number>>({});
  const offlineEmoteTimersRef = useRef<Record<number, number>>({});
  const onlineEmoteTimersRef = useRef<Record<number, number>>({});
  const chanceDeckRef = useRef<LuckCard[]>(shuffleCards(CHANCE_CARDS));
  const diceQueueRef = useRef<Array<[number, number]>>(
    typeof window !== 'undefined'
      ? parseDeterministicDiceQueue(window.location.search)
      : []
  );
  const cardQueueRef = useRef<string[]>(
    typeof window !== 'undefined'
      ? (new URLSearchParams(window.location.search).get('cards') ?? '')
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      : []
  );

  const handleOnlineVisualEvent = useCallback((event: OnlineVisualEvent) => {
    if (event.kind === 'DICE_ROLLED') {
      soundEngine.playDiceRoll();
      void canvasRef.current?.animateDiceRoll(event.die1, event.die2, 1);
      return;
    }

    if (event.kind === 'TOKEN_MOVED') {
      void canvasRef.current?.animateTokenPath(
        event.playerId,
        event.path,
        event.speedMultiplier,
        (stepIdx) => soundEngine.playTokenHop(stepIdx)
      );
      return;
    }

    if (event.kind === 'SOUND') {
      switch (event.effect) {
        case 'cashGain':
          soundEngine.playCashGain();
          break;
        case 'cashPay':
          soundEngine.playCashPay();
          break;
        case 'buyProperty':
          soundEngine.playBuyProperty();
          break;
        case 'buildHouse':
          soundEngine.playBuildHouse(event.level ?? 1);
          break;
        case 'auctionGavel':
          soundEngine.playAuctionGavel();
          break;
        case 'cardDraw':
          soundEngine.playCardDraw();
          break;
        case 'jailAlert':
          soundEngine.playJailAlert();
          break;
        case 'victory':
          soundEngine.playVictoryFanfare();
          break;
      }
      return;
    }

    if (event.kind === 'PLAYER_EMOTE') {
      soundEngine.playChatPop();
      setOnlinePlayerEmotes((prev) => ({ ...prev, [event.playerId]: event.emoteText }));
      if (onlineEmoteTimersRef.current[event.playerId]) {
        window.clearTimeout(onlineEmoteTimersRef.current[event.playerId]);
      }
      onlineEmoteTimersRef.current[event.playerId] = window.setTimeout(() => {
        setOnlinePlayerEmotes((prev) => {
          if (prev[event.playerId] !== event.emoteText) return prev;
          const next = { ...prev };
          delete next[event.playerId];
          return next;
        });
      }, 3200);
      return;
    }

    if (event.kind === 'BOT_QUIP') {
      const reqId = event.eventSeq;
      if (event.status === 'ready') {
        soundEngine.playChatPop();
      }
      if (bubbleTimersRef.current[event.botId]) {
        window.clearTimeout(bubbleTimersRef.current[event.botId]);
        delete bubbleTimersRef.current[event.botId];
      }
      setBotBubbles((prev) => ({
        ...prev,
        [event.botId]: {
          id: reqId,
          botId: event.botId,
          eventKind: event.eventKind,
          status: event.status,
          text: event.text,
        },
      }));
      const clearDelayMs = event.status === 'ready' ? 9500 : 12000;
      bubbleTimersRef.current[event.botId] = window.setTimeout(() => {
        setBotBubbles((prev) => {
          if (prev[event.botId]?.id !== reqId) return prev;
          const next = { ...prev };
          delete next[event.botId];
          return next;
        });
      }, clearDelayMs);
    }
  }, []);

  const online = useOnlineMultiplayer(handleOnlineVisualEvent);
  const onlineMatch =
    online.roomSnapshot &&
    online.roomSnapshot.match &&
    online.roomSnapshot.status !== 'lobby'
      ? online.roomSnapshot.match
      : null;
  const isOnlineMatch = Boolean(onlineMatch);

  const viewPlayers = onlineMatch ? onlineMatch.players : players;
  const viewProperties = onlineMatch ? onlineMatch.properties : properties;
  const viewActivePlayerIndex = onlineMatch
    ? onlineMatch.activePlayerIndex
    : activePlayerIndex;
  const viewTurnPhase = onlineMatch ? onlineMatch.turnPhase : turnPhase;
  const viewTurnCount = onlineMatch ? onlineMatch.turnCount : turnCount;
  const viewLastRentPaid = onlineMatch ? onlineMatch.lastRentPaid : lastRentPaid;
  const viewBoardModifiers = onlineMatch ? onlineMatch.boardModifiers : boardModifiers;
  const viewIsFreeChampionship = onlineMatch
    ? onlineMatch.isFreeChampionship
    : isFreeChampionship;
  const [onlineDisplayTimeLeft, setOnlineDisplayTimeLeft] = useState<number>(
    TURN_COUNTDOWN_SECONDS
  );

  useEffect(() => {
    if (onlineMatch) {
      setOnlineDisplayTimeLeft(onlineMatch.turnTimeLeft);
    }
  }, [
    onlineMatch?.turnTimeLeft,
    onlineMatch?.turnPhase,
    onlineMatch?.turnCount,
    onlineMatch?.activePlayerIndex,
  ]);

  useEffect(() => {
    if (
      !isOnlineMatch ||
      !onlineMatch ||
      onlineMatch.turnPhase === 'ROLLING_DICE' ||
      onlineMatch.turnPhase === 'MOVING_TOKEN' ||
      onlineMatch.turnPhase === 'GAME_OVER'
    ) {
      return;
    }
    const interval = window.setInterval(() => {
      setOnlineDisplayTimeLeft((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => window.clearInterval(interval);
  }, [
    isOnlineMatch,
    onlineMatch?.turnPhase,
    onlineMatch?.turnCount,
    onlineMatch?.activePlayerIndex,
  ]);

  const viewTurnTimeLeft = isOnlineMatch ? onlineDisplayTimeLeft : turnTimeLeft;
  const viewDrawnCard = onlineMatch ? onlineMatch.drawnCard : drawnCard;
  const viewPendingDebt = onlineMatch ? onlineMatch.pendingDebt : pendingDebt;
  const viewMatchWinnerResult = onlineMatch
    ? onlineMatch.matchWinnerResult
    : matchWinnerResult;
  const viewLogs = onlineMatch ? onlineMatch.logs : logs;
  const viewLandingCueText = onlineMatch ? onlineMatch.landingCueText : landingCueText;
  const viewUpgradeTargetTileIndex = onlineMatch
    ? (onlineMatch.upgradeTargetTileIndex ?? null)
    : upgradeTargetTileIndex;
  const viewPendingTacticalCard = onlineMatch
    ? (onlineMatch.pendingTacticalCard ?? null)
    : pendingTacticalCard;

  const viewScreenState: GameScreenState = online.roomSnapshot
    ? online.roomSnapshot.status === 'lobby'
      ? 'title'
      : online.roomSnapshot.status === 'gameover'
        ? 'gameover'
        : onlinePauseOpen
          ? 'paused'
          : 'playing'
    : screenState;

  const viewCurrentPlayer = viewPlayers[viewActivePlayerIndex] || viewPlayers[0];
  const isActivelyControlledByMe = isOnlineMatch
    ? Boolean(
        online.yourPlayerId !== null &&
          viewCurrentPlayer &&
          viewCurrentPlayer.id === online.yourPlayerId &&
          !viewCurrentPlayer.isBot &&
          !viewCurrentPlayer.bankrupt
      )
    : Boolean(viewCurrentPlayer && !viewCurrentPlayer.isBot && !viewCurrentPlayer.bankrupt);

  const prevOnlineStatusRef = useRef<string | null>(null);
  useEffect(() => {
    const nextStatus = online.roomSnapshot?.status ?? null;
    if (nextStatus === 'playing' && prevOnlineStatusRef.current !== 'playing') {
      setSelectedTileIndex(null);
      setShowAssetsModal(false);
      setOnlinePauseOpen(false);
      setBotBubbles({});
      setOnlinePlayerEmotes({});
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
      canvasRef.current?.resetCamera();
    } else if (nextStatus === 'lobby' || nextStatus === null) {
      setOnlinePauseOpen(false);
      setShowAssetsModal(false);
      setSelectedTileIndex(null);
    }
    prevOnlineStatusRef.current = nextStatus;
  }, [online.roomSnapshot?.status]);

  const isOnlineMatchRef = useRef(isOnlineMatch);
  isOnlineMatchRef.current = isOnlineMatch;
  const isActivelyControlledByMeRef = useRef(isActivelyControlledByMe);
  isActivelyControlledByMeRef.current = isActivelyControlledByMe;
  const viewPlayersRef = useRef(viewPlayers);
  viewPlayersRef.current = viewPlayers;
  const viewPropertiesRef = useRef(viewProperties);
  viewPropertiesRef.current = viewProperties;
  const viewActiveIdxRef = useRef(viewActivePlayerIndex);
  viewActiveIdxRef.current = viewActivePlayerIndex;
  const viewTurnPhaseRef = useRef(viewTurnPhase);
  viewTurnPhaseRef.current = viewTurnPhase;
  const viewScreenStateRef = useRef(viewScreenState);
  viewScreenStateRef.current = viewScreenState;
  const viewBoardModifiersRef = useRef(viewBoardModifiers);
  viewBoardModifiersRef.current = viewBoardModifiers;
  const viewUpgradeTargetRef = useRef(viewUpgradeTargetTileIndex);
  viewUpgradeTargetRef.current = viewUpgradeTargetTileIndex;
  const viewPendingTacticalCardRef = useRef(viewPendingTacticalCard);
  viewPendingTacticalCardRef.current = viewPendingTacticalCard;
  const onlinePauseOpenRef = useRef(onlinePauseOpen);
  onlinePauseOpenRef.current = onlinePauseOpen;

  // Keep live state mirror in refs for async animation callbacks
  const playersRef = useRef(players);
  playersRef.current = players;
  const propertiesRef = useRef(properties);
  propertiesRef.current = properties;
  const boardModifiersRef = useRef(boardModifiers);
  boardModifiersRef.current = boardModifiers;
  const isFreeChampionshipRef = useRef(isFreeChampionship);
  isFreeChampionshipRef.current = isFreeChampionship;
  const upgradeTargetRef = useRef(upgradeTargetTileIndex);
  upgradeTargetRef.current = upgradeTargetTileIndex;
  const pendingTacticalCardRef = useRef(pendingTacticalCard);
  pendingTacticalCardRef.current = pendingTacticalCard;
  const drawnCardRef = useRef(drawnCard);
  drawnCardRef.current = drawnCard;
  const pendingDebtRef = useRef(pendingDebt);
  pendingDebtRef.current = pendingDebt;
  const activeIdxRef = useRef(activePlayerIndex);
  activeIdxRef.current = activePlayerIndex;
  const turnPhaseRef = useRef(turnPhase);
  turnPhaseRef.current = turnPhase;
  const screenStateRef = useRef(screenState);
  screenStateRef.current = screenState;
  const speedRef = useRef(speedMultiplier);
  speedRef.current = speedMultiplier;
  const turnCountRef = useRef(turnCount);
  turnCountRef.current = turnCount;

  const commitPlayers = useCallback(
    (updater: PlayerState[] | ((prev: PlayerState[]) => PlayerState[])): PlayerState[] => {
      const next =
        typeof updater === 'function' ? updater(playersRef.current) : updater;
      playersRef.current = next;
      setPlayers(next);
      return next;
    },
    []
  );

  const commitProperties = useCallback(
    (
      updater:
        | Record<number, PropertyState>
        | ((prev: Record<number, PropertyState>) => Record<number, PropertyState>)
    ): Record<number, PropertyState> => {
      const next =
        typeof updater === 'function' ? updater(propertiesRef.current) : updater;
      propertiesRef.current = next;
      setProperties(next);
      return next;
    },
    []
  );

  const commitBoardModifiers = useCallback(
    (
      updater:
        | MatchBoardModifiers
        | ((prev: MatchBoardModifiers) => MatchBoardModifiers)
    ): MatchBoardModifiers => {
      const next =
        typeof updater === 'function' ? updater(boardModifiersRef.current) : updater;
      boardModifiersRef.current = next;
      setBoardModifiers(next);
      return next;
    },
    []
  );

  const setFreeChampionshipFlag = useCallback((val: boolean) => {
    isFreeChampionshipRef.current = val;
    setIsFreeChampionship(val);
  }, []);

  const commitUpgradeTarget = useCallback((val: number | null) => {
    upgradeTargetRef.current = val;
    setUpgradeTargetTileIndex(val);
  }, []);

  const commitPendingTacticalCard = useCallback((val: TacticalCardActionKind | null) => {
    pendingTacticalCardRef.current = val;
    setPendingTacticalCard(val);
  }, []);

  // Sync document.body.dataset attributes for testability & state machine contract
  useEffect(() => {
    document.body.dataset.state = viewScreenState;
  }, [viewScreenState]);

  useEffect(() => {
    document.body.dataset.theme = nightMode ? 'night' : 'day';
  }, [nightMode]);

  useEffect(() => {
    document.body.dataset.cinematic = cinematicCamera ? 'on' : 'off';
  }, [cinematicCamera]);

  useEffect(() => {
    document.body.dataset.rules = 'BUSINESS_TOUR';
  }, []);

  /**
   * Pause-aware beat between movement/dice settlement and modal pop-ups so players
   * can read where the pawn landed without timers firing behind the Pause screen.
   */
  const waitGameBeat = useCallback((ms: number, epoch: number): Promise<boolean> => {
    let remaining = Math.max(120, Math.round(ms / speedRef.current));
    return new Promise((resolve) => {
      const stepMs = 60;
      const tick = () => {
        if (sessionEpochRef.current !== epoch) {
          resolve(false);
          return;
        }
        if (screenStateRef.current === 'playing' && !onlinePauseOpenRef.current) {
          remaining -= stepMs;
          if (remaining <= 0) {
            resolve(true);
            return;
          }
        }
        window.setTimeout(tick, stepMs);
      };
      window.setTimeout(tick, stepMs);
    });
  }, []);

  const handleToggleCinematic = useCallback(() => {
    setCinematicCamera((prev) => {
      const next = !prev;
      soundEngine.playAmbienceToggle(next);
      return next;
    });
  }, []);

  const handleToggleNightMode = useCallback(() => {
    setNightMode((prev) => {
      const next = !prev;
      soundEngine.playAmbienceToggle(next);
      return next;
    });
  }, []);

  const addLog = useCallback(
    (
      text: string,
      playerColor?: string,
      tone: GameLogEntry['tone'] = 'neutral'
    ) => {
      const id = logIdRef.current++;
      setLogs((prev) => [
        { id, turn: turnCountRef.current, text, playerColor, tone },
        ...prev.slice(0, 29),
      ]);
    },
    []
  );

  const checkAndTriggerMatchVictory = useCallback(
    (
      nextPlayers: PlayerState[],
      nextProps: Record<number, PropertyState>
    ): boolean => {
      const result = evaluateMatchWinner(nextPlayers, nextProps);
      if (!result) return false;

      setMatchWinnerResult(result);
      soundEngine.playVictoryFanfare();
      addLog(
        `🏆 ${result.winner.name} VÔ ĐỊCH — ${result.label}`,
        result.winner.color,
        'highlight'
      );
      setTurnPhase('GAME_OVER');
      setScreenState('gameover');
      return true;
    },
    [addLog]
  );

  /**
   * Starts the roll phase (or next-turn World Tour flight) for a player and
   * resets the 45-second per-turn clock cleanly at turn/bonus start.
   */
  const enterRollPhaseForPlayer = useCallback(
    (player: PlayerState | undefined) => {
      setTurnTimeLeft(TURN_COUNTDOWN_SECONDS);
      if (!player || player.bankrupt) {
        setTurnPhase('AWAIT_ROLL');
        return;
      }

      if (player.pendingWorldTour && !player.inJail) {
        const hasValidTarget = BOARD_TILES.some((t) =>
          isValidWorldTourTarget(player, t.index, propertiesRef.current)
        );
        if (player.cash >= WORLD_TOUR_FEE && hasValidTarget) {
          addLog(
            `✈️ ${player.name} kích hoạt vé Du Lịch Xuyên Việt — hãy chọn điểm đến trên bàn cờ (phí ${formatBusinessTourCompact(WORLD_TOUR_FEE)})!`,
            player.color,
            'highlight'
          );
          setTurnPhase('WORLD_TOUR');
          return;
        }
        commitPlayers((prev) =>
          prev.map((p) =>
            p.id === player.id ? { ...p, pendingWorldTour: false } : p
          )
        );
        addLog(
          `${player.name} không thể thực hiện Du Lịch Xuyên Việt (thiếu phí ${formatBusinessTourCompact(WORLD_TOUR_FEE)} hoặc không còn điểm đến hợp lệ).`,
          player.color,
          'neutral'
        );
      }

      setTurnPhase('AWAIT_ROLL');
    },
    [addLog, commitPlayers]
  );

  const advanceToNextPlayerOffline = useCallback(
    (currPlayers: PlayerState[] = playersRef.current) => {
      setSelectedTileIndex(null);
      setShowAssetsModal(false);
      commitUpgradeTarget(null);
      commitPendingTacticalCard(null);
      const nextIdx = getNextActivePlayerIndex(currPlayers, activeIdxRef.current);
      activeIdxRef.current = nextIdx;
      setActivePlayerIndex(nextIdx);
      turnCountRef.current += 1;
      setTurnCount(turnCountRef.current);
      enterRollPhaseForPlayer(currPlayers[nextIdx]);
    },
    [commitPendingTacticalCard, commitUpgradeTarget, enterRollPhaseForPlayer]
  );

  /**
   * Completes the current roll's tile/card/modal action per authentic Business Tour rules:
   * - Checks instant match victory first.
   * - Grants immediate bonus roll on 1st or 2nd Doubles streak (when not jailed/bankrupt).
   * - Otherwise auto-advances directly to the next active player without manual End Turn click!
   */
  const completeTurnAfterAction = useCallback(
    (overridePlayer?: PlayerState) => {
      commitUpgradeTarget(null);
      commitPendingTacticalCard(null);
      const currPlayers = playersRef.current;
      const currProps = propertiesRef.current;
      if (checkAndTriggerMatchVictory(currPlayers, currProps)) {
        return;
      }
      const activePlayer = overridePlayer ?? currPlayers[activeIdxRef.current];
      if (activePlayer && shouldGrantImmediateDoublesRoll(activePlayer)) {
        addLog(
          `🎲 ${activePlayer.name} được thưởng thêm 1 lượt đổ xúc xắc nhờ ra đôi!`,
          activePlayer.color,
          'highlight'
        );
        enterRollPhaseForPlayer(activePlayer);
        return;
      }
      advanceToNextPlayerOffline(currPlayers);
    },
    [
      addLog,
      advanceToNextPlayerOffline,
      checkAndTriggerMatchVictory,
      commitPendingTacticalCard,
      commitUpgradeTarget,
      enterRollPhaseForPlayer,
    ]
  );

  const dismissBotBubble = useCallback((botId: number) => {
    if (bubbleTimersRef.current[botId]) {
      clearTimeout(bubbleTimersRef.current[botId]);
      delete bubbleTimersRef.current[botId];
    }
    setBotBubbles((prev) => {
      if (!prev[botId]) return prev;
      const next = { ...prev };
      delete next[botId];
      return next;
    });
  }, []);

  const triggerBotQuip = useCallback(
    (payload: BotQuipPayload | null) => {
      if (!payload) return;
      const reqId = quipSeqRef.current++;
      const epoch = sessionEpochRef.current;

      if (bubbleTimersRef.current[payload.botId]) {
        clearTimeout(bubbleTimersRef.current[payload.botId]);
        delete bubbleTimersRef.current[payload.botId];
      }

      setBotBubbles((prev) => ({
        ...prev,
        [payload.botId]: {
          id: reqId,
          botId: payload.botId,
          eventKind: payload.eventKind,
          status: 'loading',
          text: 'Đang nghĩ câu bình luận...',
        },
      }));

      void fetchBotQuip(payload)
        .then((quip) => {
          if (sessionEpochRef.current !== epoch) return;
          soundEngine.playChatPop();
          setBotBubbles((prev) => {
            if (prev[payload.botId] && prev[payload.botId].id > reqId) {
              return prev;
            }
            return {
              ...prev,
              [payload.botId]: {
                id: reqId,
                botId: payload.botId,
                eventKind: payload.eventKind,
                status: 'ready',
                text: quip,
              },
            };
          });

          const botPlayer = playersRef.current.find((p) => p.id === payload.botId);
          addLog(`💬 ${payload.botName}: “${quip}”`, botPlayer?.color, 'highlight');

          bubbleTimersRef.current[payload.botId] = window.setTimeout(() => {
            setBotBubbles((prev) => {
              if (prev[payload.botId]?.id !== reqId) return prev;
              const next = { ...prev };
              delete next[payload.botId];
              return next;
            });
          }, 9500);
        })
        .catch((err: unknown) => {
          if (sessionEpochRef.current !== epoch) return;
          const msg =
            err instanceof Error
              ? err.message
              : 'Không thể kết nối máy chủ bình luận.';
          setBotBubbles((prev) => {
            if (prev[payload.botId] && prev[payload.botId].id > reqId) {
              return prev;
            }
            return {
              ...prev,
              [payload.botId]: {
                id: reqId,
                botId: payload.botId,
                eventKind: payload.eventKind,
                status: 'error',
                text: msg,
              },
            };
          });

          bubbleTimersRef.current[payload.botId] = window.setTimeout(() => {
            setBotBubbles((prev) => {
              if (prev[payload.botId]?.id !== reqId) return prev;
              const next = { ...prev };
              delete next[payload.botId];
              return next;
            });
          }, 8500);
        });
    },
    [addLog]
  );

  const startNewGame = useCallback(
    (configs: PlayerSetupConfig[], cash: number) => {
      sessionEpochRef.current += 1;
      for (const timerId of Object.values(bubbleTimersRef.current)) {
        clearTimeout(timerId);
      }
      bubbleTimersRef.current = {};
      for (const timerId of Object.values(offlineEmoteTimersRef.current)) {
        clearTimeout(timerId);
      }
      offlineEmoteTimersRef.current = {};
      setBotBubbles({});
      setOfflinePlayerEmotes({});
      setLandingCueText(null);

      setSetupConfigs(configs);
      setStartingCash(cash);

      const initPlayers = createInitialPlayers(configs, cash);
      const initProps = createInitialProperties();
      const initModifiers = createDefaultBoardModifiers();

      chanceDeckRef.current = shuffleCards(CHANCE_CARDS);

      commitPlayers(initPlayers);
      commitProperties(initProps);
      commitBoardModifiers(initModifiers);
      setFreeChampionshipFlag(false);
      commitUpgradeTarget(null);
      commitPendingTacticalCard(null);
      activeIdxRef.current = 0;
      setActivePlayerIndex(0);
      setTurnPhase('AWAIT_ROLL');
      turnCountRef.current = 1;
      setTurnCount(1);
      setLastDice(null);
      setLastDiceSum(0);
      setLastRentPaid(0);
      setTurnTimeLeft(TURN_COUNTDOWN_SECONDS);
      setSelectedTileIndex(null);
      setShowAssetsModal(false);
      setShowRulebookModal(false);
      setDrawnCard(null);
      setPendingDebt(null);
      setMatchWinnerResult(null);

      logIdRef.current = 2;
      setLogs([
        {
          id: 1,
          turn: 1,
          text: `Ván đấu bắt đầu (Luật Business Tour 32 ô) với ${initPlayers.length} tỷ phú · Ngân sách ${formatBusinessTourSpaced(cash)}!`,
          tone: 'highlight',
        },
      ]);

      document.body.dataset.state = 'playing';
      setScreenState('playing');
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
      canvasRef.current?.resetCamera();
    },
    [
      commitBoardModifiers,
      commitPendingTacticalCard,
      commitPlayers,
      commitProperties,
      commitUpgradeTarget,
      setFreeChampionshipFlag,
    ]
  );

  const drawNextCard = useCallback((): LuckCard => {
    while (cardQueueRef.current.length > 0) {
      const forcedId = cardQueueRef.current.shift()!;
      const forcedCard = CHANCE_CARDS.find(
        (c) => c.id === forcedId || c.effect.type === forcedId
      );
      if (forcedCard) return forcedCard;
    }
    if (chanceDeckRef.current.length === 0) {
      chanceDeckRef.current = shuffleCards(CHANCE_CARDS);
    }
    return chanceDeckRef.current.pop()!;
  }, []);

  /**
   * Executes authentic Business Tour player bankruptcy:
   * - If owed to an opponent (`creditorId !== null`), pays creditor `leftoverCash + 100% liquidated real estate value`.
   * - Resets all debtor properties to unowned (`ownerId: null, level: 0`) in the Bank.
   */
  const executePlayerBankruptcyOffline = useCallback(
    (player: PlayerState, creditorId: number | null, reason?: string) => {
      const currProps = propertiesRef.current;
      const totalPayout = calculateBankruptcyCreditorPayout(
        player,
        creditorId,
        currProps
      );
      const liquidatedPropertyValue = calculateTotalRealEstateValue(
        player.id,
        currProps
      );
      const creditor =
        creditorId !== null
          ? playersRef.current.find((p) => p.id === creditorId)
          : null;

      const updatedPlayers = playersRef.current.map((p) => {
        if (p.id === player.id) {
          return {
            ...p,
            cash: 0,
            bankrupt: true,
            inJail: false,
            jailTurns: 0,
            doublesStreak: 0,
            pendingWorldTour: false,
          };
        }
        if (creditorId !== null && p.id === creditorId) {
          return { ...p, cash: p.cash + totalPayout };
        }
        return p;
      });

      const nextProps: Record<number, PropertyState> = { ...currProps };
      for (const key of Object.keys(nextProps)) {
        const idx = Number(key);
        if (nextProps[idx].ownerId === player.id) {
          nextProps[idx] = {
            tileIndex: idx,
            ownerId: null,
            level: 0,
          };
        }
      }

      const nextMods = clearDisownedModifiers(boardModifiersRef.current, nextProps);
      commitPlayers(updatedPlayers);
      commitProperties(nextProps);
      commitBoardModifiers(nextMods);
      setPendingDebt(null);
      setShowAssetsModal(false);
      commitUpgradeTarget(null);
      commitPendingTacticalCard(null);
      soundEngine.playJailAlert();

      if (creditor) {
        addLog(
          `💥 ${player.name} PHÁ SẢN khi thanh toán ${reason ? `(${reason})` : 'nợ'}! ${creditor.name} nhận đền bù ${formatBusinessTourCompact(totalPayout)}${liquidatedPropertyValue > 0 ? ` (gồm thanh lý BĐS ${formatBusinessTourCompact(liquidatedPropertyValue)})` : ''}; đất trả về Ngân hàng.`,
          player.color,
          'negative'
        );
      } else {
        addLog(
          `💥 ${player.name} chính thức PHÁ SẢN${reason ? ` (${reason})` : ''}! Toàn bộ bất động sản được trả về Ngân hàng.`,
          player.color,
          'negative'
        );
      }

      if (checkAndTriggerMatchVictory(updatedPlayers, nextProps)) {
        return;
      }

      advanceToNextPlayerOffline(updatedPlayers);
    },
    [
      addLog,
      advanceToNextPlayerOffline,
      checkAndTriggerMatchVictory,
      commitBoardModifiers,
      commitPendingTacticalCard,
      commitPlayers,
      commitProperties,
      commitUpgradeTarget,
    ]
  );

  /**
   * Charges `amount` from `payerId` to `creditorId` (or Bank if null).
   * If insufficient cash:
   * - Auto-bankrupts immediately when player owns 0 properties.
   * - Otherwise enters DEBT_RESOLUTION so player/bot can liquidate properties.
   */
  const applyPaymentOrDebt = useCallback(
    (
      payerId: number,
      amount: number,
      creditorId: number | null,
      reason: string,
      options?: {
        originTileIndex?: number;
        nextPhaseOnImmediatePay?: TurnPhase;
      }
    ): boolean => {
      const currPlayers = playersRef.current;
      const payer = currPlayers.find((p) => p.id === payerId);
      if (!payer) return false;

      if (amount <= 0) {
        if (options?.nextPhaseOnImmediatePay) {
          setTurnPhase(options.nextPhaseOnImmediatePay);
        } else {
          completeTurnAfterAction(payer);
        }
        return true;
      }

      const compactAmt = formatBusinessTourCompact(amount);

      if (payer.cash >= amount) {
        const creditor =
          creditorId !== null ? currPlayers.find((p) => p.id === creditorId) : null;
        const nextPlayers = commitPlayers((prev) =>
          prev.map((p) => {
            if (p.id === payerId) return { ...p, cash: p.cash - amount };
            if (creditorId !== null && p.id === creditorId) {
              return { ...p, cash: p.cash + amount };
            }
            return p;
          })
        );
        soundEngine.playCashPay();
        if (creditor) {
          setLastRentPaid(amount);
          addLog(
            `${payer.name} trả ${compactAmt} tiền thuê (${reason}) cho ${creditor.name}.`,
            payer.color,
            'negative'
          );
          if (creditor.isBot) {
            triggerBotQuip(
              buildBotRentCollectedQuipPayload(
                { ...creditor, cash: creditor.cash + amount },
                payer.name,
                payer.position,
                amount,
                propertiesRef.current
              )
            );
          } else if (payer.isBot && amount >= MIN_BIG_RENT_FOR_QUIP) {
            triggerBotQuip(
              buildBotPenaltyQuipPayload(
                { ...payer, cash: payer.cash - amount },
                reason,
                amount,
                creditor.name
              )
            );
          }
        } else {
          addLog(
            `${payer.name} nộp ${compactAmt} (${reason}).`,
            payer.color,
            'negative'
          );
          if (payer.isBot) {
            triggerBotQuip(
              buildBotPenaltyQuipPayload(
                { ...payer, cash: payer.cash - amount },
                reason,
                amount
              )
            );
          }
        }

        const updatedPayer = nextPlayers.find((p) => p.id === payerId);
        if (options?.nextPhaseOnImmediatePay) {
          setTurnPhase(options.nextPhaseOnImmediatePay);
        } else if (
          options?.originTileIndex !== undefined &&
          creditorId !== null &&
          updatedPayer &&
          canBuyoutProperty(
            updatedPayer,
            options.originTileIndex,
            propertiesRef.current,
            boardModifiersRef.current
          ).allowed
        ) {
          setTurnTimeLeft((prev) => Math.max(prev, 18));
          setTurnPhase('BUYOUT_DECISION');
        } else {
          completeTurnAfterAction(updatedPayer);
        }
        return true;
      }

      const ownedPropertyCount = Object.values(propertiesRef.current).filter(
        (pr) => pr.ownerId === payer.id
      ).length;
      if (ownedPropertyCount === 0) {
        executePlayerBankruptcyOffline(payer, creditorId, reason);
        return false;
      }

      setSelectedTileIndex(null);
      setPendingDebt({
        amount,
        creditorId,
        reason,
        originTileIndex: options?.originTileIndex,
      });
      setTurnTimeLeft((prev) => Math.max(prev, 20));
      setTurnPhase('DEBT_RESOLUTION');
      if (!payer.isBot) {
        setShowAssetsModal(true);
      }
      addLog(
        `${payer.name} thiếu tiền mặt để trả ${compactAmt} (${reason}) — cần bán tài sản hoặc phá sản!`,
        payer.color,
        'negative'
      );
      return false;
    },
    [
      addLog,
      commitPlayers,
      completeTurnAfterAction,
      executePlayerBankruptcyOffline,
      triggerBotQuip,
    ]
  );

  /**
   * Resolves landing on `tileIndex` after token finishes hopping.
   * Implements authentic Business Tour rules across START, World Championships (0K),
   * unaffordable tile auto-skip, Outage 0K rent, Shield, and Tactical Chance cards.
   */
  const resolveTileLanding = useCallback(
    async (playerId: number, tileIndex: number, epoch: number): Promise<void> => {
      if (sessionEpochRef.current !== epoch) return;

      const tile = BOARD_TILES[tileIndex];
      const currPlayers = playersRef.current;
      const currProps = propertiesRef.current;
      const player = currPlayers.find((p) => p.id === playerId);
      if (!player || !tile) return;

      if (tile.kind === TileKind.START) {
        const upgradableCities = getStartUpgradableTileIndices(player, currProps);
        if (upgradableCities.length > 0) {
          setSelectedTileIndex(null);
          setLandingCueText('🏗️ Dừng tại Ô Bắt Đầu — Chọn thành phố để nâng cấp!');
          const okBeat = await waitGameBeat(680, epoch);
          setLandingCueText(null);
          if (!okBeat) return;
          addLog(
            `🏗️ ${player.name} dừng trực tiếp tại Ô BẮT ĐẦU — mở đặc quyền chọn thành phố sở hữu để nâng cấp!`,
            player.color,
            'highlight'
          );
          commitUpgradeTarget(null);
          setTurnTimeLeft((prev) => Math.max(prev, 18));
          setTurnPhase('START_UPGRADE_SELECTION');
          return;
        }
        completeTurnAfterAction(player);
        return;
      }

      if (tile.kind === TileKind.LOST_ISLAND) {
        soundEngine.playJailAlert();
        setSelectedTileIndex(null);
        setLandingCueText('🏝️ Dạt vào Đảo Hoang! (Bị kẹt tại đảo)');
        const okBeat = await waitGameBeat(700, epoch);
        setLandingCueText(null);
        if (!okBeat) return;

        const nextPlayers = commitPlayers((prev) =>
          prev.map((p) =>
            p.id === playerId
              ? {
                  ...p,
                  position: LOST_ISLAND_TILE_INDEX,
                  inJail: true,
                  jailTurns: 0,
                  doublesStreak: 0,
                  pendingWorldTour: false,
                }
              : p
          )
        );
        addLog(
          `🏝️ ${player.name} dạt vào Đảo Hoang — mắc kẹt tại đảo (đổ đôi, dùng Thẻ Thoát Đảo hoặc nộp ${formatBusinessTourCompact(JAIL_FINE)} để rời đảo)!`,
          player.color,
          'negative'
        );
        completeTurnAfterAction(nextPlayers.find((p) => p.id === playerId));
        return;
      }

      if (tile.kind === TileKind.WORLD_CHAMPIONSHIPS) {
        const ownsCity = Object.values(currProps).some(
          (pr) =>
            pr.ownerId === player.id &&
            BOARD_TILES[pr.tileIndex]?.kind === TileKind.PROPERTY
        );
        if (ownsCity) {
          addLog(
            `🏆 ${player.name} dừng tại ${tile.name} — đăng cai Cúp Quốc Gia miễn phí (0K) để nhân tiền thuê!`,
            player.color,
            'highlight'
          );
          setSelectedTileIndex(null);
          setLandingCueText(`🏆 ${tile.name} — Chọn thành phố đăng cai (0K)...`);
          const okBeat = await waitGameBeat(740, epoch);
          setLandingCueText(null);
          if (!okBeat) return;
          setFreeChampionshipFlag(true);
          setTurnTimeLeft((prev) => Math.max(prev, 18));
          setTurnPhase('CHAMPIONSHIP_SELECTION');
          return;
        }
        addLog(
          `${player.name} dừng tại ${tile.name} (cần sở hữu ít nhất 1 Thành phố để đăng cai Cúp Quốc Gia).`,
          player.color
        );
        completeTurnAfterAction(player);
        return;
      }

      if (tile.kind === TileKind.WORLD_TOUR) {
        soundEngine.playCardDraw();
        setSelectedTileIndex(null);
        setLandingCueText('✈️ Đặt vé Du Lịch Xuyên Việt — Kích hoạt từ lượt tới!');
        const okBeat = await waitGameBeat(700, epoch);
        setLandingCueText(null);
        if (!okBeat) return;

        const nextPlayers = commitPlayers((prev) =>
          prev.map((p) => (p.id === playerId ? { ...p, pendingWorldTour: true } : p))
        );
        addLog(
          `✈️ ${player.name} dừng tại ${tile.name} — nhận vé bay vào đầu lượt tiếp theo (phí ${formatBusinessTourCompact(WORLD_TOUR_FEE)})!`,
          player.color,
          'highlight'
        );
        completeTurnAfterAction(nextPlayers.find((p) => p.id === playerId));
        return;
      }

      if (tile.kind === TileKind.TAX) {
        const tax = calculateTaxAmount(player.id, currProps);
        if (tax <= 0) {
          addLog(
            `${player.name} dừng tại ${tile.name} nhưng chưa có bất động sản nào — miễn thuế (0K).`,
            player.color
          );
          completeTurnAfterAction(player);
          return;
        }
        setSelectedTileIndex(null);
        setLandingCueText(
          `💸 ${tile.name}: 10% BĐS (-${formatBusinessTourCompact(tax)})`
        );
        const okBeat = await waitGameBeat(680, epoch);
        setLandingCueText(null);
        if (!okBeat) return;
        applyPaymentOrDebt(player.id, tax, null, `${tile.name} (10% BĐS)`);
        return;
      }

      if (isPurchasableTile(tile)) {
        const prop = currProps[tileIndex];
        if (!prop || prop.ownerId === null) {
          const basePrice = tile.price || 0;
          if (player.cash < basePrice) {
            setSelectedTileIndex(null);
            setLandingCueText(
              `🏙️ ${tile.name} (${formatBusinessTourCompact(basePrice)}) — Không đủ tiền mua!`
            );
            const okBeat = await waitGameBeat(1050, epoch);
            setLandingCueText(null);
            if (!okBeat) return;
            addLog(
              `${player.name} dừng tại ${tile.name} (${formatBusinessTourCompact(basePrice)}) nhưng không đủ tiền mặt để mua.`,
              player.color
            );
            completeTurnAfterAction(player);
            return;
          }

          setSelectedTileIndex(null);
          setLandingCueText(
            `🏙️ ${tile.name} — Đất trống (${formatBusinessTourCompact(basePrice)})`
          );
          const okBeat = await waitGameBeat(740, epoch);
          setLandingCueText(null);
          if (!okBeat) return;
          setTurnTimeLeft((prev) => Math.max(prev, 18));
          setTurnPhase('BUY_DECISION');
          return;
        }

        if (prop.ownerId === player.id) {
          if ((boardModifiersRef.current.outageTileIndices ?? []).includes(tileIndex)) {
            commitBoardModifiers((prev) => clearTileOutage(prev, tileIndex));
            addLog(
              `⚡ Hệ thống điện tại ${tile.name} đã được khôi phục!`,
              player.color,
              'positive'
            );
          }

          const upgradeCheck = canUpgradeProperty(player, tileIndex, currProps, {
            isOnTileLanding: true,
          });
          if (upgradeCheck.allowed) {
            addLog(
              `${player.name} quay lại đô thị sở hữu ${tile.name} — mở quyền nâng cấp công trình!`,
              player.color,
              'highlight'
            );
            setSelectedTileIndex(null);
            setLandingCueText(`🏗️ Ghé thăm ${tile.name} — Nâng cấp đô thị!`);
            const okBeat = await waitGameBeat(740, epoch);
            setLandingCueText(null);
            if (!okBeat) return;
            commitUpgradeTarget(null);
            setTurnTimeLeft((prev) => Math.max(prev, 18));
            setTurnPhase('UPGRADE_DECISION');
            return;
          }
          addLog(
            tile.kind === TileKind.RESORT
              ? `${player.name} dừng nghỉ dưỡng tại khu du lịch sở hữu ${tile.name}.`
              : `${player.name} dừng tại đô thị sở hữu ${tile.name}.`,
            player.color
          );
          completeTurnAfterAction(player);
          return;
        }

        const owner = currPlayers.find((p) => p.id === prop.ownerId && !p.bankrupt);
        if (!owner) {
          completeTurnAfterAction(player);
          return;
        }

        if ((boardModifiersRef.current.outageTileIndices ?? []).includes(tileIndex)) {
          setSelectedTileIndex(null);
          setLandingCueText(
            `⚡ ${tile.name} đang mất điện — Miễn tiền thuê (0K)!`
          );
          const okBeat = await waitGameBeat(680, epoch);
          setLandingCueText(null);
          if (!okBeat) return;

          const nextMods = commitBoardModifiers((prev) =>
            clearTileOutage(prev, tileIndex)
          );
          setLastRentPaid(0);
          addLog(
            `⚡ ${tile.name} của ${owner.name} đang mất điện — ${player.name} được miễn tiền thuê (0K) và điện lưới phục hồi sau lượt này!`,
            player.color,
            'positive'
          );

          if (canBuyoutProperty(player, tileIndex, currProps, nextMods).allowed) {
            setTurnTimeLeft((prev) => Math.max(prev, 18));
            setTurnPhase('BUYOUT_DECISION');
            return;
          }
          completeTurnAfterAction(player);
          return;
        }

        const rent = calculateRent(tileIndex, currProps, boardModifiersRef.current);
        setLastRentPaid(rent);

        setSelectedTileIndex(null);
        setLandingCueText(
          `🏨 Đất của ${owner.name}: ${tile.name} (-${formatBusinessTourCompact(rent)})`
        );
        const okBeat = await waitGameBeat(740, epoch);
        setLandingCueText(null);
        if (!okBeat) return;

        applyPaymentOrDebt(player.id, rent, owner.id, tile.name, {
          originTileIndex: tileIndex,
        });
        return;
      }

      if (tile.kind === TileKind.CHANCE) {
        setSelectedTileIndex(null);
        setLandingCueText('🍀 Ô Cơ Hội — Đang rút thẻ sự kiện...');
        const okBeat = await waitGameBeat(850, epoch);
        setLandingCueText(null);
        if (!okBeat) return;

        const card = drawNextCard();
        soundEngine.playCardDraw();
        addLog(
          `${player.name} rút thẻ ${tile.name}: "${card.title}"`,
          player.color,
          'highlight'
        );
        setDrawnCard(card);
        setTurnTimeLeft((prev) => Math.max(prev, 18));
        setTurnPhase('CARD_REVEAL');
        return;
      }

      completeTurnAfterAction(player);
    },
    [
      addLog,
      applyPaymentOrDebt,
      commitBoardModifiers,
      commitPlayers,
      commitUpgradeTarget,
      completeTurnAfterAction,
      drawNextCard,
      setFreeChampionshipFlag,
      waitGameBeat,
    ]
  );

  /**
   * Executes primary Dice Roll + 3D Dice Bounce + brief dice-read pause + Token Hop sequence.
   */
  const handleRollDice = useCallback(async () => {
    if (isOnlineMatchRef.current) {
      if (
        viewScreenStateRef.current === 'playing' &&
        viewTurnPhaseRef.current === 'AWAIT_ROLL' &&
        isActivelyControlledByMeRef.current
      ) {
        online.sendGameAction({ kind: 'ROLL_DICE' });
      }
      return;
    }

    if (screenStateRef.current !== 'playing' || turnPhaseRef.current !== 'AWAIT_ROLL') {
      return;
    }

    const epoch = sessionEpochRef.current;
    const player = playersRef.current[activeIdxRef.current];
    if (!player || player.bankrupt) return;

    const queuedPair = diceQueueRef.current.shift();
    const die1 = queuedPair ? queuedPair[0] : Math.floor(Math.random() * 6) + 1;
    const die2 = queuedPair ? queuedPair[1] : Math.floor(Math.random() * 6) + 1;
    const sum = die1 + die2;
    const isDoubles = die1 === die2;

    setSelectedTileIndex(null);
    setLastDice([die1, die2]);
    setLastDiceSum(sum);
    setTurnPhase('ROLLING_DICE');
    soundEngine.playDiceRoll();

    await canvasRef.current?.animateDiceRoll(die1, die2, speedRef.current);
    if (sessionEpochRef.current !== epoch) return;

    // Brief pause after dice settle so players can clearly read the dice faces
    const okAfterDice = await waitGameBeat(450, epoch);
    if (!okAfterDice) return;

    const freshPlayer = playersRef.current[activeIdxRef.current];
    if (!freshPlayer) return;

    // 1. Lost Island Roll Handling
    let moveSteps = sum;
    if (freshPlayer.inJail) {
      const outcome = resolveIslandRollOutcome(die1, die2, freshPlayer.jailTurns);
      if (outcome.escaped) {
        addLog(
          isDoubles
            ? `${freshPlayer.name} đổ ra đôi (${die1}-${die2}), thoát khỏi Đảo Hoang và tiến ${outcome.moveSteps} bước!`
            : `${freshPlayer.name} hết ${MAX_JAIL_TURNS} lượt trên Đảo Hoang — được giải cứu miễn phí và tiến ${outcome.moveSteps} bước!`,
          freshPlayer.color,
          'positive'
        );
        commitPlayers((prev) =>
          prev.map((p) =>
            p.id === freshPlayer.id
              ? { ...p, inJail: false, jailTurns: 0, doublesStreak: 0 }
              : p
          )
        );
        moveSteps = outcome.moveSteps;
      } else {
        addLog(
          `${freshPlayer.name} đổ (${die1}-${die2}) không ra đôi, tiếp tục ở Đảo Hoang (${outcome.nextJailTurns}/${MAX_JAIL_TURNS}).`,
          freshPlayer.color
        );
        const nextPlayers = commitPlayers((prev) =>
          prev.map((p) =>
            p.id === freshPlayer.id
              ? { ...p, jailTurns: outcome.nextJailTurns, doublesStreak: 0 }
              : p
          )
        );
        const okStay = await waitGameBeat(380, epoch);
        if (!okStay) return;
        completeTurnAfterAction(nextPlayers.find((p) => p.id === freshPlayer.id));
        return;
      }
    } else {
      // 2. Standard Roll Doubles Check (3 consecutive doubles -> Lost Island)
      const nextStreak = isDoubles ? freshPlayer.doublesStreak + 1 : 0;
      if (nextStreak >= 3) {
        soundEngine.playJailAlert();
        addLog(
          `${freshPlayer.name} đổ ra đôi 3 lần liên tiếp (${die1}-${die2}) — bị đưa thẳng ra Đảo Hoang!`,
          freshPlayer.color,
          'negative'
        );
        setTurnPhase('MOVING_TOKEN');
        await canvasRef.current?.animateTokenPath(
          freshPlayer.id,
          [LOST_ISLAND_TILE_INDEX],
          speedRef.current
        );
        if (sessionEpochRef.current !== epoch) return;

        const nextPlayers = commitPlayers((prev) =>
          prev.map((p) =>
            p.id === freshPlayer.id
              ? {
                  ...p,
                  position: LOST_ISLAND_TILE_INDEX,
                  inJail: true,
                  jailTurns: 0,
                  doublesStreak: 0,
                  pendingWorldTour: false,
                }
              : p
          )
        );
        completeTurnAfterAction(nextPlayers.find((p) => p.id === freshPlayer.id));
        return;
      }

      commitPlayers((prev) =>
        prev.map((p) =>
          p.id === freshPlayer.id ? { ...p, doublesStreak: nextStreak } : p
        )
      );
      addLog(
        `${freshPlayer.name} đổ xúc xắc được ${die1} + ${die2} = ${sum}${isDoubles ? ' (Ra đôi!)' : ''}.`,
        freshPlayer.color
      );
    }

    // 3. Parabolic Hop Movement Step-by-Step
    const { path, finalTile, passedStart } = computeForwardSteps(
      freshPlayer.position,
      moveSteps
    );
    setTurnPhase('MOVING_TOKEN');

    await canvasRef.current?.animateTokenPath(
      freshPlayer.id,
      path,
      speedRef.current,
      (stepIdx) => soundEngine.playTokenHop(stepIdx)
    );
    if (sessionEpochRef.current !== epoch) return;

    commitPlayers((prev) =>
      prev.map((p) =>
        p.id === freshPlayer.id
          ? {
              ...p,
              position: finalTile,
              cash: passedStart ? p.cash + START_SALARY : p.cash,
              laps: passedStart ? p.laps + 1 : p.laps,
            }
          : p
      )
    );

    if (passedStart) {
      soundEngine.playCashGain();
      addLog(
        `${freshPlayer.name} đi qua ô BẮT ĐẦU, hoàn thành vòng mới và nhận +${formatBusinessTourCompact(START_SALARY)}!`,
        freshPlayer.color,
        'positive'
      );
    }

    await resolveTileLanding(freshPlayer.id, finalTile, epoch);
  }, [
    addLog,
    commitPlayers,
    completeTurnAfterAction,
    online.sendGameAction,
    resolveTileLanding,
    waitGameBeat,
  ]);

  const handlePayJailFine = useCallback(() => {
    if (isOnlineMatchRef.current) {
      if (isActivelyControlledByMeRef.current && viewTurnPhaseRef.current === 'AWAIT_ROLL') {
        online.sendGameAction({ kind: 'PAY_JAIL_FINE' });
      }
      return;
    }
    if (screenStateRef.current !== 'playing' || turnPhaseRef.current !== 'AWAIT_ROLL') {
      return;
    }
    const player = playersRef.current[activeIdxRef.current];
    if (!player || !player.inJail || player.cash < JAIL_FINE) return;

    soundEngine.playCashPay();
    commitPlayers((prev) =>
      prev.map((p) =>
        p.id === player.id
          ? {
              ...p,
              cash: p.cash - JAIL_FINE,
              inJail: false,
              jailTurns: 0,
              doublesStreak: 0,
            }
          : p
      )
    );
    addLog(
      `${player.name} nộp phạt ${formatBusinessTourCompact(JAIL_FINE)} để rời khỏi Đảo Hoang ngay lập tức.`,
      player.color,
      'highlight'
    );
    if (player.isBot) {
      triggerBotQuip(
        buildBotPenaltyQuipPayload(
          { ...player, cash: player.cash - JAIL_FINE },
          'Tiền chuộc rời Đảo Hoang',
          JAIL_FINE
        )
      );
    }
  }, [addLog, commitPlayers, online.sendGameAction, triggerBotQuip]);

  const handleUseJailCard = useCallback(() => {
    if (isOnlineMatchRef.current) {
      if (isActivelyControlledByMeRef.current && viewTurnPhaseRef.current === 'AWAIT_ROLL') {
        online.sendGameAction({ kind: 'USE_JAIL_CARD' });
      }
      return;
    }
    if (screenStateRef.current !== 'playing' || turnPhaseRef.current !== 'AWAIT_ROLL') {
      return;
    }
    const player = playersRef.current[activeIdxRef.current];
    if (!player || !player.inJail || player.jailFreeCards <= 0) return;

    soundEngine.playCardDraw();
    commitPlayers((prev) =>
      prev.map((p) =>
        p.id === player.id
          ? {
              ...p,
              jailFreeCards: p.jailFreeCards - 1,
              inJail: false,
              jailTurns: 0,
              doublesStreak: 0,
            }
          : p
      )
    );
    addLog(
      `${player.name} sử dụng Thẻ Thoát Đảo để rời Đảo Hoang!`,
      player.color,
      'positive'
    );
  }, [addLog, commitPlayers, online.sendGameAction]);

  const handleBuyProperty = useCallback(
    (requestedInitialLevel: number = 0) => {
      if (isOnlineMatchRef.current) {
        if (isActivelyControlledByMeRef.current && viewTurnPhaseRef.current === 'BUY_DECISION') {
          online.sendGameAction({ kind: 'BUY_PROPERTY', initialLevel: requestedInitialLevel });
        }
        return;
      }
      if (turnPhaseRef.current !== 'BUY_DECISION') return;
      const player = playersRef.current[activeIdxRef.current];
      if (!player) return;

      const tile = BOARD_TILES[player.position];
      const basePrice = tile?.price || 0;
      if (!tile) {
        completeTurnAfterAction(player);
        return;
      }

      const maxInitialLevel =
        tile.kind === TileKind.PROPERTY ? (player.laps === 0 ? 2 : 3) : 0;
      const safeLevel =
        tile.kind === TileKind.PROPERTY
          ? Math.max(0, Math.min(maxInitialLevel, Math.floor(requestedInitialLevel)))
          : 0;
      const totalCost = basePrice + safeLevel * (tile.houseCost ?? 0);

      if (player.cash < totalCost) {
        completeTurnAfterAction(player);
        return;
      }

      const nextPlayers = playersRef.current.map((p) =>
        p.id === player.id ? { ...p, cash: p.cash - totalCost } : p
      );
      const nextProps: Record<number, PropertyState> = {
        ...propertiesRef.current,
        [tile.index]: {
          tileIndex: tile.index,
          ownerId: player.id,
          level: safeLevel,
        },
      };

      if (safeLevel > 0) {
        soundEngine.playBuildHouse(safeLevel);
      } else {
        soundEngine.playBuyProperty();
      }
      commitPlayers(nextPlayers);
      commitProperties(nextProps);

      const compactCost = formatBusinessTourCompact(totalCost);
      addLog(
        safeLevel > 0
          ? `${player.name} mua ${tile.name} và xây ngay Nhà Cấp ${safeLevel} (-${compactCost})!`
          : `${player.name} mua thành công ${tile.name} với giá ${compactCost}!`,
        player.color,
        'positive'
      );

      if (player.isBot) {
        triggerBotQuip(
          buildBotBuyQuipPayload(
            { ...player, cash: player.cash - totalCost },
            tile.index,
            totalCost,
            nextProps,
            'DIRECT'
          )
        );
      }

      completeTurnAfterAction(nextPlayers.find((p) => p.id === player.id));
    },
    [addLog, commitPlayers, commitProperties, completeTurnAfterAction, online.sendGameAction, triggerBotQuip]
  );

  const handleSkipBuy = useCallback(() => {
    if (isOnlineMatchRef.current) {
      if (isActivelyControlledByMeRef.current && viewTurnPhaseRef.current === 'BUY_DECISION') {
        online.sendGameAction({ kind: 'SKIP_BUY' });
      }
      return;
    }
    if (turnPhaseRef.current !== 'BUY_DECISION') return;
    const player = playersRef.current[activeIdxRef.current];
    if (player) {
      const tile = BOARD_TILES[player.position];
      addLog(`${player.name} bỏ qua cơ hội mua ${tile.name}.`, player.color);
    }
    completeTurnAfterAction(player);
  }, [addLog, completeTurnAfterAction, online.sendGameAction]);

  const handleSelectStartUpgradeCity = useCallback(
    (targetTile: number) => {
      if (isOnlineMatchRef.current) {
        if (
          isActivelyControlledByMeRef.current &&
          viewTurnPhaseRef.current === 'START_UPGRADE_SELECTION'
        ) {
          online.sendGameAction({ kind: 'SELECT_START_UPGRADE_CITY', targetTile });
        }
        return;
      }
      if (turnPhaseRef.current !== 'START_UPGRADE_SELECTION') return;
      const player = playersRef.current[activeIdxRef.current];
      if (!player) return;

      const valid = getStartUpgradableTileIndices(player, propertiesRef.current);
      if (!valid.includes(targetTile)) return;

      commitUpgradeTarget(targetTile);
      setTurnTimeLeft((prev) => Math.max(prev, 18));
      setTurnPhase('UPGRADE_DECISION');
    },
    [commitUpgradeTarget, online.sendGameAction]
  );

  const handleSkipStartUpgrade = useCallback(() => {
    if (isOnlineMatchRef.current) {
      if (
        isActivelyControlledByMeRef.current &&
        viewTurnPhaseRef.current === 'START_UPGRADE_SELECTION'
      ) {
        online.sendGameAction({ kind: 'SKIP_START_UPGRADE' });
      }
      return;
    }
    if (turnPhaseRef.current !== 'START_UPGRADE_SELECTION') return;
    const player = playersRef.current[activeIdxRef.current];
    if (player) {
      addLog(
        `${player.name} bỏ qua đặc quyền nâng cấp thành phố tại Ô Bắt Đầu.`,
        player.color
      );
    }
    completeTurnAfterAction(player);
  }, [addLog, completeTurnAfterAction, online.sendGameAction]);

  const handleBackToStartCitySelect = useCallback(() => {
    if (isOnlineMatchRef.current) {
      if (
        isActivelyControlledByMeRef.current &&
        viewTurnPhaseRef.current === 'UPGRADE_DECISION' &&
        viewUpgradeTargetRef.current !== null
      ) {
        online.sendGameAction({ kind: 'BACK_TO_START_UPGRADE' });
      }
      return;
    }
    if (turnPhaseRef.current !== 'UPGRADE_DECISION' || upgradeTargetRef.current === null) {
      return;
    }
    commitUpgradeTarget(null);
    setTurnPhase('START_UPGRADE_SELECTION');
  }, [commitUpgradeTarget, online.sendGameAction]);

  const handleOnTileUpgrade = useCallback(
    (targetLevel: number) => {
      if (isOnlineMatchRef.current) {
        if (isActivelyControlledByMeRef.current && viewTurnPhaseRef.current === 'UPGRADE_DECISION') {
          online.sendGameAction({ kind: 'UPGRADE_PROPERTY', targetLevel });
        }
        return;
      }
      if (turnPhaseRef.current !== 'UPGRADE_DECISION') return;
      const player = playersRef.current[activeIdxRef.current];
      if (!player) return;

      const isFromStart = upgradeTargetRef.current !== null;
      const tileIndex = upgradeTargetRef.current ?? player.position;
      const check = canUpgradeProperty(player, tileIndex, propertiesRef.current, {
        isOnTileLanding: !isFromStart,
        allowRemoteFromStart: isFromStart,
        targetLevel,
      });
      if (!check.allowed) {
        completeTurnAfterAction(player);
        return;
      }

      soundEngine.playBuildHouse(targetLevel);
      const nextPlayers = commitPlayers((prev) =>
        prev.map((p) => (p.id === player.id ? { ...p, cash: p.cash - check.cost } : p))
      );
      commitProperties((prev) => ({
        ...prev,
        [tileIndex]: {
          ...prev[tileIndex],
          level: targetLevel,
        },
      }));
      commitUpgradeTarget(null);

      const tile = BOARD_TILES[tileIndex];
      const compactCost = formatBusinessTourCompact(check.cost);
      addLog(
        targetLevel === 4
          ? `${player.name} nâng cấp ${tile.name} lên KHÁCH SẠN BIỂU TƯỢNG (Cấp 4 ★ · Miễn mua đứt & chống Động đất, -${compactCost})!`
          : `${player.name} nâng cấp ${tile.name} lên Nhà Cấp ${targetLevel} (-${compactCost}).`,
        player.color,
        'positive'
      );
      completeTurnAfterAction(nextPlayers.find((p) => p.id === player.id));
    },
    [
      addLog,
      commitPlayers,
      commitProperties,
      commitUpgradeTarget,
      completeTurnAfterAction,
      online.sendGameAction,
    ]
  );

  const handleSkipOnTileUpgrade = useCallback(() => {
    if (isOnlineMatchRef.current) {
      if (isActivelyControlledByMeRef.current && viewTurnPhaseRef.current === 'UPGRADE_DECISION') {
        online.sendGameAction({ kind: 'SKIP_UPGRADE' });
      }
      return;
    }
    if (turnPhaseRef.current !== 'UPGRADE_DECISION') return;
    commitUpgradeTarget(null);
    completeTurnAfterAction();
  }, [commitUpgradeTarget, completeTurnAfterAction, online.sendGameAction]);

  const handleConfirmBuyout = useCallback(() => {
    if (isOnlineMatchRef.current) {
      if (isActivelyControlledByMeRef.current && viewTurnPhaseRef.current === 'BUYOUT_DECISION') {
        online.sendGameAction({ kind: 'CONFIRM_BUYOUT' });
      }
      return;
    }
    if (turnPhaseRef.current !== 'BUYOUT_DECISION') return;
    const buyer = playersRef.current[activeIdxRef.current];
    if (!buyer) return;

    const tileIndex = buyer.position;
    const currProps = propertiesRef.current;
    const prop = currProps[tileIndex];
    const check = canBuyoutProperty(
      buyer,
      tileIndex,
      currProps,
      boardModifiersRef.current
    );
    if (!check.allowed || !prop || prop.ownerId === null) {
      completeTurnAfterAction(buyer);
      return;
    }

    const prevOwner = playersRef.current.find((p) => p.id === prop.ownerId);
    const nextPlayers = playersRef.current.map((p) => {
      if (p.id === buyer.id) return { ...p, cash: p.cash - check.cost };
      if (p.id === prop.ownerId) return { ...p, cash: p.cash + check.cost };
      return p;
    });
    const nextProps: Record<number, PropertyState> = {
      ...currProps,
      [tileIndex]: {
        ...prop,
        ownerId: buyer.id,
      },
    };

    soundEngine.playAuctionGavel();
    commitPlayers(nextPlayers);
    commitProperties(nextProps);

    const tile = BOARD_TILES[tileIndex];
    addLog(
      `${buyer.name} chi ${formatBusinessTourCompact(check.cost)} (2×) THÂU TÓM ĐÔ THỊ ${tile.name} từ ${prevOwner?.name || 'đối thủ'}!`,
      buyer.color,
      'highlight'
    );

    const updatedBuyer = nextPlayers.find((p) => p.id === buyer.id) || buyer;
    if (updatedBuyer.isBot) {
      triggerBotQuip(
        buildBotBuyQuipPayload(
          updatedBuyer,
          tileIndex,
          check.cost,
          nextProps,
          'BUYOUT'
        )
      );
    }

    if (checkAndTriggerMatchVictory(nextPlayers, nextProps)) {
      return;
    }

    completeTurnAfterAction(updatedBuyer);
  }, [
    addLog,
    checkAndTriggerMatchVictory,
    commitPlayers,
    commitProperties,
    completeTurnAfterAction,
    online.sendGameAction,
    triggerBotQuip,
  ]);

  const handleSkipBuyout = useCallback(() => {
    if (isOnlineMatchRef.current) {
      if (isActivelyControlledByMeRef.current && viewTurnPhaseRef.current === 'BUYOUT_DECISION') {
        online.sendGameAction({ kind: 'SKIP_BUYOUT' });
      }
      return;
    }
    if (turnPhaseRef.current !== 'BUYOUT_DECISION') return;
    completeTurnAfterAction();
  }, [completeTurnAfterAction, online.sendGameAction]);

  const handleSkipChampionship = useCallback(() => {
    if (isOnlineMatchRef.current) {
      if (
        isActivelyControlledByMeRef.current &&
        viewTurnPhaseRef.current === 'CHAMPIONSHIP_SELECTION'
      ) {
        online.sendGameAction({ kind: 'SKIP_CHAMPIONSHIP' });
      }
      return;
    }
    if (turnPhaseRef.current !== 'CHAMPIONSHIP_SELECTION') return;
    const player = playersRef.current[activeIdxRef.current];
    setFreeChampionshipFlag(false);
    if (player) {
      addLog(`${player.name} bỏ qua quyền đăng cai Cúp Quốc Gia.`, player.color);
    }
    completeTurnAfterAction(player);
  }, [addLog, completeTurnAfterAction, online.sendGameAction, setFreeChampionshipFlag]);

  const handleConfirmChampionship = useCallback(
    (targetTile: number) => {
      if (isOnlineMatchRef.current) {
        if (
          isActivelyControlledByMeRef.current &&
          viewTurnPhaseRef.current === 'CHAMPIONSHIP_SELECTION'
        ) {
          online.sendGameAction({ kind: 'CONFIRM_CHAMPIONSHIP', targetTile });
        }
        return;
      }
      if (turnPhaseRef.current !== 'CHAMPIONSHIP_SELECTION') return;
      const player = playersRef.current[activeIdxRef.current];
      if (!player) return;

      const prop = propertiesRef.current[targetTile];
      const tile = BOARD_TILES[targetTile];
      const fee = isFreeChampionshipRef.current ? 0 : CHAMPIONSHIP_FEE;
      if (
        !tile ||
        tile.kind !== TileKind.PROPERTY ||
        !prop ||
        prop.ownerId !== player.id ||
        player.cash < fee
      ) {
        setFreeChampionshipFlag(false);
        completeTurnAfterAction(player);
        return;
      }

      const nextPlayers = commitPlayers((prev) =>
        prev.map((p) => (p.id === player.id ? { ...p, cash: p.cash - fee } : p))
      );
      const nextMods = commitBoardModifiers((prev) =>
        applyChampionshipHost(prev, targetTile)
      );
      setFreeChampionshipFlag(false);

      if (fee > 0) soundEngine.playCashPay();
      soundEngine.playBuildHouse(prop.level + 1);
      addLog(
        `🏆 ${player.name} đăng cai Cúp Quốc Gia tại ${tile.name} (${nextMods.championshipMultiplier}× tiền thuê${fee > 0 ? `, phí -${formatBusinessTourCompact(fee)}` : ', miễn phí'})!`,
        player.color,
        'highlight'
      );
      completeTurnAfterAction(nextPlayers.find((p) => p.id === player.id));
    },
    [
      addLog,
      commitBoardModifiers,
      commitPlayers,
      completeTurnAfterAction,
      online.sendGameAction,
      setFreeChampionshipFlag,
    ]
  );

  const handleSkipWorldTour = useCallback(() => {
    if (isOnlineMatchRef.current) {
      if (isActivelyControlledByMeRef.current && viewTurnPhaseRef.current === 'WORLD_TOUR') {
        online.sendGameAction({ kind: 'SKIP_WORLD_TOUR' });
      }
      return;
    }
    if (turnPhaseRef.current !== 'WORLD_TOUR') return;
    const player = playersRef.current[activeIdxRef.current];
    if (player) {
      commitPlayers((prev) =>
        prev.map((p) =>
          p.id === player.id ? { ...p, pendingWorldTour: false } : p
        )
      );
      addLog(
        `${player.name} bỏ qua chuyến bay Du Lịch Xuyên Việt và đổ xúc xắc như thường.`,
        player.color
      );
    }
    setTurnPhase('AWAIT_ROLL');
  }, [addLog, commitPlayers, online.sendGameAction]);

  const handleSelectWorldTourTarget = useCallback(
    async (targetTile: number) => {
      if (isOnlineMatchRef.current) {
        if (isActivelyControlledByMeRef.current && viewTurnPhaseRef.current === 'WORLD_TOUR') {
          if (targetTile === WORLD_TOUR_TILE_INDEX) {
            online.sendGameAction({ kind: 'SKIP_WORLD_TOUR' });
          } else {
            online.sendGameAction({ kind: 'SELECT_WORLD_TOUR', targetTile });
          }
        }
        return;
      }
      if (turnPhaseRef.current !== 'WORLD_TOUR') return;
      if (targetTile === WORLD_TOUR_TILE_INDEX) {
        handleSkipWorldTour();
        return;
      }

      const epoch = sessionEpochRef.current;
      const player = playersRef.current[activeIdxRef.current];
      if (!player) return;

      const hasAnyValidTarget = BOARD_TILES.some((t) =>
        isValidWorldTourTarget(player, t.index, propertiesRef.current)
      );
      if (player.cash < WORLD_TOUR_FEE || !hasAnyValidTarget) {
        commitPlayers((prev) =>
          prev.map((p) =>
            p.id === player.id ? { ...p, pendingWorldTour: false } : p
          )
        );
        setTurnPhase('AWAIT_ROLL');
        return;
      }

      if (!isValidWorldTourTarget(player, targetTile, propertiesRef.current)) {
        return;
      }

      const destTile = BOARD_TILES[targetTile];
      if (!destTile) return;

      soundEngine.playCashPay();
      const { path, passedStart, lapsDelta } = resolveWorldTourMovement(
        player.position,
        targetTile
      );

      commitPlayers((prev) =>
        prev.map((p) =>
          p.id === player.id
            ? {
                ...p,
                cash: p.cash - WORLD_TOUR_FEE,
                pendingWorldTour: false,
                doublesStreak: 0,
              }
            : p
        )
      );
      addLog(
        `✈️ ${player.name} mua vé ${formatBusinessTourCompact(WORLD_TOUR_FEE)} bay thẳng tới ${destTile.name}!`,
        player.color,
        'highlight'
      );

      setTurnPhase('MOVING_TOKEN');
      if (path.length > 0) {
        await canvasRef.current?.animateTokenPath(
          player.id,
          path,
          speedRef.current * 1.25,
          (stepIdx) => soundEngine.playTokenHop(stepIdx)
        );
      }
      if (sessionEpochRef.current !== epoch) return;

      commitPlayers((prev) =>
        prev.map((p) =>
          p.id === player.id
            ? {
                ...p,
                position: targetTile,
                cash: passedStart ? p.cash + START_SALARY * lapsDelta : p.cash,
                laps: p.laps + lapsDelta,
                pendingWorldTour: false,
                doublesStreak: 0,
              }
            : p
        )
      );

      if (passedStart && lapsDelta > 0) {
        soundEngine.playCashGain();
        addLog(
          `${player.name} bay qua ô BẮT ĐẦU, hoàn thành vòng mới và nhận +${formatBusinessTourCompact(START_SALARY * lapsDelta)}!`,
          player.color,
          'positive'
        );
      }

      await resolveTileLanding(player.id, targetTile, epoch);
    },
    [addLog, commitPlayers, handleSkipWorldTour, online.sendGameAction, resolveTileLanding]
  );

  const handleConfirmCard = useCallback(async () => {
    if (isOnlineMatchRef.current) {
      if (isActivelyControlledByMeRef.current && viewTurnPhaseRef.current === 'CARD_REVEAL') {
        online.sendGameAction({ kind: 'CONFIRM_CARD' });
      }
      return;
    }
    const card = drawnCardRef.current;
    if (turnPhaseRef.current !== 'CARD_REVEAL' || !card) return;
    const epoch = sessionEpochRef.current;
    const player = playersRef.current[activeIdxRef.current];
    drawnCardRef.current = null;
    setDrawnCard(null);
    if (!player) return;

    const eff = card.effect;
    if (eff.type === 'GAIN_CASH') {
      soundEngine.playCashGain();
      const nextPlayers = commitPlayers((prev) =>
        prev.map((p) => (p.id === player.id ? { ...p, cash: p.cash + eff.amount } : p))
      );
      addLog(
        `${player.name} nhận +${formatBusinessTourCompact(eff.amount)} (${card.title}).`,
        player.color,
        'positive'
      );
      completeTurnAfterAction(nextPlayers.find((p) => p.id === player.id));
    } else if (eff.type === 'PAY_CASH') {
      applyPaymentOrDebt(player.id, eff.amount, null, card.title);
    } else if (eff.type === 'COLLECT_FROM_ALL') {
      let collected = 0;
      const nextPlayers = commitPlayers((prev) => {
        const updated = prev.map((p) => {
          if (p.id === player.id || p.bankrupt) return p;
          const give = Math.min(Math.max(0, p.cash), eff.amountEach);
          collected += give;
          return { ...p, cash: p.cash - give };
        });
        return updated.map((p) =>
          p.id === player.id ? { ...p, cash: p.cash + collected } : p
        );
      });
      soundEngine.playCashGain();
      addLog(
        `${player.name} nhận quà mừng tổng cộng +${formatBusinessTourCompact(collected)} từ các người chơi khác!`,
        player.color,
        'positive'
      );
      completeTurnAfterAction(nextPlayers.find((p) => p.id === player.id));
    } else if (eff.type === 'JAIL_FREE_CARD') {
      const nextPlayers = commitPlayers((prev) =>
        prev.map((p) =>
          p.id === player.id ? { ...p, jailFreeCards: p.jailFreeCards + 1 } : p
        )
      );
      addLog(
        `${player.name} cất giữ 1 Thẻ Thoát Đảo.`,
        player.color,
        'positive'
      );
      completeTurnAfterAction(nextPlayers.find((p) => p.id === player.id));
    } else if (eff.type === 'GO_TO_JAIL') {
      soundEngine.playJailAlert();
      setTurnPhase('MOVING_TOKEN');
      await canvasRef.current?.animateTokenPath(
        player.id,
        [LOST_ISLAND_TILE_INDEX],
        speedRef.current
      );
      if (sessionEpochRef.current !== epoch) return;
      const nextPlayers = commitPlayers((prev) =>
        prev.map((p) =>
          p.id === player.id
            ? {
                ...p,
                position: LOST_ISLAND_TILE_INDEX,
                inJail: true,
                jailTurns: 0,
                doublesStreak: 0,
                pendingWorldTour: false,
              }
            : p
        )
      );
      completeTurnAfterAction(nextPlayers.find((p) => p.id === player.id));
    } else if (eff.type === 'MOVE_TO') {
      const { path, passedStart } = computePathToTile(
        player.position,
        eff.targetTile,
        eff.collectStart
      );
      setTurnPhase('MOVING_TOKEN');
      if (path.length > 0) {
        await canvasRef.current?.animateTokenPath(
          player.id,
          path,
          speedRef.current,
          (stepIdx) => soundEngine.playTokenHop(stepIdx)
        );
      }
      if (sessionEpochRef.current !== epoch) return;
      commitPlayers((prev) =>
        prev.map((p) =>
          p.id === player.id
            ? {
                ...p,
                position: eff.targetTile,
                cash: passedStart ? p.cash + START_SALARY : p.cash,
                laps: passedStart ? p.laps + 1 : p.laps,
              }
            : p
        )
      );
      if (passedStart) {
        soundEngine.playCashGain();
        addLog(
          `${player.name} đi qua ô BẮT ĐẦU, hoàn thành vòng mới và nhận +${formatBusinessTourCompact(START_SALARY)}!`,
          player.color,
          'positive'
        );
      }
      await resolveTileLanding(player.id, eff.targetTile, epoch);
    } else if (eff.type === 'HOST_CHAMPIONSHIP') {
      const ownsCity = Object.values(propertiesRef.current).some(
        (pr) =>
          pr.ownerId === player.id &&
          BOARD_TILES[pr.tileIndex]?.kind === TileKind.PROPERTY
      );
      if (!ownsCity) {
        addLog(
          `${player.name} rút được "${card.title}" nhưng chưa sở hữu Thành phố nào để đăng cai.`,
          player.color
        );
        completeTurnAfterAction(player);
        return;
      }
      setFreeChampionshipFlag(true);
      setTurnTimeLeft((prev) => Math.max(prev, 18));
      setTurnPhase('CHAMPIONSHIP_SELECTION');
    } else if (
      eff.type === 'EARTHQUAKE' ||
      eff.type === 'POWER_OUTAGE' ||
      eff.type === 'SHIELD_CITY'
    ) {
      const validTargets = getValidTacticalCardTargets(
        eff.type,
        player.id,
        propertiesRef.current,
        boardModifiersRef.current
      );
      if (validTargets.length === 0) {
        addLog(
          `${player.name} rút thẻ "${card.title}" nhưng hiện chưa có đô thị mục tiêu hợp lệ trên bàn cờ.`,
          player.color
        );
        completeTurnAfterAction(player);
        return;
      }
      commitPendingTacticalCard(eff.type);
      setTurnTimeLeft((prev) => Math.max(prev, 18));
      setTurnPhase('CARD_TARGET_SELECTION');
    } else if (eff.type === 'GO_TO_WORLD_TOUR') {
      const { path, passedStart } = computePathToTile(
        player.position,
        WORLD_TOUR_TILE_INDEX,
        true
      );
      setTurnPhase('MOVING_TOKEN');
      if (path.length > 0) {
        await canvasRef.current?.animateTokenPath(
          player.id,
          path,
          speedRef.current,
          (stepIdx) => soundEngine.playTokenHop(stepIdx)
        );
      }
      if (sessionEpochRef.current !== epoch) return;
      commitPlayers((prev) =>
        prev.map((p) =>
          p.id === player.id
            ? {
                ...p,
                position: WORLD_TOUR_TILE_INDEX,
                cash: passedStart ? p.cash + START_SALARY : p.cash,
                laps: passedStart ? p.laps + 1 : p.laps,
              }
            : p
        )
      );
      if (passedStart) {
        soundEngine.playCashGain();
        addLog(
          `${player.name} đi qua ô BẮT ĐẦU, hoàn thành vòng mới và nhận +${formatBusinessTourCompact(START_SALARY)}!`,
          player.color,
          'positive'
        );
      }
      await resolveTileLanding(player.id, WORLD_TOUR_TILE_INDEX, epoch);
    }
  }, [
    addLog,
    applyPaymentOrDebt,
    commitPendingTacticalCard,
    commitPlayers,
    completeTurnAfterAction,
    drawnCard,
    online.sendGameAction,
    resolveTileLanding,
    setFreeChampionshipFlag,
  ]);

  const handleApplyTacticalCard = useCallback(
    (targetTile: number) => {
      if (isOnlineMatchRef.current) {
        if (
          isActivelyControlledByMeRef.current &&
          viewTurnPhaseRef.current === 'CARD_TARGET_SELECTION'
        ) {
          online.sendGameAction({ kind: 'APPLY_TACTICAL_CARD', targetTile });
        }
        return;
      }
      if (turnPhaseRef.current !== 'CARD_TARGET_SELECTION') return;
      const kind = pendingTacticalCardRef.current;
      const player = playersRef.current[activeIdxRef.current];
      if (!kind || !player) return;

      const valid = getValidTacticalCardTargets(
        kind,
        player.id,
        propertiesRef.current,
        boardModifiersRef.current
      );
      if (!valid.includes(targetTile)) return;

      const tile = BOARD_TILES[targetTile];
      const prevLevel = propertiesRef.current[targetTile]?.level ?? 0;
      if (kind === 'EARTHQUAKE') {
        const res = applyEarthquakeToTile(
          targetTile,
          propertiesRef.current,
          boardModifiersRef.current
        );
        commitProperties(res.nextProperties);
        commitBoardModifiers(res.nextModifiers);
        if (res.blockedByShield) {
          soundEngine.playBuildHouse(2);
          addLog(
            `🛡️ Khiên Bảo Hộ tại ${tile.name} đã hấp thụ hoàn toàn cơn Địa Chấn của ${player.name}!`,
            player.color,
            'highlight'
          );
        } else if (res.destroyedToBank) {
          soundEngine.playJailAlert();
          addLog(
            `🌋 ĐỊA CHẤN! ${player.name} san phẳng ${tile.name} — mảnh đất sụp đổ trả về Ngân hàng!`,
            player.color,
            'highlight'
          );
        } else {
          soundEngine.playJailAlert();
          addLog(
            `🌋 ĐỊA CHẤN! ${player.name} làm ${tile.name} giảm từ Nhà Cấp ${prevLevel} xuống ${res.newLevel === 0 ? 'Đất trống' : `Nhà Cấp ${res.newLevel}`}!`,
            player.color,
            'highlight'
          );
        }
      } else if (kind === 'POWER_OUTAGE') {
        const res = applyPowerOutageToTile(
          targetTile,
          propertiesRef.current,
          boardModifiersRef.current
        );
        commitBoardModifiers(res.nextModifiers);
        if (res.blockedByShield) {
          soundEngine.playBuildHouse(2);
          addLog(
            `🛡️ Khiên Bảo Hộ tại ${tile.name} đã chặn đứng sự cố Mất Điện từ ${player.name}!`,
            player.color,
            'highlight'
          );
        } else {
          soundEngine.playJailAlert();
          addLog(
            `⚡ CẮT ĐIỆN! ${player.name} làm ${tile.name} tê liệt điện lưới — miễn phí thuê (0K) cho lượt khách ghé thăm tiếp theo!`,
            player.color,
            'highlight'
          );
        }
      } else if (kind === 'SHIELD_CITY') {
        const nextMods = applyShieldToTile(targetTile, boardModifiersRef.current);
        commitBoardModifiers(nextMods);
        soundEngine.playBuildHouse(3);
        addLog(
          `🛡️ ${player.name} dựng Khiên Bảo Hộ cho ${tile.name} (chống Mua đứt 2× & chặn 1 đòn phá hoại)!`,
          player.color,
          'positive'
        );
      }

      commitPendingTacticalCard(null);
      completeTurnAfterAction(player);
    },
    [
      addLog,
      commitBoardModifiers,
      commitPendingTacticalCard,
      commitProperties,
      completeTurnAfterAction,
      online.sendGameAction,
    ]
  );

  const handleSkipTacticalCard = useCallback(() => {
    if (isOnlineMatchRef.current) {
      if (
        isActivelyControlledByMeRef.current &&
        viewTurnPhaseRef.current === 'CARD_TARGET_SELECTION'
      ) {
        online.sendGameAction({ kind: 'SKIP_TACTICAL_CARD' });
      }
      return;
    }
    if (turnPhaseRef.current !== 'CARD_TARGET_SELECTION') return;
    const player = playersRef.current[activeIdxRef.current];
    commitPendingTacticalCard(null);
    if (player) {
      addLog(`${player.name} bỏ qua việc sử dụng thẻ chiến thuật.`, player.color);
    }
    completeTurnAfterAction(player);
  }, [addLog, commitPendingTacticalCard, completeTurnAfterAction, online.sendGameAction]);

  const handleExecuteDebtSaleAndPay = useCallback(
    (tileIndicesToSell: number[]) => {
      if (isOnlineMatchRef.current) {
        if (isActivelyControlledByMeRef.current && viewTurnPhaseRef.current === 'DEBT_RESOLUTION') {
          online.sendGameAction({ kind: 'SELL_AND_PAY_DEBT', tileIndicesToSell });
        }
        return;
      }
      const activeDebt = pendingDebtRef.current;
      if (turnPhaseRef.current !== 'DEBT_RESOLUTION' || !activeDebt) return;
      const player = playersRef.current[activeIdxRef.current];
      if (!player) return;

      const uniqueTiles = Array.from(new Set(tileIndicesToSell));
      const currProps = propertiesRef.current;
      const nextProps: Record<number, PropertyState> = { ...currProps };
      let totalRefund = 0;
      let soldCount = 0;

      for (const tileIdx of uniqueTiles) {
        const prop = nextProps[tileIdx];
        if (!prop || prop.ownerId !== player.id) continue;
        totalRefund += calculatePropertyInvestedValue(tileIdx, prop.level);
        nextProps[tileIdx] = {
          tileIndex: tileIdx,
          ownerId: null,
          level: 0,
        };
        soldCount += 1;
      }

      const { amount, creditorId, reason, originTileIndex } = activeDebt;
      const availableCash = Math.max(0, player.cash) + totalRefund;
      if (availableCash < amount) return;

      const updatedPayerCash = availableCash - amount;
      const creditor =
        creditorId !== null ? playersRef.current.find((p) => p.id === creditorId) : null;

      const nextPlayers = commitPlayers((prev) =>
        prev.map((p) => {
          if (p.id === player.id) return { ...p, cash: updatedPayerCash };
          if (creditorId !== null && p.id === creditorId) {
            return { ...p, cash: p.cash + amount };
          }
          return p;
        })
      );
      commitProperties(nextProps);
      const nextMods = clearDisownedModifiers(boardModifiersRef.current, nextProps);
      commitBoardModifiers(nextMods);

      soundEngine.playCashPay();
      if (soldCount > 0) {
        addLog(
          `${player.name} bán ${soldCount} bất động sản cho Ngân hàng (+${formatBusinessTourCompact(totalRefund)} hoàn trả 100%) và thanh toán đủ ${formatBusinessTourCompact(amount)} (${reason})!`,
          player.color,
          'positive'
        );
      } else {
        addLog(
          `${player.name} đã thanh toán đủ khoản nợ ${formatBusinessTourCompact(amount)} (${reason})!`,
          player.color,
          'positive'
        );
      }

      if (creditor && creditor.isBot) {
        triggerBotQuip(
          buildBotRentCollectedQuipPayload(
            { ...creditor, cash: creditor.cash + amount },
            player.name,
            player.position,
            amount,
            nextProps
          )
        );
      } else if (player.isBot && amount >= MIN_BIG_RENT_FOR_QUIP) {
        triggerBotQuip(
          buildBotPenaltyQuipPayload(
            { ...player, cash: updatedPayerCash },
            reason,
            amount,
            creditor?.name
          )
        );
      }

      pendingDebtRef.current = null;
      setPendingDebt(null);
      setShowAssetsModal(false);

      if (checkAndTriggerMatchVictory(nextPlayers, nextProps)) {
        return;
      }

      const updatedPayer = nextPlayers.find((p) => p.id === player.id);
      if (
        originTileIndex !== undefined &&
        creditorId !== null &&
        updatedPayer &&
        canBuyoutProperty(updatedPayer, originTileIndex, nextProps, nextMods).allowed
      ) {
        setTurnTimeLeft((prev) => Math.max(prev, 18));
        setTurnPhase('BUYOUT_DECISION');
        return;
      }

      completeTurnAfterAction(updatedPayer);
    },
    [
      addLog,
      checkAndTriggerMatchVictory,
      commitBoardModifiers,
      commitPlayers,
      commitProperties,
      completeTurnAfterAction,
      online.sendGameAction,
      triggerBotQuip,
    ]
  );

  const handleDeclareBankruptcy = useCallback(() => {
    if (isOnlineMatchRef.current) {
      if (isActivelyControlledByMeRef.current && viewTurnPhaseRef.current === 'DEBT_RESOLUTION') {
        online.sendGameAction({ kind: 'DECLARE_BANKRUPTCY' });
      }
      return;
    }
    if (turnPhaseRef.current !== 'DEBT_RESOLUTION') return;
    const player = playersRef.current[activeIdxRef.current];
    if (!player) return;

    const activeDebt = pendingDebtRef.current;
    executePlayerBankruptcyOffline(
      player,
      activeDebt?.creditorId ?? null,
      activeDebt?.reason
    );
  }, [executePlayerBankruptcyOffline, online.sendGameAction]);

  const handleEndTurn = useCallback(() => {
    if (isOnlineMatchRef.current) {
      if (isActivelyControlledByMeRef.current && viewTurnPhaseRef.current === 'AWAIT_END_TURN') {
        online.sendGameAction({ kind: 'END_TURN' });
      }
      return;
    }
    if (turnPhaseRef.current !== 'AWAIT_END_TURN') return;
    completeTurnAfterAction();
  }, [completeTurnAfterAction, online.sendGameAction]);

  /* ==========================================
   * SMART BOT AI AUTOMATED TURN CHOREOGRAPHY
   * (Relaxed pacing + generous 3.6s reading window on CARD_REVEAL)
   * ========================================== */
  useEffect(() => {
    if (isOnlineMatch || screenState !== 'playing') return;
    const current = players[activePlayerIndex];
    if (!current || !current.isBot || current.bankrupt) return;

    let timer = 0;

    if (turnPhase === 'AWAIT_ROLL') {
      timer = window.setTimeout(() => {
        if (current.inJail) {
          const decision = botChooseJailAction(current);
          if (decision === 'USE_CARD') {
            handleUseJailCard();
            return;
          }
          if (decision === 'PAY_FINE') {
            handlePayJailFine();
            return;
          }
        }
        void handleRollDice();
      }, Math.round(1450 / speedMultiplier));
    } else if (turnPhase === 'BUY_DECISION') {
      timer = window.setTimeout(() => {
        if (botShouldBuyProperty(current, current.position, players, properties)) {
          const tier = botPickInitialPurchaseTier(
            current,
            current.position,
            properties
          );
          handleBuyProperty(tier);
        } else {
          handleSkipBuy();
        }
      }, Math.round(1500 / speedMultiplier));
    } else if (turnPhase === 'START_UPGRADE_SELECTION') {
      timer = window.setTimeout(() => {
        const plan = botPickStartUpgradePlan(current, properties, boardModifiers);
        if (plan) {
          handleSelectStartUpgradeCity(plan.tileIndex);
        } else {
          handleSkipStartUpgrade();
        }
      }, Math.round(1250 / speedMultiplier));
    } else if (turnPhase === 'UPGRADE_DECISION') {
      timer = window.setTimeout(() => {
        const upgTile = upgradeTargetTileIndex ?? current.position;
        let targetLvl: number | null = null;
        if (upgradeTargetTileIndex !== null) {
          const prop = properties[upgTile];
          if (prop && prop.ownerId === current.id) {
            for (let lvl = 4; lvl > prop.level; lvl--) {
              const chk = canUpgradeProperty(current, upgTile, properties, {
                allowRemoteFromStart: true,
                targetLevel: lvl,
              });
              const minReserve = lvl === 4 ? 180_000 : 300_000;
              if (chk.allowed && current.cash - chk.cost >= minReserve) {
                targetLvl = lvl;
                break;
              }
            }
          }
        } else {
          targetLvl = botPickOnTileUpgradeTargetLevel(
            current,
            upgTile,
            properties
          );
        }
        if (targetLvl !== null) {
          handleOnTileUpgrade(targetLvl);
        } else {
          handleSkipOnTileUpgrade();
        }
      }, Math.round(1300 / speedMultiplier));
    } else if (turnPhase === 'BUYOUT_DECISION') {
      timer = window.setTimeout(() => {
        if (
          botShouldBuyoutProperty(
            current,
            current.position,
            players,
            properties,
            boardModifiers
          )
        ) {
          handleConfirmBuyout();
        } else {
          handleSkipBuyout();
        }
      }, Math.round(1450 / speedMultiplier));
    } else if (turnPhase === 'CHAMPIONSHIP_SELECTION') {
      timer = window.setTimeout(() => {
        const target = botPickChampionshipTarget(
          current,
          properties,
          boardModifiers,
          isFreeChampionship
        );
        if (target !== null) {
          handleConfirmChampionship(target);
        } else {
          handleSkipChampionship();
        }
      }, Math.round(1350 / speedMultiplier));
    } else if (turnPhase === 'WORLD_TOUR') {
      timer = window.setTimeout(() => {
        const dest = botPickWorldTourTarget(
          current,
          properties,
          boardModifiers,
          players
        );
        if (dest !== null) {
          void handleSelectWorldTourTarget(dest);
        } else {
          handleSkipWorldTour();
        }
      }, Math.round(1450 / speedMultiplier));
    } else if (turnPhase === 'CARD_REVEAL') {
      timer = window.setTimeout(() => {
        void handleConfirmCard();
      }, Math.round(2400 / speedMultiplier));
    } else if (turnPhase === 'CARD_TARGET_SELECTION') {
      timer = window.setTimeout(() => {
        if (!pendingTacticalCard) {
          handleSkipTacticalCard();
          return;
        }
        const target = botPickTacticalCardTarget(
          pendingTacticalCard,
          current,
          players,
          properties,
          boardModifiers
        );
        if (target !== null) {
          handleApplyTacticalCard(target);
        } else {
          handleSkipTacticalCard();
        }
      }, Math.round(1300 / speedMultiplier));
    } else if (turnPhase === 'DEBT_RESOLUTION') {
      timer = window.setTimeout(() => {
        if (!pendingDebt) return;
        const cashNeeded = Math.max(0, pendingDebt.amount - Math.max(0, current.cash));
        if (cashNeeded === 0) {
          handleExecuteDebtSaleAndPay([]);
          return;
        }
        const plan = computeOptimalAutoSale(
          current.id,
          cashNeeded,
          properties,
          boardModifiers
        );
        if (!plan.sufficient) {
          handleDeclareBankruptcy();
        } else {
          handleExecuteDebtSaleAndPay(plan.tileIndicesToSell);
        }
      }, Math.round(1100 / speedMultiplier));
    } else if (turnPhase === 'AWAIT_END_TURN') {
      timer = window.setTimeout(() => {
        handleEndTurn();
      }, Math.round(1350 / speedMultiplier));
    }

    return () => clearTimeout(timer);
  }, [
    isOnlineMatch,
    screenState,
    players,
    properties,
    boardModifiers,
    isFreeChampionship,
    upgradeTargetTileIndex,
    pendingTacticalCard,
    activePlayerIndex,
    turnPhase,
    speedMultiplier,
    pendingDebt,
    handleRollDice,
    handleUseJailCard,
    handlePayJailFine,
    handleBuyProperty,
    handleSkipBuy,
    handleSelectStartUpgradeCity,
    handleSkipStartUpgrade,
    handleOnTileUpgrade,
    handleSkipOnTileUpgrade,
    handleConfirmBuyout,
    handleSkipBuyout,
    handleConfirmChampionship,
    handleSkipChampionship,
    handleSelectWorldTourTarget,
    handleSkipWorldTour,
    handleConfirmCard,
    handleApplyTacticalCard,
    handleSkipTacticalCard,
    handleExecuteDebtSaleAndPay,
    handleDeclareBankruptcy,
    handleEndTurn,
  ]);

  /* ==========================================
   * BUSINESS TOUR 3D TURN COUNTDOWN CLOCK (45s / turn)
   * ========================================== */
  useEffect(() => {
    if (
      isOnlineMatch ||
      screenState !== 'playing' ||
      showRulebookModal ||
      turnPhase === 'ROLLING_DICE' ||
      turnPhase === 'MOVING_TOKEN' ||
      turnPhase === 'GAME_OVER'
    ) {
      return;
    }

    const interval = window.setInterval(() => {
      setTurnTimeLeft((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);

    return () => clearInterval(interval);
  }, [isOnlineMatch, screenState, showRulebookModal, turnPhase]);

  useEffect(() => {
    if (isOnlineMatch || screenState !== 'playing' || turnTimeLeft > 0) return;
    const current = playersRef.current[activeIdxRef.current];
    if (!current || current.isBot || current.bankrupt) return;

    if (turnPhase === 'AWAIT_ROLL') {
      setTurnTimeLeft(15);
      void handleRollDice();
    } else if (turnPhase === 'BUY_DECISION') {
      handleSkipBuy();
    } else if (turnPhase === 'START_UPGRADE_SELECTION') {
      handleSkipStartUpgrade();
    } else if (turnPhase === 'UPGRADE_DECISION') {
      handleSkipOnTileUpgrade();
    } else if (turnPhase === 'BUYOUT_DECISION') {
      handleSkipBuyout();
    } else if (turnPhase === 'CHAMPIONSHIP_SELECTION') {
      handleSkipChampionship();
    } else if (turnPhase === 'WORLD_TOUR') {
      setTurnTimeLeft(15);
      handleSkipWorldTour();
    } else if (turnPhase === 'CARD_REVEAL') {
      setTurnTimeLeft(15);
      void handleConfirmCard();
    } else if (turnPhase === 'CARD_TARGET_SELECTION') {
      handleSkipTacticalCard();
    } else if (turnPhase === 'DEBT_RESOLUTION') {
      if (!pendingDebt) return;
      const cashNeeded = Math.max(0, pendingDebt.amount - Math.max(0, current.cash));
      const plan = computeOptimalAutoSale(
        current.id,
        cashNeeded,
        propertiesRef.current,
        boardModifiersRef.current
      );
      if (!plan.sufficient) {
        handleDeclareBankruptcy();
      } else {
        setTurnTimeLeft(15);
        handleExecuteDebtSaleAndPay(plan.tileIndicesToSell);
      }
    } else if (turnPhase === 'AWAIT_END_TURN') {
      setShowAssetsModal(false);
      setSelectedTileIndex(null);
      handleEndTurn();
    }
  }, [
    isOnlineMatch,
    screenState,
    turnTimeLeft,
    turnPhase,
    pendingDebt,
    handleRollDice,
    handleSkipBuy,
    handleSkipStartUpgrade,
    handleSkipOnTileUpgrade,
    handleSkipBuyout,
    handleSkipChampionship,
    handleSkipWorldTour,
    handleConfirmCard,
    handleSkipTacticalCard,
    handleExecuteDebtSaleAndPay,
    handleDeclareBankruptcy,
    handleEndTurn,
  ]);

  /* ==========================================
   * KEYBOARD SHORTCUTS & INPUT HYGIENE
   * ========================================== */
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) {
        return;
      }

      if (showRulebookModal) {
        if (e.code === 'Escape') {
          setShowRulebookModal(false);
        }
        return;
      }

      if (viewScreenState === 'title') {
        if (
          (e.code === 'Enter' || e.code === 'Space') &&
          !online.roomSnapshot &&
          !document.querySelector('[data-testid="bt-create-room-btn"]')
        ) {
          e.preventDefault();
          startNewGame(setupConfigs, startingCash);
        }
        return;
      }

      if (e.code === 'Escape' || e.code === 'KeyP') {
        if (selectedTileIndex !== null) {
          setSelectedTileIndex(null);
          return;
        }
        if (showAssetsModal && !viewPendingDebt) {
          setShowAssetsModal(false);
          return;
        }
        if (isOnlineMatchRef.current) {
          if (viewScreenState === 'playing') {
            setOnlinePauseOpen(true);
          } else if (viewScreenState === 'paused') {
            setOnlinePauseOpen(false);
          }
          return;
        }
        if (screenState === 'playing') {
          setScreenState('paused');
        } else if (screenState === 'paused') {
          setScreenState('playing');
        }
        return;
      }

      if (viewScreenState !== 'playing') return;

      if (e.code === 'KeyR') {
        canvasRef.current?.resetCamera();
      } else if (e.code === 'KeyC') {
        handleToggleCinematic();
      } else if (e.code === 'KeyN') {
        handleToggleNightMode();
      } else if (e.code === 'KeyM') {
        setSoundMuted((prev) => {
          const next = !prev;
          soundEngine.setMuted(next);
          return next;
        });
      } else if (e.code === 'Space' || e.code === 'Enter') {
        if (isActivelyControlledByMeRef.current) {
          if (e.code === 'Space' && viewTurnPhaseRef.current === 'AWAIT_ROLL') {
            e.preventDefault();
            void handleRollDice();
          } else if (viewTurnPhaseRef.current === 'CARD_REVEAL') {
            e.preventDefault();
            void handleConfirmCard();
          } else if (e.code === 'Space' && viewTurnPhaseRef.current === 'AWAIT_END_TURN') {
            e.preventDefault();
            handleEndTurn();
          }
        }
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    viewScreenState,
    screenState,
    online.roomSnapshot,
    setupConfigs,
    startingCash,
    selectedTileIndex,
    showAssetsModal,
    showRulebookModal,
    viewPendingDebt,
    startNewGame,
    handleRollDice,
    handleConfirmCard,
    handleEndTurn,
    handleToggleCinematic,
    handleToggleNightMode,
  ]);

  const currentPlayer = viewCurrentPlayer;
  const computedWinner = useMemo(
    () => viewMatchWinnerResult || evaluateMatchWinner(viewPlayers, viewProperties),
    [viewMatchWinnerResult, viewPlayers, viewProperties]
  );

  const ownedCount = useMemo(() => {
    if (!currentPlayer) return 0;
    let owned = 0;
    for (const pr of Object.values(viewProperties)) {
      if (pr.ownerId === currentPlayer.id) {
        owned += 1;
      }
    }
    return owned;
  }, [currentPlayer, viewProperties]);

  const buyoutOwner = useMemo(() => {
    if (viewTurnPhase !== 'BUYOUT_DECISION' || !currentPlayer) return null;
    const ownerId = viewProperties[currentPlayer.position]?.ownerId;
    if (ownerId === null || ownerId === undefined) return null;
    return viewPlayers.find((p) => p.id === ownerId) || null;
  }, [currentPlayer, viewPlayers, viewProperties, viewTurnPhase]);

  const handleTriggerEmote = useCallback(
    (emoteText: string) => {
      if (isOnlineMatchRef.current) {
        online.sendEmote(emoteText);
        return;
      }
      const activeP = playersRef.current[activeIdxRef.current];
      const humanActor =
        (activeP && !activeP.isBot ? activeP : null) ||
        playersRef.current.find((p) => !p.isBot && !p.bankrupt) ||
        playersRef.current[0];
      if (!humanActor) return;

      soundEngine.playChatPop();
      setOfflinePlayerEmotes((prev) => ({ ...prev, [humanActor.id]: emoteText }));
      if (offlineEmoteTimersRef.current[humanActor.id]) {
        window.clearTimeout(offlineEmoteTimersRef.current[humanActor.id]);
      }
      offlineEmoteTimersRef.current[humanActor.id] = window.setTimeout(() => {
        setOfflinePlayerEmotes((prev) => {
          if (prev[humanActor.id] !== emoteText) return prev;
          const next = { ...prev };
          delete next[humanActor.id];
          return next;
        });
      }, 3200);
    },
    [online.sendEmote]
  );

  const activeSpeechText = useMemo(() => {
    if (viewScreenState !== 'playing' || !currentPlayer) return null;
    if (viewLandingCueText) return viewLandingCueText;
    if (
      viewTurnPhase === 'CARD_REVEAL' ||
      viewTurnPhase === 'DEBT_RESOLUTION' ||
      showAssetsModal ||
      showRulebookModal
    ) {
      return null;
    }
    const activeEmote = isOnlineMatch
      ? onlinePlayerEmotes[currentPlayer.id]
      : offlinePlayerEmotes[currentPlayer.id];
    if (activeEmote) return activeEmote;
    if (viewTurnPhase === 'ROLLING_DICE') return 'Đang đổ xúc xắc... 🎲';
    if (viewTurnPhase === 'MOVING_TOKEN') return 'Đang di chuyển...';
    if (viewTurnPhase === 'BUY_DECISION') return 'Mua ô đất này?';
    if (viewTurnPhase === 'START_UPGRADE_SELECTION') return 'Chọn thành phố nâng cấp! 🏗️';
    if (viewTurnPhase === 'UPGRADE_DECISION') return 'Nâng cấp nhà!';
    if (viewTurnPhase === 'BUYOUT_DECISION') return 'Mua lại 2×?';
    if (viewTurnPhase === 'CHAMPIONSHIP_SELECTION') return 'Đăng cai Cúp Quốc Gia! 🏆';
    if (viewTurnPhase === 'WORLD_TOUR') return 'Bay du lịch! ✈️';
    if (viewTurnPhase === 'CARD_TARGET_SELECTION') return 'Chọn mục tiêu trên bàn cờ! 🎯';
    if (viewTurnPhase === 'AWAIT_ROLL') {
      if (shouldGrantImmediateDoublesRoll(currentPlayer)) {
        return currentPlayer.isBot
          ? 'Ra đôi! Đang đổ thêm lượt... 🎲'
          : isOnlineMatch && !isActivelyControlledByMe
            ? `${currentPlayer.name} ra đôi!`
            : 'Ra đôi! Đổ thêm lượt nữa! 🎲';
      }
      if (currentPlayer.isBot) return 'Đang chuẩn bị đổ...';
      return isOnlineMatch && !isActivelyControlledByMe
        ? `Lượt của ${currentPlayer.name}`
        : 'Tới lượt bạn! 🎲';
    }
    return null;
  }, [
    viewScreenState,
    currentPlayer,
    viewLandingCueText,
    isOnlineMatch,
    onlinePlayerEmotes,
    offlinePlayerEmotes,
    viewTurnPhase,
    showAssetsModal,
    showRulebookModal,
    isActivelyControlledByMe,
  ]);

  const selectableTileIndices = useMemo(() => {
    if (viewScreenState !== 'playing' || !isActivelyControlledByMe || !currentPlayer) {
      return [];
    }
    if (viewTurnPhase === 'WORLD_TOUR') {
      return BOARD_TILES.filter((t) =>
        isValidWorldTourTarget(currentPlayer, t.index, viewProperties)
      ).map((t) => t.index);
    }
    if (viewTurnPhase === 'CHAMPIONSHIP_SELECTION') {
      return Object.values(viewProperties)
        .filter(
          (pr) =>
            pr.ownerId === currentPlayer.id &&
            BOARD_TILES[pr.tileIndex]?.kind === TileKind.PROPERTY
        )
        .map((pr) => pr.tileIndex);
    }
    if (viewTurnPhase === 'START_UPGRADE_SELECTION') {
      return getStartUpgradableTileIndices(currentPlayer, viewProperties);
    }
    if (viewTurnPhase === 'CARD_TARGET_SELECTION' && viewPendingTacticalCard) {
      return getValidTacticalCardTargets(
        viewPendingTacticalCard,
        currentPlayer.id,
        viewProperties,
        viewBoardModifiers
      );
    }
    return [];
  }, [
    viewScreenState,
    isActivelyControlledByMe,
    currentPlayer,
    viewTurnPhase,
    viewProperties,
    viewPendingTacticalCard,
    viewBoardModifiers,
  ]);

  const handleCanvasTileClick = useCallback(
    (idx: number) => {
      if (
        viewScreenStateRef.current === 'playing' &&
        viewTurnPhaseRef.current === 'WORLD_TOUR' &&
        isActivelyControlledByMeRef.current
      ) {
        const currPlayer = viewPlayersRef.current[viewActiveIdxRef.current];
        if (
          idx === WORLD_TOUR_TILE_INDEX ||
          (currPlayer &&
            isValidWorldTourTarget(currPlayer, idx, viewPropertiesRef.current))
        ) {
          void handleSelectWorldTourTarget(idx);
        }
        return;
      }
      if (
        viewScreenStateRef.current === 'playing' &&
        viewTurnPhaseRef.current === 'CHAMPIONSHIP_SELECTION' &&
        isActivelyControlledByMeRef.current
      ) {
        const currPlayer = viewPlayersRef.current[viewActiveIdxRef.current];
        const prop = viewPropertiesRef.current[idx];
        const tile = BOARD_TILES[idx];
        if (
          currPlayer &&
          prop?.ownerId === currPlayer.id &&
          tile?.kind === TileKind.PROPERTY
        ) {
          handleConfirmChampionship(idx);
        }
        return;
      }
      if (
        viewScreenStateRef.current === 'playing' &&
        viewTurnPhaseRef.current === 'START_UPGRADE_SELECTION' &&
        isActivelyControlledByMeRef.current
      ) {
        const currPlayer = viewPlayersRef.current[viewActiveIdxRef.current];
        if (
          currPlayer &&
          getStartUpgradableTileIndices(currPlayer, viewPropertiesRef.current).includes(
            idx
          )
        ) {
          handleSelectStartUpgradeCity(idx);
        }
        return;
      }
      if (
        viewScreenStateRef.current === 'playing' &&
        viewTurnPhaseRef.current === 'CARD_TARGET_SELECTION' &&
        isActivelyControlledByMeRef.current
      ) {
        const currPlayer = viewPlayersRef.current[viewActiveIdxRef.current];
        const kind = viewPendingTacticalCardRef.current;
        if (
          currPlayer &&
          kind &&
          getValidTacticalCardTargets(
            kind,
            currPlayer.id,
            viewPropertiesRef.current,
            viewBoardModifiersRef.current
          ).includes(idx)
        ) {
          handleApplyTacticalCard(idx);
        }
        return;
      }
      setSelectedTileIndex(idx);
    },
    [
      handleApplyTacticalCard,
      handleConfirmChampionship,
      handleSelectStartUpgradeCity,
      handleSelectWorldTourTarget,
    ]
  );

  const canShowTileInspector =
    selectedTileIndex !== null &&
    viewScreenState !== 'title' &&
    !showAssetsModal &&
    !showRulebookModal &&
    viewTurnPhase !== 'WORLD_TOUR' &&
    viewTurnPhase !== 'CHAMPIONSHIP_SELECTION' &&
    viewTurnPhase !== 'START_UPGRADE_SELECTION' &&
    viewTurnPhase !== 'CARD_TARGET_SELECTION' &&
    viewTurnPhase !== 'CARD_REVEAL' &&
    viewTurnPhase !== 'BUY_DECISION' &&
    viewTurnPhase !== 'UPGRADE_DECISION' &&
    viewTurnPhase !== 'BUYOUT_DECISION' &&
    viewTurnPhase !== 'DEBT_RESOLUTION';

  const handleCopyOnlineInvite = useCallback(() => {
    const inviteUrl = online.getInviteUrl();
    if (!inviteUrl) return;
    void navigator.clipboard?.writeText(inviteUrl).then(() => {
      setCopiedInviteToast(true);
      window.setTimeout(() => setCopiedInviteToast(false), 2200);
    });
  }, [online.getInviteUrl]);

  const handleChangeCurrencyStyle = useCallback((nextStyle: CurrencyStyleId) => {
    setCurrencyStyle(nextStyle);
    saveCurrencyStyle(nextStyle);
    soundEngine.playCurrencyTransfer(nextStyle, true);
  }, []);

  const handleChangeGraphicsQuality = useCallback(
    (nextPref: GraphicsQualityPref) => {
      setGraphicsQualityPref(nextPref);
      saveGraphicsQualityPref(nextPref);
      soundEngine.playAmbienceToggle(nextPref !== 'low');
    },
    []
  );

  useEffect(() => {
    document.body.dataset.quality = effectiveQualityTier;
    document.body.dataset.qualityPref = graphicsQualityPref;
  }, [effectiveQualityTier, graphicsQualityPref]);

  const handleDockRollDice = useCallback(() => {
    void handleRollDice();
  }, [handleRollDice]);

  const handleOpenAssetsModal = useCallback(() => {
    setSelectedTileIndex(null);
    setShowAssetsModal(true);
  }, []);

  const handleOpenRulebookModal = useCallback(() => {
    setSelectedTileIndex(null);
    setShowRulebookModal(true);
  }, []);

  const handleResetCamera = useCallback(() => {
    canvasRef.current?.resetCamera();
  }, []);

  const handleToggleSound = useCallback(() => {
    setSoundMuted((prev) => {
      const next = !prev;
      soundEngine.setMuted(next);
      return next;
    });
  }, []);

  const handleOpenPause = useCallback(() => {
    if (isOnlineMatchRef.current) {
      setOnlinePauseOpen(true);
    } else {
      setScreenState('paused');
    }
  }, []);

  return (
    <main className="relative h-full w-full overflow-hidden">
      {/* 1. Isolated 3D Low-Poly Isometric Board Viewport */}
      <MonopolyCanvas
        ref={canvasRef}
        players={viewPlayers}
        properties={viewProperties}
        selectedTileIndex={selectedTileIndex}
        selectableTileIndices={selectableTileIndices}
        activePlayerId={viewScreenState === 'playing' ? currentPlayer?.id ?? null : null}
        boardModifiers={viewBoardModifiers}
        turnTimeLeft={viewTurnTimeLeft}
        turnCount={viewTurnCount}
        activeSpeechText={activeSpeechText}
        currencyStyle={currencyStyle}
        graphicsQualityTier={effectiveQualityTier}
        isBoardOccluded={viewScreenState !== 'playing'}
        cinematicCamera={cinematicCamera}
        nightMode={nightMode}
        onSelectTile={handleCanvasTileClick}
      />

      {/* 1a. Online Room Pill & Reconnection Status Badge */}
      {isOnlineMatch && online.roomSnapshot && viewScreenState === 'playing' && (
        <div className="fixed top-2.5 left-1/2 -translate-x-1/2 z-25 flex items-center gap-2 pointer-events-auto">
          <button
            type="button"
            onClick={handleCopyOnlineInvite}
            title="Nhấn để chép link mời bạn bè"
            className="px-3.5 py-1 rounded-full bt-casual-modal text-[11px] font-black text-sky-900 flex items-center gap-1.5 cursor-pointer hover:scale-103 transition-transform whitespace-nowrap"
          >
            <span>🌐 Phòng</span>
            <span className="font-mono-num tracking-wider text-[#0284C7]">
              {online.roomSnapshot.roomCode}
            </span>
            <span className="text-[10px] font-extrabold text-emerald-700">
              {copiedInviteToast ? '✓ Đã chép' : '· Mời'}
            </span>
          </button>
          {online.connectionStatus === 'reconnecting' && (
            <div className="px-3 py-1 rounded-full bg-amber-100 border-2 border-amber-400 text-[11px] font-black text-amber-900 shadow-md whitespace-nowrap">
              🟡 Đang kết nối lại...
            </div>
          )}
        </div>
      )}

      {/* 1b. Brief Pre-Popup Landing Cue Banner so players read which tile triggered */}
      {viewScreenState === 'playing' && viewLandingCueText && (
        <div
          data-testid="bt-landing-cue"
          className={`fixed ${isOnlineMatch ? 'top-12' : 'top-4'} left-1/2 -translate-x-1/2 z-30 px-5 py-2 rounded-full bt-casual-modal pointer-events-none animate-pop-in`}
        >
          <span className="font-display text-xs sm:text-sm font-black text-sky-900 whitespace-nowrap">
            {viewLandingCueText}
          </span>
        </div>
      )}

      {/* 2. Start Screen Setup Modal */}
      {viewScreenState === 'title' && (
        <StartModal
          initialConfigs={setupConfigs}
          initialStartingCash={startingCash}
          currencyStyle={currencyStyle}
          onChangeCurrencyStyle={handleChangeCurrencyStyle}
          graphicsQualityPref={graphicsQualityPref}
          effectiveQualityTier={effectiveQualityTier}
          gpuLabel={detectedGpu.label}
          onChangeGraphicsQuality={handleChangeGraphicsQuality}
          online={online}
          onStartGame={startNewGame}
          onOpenRulebook={handleOpenRulebookModal}
        />
      )}

      {/* 3. Active Playing 4-Corner HUD & Business Tour Center/Right Controls */}
      {viewScreenState !== 'title' && (
        <>
          <PlayerHUD
            players={viewPlayers}
            activePlayerIndex={viewActivePlayerIndex}
            properties={viewProperties}
            boardModifiers={viewBoardModifiers}
            currencyStyle={currencyStyle}
            botBubbles={botBubbles}
            localPlayerId={isOnlineMatch ? online.yourPlayerId : null}
            playerEmotes={isOnlineMatch ? onlinePlayerEmotes : offlinePlayerEmotes}
            onDismissBubble={dismissBotBubble}
            onSelectTile={handleCanvasTileClick}
          />

          <ActionDock
            currentPlayer={currentPlayer}
            turnPhase={viewTurnPhase}
            logs={viewLogs}
            ownedCount={ownedCount}
            canAct={isActivelyControlledByMe}
            isOnlineMatch={isOnlineMatch}
            currencyStyle={currencyStyle}
            graphicsQualityPref={graphicsQualityPref}
            effectiveQualityTier={effectiveQualityTier}
            gpuLabel={detectedGpu.label}
            speedMultiplier={speedMultiplier}
            cinematicCamera={cinematicCamera}
            nightMode={nightMode}
            soundMuted={soundMuted}
            onRollDice={handleDockRollDice}
            onPayJailFine={handlePayJailFine}
            onUseJailCard={handleUseJailCard}
            onOpenAssetsModal={handleOpenAssetsModal}
            onOpenRulebook={handleOpenRulebookModal}
            onEndTurn={handleEndTurn}
            onChangeCurrencyStyle={handleChangeCurrencyStyle}
            onChangeGraphicsQuality={handleChangeGraphicsQuality}
            onChangeSpeed={setSpeedMultiplier}
            onToggleCinematic={handleToggleCinematic}
            onToggleNightMode={handleToggleNightMode}
            onResetCamera={handleResetCamera}
            onToggleSound={handleToggleSound}
            onOpenPause={handleOpenPause}
            onTriggerEmote={handleTriggerEmote}
          />
        </>
      )}

      {/* 4. Raycasted 3D Tile Detail Card */}
      {canShowTileInspector && selectedTileIndex !== null && (
        <TileInspectorCard
          tileIndex={selectedTileIndex}
          players={viewPlayers}
          properties={viewProperties}
          boardModifiers={viewBoardModifiers}
          onClose={() => setSelectedTileIndex(null)}
        />
      )}

      {/* 5. Contextual Buy Unowned Property Prompt (Human Turn) */}
      {viewScreenState === 'playing' &&
        viewTurnPhase === 'BUY_DECISION' &&
        isActivelyControlledByMe && (
          <BuyDecisionModal
            tileIndex={currentPlayer.position}
            player={currentPlayer}
            properties={viewProperties}
            boardModifiers={viewBoardModifiers}
            onBuy={handleBuyProperty}
            onSkip={handleSkipBuy}
          />
        )}

      {/* 5a. Business Tour START Tile Upgrade City Selector (Tile 0 Direct Landing) */}
      {viewScreenState === 'playing' &&
        viewTurnPhase === 'START_UPGRADE_SELECTION' &&
        isActivelyControlledByMe && (
          <StartUpgradeModal
            player={currentPlayer}
            properties={viewProperties}
            boardModifiers={viewBoardModifiers}
            onSelectCity={handleSelectStartUpgradeCity}
            onSkip={handleSkipStartUpgrade}
          />
        )}

      {/* 5b. Business Tour On-Tile or START-Remote Upgrade Prompt */}
      {viewScreenState === 'playing' &&
        viewTurnPhase === 'UPGRADE_DECISION' &&
        isActivelyControlledByMe && (
          <UpgradeDecisionModal
            tileIndex={viewUpgradeTargetTileIndex ?? currentPlayer.position}
            player={currentPlayer}
            properties={viewProperties}
            boardModifiers={viewBoardModifiers}
            isFromStart={viewUpgradeTargetTileIndex !== null}
            onBackToCitySelect={
              viewUpgradeTargetTileIndex !== null
                ? handleBackToStartCitySelect
                : undefined
            }
            onUpgradeToLevel={handleOnTileUpgrade}
            onSkip={handleSkipOnTileUpgrade}
          />
        )}

      {/* 5c. Business Tour 2x Opponent City Buyout Prompt (Human Turn) */}
      {viewScreenState === 'playing' &&
        viewTurnPhase === 'BUYOUT_DECISION' &&
        isActivelyControlledByMe &&
        buyoutOwner && (
          <BuyoutDecisionModal
            tileIndex={currentPlayer.position}
            buyer={currentPlayer}
            owner={buyoutOwner}
            properties={viewProperties}
            boardModifiers={viewBoardModifiers}
            rentPaid={viewLastRentPaid}
            onConfirmBuyout={handleConfirmBuyout}
            onSkipBuyout={handleSkipBuyout}
          />
        )}

      {/* 5d. Business Tour World Championships Host Selector (Tile 16 or Chance Card) */}
      {viewScreenState === 'playing' &&
        viewTurnPhase === 'CHAMPIONSHIP_SELECTION' &&
        isActivelyControlledByMe && (
          <ChampionshipDecisionModal
            player={currentPlayer}
            properties={viewProperties}
            boardModifiers={viewBoardModifiers}
            isFree={viewIsFreeChampionship}
            onSelectCity={(idx) => handleConfirmChampionship(idx)}
            onSkip={handleSkipChampionship}
          />
        )}

      {/* 5e. Business Tour World Tour Flight Selector (Next-Turn Flight from Tile 24) */}
      {viewScreenState === 'playing' &&
        viewTurnPhase === 'WORLD_TOUR' &&
        isActivelyControlledByMe && (
          <WorldTourPrompt
            player={currentPlayer}
            properties={viewProperties}
            boardModifiers={viewBoardModifiers}
            onSelectTargetTile={(idx) => void handleSelectWorldTourTarget(idx)}
            onSkipWorldTour={handleSkipWorldTour}
          />
        )}

      {/* 5f. Business Tour Tactical Chance Card Target Selector */}
      {viewScreenState === 'playing' &&
        viewTurnPhase === 'CARD_TARGET_SELECTION' &&
        viewPendingTacticalCard &&
        isActivelyControlledByMe && (
          <TacticalCardTargetModal
            kind={viewPendingTacticalCard}
            player={currentPlayer}
            players={viewPlayers}
            properties={viewProperties}
            boardModifiers={viewBoardModifiers}
            onSelectTarget={handleApplyTacticalCard}
            onSkip={handleSkipTacticalCard}
          />
        )}

      {/* 6. Chance Drawn Card Modal */}
      {viewScreenState === 'playing' && viewTurnPhase === 'CARD_REVEAL' && viewDrawnCard && (
        <LuckCardModal
          card={viewDrawnCard}
          isBot={!isActivelyControlledByMe}
          onConfirm={() => void handleConfirmCard()}
        />
      )}

      {/* 7. Property Portfolio & 100%-Refund Debt Liquidation Modal */}
      {viewScreenState === 'playing' &&
        isActivelyControlledByMe &&
        (showAssetsModal || viewTurnPhase === 'DEBT_RESOLUTION') && (
          <AssetManagementModal
            player={currentPlayer}
            properties={viewProperties}
            boardModifiers={viewBoardModifiers}
            pendingDebt={viewPendingDebt}
            onExecuteDebtSaleAndPay={(tiles) => handleExecuteDebtSaleAndPay(tiles)}
            onDeclareBankruptcy={handleDeclareBankruptcy}
            onClose={() => {
              if (!viewPendingDebt) setShowAssetsModal(false);
            }}
          />
        )}

      {/* 8. Pause Modal */}
      {viewScreenState === 'paused' && (
        <PauseModal
          onlineRoomCode={isOnlineMatch ? online.roomSnapshot?.roomCode : null}
          onCopyInviteLink={isOnlineMatch ? handleCopyOnlineInvite : undefined}
          onResume={() => {
            if (isOnlineMatch) {
              setOnlinePauseOpen(false);
            } else {
              setScreenState('playing');
            }
          }}
          onOpenRulebook={() => {
            setSelectedTileIndex(null);
            setShowRulebookModal(true);
          }}
          onResetCamera={() => {
            canvasRef.current?.resetCamera();
            if (isOnlineMatch) {
              setOnlinePauseOpen(false);
            } else {
              setScreenState('playing');
            }
          }}
          onRestartToTitle={() => {
            if (isOnlineMatch) {
              setOnlinePauseOpen(false);
              online.leaveRoom();
              return;
            }
            sessionEpochRef.current += 1;
            setLandingCueText(null);
            setBotBubbles({});
            setOfflinePlayerEmotes({});
            setSelectedTileIndex(null);
            setShowAssetsModal(false);
            setDrawnCard(null);
            setPendingDebt(null);
            setScreenState('title');
          }}
        />
      )}

      {/* 9. Victory Celebration Modal with Confetti */}
      {viewScreenState === 'gameover' && computedWinner && (
        <VictoryModal
          winner={computedWinner.winner}
          victoryLabel={computedWinner.label}
          players={viewPlayers}
          properties={viewProperties}
          turnCount={viewTurnCount}
          isOnlineMatch={isOnlineMatch}
          isOnlineHost={
            Boolean(
              online.roomSnapshot &&
                online.yourSeatIndex === online.roomSnapshot.hostSeatIndex
            )
          }
          onReturnToOnlineLobby={online.returnToLobby}
          onPlayAgain={() => {
            if (isOnlineMatch) {
              online.leaveRoom();
              return;
            }
            sessionEpochRef.current += 1;
            setLandingCueText(null);
            setBotBubbles({});
            setOfflinePlayerEmotes({});
            setSelectedTileIndex(null);
            setShowAssetsModal(false);
            setDrawnCard(null);
            setPendingDebt(null);
            setScreenState('title');
          }}
        />
      )}

      {/* 10. Pure Business Tour Rulebook Modal */}
      {showRulebookModal && (
        <RulebookModal onClose={() => setShowRulebookModal(false)} />
      )}
    </main>
  );
}
