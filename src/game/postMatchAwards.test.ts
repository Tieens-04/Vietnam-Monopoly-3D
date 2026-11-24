import assert from 'node:assert/strict';
import test from 'node:test';
import { DEFAULT_PLAYER_CONFIGS } from './boardData';
import type { PlayerMatchStats, PostMatchAward } from './onlineTypes';
import { computePostMatchAwards, createEmptyPlayerMatchStats } from './postMatchAwards';
import { createInitialPlayers } from './rules';

test('createEmptyPlayerMatchStats returns fresh zeroed stats objects', () => {
  const first = createEmptyPlayerMatchStats();
  const second = createEmptyPlayerMatchStats();

  assert.deepEqual(first, {
    jailVisits: 0,
    maxSingleRentCollected: 0,
    totalRentCollected: 0,
    totalRentPaid: 0,
    sabotageCount: 0,
    worldTourFlights: 0,
  });
  assert.notEqual(first, second);
  first.jailVisits = 5;
  assert.equal(second.jailVisits, 0);
});

test('computePostMatchAwards returns all 4 primary awards when each category meets its threshold', () => {
  const players = createInitialPlayers(DEFAULT_PLAYER_CONFIGS, 2_000_000);
  const statsByPlayerId: Record<number, PlayerMatchStats> = {
    0: {
      ...createEmptyPlayerMatchStats(),
      jailVisits: 3,
    },
    1: {
      ...createEmptyPlayerMatchStats(),
      maxSingleRentCollected: 450_000,
      totalRentCollected: 700_000,
    },
    2: {
      ...createEmptyPlayerMatchStats(),
      sabotageCount: 4,
    },
    3: {
      ...createEmptyPlayerMatchStats(),
      totalRentPaid: 1_200_000,
    },
  };

  const awards: PostMatchAward[] = computePostMatchAwards(players, statsByPlayerId);
  assert.equal(awards.length, 4);

  assert.deepEqual(
    awards.map((a) => ({
      id: a.id,
      icon: a.icon,
      title: a.title,
      playerId: a.playerId,
      playerName: a.playerName,
      playerColor: a.playerColor,
      valueLabel: a.valueLabel,
    })),
    [
      {
        id: 'CHUA_DAO_HOANG',
        icon: '🏝️',
        title: 'Chúa Đảo Hoang',
        playerId: 0,
        playerName: players[0].name,
        playerColor: players[0].color,
        valueLabel: '3 lần ra đảo',
      },
      {
        id: 'TRUM_THU_HO',
        icon: '💰',
        title: 'Trùm Thu Họ',
        playerId: 1,
        playerName: players[1].name,
        playerColor: players[1].color,
        valueLabel: '450K',
      },
      {
        id: 'THANH_PHA_HOAI',
        icon: '💣',
        title: 'Thánh Phá Hoại',
        playerId: 2,
        playerName: players[2].name,
        playerColor: players[2].color,
        valueLabel: '4 pha công kích',
      },
      {
        id: 'NHA_TAI_TRO_VANG',
        icon: '💸',
        title: 'Nhà Tài Trợ Vàng',
        playerId: 3,
        playerName: players[3].name,
        playerColor: players[3].color,
        valueLabel: '1.2M',
      },
    ]
  );

  for (const award of awards) {
    assert.ok(award.subtitle.trim().length > 0, `Expected non-empty subtitle for ${award.id}`);
  }
});

test('computePostMatchAwards skips zero/sub-threshold awards and accepts exact minimum thresholds', () => {
  const players = createInitialPlayers(DEFAULT_PLAYER_CONFIGS, 2_000_000);

  const subThresholdStats: Record<number, PlayerMatchStats> = {
    0: {
      jailVisits: 0,
      maxSingleRentCollected: 99_999,
      totalRentCollected: 99_999,
      totalRentPaid: 99_999,
      sabotageCount: 0,
      worldTourFlights: 0,
    },
    1: {
      jailVisits: 0,
      maxSingleRentCollected: 50_000,
      totalRentCollected: 120_000,
      totalRentPaid: 80_000,
      sabotageCount: 0,
      worldTourFlights: 0,
    },
  };
  assert.deepEqual(computePostMatchAwards(players, subThresholdStats), []);

  const exactThresholdStats: Record<number, PlayerMatchStats> = {
    0: {
      ...createEmptyPlayerMatchStats(),
      jailVisits: 1,
    },
    1: {
      ...createEmptyPlayerMatchStats(),
      maxSingleRentCollected: 100_000,
    },
    2: {
      ...createEmptyPlayerMatchStats(),
      sabotageCount: 1,
    },
    3: {
      ...createEmptyPlayerMatchStats(),
      totalRentPaid: 100_000,
    },
  };

  const exactAwards = computePostMatchAwards(players, exactThresholdStats);
  assert.deepEqual(
    exactAwards.map((a) => [a.id, a.valueLabel]),
    [
      ['CHUA_DAO_HOANG', '1 lần ra đảo'],
      ['TRUM_THU_HO', '100K'],
      ['THANH_PHA_HOAI', '1 pha công kích'],
      ['NHA_TAI_TRO_VANG', '100K'],
    ]
  );
});

test('computePostMatchAwards handles NHA_TAI_TRO_VANG preference vs TRUM_THU_HO and PHUOT_THU fallback', () => {
  const players = createInitialPlayers(DEFAULT_PLAYER_CONFIGS, 2_000_000);

  // Case A: P0 wins TRUM_THU_HO and also paid the most overall (800K),
  // but P2 also meets >= 100K (150K) -> NHA_TAI_TRO_VANG prefers P2.
  const preferOtherStats: Record<number, PlayerMatchStats> = {
    0: {
      ...createEmptyPlayerMatchStats(),
      maxSingleRentCollected: 500_000,
      totalRentPaid: 800_000,
    },
    2: {
      ...createEmptyPlayerMatchStats(),
      totalRentPaid: 150_000,
    },
    3: {
      ...createEmptyPlayerMatchStats(),
      worldTourFlights: 5,
    },
  };
  const preferOtherAwards = computePostMatchAwards(players, preferOtherStats);
  assert.equal(preferOtherAwards.length, 2);
  assert.equal(preferOtherAwards[0].id, 'TRUM_THU_HO');
  assert.equal(preferOtherAwards[0].playerId, 0);
  assert.equal(preferOtherAwards[1].id, 'NHA_TAI_TRO_VANG');
  assert.equal(preferOtherAwards[1].playerId, 2);
  assert.equal(preferOtherAwards[1].valueLabel, '150K');

  // Case B: Only TRUM_THU_HO winner (P0) meets totalRentPaid >= 100K; others < 100K -> still award NHA_TAI_TRO_VANG to P0.
  const onlySameWinnerStats: Record<number, PlayerMatchStats> = {
    0: {
      ...createEmptyPlayerMatchStats(),
      maxSingleRentCollected: 500_000,
      totalRentPaid: 250_000,
    },
    1: {
      ...createEmptyPlayerMatchStats(),
      totalRentPaid: 99_000,
    },
    3: {
      ...createEmptyPlayerMatchStats(),
      worldTourFlights: 3,
    },
  };
  const onlySameWinnerAwards = computePostMatchAwards(players, onlySameWinnerStats);
  assert.equal(onlySameWinnerAwards.length, 2);
  assert.equal(onlySameWinnerAwards[0].id, 'TRUM_THU_HO');
  assert.equal(onlySameWinnerAwards[0].playerId, 0);
  assert.equal(onlySameWinnerAwards[1].id, 'NHA_TAI_TRO_VANG');
  assert.equal(onlySameWinnerAwards[1].playerId, 0);
  assert.equal(onlySameWinnerAwards[1].valueLabel, '250K');

  // Case C: Nobody meets totalRentPaid >= 100K -> fallback to PHUOT_THU (worldTourFlights >= 1).
  const fallbackFlightStats: Record<number, PlayerMatchStats> = {
    0: {
      ...createEmptyPlayerMatchStats(),
      maxSingleRentCollected: 300_000,
      totalRentPaid: 75_000,
    },
    2: {
      ...createEmptyPlayerMatchStats(),
      worldTourFlights: 2,
    },
  };
  const fallbackAwards = computePostMatchAwards(players, fallbackFlightStats);
  assert.equal(fallbackAwards.length, 2);
  assert.equal(fallbackAwards[0].id, 'TRUM_THU_HO');
  assert.equal(fallbackAwards[1].id, 'PHUOT_THU');
  assert.equal(fallbackAwards[1].icon, '✈️');
  assert.equal(fallbackAwards[1].title, 'Phượt Thủ Xuyên Việt');
  assert.equal(fallbackAwards[1].playerId, 2);
  assert.equal(fallbackAwards[1].valueLabel, '2 chuyến bay');

  // Case D: No TRUM_THU_HO winner, but cumulative small rents reach >= 100K for P1 -> NHA_TAI_TRO_VANG awarded to P1.
  const cumulativeRentStats: Record<number, PlayerMatchStats> = {
    1: {
      ...createEmptyPlayerMatchStats(),
      maxSingleRentCollected: 60_000,
      totalRentPaid: 120_000,
    },
  };
  const cumulativeAwards = computePostMatchAwards(players, cumulativeRentStats);
  assert.equal(cumulativeAwards.length, 1);
  assert.equal(cumulativeAwards[0].id, 'NHA_TAI_TRO_VANG');
  assert.equal(cumulativeAwards[0].playerId, 1);
  assert.equal(cumulativeAwards[0].valueLabel, '120K');
});

test('computePostMatchAwards breaks ties deterministically by lowest playerId regardless of input order', () => {
  const players = createInitialPlayers(DEFAULT_PLAYER_CONFIGS, 2_000_000);
  const reversedPlayers = [...players].reverse(); // [p3, p2, p1, p0]

  const tiedStats: Record<number, PlayerMatchStats> = {
    0: {
      jailVisits: 2,
      maxSingleRentCollected: 300_000,
      totalRentCollected: 300_000,
      totalRentPaid: 50_000,
      sabotageCount: 2,
      worldTourFlights: 0,
    },
    1: {
      jailVisits: 1,
      maxSingleRentCollected: 200_000,
      totalRentCollected: 200_000,
      totalRentPaid: 200_000,
      sabotageCount: 2,
      worldTourFlights: 0,
    },
    2: {
      jailVisits: 2,
      maxSingleRentCollected: 300_000,
      totalRentCollected: 300_000,
      totalRentPaid: 200_000,
      sabotageCount: 1,
      worldTourFlights: 0,
    },
    3: {
      jailVisits: 2,
      maxSingleRentCollected: 100_000,
      totalRentCollected: 100_000,
      totalRentPaid: 200_000,
      sabotageCount: 2,
      worldTourFlights: 0,
    },
  };

  const awards = computePostMatchAwards(reversedPlayers, tiedStats);
  assert.deepEqual(
    awards.map((a) => [a.id, a.playerId]),
    [
      ['CHUA_DAO_HOANG', 0], // tie between 0, 2, 3 -> lowest id 0
      ['TRUM_THU_HO', 0], // tie between 0, 2 -> lowest id 0
      ['THANH_PHA_HOAI', 0], // tie between 0, 1, 3 -> lowest id 0
      ['NHA_TAI_TRO_VANG', 1], // tie between 1, 2, 3 (excluding 0) -> lowest id 1
    ]
  );

  // Also test deterministic tie-break on PHUOT_THU fallback
  const tiedFlightStats: Record<number, PlayerMatchStats> = {
    1: { ...createEmptyPlayerMatchStats(), worldTourFlights: 3 },
    3: { ...createEmptyPlayerMatchStats(), worldTourFlights: 3 },
  };
  const flightAwards = computePostMatchAwards(reversedPlayers, tiedFlightStats);
  assert.equal(flightAwards.length, 1);
  assert.equal(flightAwards[0].id, 'PHUOT_THU');
  assert.equal(flightAwards[0].playerId, 1);
});

test('computePostMatchAwards handles empty players, missing stats, bankrupt players, and invalid numbers safely', () => {
  assert.deepEqual(computePostMatchAwards([], {}), []);

  const players = createInitialPlayers(DEFAULT_PLAYER_CONFIGS, 2_000_000);
  players[2].bankrupt = true;

  const partialStats: Record<number, PlayerMatchStats> = {
    0: {
      jailVisits: Number.NaN,
      maxSingleRentCollected: -500_000,
      totalRentCollected: 0,
      totalRentPaid: Number.POSITIVE_INFINITY,
      sabotageCount: 0,
      worldTourFlights: -1,
    },
    2: {
      ...createEmptyPlayerMatchStats(),
      totalRentPaid: 400_000,
    },
  };

  const awards = computePostMatchAwards(players, partialStats);
  assert.equal(awards.length, 1);
  assert.equal(awards[0].id, 'NHA_TAI_TRO_VANG');
  assert.equal(awards[0].playerId, 2);
  assert.equal(awards[0].valueLabel, '400K');
});
