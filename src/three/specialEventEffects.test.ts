import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { COLOR_GROUP_META, DEFAULT_PLAYER_CONFIGS } from '../game/boardData';
import {
  createInitialPlayers,
  createInitialProperties,
  RESORT_TILE_INDICES,
} from '../game/rules';
import { ColorGroup, GraphicsQualityTier } from '../game/types';
import { createAnimationDirector, detachGsapFromGlobalTicker } from './animationDirector';
import { createOwnershipBuildingSuite, NightLightingPalette } from './models';
import {
  createSpecialEventEffects,
  detectNewlyReachedBrinkTiles,
} from './specialEventEffects';

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

test('detectNewlyReachedBrinkTiles emits once on N-1 Color Group or 3/4 Resorts across FFA & TEAMS_2V2', () => {
  const ffaPlayers = createInitialPlayers(DEFAULT_PLAYER_CONFIGS, 2_000_000, 'FFA');
  const baseProps = createInitialProperties();
  const brownTiles = COLOR_GROUP_META[ColorGroup.BROWN].tileIndices; // [1, 2, 3]

  const oneBrown = {
    ...baseProps,
    [brownTiles[0]]: { tileIndex: brownTiles[0], ownerId: 0, level: 0 },
  };
  assert.deepEqual(detectNewlyReachedBrinkTiles(baseProps, oneBrown, ffaPlayers, 'FFA'), []);

  // 2 of 3 Brown tiles -> newly reached brink!
  const twoBrown = {
    ...oneBrown,
    [brownTiles[1]]: { tileIndex: brownTiles[1], ownerId: 0, level: 1 },
  };
  const brinkAlerts = detectNewlyReachedBrinkTiles(oneBrown, twoBrown, ffaPlayers, 'FFA');
  assert.equal(brinkAlerts.length, 1);
  assert.equal(brinkAlerts[0].key, `group:${ColorGroup.BROWN}:0`);
  assert.deepEqual(brinkAlerts[0].tileIndices, [brownTiles[0], brownTiles[1]]);
  assert.equal(brinkAlerts[0].colorHex, ffaPlayers[0].color);

  // Unrelated upgrade on already-brink group must NOT re-emit
  const upgradedTwoBrown = {
    ...twoBrown,
    [brownTiles[1]]: { tileIndex: brownTiles[1], ownerId: 0, level: 2 },
  };
  assert.deepEqual(
    detectNewlyReachedBrinkTiles(twoBrown, upgradedTwoBrown, ffaPlayers, 'FFA'),
    []
  );

  // 3/4 Resorts in TEAMS_2V2 (players 0 & 2 share Team A) -> Resort brink alert!
  const teamPlayers = createInitialPlayers(DEFAULT_PLAYER_CONFIGS, 2_000_000, 'TEAMS_2V2');
  const twoResorts = {
    ...baseProps,
    [RESORT_TILE_INDICES[0]]: { tileIndex: RESORT_TILE_INDICES[0], ownerId: 0, level: 0 },
    [RESORT_TILE_INDICES[1]]: { tileIndex: RESORT_TILE_INDICES[1], ownerId: 2, level: 0 },
  };
  const threeResorts = {
    ...twoResorts,
    [RESORT_TILE_INDICES[2]]: { tileIndex: RESORT_TILE_INDICES[2], ownerId: 0, level: 0 },
  };
  const resortBrinks = detectNewlyReachedBrinkTiles(
    twoResorts,
    threeResorts,
    teamPlayers,
    'TEAMS_2V2'
  );
  assert.equal(resortBrinks.length, 1);
  assert.ok(resortBrinks[0].key.startsWith('resort:'));
  assert.equal(resortBrinks[0].tileIndices.length, 3);
});

test('specialEventEffects drives ANIM-BLD-07..09 & ANIM-EVT-01..06 with fixed <= 16 shard pool, Low 0 FPS sleep, and clean dispose', () => {
  detachGsapFromGlobalTicker();
  const scene = new THREE.Scene();
  const director = createAnimationDirector();
  const palette = makeDummyNightPalette();
  let qualityTier: GraphicsQualityTier = 'high';
  let reducedMotion = false;
  let shadowDirtyCount = 0;

  const fx = createSpecialEventEffects({
    scene,
    director,
    getQualityTier: () => qualityTier,
    getReducedMotion: () => reducedMotion,
    onShadowDirty: () => {
      shadowDirtyCount += 1;
    },
  });

  // Pre-allocated pooled InstancedMesh (max 16 instances, initially hidden)
  const instanced = scene.children.filter(
    (c): c is THREE.InstancedMesh => c instanceof THREE.InstancedMesh
  );
  assert.equal(instanced.length, 1);
  assert.equal(instanced[0].instanceMatrix.count, 16);
  assert.equal(instanced[0].visible, false);

  const suite = createOwnershipBuildingSuite(1.6, 2.6, 0.44, palette, 4, 'metropolis');
  scene.add(suite.root);

  // 1. Earthquake Collapse (ANIM-BLD-07) shakes suite.root & launches rubble shards on High, then resets cleanly
  fx.playEarthquakeCollapse(3, suite, 2, 8);
  assert.equal(director.hasBlockingVisualAnimations(), true);
  advanceDirector(director, 5, 0.02);
  assert.equal(instanced[0].visible, true);
  advanceDirector(director, 40, 0.02);
  assert.equal(director.hasBlockingVisualAnimations(), false);
  assert.equal(instanced[0].visible, false);
  assert.equal(suite.root.position.x, 0);
  assert.equal(suite.root.position.z, 0);

  // 2. Power Outage Zap (ANIM-BLD-08) & Shield Deploy / Break (ANIM-BLD-09)
  fx.playPowerOutageZap(5, -2, 8);
  fx.playShieldDeploy(7, -6, 8);
  fx.playShieldBreak(7, -6, 8);
  advanceDirector(director, 5, 0.02);
  assert.equal(instanced[0].visible, true, 'Shield break launches cyan shards on High');
  advanceDirector(director, 45, 0.02);
  assert.equal(director.hasBlockingVisualAnimations(), false);
  assert.equal(instanced[0].visible, false);

  // 3. Lost Island bamboo bars (ANIM-EVT-01): hydration snap vs animated transition
  fx.syncLostIslandJail(true, false);
  assert.equal(director.hasBlockingVisualAnimations(), false, 'Hydration snap must not start blocking anim');
  fx.syncLostIslandJail(false, true);
  assert.equal(director.hasBlockingVisualAnimations(), true);
  advanceDirector(director, 30, 0.02);
  assert.equal(director.hasBlockingVisualAnimations(), false);

  // 4. World Tour 3D Flight (ANIM-EVT-02) & Chance Card 3D Flip (ANIM-EVT-03) & Championship Searchlight (ANIM-EVT-04) & Brink Pulse (ANIM-EVT-06)
  fx.playWorldTourFlight(24, 3, '#F5B800');
  fx.playChanceCardFlip('ch-13');
  fx.playChampionshipSearchlight(3, 2, 8);
  fx.playBrinkPulse([1, 2], '#F5B800');
  assert.equal(director.hasBlockingVisualAnimations(), true);
  advanceDirector(director, 60, 0.02);
  assert.equal(director.hasBlockingVisualAnimations(), false);

  // 5. Festival 3x Lanterns (ANIM-EVT-05): static on Low / animated on High
  fx.syncFestivalLanterns([2, 11, 23], 0.5, false);
  fx.syncFestivalLanterns([2, 11, 23], 1.5, true);
  assert.equal(director.hasBlockingVisualAnimations(), false);

  // 6. Low tier & reducedMotion skip shards/searchlight and fastForward/cancel stay clean
  qualityTier = 'low';
  reducedMotion = true;
  fx.playEarthquakeCollapse(3, suite, 2, 8);
  fx.playShieldBreak(7, -6, 8);
  fx.playChampionshipSearchlight(3, 2, 8);
  assert.equal(instanced[0].visible, false, 'Low/reducedMotion must emit 0 shards');
  director.fastForwardAll();
  assert.equal(director.hasBlockingVisualAnimations(), false);
  assert.equal(suite.root.position.x, 0);
  assert.ok(shadowDirtyCount > 0);

  fx.dispose();
  director.dispose();
  assert.equal(scene.children.filter((c) => c instanceof THREE.InstancedMesh).length, 0);
});
