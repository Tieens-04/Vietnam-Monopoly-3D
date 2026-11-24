import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { COLOR_GROUP_META, DEFAULT_PLAYER_CONFIGS } from '../game/boardData';
import { createInitialPlayers, createInitialProperties } from '../game/rules';
import { ColorGroup, GraphicsQualityTier, TileKind } from '../game/types';
import { createAnimationDirector, detachGsapFromGlobalTicker } from './animationDirector';
import { createBuildingAnimator, detectNewlyCompletedMonopolies } from './buildingAnimator';
import { createOwnershipBuildingSuite, NightLightingPalette } from './models';

function makeDummyNightPalette(): NightLightingPalette {
  const dummyMat = new THREE.MeshStandardMaterial();
  return {
    houseWindowMat: dummyMat,
    hotelWindowMat: dummyMat,
    hotelBeaconMat: dummyMat,
    skylineTowerMat: dummyMat,
    cityBuildingWinMat: dummyMat,
    streetLampBulbMat: dummyMat,
    streetLampHaloMat: new THREE.MeshBasicMaterial(),
    lanternSilkMat: dummyMat,
    fountainWaterMat: dummyMat,
    balloonGlowMat: dummyMat,
    tokenHeadlightMat: dummyMat,
    oceanMat: dummyMat,
    islandMat: dummyMat,
    lawnMat: dummyMat,
    starMat: new THREE.PointsMaterial(),
    skyDomeUniforms: {
      uNightFactor: { value: 0 },
      uLinearOutput: { value: 0 },
      uDayBlueTop: { value: new THREE.Color() },
      uDayBlueMid: { value: new THREE.Color() },
      uDayHorizon: { value: new THREE.Color() },
      uDayPinkMid: { value: new THREE.Color() },
      uDayPinkWarm: { value: new THREE.Color() },
      uNightTop: { value: new THREE.Color() },
      uNightBottom: { value: new THREE.Color() },
    },
  };
}

function advanceDirector(
  director: ReturnType<typeof createAnimationDirector>,
  steps: number,
  dt: number,
  opts: { qualityTier?: GraphicsQualityTier; reducedMotion?: boolean; speedMultiplier?: number } = {}
): void {
  const stepOpts = {
    isPaused: false,
    speedMultiplier: opts.speedMultiplier ?? 1,
    reducedMotion: opts.reducedMotion ?? false,
    qualityTier: opts.qualityTier ?? ('high' as const),
  };
  for (let i = 0; i < steps; i++) {
    director.step(dt, stepOpts);
  }
}

test('detectNewlyCompletedMonopolies handles FFA, TEAMS_2V2 split ownership, and prevents duplicate re-emission', () => {
  const ffaPlayers = createInitialPlayers(DEFAULT_PLAYER_CONFIGS, 2_000_000, 'FFA');
  const baseProps = createInitialProperties();
  const brownTiles = COLOR_GROUP_META[ColorGroup.BROWN].tileIndices; // [1, 2, 3]

  const partialProps = {
    ...baseProps,
    [brownTiles[0]]: { tileIndex: brownTiles[0], ownerId: 0, level: 0 },
    [brownTiles[1]]: { tileIndex: brownTiles[1], ownerId: 0, level: 1 },
  };
  assert.deepEqual(detectNewlyCompletedMonopolies(baseProps, partialProps, ffaPlayers, 'FFA'), []);

  const completedProps = {
    ...partialProps,
    [brownTiles[2]]: { tileIndex: brownTiles[2], ownerId: 0, level: 0 },
  };
  const ffaCompleted = detectNewlyCompletedMonopolies(
    partialProps,
    completedProps,
    ffaPlayers,
    'FFA'
  );
  assert.equal(ffaCompleted.length, 1);
  assert.equal(ffaCompleted[0].group, ColorGroup.BROWN);
  assert.deepEqual(ffaCompleted[0].tileIndices, brownTiles);
  assert.equal(ffaCompleted[0].colorHex, ffaPlayers[0].color);

  // Re-evaluating same completed state (e.g. upgrading level on already-owned group) must NOT re-emit
  const upgradedCompleted = {
    ...completedProps,
    [brownTiles[0]]: { tileIndex: brownTiles[0], ownerId: 0, level: 2 },
  };
  assert.deepEqual(
    detectNewlyCompletedMonopolies(completedProps, upgradedCompleted, ffaPlayers, 'FFA'),
    []
  );

  // TEAMS_2V2: player 0 and teammate player 2 combine to finish ORANGE
  const teamPlayers = createInitialPlayers(DEFAULT_PLAYER_CONFIGS, 2_000_000, 'TEAMS_2V2');
  const orangeTiles = COLOR_GROUP_META[ColorGroup.ORANGE].tileIndices; // [9, 11]
  const orangePartial = {
    ...baseProps,
    [orangeTiles[0]]: { tileIndex: orangeTiles[0], ownerId: 0, level: 0 },
  };
  const orangeComplete = {
    ...orangePartial,
    [orangeTiles[1]]: { tileIndex: orangeTiles[1], ownerId: 2, level: 1 },
  };
  const teamCompleted = detectNewlyCompletedMonopolies(
    orangePartial,
    orangeComplete,
    teamPlayers,
    'TEAMS_2V2'
  );
  assert.equal(teamCompleted.length, 1);
  assert.equal(teamCompleted[0].group, ColorGroup.ORANGE);
});

test('buildingAnimator drives ANIM-BLD-01..06 & 10..11 via AnimationDirector with pooled FX and clean rest poses', () => {
  detachGsapFromGlobalTicker();
  const scene = new THREE.Scene();
  const director = createAnimationDirector();
  const palette = makeDummyNightPalette();
  let qualityTier: GraphicsQualityTier = 'high';
  let reducedMotion = false;
  let shadowDirtyCount = 0;

  const animator = createBuildingAnimator({
    scene,
    director,
    getQualityTier: () => qualityTier,
    getReducedMotion: () => reducedMotion,
    onShadowDirty: () => {
      shadowDirtyCount += 1;
    },
  });

  // Pre-allocated pooled rings + InstancedMesh sparks
  const instancedBefore = scene.children.filter(
    (c): c is THREE.InstancedMesh => c instanceof THREE.InstancedMesh
  );
  assert.equal(instancedBefore.length, 1);
  assert.equal(instancedBefore[0].visible, false);

  const suite = createOwnershipBuildingSuite(1.6, 2.6, 0.44, palette, 4, 'metropolis');
  scene.add(suite.root);

  // 1. Buy land (ANIM-BLD-01)
  animator.playBuyLand(3, suite, 2, 8, '#F5B800');
  assert.equal(animator.isTileAnimating(3), true);
  assert.equal(director.hasBlockingVisualAnimations(), true);
  assert.equal(suite.padMesh.visible, true);
  assert.equal(suite.starterPavilion.visible, true);
  advanceDirector(director, 35, 0.02);
  assert.equal(animator.isTileAnimating(3), false);
  assert.equal(director.hasBlockingVisualAnimations(), false);
  assert.equal(suite.starterPavilion.scale.x, 1);
  assert.equal(suite.starterPavilion.position.y, suite.buildBaseY);

  // 2. Houses stagger build 0 -> 3 (ANIM-BLD-02)
  animator.playHousesBuild(3, suite, 0, 3, 2, 8, '#F5B800', false, TileKind.PROPERTY);
  assert.equal(animator.isTileAnimating(3), true);
  assert.equal(suite.houses[0].visible, true);
  assert.equal(suite.houses[1].visible, true);
  assert.equal(suite.houses[2].visible, true);
  assert.equal(suite.levelBadgeMesh.visible, true);
  advanceDirector(director, 45, 0.02);
  assert.equal(animator.isTileAnimating(3), false);
  for (const h of suite.houses) {
    assert.equal(h.scale.x, 1);
    assert.equal(h.position.y, suite.buildBaseY);
  }

  // 3. Landmark ★ Reveal 3 -> 4 (ANIM-BLD-04) activates pooled sparks on High
  animator.playLandmarkReveal(3, suite, 3, 2, 8, '#F5B800', false);
  assert.equal(suite.hotel.visible, true);
  assert.equal(suite.shieldGroup.visible, true);
  assert.equal(suite.houses[0].visible, false);
  advanceDirector(director, 12, 0.02);
  assert.equal(instancedBefore[0].visible, true, 'Expected spark burst active mid-Landmark reveal on High');
  advanceDirector(director, 50, 0.02);
  assert.equal(director.hasBlockingVisualAnimations(), false);
  assert.equal(instancedBefore[0].visible, false);
  assert.equal(suite.hotel.scale.x, 1);
  assert.equal(suite.hotel.position.y, suite.buildBaseY);

  // 4. Buyout 2x color wave (ANIM-BLD-05)
  animator.playBuyoutSweep(3, suite, 4, false, TileKind.PROPERTY, 2, 8, '#66C61C');
  advanceDirector(director, 45, 0.02);
  assert.equal(suite.hotel.visible, true);
  assert.equal(suite.padMat.color.getHexString(), new THREE.Color('#66C61C').getHexString());

  // 5. Liquidation dismantle 4 -> -1 (ANIM-BLD-06) hides suite cleanly on completion while resetting scales
  animator.playSellDismantle(3, suite, 4, 2, 8);
  assert.equal(animator.isTileAnimating(3), true);
  advanceDirector(director, 30, 0.02);
  assert.equal(animator.isTileAnimating(3), false);
  assert.equal(suite.padMesh.visible, false);
  assert.equal(suite.starterPavilion.visible, false);
  assert.equal(suite.hotel.visible, false);
  assert.equal(suite.shieldGroup.visible, false);
  assert.equal(suite.levelBadgeMesh.visible, false);
  assert.equal(suite.padMesh.scale.x, 1);
  assert.equal(suite.hotel.scale.x, 1);

  // 6. Championship Drop (ANIM-BLD-10) & Monopoly Wave (ANIM-BLD-11)
  animator.playBuyLand(1, suite, 6, 8, '#F5B800');
  advanceDirector(director, 35, 0.02);
  animator.playChampionshipDrop(1, suite, 6, 8, TileKind.PROPERTY);
  animator.playMonopolyWave('BROWN', [{ tileIndex: 1, suite, worldX: 6, worldZ: 8 }], '#F5B800');
  advanceDirector(director, 60, 0.02);
  assert.equal(director.hasBlockingVisualAnimations(), false);
  assert.equal(suite.starterPavilion.position.y, suite.buildBaseY);

  // 7. Deduplication on rapid same-tile updates & Low/ReducedMotion skips sparks
  qualityTier = 'low';
  reducedMotion = true;
  animator.playBuyLand(7, suite, -6, 8, '#29B6F6');
  animator.playLandmarkReveal(7, suite, 0, -6, 8, '#29B6F6', false);
  assert.equal(instancedBefore[0].visible, false, 'Low/reducedMotion must skip spark InstancedMesh');
  director.fastForwardAll();
  assert.equal(animator.isTileAnimating(7), false);
  assert.equal(suite.hotel.visible, true);
  assert.equal(suite.hotel.scale.x, 1);
  assert.ok(shadowDirtyCount > 0);

  animator.dispose();
  director.dispose();
  assert.equal(scene.children.filter((c) => c instanceof THREE.InstancedMesh).length, 0);
});
