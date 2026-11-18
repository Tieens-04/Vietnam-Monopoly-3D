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
  applyAuctionBid,
  applyAuctionPass,
  botDecideAuctionTurn,
  botShouldBuyProperty,
  buildBotBuyQuipPayload,
  buildBotPenaltyQuipPayload,
  buildBotRentCollectedQuipPayload,
  calculateLiquidationPotential,
  calculateRent,
  canUpgradeProperty,
  computeCinematicCameraPose,
  computeDayNightLightingState,
  computeForwardSteps,
  createAuctionState,
  createInitialPlayers,
  createInitialProperties,
  DICE_BOX_FACE_VALUES,
  evaluateBotTradeOffer,
  executeTradeOffer,
  getDiceFaceBaseEuler,
  getHouseSellRefund,
  getMinimumNextBid,
  getPropertySellRefund,
  getTileTransform,
  getWinner,
  ownsFullColorGroup,
  TOTAL_TILES,
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

  // Check total Chance + Community Chest cards >= 15
  assert.ok(CHANCE_CARDS.length + CHEST_CARDS.length >= 15);
});

test('3D dice base Euler orientations point exact face normal straight up (+Y)', () => {
  // BoxGeometry material slot normals: +X, -X, +Y, -Y, +Z, -Z
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

    // Also test with arbitrary yaw around world +Y
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

  // Adjacent centers should be close (~1.9 to ~2.25 units apart)
  for (let i = 0; i < TOTAL_TILES; i++) {
    const curr = transforms[i];
    const next = transforms[(i + 1) % TOTAL_TILES];
    const dist = Math.hypot(next.x - curr.x, next.z - curr.z);
    assert.ok(dist > 1.8 && dist < 2.35, `Unexpected gap ${dist} between ${i} and ${i + 1}`);
  }
});

test('rent calculation doubles on full color group and scales with houses/hotel', () => {
  const props = createInitialProperties();
  // Tile 1 = Đà Lạt ($60, rents [8, 35, 95, 220, 360]), Tile 3 = Nha Trang (same BROWN group)
  props[1].ownerId = 0;
  assert.equal(ownsFullColorGroup(0, ColorGroup.BROWN, props), false);
  assert.equal(calculateRent(1, props, 7), 8);

  // Own full Brown group -> base rent doubles to 16
  props[3].ownerId = 0;
  assert.equal(ownsFullColorGroup(0, ColorGroup.BROWN, props), true);
  assert.equal(calculateRent(1, props, 7), 16);

  // Upgrade Đà Lạt to 2 houses and Hotel (level 4)
  props[1].level = 2;
  assert.equal(calculateRent(1, props, 7), 95);
  props[1].level = 4;
  assert.equal(calculateRent(1, props, 7), 360);

  // Transports: 1 station = $50, 2 stations = $120
  props[5].ownerId = 1;
  assert.equal(calculateRent(5, props, 8), 50);
  props[20].ownerId = 1;
  assert.equal(calculateRent(5, props, 8), 120);

  // Utility: 8x dice sum
  props[12].ownerId = 2;
  assert.equal(calculateRent(12, props, 9), 72);
});

test('forward movement detects passing Start ($200 trigger) accurately', () => {
  const stepNoPass = computeForwardSteps(23, 3);
  assert.deepEqual(stepNoPass.path, [24, 25, 26]);
  assert.equal(stepNoPass.passedStart, false);

  const stepPass = computeForwardSteps(26, 4);
  assert.deepEqual(stepPass.path, [27, 0, 1, 2]);
  assert.equal(stepPass.finalTile, 2);
  assert.equal(stepPass.passedStart, true);
});

test('property upgrade, liquidation refund (50%), Bot AI buy rule, and winner check', () => {
  const players = createInitialPlayers(DEFAULT_PLAYER_CONFIGS, 1500);
  const props = createInitialProperties();
  props[27].ownerId = 0; // TP. Hồ Chí Minh ($400, houseCost $200)

  const check = canUpgradeProperty(players[0], 27, props);
  assert.equal(check.allowed, true);
  assert.equal(check.cost, 200);

  props[27].level = 2;
  assert.equal(getHouseSellRefund(27), 100);
  assert.equal(getPropertySellRefund(27), 200);
  assert.equal(calculateLiquidationPotential(0, props), 400); // 2*100 + 200

  // Bot AI buy check (>=$300 reserve rule)
  const bot = { ...players[1], cash: 550 };
  assert.equal(botShouldBuyProperty(bot, 22, props), true); // Đà Nẵng $240 -> $310 left
  assert.equal(botShouldBuyProperty(bot, 27, props), false); // TP.HCM $400 -> $150 left

  // Winner check when 3 of 4 players go bankrupt
  players[1].bankrupt = true;
  players[2].bankrupt = true;
  assert.equal(getWinner(players), null);
  players[3].bankrupt = true;
  assert.equal(getWinner(players)?.id, 0);
});

test('public auction cycles bidders, enforces increments, and crowns highest bidder when others pass', () => {
  const players = createInitialPlayers(DEFAULT_PLAYER_CONFIGS, 1500);
  // Tile 8 = Huế ($110) -> startingBid = $60
  let auction = createAuctionState(8, players, 0);
  assert.equal(auction.status, 'ACTIVE');
  assert.equal(auction.startingBid, 60);
  assert.equal(auction.currentTurnBidderId, 1); // clockwise after player 0
  assert.equal(getMinimumNextBid(auction), 60);

  // Player 1 bids $60
  auction = applyAuctionBid(auction, 1, 60, players);
  assert.equal(auction.highestBidderId, 1);
  assert.equal(auction.currentBid, 60);
  assert.equal(auction.currentTurnBidderId, 2);
  assert.equal(getMinimumNextBid(auction), 70);

  // Player 2 passes, Player 3 bids $80
  auction = applyAuctionPass(auction, 2, players);
  assert.equal(auction.currentTurnBidderId, 3);
  auction = applyAuctionBid(auction, 3, 80, players);
  assert.equal(auction.highestBidderId, 3);
  assert.equal(auction.currentTurnBidderId, 0);

  // Player 0 passes, Player 1 passes -> only Player 3 left holding highest bid -> wins!
  auction = applyAuctionPass(auction, 0, players);
  assert.equal(auction.status, 'ACTIVE');
  auction = applyAuctionPass(auction, 1, players);
  assert.equal(auction.status, 'COMPLETED');
  assert.equal(auction.winnerId, 3);
  assert.equal(auction.currentBid, 80);

  // Bot auction decision respects valuation & reserve
  const freshAuction = createAuctionState(1, players, 0); // Đà Lạt $60, start $30
  const botDecision = botDecideAuctionTurn(players[1], freshAuction, createInitialProperties());
  assert.equal(botDecision.action, 'BID');
});

test('trade validation, Bot AI trade evaluation, and property+cash execution work accurately', () => {
  const players = createInitialPlayers(DEFAULT_PLAYER_CONFIGS, 1500);
  const props = createInitialProperties();
  props[1].ownerId = 0; // Đà Lạt ($60) owned by Human (0)
  props[6].ownerId = 1; // Hội An ($100) owned by Bot (1)

  // Lowball offer ($20 for $100 Hội An) -> rejected by Bot
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

  // Fair swap: Đà Lạt ($60) + $50 cash (= $110) for Hội An ($100, required $105) -> accepted!
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

  // Hop camera target follows token quadrant while maintaining consistent isometric offset
  assert.ok(hopPoseSE.target.x > 4 && hopPoseSE.target.z > 4);
  assert.ok(hopPoseNW.target.x < -4 && hopPoseNW.target.z < -4);
  assert.equal(
    Math.round((hopPoseSE.position.x - hopPoseSE.target.x) * 10),
    Math.round((hopPoseNW.position.x - hopPoseNW.target.x) * 10)
  );
  assert.ok(dicePose.position.y < 15);

  // Day (0) vs Night (1) lighting & emissive curves
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
  const human = players[0]; // isBot = false
  const botBlue = players[1]; // yacht persona
  const botGold = players[2]; // jet persona
  const props = createInitialProperties();

  // Human never triggers Bot AI quips
  assert.equal(buildBotBuyQuipPayload(human, 27, 400, props), null);

  // Bot buying prime TP. Hồ Chí Minh ($400) builds BUY_PRIME_LAND payload
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

  // Tiny $6 starter rent does not spam COLLECT_BIG_RENT, whereas $120 house rent triggers it
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

  // Bot paying Income Tax ($150) triggers PAY_PENALTY
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

