// Seeded Bot-vs-Bot simulation harness against the authoritative OnlineRoomManager engine.
// Usage:
//   Single batch: npx tsx scripts/gameplay-audit/sim.ts <games> <players> <tactical 0|1> <festival 0|1> <mode FFA|TEAMS_2V2> <seedBase>
//   All 190 baseline audit seeds: npx tsx scripts/gameplay-audit/sim.ts --all-190
import { BOARD_TILES } from '../../src/game/boardData';
import type { ServerToClientMessage } from '../../src/game/onlineTypes';
import { MatchMode, PlayerState, PropertyState, TileKind } from '../../src/game/types';
import { OnlineRoomManager } from '../../src/server/roomManager';

interface InternalRoomView {
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
    nextLogId: number;
    drawnCard?: { id: string } | null;
    matchWinnerResult?: { condition: string; winner: { id: number } } | null;
  } | null;
}

interface InternalManagerView {
  rooms: Map<string, InternalRoomView>;
  scheduleBotTurnIfNeeded: (room: InternalRoomView) => void;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const nextTick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

interface SimGameResult {
  seed: number;
  ended: boolean;
  condition: string | null;
  turns: number;
  stuck: boolean;
  stuckPhase?: string;
  violations: string[];
  bankrupts: number;
  winnerId?: number;
  phasesSeen: Record<string, number>;
  cardsSeen: Record<string, number>;
}

interface BatchConfig {
  id: string;
  games: number;
  nPlayers: 2 | 3 | 4;
  tactical: boolean;
  festival: boolean;
  mode: MatchMode;
  seedBase: number;
  turnCap: number;
  tickEvery: number;
}

async function runGame(cfg: BatchConfig, seed: number): Promise<SimGameResult> {
  const rnd = mulberry32(seed);
  const origRandom = Math.random;
  Math.random = rnd;
  const violations: string[] = [];
  const phasesSeen: Record<string, number> = {};
  const cardsSeen: Record<string, number> = {};
  const errors: string[] = [];

  const mgr = new OnlineRoomManager(
    (_cid, msg: ServerToClientMessage) => {
      if (msg.type === 'ERROR') {
        errors.push(`${msg.code}:${msg.message}`);
      }
    },
    {
      timingScale: 0,
      enableTickInterval: false,
      diceRng: () => [Math.floor(rnd() * 6) + 1, Math.floor(rnd() * 6) + 1],
    }
  );

  try {
    mgr.handleClientMessage('c0', {
      type: 'CREATE_ROOM',
      playerName: 'Seat0',
      tokenType: 'car',
      maxPlayers: cfg.nPlayers,
      startingCash: 2_000_000,
      fillBots: true,
      matchMode: cfg.mode,
      tacticalDiceEnabled: cfg.tactical,
      festivalEnabled: cfg.festival,
    });
    mgr.handleClientMessage('c0', { type: 'START_MATCH' });

    const internal = mgr as unknown as InternalManagerView;
    const room = [...internal.rooms.values()][0];
    const match = room.match!;
    match.players[0].isBot = true;
    match.players[0].onlineBotTakeover = true;
    internal.scheduleBotTurnIfNeeded(room);

    let lastSig = '';
    let sameCount = 0;
    let iter = 0;
    let stuck = false;
    let stuckPhase: string | undefined;
    let lastPhase = '';
    let lastCardId = '';

    while (true) {
      await nextTick();
      iter += 1;
      if (cfg.tickEvery > 0 && iter % cfg.tickEvery === 0) {
        mgr.tickOneSecond();
      }
      const m = room.match;
      if (!m) break;

      if (m.turnPhase !== lastPhase) {
        phasesSeen[m.turnPhase] = (phasesSeen[m.turnPhase] ?? 0) + 1;
        lastPhase = m.turnPhase;
      }
      if (m.drawnCard && m.drawnCard.id !== lastCardId) {
        cardsSeen[m.drawnCard.id] = (cardsSeen[m.drawnCard.id] ?? 0) + 1;
      }
      lastCardId = m.drawnCard?.id ?? '';

      for (const p of m.players) {
        if (!Number.isFinite(p.cash)) violations.push(`t${m.turnCount} NaN cash p${p.id}`);
        if (!p.bankrupt && p.cash < 0) {
          violations.push(`t${m.turnCount} negative cash p${p.id}=${p.cash} phase=${m.turnPhase}`);
        }
        if (p.bankrupt && p.cash !== 0) {
          violations.push(`t${m.turnCount} bankrupt p${p.id} has cash ${p.cash}`);
        }
      }
      for (const prop of Object.values(m.properties)) {
        const tile = BOARD_TILES[prop.tileIndex];
        if (prop.ownerId !== null) {
          const owner = m.players.find((p) => p.id === prop.ownerId);
          if (!owner || owner.bankrupt) {
            violations.push(
              `t${m.turnCount} tile ${prop.tileIndex} owned by bankrupt/missing ${prop.ownerId}`
            );
          }
        } else if (prop.level !== 0) {
          violations.push(`t${m.turnCount} unowned tile ${prop.tileIndex} level ${prop.level}`);
        }
        if (prop.level < 0 || prop.level > 4) violations.push(`bad level ${prop.level}`);
        if (tile.kind === TileKind.RESORT && prop.level !== 0) {
          violations.push(`resort level ${prop.level}`);
        }
      }
      const active = m.players[m.activePlayerIndex];
      if (room.status === 'playing' && active?.bankrupt) {
        violations.push(`t${m.turnCount} active player bankrupt phase=${m.turnPhase}`);
      }
      if (room.status !== 'playing') break;
      if (m.turnCount > cfg.turnCap) break;

      const sig = `${m.turnCount}|${m.turnPhase}|${m.activePlayerIndex}|${m.nextLogId}|${m.players
        .map((p) => `${p.cash}:${p.position}`)
        .join(',')}`;
      if (sig === lastSig) {
        sameCount += 1;
        if (sameCount > 400) {
          for (let i = 0; i < 60; i++) mgr.tickOneSecond();
          await nextTick();
          const sig2 = `${m.turnCount}|${m.turnPhase}|${m.activePlayerIndex}|${m.nextLogId}`;
          if (sig2 === sig.split('|').slice(0, 4).join('|')) {
            stuck = true;
            stuckPhase = `${m.turnPhase} active=${m.activePlayerIndex} isBot=${active?.isBot} botTimer=${Boolean(room.botActionTimer)} pending=${room.pendingTimers.size}`;
            break;
          }
          sameCount = 0;
        }
      } else {
        sameCount = 0;
        lastSig = sig;
      }
    }

    const m = room.match;
    const res: SimGameResult = {
      seed,
      ended: room.status === 'gameover',
      condition: m?.matchWinnerResult?.condition ?? null,
      turns: m?.turnCount ?? 0,
      stuck,
      stuckPhase,
      violations: [...new Set(violations)].slice(0, 10),
      bankrupts: m ? m.players.filter((p) => p.bankrupt).length : 0,
      winnerId: m?.matchWinnerResult?.winner?.id,
      phasesSeen,
      cardsSeen,
    };
    if (errors.length) {
      res.violations.push(...[...new Set(errors)].slice(0, 5).map((e) => `SERVER_ERROR ${e}`));
    }
    return res;
  } finally {
    mgr.dispose();
    Math.random = origRandom;
  }
}

async function runBatch(cfg: BatchConfig) {
  const results: SimGameResult[] = [];
  for (let g = 0; g < cfg.games; g++) {
    results.push(await runGame(cfg, cfg.seedBase + g));
  }
  const ended = results.filter((r) => r.ended);
  const byCond: Record<string, number> = {};
  for (const r of ended) {
    if (r.condition) byCond[r.condition] = (byCond[r.condition] ?? 0) + 1;
  }
  const turns = ended.map((r) => r.turns).sort((a, b) => a - b);
  const phaseTotals: Record<string, number> = {};
  const cardTotals: Record<string, number> = {};
  const winsBySeat: Record<string, number> = {};
  for (const r of results) {
    for (const [k, v] of Object.entries(r.phasesSeen)) phaseTotals[k] = (phaseTotals[k] ?? 0) + v;
    for (const [k, v] of Object.entries(r.cardsSeen)) cardTotals[k] = (cardTotals[k] ?? 0) + v;
    if (r.winnerId !== undefined) {
      winsBySeat[String(r.winnerId)] = (winsBySeat[String(r.winnerId)] ?? 0) + 1;
    }
  }
  return {
    id: cfg.id,
    config: cfg,
    completed: ended.length,
    hitTurnCap: results.filter((r) => !r.ended && !r.stuck).length,
    stuck: results
      .filter((r) => r.stuck)
      .map((r) => ({ seed: r.seed, turns: r.turns, phase: r.stuckPhase })),
    endConditions: byCond,
    turns: turns.length
      ? {
          min: turns[0],
          median: turns[Math.floor(turns.length / 2)],
          max: turns[turns.length - 1],
          avg: Math.round(turns.reduce((a, b) => a + b, 0) / turns.length),
        }
      : null,
    violations: results
      .filter((r) => r.violations.length > 0)
      .map((r) => ({ seed: r.seed, v: r.violations })),
    phaseTotals,
    cardTotals,
    winsBySeat,
  };
}

async function main(): Promise<void> {
  const turnCap = Number(process.env.TURN_CAP ?? 1500);
  const tickEvery = Number(process.env.TICK_EVERY ?? 0);

  if (process.argv.includes('--all-190')) {
    const batches: BatchConfig[] = [
      { id: 'B1_4p_std', games: 40, nPlayers: 4, tactical: false, festival: false, mode: 'FFA', seedBase: 2000, turnCap, tickEvery },
      { id: 'B2_4p_tac_fest', games: 30, nPlayers: 4, tactical: true, festival: true, mode: 'FFA', seedBase: 3000, turnCap, tickEvery },
      { id: 'B3_2p_std', games: 30, nPlayers: 2, tactical: false, festival: false, mode: 'FFA', seedBase: 4000, turnCap, tickEvery },
      { id: 'B4_2v2_tac', games: 30, nPlayers: 4, tactical: true, festival: false, mode: 'TEAMS_2V2', seedBase: 5000, turnCap, tickEvery },
      { id: 'B5_3p_fest', games: 20, nPlayers: 3, tactical: false, festival: true, mode: 'FFA', seedBase: 6000, turnCap, tickEvery },
      { id: 'B6_4p_fair', games: 40, nPlayers: 4, tactical: false, festival: false, mode: 'FFA', seedBase: 7000, turnCap, tickEvery },
    ];
    const summaries = [];
    for (const batch of batches) {
      summaries.push(await runBatch(batch));
    }
    const totalGames = summaries.reduce((s, b) => s + b.config.games, 0);
    const totalCompleted = summaries.reduce((s, b) => s + b.completed, 0);
    const totalStuck = summaries.reduce((s, b) => s + b.stuck.length, 0);
    const totalViolations = summaries.reduce((s, b) => s + b.violations.length, 0);
    console.log(
      JSON.stringify(
        {
          totalGames,
          totalCompleted,
          totalStuck,
          totalViolations,
          batches: summaries,
        },
        null,
        2
      )
    );
    if (totalCompleted !== totalGames || totalStuck > 0 || totalViolations > 0) {
      process.exitCode = 1;
    }
    return;
  }

  const cfg: BatchConfig = {
    id: 'custom',
    games: Number(process.argv[2] ?? 20),
    nPlayers: Number(process.argv[3] ?? 4) as 2 | 3 | 4,
    tactical: process.argv[4] === '1',
    festival: process.argv[5] === '1',
    mode: (process.argv[6] ?? 'FFA') as MatchMode,
    seedBase: Number(process.argv[7] ?? 1000),
    turnCap,
    tickEvery,
  };
  const summary = await runBatch(cfg);
  console.log(JSON.stringify(summary, null, 2));
  if (summary.completed !== cfg.games || summary.stuck.length > 0 || summary.violations.length > 0) {
    process.exitCode = 1;
  }
}

void main();
