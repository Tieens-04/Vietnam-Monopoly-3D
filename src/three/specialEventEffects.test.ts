import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { COLOR_GROUP_META, DEFAULT_PLAYER_CONFIGS } from '../game/boardData';
import {
  createInitialPlayers,
  createInitialProperties,
  RESORT_TILE_INDICES,
} from '../game/rules';
import { SoundEngine } from '../audio/soundEngine';
import { BoardTauntKind, TilePingIntent } from '../game/onlineTypes';
import { ColorGroup, GraphicsQualityTier } from '../game/types';
import { createAnimationDirector, detachGsapFromGlobalTicker } from './animationDirector';
import { createOwnershipBuildingSuite, NightLightingPalette } from './models';
import {
  createSpecialEventEffects,
  detectNewlyReachedBrinkTiles,
  POOL_PING_RINGS,
} from './specialEventEffects';
import { createTauntProjectilePool, POOL_TAUNT_SLOTS } from './tauntProjectiles';

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

function snapshotSceneMeshes(scene: THREE.Scene): Map<
  THREE.Object3D,
  {
    geometry: THREE.BufferGeometry | undefined;
    material: THREE.Material | THREE.Material[] | undefined;
  }
> {
  const map = new Map<
    THREE.Object3D,
    {
      geometry: THREE.BufferGeometry | undefined;
      material: THREE.Material | THREE.Material[] | undefined;
    }
  >();
  scene.traverse((obj) => {
    if (obj instanceof THREE.Mesh) {
      map.set(obj, { geometry: obj.geometry, material: obj.material });
    }
  });
  return map;
}

function assertNoRuntimeMeshOrResourceAllocations(
  scene: THREE.Scene,
  baseline: Map<
    THREE.Object3D,
    {
      geometry: THREE.BufferGeometry | undefined;
      material: THREE.Material | THREE.Material[] | undefined;
    }
  >,
  expectedSceneChildrenCount: number
): void {
  assert.equal(
    scene.children.length,
    expectedSceneChildrenCount,
    'Scene root child count must remain constant after initialization'
  );
  const current = snapshotSceneMeshes(scene);
  assert.equal(current.size, baseline.size, 'No new THREE.Mesh instances may be added to scene');
  for (const [obj, refs] of current.entries()) {
    const prev = baseline.get(obj);
    assert.ok(prev, 'Every mesh in scene must have been pre-allocated during initialization');
    assert.equal(refs.geometry, prev.geometry, 'Mesh geometry reference must not be reallocated');
    assert.equal(refs.material, prev.material, 'Mesh material reference must not be reallocated');
  }
}

test('TauntProjectilePool & SpecialEventEffects.playBoardTaunt reuse POOL_TAUNT_SLOTS = 4 with zero runtime allocations', () => {
  detachGsapFromGlobalTicker();
  const poolScene = new THREE.Scene();
  const poolDirector = createAnimationDirector();
  const pool = createTauntProjectilePool({
    scene: poolScene,
    director: poolDirector,
    getQualityTier: () => 'high',
    getReducedMotion: () => false,
  });

  assert.equal(POOL_TAUNT_SLOTS, 4);
  assert.equal(poolScene.children.length, POOL_TAUNT_SLOTS);
  assert.equal(pool.getActiveSlotCount(), 0);
  const poolBaseline = snapshotSceneMeshes(poolScene);

  const kinds: BoardTauntKind[] = [
    'slipper',
    'tomato',
    'confetti',
    'cash_stack',
    'slipper',
    'tomato',
  ];
  for (let i = 0; i < kinds.length; i++) {
    pool.playTaunt(kinds[i], -6 + i, 7, 6 - i, -7);
  }
  assert.equal(pool.getActiveSlotCount(), POOL_TAUNT_SLOTS);
  assert.equal(
    poolScene.children.filter((c) => c.visible).length,
    POOL_TAUNT_SLOTS
  );
  assertNoRuntimeMeshOrResourceAllocations(poolScene, poolBaseline, POOL_TAUNT_SLOTS);

  // Parabolic flight (~0.65s) should still be mid-flight at 0.2s and finished by 0.8s
  advanceDirector(poolDirector, 10, 0.02);
  assert.equal(pool.getActiveSlotCount(), POOL_TAUNT_SLOTS);
  advanceDirector(poolDirector, 35, 0.02);
  assert.equal(pool.getActiveSlotCount(), 0);
  assert.equal(poolScene.children.filter((c) => c.visible).length, 0);
  assert.equal(poolDirector.hasBlockingVisualAnimations(), false);

  pool.dispose();
  poolDirector.dispose();
  assert.equal(poolScene.children.length, 0);

  // Also verify via SpecialEventEffects wrapper
  const fxScene = new THREE.Scene();
  const fxDirector = createAnimationDirector();
  const fx = createSpecialEventEffects({
    scene: fxScene,
    director: fxDirector,
    getQualityTier: () => 'medium',
    getReducedMotion: () => false,
  });
  const fxBaselineCount = fxScene.children.length;
  const fxBaselineMeshes = snapshotSceneMeshes(fxScene);

  for (let i = 0; i < kinds.length; i++) {
    fx.playBoardTaunt(kinds[i], -7, -7 + i * 2, 7, 7 - i * 2);
  }
  assert.equal(fxDirector.hasBlockingVisualAnimations(), true);
  assertNoRuntimeMeshOrResourceAllocations(fxScene, fxBaselineMeshes, fxBaselineCount);

  advanceDirector(fxDirector, 45, 0.02);
  assert.equal(fxDirector.hasBlockingVisualAnimations(), false);

  fx.dispose();
  fxDirector.dispose();
  assert.equal(fxScene.children.length, 0);
});

test('SpecialEventEffects.playTilePing reuses POOL_PING_RINGS = 4 with zero allocations and 3.5s default pulse', () => {
  detachGsapFromGlobalTicker();
  const scene = new THREE.Scene();
  const director = createAnimationDirector();
  const fx = createSpecialEventEffects({
    scene,
    director,
    getQualityTier: () => 'high',
    getReducedMotion: () => false,
  });

  assert.equal(POOL_PING_RINGS, 4);
  const initialCount = scene.children.length;
  const baselineMeshes = snapshotSceneMeshes(scene);

  const colors = ['#EF4444', '#3B82F6', '#10B981', '#F59E0B', '#EC4899', '#8B5CF6'];
  const tiles = [1, 3, 5, 9, 14, 21];
  for (let i = 0; i < tiles.length; i++) {
    fx.playTilePing(tiles[i], colors[i]);
  }

  assertNoRuntimeMeshOrResourceAllocations(scene, baselineMeshes, initialCount);

  const visiblePingRings = scene.children.filter(
    (c): c is THREE.Mesh =>
      c instanceof THREE.Mesh &&
      c.visible &&
      c.geometry instanceof THREE.RingGeometry &&
      c.renderOrder === 4
  );
  assert.equal(
    visiblePingRings.length,
    POOL_PING_RINGS,
    'At most POOL_PING_RINGS = 4 ping rings may be visible simultaneously'
  );
  const activeHexes = new Set(
    visiblePingRings.map((m) => `#${(m.material as THREE.MeshBasicMaterial).color.getHexString().toUpperCase()}`)
  );
  for (const expected of colors.slice(2)) {
    assert.ok(activeHexes.has(expected), `Expected retained ping ring color ${expected}`);
  }

  // Still pulsing at 2.0s, finished after default 3.5s
  advanceDirector(director, 40, 0.05);
  assert.equal(director.hasBlockingVisualAnimations(), true);
  advanceDirector(director, 35, 0.05);
  assert.equal(director.hasBlockingVisualAnimations(), false);
  assert.equal(
    scene.children.filter((c) => c instanceof THREE.Mesh && c.visible && c.renderOrder === 4).length,
    0
  );

  // Re-pinging the same tile reuses its slot cleanly without consuming an extra ring
  fx.playTilePing(7, '#EF4444', 1.2);
  fx.playTilePing(7, '#22C55E', 1.2);
  const sameTileRings = scene.children.filter(
    (c): c is THREE.Mesh => c instanceof THREE.Mesh && c.visible && c.renderOrder === 4
  );
  assert.equal(sameTileRings.length, 1);
  assert.equal(
    `#${(sameTileRings[0].material as THREE.MeshBasicMaterial).color.getHexString().toUpperCase()}`,
    '#22C55E'
  );

  // LRU eviction check: ping 4 distinct tiles, refresh the oldest (tile 7) to MRU, then 5th ping must evict tile 9 (LRU), NOT tile 7
  fx.playTilePing(9, '#3B82F6', 3.5);
  fx.playTilePing(11, '#F59E0B', 3.5);
  fx.playTilePing(13, '#EC4899', 3.5);
  // Refresh tile 7 (currently oldest) -> becomes MRU; tile 9 is now LRU
  fx.playTilePing(7, '#10B981', 3.5);
  // 5th distinct ping -> evicts tile 9 (#3B82F6), keeping refreshed tile 7 (#10B981)!
  fx.playTilePing(15, '#8B5CF6', 3.5);
  const lruRings = scene.children.filter(
    (c): c is THREE.Mesh => c instanceof THREE.Mesh && c.visible && c.renderOrder === 4
  );
  assert.equal(lruRings.length, POOL_PING_RINGS);
  const lruHexes = new Set(
    lruRings.map((m) => `#${(m.material as THREE.MeshBasicMaterial).color.getHexString().toUpperCase()}`)
  );
  assert.equal(lruHexes.has('#10B981'), true, 'Refreshed MRU tile 7 ring must survive 5th ping');
  assert.equal(lruHexes.has('#3B82F6'), false, 'Least-recently-used tile 9 ring must be evicted');

  fx.dispose();
  director.dispose();
  assert.equal(scene.children.length, 0);
});

test('Board taunts & tile pings stay safe on reducedMotion + low tier and dispose all geometries/materials cleanly', () => {
  detachGsapFromGlobalTicker();
  const scene = new THREE.Scene();
  const director = createAnimationDirector();
  let qualityTier: GraphicsQualityTier = 'low';
  let reducedMotion = true;

  const fx = createSpecialEventEffects({
    scene,
    director,
    getQualityTier: () => qualityTier,
    getReducedMotion: () => reducedMotion,
  });

  const geoDisposes = new Map<THREE.BufferGeometry, number>();
  const matDisposes = new Map<THREE.Material, number>();
  scene.traverse((obj) => {
    if (obj instanceof THREE.Mesh) {
      if (!geoDisposes.has(obj.geometry)) {
        geoDisposes.set(obj.geometry, 0);
        const origGeoDispose = obj.geometry.dispose.bind(obj.geometry);
        obj.geometry.dispose = () => {
          geoDisposes.set(obj.geometry, (geoDisposes.get(obj.geometry) ?? 0) + 1);
          origGeoDispose();
        };
      }
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      for (const m of mats) {
        if (!matDisposes.has(m)) {
          matDisposes.set(m, 0);
          const origMatDispose = m.dispose.bind(m);
          m.dispose = () => {
            matDisposes.set(m, (matDisposes.get(m) ?? 0) + 1);
            origMatDispose();
          };
        }
      }
    }
  });

  assert.doesNotThrow(() => {
    fx.playBoardTaunt('slipper', -7, -7, 7, 7);
    fx.playBoardTaunt('tomato', -7, 7, 7, -7);
    fx.playBoardTaunt('confetti', 7, -7, -7, 7);
    fx.playBoardTaunt('cash_stack', 7, 7, -7, -7);
    fx.playTilePing(16, '#FACC15');
  });
  assert.equal(director.hasBlockingVisualAnimations(), true);

  // Under reducedMotion, taunt blinks briefly (~0.25s) and finishes without parabolic shake;
  // tile ping stays active until cancelAll() hides everything.
  advanceDirector(director, 15, 0.02);
  fx.cancelAll();
  for (const child of scene.children) {
    assert.equal(child.visible, false, 'cancelAll() must hide all scene effect roots');
  }

  // Test direct reducedMotion taunt snaps to destination immediately & completes in ~0.25s
  const poolScene = new THREE.Scene();
  const poolDirector = createAnimationDirector();
  const pool = createTauntProjectilePool({
    scene: poolScene,
    director: poolDirector,
    getQualityTier: () => qualityTier,
    getReducedMotion: () => reducedMotion,
  });
  pool.playTaunt('slipper', -7, -7, 5.2, -3.4);
  const visibleSlot = poolScene.children.find((c) => c.visible);
  assert.ok(visibleSlot);
  assert.ok(Math.abs(visibleSlot.position.x - 5.2) < 1e-4);
  assert.ok(Math.abs(visibleSlot.position.z - -3.4) < 1e-4);
  advanceDirector(poolDirector, 15, 0.02);
  assert.equal(pool.getActiveSlotCount(), 0);
  pool.dispose();
  poolDirector.dispose();
  assert.equal(poolScene.children.length, 0);

  fx.dispose();
  director.dispose();
  assert.equal(scene.children.length, 0);

  for (const count of geoDisposes.values()) {
    assert.ok(count >= 1, 'Every tracked BufferGeometry must be disposed');
  }
  for (const count of matDisposes.values()) {
    assert.ok(count >= 1, 'Every tracked Material must be disposed');
  }

  // Post-dispose calls must remain safe no-ops
  assert.doesNotThrow(() => {
    fx.playBoardTaunt('confetti', 0, 0, 1, 1);
    fx.playTilePing(1, '#FFFFFF');
    fx.cancelAll();
    fx.dispose();
  });
});

test('SoundEngine.playBoardTauntSfx and playTilePingSfx synthesize safely and route through master GainNode + Compressor', () => {
  const prevWin = (globalThis as Record<string, unknown>).window;
  try {
    const connections: Array<{ from: string; to: string }> = [];
    const oscStarts: number[] = [];
    const bufStarts: number[] = [];
    const oscFreqs: number[] = [];
    const makeParam = () => ({
      setValueAtTime: (val: number) => {
        oscFreqs.push(val);
      },
      exponentialRampToValueAtTime: () => {},
    });

    (globalThis as Record<string, unknown>).window = {
      AudioContext: class RunningAudioContext {
        state = 'running';
        currentTime = 2.0;
        sampleRate = 44100;
        destination = { tag: 'destination' };
        resume() {
          return Promise.resolve();
        }
        createDynamicsCompressor() {
          return {
            tag: 'compressor',
            context: this,
            threshold: makeParam(),
            knee: makeParam(),
            ratio: makeParam(),
            attack: makeParam(),
            release: makeParam(),
            connect: (target: { tag?: string }) => {
              connections.push({ from: 'compressor', to: target.tag ?? 'unknown' });
            },
          };
        }
        createGain() {
          return {
            tag: 'gain',
            context: this,
            gain: { setValueAtTime: () => {}, exponentialRampToValueAtTime: () => {} },
            connect: (target: { tag?: string }) => {
              connections.push({ from: 'gain', to: target.tag ?? 'unknown' });
            },
          };
        }
        createOscillator() {
          return {
            type: 'sine',
            frequency: makeParam(),
            connect: (target: { tag?: string }) => {
              connections.push({ from: 'osc', to: target.tag ?? 'unknown' });
            },
            start: (t: number) => {
              oscStarts.push(t);
            },
            stop: () => {},
          };
        }
        createBuffer(_ch: number, len: number) {
          return { getChannelData: () => new Float32Array(len) };
        }
        createBufferSource() {
          return {
            buffer: null,
            connect: (target: { tag?: string }) => {
              connections.push({ from: 'bufSrc', to: target.tag ?? 'unknown' });
            },
            start: (t: number) => {
              bufStarts.push(t);
            },
          };
        }
        createBiquadFilter() {
          return {
            type: 'bandpass',
            frequency: makeParam(),
            Q: { setValueAtTime: () => {}, exponentialRampToValueAtTime: () => {} },
            connect: (target: { tag?: string }) => {
              connections.push({ from: 'filter', to: target.tag ?? 'unknown' });
            },
          };
        }
      },
    };

    const engine = new SoundEngine();
    const taunts: BoardTauntKind[] = ['slipper', 'tomato', 'confetti', 'cash_stack'];
    for (const kind of taunts) {
      const before = oscStarts.length + bufStarts.length;
      engine.playBoardTauntSfx(kind);
      assert.ok(
        oscStarts.length + bufStarts.length > before,
        `Expected scheduled WebAudio nodes for taunt ${kind}`
      );
    }

    const intents: TilePingIntent[] = ['TARGET', 'DANGER', 'TROPHY'];
    const intentSignatures: string[] = [];
    for (const intent of intents) {
      const fBefore = oscFreqs.length;
      const before = oscStarts.length + bufStarts.length;
      engine.playTilePingSfx(intent);
      assert.ok(
        oscStarts.length + bufStarts.length > before,
        `Expected scheduled WebAudio nodes for ping intent ${intent}`
      );
      intentSignatures.push(oscFreqs.slice(fBefore).join(','));
    }
    assert.equal(
      new Set(intentSignatures).size,
      3,
      'TARGET, DANGER, and TROPHY ping cues must produce distinct pitch signatures'
    );

    assert.ok(connections.some((c) => c.from === 'gain' && c.to === 'compressor'));
    assert.ok(connections.some((c) => c.from === 'compressor' && c.to === 'destination'));
    assert.equal(
      connections.some((c) => c.from === 'gain' && c.to === 'destination'),
      false
    );

    // Muted engine must not schedule any nodes
    const mutedBefore = oscStarts.length + bufStarts.length;
    engine.setMuted(true);
    engine.playBoardTauntSfx('slipper');
    engine.playTilePingSfx('TARGET');
    assert.equal(oscStarts.length + bufStarts.length, mutedBefore);
  } finally {
    if (prevWin === undefined) {
      delete (globalThis as Record<string, unknown>).window;
    } else {
      (globalThis as Record<string, unknown>).window = prevWin;
    }
  }
});
