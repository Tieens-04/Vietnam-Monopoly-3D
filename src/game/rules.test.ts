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
  areTeammates,
  botChooseJailAction,
  botChooseTacticalDice,
  botPickChampionshipTarget,
  botPickInitialPurchaseTier,
  botPickOnTileUpgradeTargetLevel,
  botPickTacticalCardTarget,
  botPickWorldTourTarget,
  botShouldBuyoutProperty,
  botShouldBuyProperty,
  botShouldRerollDice,
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
  computePathToTile,
  computeTokenHopTiming,
  createDefaultBoardModifiers,
  createInitialPlayers,
  createInitialProperties,
  DEFAULT_EVEN_ODD_CHARGES,
  DEFAULT_FESTIVAL_CITY_COUNT,
  DEFAULT_REROLL_CHARGES,
  DICE_BOX_FACE_VALUES,
  evaluateMatchWinner,
  evaluateTimeLimitWinner,
  formatBusinessTourCompact,
  formatBusinessTourSpaced,
  formatCountdownClock,
  formatFestivalStartLog,
  formatTilePriceLabel,
  getDiceFaceBaseEuler,
  getInitialPurchaseTiers,
  getTileTransform,
  getValidTacticalCardTargets,
  isValidInitialPurchaseLevel,
  isValidTileIndex,
  isValidUpgradeTargetLevel,
  isValidWorldTourTarget,
  MATCH_DURATION_SECONDS,
  ownsFullColorGroup,
  parseDeterministicDiceQueue,
  rankPlayersForVictory,
  resolveIslandRollOutcome,
  resolveWorldTourMovement,
  rollTacticalDicePair,
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

test('doubles roll grants immediate bonus roll unless 3rd double, jailed, or bankrupt', () => {
  const [basePlayer] = createInitialPlayers(DEFAULT_PLAYER_CONFIGS, 2_000_000);
  const props = createInitialProperties();
  assert.ok(Object.keys(props).length >= 20);

  assert.equal(shouldGrantImmediateDoublesRoll(basePlayer), false);

  const firstDoubles = { ...basePlayer, doublesStreak: 1 };
  const secondDoubles = { ...basePlayer, doublesStreak: 2 };
  assert.equal(shouldGrantImmediateDoublesRoll(firstDoubles), true);
  assert.equal(shouldGrantImmediateDoublesRoll(secondDoubles), true);

  assert.equal(shouldGrantImmediateDoublesRoll({ ...basePlayer, doublesStreak: 3 }), false);
  assert.equal(shouldGrantImmediateDoublesRoll({ ...basePlayer, doublesStreak: 1, inJail: true }), false);
  assert.equal(shouldGrantImmediateDoublesRoll({ ...basePlayer, doublesStreak: 1, bankrupt: true }), false);
  assert.equal(shouldGrantImmediateDoublesRoll(null), false);

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

test('Lap building caps & Business Tour upgrade progression: lap 0 caps at level 2; lap 1+ caps below Lv3 at 3 and unlocks Hotel ★ (4) only from Lv3 on-tile; no Start remote upgrade', () => {
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

  // Revisiting owned city at level 0, 1, or 2 on lap 1+ can upgrade up to level 3, NEVER straight to Hotel ★ (4)
  const propsLv1 = makeTestProps({ 1: { ownerId: 0, level: 1 } });
  assert.equal(
    canUpgradeProperty(pLap1, 1, propsLv1, { isOnTileLanding: true, targetLevel: 4 }).allowed,
    false
  );
  const upgFrom1To3 = canUpgradeProperty(pLap1, 1, propsLv1, {
    isOnTileLanding: true,
    targetLevel: 3,
  });
  assert.equal(upgFrom1To3.allowed, true);
  assert.equal(upgFrom1To3.cost, 2 * 50_000);

  const propsLv2 = makeTestProps({ 1: { ownerId: 0, level: 2 }, 5: { ownerId: 0, level: 3 } });
  assert.equal(
    canUpgradeProperty(pLap1, 1, propsLv2, { isOnTileLanding: true, targetLevel: 4 }).allowed,
    false
  );
  assert.equal(
    canUpgradeProperty(pLap1, 1, propsLv2, { isOnTileLanding: true, targetLevel: 3 }).allowed,
    true
  );

  // Already at level 3 -> revisit on-tile CAN upgrade to Hotel ★ (level 4)
  assert.equal(
    canUpgradeProperty(pLap1, 5, propsLv2, { isOnTileLanding: true, targetLevel: 4 }).allowed,
    true
  );
  assert.equal(
    canUpgradeProperty(pLap1, 5, propsLv2, { isOnTileLanding: false, targetLevel: 4 }).allowed,
    false
  );
  // Remote upgrade without landing directly on the city (isOnTileLanding omitted/false) is strictly disabled (BUG-01)
  assert.equal(
    canUpgradeProperty(pLap1, 5, propsLv2, { isOnTileLanding: false, targetLevel: 4 }).allowed,
    false
  );
  assert.equal(BOARD_TILES[0].description.includes('nâng cấp'), false);
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

  // Authentic Business Tour World Tour targets: ONLY unowned purchasable tiles or own purchasable tiles
  const wtProps = makeTestProps({
    1: { ownerId: 0, level: 1 },
    2: { ownerId: 1, level: 2 },
    4: { ownerId: 1, level: 0 },
  });
  const wtBot = { ...players[1], cash: 1_200_000, laps: 1 };
  assert.equal(isValidWorldTourTarget(wtBot, 1, wtProps), false); // opponent city blocked (BUG-03)
  assert.equal(isValidWorldTourTarget(wtBot, 0, wtProps), false); // Start blocked (BUG-03)
  assert.equal(isValidWorldTourTarget(wtBot, 16, wtProps), false); // World Championships blocked (BUG-03)
  assert.equal(isValidWorldTourTarget(wtBot, 12, wtProps), false); // Chance blocked (BUG-03)
  assert.equal(isValidWorldTourTarget(wtBot, 2, wtProps), true); // own city allowed
  assert.equal(isValidWorldTourTarget(wtBot, 4, wtProps), true); // own Resort allowed
  assert.equal(isValidWorldTourTarget(wtBot, 25, wtProps), true); // unowned Resort allowed
  assert.equal(isValidWorldTourTarget(wtBot, 5, wtProps), true); // unowned city allowed
  assert.equal(isValidWorldTourTarget(wtBot, 24, wtProps), false); // self World Tour blocked
  assert.equal(isValidWorldTourTarget(wtBot, 8, wtProps), false); // Lost Island blocked
  assert.equal(isValidWorldTourTarget(wtBot, 30, wtProps), false); // Tax blocked

  const wtDest = botPickWorldTourTarget(
    wtBot,
    wtProps,
    { festivalTileIndices: [], championshipTileIndex: null, championshipMultiplier: 1 }
  );
  assert.ok(wtDest !== null && isValidWorldTourTarget(wtBot, wtDest, wtProps));

  // Lap & Hotel caps respected by Bot initial tier & on-tile upgrade (Lv2 -> Lv3 max; Lv3 -> Hotel ★ = 4)
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
    3
  );
  assert.equal(
    botPickOnTileUpgradeTargetLevel(wtBot, 2, {
      ...wtProps,
      2: { tileIndex: 2, ownerId: 1, level: 3 },
    }),
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

  // 3. Bot AI picks highest-impact tactical targets
  const bot = { ...players[1], cash: 1_500_000, laps: 1 };
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

  // 4. World Tour NEVER targets opponent-owned tile 27 (BUG-03), even if buyout would win;
  //    however, when tile 27 is unowned, Bot flies there to win TRIPLE_MONOPOLY!
  const wtBuyoutWinBot = { ...players[1], cash: 830_000, position: 24, pendingWorldTour: true };
  assert.notEqual(botPickWorldTourTarget(wtBuyoutWinBot, tripleBuyoutProps, mods, players), 27);
  const wtTripleWinBot = { ...players[1], cash: 410_000, position: 24, pendingWorldTour: true };
  assert.equal(botPickWorldTourTarget(wtTripleWinBot, tripleNearProps, mods, players), 27);
});

test('BUG-02 & BUG-03: Exhaustive upgrade progression (Lv0..2 -> 3 -> 4 ★) and full 32-tile World Tour target rules', () => {
  const players = createInitialPlayers(DEFAULT_PLAYER_CONFIGS, 2_000_000);
  const p = { ...players[0], cash: 2_000_000, laps: 2 };
  const props = makeTestProps({
    1: { ownerId: 0, level: 0 },
    2: { ownerId: 0, level: 1 },
    3: { ownerId: 0, level: 2 },
    5: { ownerId: 0, level: 3 },
    6: { ownerId: 1, level: 1 }, // opponent
    4: { ownerId: 0, level: 0 }, // own Resort
    14: { ownerId: 1, level: 0 }, // opponent Resort
  });

  for (const ownLowTile of [1, 2, 3]) {
    assert.equal(
      canUpgradeProperty(p, ownLowTile, props, { isOnTileLanding: true, targetLevel: 4 }).allowed,
      false
    );
    assert.equal(
      canUpgradeProperty(p, ownLowTile, props, { isOnTileLanding: true, targetLevel: 3 }).allowed,
      true
    );
    assert.equal(botPickOnTileUpgradeTargetLevel(p, ownLowTile, props), 3);
  }
  assert.equal(
    canUpgradeProperty(p, 5, props, { isOnTileLanding: true, targetLevel: 4 }).allowed,
    true
  );
  assert.equal(botPickOnTileUpgradeTargetLevel(p, 5, props), 4);

  const expectedValid = new Set<number>();
  for (const tile of BOARD_TILES) {
    const prop = props[tile.index];
    if (
      (tile.kind === TileKind.PROPERTY || tile.kind === TileKind.RESORT) &&
      (prop?.ownerId === null || prop?.ownerId === p.id)
    ) {
      expectedValid.add(tile.index);
    }
  }
  for (let i = 0; i < TOTAL_TILES; i++) {
    assert.equal(
      isValidWorldTourTarget(p, i, props),
      expectedValid.has(i),
      `Unexpected World Tour eligibility for tile ${i} (${BOARD_TILES[i].name})`
    );
  }
  assert.equal(BOARD_TILES[24].description.includes('Cúp Quốc Gia'), false);
  assert.equal(BOARD_TILES[24].description.includes('Bắt Đầu'), false);
});

test('BUG-04: 20-minute match timer & Net Worth Sudden Death ranking for FFA and TEAMS_2V2', () => {
  assert.equal(MATCH_DURATION_SECONDS, 1200);
  assert.equal(formatCountdownClock(MATCH_DURATION_SECONDS), '20:00');

  const base = createInitialPlayers(DEFAULT_PLAYER_CONFIGS, 2_000_000);
  const props = makeTestProps({
    29: { ownerId: 1, level: 2 }, // 400K + 2*250K = 900K
    31: { ownerId: 2, level: 1 }, // 450K + 250K = 700K
  });
  const ffaPlayers: PlayerState[] = [
    { ...base[0], id: 0, cash: 1_800_000, laps: 3, bankrupt: false }, // NW 1.8M
    { ...base[1], id: 1, cash: 1_200_000, laps: 1, bankrupt: false }, // NW 2.1M -> winner
    { ...base[2], id: 2, cash: 1_400_000, laps: 5, bankrupt: false }, // NW 2.1M (same NW, higher cash -> wait: 1.4M+700K=2.1M vs 1.2M+900K=2.1M!)
    { ...base[3], id: 3, cash: 5_000_000, laps: 9, bankrupt: true }, // bankrupt ignored
  ];
  const ffaWin = evaluateTimeLimitWinner(ffaPlayers, props, 'FFA');
  assert.equal(ffaWin?.condition, 'TIME_LIMIT');
  // P2 has same 2.1M NW as P1, higher cash (1.4M vs 1.2M) -> P2 wins tiebreak!
  assert.equal(ffaWin?.winner.id, 2);

  // Tiebreak by laps when Net Worth and cash are equal
  const tiePlayers: PlayerState[] = [
    { ...base[0], id: 0, cash: 1_000_000, laps: 2, bankrupt: false },
    { ...base[1], id: 1, cash: 1_000_000, laps: 4, bankrupt: false },
  ];
  const tieWin = evaluateTimeLimitWinner(tiePlayers, makeTestProps({}), 'FFA');
  assert.equal(tieWin?.winner.id, 1);

  // 2v2 Team Net Worth Sudden Death
  const teamPlayers = createInitialPlayers(DEFAULT_PLAYER_CONFIGS, 2_000_000, 'TEAMS_2V2');
  const teamOnlyProps = makeTestProps({
    29: { ownerId: 1, level: 2 }, // 400K + 2*250K = 900K
  });
  // Team 0 = P0 & P2; Team 1 = P1 & P3
  teamPlayers[0].cash = 1_500_000;
  teamPlayers[2].cash = 1_400_000; // Team 0 NW = 2.9M
  teamPlayers[1].cash = 1_100_000; // + tile 29 (900K) = 2.0M
  teamPlayers[3].cash = 1_200_000; // Team 1 NW = 3.2M -> Team 1 wins!
  const teamWin = evaluateTimeLimitWinner(teamPlayers, teamOnlyProps, 'TEAMS_2V2');
  assert.equal(teamWin?.condition, 'TIME_LIMIT');
  assert.equal(teamWin?.winningTeamId, 1);
  assert.equal(teamWin?.winner.id, 1); // highest-NW member on winning Team 1 (P1 = 2.0M vs P3 = 1.2M)
});

test('BUG-05: 2v2 Doubles mode enforces teammate rent/buyout/attack exemption and combined team monopolies', () => {
  const players = createInitialPlayers(DEFAULT_PLAYER_CONFIGS, 2_000_000, 'TEAMS_2V2');
  assert.deepEqual(
    players.map((p) => p.teamId),
    [0, 1, 0, 1]
  );
  assert.equal(areTeammates(players[0], players[2]), true);
  assert.equal(areTeammates(players[0], players[1]), false);
  assert.equal(areTeammates(players[0], players[0]), false);

  // Teammates split Brown (1,2 belong to P0; 3 belongs to P2) -> team owns full color group!
  const teamProps = makeTestProps({
    1: { ownerId: 0, level: 1 }, // Hà Giang 1 house = 30K
    2: { ownerId: 0, level: 0 },
    3: { ownerId: 2, level: 0 },
    4: { ownerId: 0, level: 0 }, // Resort 1
    14: { ownerId: 2, level: 0 }, // Resort 2
  });
  assert.equal(ownsFullColorGroup(0, ColorGroup.BROWN, teamProps, players, 'TEAMS_2V2'), true);
  // Rent to teammate visitor (P2) is 0; rent to opponent visitor (P1) includes 2x color monopoly bonus!
  assert.equal(calculateRent(1, teamProps, undefined, players, 'TEAMS_2V2', 2), 0);
  assert.equal(calculateRent(1, teamProps, undefined, players, 'TEAMS_2V2', 1), 60_000);
  // Combined team Resort rent: P0 + P2 hold 2 Resorts -> 150K to opponent, 0 to teammate
  assert.equal(calculateRent(4, teamProps, undefined, players, 'TEAMS_2V2', 1), 150_000);
  assert.equal(calculateRent(4, teamProps, undefined, players, 'TEAMS_2V2', 2), 0);

  // Buyout blocked against teammate, allowed against opponent
  assert.equal(canBuyoutProperty(players[2], 1, teamProps, undefined, players, 'TEAMS_2V2').allowed, false);
  assert.equal(canBuyoutProperty(players[1], 1, teamProps, undefined, players, 'TEAMS_2V2').allowed, true);
  assert.equal(botShouldBuyoutProperty(players[2], 1, players, teamProps, undefined, 'TEAMS_2V2'), false);

  // Tactical attack cards exclude teammate tiles
  const mods = createDefaultBoardModifiers(0);
  assert.deepEqual(
    getValidTacticalCardTargets('EARTHQUAKE', 0, teamProps, mods, players, 'TEAMS_2V2'),
    []
  );
  assert.deepEqual(
    getValidTacticalCardTargets('POWER_OUTAGE', 0, teamProps, mods, players, 'TEAMS_2V2'),
    []
  );
  assert.equal(
    botPickTacticalCardTarget('EARTHQUAKE', players[0], players, teamProps, mods, 'TEAMS_2V2'),
    null
  );

  // Combined team RESORT_MONOPOLY win (P0 owns 4,14; P2 owns 18,25)
  const teamResortProps = makeTestProps({
    4: { ownerId: 0 },
    14: { ownerId: 0 },
    18: { ownerId: 2 },
    25: { ownerId: 2 },
  });
  const resortWin = evaluateMatchWinner(players, teamResortProps, 'TEAMS_2V2');
  assert.equal(resortWin?.condition, 'RESORT_MONOPOLY');
  assert.equal(resortWin?.winningTeamId, 0);

  // Combined team TRIPLE_MONOPOLY & SIDE_MONOPOLY
  const teamSideProps = makeTestProps({
    25: { ownerId: 1 },
    26: { ownerId: 1 },
    27: { ownerId: 3 },
    29: { ownerId: 3 },
    31: { ownerId: 1 },
  });
  const sideWin = evaluateMatchWinner(players, teamSideProps, 'TEAMS_2V2');
  assert.equal(sideWin?.condition, 'SIDE_MONOPOLY');
  assert.equal(sideWin?.winningTeamId, 1);

  // LAST_STANDING in 2v2: 1 bankrupt teammate does NOT end match; both opposing teammates bankrupt DOES
  const oneDown = players.map((p) => (p.id === 3 ? { ...p, bankrupt: true } : p));
  assert.equal(evaluateMatchWinner(oneDown, makeTestProps({}), 'TEAMS_2V2'), null);
  const teamDown = players.map((p) => (p.teamId === 1 ? { ...p, bankrupt: true } : p));
  const lastWin = evaluateMatchWinner(teamDown, makeTestProps({}), 'TEAMS_2V2');
  assert.equal(lastWin?.condition, 'LAST_STANDING');
  assert.equal(lastWin?.winningTeamId, 0);

  // Ranking places winning team survivors #1 and #2 above opposing survivors
  const ranked = rankPlayersForVictory(oneDown, teamResortProps, 0, 'TEAMS_2V2', 0);
  assert.deepEqual(
    ranked.map((p) => p.id),
    [0, 2, 1, 3]
  );
});

test('BUG-10: Tactical Dice (EVEN / ODD / REROLL) generates valid dice pairs and Bot AI heuristics respect charges', () => {
  assert.equal(DEFAULT_EVEN_ODD_CHARGES, 3);
  assert.equal(DEFAULT_REROLL_CHARGES, 2);

  const players = createInitialPlayers(DEFAULT_PLAYER_CONFIGS, 2_000_000);
  assert.equal(players[0].evenOddCharges, 3);
  assert.equal(players[0].rerollCharges, 2);

  for (let i = 0; i < 36; i++) {
    const r = i / 36;
    const [e1, e2] = rollTacticalDicePair('EVEN', () => r);
    assert.ok(e1 >= 1 && e1 <= 6 && e2 >= 1 && e2 <= 6);
    assert.equal((e1 + e2) % 2, 0);

    const [o1, o2] = rollTacticalDicePair('ODD', () => r);
    assert.ok(o1 >= 1 && o1 <= 6 && o2 >= 1 && o2 <= 6);
    assert.equal((o1 + o2) % 2, 1);

    const [n1, n2] = rollTacticalDicePair('NORMAL', () => r);
    assert.ok(n1 >= 1 && n1 <= 6 && n2 >= 1 && n2 <= 6);
  }

  const mods = createDefaultBoardModifiers(0);
  // Bot with 0 charges never uses EVEN/ODD or Reroll
  const noChargeBot = { ...players[1], evenOddCharges: 0, rerollCharges: 0, position: 0 };
  const dangerProps = makeTestProps({
    4: { ownerId: 0 },
    14: { ownerId: 0 },
    18: { ownerId: 0 },
    25: { ownerId: 0 }, // 4 Resorts = 1M rent on tile 4!
    2: { ownerId: 0, level: 4 }, // 500K rent on even tile 2
  });
  assert.equal(botChooseTacticalDice(noChargeBot, players, dangerProps, mods), 'NORMAL');
  assert.equal(botShouldRerollDice(noChargeBot, 2, 2, players, dangerProps, mods), false);

  // Bot with charges rerolls when rolling into 1M Resort rent or 3rd consecutive double
  const chargeBot = { ...players[1], cash: 1_200_000, position: 0, rerollCharges: 2 };
  assert.equal(botShouldRerollDice(chargeBot, 1, 3, players, dangerProps, mods), true); // 1+3=4 -> 1M rent
  assert.equal(
    botShouldRerollDice({ ...chargeBot, doublesStreak: 2 }, 3, 3, players, makeTestProps({}), mods),
    true
  );
  assert.equal(botShouldRerollDice(chargeBot, 1, 2, players, makeTestProps({}), mods), false);
});

test('BUG-22 & BUG-23: Strict integer validation guards tile indices, initial levels, upgrade targets, rent, and paths', () => {
  assert.equal(isValidTileIndex(0), true);
  assert.equal(isValidTileIndex(31), true);
  assert.equal(isValidTileIndex(-1), false);
  assert.equal(isValidTileIndex(32), false);
  assert.equal(isValidTileIndex(1.5), false);
  assert.equal(isValidTileIndex(NaN), false);
  assert.equal(isValidTileIndex('5'), false);

  assert.equal(isValidInitialPurchaseLevel(2, 2), true);
  assert.equal(isValidInitialPurchaseLevel(3, 2), false);
  assert.equal(isValidInitialPurchaseLevel(1.5, 3), false);
  assert.equal(isValidInitialPurchaseLevel(NaN, 3), false);
  assert.equal(isValidInitialPurchaseLevel('2', 3), false);

  assert.equal(isValidUpgradeTargetLevel(3, 1), true);
  assert.equal(isValidUpgradeTargetLevel(2, 2), false);
  assert.equal(isValidUpgradeTargetLevel(2, -1), false);
  assert.equal(isValidUpgradeTargetLevel(0, -1), false);
  assert.equal(isValidUpgradeTargetLevel(5, 3), false);
  assert.equal(isValidUpgradeTargetLevel(2.5, 1), false);
  assert.equal(isValidUpgradeTargetLevel(NaN, 1), false);

  const nanEvenPair = rollTacticalDicePair('EVEN', () => Number.NaN);
  assert.ok(
    nanEvenPair[0] >= 1 &&
      nanEvenPair[0] <= 6 &&
      nanEvenPair[1] >= 1 &&
      nanEvenPair[1] <= 6 &&
      (nanEvenPair[0] + nanEvenPair[1]) % 2 === 0
  );

  // botPickChampionshipTarget accounts for TEAMS_2V2 shared color-group monopoly
  const teamPlayers = createInitialPlayers(DEFAULT_PLAYER_CONFIGS, 2_000_000, 'TEAMS_2V2');
  const teamChampProps = makeTestProps({
    1: { ownerId: 0, level: 0 }, // Brown (10K * 2 monopoly = 20K base)
    2: { ownerId: 2, level: 0 }, // Teammate holds Sa Pa
    3: { ownerId: 2, level: 0 }, // Teammate completes Brown monopoly!
    5: { ownerId: 0, level: 0 }, // Light Blue non-monopoly (18K base)
  });
  assert.equal(
    botPickChampionshipTarget(
      teamPlayers[0],
      teamChampProps,
      createDefaultBoardModifiers(0),
      true,
      teamPlayers,
      'TEAMS_2V2'
    ),
    1
  );

  const player = makeTestPlayer({ id: 0, cash: 2_000_000, laps: 2 });
  const props = makeTestProps({ 1: { ownerId: 0, level: 1 } });

  assert.equal(
    canUpgradeProperty(player, 1, props, { isOnTileLanding: true, targetLevel: NaN }).allowed,
    false
  );
  assert.equal(
    canUpgradeProperty(player, 1, props, { isOnTileLanding: true, targetLevel: 2.5 }).allowed,
    false
  );
  assert.equal(
    canUpgradeProperty(player, 1, props, {
      isOnTileLanding: true,
      targetLevel: '3' as unknown as number,
    }).allowed,
    false
  );
  assert.equal(
    canUpgradeProperty(player, -1, props, { isOnTileLanding: true, targetLevel: 2 }).allowed,
    false
  );

  assert.equal(isValidWorldTourTarget(player, NaN, props), false);
  assert.equal(isValidWorldTourTarget(player, 1.5, props), false);
  assert.equal(isValidWorldTourTarget(player, '5' as unknown as number, props), false);
  assert.equal(isValidWorldTourTarget(player, -1, props), false);
  assert.equal(isValidWorldTourTarget(player, 32, props), false);

  assert.equal(calculatePropertyInvestedValue(1, NaN), 0);
  assert.equal(calculatePropertyInvestedValue(1, 1.5), 0);
  assert.equal(calculateRent(NaN, props), 0);
  assert.deepEqual(computePathToTile(0, '5' as unknown as number, true), {
    path: [],
    passedStart: false,
  });
  assert.deepEqual(computeForwardSteps(0, NaN), {
    path: [],
    finalTile: 0,
    passedStart: false,
  });
});

test('BUG-05 & BUG-18: formatTilePriceLabel displays 2x team monopoly, combined Resort tiers, and 0K outage in TEAMS_2V2', () => {
  const players = createInitialPlayers(DEFAULT_PLAYER_CONFIGS, 2_000_000, 'TEAMS_2V2');
  const teamProps = makeTestProps({
    1: { ownerId: 0, level: 0 }, // Hà Giang (Brown base 10K) held by P0 (Team 0)
    2: { ownerId: 0, level: 0 }, // Sa Pa held by P0 (Team 0)
    3: { ownerId: 2, level: 0 }, // Đà Lạt held by P2 (Team 0 teammate) -> full Brown monopoly!
    4: { ownerId: 0, level: 0 }, // Vịnh Hạ Long (Resort 1) held by P0
    14: { ownerId: 2, level: 0 }, // Đảo Lý Sơn (Resort 2) held by P2 -> 2 Resorts combined (150K)!
  });

  // In FFA, P0 only holds 2/3 Brown and 1/4 Resort
  assert.equal(formatTilePriceLabel(BOARD_TILES[1], teamProps[1], teamProps, undefined, players, 'FFA'), '10K');
  assert.equal(formatTilePriceLabel(BOARD_TILES[4], teamProps[4], teamProps, undefined, players, 'FFA'), '50K');

  // In TEAMS_2V2, teammate-split Brown shows 2x monopoly rent (20K) and teammate-split Resorts show 150K
  assert.equal(
    formatTilePriceLabel(BOARD_TILES[1], teamProps[1], teamProps, undefined, players, 'TEAMS_2V2'),
    '20K'
  );
  assert.equal(
    formatTilePriceLabel(BOARD_TILES[4], teamProps[4], teamProps, undefined, players, 'TEAMS_2V2'),
    '150K'
  );

  // Adding 3rd Resort by teammate P2 updates Resort label to 400K
  const threeResortProps: Record<number, PropertyState> = {
    ...teamProps,
    18: { tileIndex: 18, ownerId: 2, level: 0 },
  };
  assert.equal(
    formatTilePriceLabel(
      BOARD_TILES[4],
      threeResortProps[4],
      threeResortProps,
      undefined,
      players,
      'TEAMS_2V2'
    ),
    '400K'
  );

  // POWER_OUTAGE overrides team monopoly / Resort tier to '0K' even in TEAMS_2V2
  const outageMods: MatchBoardModifiers = {
    ...createDefaultBoardModifiers(0),
    outageTileIndices: [1, 4],
  };
  assert.equal(
    formatTilePriceLabel(BOARD_TILES[1], teamProps[1], teamProps, outageMods, players, 'TEAMS_2V2'),
    '0K'
  );
  assert.equal(
    formatTilePriceLabel(BOARD_TILES[4], teamProps[4], teamProps, outageMods, players, 'TEAMS_2V2'),
    '0K'
  );
});

test('Festival x2 defaults to OFF (0 cities) unless explicitly enabled, and formatFestivalStartLog announces active Festival cities', () => {
  const defaultMods = createDefaultBoardModifiers();
  assert.deepEqual(defaultMods.festivalTileIndices, []);
  assert.equal(formatFestivalStartLog(defaultMods), null);

  assert.equal(DEFAULT_FESTIVAL_CITY_COUNT, 3);
  const enabledMods = createDefaultBoardModifiers(DEFAULT_FESTIVAL_CITY_COUNT, () => 0.25);
  assert.equal(enabledMods.festivalTileIndices.length, 3);

  const customMods: MatchBoardModifiers = {
    ...defaultMods,
    festivalTileIndices: [1, 13, 29],
  };
  assert.equal(
    formatFestivalStartLog(customMods),
    '🎉 Lễ Hội Đầu Mùa (×2 tiền thuê suốt ván): Hà Giang, Vũng Tàu, Hà Nội!'
  );
});


