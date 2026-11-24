// Deterministic gameplay audit probes against the authoritative OnlineRoomManager & rules engine.
// Usage: npx tsx scripts/gameplay-audit/probes.ts
import { DEFAULT_PLAYER_CONFIGS } from '../../src/game/boardData';
import type { ServerToClientMessage } from '../../src/game/onlineTypes';
import { computeOptimalAutoSale, createInitialPlayers } from '../../src/game/rules';
import type { PlayerState, PropertyState } from '../../src/game/types';
import { OnlineRoomManager } from '../../src/server/roomManager';

const wait = (ms = 0) => new Promise<void>((resolve) => setTimeout(resolve, ms));
async function settle(n = 60): Promise<void> {
  for (let i = 0; i < n; i++) await wait(0);
}

interface InternalRoom {
  roomCode: string;
  status: string;
  botActionTimer: ReturnType<typeof setTimeout> | null;
  pendingTimers: Set<ReturnType<typeof setTimeout>>;
  match: {
    players: PlayerState[];
    properties: Record<number, PropertyState>;
    activePlayerIndex: number;
    turnPhase: string;
    turnCount: number;
    decisionRevision: number;
    matchTimeLeft: number;
    turnTimeLeft: number;
    pendingDebt: { amount: number; creditorId: number | null; reason: string; debtorId?: number } | null;
    pendingDebtQueue: Array<{ amount: number; creditorId: number | null; reason: string; debtorId?: number }>;
    missedTurnsByPlayer: Record<number, number>;
    matchWinnerResult: {
      condition: string;
      winner: { id: number; name: string };
      effectiveNetWorthByPlayerId?: Record<number, number>;
    } | null;
    logs: Array<{ text: string }>;
  };
}

function mk(diceSeq: Array<[number, number]>, timingScale = 0) {
  const msgs: Record<string, ServerToClientMessage[]> = {};
  let i = 0;
  const mgr = new OnlineRoomManager(
    (cid, msg) => {
      (msgs[cid] ??= []).push(msg);
    },
    {
      timingScale,
      enableTickInterval: false,
      diceRng: () => diceSeq[i++ % diceSeq.length],
    }
  );
  const room = () =>
    [...((mgr as unknown as { rooms: Map<string, InternalRoom> }).rooms.values())][0];
  return { mgr, msgs, room };
}

async function probeBug01AfkSingleTurn() {
  const { mgr, room } = mk([[1, 2]]);
  try {
    mgr.handleClientMessage('a', {
      type: 'CREATE_ROOM',
      playerName: 'A',
      tokenType: 'car',
      maxPlayers: 2,
      startingCash: 2_000_000,
      fillBots: false,
    });
    const code = room().roomCode;
    mgr.handleClientMessage('b', { type: 'JOIN_ROOM', roomCode: code, playerName: 'B' });
    mgr.handleClientMessage('a', { type: 'START_MATCH' });
    const m = room().match;
    // Exhaust Turn 1 AWAIT_ROLL + BUY_DECISION for A
    for (let s = 0; s < 75 && m.turnCount === 1; s++) {
      mgr.tickOneSecond();
      await settle(20);
    }
    const afterTurn1 = {
      turnCount: m.turnCount,
      p0IsBot: m.players[0].isBot,
      p0Missed: m.missedTurnsByPlayer[0] ?? 0,
    };
    // B plays Turn 2 actively
    mgr.handleClientMessage('b', { type: 'GAME_ACTION', action: { kind: 'ROLL_DICE' } });
    await settle(40);
    if (m.turnPhase === 'BUY_DECISION') {
      mgr.handleClientMessage('b', { type: 'GAME_ACTION', action: { kind: 'SKIP_BUY' } });
    }
    // Exhaust Turn 3 for A -> 2nd consecutive full missed turn triggers takeover
    for (let s = 0; s < 55 && !m.players[0].isBot; s++) {
      mgr.tickOneSecond();
      await settle(20);
    }
    return {
      afterTurn1,
      afterTurn3Takeover: {
        turnCount: m.turnCount,
        p0IsBot: m.players[0].isBot,
        p0Missed: m.missedTurnsByPlayer[0] ?? 0,
      },
    };
  } finally {
    mgr.dispose();
  }
}

async function probeBug02Teams2v2SeatOrder() {
  const { mgr, room } = mk([[1, 2]]);
  try {
    mgr.handleClientMessage('a', {
      type: 'CREATE_ROOM',
      playerName: 'A',
      tokenType: 'car',
      maxPlayers: 4,
      startingCash: 2_000_000,
      fillBots: true,
      matchMode: 'TEAMS_2V2',
    });
    const code = room().roomCode;
    mgr.handleClientMessage('b', { type: 'JOIN_ROOM', roomCode: code, playerName: 'B' }); // seat 1
    mgr.handleClientMessage('c', { type: 'JOIN_ROOM', roomCode: code, playerName: 'C' }); // seat 2
    mgr.handleClientMessage('b', { type: 'LEAVE_ROOM' }); // seat 1 freed -> humans at seats 0 & 2
    mgr.handleClientMessage('a', { type: 'START_MATCH' });
    const m = room().match;
    return {
      turnOrder: m.players.map(
        (p) => `${p.name}(id=${p.id},team=${p.teamId}${p.isBot ? ',bot' : ',human'})`
      ),
      teamsAlternate:
        m.players[0].teamId === 0 &&
        m.players[1].teamId === 1 &&
        m.players[2].teamId === 0 &&
        m.players[3].teamId === 1,
    };
  } finally {
    mgr.dispose();
  }
}

async function probeBug04And06ValidationAndStaleActions() {
  const { mgr, msgs, room } = mk([[1, 2]]);
  try {
    mgr.handleClientMessage('a', {
      type: 'CREATE_ROOM',
      playerName: 'A',
      tokenType: 'car',
      maxPlayers: 2,
      startingCash: 2_000_000,
      fillBots: false,
    });
    const code = room().roomCode;
    mgr.handleClientMessage('b', { type: 'JOIN_ROOM', roomCode: code, playerName: 'B' });
    mgr.handleClientMessage('a', { type: 'START_MATCH' });
    const m = room().match;

    // Out-of-turn
    mgr.handleClientMessage('b', { type: 'GAME_ACTION', action: { kind: 'ROLL_DICE' } });
    // Phase mismatch (BUG-06)
    mgr.handleClientMessage('a', {
      type: 'GAME_ACTION',
      action: { kind: 'BUY_PROPERTY', initialLevel: 0 },
    });
    // Stale expectedTurnCount (BUG-04)
    mgr.handleClientMessage('a', {
      type: 'GAME_ACTION',
      action: { kind: 'ROLL_DICE' },
      expectedTurnCount: 99,
      expectedPhase: 'AWAIT_ROLL',
      expectedDecisionRevision: m.decisionRevision,
      actionId: 'stale-1',
    });
    // Valid roll with actionId + duplicate replay
    const revBeforeRoll = m.decisionRevision;
    mgr.handleClientMessage('a', {
      type: 'GAME_ACTION',
      action: { kind: 'ROLL_DICE' },
      expectedTurnCount: m.turnCount,
      expectedPhase: 'AWAIT_ROLL',
      expectedDecisionRevision: revBeforeRoll,
      actionId: 'roll-1',
    });
    mgr.handleClientMessage('a', {
      type: 'GAME_ACTION',
      action: { kind: 'ROLL_DICE' },
      expectedTurnCount: m.turnCount,
      expectedPhase: 'AWAIT_ROLL',
      expectedDecisionRevision: revBeforeRoll,
      actionId: 'roll-1',
    });
    await settle(60);
    const aErrCodes = (msgs['a'] || [])
      .filter((x): x is Extract<ServerToClientMessage, { type: 'ERROR' }> => x.type === 'ERROR')
      .map((x) => x.code);
    const bErrCodes = (msgs['b'] || [])
      .filter((x): x is Extract<ServerToClientMessage, { type: 'ERROR' }> => x.type === 'ERROR')
      .map((x) => x.code);
    return {
      bErrCodes,
      aErrCodes,
      phaseAfterRoll: m.turnPhase,
    };
  } finally {
    mgr.dispose();
  }
}

async function probeBug05TimeLimitDuringDebt() {
  const { mgr, room } = mk([[1, 2]]);
  try {
    mgr.handleClientMessage('a', {
      type: 'CREATE_ROOM',
      playerName: 'A',
      tokenType: 'car',
      maxPlayers: 2,
      startingCash: 2_000_000,
      fillBots: true,
    });
    mgr.handleClientMessage('a', { type: 'START_MATCH' });
    const r = room();
    const m = r.match;
    m.players[0].cash = 1_500_000;
    m.players[1].cash = 1_000_000;
    m.matchTimeLeft = 1;
    m.turnPhase = 'DEBT_RESOLUTION';
    m.pendingDebt = { amount: 900_000, creditorId: 1, reason: 'Thuê nhà' };
    mgr.tickOneSecond();
    return {
      status: r.status,
      condition: m.matchWinnerResult?.condition,
      winnerId: m.matchWinnerResult?.winner.id,
      effectiveNetWorths: m.matchWinnerResult?.effectiveNetWorthByPlayerId,
      pendingDebtCleared: m.pendingDebt === null,
    };
  } finally {
    mgr.dispose();
  }
}

function probeBug08AutoSale2v2() {
  const players = createInitialPlayers(DEFAULT_PLAYER_CONFIGS, 2_000_000, 'TEAMS_2V2');
  const props: Record<number, PropertyState> = {
    1: { tileIndex: 1, ownerId: 0, level: 0 },
    2: { tileIndex: 2, ownerId: 0, level: 0 },
    3: { tileIndex: 3, ownerId: 2, level: 0 }, // Teammate completes Brown monopoly
    5: { tileIndex: 5, ownerId: 0, level: 0 }, // Solo Cyan tile
  };
  const plan = computeOptimalAutoSale(0, 60_000, props, undefined, players, 'TEAMS_2V2');
  return {
    soldTiles: plan.tileIndicesToSell,
    protectedTeamBrownMonopoly:
      plan.sufficient && plan.tileIndicesToSell.length === 1 && plan.tileIndicesToSell[0] === 5,
  };
}

async function probeBug09BotWatchdog() {
  const { mgr, room } = mk([[1, 2]], 0.03);
  try {
    mgr.handleClientMessage('a', {
      type: 'CREATE_ROOM',
      playerName: 'A',
      tokenType: 'car',
      maxPlayers: 2,
      startingCash: 2_000_000,
      fillBots: true,
    });
    mgr.handleClientMessage('a', { type: 'START_MATCH' });
    mgr.handleClientMessage('a', { type: 'GAME_ACTION', action: { kind: 'ROLL_DICE' } });
    await wait(160);
    mgr.handleClientMessage('a', { type: 'GAME_ACTION', action: { kind: 'SKIP_BUY' } });
    const r = room();
    // Simulate dropped Bot timer
    if (r.botActionTimer) {
      clearTimeout(r.botActionTimer);
      r.pendingTimers.delete(r.botActionTimer);
      r.botActionTimer = null;
    }
    for (let i = 0; i < 10; i++) mgr.tickOneSecond();
    const rescheduled = r.botActionTimer !== null;
    await wait(280);
    return {
      rescheduledByWatchdog: rescheduled,
      returnedToHuman: r.match.activePlayerIndex === 0,
    };
  } finally {
    mgr.dispose();
  }
}

async function main(): Promise<void> {
  console.log(
    JSON.stringify(
      {
        bug01AfkSingleTurn: await probeBug01AfkSingleTurn(),
        bug02Teams2v2SeatOrder: await probeBug02Teams2v2SeatOrder(),
        bug04And06Validation: await probeBug04And06ValidationAndStaleActions(),
        bug05TimeLimitDuringDebt: await probeBug05TimeLimitDuringDebt(),
        bug08AutoSale2v2: probeBug08AutoSale2v2(),
        bug09BotWatchdog: await probeBug09BotWatchdog(),
      },
      null,
      2
    )
  );
}

void main();
