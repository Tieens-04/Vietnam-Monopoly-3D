import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { soundEngine } from './audio/soundEngine';
import { ActionDock } from './components/ActionDock';
import { AuctionModal, TradeModal } from './components/AuctionAndTradeModals';
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
  applyAuctionBid,
  applyAuctionPass,
  botChooseJailAction,
  botDecideAuctionTurn,
  botPickAssetToLiquidate,
  botPickUpgradeTile,
  botShouldBuyProperty,
  buildBotBuyQuipPayload,
  buildBotPenaltyQuipPayload,
  buildBotRentCollectedQuipPayload,
  calculateRent,
  canUpgradeProperty,
  computeForwardSteps,
  computePathToTile,
  createAuctionState,
  createInitialPlayers,
  createInitialProperties,
  executeTradeOffer,
  getHouseSellRefund,
  getNextActivePlayerIndex,
  getPropertySellRefund,
  getWinner,
  isPurchasableTile,
  JAIL_FINE,
  JAIL_TILE_INDEX,
  MAX_JAIL_TURNS,
  START_SALARY,
  TOTAL_TILES,
} from './game/rules';
import {
  AuctionState,
  BotChatBubbleState,
  BotQuipPayload,
  GameLogEntry,
  GameScreenState,
  LuckCard,
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
  const isAutostart = useMemo(() => {
    if (typeof window === 'undefined') return false;
    return new URLSearchParams(window.location.search).get('autostart') === '1';
  }, []);

  const [setupConfigs, setSetupConfigs] =
    useState<PlayerSetupConfig[]>(DEFAULT_PLAYER_CONFIGS);
  const [startingCash, setStartingCash] = useState<number>(1500);

  const [screenState, setScreenState] = useState<GameScreenState>(() =>
    isAutostart ? 'playing' : 'title'
  );
  const [players, setPlayers] = useState<PlayerState[]>(() =>
    createInitialPlayers(DEFAULT_PLAYER_CONFIGS, 1500)
  );
  const [properties, setProperties] = useState<Record<number, PropertyState>>(() =>
    createInitialProperties()
  );
  const [activePlayerIndex, setActivePlayerIndex] = useState<number>(0);
  const [turnPhase, setTurnPhase] = useState<TurnPhase>('AWAIT_ROLL');
  const [turnCount, setTurnCount] = useState<number>(1);
  const [lastDice, setLastDice] = useState<[number, number] | null>(null);
  const [lastDiceSum, setLastDiceSum] = useState<number>(0);

  const [selectedTileIndex, setSelectedTileIndex] = useState<number | null>(null);
  const [showAssetsModal, setShowAssetsModal] = useState<boolean>(false);
  const [showTradeModal, setShowTradeModal] = useState<boolean>(false);
  const [auctionState, setAuctionState] = useState<AuctionState | null>(null);
  const [drawnCard, setDrawnCard] = useState<LuckCard | null>(null);
  const [pendingDebt, setPendingDebt] = useState<PendingDebt | null>(null);
  const [botUpgradedThisTurn, setBotUpgradedThisTurn] = useState<boolean>(false);

  const [speedMultiplier, setSpeedMultiplier] = useState<1 | 2>(1);
  const [cinematicCamera, setCinematicCamera] = useState<boolean>(false);
  const [nightMode, setNightMode] = useState<boolean>(false);
  const [soundMuted, setSoundMuted] = useState<boolean>(false);
  const [dockCollapsed, setDockCollapsed] = useState<boolean>(false);
  const [botBubbles, setBotBubbles] = useState<Record<number, BotChatBubbleState>>({});

  const [logs, setLogs] = useState<GameLogEntry[]>(() => [
    {
      id: 1,
      turn: 1,
      text: 'Chào mừng đến với Cờ Tỷ Phú Việt Nam 3D! Hãy đổ xúc xắc để khởi hành.',
      tone: 'highlight',
    },
  ]);

  const canvasRef = useRef<MonopolyCanvasHandle | null>(null);
  const logIdRef = useRef<number>(2);
  const sessionEpochRef = useRef<number>(1);
  const quipSeqRef = useRef<number>(1);
  const bubbleTimersRef = useRef<Record<number, number>>({});
  const chanceDeckRef = useRef<LuckCard[]>(shuffleCards(CHANCE_CARDS));
  const chestDeckRef = useRef<LuckCard[]>(shuffleCards(CHEST_CARDS));

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
  const auctionRef = useRef(auctionState);
  auctionRef.current = auctionState;

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
              : 'Không thể kết nối máy chủ Gemini API.';
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
      setBotBubbles({});

      setSetupConfigs(configs);
      setStartingCash(cash);

      const initPlayers = createInitialPlayers(configs, cash);
      const initProps = createInitialProperties();

      chanceDeckRef.current = shuffleCards(CHANCE_CARDS);
      chestDeckRef.current = shuffleCards(CHEST_CARDS);

      setPlayers(initPlayers);
      setProperties(initProps);
      setActivePlayerIndex(0);
      setTurnPhase('AWAIT_ROLL');
      setTurnCount(1);
      setLastDice(null);
      setLastDiceSum(0);
      setSelectedTileIndex(null);
      setShowAssetsModal(false);
      setShowTradeModal(false);
      setAuctionState(null);
      setDrawnCard(null);
      setPendingDebt(null);
      setBotUpgradedThisTurn(false);

      logIdRef.current = 2;
      setLogs([
        {
          id: 1,
          turn: 1,
          text: `Ván đấu bắt đầu với ${initPlayers.length} người chơi (Vốn $${cash.toLocaleString('en-US')})!`,
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
    []
  );

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
   * If insufficient cash, enters DEBT_RESOLUTION so player/bot can liquidate houses/properties or go bankrupt.
   */
  const applyPaymentOrDebt = useCallback(
    (
      payerId: number,
      amount: number,
      creditorId: number | null,
      reason: string
    ) => {
      const currPlayers = playersRef.current;
      const payer = currPlayers.find((p) => p.id === payerId);
      if (!payer) return;

      if (payer.cash >= amount) {
        const creditor =
          creditorId !== null ? currPlayers.find((p) => p.id === creditorId) : null;
        setPlayers((prev) =>
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
            `${payer.name} trả $${amount} tiền thuê (${reason}) cho ${creditor.name}.`,
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
          addLog(`${payer.name} nộp $${amount} (${reason}).`, payer.color, 'negative');
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
        setTurnPhase('AWAIT_END_TURN');
      } else {
        setPendingDebt({ amount, creditorId, reason });
        setTurnPhase('DEBT_RESOLUTION');
        if (!payer.isBot) {
          setShowAssetsModal(true);
        }
        addLog(
          `${payer.name} thiếu tiền mặt để trả $${amount} (${reason}) — cần bán tài sản hoặc phá sản!`,
          payer.color,
          'negative'
        );
      }
    },
    [addLog, triggerBotQuip]
  );

  /**
   * Resolves landing on `tileIndex` after token finishes hopping.
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

      if (
        tile.kind === TileKind.START ||
        tile.kind === TileKind.JAIL ||
        tile.kind === TileKind.FREE_PARKING
      ) {
        if (tile.kind === TileKind.FREE_PARKING) {
          addLog(`${player.name} nghỉ chân tại Bãi Đỗ Xe Miễn Phí.`, player.color);
        } else if (tile.kind === TileKind.JAIL) {
          addLog(`${player.name} ghé Thăm Tù bình thường.`, player.color);
        }
        setTurnPhase('AWAIT_END_TURN');
        return;
      }

      if (tile.kind === TileKind.GO_TO_JAIL) {
        soundEngine.playJailAlert();
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

        setPlayers((prev) =>
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
        setTurnPhase('AWAIT_END_TURN');
        return;
      }

      if (tile.kind === TileKind.TAX) {
        const tax = tile.taxAmount || 150;
        applyPaymentOrDebt(player.id, tax, null, tile.name);
        return;
      }

      if (isPurchasableTile(tile)) {
        const prop = currProps[tileIndex];
        if (!prop || prop.ownerId === null) {
          setTurnPhase('BUY_DECISION');
          return;
        }
        if (prop.ownerId === player.id) {
          addLog(`${player.name} dừng tại tài sản nhà ở ${tile.name}.`, player.color);
          setTurnPhase('AWAIT_END_TURN');
          return;
        }

        const owner = currPlayers.find((p) => p.id === prop.ownerId && !p.bankrupt);
        if (!owner) {
          setTurnPhase('AWAIT_END_TURN');
          return;
        }

        const rent = calculateRent(tileIndex, currProps, diceSum);
        applyPaymentOrDebt(player.id, rent, owner.id, tile.name);
        return;
      }

      if (tile.kind === TileKind.CHANCE || tile.kind === TileKind.CHEST) {
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

      setTurnPhase('AWAIT_END_TURN');
    },
    [addLog, applyPaymentOrDebt, drawNextCard]
  );

  /**
   * Executes primary Dice Roll + 3D Dice Bounce + Token Hop sequence.
   */
  const handleRollDice = useCallback(async () => {
    if (screenStateRef.current !== 'playing' || turnPhaseRef.current !== 'AWAIT_ROLL') {
      return;
    }

    const epoch = sessionEpochRef.current;
    const player = playersRef.current[activeIdxRef.current];
    if (!player || player.bankrupt) return;

    const die1 = Math.floor(Math.random() * 6) + 1;
    const die2 = Math.floor(Math.random() * 6) + 1;
    const sum = die1 + die2;
    const isDoubles = die1 === die2;

    setLastDice([die1, die2]);
    setLastDiceSum(sum);
    setTurnPhase('ROLLING_DICE');
    soundEngine.playDiceRoll();

    await canvasRef.current?.animateDiceRoll(die1, die2, speedRef.current);
    if (sessionEpochRef.current !== epoch) return;

    // Re-read fresh player state
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
        setPlayers((prev) =>
          prev.map((p) =>
            p.id === freshPlayer.id
              ? { ...p, inJail: false, jailTurns: 0, doublesStreak: 0 }
              : p
          )
        );
      } else if (freshPlayer.jailTurns + 1 >= MAX_JAIL_TURNS) {
        addLog(
          `${freshPlayer.name} hết 3 lượt trong Nhà Tù — bắt buộc nộp phạt $${JAIL_FINE} và đi ${sum} bước.`,
          freshPlayer.color,
          'negative'
        );
        if (freshPlayer.cash >= JAIL_FINE) {
          soundEngine.playCashPay();
          setPlayers((prev) =>
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
          setPlayers((prev) =>
            prev.map((p) =>
              p.id === freshPlayer.id ? { ...p, inJail: false, jailTurns: 0 } : p
            )
          );
          applyPaymentOrDebt(freshPlayer.id, JAIL_FINE, null, 'Tiền bảo lãnh Nhà Tù');
          return;
        }
      } else {
        const nextTry = freshPlayer.jailTurns + 1;
        addLog(
          `${freshPlayer.name} đổ (${die1}-${die2}) không ra đôi, tiếp tục ở Nhà Tù (${nextTry}/${MAX_JAIL_TURNS}).`,
          freshPlayer.color
        );
        setPlayers((prev) =>
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

        setPlayers((prev) =>
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

      setPlayers((prev) =>
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

    setPlayers((prev) =>
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
        `${freshPlayer.name} đi qua ô BẮT ĐẦU, nhận thưởng +$${START_SALARY}!`,
        freshPlayer.color,
        'positive'
      );
    }

    await resolveTileLanding(freshPlayer.id, finalTile, sum, epoch);
  }, [addLog, applyPaymentOrDebt, resolveTileLanding]);

  const handlePayJailFine = useCallback(() => {
    const player = playersRef.current[activeIdxRef.current];
    if (!player || !player.inJail || player.cash < JAIL_FINE) return;

    soundEngine.playCashPay();
    setPlayers((prev) =>
      prev.map((p) =>
        p.id === player.id
          ? { ...p, cash: p.cash - JAIL_FINE, inJail: false, jailTurns: 0 }
          : p
      )
    );
    addLog(
      `${player.name} nộp phạt $${JAIL_FINE} để rời khỏi Nhà Tù ngay lập tức.`,
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
  }, [addLog, triggerBotQuip]);

  const handleUseJailCard = useCallback(() => {
    const player = playersRef.current[activeIdxRef.current];
    if (!player || !player.inJail || player.jailFreeCards <= 0) return;

    soundEngine.playCardDraw();
    setPlayers((prev) =>
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
  }, [addLog]);

  const handleBuyProperty = useCallback(() => {
    if (turnPhaseRef.current !== 'BUY_DECISION') return;
    const player = playersRef.current[activeIdxRef.current];
    if (!player) return;

    const tile = BOARD_TILES[player.position];
    const price = tile?.price || 0;
    if (!tile || player.cash < price) {
      setTurnPhase('AWAIT_END_TURN');
      return;
    }

    const nextProps: Record<number, PropertyState> = {
      ...propertiesRef.current,
      [tile.index]: {
        tileIndex: tile.index,
        ownerId: player.id,
        level: 0,
      },
    };

    soundEngine.playBuyProperty();
    setPlayers((prev) =>
      prev.map((p) => (p.id === player.id ? { ...p, cash: p.cash - price } : p))
    );
    setProperties(nextProps);
    addLog(
      `${player.name} mua thành công ${tile.name} với giá $${price}!`,
      player.color,
      'positive'
    );
    if (player.isBot) {
      triggerBotQuip(
        buildBotBuyQuipPayload(
          { ...player, cash: player.cash - price },
          tile.index,
          price,
          nextProps,
          'DIRECT'
        )
      );
    }
    setTurnPhase('AWAIT_END_TURN');
  }, [addLog, triggerBotQuip]);

  const concludeAuction = useCallback(
    (completed: AuctionState) => {
      const tile = BOARD_TILES[completed.tileIndex];
      if (completed.winnerId !== null && completed.currentBid > 0) {
        const winner = playersRef.current.find((p) => p.id === completed.winnerId);
        const nextProps: Record<number, PropertyState> = {
          ...propertiesRef.current,
          [completed.tileIndex]: {
            tileIndex: completed.tileIndex,
            ownerId: completed.winnerId,
            level: 0,
          },
        };
        soundEngine.playAuctionGavel();
        setPlayers((prev) =>
          prev.map((p) =>
            p.id === completed.winnerId
              ? { ...p, cash: p.cash - completed.currentBid }
              : p
          )
        );
        setProperties(nextProps);
        addLog(
          `${winner?.name || 'Người chơi'} thắng đấu giá ${tile.name} với mức giá $${completed.currentBid}!`,
          winner?.color,
          'positive'
        );
        if (winner && winner.isBot) {
          triggerBotQuip(
            buildBotBuyQuipPayload(
              { ...winner, cash: winner.cash - completed.currentBid },
              completed.tileIndex,
              completed.currentBid,
              nextProps,
              'AUCTION'
            )
          );
        }
      } else {
        addLog(`Phiên đấu giá ${tile.name} kết thúc mà không có người mua.`);
      }
      setAuctionState(null);
      setTurnPhase('AWAIT_END_TURN');
    },
    [addLog, triggerBotQuip]
  );

  const handleSkipBuy = useCallback(() => {
    if (turnPhaseRef.current !== 'BUY_DECISION') return;
    const player = playersRef.current[activeIdxRef.current];
    if (!player) {
      setTurnPhase('AWAIT_END_TURN');
      return;
    }

    const tile = BOARD_TILES[player.position];
    const initAuction = createAuctionState(
      player.position,
      playersRef.current,
      player.id
    );
    addLog(
      `${player.name} bỏ qua mua trực tiếp ${tile.name} — Mở phiên Đấu Giá Công Khai (khởi điểm $${initAuction.startingBid})!`,
      player.color,
      'highlight'
    );

    if (initAuction.status === 'COMPLETED') {
      concludeAuction(initAuction);
    } else {
      setAuctionState(initAuction);
      setTurnPhase('AUCTION');
    }
  }, [addLog, concludeAuction]);

  const handleAuctionBid = useCallback(
    (bidderId: number, amount: number) => {
      const curr = auctionRef.current;
      if (!curr || curr.status !== 'ACTIVE') return;
      const next = applyAuctionBid(curr, bidderId, amount, playersRef.current);
      if (next === curr) return;
      soundEngine.playAuctionBid();
      if (next.status === 'COMPLETED') {
        concludeAuction(next);
      } else {
        setAuctionState(next);
      }
    },
    [concludeAuction]
  );

  const handleAuctionPass = useCallback(
    (bidderId: number) => {
      const curr = auctionRef.current;
      if (!curr || curr.status !== 'ACTIVE') return;
      const next = applyAuctionPass(curr, bidderId, playersRef.current);
      if (next === curr) return;
      if (next.status === 'COMPLETED') {
        concludeAuction(next);
      } else {
        setAuctionState(next);
      }
    },
    [concludeAuction]
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

      setPlayers(nextPlayers);
      setProperties(nextProps);
      setShowTradeModal(false);
      soundEngine.playAuctionGavel();

      const formatSide = (tileIndices: number[], cash: number) => {
        const parts: string[] = tileIndices.map((idx) => BOARD_TILES[idx]?.name || '');
        if (cash > 0) parts.push(`$${cash}`);
        return parts.join(' + ') || '$0';
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
    },
    [addLog, triggerBotQuip]
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
      setPlayers((prev) =>
        prev.map((p) => (p.id === player.id ? { ...p, cash: p.cash + eff.amount } : p))
      );
      addLog(
        `${player.name} nhận +$${eff.amount} (${card.title}).`,
        player.color,
        'positive'
      );
      setTurnPhase('AWAIT_END_TURN');
    } else if (eff.type === 'PAY_CASH') {
      applyPaymentOrDebt(player.id, eff.amount, null, card.title);
    } else if (eff.type === 'COLLECT_FROM_ALL') {
      let collected = 0;
      setPlayers((prev) => {
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
        `${player.name} nhận quà mừng tổng cộng +$${collected} từ các người chơi khác!`,
        player.color,
        'positive'
      );
      setTurnPhase('AWAIT_END_TURN');
    } else if (eff.type === 'JAIL_FREE_CARD') {
      setPlayers((prev) =>
        prev.map((p) =>
          p.id === player.id ? { ...p, jailFreeCards: p.jailFreeCards + 1 } : p
        )
      );
      addLog(
        `${player.name} cất giữ 1 Thẻ Ra Tù Miễn Phí.`,
        player.color,
        'positive'
      );
      setTurnPhase('AWAIT_END_TURN');
    } else if (eff.type === 'GO_TO_JAIL') {
      soundEngine.playJailAlert();
      setTurnPhase('MOVING_TOKEN');
      await canvasRef.current?.animateTokenPath(
        player.id,
        [JAIL_TILE_INDEX],
        speedRef.current
      );
      if (sessionEpochRef.current !== epoch) return;
      setPlayers((prev) =>
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
      setTurnPhase('AWAIT_END_TURN');
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
      setPlayers((prev) =>
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
          `${player.name} đi qua ô BẮT ĐẦU, nhận +$${START_SALARY}!`,
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
      setPlayers((prev) =>
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
          `${player.name} chưa có công trình nào cần bảo trì ($0).`,
          player.color
        );
        setTurnPhase('AWAIT_END_TURN');
      } else {
        applyPaymentOrDebt(player.id, bill, null, card.title);
      }
    }
  }, [addLog, applyPaymentOrDebt, drawnCard, lastDiceSum, resolveTileLanding]);

  const handleUpgradeProperty = useCallback(
    (tileIndex: number) => {
      const player = playersRef.current[activeIdxRef.current];
      if (!player) return;
      const check = canUpgradeProperty(player, tileIndex, propertiesRef.current);
      if (!check.allowed) return;

      const nextLevel = (propertiesRef.current[tileIndex]?.level || 0) + 1;
      soundEngine.playBuildHouse(nextLevel);
      setPlayers((prev) =>
        prev.map((p) => (p.id === player.id ? { ...p, cash: p.cash - check.cost } : p))
      );
      setProperties((prev) => ({
        ...prev,
        [tileIndex]: {
          ...prev[tileIndex],
          level: nextLevel,
        },
      }));

      const tile = BOARD_TILES[tileIndex];
      addLog(
        `${player.name} nâng cấp ${tile.name} lên ${
          nextLevel === 4 ? 'Khách sạn (Cấp 4)' : `${nextLevel} Nhà xanh`
        } (-$${check.cost}).`,
        player.color,
        'positive'
      );
    },
    [addLog]
  );

  const handleSellHouse = useCallback(
    (tileIndex: number) => {
      const player = playersRef.current[activeIdxRef.current];
      const prop = propertiesRef.current[tileIndex];
      if (!player || !prop || prop.ownerId !== player.id || prop.level <= 0) return;

      const refund = getHouseSellRefund(tileIndex);
      soundEngine.playCashGain();
      setPlayers((prev) =>
        prev.map((p) => (p.id === player.id ? { ...p, cash: p.cash + refund } : p))
      );
      setProperties((prev) => ({
        ...prev,
        [tileIndex]: {
          ...prev[tileIndex],
          level: prop.level - 1,
        },
      }));

      const tile = BOARD_TILES[tileIndex];
      addLog(
        `${player.name} bán 1 cấp nhà tại ${tile.name}, thu về +$${refund}.`,
        player.color
      );
    },
    [addLog]
  );

  const handleSellProperty = useCallback(
    (tileIndex: number) => {
      const player = playersRef.current[activeIdxRef.current];
      const prop = propertiesRef.current[tileIndex];
      if (!player || !prop || prop.ownerId !== player.id || prop.level > 0) return;

      const refund = getPropertySellRefund(tileIndex);
      soundEngine.playCashGain();
      setPlayers((prev) =>
        prev.map((p) => (p.id === player.id ? { ...p, cash: p.cash + refund } : p))
      );
      setProperties((prev) => ({
        ...prev,
        [tileIndex]: {
          ...prev[tileIndex],
          ownerId: null,
          level: 0,
        },
      }));

      const tile = BOARD_TILES[tileIndex];
      addLog(
        `${player.name} nhượng lại quyền sở hữu ${tile.name} cho Ngân hàng (+$${refund}).`,
        player.color
      );
    },
    [addLog]
  );

  const handlePayPendingDebt = useCallback(() => {
    if (!pendingDebt) return;
    const player = playersRef.current[activeIdxRef.current];
    if (!player || player.cash < pendingDebt.amount) return;

    const { amount, creditorId, reason } = pendingDebt;
    const creditor =
      creditorId !== null ? playersRef.current.find((p) => p.id === creditorId) : null;
    setPlayers((prev) =>
      prev.map((p) => {
        if (p.id === player.id) return { ...p, cash: p.cash - amount };
        if (creditorId !== null && p.id === creditorId) {
          return { ...p, cash: p.cash + amount };
        }
        return p;
      })
    );
    soundEngine.playCashPay();
    addLog(
      `${player.name} đã thanh toán đủ khoản nợ $${amount} (${reason})!`,
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
          { ...player, cash: player.cash - amount },
          reason,
          amount,
          creditor?.name
        )
      );
    }
    setPendingDebt(null);
    setShowAssetsModal(false);
    setTurnPhase('AWAIT_END_TURN');
  }, [addLog, pendingDebt, triggerBotQuip]);

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

    setPlayers(updatedPlayers);
    setProperties((prev) => {
      const next = { ...prev };
      for (const key of Object.keys(next)) {
        const idx = Number(key);
        if (next[idx].ownerId === player.id) {
          next[idx] = {
            tileIndex: idx,
            ownerId: creditorId,
            level: 0,
          };
        }
      }
      return next;
    });

    setPendingDebt(null);
    setShowAssetsModal(false);
    soundEngine.playJailAlert();
    addLog(
      `${player.name} chính thức tuyên bố PHÁ SẢN!`,
      player.color,
      'negative'
    );

    const winner = getWinner(updatedPlayers);
    if (winner) {
      soundEngine.playVictoryFanfare();
      addLog(
        `CHÚC MỪNG ${winner.name} TRỞ THÀNH TỶ PHÚ VÔ ĐỊCH VIỆT NAM!`,
        winner.color,
        'highlight'
      );
      setTurnPhase('GAME_OVER');
      setScreenState('gameover');
      return;
    }

    const nextIdx = getNextActivePlayerIndex(updatedPlayers, activeIdxRef.current);
    setActivePlayerIndex(nextIdx);
    setBotUpgradedThisTurn(false);
    setTurnCount((t) => t + 1);
    setTurnPhase('AWAIT_ROLL');
  }, [addLog, pendingDebt]);

  const handleEndTurn = useCallback(() => {
    if (turnPhaseRef.current !== 'AWAIT_END_TURN') return;
    const currPlayers = playersRef.current;
    const current = currPlayers[activeIdxRef.current];

    const winner = getWinner(currPlayers);
    if (winner) {
      soundEngine.playVictoryFanfare();
      setTurnPhase('GAME_OVER');
      setScreenState('gameover');
      return;
    }

    // Extra turn if player rolled doubles and was not sent to Jail
    if (current && !current.bankrupt && !current.inJail && current.doublesStreak > 0) {
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
    setBotUpgradedThisTurn(false);
    setTurnCount((t) => t + 1);
    setTurnPhase('AWAIT_ROLL');
  }, [addLog]);

  /* ==========================================
   * SMART BOT AI AUTOMATED TURN CHOREOGRAPHY
   * ========================================== */
  useEffect(() => {
    if (screenState !== 'playing') return;
    const current = players[activePlayerIndex];
    if (!current || !current.isBot || current.bankrupt) return;

    const baseDelay = Math.round(1050 / speedMultiplier);
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
        handleRollDice();
      }, baseDelay);
    } else if (turnPhase === 'BUY_DECISION') {
      timer = window.setTimeout(() => {
        if (botShouldBuyProperty(current, current.position, properties)) {
          handleBuyProperty();
        } else {
          handleSkipBuy();
        }
      }, baseDelay);
    } else if (turnPhase === 'CARD_REVEAL') {
      timer = window.setTimeout(() => {
        handleConfirmCard();
      }, Math.round(1150 / speedMultiplier));
    } else if (turnPhase === 'DEBT_RESOLUTION') {
      timer = window.setTimeout(() => {
        if (pendingDebt && current.cash >= pendingDebt.amount) {
          handlePayPendingDebt();
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
      }, Math.round(650 / speedMultiplier));
    } else if (turnPhase === 'AWAIT_END_TURN') {
      timer = window.setTimeout(() => {
        if (!botUpgradedThisTurn) {
          const upgTile = botPickUpgradeTile(current, properties);
          if (upgTile !== null) {
            setBotUpgradedThisTurn(true);
            handleUpgradeProperty(upgTile);
            return;
          }
        }
        handleEndTurn();
      }, Math.round(950 / speedMultiplier));
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
    botUpgradedThisTurn,
    handleRollDice,
    handleUseJailCard,
    handlePayJailFine,
    handleBuyProperty,
    handleSkipBuy,
    handleConfirmCard,
    handlePayPendingDebt,
    handleDeclareBankruptcy,
    handleSellHouse,
    handleSellProperty,
    handleUpgradeProperty,
    handleEndTurn,
  ]);

  /* ==========================================
   * BOT AI AUTOMATED PUBLIC AUCTION BIDDING
   * ========================================== */
  useEffect(() => {
    if (
      screenState !== 'playing' ||
      turnPhase !== 'AUCTION' ||
      !auctionState ||
      auctionState.status !== 'ACTIVE'
    ) {
      return;
    }

    const bidder = players.find((p) => p.id === auctionState.currentTurnBidderId);
    if (!bidder || !bidder.isBot || bidder.bankrupt) return;

    const timer = window.setTimeout(() => {
      const decision = botDecideAuctionTurn(bidder, auctionState, properties);
      if (decision.action === 'BID') {
        handleAuctionBid(bidder.id, decision.amount);
      } else {
        handleAuctionPass(bidder.id);
      }
    }, Math.round(680 / speedMultiplier));

    return () => clearTimeout(timer);
  }, [
    screenState,
    turnPhase,
    auctionState,
    players,
    properties,
    speedMultiplier,
    handleAuctionBid,
    handleAuctionPass,
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
            handleRollDice();
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
    pendingDebt,
    startNewGame,
    handleRollDice,
    handleEndTurn,
    handleToggleCinematic,
    handleToggleNightMode,
  ]);

  const currentPlayer = players[activePlayerIndex] || players[0];
  const winner = useMemo(() => getWinner(players), [players]);
  const canTrade = useMemo(
    () => players.filter((p) => !p.bankrupt).length >= 2,
    [players]
  );

  const { ownedCount, upgradableCount } = useMemo(() => {
    if (!currentPlayer) return { ownedCount: 0, upgradableCount: 0 };
    let owned = 0;
    let upgradable = 0;
    for (const pr of Object.values(properties)) {
      if (pr.ownerId === currentPlayer.id) {
        owned += 1;
        if (canUpgradeProperty(currentPlayer, pr.tileIndex, properties).allowed) {
          upgradable += 1;
        }
      }
    }
    return { ownedCount: owned, upgradableCount: upgradable };
  }, [currentPlayer, properties]);

  const canHumanActOnAssets =
    screenState === 'playing' &&
    !currentPlayer.isBot &&
    (turnPhase === 'AWAIT_ROLL' ||
      turnPhase === 'AWAIT_END_TURN' ||
      turnPhase === 'DEBT_RESOLUTION');

  return (
    <main className="relative h-full w-full overflow-hidden">
      {/* 1. Isolated 3D Low-Poly Isometric Board Viewport */}
      <MonopolyCanvas
        ref={canvasRef}
        players={players}
        properties={properties}
        selectedTileIndex={selectedTileIndex}
        activePlayerId={screenState === 'playing' ? currentPlayer?.id ?? null : null}
        cinematicCamera={cinematicCamera}
        nightMode={nightMode}
        onSelectTile={(idx) => setSelectedTileIndex(idx)}
      />

      {/* 2. Start Screen Setup Modal */}
      {screenState === 'title' && (
        <StartModal
          initialConfigs={setupConfigs}
          initialStartingCash={startingCash}
          onStartGame={startNewGame}
        />
      )}

      {/* 3. Active Playing HUD & Unified Bottom Control Dock */}
      {screenState !== 'title' && (
        <>
          <PlayerHUD
            players={players}
            activePlayerIndex={activePlayerIndex}
            properties={properties}
            logs={logs}
            botBubbles={botBubbles}
            onDismissBubble={dismissBotBubble}
            onSelectTile={(idx) => setSelectedTileIndex(idx)}
          />

          <ActionDock
            currentPlayer={currentPlayer}
            turnPhase={turnPhase}
            lastDice={lastDice}
            upgradableCount={upgradableCount}
            ownedCount={ownedCount}
            canTrade={canTrade}
            speedMultiplier={speedMultiplier}
            cinematicCamera={cinematicCamera}
            nightMode={nightMode}
            soundMuted={soundMuted}
            dockCollapsed={dockCollapsed}
            onToggleDock={() => setDockCollapsed((v) => !v)}
            onRollDice={handleRollDice}
            onPayJailFine={handlePayJailFine}
            onUseJailCard={handleUseJailCard}
            onOpenAssetsModal={() => setShowAssetsModal(true)}
            onOpenTradeModal={() => setShowTradeModal(true)}
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
          />
        </>
      )}

      {/* 4. Raycasted 3D Tile Detail Card */}
      {selectedTileIndex !== null && screenState !== 'title' && (
        <TileInspectorCard
          tileIndex={selectedTileIndex}
          players={players}
          properties={properties}
          currentPlayer={currentPlayer}
          canActOnAssets={canHumanActOnAssets}
          onUpgrade={handleUpgradeProperty}
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

      {/* 5b. Live Public Auction Modal (Human + Bot AI) */}
      {screenState === 'playing' &&
        turnPhase === 'AUCTION' &&
        auctionState &&
        auctionState.status === 'ACTIVE' && (
          <AuctionModal
            auction={auctionState}
            players={players}
            onBid={handleAuctionBid}
            onPass={handleAuctionPass}
          />
        )}

      {/* 6. Chance / Community Chest Drawn Card Modal */}
      {screenState === 'playing' && turnPhase === 'CARD_REVEAL' && drawnCard && (
        <LuckCardModal
          card={drawnCard}
          isBot={currentPlayer.isBot}
          onConfirm={handleConfirmCard}
        />
      )}

      {/* 7. Property Management, House Upgrade & Debt Liquidation Modal */}
      {screenState === 'playing' &&
        !currentPlayer.isBot &&
        (showAssetsModal || turnPhase === 'DEBT_RESOLUTION') && (
          <AssetManagementModal
            player={currentPlayer}
            properties={properties}
            pendingDebt={pendingDebt}
            onUpgrade={handleUpgradeProperty}
            onSellHouse={handleSellHouse}
            onSellProperty={handleSellProperty}
            onPayPendingDebt={handlePayPendingDebt}
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
          onRestartToTitle={() => {
            sessionEpochRef.current += 1;
            setScreenState('title');
          }}
        />
      )}

      {/* 9. Victory Celebration Modal with Confetti */}
      {screenState === 'gameover' && winner && (
        <VictoryModal
          winner={winner}
          players={players}
          properties={properties}
          turnCount={turnCount}
          onPlayAgain={() => {
            sessionEpochRef.current += 1;
            setScreenState('title');
          }}
        />
      )}
    </main>
  );
}
