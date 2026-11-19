import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { soundEngine } from './audio/soundEngine';
import { ActionDock } from './components/ActionDock';
import { TradeModal } from './components/AuctionAndTradeModals';
import {
  BuyoutDecisionModal,
  RulebookModal,
  UpgradeDecisionModal,
  WorldTourPrompt,
} from './components/BusinessTourActionModals';
import { MonopolyCanvas, MonopolyCanvasHandle } from './components/MonopolyCanvas';
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
  CHEST_CARDS,
  DEFAULT_PLAYER_CONFIGS,
} from './game/boardData';
import {
  botChooseJailAction,
  botPickAssetToLiquidate,
  botPickInitialPurchaseTier,
  botPickOnTileUpgradeTargetLevel,
  botPickWorldTourTarget,
  botShouldBuyoutProperty,
  botShouldBuyProperty,
  buildBotBuyQuipPayload,
  buildBotPenaltyQuipPayload,
  buildBotRentCollectedQuipPayload,
  calculateRent,
  canBuyoutProperty,
  canSellHouse,
  canUpgradeProperty,
  computeForwardSteps,
  computePathToTile,
  createInitialPlayers,
  createInitialProperties,
  evaluateMatchWinner,
  executeTradeOffer,
  formatBusinessTourCompact,
  formatBusinessTourSpaced,
  getNextActivePlayerIndex,
  getPropertySellRefund,
  isPurchasableTile,
  JAIL_FINE,
  JAIL_TILE_INDEX,
  MAX_JAIL_TURNS,
  parseDeterministicDiceQueue,
  resolvePostActionTurnPhase,
  shouldGrantImmediateDoublesRoll,
  START_SALARY,
  TOTAL_TILES,
  TURN_COUNTDOWN_SECONDS,
  WORLD_TOUR_FEE,
  WORLD_TOUR_TILE_INDEX,
} from './game/rules';
import {
  BotChatBubbleState,
  BotQuipPayload,
  GameLogEntry,
  GameScreenState,
  LuckCard,
  MatchWinnerResult,
  PendingDebt,
  PlayerSetupConfig,
  PlayerState,
  PropertyState,
  TileKind,
  TradeOffer,
  TurnPhase,
} from './game/types';
import { fetchBotQuip } from './utils/botQuipClient';

function shuffleCards<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export default function App() {
  const { isAutostart, isDemoShowcase, isDemoEvent } = useMemo(() => {
    if (typeof window === 'undefined') {
      return {
        isAutostart: false,
        isDemoShowcase: false,
        isDemoEvent: false,
      };
    }
    const params = new URLSearchParams(window.location.search);
    const demoShowcase = params.get('demo_showcase') === '1';
    const demoEvent = params.get('demo_event') === '1';
    return {
      isAutostart: params.get('autostart') === '1' || demoShowcase || demoEvent,
      isDemoShowcase: demoShowcase,
      isDemoEvent: demoEvent,
    };
  }, []);

  const [setupConfigs, setSetupConfigs] =
    useState<PlayerSetupConfig[]>(DEFAULT_PLAYER_CONFIGS);
  const [startingCash, setStartingCash] = useState<number>(1500);

  const [screenState, setScreenState] = useState<GameScreenState>(() =>
    isAutostart ? 'playing' : 'title'
  );
  const [players, setPlayers] = useState<PlayerState[]>(() => {
    const base = createInitialPlayers(DEFAULT_PLAYER_CONFIGS, 1500);
    if (!isDemoShowcase) return base;
    return base.map((pl, idx) => {
      if (idx === 0) return { ...pl, position: 6, cash: 1840 };
      if (idx === 1) return { ...pl, position: 11, cash: 1420 };
      if (idx === 2) return { ...pl, position: 23, cash: 1190 };
      return { ...pl, position: 0, cash: 0, bankrupt: true };
    });
  });
  const [properties, setProperties] = useState<Record<number, PropertyState>>(() => {
    const base = createInitialProperties();
    if (!isDemoShowcase) return base;
    return {
      ...base,
      // Player 1 (#F5B800 Yellow/Gold): Lv4 Protected Hotel + Lv2 House
      1: { tileIndex: 1, ownerId: 0, level: 2, mortgaged: false },
      6: { tileIndex: 6, ownerId: 0, level: 4, mortgaged: false },
      // Player 2 (#66C61C Lime Green): Lv3 Houses + Lv1 House
      8: { tileIndex: 8, ownerId: 1, level: 1, mortgaged: false },
      11: { tileIndex: 11, ownerId: 1, level: 3, mortgaged: false },
      // Player 3 (#E91E63 Hot Pink): Lv4 Protected Hotel + Lv2 House
      23: { tileIndex: 23, ownerId: 2, level: 4, mortgaged: false },
      27: { tileIndex: 27, ownerId: 2, level: 2, mortgaged: false },
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
  const [taxPool, setTaxPool] = useState<number>(() => (isDemoShowcase ? 220 : 0));
  const [turnTimeLeft, setTurnTimeLeft] = useState<number>(TURN_COUNTDOWN_SECONDS);

  const [selectedTileIndex, setSelectedTileIndex] = useState<number | null>(null);
  const [showAssetsModal, setShowAssetsModal] = useState<boolean>(false);
  const [showTradeModal, setShowTradeModal] = useState<boolean>(false);
  const [showRulebookModal, setShowRulebookModal] = useState<boolean>(false);
  const [drawnCard, setDrawnCard] = useState<LuckCard | null>(() =>
    isDemoEvent
      ? CHANCE_CARDS.find((c) => c.effect.type === 'HOUSE_REPAIR') || CHANCE_CARDS[0]
      : null
  );
  const [pendingDebt, setPendingDebt] = useState<PendingDebt | null>(null);
  const [matchWinnerResult, setMatchWinnerResult] = useState<MatchWinnerResult | null>(
    null
  );
  const [landingCueText, setLandingCueText] = useState<string | null>(null);

  const [speedMultiplier, setSpeedMultiplier] = useState<1 | 2>(1);
  const [cinematicCamera, setCinematicCamera] = useState<boolean>(false);
  const [nightMode, setNightMode] = useState<boolean>(false);
  const [soundMuted, setSoundMuted] = useState<boolean>(false);
  const [dockCollapsed, setDockCollapsed] = useState<boolean>(false);
  const [botBubbles, setBotBubbles] = useState<Record<number, BotChatBubbleState>>({});
  const [playerEmoteText, setPlayerEmoteText] = useState<string | null>(null);

  const [logs, setLogs] = useState<GameLogEntry[]>(() => [
    {
      id: 1,
      turn: 1,
      text: 'Chào mừng đến với Cờ Tỷ Phú Việt Nam 3D (Luật Business Tour)! Hãy đổ xúc xắc để khởi hành.',
      tone: 'highlight',
    },
  ]);

  const canvasRef = useRef<MonopolyCanvasHandle | null>(null);
  const logIdRef = useRef<number>(2);
  const sessionEpochRef = useRef<number>(1);
  const quipSeqRef = useRef<number>(1);
  const bubbleTimersRef = useRef<Record<number, number>>({});
  const emoteTimerRef = useRef<number>(0);
  const chanceDeckRef = useRef<LuckCard[]>(shuffleCards(CHANCE_CARDS));
  const chestDeckRef = useRef<LuckCard[]>(shuffleCards(CHEST_CARDS));
  const diceQueueRef = useRef<Array<[number, number]>>(
    typeof window !== 'undefined'
      ? parseDeterministicDiceQueue(window.location.search)
      : []
  );

  // Keep live state mirror in refs for async animation callbacks
  const playersRef = useRef(players);
  playersRef.current = players;
  const propertiesRef = useRef(properties);
  propertiesRef.current = properties;
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

  // Sync document.body.dataset attributes for testability & state machine contract
  useEffect(() => {
    document.body.dataset.state = screenState;
  }, [screenState]);

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
   * Pauses briefly between movement/dice settlement and modal pop-ups so players
   * can read where the pawn landed before an overlay opens.
   */
  const waitGameBeat = useCallback((ms: number, epoch: number): Promise<boolean> => {
    const scaledMs = Math.max(120, Math.round(ms / speedRef.current));
    return new Promise((resolve) => {
      window.setTimeout(() => {
        resolve(sessionEpochRef.current === epoch);
      }, scaledMs);
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
   * Completes the current roll's tile/card/modal action:
   * - Checks instant match victory first.
   * - If the active player rolled doubles (1st or 2nd streak) and is neither jailed nor bankrupt,
   *   skips any "Đổ tiếp (đôi)" confirmation and transitions straight to 'AWAIT_ROLL'.
   * - Otherwise transitions to 'AWAIT_END_TURN'.
   */
  const completeTurnAfterAction = useCallback(
    (overridePlayer?: PlayerState) => {
      const currPlayers = playersRef.current;
      const currProps = propertiesRef.current;
      if (checkAndTriggerMatchVictory(currPlayers, currProps)) {
        return;
      }
      const activePlayer = overridePlayer ?? currPlayers[activeIdxRef.current];
      const nextPhase = resolvePostActionTurnPhase(activePlayer);
      if (nextPhase === 'AWAIT_ROLL' && activePlayer) {
        addLog(
          `${activePlayer.name} được thưởng thêm 1 lượt đổ xúc xắc nhờ ra đôi!`,
          activePlayer.color,
          'highlight'
        );
      }
      setTurnPhase(nextPhase);
    },
    [addLog, checkAndTriggerMatchVictory]
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

  const startNewGame = useCallback((configs: PlayerSetupConfig[], cash: number) => {
    sessionEpochRef.current += 1;
    for (const timerId of Object.values(bubbleTimersRef.current)) {
      clearTimeout(timerId);
    }
    bubbleTimersRef.current = {};
    setBotBubbles({});
    setLandingCueText(null);

    setSetupConfigs(configs);
    setStartingCash(cash);

    const initPlayers = createInitialPlayers(configs, cash);
    const initProps = createInitialProperties();

    chanceDeckRef.current = shuffleCards(CHANCE_CARDS);
    chestDeckRef.current = shuffleCards(CHEST_CARDS);

    commitPlayers(initPlayers);
    commitProperties(initProps);
    setActivePlayerIndex(0);
    setTurnPhase('AWAIT_ROLL');
    setTurnCount(1);
    setLastDice(null);
    setLastDiceSum(0);
    setLastRentPaid(0);
    setTaxPool(0);
    setTurnTimeLeft(TURN_COUNTDOWN_SECONDS);
    setSelectedTileIndex(null);
    setShowAssetsModal(false);
    setShowTradeModal(false);
    setShowRulebookModal(false);
    setDrawnCard(null);
    setPendingDebt(null);
    setMatchWinnerResult(null);

    logIdRef.current = 2;
    setLogs([
      {
        id: 1,
        turn: 1,
        text: `Ván đấu bắt đầu (Luật Business Tour) với ${initPlayers.length} tỷ phú · Ngân sách ${formatBusinessTourSpaced(cash)}!`,
        tone: 'highlight',
      },
    ]);

    document.body.dataset.state = 'playing';
    setScreenState('playing');
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    canvasRef.current?.resetCamera();
  }, [commitPlayers, commitProperties]);

  const drawNextCard = useCallback((deck: 'CHANCE' | 'CHEST'): LuckCard => {
    if (deck === 'CHANCE') {
      if (chanceDeckRef.current.length === 0) {
        chanceDeckRef.current = shuffleCards(CHANCE_CARDS);
      }
      return chanceDeckRef.current.pop()!;
    }
    if (chestDeckRef.current.length === 0) {
      chestDeckRef.current = shuffleCards(CHEST_CARDS);
    }
    return chestDeckRef.current.pop()!;
  }, []);

  /**
   * Charges `amount` from `payerId` to `creditorId` (or Bank if null).
   * If insufficient cash, enters DEBT_RESOLUTION so player/bot can liquidate houses/cities.
   */
  const applyPaymentOrDebt = useCallback(
    (
      payerId: number,
      amount: number,
      creditorId: number | null,
      reason: string,
      options?: {
        postPayMoveSteps?: number;
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
          } else if (payer.isBot && amount >= 20) {
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
          setTaxPool((prev) => prev + amount);
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
        if (options?.nextPhaseOnImmediatePay) {
          setTurnPhase(options.nextPhaseOnImmediatePay);
        } else {
          completeTurnAfterAction(nextPlayers.find((p) => p.id === payerId));
        }
        return true;
      }

      setSelectedTileIndex(null);
      setPendingDebt({
        amount,
        creditorId,
        reason,
        postPayMoveSteps: options?.postPayMoveSteps,
      });
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
    [addLog, commitPlayers, completeTurnAfterAction, triggerBotQuip]
  );

  /**
   * Resolves landing on `tileIndex` after token finishes hopping.
   * Includes a deliberate pre-popup reading pause on Khí Vận, Cơ Hội, and all modal-opening tiles.
   */
  const resolveTileLanding = useCallback(
    async (
      playerId: number,
      tileIndex: number,
      diceSum: number,
      epoch: number
    ): Promise<void> => {
      if (sessionEpochRef.current !== epoch) return;

      const tile = BOARD_TILES[tileIndex];
      const currPlayers = playersRef.current;
      const currProps = propertiesRef.current;
      const player = currPlayers.find((p) => p.id === playerId);
      if (!player || !tile) return;

      if (tile.kind === TileKind.START) {
        completeTurnAfterAction(player);
        return;
      }

      if (tile.kind === TileKind.JAIL) {
        addLog(`${player.name} ghé Thăm Đảo Hoang bình thường.`, player.color);
        completeTurnAfterAction(player);
        return;
      }

      if (tile.kind === TileKind.FREE_PARKING) {
        if (player.cash >= WORLD_TOUR_FEE) {
          addLog(
            `${player.name} dừng tại sân bay ${tile.name} — có thể chi ${formatBusinessTourCompact(WORLD_TOUR_FEE)} để bay tới bất kỳ đâu!`,
            player.color,
            'highlight'
          );
          setSelectedTileIndex(null);
          setLandingCueText(`✈️ ${tile.name} — Chuẩn bị chọn điểm bay...`);
          const ok = await waitGameBeat(760, epoch);
          setLandingCueText(null);
          if (!ok) return;
          setTurnPhase('WORLD_TOUR');
          return;
        }
        addLog(`${player.name} dừng nghỉ chân miễn phí tại ${tile.name}.`, player.color);
        completeTurnAfterAction(player);
        return;
      }

      if (tile.kind === TileKind.GO_TO_JAIL) {
        soundEngine.playJailAlert();
        setSelectedTileIndex(null);
        setLandingCueText('🚔 Vào Đảo Hoang!');
        const okBeat = await waitGameBeat(700, epoch);
        setLandingCueText(null);
        if (!okBeat) return;

        addLog(
          `${player.name} rơi vào ô VÀO TÙ — lập tức chuyển thẳng tới Nhà Tù!`,
          player.color,
          'negative'
        );
        await canvasRef.current?.animateTokenPath(
          player.id,
          [JAIL_TILE_INDEX],
          speedRef.current
        );
        if (sessionEpochRef.current !== epoch) return;

        const nextPlayers = commitPlayers((prev) =>
          prev.map((p) =>
            p.id === playerId
              ? {
                  ...p,
                  position: JAIL_TILE_INDEX,
                  inJail: true,
                  jailTurns: 0,
                  doublesStreak: 0,
                }
              : p
          )
        );
        completeTurnAfterAction(nextPlayers.find((p) => p.id === playerId));
        return;
      }

      if (tile.kind === TileKind.TAX) {
        const tax = tile.taxAmount || 150;
        setSelectedTileIndex(null);
        setLandingCueText(
          `💸 ${tile.name} (-${formatBusinessTourCompact(tax)})`
        );
        const okBeat = await waitGameBeat(680, epoch);
        setLandingCueText(null);
        if (!okBeat) return;
        applyPaymentOrDebt(player.id, tax, null, tile.name);
        return;
      }

      if (isPurchasableTile(tile)) {
        const prop = currProps[tileIndex];
        if (!prop || prop.ownerId === null) {
          setSelectedTileIndex(null);
          setLandingCueText(
            `🏙️ ${tile.name} — Đất trống (${formatBusinessTourCompact(tile.price || 0)})`
          );
          const okBeat = await waitGameBeat(740, epoch);
          setLandingCueText(null);
          if (!okBeat) return;
          setTurnPhase('BUY_DECISION');
          return;
        }

        if (prop.ownerId === player.id) {
          if (
            tile.kind === TileKind.PROPERTY &&
            prop.level < 4 &&
            player.cash >= (tile.houseCost ?? 100)
          ) {
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
            setTurnPhase('UPGRADE_DECISION');
            return;
          }
          addLog(`${player.name} dừng tại đô thị sở hữu ${tile.name}.`, player.color);
          completeTurnAfterAction(player);
          return;
        }

        const owner = currPlayers.find((p) => p.id === prop.ownerId && !p.bankrupt);
        if (!owner) {
          completeTurnAfterAction(player);
          return;
        }

        const rent = calculateRent(tileIndex, currProps, diceSum);
        setLastRentPaid(rent);

        const simPayerAfterRent: PlayerState = {
          ...player,
          cash: player.cash - rent,
        };
        const buyoutCheck = canBuyoutProperty(
          simPayerAfterRent,
          tileIndex,
          currProps
        );

        setSelectedTileIndex(null);
        setLandingCueText(
          `🏨 Đất của ${owner.name}: ${tile.name} (-${formatBusinessTourCompact(rent)})`
        );
        const okBeat = await waitGameBeat(740, epoch);
        setLandingCueText(null);
        if (!okBeat) return;

        applyPaymentOrDebt(player.id, rent, owner.id, tile.name, {
          nextPhaseOnImmediatePay: buyoutCheck.allowed ? 'BUYOUT_DECISION' : undefined,
        });
        return;
      }

      if (tile.kind === TileKind.CHANCE || tile.kind === TileKind.CHEST) {
        setSelectedTileIndex(null);
        setLandingCueText(
          tile.kind === TileKind.CHANCE
            ? '🍀 Ô Cơ Hội — Đang rút thẻ sự kiện...'
            : '🎁 Ô Khí Vận — Đang mở rương sự kiện...'
        );
        const okBeat = await waitGameBeat(850, epoch);
        setLandingCueText(null);
        if (!okBeat) return;

        const card = drawNextCard(tile.kind === TileKind.CHANCE ? 'CHANCE' : 'CHEST');
        soundEngine.playCardDraw();
        addLog(
          `${player.name} rút thẻ ${tile.name}: "${card.title}"`,
          player.color,
          'highlight'
        );
        setDrawnCard(card);
        setTurnPhase('CARD_REVEAL');
        return;
      }

      completeTurnAfterAction(player);
    },
    [
      addLog,
      applyPaymentOrDebt,
      commitPlayers,
      completeTurnAfterAction,
      drawNextCard,
      waitGameBeat,
    ]
  );

  /**
   * Executes primary Dice Roll + 3D Dice Bounce + brief dice-read pause + Token Hop sequence.
   */
  const handleRollDice = useCallback(async () => {
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

    // 1. Jail Roll Handling
    if (freshPlayer.inJail) {
      if (isDoubles) {
        addLog(
          `${freshPlayer.name} đổ ra đôi (${die1}-${die2}), thoát khỏi Nhà Tù và tiến ${sum} bước!`,
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
      } else if (freshPlayer.jailTurns + 1 >= MAX_JAIL_TURNS) {
        addLog(
          `${freshPlayer.name} hết 3 lượt trong Nhà Tù — bắt buộc nộp phạt ${formatBusinessTourCompact(JAIL_FINE)} và đi ${sum} bước.`,
          freshPlayer.color,
          'negative'
        );
        if (freshPlayer.cash >= JAIL_FINE) {
          soundEngine.playCashPay();
          setTaxPool((prev) => prev + JAIL_FINE);
          commitPlayers((prev) =>
            prev.map((p) =>
              p.id === freshPlayer.id
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
          if (freshPlayer.isBot) {
            triggerBotQuip(
              buildBotPenaltyQuipPayload(
                { ...freshPlayer, cash: freshPlayer.cash - JAIL_FINE },
                'Nộp phạt rời Nhà Tù',
                JAIL_FINE
              )
            );
          }
        } else {
          commitPlayers((prev) =>
            prev.map((p) =>
              p.id === freshPlayer.id
                ? { ...p, inJail: false, jailTurns: 0, doublesStreak: 0 }
                : p
            )
          );
          applyPaymentOrDebt(freshPlayer.id, JAIL_FINE, null, 'Tiền bảo lãnh Nhà Tù', {
            postPayMoveSteps: sum,
          });
          return;
        }
      } else {
        const nextTry = freshPlayer.jailTurns + 1;
        addLog(
          `${freshPlayer.name} đổ (${die1}-${die2}) không ra đôi, tiếp tục ở Nhà Tù (${nextTry}/${MAX_JAIL_TURNS}).`,
          freshPlayer.color
        );
        commitPlayers((prev) =>
          prev.map((p) =>
            p.id === freshPlayer.id ? { ...p, jailTurns: nextTry, doublesStreak: 0 } : p
          )
        );
        setTurnPhase('AWAIT_END_TURN');
        return;
      }
    } else {
      // 2. Standard Roll Doubles Check (3 consecutive doubles -> Jail)
      const nextStreak = isDoubles ? freshPlayer.doublesStreak + 1 : 0;
      if (nextStreak >= 3) {
        soundEngine.playJailAlert();
        addLog(
          `${freshPlayer.name} đổ ra đôi 3 lần liên tiếp (${die1}-${die2}) — phải vào thẳng Nhà Tù!`,
          freshPlayer.color,
          'negative'
        );
        setTurnPhase('MOVING_TOKEN');
        await canvasRef.current?.animateTokenPath(
          freshPlayer.id,
          [JAIL_TILE_INDEX],
          speedRef.current
        );
        if (sessionEpochRef.current !== epoch) return;

        commitPlayers((prev) =>
          prev.map((p) =>
            p.id === freshPlayer.id
              ? {
                  ...p,
                  position: JAIL_TILE_INDEX,
                  inJail: true,
                  jailTurns: 0,
                  doublesStreak: 0,
                }
              : p
          )
        );
        setTurnPhase('AWAIT_END_TURN');
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
      sum
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
            }
          : p
      )
    );

    if (passedStart) {
      soundEngine.playCashGain();
      addLog(
        `${freshPlayer.name} đi qua ô BẮT ĐẦU, nhận thưởng +${formatBusinessTourCompact(START_SALARY)}!`,
        freshPlayer.color,
        'positive'
      );
    }

    await resolveTileLanding(freshPlayer.id, finalTile, sum, epoch);
  }, [
    addLog,
    applyPaymentOrDebt,
    commitPlayers,
    resolveTileLanding,
    triggerBotQuip,
    waitGameBeat,
  ]);

  const handlePayJailFine = useCallback(() => {
    const player = playersRef.current[activeIdxRef.current];
    if (!player || !player.inJail || player.cash < JAIL_FINE) return;

    soundEngine.playCashPay();
    setTaxPool((prev) => prev + JAIL_FINE);
    commitPlayers((prev) =>
      prev.map((p) =>
        p.id === player.id
          ? { ...p, cash: p.cash - JAIL_FINE, inJail: false, jailTurns: 0 }
          : p
      )
    );
    addLog(
      `${player.name} nộp phạt ${formatBusinessTourCompact(JAIL_FINE)} để rời khỏi Nhà Tù ngay lập tức.`,
      player.color,
      'highlight'
    );
    if (player.isBot) {
      triggerBotQuip(
        buildBotPenaltyQuipPayload(
          { ...player, cash: player.cash - JAIL_FINE },
          'Tiền bảo lãnh Nhà Tù',
          JAIL_FINE
        )
      );
    }
  }, [addLog, commitPlayers, triggerBotQuip]);

  const handleUseJailCard = useCallback(() => {
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
            }
          : p
      )
    );
    addLog(
      `${player.name} sử dụng Thẻ Ra Tù Miễn Phí và được tự do!`,
      player.color,
      'positive'
    );
  }, [addLog, commitPlayers]);

  const handleBuyProperty = useCallback(
    (requestedInitialLevel: number = 0) => {
      if (turnPhaseRef.current !== 'BUY_DECISION') return;
      const player = playersRef.current[activeIdxRef.current];
      if (!player) return;

      const tile = BOARD_TILES[player.position];
      const basePrice = tile?.price || 0;
      if (!tile) {
        completeTurnAfterAction(player);
        return;
      }

      const safeLevel =
        tile.kind === TileKind.PROPERTY
          ? Math.max(0, Math.min(3, Math.floor(requestedInitialLevel)))
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
          mortgaged: false,
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
    [addLog, commitPlayers, commitProperties, completeTurnAfterAction, triggerBotQuip]
  );

  const handleSkipBuy = useCallback(() => {
    if (turnPhaseRef.current !== 'BUY_DECISION') return;
    const player = playersRef.current[activeIdxRef.current];
    if (player) {
      const tile = BOARD_TILES[player.position];
      addLog(`${player.name} bỏ qua cơ hội mua ${tile.name}.`, player.color);
    }
    completeTurnAfterAction(player);
  }, [addLog, completeTurnAfterAction]);

  const handleOnTileUpgrade = useCallback(
    (targetLevel: number) => {
      if (turnPhaseRef.current !== 'UPGRADE_DECISION') return;
      const player = playersRef.current[activeIdxRef.current];
      if (!player) return;

      const tileIndex = player.position;
      const check = canUpgradeProperty(player, tileIndex, propertiesRef.current, {
        isOnTileLanding: true,
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

      const tile = BOARD_TILES[tileIndex];
      const compactCost = formatBusinessTourCompact(check.cost);
      addLog(
        targetLevel === 4
          ? `${player.name} nâng cấp ${tile.name} lên KHÁCH SẠN BIỂU TƯỢNG (Cấp 4 ★ · Miễn mua lại, -${compactCost})!`
          : `${player.name} nâng cấp ${tile.name} lên Nhà Cấp ${targetLevel} (-${compactCost}).`,
        player.color,
        'positive'
      );
      completeTurnAfterAction(nextPlayers.find((p) => p.id === player.id));
    },
    [addLog, commitPlayers, commitProperties, completeTurnAfterAction]
  );

  const handleSkipOnTileUpgrade = useCallback(() => {
    if (turnPhaseRef.current !== 'UPGRADE_DECISION') return;
    completeTurnAfterAction();
  }, [completeTurnAfterAction]);

  const handleConfirmBuyout = useCallback(() => {
    if (turnPhaseRef.current !== 'BUYOUT_DECISION') return;
    const buyer = playersRef.current[activeIdxRef.current];
    if (!buyer) return;

    const tileIndex = buyer.position;
    const currProps = propertiesRef.current;
    const prop = currProps[tileIndex];
    const check = canBuyoutProperty(buyer, tileIndex, currProps);
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
        mortgaged: false,
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

    // In Business Tour, after buying out a city (level 0..3), if buyer can afford another house/Hotel, offer upgrade!
    if (prop.level < 4 && updatedBuyer.cash >= (tile.houseCost ?? 100)) {
      setTurnPhase('UPGRADE_DECISION');
    } else {
      completeTurnAfterAction(updatedBuyer);
    }
  }, [
    addLog,
    checkAndTriggerMatchVictory,
    commitPlayers,
    commitProperties,
    completeTurnAfterAction,
    triggerBotQuip,
  ]);

  const handleSkipBuyout = useCallback(() => {
    if (turnPhaseRef.current !== 'BUYOUT_DECISION') return;
    completeTurnAfterAction();
  }, [completeTurnAfterAction]);

  const handleSkipWorldTour = useCallback(() => {
    if (turnPhaseRef.current !== 'WORLD_TOUR') return;
    const player = playersRef.current[activeIdxRef.current];
    if (player) {
      addLog(
        `${player.name} nghỉ chân miễn phí tại sân bay Du Lịch Xuyên Việt.`,
        player.color
      );
    }
    completeTurnAfterAction(player);
  }, [addLog, completeTurnAfterAction]);

  const handleSelectWorldTourTarget = useCallback(
    async (targetTile: number) => {
      if (turnPhaseRef.current !== 'WORLD_TOUR') return;
      if (targetTile === WORLD_TOUR_TILE_INDEX) {
        handleSkipWorldTour();
        return;
      }

      const epoch = sessionEpochRef.current;
      const player = playersRef.current[activeIdxRef.current];
      if (!player || player.cash < WORLD_TOUR_FEE) {
        completeTurnAfterAction(player);
        return;
      }

      const destTile = BOARD_TILES[targetTile];
      if (!destTile) return;

      soundEngine.playCashPay();
      const { path, passedStart } = computePathToTile(player.position, targetTile, true);

      commitPlayers((prev) =>
        prev.map((p) =>
          p.id === player.id ? { ...p, cash: p.cash - WORLD_TOUR_FEE } : p
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
                cash: passedStart ? p.cash + START_SALARY : p.cash,
              }
            : p
        )
      );

      if (passedStart) {
        soundEngine.playCashGain();
        addLog(
          `${player.name} bay qua ô BẮT ĐẦU, nhận thưởng +${formatBusinessTourCompact(START_SALARY)}!`,
          player.color,
          'positive'
        );
      }

      await resolveTileLanding(player.id, targetTile, lastDiceSum || 7, epoch);
    },
    [
      addLog,
      commitPlayers,
      completeTurnAfterAction,
      handleSkipWorldTour,
      lastDiceSum,
      resolveTileLanding,
    ]
  );

  const handleExecuteTrade = useCallback(
    (offer: TradeOffer) => {
      const fromP = playersRef.current.find((p) => p.id === offer.fromPlayerId);
      const toP = playersRef.current.find((p) => p.id === offer.toPlayerId);
      const { players: nextPlayers, properties: nextProps } = executeTradeOffer(
        offer,
        playersRef.current,
        propertiesRef.current
      );

      commitPlayers(nextPlayers);
      commitProperties(nextProps);
      setShowTradeModal(false);
      soundEngine.playAuctionGavel();

      const formatSide = (tileIndices: number[], cash: number) => {
        const parts: string[] = tileIndices.map((idx) => BOARD_TILES[idx]?.name || '');
        if (cash > 0) parts.push(formatBusinessTourCompact(cash));
        return parts.join(' + ') || '0K';
      };

      const giveStr = formatSide(offer.offeredTileIndices, offer.offeredCash);
      const recvStr = formatSide(offer.requestedTileIndices, offer.requestedCash);

      addLog(
        `Thương vụ thành công: ${fromP?.name} trao (${giveStr}) đổi lấy (${recvStr}) từ ${toP?.name}!`,
        fromP?.color,
        'positive'
      );

      if (toP && toP.isBot && offer.offeredTileIndices.length > 0) {
        const updatedBot = nextPlayers.find((p) => p.id === toP.id) || toP;
        const topTileIdx = [...offer.offeredTileIndices].sort(
          (a, b) => (BOARD_TILES[b]?.price ?? 0) - (BOARD_TILES[a]?.price ?? 0)
        )[0];
        triggerBotQuip(
          buildBotBuyQuipPayload(
            updatedBot,
            topTileIdx,
            offer.requestedCash,
            nextProps,
            'TRADE'
          )
        );
      }

      checkAndTriggerMatchVictory(nextPlayers, nextProps);
    },
    [addLog, checkAndTriggerMatchVictory, commitPlayers, commitProperties, triggerBotQuip]
  );

  const handleConfirmCard = useCallback(async () => {
    if (turnPhaseRef.current !== 'CARD_REVEAL' || !drawnCard) return;
    const epoch = sessionEpochRef.current;
    const card = drawnCard;
    const player = playersRef.current[activeIdxRef.current];
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
        `${player.name} cất giữ 1 Thẻ Ra Tù Miễn Phí.`,
        player.color,
        'positive'
      );
      completeTurnAfterAction(nextPlayers.find((p) => p.id === player.id));
    } else if (eff.type === 'GO_TO_JAIL') {
      soundEngine.playJailAlert();
      setTurnPhase('MOVING_TOKEN');
      await canvasRef.current?.animateTokenPath(
        player.id,
        [JAIL_TILE_INDEX],
        speedRef.current
      );
      if (sessionEpochRef.current !== epoch) return;
      const nextPlayers = commitPlayers((prev) =>
        prev.map((p) =>
          p.id === player.id
            ? {
                ...p,
                position: JAIL_TILE_INDEX,
                inJail: true,
                jailTurns: 0,
                doublesStreak: 0,
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
              }
            : p
        )
      );
      if (passedStart) {
        soundEngine.playCashGain();
        addLog(
          `${player.name} đi qua ô BẮT ĐẦU, nhận +${formatBusinessTourCompact(START_SALARY)}!`,
          player.color,
          'positive'
        );
      }
      await resolveTileLanding(player.id, eff.targetTile, lastDiceSum || 7, epoch);
    } else if (eff.type === 'MOVE_RELATIVE') {
      const stepsAbs = Math.abs(eff.steps);
      const dir = eff.steps >= 0 ? 1 : -1;
      const path: number[] = [];
      let cur = player.position;
      for (let i = 0; i < stepsAbs; i++) {
        cur = (cur + dir + TOTAL_TILES) % TOTAL_TILES;
        path.push(cur);
      }
      setTurnPhase('MOVING_TOKEN');
      await canvasRef.current?.animateTokenPath(
        player.id,
        path,
        speedRef.current,
        (stepIdx) => soundEngine.playTokenHop(stepIdx)
      );
      if (sessionEpochRef.current !== epoch) return;
      commitPlayers((prev) =>
        prev.map((p) => (p.id === player.id ? { ...p, position: cur } : p))
      );
      await resolveTileLanding(player.id, cur, lastDiceSum || 7, epoch);
    } else if (eff.type === 'HOUSE_REPAIR') {
      let houses = 0;
      let hotels = 0;
      for (const pr of Object.values(propertiesRef.current)) {
        if (pr.ownerId === player.id) {
          if (pr.level === 4) hotels += 1;
          else houses += pr.level;
        }
      }
      const bill = houses * eff.perHouse + hotels * eff.perHotel;
      if (bill === 0) {
        addLog(
          `${player.name} chưa có công trình nào cần bảo trì (0K).`,
          player.color
        );
        completeTurnAfterAction(player);
      } else {
        applyPaymentOrDebt(player.id, bill, null, card.title);
      }
    }
  }, [
    addLog,
    applyPaymentOrDebt,
    commitPlayers,
    completeTurnAfterAction,
    drawnCard,
    lastDiceSum,
    resolveTileLanding,
  ]);

  const handleSellHouse = useCallback(
    (tileIndex: number) => {
      const player = playersRef.current[activeIdxRef.current];
      const prop = propertiesRef.current[tileIndex];
      if (!player || !prop || prop.ownerId !== player.id || prop.level <= 0) return;

      const check = canSellHouse(player.id, tileIndex, propertiesRef.current);
      if (!check.allowed) return;

      soundEngine.playCashGain();
      commitPlayers((prev) =>
        prev.map((p) => (p.id === player.id ? { ...p, cash: p.cash + check.refund } : p))
      );
      commitProperties((prev) => ({
        ...prev,
        [tileIndex]: {
          ...prev[tileIndex],
          level: prop.level - 1,
        },
      }));

      const tile = BOARD_TILES[tileIndex];
      addLog(
        `${player.name} bán 1 cấp nhà tại ${tile.name}, thu về +${formatBusinessTourCompact(check.refund)}.`,
        player.color
      );
    },
    [addLog, commitPlayers, commitProperties]
  );

  const handleSellProperty = useCallback(
    (tileIndex: number) => {
      const player = playersRef.current[activeIdxRef.current];
      const prop = propertiesRef.current[tileIndex];
      if (!player || !prop || prop.ownerId !== player.id || prop.level > 0) return;

      const refund = getPropertySellRefund(tileIndex);
      soundEngine.playCashGain();
      commitPlayers((prev) =>
        prev.map((p) => (p.id === player.id ? { ...p, cash: p.cash + refund } : p))
      );
      commitProperties((prev) => ({
        ...prev,
        [tileIndex]: {
          ...prev[tileIndex],
          ownerId: null,
          level: 0,
          mortgaged: false,
        },
      }));

      const tile = BOARD_TILES[tileIndex];
      addLog(
        `${player.name} nhượng lại quyền sở hữu ${tile.name} cho Ngân hàng (+${formatBusinessTourCompact(refund)}).`,
        player.color
      );
    },
    [addLog, commitPlayers, commitProperties]
  );

  const handlePayPendingDebt = useCallback(async () => {
    if (!pendingDebt) return;
    const epoch = sessionEpochRef.current;
    const player = playersRef.current[activeIdxRef.current];
    if (!player || player.cash < pendingDebt.amount) return;

    const { amount, creditorId, reason, postPayMoveSteps } = pendingDebt;
    const creditor =
      creditorId !== null ? playersRef.current.find((p) => p.id === creditorId) : null;
    const updatedPayerCash = player.cash - amount;

    const nextPlayers = commitPlayers((prev) =>
      prev.map((p) => {
        if (p.id === player.id) return { ...p, cash: updatedPayerCash };
        if (creditorId !== null && p.id === creditorId) {
          return { ...p, cash: p.cash + amount };
        }
        return p;
      })
    );
    if (creditorId === null) {
      setTaxPool((prev) => prev + amount);
    }
    soundEngine.playCashPay();
    addLog(
      `${player.name} đã thanh toán đủ khoản nợ ${formatBusinessTourCompact(amount)} (${reason})!`,
      player.color,
      'positive'
    );

    if (creditor && creditor.isBot) {
      triggerBotQuip(
        buildBotRentCollectedQuipPayload(
          { ...creditor, cash: creditor.cash + amount },
          player.name,
          player.position,
          amount,
          propertiesRef.current
        )
      );
    } else if (player.isBot) {
      triggerBotQuip(
        buildBotPenaltyQuipPayload(
          { ...player, cash: updatedPayerCash },
          reason,
          amount,
          creditor?.name
        )
      );
    }

    setPendingDebt(null);
    setShowAssetsModal(false);

    // If this debt was mandatory 3rd-turn Jail bail, immediately move forward by the rolled dice!
    if (postPayMoveSteps && postPayMoveSteps > 0) {
      const { path, finalTile, passedStart } = computeForwardSteps(
        player.position,
        postPayMoveSteps
      );
      setTurnPhase('MOVING_TOKEN');
      await canvasRef.current?.animateTokenPath(
        player.id,
        path,
        speedRef.current,
        (stepIdx) => soundEngine.playTokenHop(stepIdx)
      );
      if (sessionEpochRef.current !== epoch) return;

      commitPlayers((prev) =>
        prev.map((p) =>
          p.id === player.id
            ? {
                ...p,
                position: finalTile,
                cash: passedStart ? p.cash + START_SALARY : p.cash,
              }
            : p
        )
      );
      if (passedStart) {
        soundEngine.playCashGain();
        addLog(
          `${player.name} đi qua ô BẮT ĐẦU, nhận +${formatBusinessTourCompact(START_SALARY)}!`,
          player.color,
          'positive'
        );
      }
      await resolveTileLanding(player.id, finalTile, postPayMoveSteps, epoch);
      return;
    }

    completeTurnAfterAction(nextPlayers.find((p) => p.id === player.id));
  }, [addLog, commitPlayers, completeTurnAfterAction, pendingDebt, resolveTileLanding, triggerBotQuip]);

  const handleDeclareBankruptcy = useCallback(() => {
    const player = playersRef.current[activeIdxRef.current];
    if (!player) return;

    const creditorId = pendingDebt?.creditorId ?? null;
    const leftoverCash = Math.max(0, player.cash);

    const updatedPlayers = playersRef.current.map((p) => {
      if (p.id === player.id) {
        return {
          ...p,
          cash: 0,
          bankrupt: true,
          inJail: false,
          doublesStreak: 0,
        };
      }
      if (creditorId !== null && p.id === creditorId) {
        return { ...p, cash: p.cash + leftoverCash };
      }
      return p;
    });

    const nextProps: Record<number, PropertyState> = { ...propertiesRef.current };
    for (const key of Object.keys(nextProps)) {
      const idx = Number(key);
      if (nextProps[idx].ownerId === player.id) {
        nextProps[idx] = {
          tileIndex: idx,
          ownerId: creditorId,
          level: 0,
          mortgaged: false,
        };
      }
    }

    commitPlayers(updatedPlayers);
    commitProperties(nextProps);
    setPendingDebt(null);
    setShowAssetsModal(false);
    soundEngine.playJailAlert();
    addLog(
      `${player.name} chính thức tuyên bố PHÁ SẢN!`,
      player.color,
      'negative'
    );

    if (checkAndTriggerMatchVictory(updatedPlayers, nextProps)) {
      return;
    }

    const nextIdx = getNextActivePlayerIndex(updatedPlayers, activeIdxRef.current);
    setActivePlayerIndex(nextIdx);
    setTurnCount((t) => t + 1);
    setTurnPhase('AWAIT_ROLL');
  }, [addLog, checkAndTriggerMatchVictory, commitPlayers, commitProperties, pendingDebt]);

  const handleEndTurn = useCallback(() => {
    if (turnPhaseRef.current !== 'AWAIT_END_TURN') return;
    const currPlayers = playersRef.current;
    const currProps = propertiesRef.current;
    const current = currPlayers[activeIdxRef.current];

    if (checkAndTriggerMatchVictory(currPlayers, currProps)) {
      return;
    }

    if (shouldGrantImmediateDoublesRoll(current)) {
      addLog(
        `${current.name} được thưởng thêm 1 lượt đổ xúc xắc nhờ ra đôi!`,
        current.color,
        'highlight'
      );
      setTurnPhase('AWAIT_ROLL');
      return;
    }

    const nextIdx = getNextActivePlayerIndex(currPlayers, activeIdxRef.current);
    setActivePlayerIndex(nextIdx);
    setTurnCount((t) => t + 1);
    setTurnPhase('AWAIT_ROLL');
  }, [addLog, checkAndTriggerMatchVictory]);

  /* ==========================================
   * SMART BOT AI AUTOMATED TURN CHOREOGRAPHY
   * (Relaxed pacing + generous 3.6s reading window on CARD_REVEAL)
   * ========================================== */
  useEffect(() => {
    if (screenState !== 'playing') return;
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
        if (botShouldBuyProperty(current, current.position, properties)) {
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
    } else if (turnPhase === 'UPGRADE_DECISION') {
      timer = window.setTimeout(() => {
        const targetLvl = botPickOnTileUpgradeTargetLevel(
          current,
          current.position,
          properties
        );
        if (targetLvl !== null) {
          handleOnTileUpgrade(targetLvl);
        } else {
          handleSkipOnTileUpgrade();
        }
      }, Math.round(1400 / speedMultiplier));
    } else if (turnPhase === 'BUYOUT_DECISION') {
      timer = window.setTimeout(() => {
        if (botShouldBuyoutProperty(current, current.position, players, properties)) {
          handleConfirmBuyout();
        } else {
          handleSkipBuyout();
        }
      }, Math.round(1500 / speedMultiplier));
    } else if (turnPhase === 'WORLD_TOUR') {
      timer = window.setTimeout(() => {
        const dest = botPickWorldTourTarget(current, players, properties);
        if (dest !== null) {
          void handleSelectWorldTourTarget(dest);
        } else {
          handleSkipWorldTour();
        }
      }, Math.round(1500 / speedMultiplier));
    } else if (turnPhase === 'CARD_REVEAL') {
      // Give human players ~3.6s to read Khí Vận / Cơ Hội cards drawn by Bots
      timer = window.setTimeout(() => {
        void handleConfirmCard();
      }, Math.round(3600 / speedMultiplier));
    } else if (turnPhase === 'DEBT_RESOLUTION') {
      timer = window.setTimeout(() => {
        if (pendingDebt && current.cash >= pendingDebt.amount) {
          void handlePayPendingDebt();
          return;
        }
        const nextLiquidation = botPickAssetToLiquidate(current.id, properties);
        if (!nextLiquidation) {
          handleDeclareBankruptcy();
        } else if (nextLiquidation.action === 'SELL_HOUSE') {
          handleSellHouse(nextLiquidation.tileIndex);
        } else {
          handleSellProperty(nextLiquidation.tileIndex);
        }
      }, Math.round(950 / speedMultiplier));
    } else if (turnPhase === 'AWAIT_END_TURN') {
      timer = window.setTimeout(() => {
        handleEndTurn();
      }, Math.round(1350 / speedMultiplier));
    }

    return () => clearTimeout(timer);
  }, [
    screenState,
    players,
    properties,
    activePlayerIndex,
    turnPhase,
    speedMultiplier,
    pendingDebt,
    handleRollDice,
    handleUseJailCard,
    handlePayJailFine,
    handleBuyProperty,
    handleSkipBuy,
    handleOnTileUpgrade,
    handleSkipOnTileUpgrade,
    handleConfirmBuyout,
    handleSkipBuyout,
    handleSelectWorldTourTarget,
    handleSkipWorldTour,
    handleConfirmCard,
    handlePayPendingDebt,
    handleDeclareBankruptcy,
    handleSellHouse,
    handleSellProperty,
    handleEndTurn,
  ]);

  /* ==========================================
   * BUSINESS TOUR 3D TURN COUNTDOWN CLOCK
   * ========================================== */
  useEffect(() => {
    setTurnTimeLeft(TURN_COUNTDOWN_SECONDS);
  }, [activePlayerIndex, turnCount, turnPhase]);

  useEffect(() => {
    if (
      screenState !== 'playing' ||
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
  }, [screenState, turnPhase, activePlayerIndex, turnCount]);

  useEffect(() => {
    if (screenState !== 'playing' || turnTimeLeft > 0) return;
    const current = playersRef.current[activeIdxRef.current];
    if (!current || current.isBot || current.bankrupt) return;

    if (turnPhase === 'AWAIT_ROLL') {
      void handleRollDice();
    } else if (turnPhase === 'BUY_DECISION') {
      handleSkipBuy();
    } else if (turnPhase === 'UPGRADE_DECISION') {
      handleSkipOnTileUpgrade();
    } else if (turnPhase === 'BUYOUT_DECISION') {
      handleSkipBuyout();
    } else if (turnPhase === 'WORLD_TOUR') {
      handleSkipWorldTour();
    } else if (turnPhase === 'CARD_REVEAL') {
      void handleConfirmCard();
    } else if (turnPhase === 'AWAIT_END_TURN') {
      handleEndTurn();
    }
  }, [
    screenState,
    turnTimeLeft,
    turnPhase,
    handleRollDice,
    handleSkipBuy,
    handleSkipOnTileUpgrade,
    handleSkipBuyout,
    handleSkipWorldTour,
    handleConfirmCard,
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

      if (screenState === 'title') {
        if (e.code === 'Enter' || e.code === 'Space') {
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
        if (showTradeModal) {
          setShowTradeModal(false);
          return;
        }
        if (showAssetsModal && !pendingDebt) {
          setShowAssetsModal(false);
          return;
        }
        if (screenState === 'playing') {
          setScreenState('paused');
        } else if (screenState === 'paused') {
          setScreenState('playing');
        }
        return;
      }

      if (screenState !== 'playing') return;

      if (e.code === 'KeyR') {
        canvasRef.current?.resetCamera();
      } else if (e.code === 'KeyC') {
        handleToggleCinematic();
      } else if (e.code === 'KeyN') {
        handleToggleNightMode();
      } else if (e.code === 'KeyH') {
        setDockCollapsed((v) => !v);
      } else if (e.code === 'KeyM') {
        setSoundMuted((prev) => {
          const next = !prev;
          soundEngine.setMuted(next);
          return next;
        });
      } else if (e.code === 'Space') {
        const curr = playersRef.current[activeIdxRef.current];
        if (curr && !curr.isBot && !curr.bankrupt && !showTradeModal) {
          e.preventDefault();
          if (turnPhaseRef.current === 'AWAIT_ROLL') {
            void handleRollDice();
          } else if (turnPhaseRef.current === 'AWAIT_END_TURN') {
            handleEndTurn();
          }
        }
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    screenState,
    setupConfigs,
    startingCash,
    selectedTileIndex,
    showTradeModal,
    showAssetsModal,
    showRulebookModal,
    pendingDebt,
    startNewGame,
    handleRollDice,
    handleEndTurn,
    handleToggleCinematic,
    handleToggleNightMode,
  ]);

  const currentPlayer = players[activePlayerIndex] || players[0];
  const computedWinner = useMemo(
    () => matchWinnerResult || evaluateMatchWinner(players, properties),
    [matchWinnerResult, players, properties]
  );
  const canTrade = useMemo(
    () => players.filter((p) => !p.bankrupt).length >= 2,
    [players]
  );

  const ownedCount = useMemo(() => {
    if (!currentPlayer) return 0;
    let owned = 0;
    for (const pr of Object.values(properties)) {
      if (pr.ownerId === currentPlayer.id) {
        owned += 1;
      }
    }
    return owned;
  }, [currentPlayer, properties]);

  const canHumanActOnAssets =
    screenState === 'playing' &&
    !currentPlayer.isBot &&
    (turnPhase === 'AWAIT_ROLL' ||
      turnPhase === 'AWAIT_END_TURN' ||
      turnPhase === 'DEBT_RESOLUTION');

  const buyoutOwner = useMemo(() => {
    if (turnPhase !== 'BUYOUT_DECISION' || !currentPlayer) return null;
    const ownerId = properties[currentPlayer.position]?.ownerId;
    if (ownerId === null || ownerId === undefined) return null;
    return players.find((p) => p.id === ownerId) || null;
  }, [currentPlayer, players, properties, turnPhase]);

  const handleTriggerEmote = useCallback((emoteText: string) => {
    soundEngine.playChatPop();
    setPlayerEmoteText(emoteText);
    if (emoteTimerRef.current) {
      window.clearTimeout(emoteTimerRef.current);
    }
    emoteTimerRef.current = window.setTimeout(() => {
      setPlayerEmoteText(null);
    }, 3200);
  }, []);

  const activeSpeechText = useMemo(() => {
    if (screenState !== 'playing' || !currentPlayer) return null;
    if (landingCueText) return landingCueText;
    if (
      turnPhase === 'CARD_REVEAL' ||
      turnPhase === 'DEBT_RESOLUTION' ||
      showAssetsModal ||
      showTradeModal ||
      showRulebookModal
    ) {
      return null;
    }
    if (playerEmoteText) return playerEmoteText;
    if (turnPhase === 'ROLLING_DICE') return 'Đang đổ xúc xắc... 🎲';
    if (turnPhase === 'MOVING_TOKEN') return 'Đang di chuyển...';
    if (turnPhase === 'BUY_DECISION') return 'Mua ô đất này?';
    if (turnPhase === 'UPGRADE_DECISION') return 'Nâng cấp nhà!';
    if (turnPhase === 'BUYOUT_DECISION') return 'Mua lại 2×?';
    if (turnPhase === 'WORLD_TOUR') return 'Bay du lịch! ✈️';
    if (turnPhase === 'AWAIT_ROLL') {
      if (shouldGrantImmediateDoublesRoll(currentPlayer)) {
        return currentPlayer.isBot
          ? 'Ra đôi! Đang đổ thêm lượt... 🎲'
          : 'Ra đôi! Đổ thêm lượt nữa! 🎲';
      }
      return currentPlayer.isBot ? 'Đang chuẩn bị đổ...' : 'Tới lượt bạn! 🎲';
    }
    return null;
  }, [
    screenState,
    currentPlayer,
    landingCueText,
    playerEmoteText,
    turnPhase,
    showAssetsModal,
    showTradeModal,
    showRulebookModal,
  ]);

  const handleCanvasTileClick = useCallback(
    (idx: number) => {
      if (
        screenStateRef.current === 'playing' &&
        turnPhaseRef.current === 'WORLD_TOUR' &&
        !playersRef.current[activeIdxRef.current]?.isBot
      ) {
        void handleSelectWorldTourTarget(idx);
        return;
      }
      setSelectedTileIndex(idx);
    },
    [handleSelectWorldTourTarget]
  );

  const canShowTileInspector =
    selectedTileIndex !== null &&
    screenState !== 'title' &&
    !showAssetsModal &&
    !showTradeModal &&
    !showRulebookModal &&
    turnPhase !== 'WORLD_TOUR' &&
    turnPhase !== 'CARD_REVEAL' &&
    turnPhase !== 'BUY_DECISION' &&
    turnPhase !== 'UPGRADE_DECISION' &&
    turnPhase !== 'BUYOUT_DECISION' &&
    turnPhase !== 'DEBT_RESOLUTION';

  return (
    <main className="relative h-full w-full overflow-hidden">
      {/* 1. Isolated 3D Low-Poly Isometric Board Viewport */}
      <MonopolyCanvas
        ref={canvasRef}
        players={players}
        properties={properties}
        selectedTileIndex={selectedTileIndex}
        activePlayerId={screenState === 'playing' ? currentPlayer?.id ?? null : null}
        taxPool={taxPool}
        turnTimeLeft={turnTimeLeft}
        turnCount={turnCount}
        activeSpeechText={activeSpeechText}
        cinematicCamera={cinematicCamera}
        nightMode={nightMode}
        onSelectTile={handleCanvasTileClick}
      />

      {/* 1b. Brief Pre-Popup Landing Cue Banner so players read which tile triggered */}
      {screenState === 'playing' && landingCueText && (
        <div
          data-testid="bt-landing-cue"
          className="fixed top-4 left-1/2 -translate-x-1/2 z-30 px-5 py-2 rounded-full bt-casual-modal pointer-events-none animate-pop-in"
        >
          <span className="font-display text-xs sm:text-sm font-black text-sky-900 whitespace-nowrap">
            {landingCueText}
          </span>
        </div>
      )}

      {/* 2. Start Screen Setup Modal */}
      {screenState === 'title' && (
        <StartModal
          initialConfigs={setupConfigs}
          initialStartingCash={startingCash}
          onStartGame={startNewGame}
          onOpenRulebook={() => setShowRulebookModal(true)}
        />
      )}

      {/* 3. Active Playing 4-Corner HUD & Business Tour Center/Right Controls */}
      {screenState !== 'title' && (
        <>
          <PlayerHUD
            players={players}
            activePlayerIndex={activePlayerIndex}
            properties={properties}
            botBubbles={botBubbles}
            onDismissBubble={dismissBotBubble}
            onSelectTile={handleCanvasTileClick}
          />

          <ActionDock
            currentPlayer={currentPlayer}
            turnCount={turnCount}
            turnPhase={turnPhase}
            lastDice={lastDice}
            logs={logs}
            ownedCount={ownedCount}
            canTrade={canTrade}
            speedMultiplier={speedMultiplier}
            cinematicCamera={cinematicCamera}
            nightMode={nightMode}
            soundMuted={soundMuted}
            dockCollapsed={dockCollapsed}
            onToggleDock={() => setDockCollapsed((v) => !v)}
            onRollDice={() => void handleRollDice()}
            onPayJailFine={handlePayJailFine}
            onUseJailCard={handleUseJailCard}
            onOpenAssetsModal={() => {
              setSelectedTileIndex(null);
              setShowAssetsModal(true);
            }}
            onOpenTradeModal={() => {
              setSelectedTileIndex(null);
              setShowTradeModal(true);
            }}
            onOpenRulebook={() => {
              setSelectedTileIndex(null);
              setShowRulebookModal(true);
            }}
            onEndTurn={handleEndTurn}
            onChangeSpeed={(sp) => setSpeedMultiplier(sp)}
            onToggleCinematic={handleToggleCinematic}
            onToggleNightMode={handleToggleNightMode}
            onResetCamera={() => canvasRef.current?.resetCamera()}
            onToggleSound={() => {
              const next = !soundMuted;
              setSoundMuted(next);
              soundEngine.setMuted(next);
            }}
            onOpenPause={() => setScreenState('paused')}
            onTriggerEmote={handleTriggerEmote}
          />
        </>
      )}

      {/* 4. Raycasted 3D Tile Detail Card */}
      {canShowTileInspector && selectedTileIndex !== null && (
        <TileInspectorCard
          tileIndex={selectedTileIndex}
          players={players}
          properties={properties}
          currentPlayer={currentPlayer}
          canActOnAssets={canHumanActOnAssets}
          onSellHouse={handleSellHouse}
          onClose={() => setSelectedTileIndex(null)}
        />
      )}

      {/* 5. Contextual Buy Unowned Property Prompt (Human Turn) */}
      {screenState === 'playing' &&
        turnPhase === 'BUY_DECISION' &&
        !currentPlayer.isBot && (
          <BuyDecisionModal
            tileIndex={currentPlayer.position}
            player={currentPlayer}
            properties={properties}
            onBuy={handleBuyProperty}
            onSkip={handleSkipBuy}
          />
        )}

      {/* 5b. Business Tour On-Tile Upgrade Prompt (Human Revisit Own City) */}
      {screenState === 'playing' &&
        turnPhase === 'UPGRADE_DECISION' &&
        !currentPlayer.isBot && (
          <UpgradeDecisionModal
            tileIndex={currentPlayer.position}
            player={currentPlayer}
            properties={properties}
            onUpgradeToLevel={handleOnTileUpgrade}
            onSkip={handleSkipOnTileUpgrade}
          />
        )}

      {/* 5c. Business Tour 2x Opponent City Buyout Prompt (Human Turn) */}
      {screenState === 'playing' &&
        turnPhase === 'BUYOUT_DECISION' &&
        !currentPlayer.isBot &&
        buyoutOwner && (
          <BuyoutDecisionModal
            tileIndex={currentPlayer.position}
            buyer={currentPlayer}
            owner={buyoutOwner}
            properties={properties}
            rentPaid={lastRentPaid}
            onConfirmBuyout={handleConfirmBuyout}
            onSkipBuyout={handleSkipBuyout}
          />
        )}

      {/* 5d. Business Tour World Tour Flight Selector (Corner 14) */}
      {screenState === 'playing' &&
        turnPhase === 'WORLD_TOUR' &&
        !currentPlayer.isBot && (
          <WorldTourPrompt
            player={currentPlayer}
            properties={properties}
            onSelectTargetTile={(idx) => void handleSelectWorldTourTarget(idx)}
            onSkipWorldTour={handleSkipWorldTour}
          />
        )}

      {/* 6. Chance / Community Chest Drawn Card Modal */}
      {screenState === 'playing' && turnPhase === 'CARD_REVEAL' && drawnCard && (
        <LuckCardModal
          card={drawnCard}
          isBot={currentPlayer.isBot}
          onConfirm={() => void handleConfirmCard()}
        />
      )}

      {/* 7. Property Management & Debt Liquidation Modal */}
      {screenState === 'playing' &&
        !currentPlayer.isBot &&
        (showAssetsModal || turnPhase === 'DEBT_RESOLUTION') && (
          <AssetManagementModal
            player={currentPlayer}
            properties={properties}
            pendingDebt={pendingDebt}
            onSellHouse={handleSellHouse}
            onSellProperty={handleSellProperty}
            onPayPendingDebt={() => void handlePayPendingDebt()}
            onDeclareBankruptcy={handleDeclareBankruptcy}
            onClose={() => {
              if (!pendingDebt) setShowAssetsModal(false);
            }}
          />
        )}

      {/* 7b. Player-to-Player & Bot AI Property + Cash Trade Modal */}
      {screenState === 'playing' &&
        !currentPlayer.isBot &&
        showTradeModal &&
        (turnPhase === 'AWAIT_ROLL' || turnPhase === 'AWAIT_END_TURN') && (
          <TradeModal
            proposer={currentPlayer}
            players={players}
            properties={properties}
            onExecuteTrade={handleExecuteTrade}
            onClose={() => setShowTradeModal(false)}
          />
        )}

      {/* 8. Pause Modal */}
      {screenState === 'paused' && (
        <PauseModal
          onResume={() => setScreenState('playing')}
          onOpenRulebook={() => {
            setSelectedTileIndex(null);
            setShowRulebookModal(true);
          }}
          onResetCamera={() => {
            canvasRef.current?.resetCamera();
            setScreenState('playing');
          }}
          onRestartToTitle={() => {
            sessionEpochRef.current += 1;
            setLandingCueText(null);
            setScreenState('title');
          }}
        />
      )}

      {/* 9. Victory Celebration Modal with Confetti */}
      {screenState === 'gameover' && computedWinner && (
        <VictoryModal
          winner={computedWinner.winner}
          victoryLabel={computedWinner.label}
          players={players}
          properties={properties}
          turnCount={turnCount}
          onPlayAgain={() => {
            sessionEpochRef.current += 1;
            setLandingCueText(null);
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
