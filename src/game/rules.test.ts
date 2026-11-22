import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  BOARD_TILES,
  CHANCE_CARDS,
  COLOR_GROUP_META,
  DEFAULT_PLAYER_CONFIGS,
} from './boardData';
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
  calculateBuyoutPrice,
  calculatePropertyInvestedValue,
  calculateRent,
  calculateTaxAmount,
  calculateTotalRealEstateValue,
  canBuyoutProperty,
  canUpgradeProperty,
  CHAMPIONSHIP_FEE,
  clearDisownedModifiers,
  clearTileOutage,
  computeCinematicCameraPose,
  computeDayNightLightingState,
  computeForwardSteps,
  computeOptimalAutoSale,
  computeTokenHopTiming,
  createDefaultBoardModifiers,
  createInitialPlayers,
  createInitialProperties,
  DICE_BOX_FACE_VALUES,
  evaluateMatchWinner,
  formatBusinessTourCompact,
  formatBusinessTourSpaced,
  formatCountdownClock,
  formatTilePriceLabel,
  getDiceFaceBaseEuler,
  getInitialPurchaseTiers,
  getStartUpgradableTileIndices,
  getTileTransform,
  getValidTacticalCardTargets,
  isValidWorldTourTarget,
  ownsFullColorGroup,
  parseDeterministicDiceQueue,
  rankPlayersForVictory,
  resolveIslandRollOutcome,
  resolvePostActionTurnPhase,
  resolveWorldTourMovement,
  shouldGrantImmediateDoublesRoll,
  TOTAL_TILES,
  TURN_COUNTDOWN_SECONDS,
  wouldOwnTileWinMatch,
} from './rules';
import { ColorGroup, MatchBoardModifiers, PlayerState, PropertyState, TileKind } from './types';

test('32-tile Business Tour board topology matches exact corner, resort, chance, tax and 8 color groups', () => {
  assert.equal(TOTAL_TILES, 32);
  assert.equal(BOARD_TILES.length, 32);
  assert.equal(BOARD_TILES[0].kind, (TileKind as Record<string, string>).START);
  assert.equal(BOARD_TILES[8].kind, (TileKind as Record<string, string>).LOST_ISLAND);
  assert.equal(BOARD_TILES[16].kind, (TileKind as Record<string, string>).WORLD_CHAMPIONSHIPS);
  assert.equal(BOARD_TILES[24].kind, (TileKind as Record<string, string>).WORLD_TOUR);
  assert.equal(BOARD_TILES[30].kind, (TileKind as Record<string, string>).TAX);
  assert.deepEqual(
    BOARD_TILES.filter((t) => t.kind === (TileKind as Record<string, string>).RESORT).map((t) => t.index),
    [4, 14, 18, 25]
  );
  assert.deepEqual(
    BOARD_TILES.filter((t) => t.kind === (TileKind as Record<string, string>).CHANCE).map((t) => t.index),
    [12, 20, 28]
  );
  assert.equal(BOARD_TILES.filter((t) => t.kind === TileKind.PROPERTY).length, 20);
  assert.equal(Object.keys(COLOR_GROUP_META).length, 8);
  assert.ok(CHANCE_CARDS.length >= 12);
});

test('32-tile transforms fit seamlessly within [-5.7, +5.7] inner span with corners at (±7, ±7)', () => {
  assert.deepEqual(
    [0, 8, 16, 24].map((i) => {
      const tr = getTileTransform(i);
      return [tr.x, tr.z, tr.isCorner];
    }),
    [
      [7, 7, true],
      [-7, 7, true],
      [-7, -7, true],
      [7, -7, true],
    ]
  );
  const t1 = getTileTransform(1);
  const t7 = getTileTransform(7);
  assert.ok(Math.abs(t1.x + t1.width / 2 - 5.7) < 1e-6);
  assert.ok(Math.abs(t7.x - t7.width / 2 - -5.7) < 1e-6);

  const transforms = Array.from({ length: TOTAL_TILES }, (_, i) => getTileTransform(i));
  for (let i = 0; i < TOTAL_TILES; i++) {
    const curr = transforms[i];
    const next = transforms[(i + 1) % TOTAL_TILES];
    const dist = Math.hypot(next.x - curr.x, next.z - curr.z);
    assert.ok(dist > 1.5 && dist < 2.2, `Unexpected gap ${dist} between ${i} and ${i + 1}`);
  }
});

test('Direct currency formatters format raw VND/BT numbers without hidden x3000 multiplier', () => {
  assert.equal(TURN_COUNTDOWN_SECONDS, 45);
  assert.equal(formatBusinessTourCompact(0), '0K');
  assert.equal(formatBusinessTourCompact(50_000), '50K');
  assert.equal(formatBusinessTourCompact(2_000_000), '2M');
  assert.equal(formatBusinessTourCompact(-200_000, true), '-200K');
  assert.equal(formatBusinessTourSpaced(0), '0');
  assert.equal(formatBusinessTourSpaced(2_000_000), '2 000 000');
  assert.equal(formatBusinessTourSpaced(-150_000), '-150 000');
  assert.equal(formatCountdownClock(45), '00:45');
  assert.equal(formatCountdownClock(7), '00:07');
  assert.equal(formatCountdownClock(0), '00:00');
});

test('3D dice base Euler orientations point exact face normal straight up (+Y)', () => {
  const slotNormals = [
    new THREE.Vector3(1, 0, 0),
    new THREE.Vector3(-1, 0, 0),
    new THREE.Vector3(0, 1, 0),
    new THREE.Vector3(0, -1, 0),
    new THREE.Vector3(0, 0, 1),
    new THREE.Vector3(0, 0, -1),
  ];

  for (let faceVal = 1; faceVal <= 6; faceVal++) {
    const slotIdx = DICE_BOX_FACE_VALUES.indexOf(faceVal);
    assert.notEqual(slotIdx, -1, `Missing face value ${faceVal}`);

    const [rx, ry, rz] = getDiceFaceBaseEuler(faceVal);
    const euler = new THREE.Euler(rx, ry, rz, 'XYZ');
    const qBase = new THREE.Quaternion().setFromEuler(euler);

    const qYaw = new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(0, 1, 0),
      1.234
    );
    const qFinal = qYaw.multiply(qBase);

    const worldNormal = slotNormals[slotIdx].clone().applyQuaternion(qFinal);
    assert.ok(Math.abs(worldNormal.x) < 1e-6, `face ${faceVal} x=${worldNormal.x}`);
    assert.ok(Math.abs(worldNormal.y - 1) < 1e-6, `face ${faceVal} y=${worldNormal.y}`);
    assert.ok(Math.abs(worldNormal.z) < 1e-6, `face ${faceVal} z=${worldNormal.z}`);
  }
});

test('forward movement detects passing Start accurately on 32-tile loop', () => {
  const stepNoPass = computeForwardSteps(23, 3);
  assert.deepEqual(stepNoPass.path, [24, 25, 26]);
  assert.equal(stepNoPass.passedStart, false);

  const stepPass = computeForwardSteps(29, 5);
  assert.deepEqual(stepPass.path, [30, 31, 0, 1, 2]);
  assert.equal(stepPass.finalTile, 2);
  assert.equal(stepPass.passedStart, true);
});

test('cinematic camera pose tracks moving tokens and day/night lighting interpolates cleanly', () => {
  const hopPoseSE = computeCinematicCameraPose('hop', { x: 7, y: 0.28, z: 7 });
  const hopPoseNW = computeCinematicCameraPose('hop', { x: -7, y: 0.28, z: -7 });
  const dicePose = computeCinematicCameraPose('dice', { x: 0, y: 0.66, z: 0 });

  assert.ok(hopPoseSE.target.x > 4 && hopPoseSE.target.z > 4);
  assert.ok(hopPoseNW.target.x < -4 && hopPoseNW.target.z < -4);
  assert.equal(
    Math.round((hopPoseSE.position.x - hopPoseSE.target.x) * 10),
    Math.round((hopPoseNW.position.x - hopPoseNW.target.x) * 10)
  );
  assert.ok(dicePose.position.y < 15);

  const day = computeDayNightLightingState(0);
  const twilight = computeDayNightLightingState(0.5);
  const night = computeDayNightLightingState(1);

  assert.equal(day.windowEmissiveIntensity, 0);
  assert.equal(day.lampBulbEmissiveIntensity, 0);
  assert.equal(day.starOpacity, 0);

  assert.ok(twilight.windowEmissiveIntensity > 0.4 && twilight.windowEmissiveIntensity < 1.8);
  assert.ok(night.windowEmissiveIntensity > 2.4);
  assert.ok(night.lampBulbEmissiveIntensity > 3.0);
  assert.ok(night.courtyardPointLightIntensity > 3.2);
  assert.ok(night.envIntensity < 0.1);
  assert.ok(night.keyLightIntensity < day.keyLightIntensity);
  assert.ok(night.starOpacity > 0.9);
});

test('doubles roll skips end-turn confirmation and transitions directly to AWAIT_ROLL unless jailed or bankrupt', () => {
  const [basePlayer] = createInitialPlayers(DEFAULT_PLAYER_CONFIGS, 2_000_000);
  const props = createInitialProperties();
  assert.ok(Object.keys(props).length >= 20);

  assert.equal(shouldGrantImmediateDoublesRoll(basePlayer), false);
  assert.equal(resolvePostActionTurnPhase(basePlayer), 'AWAIT_END_TURN');

  const firstDoubles = { ...basePlayer, doublesStreak: 1 };
  const secondDoubles = { ...basePlayer, doublesStreak: 2 };
  assert.equal(shouldGrantImmediateDoublesRoll(firstDoubles), true);
  assert.equal(resolvePostActionTurnPhase(firstDoubles), 'AWAIT_ROLL');
  assert.equal(shouldGrantImmediateDoublesRoll(secondDoubles), true);
  assert.equal(resolvePostActionTurnPhase(secondDoubles), 'AWAIT_ROLL');

  assert.equal(resolvePostActionTurnPhase({ ...basePlayer, doublesStreak: 3 }), 'AWAIT_END_TURN');
  assert.equal(resolvePostActionTurnPhase({ ...basePlayer, doublesStreak: 1, inJail: true }), 'AWAIT_END_TURN');
  assert.equal(resolvePostActionTurnPhase({ ...basePlayer, doublesStreak: 1, bankrupt: true }), 'AWAIT_END_TURN');
  assert.equal(resolvePostActionTurnPhase(null), 'AWAIT_END_TURN');

  assert.deepEqual(parseDeterministicDiceQueue(''), []);
  assert.deepEqual(
    parseDeterministicDiceQueue('?autostart=1&dice=3-3,1-5,7-2,bad,6:6'),
    [
      [3, 3],
      [1, 5],
      [6, 6],
    ]
  );
});

function makeTestPlayer(overrides: Partial<PlayerState> = {}): PlayerState {
  const base = createInitialPlayers(DEFAULT_PLAYER_CONFIGS, 2_000_000)[0];
  return { ...base, ...overrides };
}

function makeTestProps(
  entries: Record<number, { ownerId: number | null; level?: number }>
): Record<number, PropertyState> {
  const props = createInitialProperties();
  for (const [key, val] of Object.entries(entries)) {
    const idx = Number(key);
    props[idx] = {
      tileIndex: idx,
      ownerId: val.ownerId,
      level: val.level ?? 0,
    };
  }
  return props;
}

test('Lap building caps & Start upgrade: lap 0 caps at level 2; lap 1+ allows direct upgrade from any owned level (0..3) to Hotel ★ (level 4) on revisit or from Start', () => {
  const pLap0 = makeTestPlayer({ id: 0, cash: 2_000_000, laps: 0 });
  assert.deepEqual(
    getInitialPurchaseTiers(pLap0, 1).map((t) => t.level),
    [0, 1, 2]
  );

  const propsLap0 = makeTestProps({ 1: { ownerId: 0, level: 2 } });
  assert.equal(
    canUpgradeProperty(pLap0, 1, propsLap0, { isOnTileLanding: true, targetLevel: 3 }).allowed,
    false
  );

  const pLap1 = makeTestPlayer({ id: 0, cash: 2_000_000, laps: 1 });
  // Initial buy on unowned tile is still capped at level 3 (never Hotel on first buy)
  assert.deepEqual(
    getInitialPurchaseTiers(pLap1, 1).map((t) => t.level),
    [0, 1, 2, 3]
  );

  // Revisiting owned city at level 0, 1, 2, or 3 on lap 1+ CAN upgrade straight to Hotel ★ (level 4)!
  const propsLv1 = makeTestProps({ 1: { ownerId: 0, level: 1 } });
  const upgFrom1To4 = canUpgradeProperty(pLap1, 1, propsLv1, {
    isOnTileLanding: true,
    targetLevel: 4,
  });
  assert.equal(upgFrom1To4.allowed, true);
  assert.equal(upgFrom1To4.cost, 3 * 50_000);

  const propsLv2 = makeTestProps({ 1: { ownerId: 0, level: 2 }, 5: { ownerId: 0, level: 4 } });
  assert.equal(
    canUpgradeProperty(pLap1, 1, propsLv2, { isOnTileLanding: true, targetLevel: 4 }).allowed,
    true
  );
  assert.equal(
    canUpgradeProperty(pLap1, 1, propsLv2, { isOnTileLanding: false, targetLevel: 4 }).allowed,
    false
  );
  // Landing directly on START (allowRemoteFromStart: true) unlocks upgrading any owned city < level 4
  assert.equal(
    canUpgradeProperty(pLap1, 1, propsLv2, { allowRemoteFromStart: true, targetLevel: 4 }).allowed,
    true
  );
  assert.deepEqual(getStartUpgradableTileIndices(pLap1, propsLv2), [1]);
});

test('Rent combines Color Monopoly (x2), Festival (x2) and progressive World Championships (x2 -> x3 -> x4) + live outer price tab labels', () => {
  const props = makeTestProps({
    1: { ownerId: 0, level: 1 }, // Hà Giang 1 house base = 30,000
    2: { ownerId: 0, level: 0 },
    3: { ownerId: 0, level: 0 },
  });
  assert.equal(ownsFullColorGroup(0, ColorGroup.BROWN, props), true);

  let mods: MatchBoardModifiers = {
    festivalTileIndices: [1],
    championshipTileIndex: null,
    championshipMultiplier: 1,
  };
  mods = applyChampionshipHost(mods, 1); // 2x
  assert.equal(calculateRent(1, props, mods), 30_000 * 2 * 2 * 2); // 240,000
  assert.equal(formatTilePriceLabel(BOARD_TILES[1], props[1], props, mods), '240K');

  mods = applyChampionshipHost(mods, 2); // moves cup to tile 2 at 3x
  assert.equal(calculateRent(1, props, mods), 30_000 * 2 * 2); // 120,000
  assert.equal(calculateRent(2, props, mods), 12_000 * 2 * 3); // 72,000
  assert.equal(formatTilePriceLabel(BOARD_TILES[30], undefined, props, mods), '-10%');
  assert.equal(formatTilePriceLabel(BOARD_TILES[5], props[5], props, mods), '90K');

  const autoMods = createDefaultBoardModifiers(3, () => 0.25);
  assert.equal(autoMods.festivalTileIndices.length, 3);
  const festGroups = new Set(autoMods.festivalTileIndices.map((idx) => BOARD_TILES[idx].group));
  assert.equal(festGroups.size, 3);
});

test('Resort rents scale [50K, 150K, 400K, 1M], block Buyout 2x, and 4/4 triggers RESORT_MONOPOLY', () => {
  const players = createInitialPlayers(DEFAULT_PLAYER_CONFIGS, 2_000_000);
  const props = makeTestProps({
    4: { ownerId: 0, level: 0 },
    14: { ownerId: 0, level: 0 },
    18: { ownerId: 0, level: 0 },
  });
  assert.equal(calculateRent(4, props), 400_000);
  assert.equal(canBuyoutProperty(players[1], 4, props).allowed, false);
  props[25] = { tileIndex: 25, ownerId: 0, level: 0 };
  assert.equal(calculateRent(25, props), 1_000_000);
  const win = evaluateMatchWinner(players, props);
  assert.equal(win?.condition, 'RESORT_MONOPOLY');
  assert.equal(win?.winner.id, 0);
});

test('TRIPLE_MONOPOLY and LINE_MONOPOLY trigger instant victory', () => {
  const players = createInitialPlayers(DEFAULT_PLAYER_CONFIGS, 2_000_000);
  const eastProps = makeTestProps({
    25: { ownerId: 1 },
    26: { ownerId: 1 },
    27: { ownerId: 1 },
    29: { ownerId: 1 },
    31: { ownerId: 1 },
  });
  assert.equal(evaluateMatchWinner(players, eastProps)?.condition, 'SIDE_MONOPOLY');

  const tripleProps = makeTestProps({
    13: { ownerId: 2 },
    15: { ownerId: 2 },
    17: { ownerId: 2 },
    19: { ownerId: 2 },
    26: { ownerId: 2 },
    27: { ownerId: 2 },
  });
  assert.equal(evaluateMatchWinner(players, tripleProps)?.condition, 'TRIPLE_MONOPOLY');
});

test('Tax 10%, 100% invested value, Buyout 2x, and Optimal Auto-Sale prioritize keeping hotels & monopolies', () => {
  const props = makeTestProps({
    1: { ownerId: 0, level: 4 }, // 50K + 4*50K = 250K (Hotel ★)
    13: { ownerId: 0, level: 0 }, // 180K (part of incomplete group)
    17: { ownerId: 0, level: 0 }, // 220K (Amber monopoly)
    19: { ownerId: 0, level: 0 }, // 240K (Amber monopoly)
  });
  assert.equal(calculatePropertyInvestedValue(1, 4), 250_000);
  assert.equal(calculateTotalRealEstateValue(0, props), 890_000);
  assert.equal(calculateTaxAmount(0, props), 89_000);

  // Need 150K: should pick tile 13 (180K) rather than breaking Amber monopoly or Hotel
  const plan = computeOptimalAutoSale(0, 150_000, props);
  assert.equal(plan.sufficient, true);
  assert.deepEqual(plan.tileIndicesToSell, [13]);
  assert.equal(plan.totalRefund, 180_000);
  assert.equal(plan.cashAfterDebt, 30_000);

  // Buyout 2x allowed on level 0..3 PROPERTY, blocked on level 4
  const buyer = makeTestPlayer({ id: 1, cash: 2_000_000 });
  assert.equal(canBuyoutProperty(buyer, 1, props).allowed, false);
  assert.equal(calculateBuyoutPrice(13, 0), 360_000);
  assert.equal(canBuyoutProperty(buyer, 13, props).allowed, true);
});

test('Review Focus #1 & #2: Post-debt excess cash still allows 2x Buyout; selling/disowning Championship city clears host but preserves multiplier', () => {
  const props = makeTestProps({
    1: { ownerId: 1, level: 1 }, // invested 100K -> buyout = 200K
    29: { ownerId: 0, level: 0 }, // Hà Nội = 400K
  });
  const sale = computeOptimalAutoSale(0, 30_000, props);
  assert.equal(sale.sufficient, true);
  assert.equal(sale.cashAfterDebt, 370_000);
  const buyerAfterDebt = makeTestPlayer({ id: 0, cash: sale.cashAfterDebt });
  assert.equal(canBuyoutProperty(buyerAfterDebt, 1, props).allowed, true);

  let mods: MatchBoardModifiers = {
    festivalTileIndices: [],
    championshipTileIndex: null,
    championshipMultiplier: 1,
  };
  mods = applyChampionshipHost(mods, 29); // x2
  mods = applyChampionshipHost(mods, 29); // x3
  props[29] = { tileIndex: 29, ownerId: null, level: 0 };
  const cleaned = clearDisownedModifiers(mods, props);
  assert.equal(cleaned.championshipTileIndex, null);
  assert.equal(cleaned.championshipMultiplier, 3);
  assert.equal(applyChampionshipHost(cleaned, 1).championshipMultiplier, 4);
});

test('Review Focus #3, #4 & #5: Island doubles/3rd-turn release reset streak; 0-property Tax is 0 & insufficient Auto-Sale flags false; World Tour 24->3 grants lap & salary', () => {
  const escDoubles = resolveIslandRollOutcome(4, 4, 0);
  assert.deepEqual(escDoubles, {
    escaped: true,
    moveSteps: 8,
    nextJailTurns: 0,
    nextDoublesStreak: 0,
  });
  const failTurn1 = resolveIslandRollOutcome(2, 5, 0);
  assert.deepEqual(failTurn1, {
    escaped: false,
    moveSteps: 0,
    nextJailTurns: 1,
    nextDoublesStreak: 0,
  });
  const thirdFail = resolveIslandRollOutcome(2, 5, 2);
  assert.deepEqual(thirdFail, {
    escaped: true,
    moveSteps: 7,
    nextJailTurns: 0,
    nextDoublesStreak: 0,
  });

  const emptyProps = makeTestProps({});
  assert.equal(calculateTaxAmount(0, emptyProps), 0);
  assert.equal(computeOptimalAutoSale(0, 50_000, emptyProps).sufficient, false);

  const flightPassStart = resolveWorldTourMovement(24, 3);
  assert.equal(flightPassStart.passedStart, true);
  assert.equal(flightPassStart.lapsDelta, 1);
  assert.equal(flightPassStart.path.at(-1), 3);

  const flightNoStart = resolveWorldTourMovement(24, 27);
  assert.equal(flightNoStart.passedStart, false);
  assert.equal(flightNoStart.lapsDelta, 0);
  assert.deepEqual(flightNoStart.path, [25, 26, 27]);
});

test('Bot AI 32-tile heuristics: Resort/Side blocking, valid World Tour targets, Championship selection, and Gemini quips at 2M scale', () => {
  const players = createInitialPlayers(DEFAULT_PLAYER_CONFIGS, 2_000_000);
  const bot = { ...players[1], cash: 320_000, laps: 1 };
  const props = makeTestProps({
    4: { ownerId: 0 },
    14: { ownerId: 0 },
    18: { ownerId: 0 },
  });
  // Human owns 3/4 Resorts; Bot has 320K (120K left after buying tile 25) -> MUST buy to block win!
  assert.equal(botShouldBuyProperty(bot, 25, players, props), true);

  // Authentic Business Tour World Tour targets: allows unowned, own, opponent-owned (for 2x Buyout), Start (0), Championship (16 when owning a city), Chance (12, 20, 28); blocks 24, 8 (Lost Island), 30 (Tax)
  const wtProps = makeTestProps({
    1: { ownerId: 0, level: 1 },
    2: { ownerId: 1, level: 2 },
    4: { ownerId: 1, level: 0 },
  });
  const wtBot = { ...players[1], cash: 1_200_000, laps: 1 };
  assert.equal(isValidWorldTourTarget(wtBot, 1, wtProps), true); // opponent city (can pay rent & 2x Buyout)
  assert.equal(isValidWorldTourTarget(wtBot, 0, wtProps), true); // Start (salary + remote upgrade)
  assert.equal(isValidWorldTourTarget(wtBot, 16, wtProps), true); // World Championships (owns city 2)
  assert.equal(isValidWorldTourTarget(wtBot, 12, wtProps), true); // Chance
  assert.equal(isValidWorldTourTarget(wtBot, 2, wtProps), true); // own city
  assert.equal(isValidWorldTourTarget(wtBot, 25, wtProps), true); // unowned Resort
  assert.equal(isValidWorldTourTarget(wtBot, 24, wtProps), false); // self World Tour blocked
  assert.equal(isValidWorldTourTarget(wtBot, 8, wtProps), false); // Lost Island blocked
  assert.equal(isValidWorldTourTarget(wtBot, 30, wtProps), false); // Tax blocked

  const wtDest = botPickWorldTourTarget(
    wtBot,
    wtProps,
    { festivalTileIndices: [], championshipTileIndex: null, championshipMultiplier: 1 }
  );
  assert.ok(wtDest !== null && isValidWorldTourTarget(wtBot, wtDest, wtProps));

  // Lap caps respected by Bot initial tier & on-tile upgrade (lap 1+ upgrades straight to Hotel ★ = 4!)
  const botLap0 = { ...players[1], cash: 1_500_000, laps: 0 };
  assert.ok(botPickInitialPurchaseTier(botLap0, 1, props) <= 2);
  assert.equal(
    botPickOnTileUpgradeTargetLevel(botLap0, 2, {
      ...wtProps,
      2: { tileIndex: 2, ownerId: 1, level: 2 },
    }),
    null
  );
  assert.equal(
    botPickOnTileUpgradeTargetLevel(wtBot, 2, wtProps),
    4
  );

  // Championship target selection & buyout check
  const champTarget = botPickChampionshipTarget(
    wtBot,
    wtProps,
    { festivalTileIndices: [], championshipTileIndex: null, championshipMultiplier: 1 }
  );
  assert.equal(champTarget, 2);
  assert.equal(botShouldBuyoutProperty(wtBot, 1, players, wtProps), true);
  assert.equal(botChooseJailAction({ ...wtBot, cash: 300_000 }), 'ROLL_DOUBLES');
  assert.equal(botChooseJailAction({ ...wtBot, cash: 800_000 }), 'PAY_FINE');

  // Quip payloads at 2M scale
  assert.equal(buildBotBuyQuipPayload(players[0], 31, 450_000, wtProps), null);
  const richProps = makeTestProps({ 31: { ownerId: 1, level: 2 } });
  const buyPayload = buildBotBuyQuipPayload(wtBot, 31, 450_000, richProps, 'DIRECT');
  assert.ok(buyPayload);
  assert.equal(buildBotRentCollectedQuipPayload(wtBot, players[0].name, 1, 20_000, richProps), null);
  const rentPayload = buildBotRentCollectedQuipPayload(wtBot, players[0].name, 31, 810_000, richProps);
  assert.ok(rentPayload);
  const penPayload = buildBotPenaltyQuipPayload(wtBot, 'Cơ Quan Thuế', 150_000);
  assert.ok(penPayload);
});

for (const tile of BOARD_TILES) {
  assert.equal(tile.description.includes('$'), false);
}
for (const card of CHANCE_CARDS) {
  assert.equal(card.description.includes('$'), false);
}

test('Vietnam theming consistency, free Championship Bot target, Festival Auto-Sale preservation, and hop timing', () => {
  assert.equal(BOARD_TILES[16].name, 'CÚP QUỐC GIA');
  assert.equal(BOARD_TILES[16].shortName, 'CÚP QUỐC GIA');
  assert.equal(COLOR_GROUP_META[ColorGroup.CYAN].label, 'Miền Di Sản Việt Nam');
  assert.equal(COLOR_GROUP_META[ColorGroup.RED].label, 'Thủ Phủ Công Nghiệp');
  assert.equal(CHANCE_CARDS.find((c) => c.id === 'ch-8')?.title, 'Thẻ Thoát Đảo');

  for (const tile of BOARD_TILES) {
    assert.equal(/Cúp Thế Giới|CÚP THẾ GIỚI/i.test(tile.name), false);
    assert.equal(/Cúp Thế Giới|CÚP THẾ GIỚI/i.test(tile.description), false);
  }
  for (const card of CHANCE_CARDS) {
    assert.equal(/Cúp Thế Giới|CÚP THẾ GIỚI/i.test(card.title), false);
    assert.equal(/Cúp Thế Giới|CÚP THẾ GIỚI/i.test(card.description), false);
  }

  // World Championships on Tile 16 is FREE (0K) in authentic Business Tour, so even low-cash Bot hosts!
  assert.equal(CHAMPIONSHIP_FEE, 0);
  const poorBot = makeTestPlayer({ id: 1, isBot: true, cash: 10_000 });
  const poorBotProps = makeTestProps({ 5: { ownerId: 1, level: 1 } });
  const mods: MatchBoardModifiers = {
    festivalTileIndices: [13],
    championshipTileIndex: null,
    championshipMultiplier: 1,
  };
  assert.equal(botPickChampionshipTarget(poorBot, poorBotProps, mods, false), 5);
  assert.equal(botPickChampionshipTarget(poorBot, poorBotProps, mods, true), 5);

  // Auto-Sale keeps Festival (2x) city over equal-value non-festival city (tile 13=180K vs tile 11+... or tile 13=180K vs 15=200K? Use tile 10=150K vs tile 13=180K -> or tile 4=200K Resort vs tile 15=200K)
  // Better: tile 14 (Resort, 200K) vs tile 15 (Nha Trang, 200K, Festival): 1 Resort alone has no multi-Resort bonus!
  const festProps = makeTestProps({
    14: { ownerId: 0, level: 0 }, // 200K single Resort
    15: { ownerId: 0, level: 0 }, // 200K Nha Trang with Festival x2
  });
  const festMods: MatchBoardModifiers = {
    festivalTileIndices: [15],
    championshipTileIndex: null,
    championshipMultiplier: 1,
  };
  const festPlan = computeOptimalAutoSale(0, 150_000, festProps, festMods);
  assert.equal(festPlan.sufficient, true);
  assert.deepEqual(festPlan.tileIndicesToSell, [14]);

  // Long-distance hop timing finishes within < 3.2s at 1x speed
  const longHop = computeTokenHopTiming(25, 1);
  assert.ok(longHop.totalWaitMs < 3200, `Expected <3200ms, got ${longHop.totalWaitMs}`);
  const shortHop = computeTokenHopTiming(5, 1);
  assert.equal(shortHop.stepDurationSec, 0.3);
});

test('Business Tour Tactical Chance Cards (Earthquake, Power Outage, Shield) & Bankruptcy Full Asset Liquidation Payout', () => {
  assert.ok(CHANCE_CARDS.some((c) => c.effect.type === 'EARTHQUAKE'));
  assert.ok(CHANCE_CARDS.some((c) => c.effect.type === 'POWER_OUTAGE'));
  assert.ok(CHANCE_CARDS.some((c) => c.effect.type === 'SHIELD_CITY'));

  const players = createInitialPlayers(DEFAULT_PLAYER_CONFIGS, 2_000_000);
  const props = makeTestProps({
    1: { ownerId: 0, level: 0 }, // raw land claim (50K)
    2: { ownerId: 0, level: 2 }, // 2 houses (160K)
    3: { ownerId: 0, level: 4 }, // Hotel ★ (immune to Earthquake & Buyout)
    4: { ownerId: 0, level: 0 }, // Resort (immune to Earthquake & Buyout)
    29: { ownerId: 1, level: 3 }, // Bot's Hà Nội
  });

  let mods = createDefaultBoardModifiers(0);

  // 1. Shield protects city from 2x Buyout, and blocks 1 Power Outage or Earthquake
  assert.deepEqual(getValidTacticalCardTargets('SHIELD_CITY', 0, props, mods), [1, 2, 3]);
  mods = applyShieldToTile(2, mods);
  assert.ok(mods.shieldedTileIndices?.includes(2));
  assert.equal(canBuyoutProperty(players[1], 2, props, mods).allowed, false);

  // Power Outage against shielded tile 2 is absorbed by Shield!
  const outBlocked = applyPowerOutageToTile(2, props, mods);
  assert.equal(outBlocked.blockedByShield, true);
  assert.equal(outBlocked.nextModifiers.shieldedTileIndices?.includes(2), false);
  assert.equal(outBlocked.nextModifiers.outageTileIndices?.includes(2), false);
  mods = outBlocked.nextModifiers;

  // Power Outage against unshielded tile 2 sets rent to 0 until cleared!
  const outApplied = applyPowerOutageToTile(2, props, mods);
  assert.equal(outApplied.blockedByShield, false);
  mods = outApplied.nextModifiers;
  assert.equal(calculateRent(2, props, mods), 0);
  assert.equal(formatTilePriceLabel(BOARD_TILES[2], props[2], props, mods), '0K');
  mods = clearTileOutage(mods, 2);
  assert.ok(calculateRent(2, props, mods) > 0);

  // 2. Earthquake targets opponent PROPERTY < level 4 (excludes Hotels & Resorts)
  const eqTargets = getValidTacticalCardTargets('EARTHQUAKE', 1, props, mods);
  assert.deepEqual(eqTargets, [1, 2]);

  // Earthquake on 2-house city downgrades to 1 house
  const eqHouse = applyEarthquakeToTile(2, props, mods);
  assert.equal(eqHouse.destroyedToBank, false);
  assert.equal(eqHouse.newLevel, 1);
  assert.equal(eqHouse.nextProperties[2].level, 1);
  assert.equal(eqHouse.nextProperties[2].ownerId, 0);

  // Earthquake on 0-house raw land strips ownership back to Bank!
  const eqLand = applyEarthquakeToTile(1, eqHouse.nextProperties, mods);
  assert.equal(eqLand.destroyedToBank, true);
  assert.equal(eqLand.nextProperties[1].ownerId, null);
  assert.equal(eqLand.nextProperties[1].level, 0);

  // 3. Bot AI picks highest-impact tactical targets & Start upgrade plans
  const bot = { ...players[1], cash: 1_500_000, laps: 1 };
  const startPlan = botPickStartUpgradePlan(bot, props, mods);
  assert.deepEqual(startPlan, { tileIndex: 29, targetLevel: 4 });
  // Tile 1 is raw land (level 0) inside Player 0's full Brown monopoly (1,2,3) -> destroying it breaks the monopoly!
  assert.equal(botPickTacticalCardTarget('EARTHQUAKE', bot, players, props, mods), 1);
  // Without a full monopoly, Bot targets the highest-rent multi-house city (tile 15 over tile 1)
  const nonMonoProps = makeTestProps({
    1: { ownerId: 0, level: 0 },
    15: { ownerId: 0, level: 2 },
    29: { ownerId: 1, level: 3 },
  });
  assert.equal(botPickTacticalCardTarget('EARTHQUAKE', bot, players, nonMonoProps, mods), 15);
  assert.equal(botPickTacticalCardTarget('POWER_OUTAGE', bot, players, props, mods), 3);
  assert.equal(botPickTacticalCardTarget('SHIELD_CITY', bot, players, props, mods), 29);

  // 4. Bankruptcy against opponent pays leftoverCash + 100% liquidated real estate value!
  const debtor = makeTestPlayer({ id: 0, cash: 120_000 });
  const debtorProps = makeTestProps({
    5: { ownerId: 0, level: 1 }, // 90K + 75K = 165K
    14: { ownerId: 0, level: 0 }, // 200K Resort
  });
  assert.equal(calculateBankruptcyCreditorPayout(debtor, 1, debtorProps), 120_000 + 165_000 + 200_000);
  assert.equal(calculateBankruptcyCreditorPayout(debtor, null, debtorProps), 0);
});

test('rankPlayersForVictory always places match winner #1 (even on lower-net-worth special victory) and surviving players above bankrupt players', () => {
  const base = createInitialPlayers(DEFAULT_PLAYER_CONFIGS, 2_000_000);
  // Reproduce exact VictoryModal screenshot scenario:
  // Player 0 (Người chơi 1): alive, 6,576,000 net worth
  // Player 1 (Phu Nhân Ngọc Diệp): alive, owns 4/4 Resorts (800K) + 4,050,000 cash = 4,850,000 -> wins RESORT_MONOPOLY!
  // Player 2 & 3: bankrupt
  const props = makeTestProps({
    4: { ownerId: 1, level: 0 },
    14: { ownerId: 1, level: 0 },
    18: { ownerId: 1, level: 0 },
    25: { ownerId: 1, level: 0 },
  });
  const players: PlayerState[] = [
    { ...base[0], id: 0, name: 'Người chơi 1', cash: 6_576_000, bankrupt: false },
    { ...base[1], id: 1, name: 'Phu Nhân Ngọc Diệp', tokenType: 'crown', cash: 4_050_000, bankrupt: false },
    { ...base[2], id: 2, name: 'Chủ Tịch Lan Anh', tokenType: 'yacht', cash: 0, bankrupt: true },
    { ...base[3], id: 3, name: 'Shark Hoàng Nam', tokenType: 'jet', cash: 0, bankrupt: true },
  ];

  const win = evaluateMatchWinner(players, props);
  assert.equal(win?.condition, 'RESORT_MONOPOLY');
  assert.equal(win?.winner.id, 1);

  const ranked = rankPlayersForVictory(players, props, win!.winner.id);
  assert.deepEqual(
    ranked.map((p) => p.id),
    [1, 0, 2, 3]
  );

  // Edge case: non-bankrupt survivor with 0 cash & 0 properties still ranks above bankrupt players
  const zeroSurvivorPlayers: PlayerState[] = [
    { ...base[0], id: 0, cash: 1_500_000, bankrupt: false },
    { ...base[1], id: 1, cash: 0, bankrupt: true },
    { ...base[2], id: 2, cash: 0, bankrupt: false },
  ];
  const rankedZero = rankPlayersForVictory(zeroSurvivorPlayers, makeTestProps({}), 0);
  assert.deepEqual(
    rankedZero.map((p) => p.id),
    [0, 2, 1]
  );
});

test('Bot AI executes affordable instant-victory moves (Resort, Triple Monopoly, Side Monopoly) even when leftover cash is below normal reserve thresholds', () => {
  const players = createInitialPlayers(DEFAULT_PLAYER_CONFIGS, 2_000_000);
  const mods = createDefaultBoardModifiers(0);

  // 1. Direct purchase of 4th Resort (tile 25, price 200K) with only 210K cash (10K leftover < 100K reserve)
  const resortProps = makeTestProps({
    4: { ownerId: 1 },
    14: { ownerId: 1 },
    18: { ownerId: 1 },
  });
  const tightResortBot = { ...players[1], cash: 210_000, position: 25 };
  assert.equal(wouldOwnTileWinMatch(1, 25, players, resortProps)?.condition, 'RESORT_MONOPOLY');
  assert.equal(botShouldBuyProperty(tightResortBot, 25, players, resortProps), true);

  // 2. Direct purchase & 2x Buyout completing 3rd Color Monopoly (TRIPLE_MONOPOLY) with only 10K leftover
  const tripleNearProps = makeTestProps({
    13: { ownerId: 1 },
    15: { ownerId: 1 }, // Red full (1/3)
    17: { ownerId: 1 },
    19: { ownerId: 1 }, // Amber full (2/3)
    26: { ownerId: 1 }, // Purple 1/2 (needs tile 27 Đà Nẵng, price 350K / lv0 buyout 700K)
  });
  const tightTripleBot = { ...players[1], cash: 360_000, position: 27 };
  assert.equal(wouldOwnTileWinMatch(1, 27, players, tripleNearProps)?.condition, 'TRIPLE_MONOPOLY');
  assert.equal(botShouldBuyProperty(tightTripleBot, 27, players, tripleNearProps), true);

  const tripleBuyoutProps = {
    ...tripleNearProps,
    27: { tileIndex: 27, ownerId: 0, level: 0 },
  };
  const tightBuyoutBot = { ...players[1], cash: 710_000, position: 27 };
  assert.equal(botShouldBuyoutProperty(tightBuyoutBot, 27, players, tripleBuyoutProps, mods), true);

  // 3. World Tour from tile 24 (fee 50K) to unowned 4th Resort (tile 25, price 200K) with 260K cash (10K left)
  const wtWinBot = { ...players[1], cash: 260_000, position: 24, pendingWorldTour: true };
  assert.equal(botPickWorldTourTarget(wtWinBot, resortProps, mods, players), 25);

  // 4. World Tour from tile 24 (fee 50K) to opponent's tile 27 (rent 70K + buyout 700K = 820K total) with 830K cash (10K left < 150K reserve)
  const wtBuyoutWinBot = { ...players[1], cash: 830_000, position: 24, pendingWorldTour: true };
  assert.equal(botPickWorldTourTarget(wtBuyoutWinBot, tripleBuyoutProps, mods, players), 27);
});


