import assert from 'node:assert/strict';
import test from 'node:test';
import { BOARD_TILES } from '../game/boardData';
import type { ServerToClientMessage } from '../game/onlineTypes';
import { MatchMode, PlayerState, PropertyState, TileKind } from '../game/types';
import { OnlineRoomManager } from './roomManager';

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

async function runSeededBotMatch(options: {
  seed: number;
  maxPlayers: 2 | 3 | 4;
  tacticalDiceEnabled: boolean;
  festivalEnabled: boolean;
  matchMode: MatchMode;
  turnCap?: number;
}): Promise<{
  seed: number;
  ended: boolean;
  condition: string | null;
  turns: number;
  stuck: boolean;
  violations: string[];
}> {
  const { seed, maxPlayers, tacticalDiceEnabled, festivalEnabled, matchMode } = options;
  const turnCap = options.turnCap ?? 1500;
  const rnd = mulberry32(seed);
  const origRandom = Math.random;
  Math.random = rnd;

  const violations: string[] = [];
  const serverErrors: string[] = [];
  const manager = new OnlineRoomManager(
    (_cid, msg: ServerToClientMessage) => {
      if (msg.type === 'ERROR') {
        serverErrors.push(`${msg.code}:${msg.message}`);
      }
    },
    {
      timingScale: 0,
      enableTickInterval: false,
      diceRng: () => [Math.floor(rnd() * 6) + 1, Math.floor(rnd() * 6) + 1],
    }
  );

  try {
    manager.handleClientMessage('c0', {
      type: 'CREATE_ROOM',
      playerName: 'BotSeat0',
      tokenType: 'car',
      maxPlayers,
      startingCash: 2_000_000,
      fillBots: true,
      matchMode,
      tacticalDiceEnabled,
      festivalEnabled,
    });
    manager.handleClientMessage('c0', { type: 'START_MATCH' });

    const internal = manager as unknown as InternalManagerView;
    const room = [...internal.rooms.values()][0];
    assert.ok(room && room.match, 'Room and match must initialize');

    // Convert seat 0 into Bot AI for hands-free full Bot-vs-Bot simulation
    room.match.players[0].isBot = true;
    room.match.players[0].onlineBotTakeover = true;
    internal.scheduleBotTurnIfNeeded(room);

    let lastSig = '';
    let sameCount = 0;
    let stuck = false;

    while (true) {
      await nextTick();
      const match = room.match;
      if (!match) break;

      // Economic & state-machine invariants
      for (const p of match.players) {
        if (!Number.isFinite(p.cash)) {
          violations.push(`t${match.turnCount}: non-finite cash for p${p.id}`);
        }
        if (!p.bankrupt && p.cash < 0) {
          violations.push(`t${match.turnCount}: negative cash p${p.id}=${p.cash} (${match.turnPhase})`);
        }
        if (p.bankrupt && p.cash !== 0) {
          violations.push(`t${match.turnCount}: bankrupt p${p.id} retained cash ${p.cash}`);
        }
      }

      for (const prop of Object.values(match.properties)) {
        const tile = BOARD_TILES[prop.tileIndex];
        if (prop.ownerId !== null) {
          const owner = match.players.find((p) => p.id === prop.ownerId);
          if (!owner || owner.bankrupt) {
            violations.push(
              `t${match.turnCount}: tile ${prop.tileIndex} owned by bankrupt/missing player ${prop.ownerId}`
            );
          }
        } else if (prop.level !== 0) {
          violations.push(`t${match.turnCount}: unowned tile ${prop.tileIndex} has level ${prop.level}`);
        }
        if (!Number.isInteger(prop.level) || prop.level < 0 || prop.level > 4) {
          violations.push(`t${match.turnCount}: invalid level ${prop.level} on tile ${prop.tileIndex}`);
        }
        if (tile?.kind === TileKind.RESORT && prop.level !== 0) {
          violations.push(`t${match.turnCount}: resort tile ${prop.tileIndex} has level ${prop.level}`);
        }
      }

      const active = match.players[match.activePlayerIndex];
      if (room.status === 'playing' && active?.bankrupt) {
        violations.push(`t${match.turnCount}: active player ${active.id} is bankrupt`);
      }

      if (room.status !== 'playing') break;
      if (match.turnCount > turnCap) break;

      const sig = `${match.turnCount}|${match.turnPhase}|${match.activePlayerIndex}|${match.nextLogId}|${match.players
        .map((p) => `${p.cash}:${p.position}`)
        .join(',')}`;
      if (sig === lastSig) {
        sameCount += 1;
        if (sameCount > 300) {
          for (let i = 0; i < 60; i++) {
            manager.tickOneSecond();
          }
          await nextTick();
          const sig2 = `${match.turnCount}|${match.turnPhase}|${match.activePlayerIndex}|${match.nextLogId}`;
          if (sig2 === sig.split('|').slice(0, 4).join('|')) {
            stuck = true;
            break;
          }
          sameCount = 0;
        }
      } else {
        sameCount = 0;
        lastSig = sig;
      }
    }

    if (serverErrors.length > 0) {
      violations.push(...[...new Set(serverErrors)].slice(0, 5).map((e) => `SERVER_ERROR:${e}`));
    }

    return {
      seed,
      ended: room.status === 'gameover',
      condition: room.match?.matchWinnerResult?.condition ?? null,
      turns: room.match?.turnCount ?? 0,
      stuck,
      violations: [...new Set(violations)].slice(0, 10),
    };
  } finally {
    manager.dispose();
    Math.random = origRandom;
  }
}

test('Seeded Bot-vs-Bot simulation matrix completes cleanly with zero stuck states and zero invariant violations', async () => {
  const scenarios: Array<{
    label: string;
    seeds: number[];
    maxPlayers: 2 | 3 | 4;
    tacticalDiceEnabled: boolean;
    festivalEnabled: boolean;
    matchMode: MatchMode;
  }> = [
    {
      label: '4P FFA Standard',
      seeds: [2000, 2001],
      maxPlayers: 4,
      tacticalDiceEnabled: false,
      festivalEnabled: false,
      matchMode: 'FFA',
    },
    {
      label: '4P FFA Tactical+Festival',
      seeds: [3000, 3001],
      maxPlayers: 4,
      tacticalDiceEnabled: true,
      festivalEnabled: true,
      matchMode: 'FFA',
    },
    {
      label: '2P FFA Standard',
      seeds: [4000, 4001],
      maxPlayers: 2,
      tacticalDiceEnabled: false,
      festivalEnabled: false,
      matchMode: 'FFA',
    },
    {
      label: '2v2 Teams Tactical',
      seeds: [5000, 5001],
      maxPlayers: 4,
      tacticalDiceEnabled: true,
      festivalEnabled: false,
      matchMode: 'TEAMS_2V2',
    },
    {
      label: '3P FFA Festival',
      seeds: [6000, 6001],
      maxPlayers: 3,
      tacticalDiceEnabled: false,
      festivalEnabled: true,
      matchMode: 'FFA',
    },
  ];

  for (const sc of scenarios) {
    for (const seed of sc.seeds) {
      const res = await runSeededBotMatch({
        seed,
        maxPlayers: sc.maxPlayers,
        tacticalDiceEnabled: sc.tacticalDiceEnabled,
        festivalEnabled: sc.festivalEnabled,
        matchMode: sc.matchMode,
      });
      assert.equal(res.stuck, false, `[${sc.label}] seed ${seed} must not get stuck`);
      assert.equal(res.ended, true, `[${sc.label}] seed ${seed} must complete within turn cap`);
      assert.ok(res.condition, `[${sc.label}] seed ${seed} must record a victory condition`);
      assert.deepEqual(
        res.violations,
        [],
        `[${sc.label}] seed ${seed} had invariant violations: ${res.violations.join('; ')}`
      );
    }
  }
});
