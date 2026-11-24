import assert from 'node:assert/strict';
import test from 'node:test';
import gsap from 'gsap';
import * as THREE from 'three';
import {
  createAnimationDirector,
  createAnimationRegistry,
  createManagedGsapTimeline,
  detachGsapFromGlobalTicker,
  isGsapDetachedFromGlobalTicker,
  readPrefersReducedMotion,
} from './animationDirector';
import {
  AnimationCuePayload,
  createAnimationEventDispatcher,
} from './animationEventBus';
import {
  CHARACTER_CLIP_NAMES,
  createGltfAssetPool,
  validateCharacterGltfContract,
} from './gltfAssetPool';

test('AT-UNIT-01: GSAP global ticker is detached and timelines advance strictly by visualAnimDt * speedMultiplier (0 when paused)', async () => {
  detachGsapFromGlobalTicker();
  assert.equal(isGsapDetachedFromGlobalTicker(), true);

  const director = createAnimationDirector();
  const state = { x: 0 };
  let completed = 0;

  const tl = createManagedGsapTimeline({
    id: 'test:linear-x',
    category: 'building',
    blocksIdleSleep: true,
    build: (g) => {
      g.to(state, { x: 100, duration: 1.0, ease: 'none' });
    },
    onComplete: () => {
      completed += 1;
    },
  });

  director.register(tl);
  assert.equal(director.getActiveCount(), 1);
  assert.equal(director.hasBlockingVisualAnimations(), true);

  const tickerFrameBeforeWait = gsap.ticker.frame;
  await new Promise((resolve) => setTimeout(resolve, 60));
  assert.equal(state.x, 0, 'Detached GSAP ticker must not advance paused timeline on its own');
  assert.equal(
    gsap.ticker.frame,
    tickerFrameBeforeWait,
    'Detached GSAP ticker must remain asleep without advancing frames'
  );

  // Advance 0.25s at 1x speed -> x = 25
  const active1 = director.step(0.25, {
    isPaused: false,
    speedMultiplier: 1,
    reducedMotion: false,
    qualityTier: 'low',
  });
  assert.equal(active1, true);
  assert.ok(Math.abs(state.x - 25) < 1e-4, `Expected x ~= 25, got ${state.x}`);

  // Pause freezes animation completely
  const activeWhilePaused = director.step(0.5, {
    isPaused: true,
    speedMultiplier: 2,
    reducedMotion: false,
    qualityTier: 'low',
  });
  assert.equal(activeWhilePaused, false);
  assert.ok(Math.abs(state.x - 25) < 1e-4, 'Paused step must not mutate timeline state');

  // Advance 0.25s at 2x speed -> +0.5s => x = 75
  const active2 = director.step(0.25, {
    isPaused: false,
    speedMultiplier: 2,
    reducedMotion: false,
    qualityTier: 'low',
  });
  assert.equal(active2, true);
  assert.ok(Math.abs(state.x - 75) < 1e-4, `Expected x ~= 75, got ${state.x}`);

  // Final 0.25s at 1x speed completes cleanly
  const active3 = director.step(0.25, {
    isPaused: false,
    speedMultiplier: 1,
    reducedMotion: false,
    qualityTier: 'low',
  });
  assert.equal(active3, false);
  assert.equal(state.x, 100);
  assert.equal(completed, 1);
  assert.equal(director.getActiveCount(), 0);
  assert.equal(director.hasBlockingVisualAnimations(), false);

  director.dispose();
});

test('AT-UNIT-02: fastForwardAll, cancelAll, duplicate-id replacement, non-blocking idle, mixers, and event dispatcher', () => {
  const director = createAnimationDirector();
  const blockTarget = { y: 0 };
  const replacementTarget = { y: 0 };
  const ambientTarget = { glow: 0 };
  let firstCompleted = 0;
  let canceledCount = 0;

  director.register(
    createManagedGsapTimeline({
      id: 'building:5',
      category: 'building',
      blocksIdleSleep: true,
      build: (g) => {
        g.to(blockTarget, { y: 1, duration: 0.6, ease: 'none' });
      },
      onComplete: () => {
        firstCompleted += 1;
      },
    })
  );

  // Duplicate id with fastForward finishes previous timeline synchronously
  director.register(
    createManagedGsapTimeline({
      id: 'building:5',
      category: 'building',
      blocksIdleSleep: true,
      build: (g) => {
        g.to(replacementTarget, { y: 2, duration: 0.8, ease: 'none' });
      },
    }),
    'fastForward'
  );
  assert.equal(firstCompleted, 1);
  assert.equal(blockTarget.y, 1);

  // Non-blocking ambient timeline does NOT keep Low idle awake
  director.register(
    createManagedGsapTimeline({
      id: 'ambient:flag',
      category: 'event',
      blocksIdleSleep: false,
      build: (g) => {
        g.to(ambientTarget, { glow: 1, duration: 2.0, ease: 'none' });
      },
      onCancel: () => {
        canceledCount += 1;
      },
    })
  );
  assert.equal(director.hasBlockingVisualAnimations(), true);

  // fastForwardAll('building') resolves building:5 while leaving non-blocking ambient timeline alone
  director.fastForwardAll('building');
  assert.equal(replacementTarget.y, 2);
  assert.equal(director.getActiveCount('building'), 0);
  assert.equal(director.hasBlockingVisualAnimations(), false);

  // Mixer entry respecting isActive() / blocksIdleSleep()
  let mixerUpdates = 0;
  let lastMixerDt = 0;
  let mixerStops = 0;
  let mixerActive = false;
  let mixerBlocking = false;
  director.registerMixer({
    id: 'pawn:0',
    category: 'character',
    mixer: {
      update: (dt) => {
        mixerUpdates += 1;
        lastMixerDt = dt;
      },
      stopAllAction: () => {
        mixerStops += 1;
      },
    },
    isActive: () => mixerActive,
    blocksIdleSleep: () => mixerBlocking,
  });

  // Low idle sleep: mixer inactive -> mixer.update is NOT called, returns false
  assert.equal(
    director.step(0.1, {
      isPaused: false,
      speedMultiplier: 1,
      reducedMotion: false,
      qualityTier: 'low',
    }),
    false
  );
  assert.equal(mixerUpdates, 0);

  // Activate mixer during movement -> advances with scaledDt and wakes renderer
  mixerActive = true;
  mixerBlocking = true;
  assert.equal(
    director.step(0.125, {
      isPaused: false,
      speedMultiplier: 2,
      reducedMotion: false,
      qualityTier: 'low',
    }),
    true
  );
  assert.equal(mixerUpdates, 1);
  assert.ok(Math.abs(lastMixerDt - 0.25) < 1e-6);

  director.cancelAll();
  assert.equal(canceledCount, 1);
  assert.equal(director.getActiveCount(), 0);
  director.dispose();
  assert.equal(mixerStops, 1);
  assert.equal(readPrefersReducedMotion(), false);

  // Event dispatcher tests + error isolation + registry smoke check
  const bus = createAnimationEventDispatcher();
  const received: AnimationCuePayload[] = [];
  const unsubAll = bus.subscribe((cue) => received.push(cue));
  const unsubBroken = bus.subscribe(() => {
    throw new Error('non-fatal visual listener error');
  });
  let settleCount = 0;
  const unsubKind = bus.subscribeKind('DICE_SETTLE_FX', (cue) => {
    if (cue.isDoubles) settleCount += 1;
  });

  assert.equal(bus.getListenerCount(), 3);
  bus.dispatch({ kind: 'DICE_SETTLE_FX', isDoubles: true, choice: 'NORMAL' });
  assert.equal(received.length, 1);
  assert.equal(settleCount, 1);

  unsubAll();
  unsubBroken();
  unsubKind();
  assert.equal(bus.getListenerCount(), 0);
  bus.dispose();

  const registry = createAnimationRegistry();
  registry.register({
    animId: 'ANIM-BLD-01',
    category: 'building',
    create: () =>
      createManagedGsapTimeline({
        id: 'registry:sample',
        category: 'building',
        blocksIdleSleep: true,
        build: (g) => {
          g.to({ t: 0 }, { t: 1, duration: 0.2 });
        },
      }),
  });
  assert.equal(registry.has('ANIM-BLD-01'), true);
  assert.ok(registry.create('ANIM-BLD-01', undefined));
});

test('AT-UNIT-04: GltfAssetPool deduplicates concurrent loads, validates rig contract, clones safely, and falls back cleanly on error', async () => {
  let loadCalls = 0;

  const makeMockAsset = (clipCount = 12, extraTris = 0) => {
    const group = new THREE.Group();
    const boneA = new THREE.Bone();
    const boneB = new THREE.Bone();
    boneA.add(boneB);
    group.add(boneA);

    const mesh = new THREE.Mesh(
      extraTris > 0
        ? new THREE.SphereGeometry(0.4, 48, 48)
        : new THREE.BoxGeometry(0.5, 0.5, 0.5),
      new THREE.MeshStandardMaterial()
    );
    group.add(mesh);

    const animations = CHARACTER_CLIP_NAMES.slice(0, clipCount).map(
      (name) => new THREE.AnimationClip(name, 1, [])
    );
    return { group, animations };
  };

  const validMock = makeMockAsset(12, 0);
  const validContract = validateCharacterGltfContract(validMock.group, validMock.animations);
  assert.equal(validContract.valid, true);
  assert.equal(validContract.boneCount, 2);
  assert.equal(validContract.triangleCount, 12);
  assert.equal(validContract.missingClips.length, 0);

  const missingClipsMock = makeMockAsset(3, 0);
  const invalidClips = validateCharacterGltfContract(
    missingClipsMock.group,
    missingClipsMock.animations
  );
  assert.equal(invalidClips.valid, false);
  assert.equal(invalidClips.missingClips.length, 9);

  const highPolyMock = makeMockAsset(12, 1);
  const invalidPoly = validateCharacterGltfContract(
    highPolyMock.group,
    highPolyMock.animations
  );
  assert.equal(invalidPoly.valid, false);
  assert.ok(invalidPoly.triangleCount > 1800);

  const pool = createGltfAssetPool({
    loadGltf: async (url) => {
      loadCalls += 1;
      if (url.includes('missing')) {
        throw new Error('HTTP 404 Not Found');
      }
      await new Promise((resolve) => setTimeout(resolve, 15));
      return { url, scene: validMock.group, animations: validMock.animations };
    },
  });

  const [a, b] = await Promise.all([
    pool.load('/assets/models/pawn_car.glb'),
    pool.load('/assets/models/pawn_car.glb'),
  ]);
  assert.equal(loadCalls, 1, 'Concurrent loads of same URL must deduplicate');
  assert.ok(a && b && a === b);

  const cloneA = await pool.acquireClone('/assets/models/pawn_car.glb');
  const cloneB = await pool.acquireClone('/assets/models/pawn_car.glb');
  assert.ok(cloneA && cloneB);
  assert.notEqual(cloneA.scene, cloneB.scene);
  assert.equal(cloneA.animations.length, 12);

  const missingResult = await pool.acquireClone('/assets/models/missing.glb');
  assert.equal(missingResult, null, 'Missing asset must resolve null for procedural fallback');

  pool.dispose();
  assert.equal(pool.getCachedSync('/assets/models/pawn_car.glb'), null);
  const afterDispose = await pool.load('/assets/models/pawn_car.glb');
  assert.equal(afterDispose, null);
});
