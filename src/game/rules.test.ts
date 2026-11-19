import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {
  BOARD_TILES,
  CHANCE_CARDS,
  CHEST_CARDS,
  DEFAULT_PLAYER_CONFIGS,
} from './boardData';
import {
  botPickAssetToLiquidate,
  botPickInitialPurchaseTier,
  botPickOnTileUpgradeTargetLevel,
  botPickWorldTourTarget,
  botShouldBuyoutProperty,
  botShouldBuyProperty,
  buildBotBuyQuipPayload,
  buildBotPenaltyQuipPayload,
  buildBotRentCollectedQuipPayload,
  calculateBuyoutPrice,
  calculateLiquidationPotential,
  calculateRent,
  canBuyoutProperty,
  canPropertyBeTraded,
  canSellHouse,
  canUpgradeProperty,
  computeCinematicCameraPose,
  computeDayNightLightingState,
  computeForwardSteps,
  createInitialPlayers,
  createInitialProperties,
  DICE_BOX_FACE_VALUES,
  evaluateBotTradeOffer,
  evaluateMatchWinner,
  executeTradeOffer,
  formatBusinessTourCompact,
  formatBusinessTourSpaced,
  formatCountdownClock,
  formatTilePriceLabel,
  getDiceFaceBaseEuler,
  getHouseSellRefund,
  getInitialPurchaseTiers,
  getPropertySellRefund,
  getTileTransform,
  getWinner,
  ownsFullColorGroup,
  parseDeterministicDiceQueue,
  resolvePostActionTurnPhase,
  shouldGrantImmediateDoublesRoll,
  TOTAL_TILES,
  TURN_COUNTDOWN_SECONDS,
  validateTradeOffer,
} from './rules';
import { ColorGroup, TileKind } from './types';

test('board has exact 28 Vietnam tiles with 4 corners, 16 properties, and 8 functional tiles', () => {
  assert.equal(BOARD_TILES.length, 28);

  const corners = BOARD_TILES.filter((t) =>
    [TileKind.START, TileKind.JAIL, TileKind.FREE_PARKING, TileKind.GO_TO_JAIL].includes(t.kind)
  );
  const properties = BOARD_TILES.filter((t) => t.kind === TileKind.PROPERTY);
  const chances = BOARD_TILES.filter((t) => t.kind === TileKind.CHANCE);
  const chests = BOARD_TILES.filter((t) => t.kind === TileKind.CHEST);
  const transports = BOARD_TILES.filter((t) => t.kind === TileKind.TRANSPORT);
  const taxes = BOARD_TILES.filter((t) => t.kind === TileKind.TAX);
  const utilities = BOARD_TILES.filter((t) => t.kind === TileKind.UTILITY);

  assert.equal(corners.length, 4);
  assert.equal(properties.length, 16);
  assert.equal(chances.length, 2);
  assert.equal(chests.length, 2);
  assert.equal(transports.length, 2);
  assert.equal(taxes.length, 1);
  assert.equal(utilities.length, 1);
  assert.equal(taxes[0].taxAmount, 150);

  assert.ok(CHANCE_CARDS.length + CHEST_CARDS.length >= 15);
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

test('28-tile spatial coordinates form a continuous non-overlapping perimeter', () => {
  const transforms = Array.from({ length: TOTAL_TILES }, (_, i) => getTileTransform(i));
  assert.equal(transforms[0].isCorner, true);
  assert.equal(transforms[7].isCorner, true);
  assert.equal(transforms[14].isCorner, true);
  assert.equal(transforms[21].isCorner, true);

  for (let i = 0; i < TOTAL_TILES; i++) {
    const curr = transforms[i];
    const next = transforms[(i + 1) % TOTAL_TILES];
    const dist = Math.hypot(next.x - curr.x, next.z - curr.z);
    assert.ok(dist > 1.8 && dist < 2.35, `Unexpected gap ${dist} between ${i} and ${i + 1}`);
  }
});

test('Business Tour rent calculation applies full-set ×2 multiplier across all building levels', () => {
  const props = createInitialProperties();
  // Tile 1 = Đà Lạt (rents [8, 35, 95, 220, 360]), Tile 3 = Nha Trang (same BROWN group)
  props[1].ownerId = 0;
  assert.equal(ownsFullColorGroup(0, ColorGroup.BROWN, props), false);
  assert.equal(calculateRent(1, props, 7), 8);

  // Own full Brown group -> base rent doubles to 16
  props[3].ownerId = 0;
  assert.equal(ownsFullColorGroup(0, ColorGroup.BROWN, props), true);
  assert.equal(calculateRent(1, props, 7), 16);

  // Upgrade Đà Lạt to 2 houses (95 base) -> Business Tour with full set doubles to 190
  props[1].level = 2;
  assert.equal(calculateRent(1, props, 7), 190);

  // Transports: 1 station = 50 (150K), 2 stations = 120 (360K)
  props[5].ownerId = 1;
  assert.equal(calculateRent(5, props, 8), 50);
  props[20].ownerId = 1;
  assert.equal(calculateRent(5, props, 8), 120);

  // Utility: 8x dice sum
  props[12].ownerId = 2;
  assert.equal(calculateRent(12, props, 9), 72);
});

test('forward movement detects passing Start (+600K trigger) accurately', () => {
  const stepNoPass = computeForwardSteps(23, 3);
  assert.deepEqual(stepNoPass.path, [24, 25, 26]);
  assert.equal(stepNoPass.passedStart, false);

  const stepPass = computeForwardSteps(26, 4);
  assert.deepEqual(stepPass.path, [27, 0, 1, 2]);
  assert.equal(stepPass.finalTile, 2);
  assert.equal(stepPass.passedStart, true);
});

test('Business Tour liquidation, house selling without even-sell lock, and bankruptcy winner work accurately', () => {
  const players = createInitialPlayers(DEFAULT_PLAYER_CONFIGS, 1500);
  const props = createInitialProperties();
  props[26].ownerId = 0;
  props[27].ownerId = 0;
  props[26].level = 1;
  props[27].level = 3;

  // In Business Tour, player can sell houses freely from any owned city with houses
  assert.equal(canSellHouse(0, 26, props).allowed, true);
  assert.equal(canSellHouse(0, 27, props).allowed, true);

  // Cannot trade Hà Nội while houses stand in Emerald group
  assert.equal(canPropertyBeTraded(26, 0, props), false);

  props[26].level = 0;
  props[27].level = 2;
  assert.equal(getHouseSellRefund(27), 100);
  assert.equal(getPropertySellRefund(27), 200);
  assert.equal(calculateLiquidationPotential(0, props), 575);

  const nextLiq = botPickAssetToLiquidate(0, props);
  assert.ok(nextLiq);
  assert.equal(nextLiq.action, 'SELL_HOUSE');

  const bot = { ...players[1], cash: 550 };
  assert.equal(botShouldBuyProperty(bot, 22, props), true);
  assert.equal(botShouldBuyProperty(bot, 25, props), false);

  players[1].bankrupt = true;
  players[2].bankrupt = true;
  assert.equal(getWinner(players), null);
  players[3].bankrupt = true;
  assert.equal(getWinner(players)?.id, 0);
});

test('Business Tour enforces on-tile building, 0-3 initial tiers, 2x Buyout (Level 4 immune), World Tour AI, and Triple/Side Monopoly wins', () => {
  const players = createInitialPlayers(DEFAULT_PLAYER_CONFIGS, 2000);
  const props = createInitialProperties();

  // 1. Initial purchase tiers on Đà Lạt (index 1, 60 -> 180K, houseCost 50 -> 150K) -> 4 tiers (0..3 houses)
  const tiers = getInitialPurchaseTiers(players[0], 1);
  assert.equal(tiers.length, 4);
  assert.deepEqual(
    tiers.map((t) => t.totalCost),
    [60, 110, 160, 210]
  );
  assert.ok(botPickInitialPurchaseTier(players[1], 1, props) >= 1);

  // 2. Remote building blocked in Business Tour; on-tile landing allowed up to Level 4 Landmark
  props[1].ownerId = 0;
  props[1].level = 2;
  assert.equal(
    canUpgradeProperty(players[0], 1, props, {
      isOnTileLanding: false,
    }).allowed,
    false
  );
  const onTileToHotel = canUpgradeProperty(players[0], 1, props, {
    isOnTileLanding: true,
    targetLevel: 4,
  });
  assert.equal(onTileToHotel.allowed, true);
  assert.equal(onTileToHotel.cost, 100);
  assert.equal(
    botPickOnTileUpgradeTargetLevel(players[1], 1, {
      ...props,
      1: { ...props[1], ownerId: 1 },
    }),
    4
  );

  // 3. Opponent 2x Buyout: Đà Lạt (60) + 2 houses (100) = 160 invested -> 320 (960K) Buyout!
  assert.equal(calculateBuyoutPrice(1, 2), 320);
  assert.equal(canBuyoutProperty(players[1], 1, props).allowed, true);
  assert.equal(botShouldBuyoutProperty(players[1], 1, players, props), true);

  // Level 4 Hotel / Landmark is immune to Buyout!
  props[1].level = 4;
  assert.equal(canBuyoutProperty(players[1], 1, props).allowed, false);

  // 4. World Tour AI snipes monopoly-completing tile (owns Đà Lạt [1], Nha Trang [3] is unowned)
  assert.equal(botPickWorldTourTarget(players[0], players, props), 3);

  // 5. Instant Victory: Side Monopoly (South edge [1, 3, 5, 6])
  props[1].ownerId = 0;
  props[3].ownerId = 0;
  props[5].ownerId = 0;
  assert.equal(evaluateMatchWinner(players, props), null);
  props[6].ownerId = 0;
  const sideWin = evaluateMatchWinner(players, props);
  assert.equal(sideWin?.condition, 'SIDE_MONOPOLY');
  assert.equal(sideWin?.winner.id, 0);

  // 6. Instant Victory: Triple Monopoly (BROWN [1,3], PINK [11,13,15], EMERALD [26,27])
  props[5].ownerId = null;
  props[6].ownerId = null;
  props[11].ownerId = 0;
  props[13].ownerId = 0;
  props[15].ownerId = 0;
  props[26].ownerId = 0;
  props[27].ownerId = 0;
  const tripleWin = evaluateMatchWinner(players, props);
  assert.equal(tripleWin?.condition, 'TRIPLE_MONOPOLY');
  assert.equal(tripleWin?.winner.id, 0);
});

test('trade validation, Bot AI trade evaluation, and property+cash execution work accurately', () => {
  const players = createInitialPlayers(DEFAULT_PLAYER_CONFIGS, 1500);
  const props = createInitialProperties();
  props[1].ownerId = 0;
  props[6].ownerId = 1;

  const lowOffer = {
    fromPlayerId: 0,
    toPlayerId: 1,
    offeredTileIndices: [],
    requestedTileIndices: [6],
    offeredCash: 20,
    requestedCash: 0,
  };
  const lowEval = evaluateBotTradeOffer(lowOffer, players, props);
  assert.equal(lowEval.valid, true);
  assert.equal(lowEval.accepted, false);

  const fairOffer = {
    fromPlayerId: 0,
    toPlayerId: 1,
    offeredTileIndices: [1],
    requestedTileIndices: [6],
    offeredCash: 50,
    requestedCash: 0,
  };
  const fairEval = evaluateBotTradeOffer(fairOffer, players, props);
  assert.equal(fairEval.valid, true);
  assert.equal(fairEval.accepted, true);

  const executed = executeTradeOffer(fairOffer, players, props);
  assert.equal(executed.players[0].cash, 1450);
  assert.equal(executed.players[1].cash, 1550);
  assert.equal(executed.properties[1].ownerId, 1);
  assert.equal(executed.properties[6].ownerId, 0);
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

test('Bot AI Gemini quip builders generate rich contextual payloads and ignore humans or tiny rents', () => {
  const players = createInitialPlayers(DEFAULT_PLAYER_CONFIGS, 1500);
  const human = players[0];
  const botBlue = players[1];
  const botGold = players[2];
  const props = createInitialProperties();

  assert.equal(buildBotBuyQuipPayload(human, 27, 400, props), null);

  props[27].ownerId = botBlue.id;
  const buyPayload = buildBotBuyQuipPayload(
    { ...botBlue, cash: 1100 },
    27,
    400,
    props,
    'DIRECT'
  );
  assert.ok(buyPayload);
  assert.equal(buyPayload.eventKind, 'BUY_PRIME_LAND');
  assert.equal(buyPayload.tileName, 'TP. Hồ Chí Minh');
  assert.equal(buyPayload.amount, 400);
  assert.ok(buyPayload.botPersona.includes('du thuyền'));

  assert.equal(
    buildBotRentCollectedQuipPayload(botBlue, human.name, 1, 6, props),
    null
  );
  props[27].level = 2;
  const rentPayload = buildBotRentCollectedQuipPayload(
    { ...botBlue, cash: 1460 },
    human.name,
    27,
    360,
    props
  );
  assert.ok(rentPayload);
  assert.equal(rentPayload.eventKind, 'COLLECT_BIG_RENT');
  assert.ok(rentPayload.extraContext.includes('Người chơi 1'));

  const penaltyPayload = buildBotPenaltyQuipPayload(
    { ...botGold, cash: 1350 },
    'Thuế Thu Nhập',
    150
  );
  assert.ok(penaltyPayload);
  assert.equal(penaltyPayload.eventKind, 'PAY_PENALTY');
  assert.equal(penaltyPayload.amount, 150);
  assert.ok(penaltyPayload.botPersona.includes('Shark'));
});

test('Business Tour currency synchronization: zero legacy dollar symbols across tiles, cards, trade/buyout messages, and quips', () => {
  assert.equal(TURN_COUNTDOWN_SECONDS, 45);
  assert.equal(formatBusinessTourCompact(0), '0K');
  assert.equal(formatBusinessTourCompact(220), '660K');
  assert.equal(formatBusinessTourCompact(350), '1.05M');
  assert.equal(formatBusinessTourCompact(400), '1.2M');
  assert.equal(formatBusinessTourCompact(-150, true), '-450K');

  assert.equal(formatTilePriceLabel(BOARD_TILES[19], 0), '660K');
  assert.equal(formatTilePriceLabel(BOARD_TILES[26], 0), '1.05M');
  assert.equal(formatTilePriceLabel(BOARD_TILES[27], 0), '1.2M');
  assert.equal(formatTilePriceLabel(BOARD_TILES[27], 2), '2.4M');
  assert.equal(formatTilePriceLabel(BOARD_TILES[4], 0), '-450K');
  assert.equal(formatTilePriceLabel(BOARD_TILES[0], 0), null);

  assert.equal(formatBusinessTourSpaced(0), '0');
  assert.equal(formatBusinessTourSpaced(220), '660 000');
  assert.equal(formatBusinessTourSpaced(1500), '4 500 000');
  assert.equal(formatBusinessTourSpaced(-150), '-450 000');

  for (const tile of BOARD_TILES) {
    assert.equal(tile.description.includes('$'), false, `Tile ${tile.name} contains legacy symbol`);
  }
  for (const card of [...CHANCE_CARDS, ...CHEST_CARDS]) {
    assert.equal(card.description.includes('$'), false, `Card ${card.title} contains legacy symbol`);
  }

  const players = createInitialPlayers(DEFAULT_PLAYER_CONFIGS, 100);
  const props = createInitialProperties();
  props[1].ownerId = 0;

  const poorUpgrade = canUpgradeProperty({ ...players[0], cash: 10 }, 1, props, {
    isOnTileLanding: true,
    targetLevel: 1,
  });
  assert.equal(poorUpgrade.allowed, false);
  assert.equal((poorUpgrade.reason ?? '').includes('$'), false);
  assert.ok((poorUpgrade.reason ?? '').includes('150K'));

  const poorBuyout = canBuyoutProperty({ ...players[1], cash: 10 }, 1, props);
  assert.equal(poorBuyout.allowed, false);
  assert.equal((poorBuyout.reason ?? '').includes('$'), false);
  assert.ok((poorBuyout.reason ?? '').includes('360K'));

  const invalidCashTrade = validateTradeOffer(
    {
      fromPlayerId: 0,
      toPlayerId: 1,
      offeredTileIndices: [],
      requestedTileIndices: [1],
      offeredCash: 500,
      requestedCash: 0,
    },
    players,
    props
  );
  assert.equal(invalidCashTrade.valid, false);
  assert.equal((invalidCashTrade.reason ?? '').includes('$'), false);

  props[6].ownerId = 1;
  const lowTrade = evaluateBotTradeOffer(
    {
      fromPlayerId: 0,
      toPlayerId: 1,
      offeredTileIndices: [],
      requestedTileIndices: [6],
      offeredCash: 10,
      requestedCash: 0,
    },
    players,
    props
  );
  assert.equal(lowTrade.reason.includes('$'), false);

  assert.deepEqual(
    DEFAULT_PLAYER_CONFIGS.map((p) => p.color),
    ['#F5B800', '#66C61C', '#E91E63', '#29B6F6']
  );

  assert.equal(formatCountdownClock(45), '00:45');
  assert.equal(formatCountdownClock(7), '00:07');
  assert.equal(formatCountdownClock(0), '00:00');
});

test('doubles roll skips end-turn confirmation and transitions directly to AWAIT_ROLL unless jailed or bankrupt', () => {
  const [basePlayer] = createInitialPlayers(DEFAULT_PLAYER_CONFIGS, 1500);

  // Normal roll (streak 0) -> AWAIT_END_TURN
  assert.equal(shouldGrantImmediateDoublesRoll(basePlayer), false);
  assert.equal(resolvePostActionTurnPhase(basePlayer), 'AWAIT_END_TURN');

  // 1st and 2nd doubles -> immediate AWAIT_ROLL (no intermediate confirmation)
  const firstDoubles = { ...basePlayer, doublesStreak: 1 };
  const secondDoubles = { ...basePlayer, doublesStreak: 2 };
  assert.equal(shouldGrantImmediateDoublesRoll(firstDoubles), true);
  assert.equal(resolvePostActionTurnPhase(firstDoubles), 'AWAIT_ROLL');
  assert.equal(shouldGrantImmediateDoublesRoll(secondDoubles), true);
  assert.equal(resolvePostActionTurnPhase(secondDoubles), 'AWAIT_ROLL');

  // 3rd doubles, jailed, bankrupt, or null -> AWAIT_END_TURN
  assert.equal(
    resolvePostActionTurnPhase({ ...basePlayer, doublesStreak: 3 }),
    'AWAIT_END_TURN'
  );
  assert.equal(
    resolvePostActionTurnPhase({ ...basePlayer, doublesStreak: 1, inJail: true }),
    'AWAIT_END_TURN'
  );
  assert.equal(
    resolvePostActionTurnPhase({ ...basePlayer, doublesStreak: 1, bankrupt: true }),
    'AWAIT_END_TURN'
  );
  assert.equal(resolvePostActionTurnPhase(null), 'AWAIT_END_TURN');

  // Optional deterministic dice queue parser
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

