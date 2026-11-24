import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { GraphicsQualityTier, PlayerState } from '../game/types';
import { createAnimationDirector } from './animationDirector';
import {
  applyOwnerColorTintToRig,
  computeHopKinematics,
  computeShortestYawDelta,
  computeTravelYaw,
  createCharacterRigController,
} from './characterRigController';
import { createDiceEffectsSystem } from './diceEffects';
import {
  CHARACTER_CLIP_NAMES,
  createGltfAssetPool,
  GltfAssetTemplate,
  validateCharacterGltfContract,
} from './gltfAssetPool';

async function loadGlbFromDisk(filePath: string): Promise<{
  bytes: number;
  scene: THREE.Group;
  animations: THREE.AnimationClip[];
}> {
  const buf = fs.readFileSync(filePath);
  const arrayBuf = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  const loader = new GLTFLoader();
  const gltf = await new Promise<{ scene: THREE.Group; animations: THREE.AnimationClip[] }>(
    (resolve, reject) => {
      loader.parse(arrayBuf, '', resolve, reject);
    }
  );
  return {
    bytes: buf.length,
    scene: gltf.scene,
    animations: gltf.animations ?? [],
  };
}

test('AT-UNIT-04 (Real Blender GLBs): all 4 pawn GLBs satisfy <=50KB, 10 bones, <=1800 tris, 12 clips, COLOR_0, and safe owner tinting', async () => {
  const archetypes = ['car', 'yacht', 'jet', 'crown'] as const;
  const modelsDir = path.resolve(process.cwd(), 'public', 'assets', 'models');

  for (const kind of archetypes) {
    const filePath = path.join(modelsDir, `pawn_${kind}.glb`);
    assert.equal(fs.existsSync(filePath), true, `Expected ${filePath} to exist`);

    const loaded = await loadGlbFromDisk(filePath);
    assert.ok(
      loaded.bytes <= 51_200,
      `pawn_${kind}.glb byte size ${loaded.bytes} exceeds 50 KB (51,200 B) limit`
    );

    const validation = validateCharacterGltfContract(loaded.scene, loaded.animations, {
      maxBones: 12,
      maxTriangles: 1800,
      requiredClips: CHARACTER_CLIP_NAMES,
    });
    assert.equal(
      validation.valid,
      true,
      `pawn_${kind}.glb contract failed: ${validation.issues.join('; ')}`
    );
    assert.equal(validation.boneCount, 10);
    assert.ok(validation.triangleCount > 200 && validation.triangleCount <= 1800);
    assert.equal(validation.missingClips.length, 0);

    // Check materials & COLOR_0 vertex color presence & y=0 resting placement
    const materialNames = new Set<string>();
    let originalSuitMat: THREE.MeshStandardMaterial | null = null;
    let hasColor0 = false;
    loaded.scene.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh) return;
      if (mesh.geometry?.getAttribute('color')) {
        hasColor0 = true;
      }
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const m of mats) {
        if (m) {
          materialNames.add(m.name);
          if (m.name === 'mat_suit' && m instanceof THREE.MeshStandardMaterial) {
            originalSuitMat = m;
          }
        }
      }
    });

    assert.equal(materialNames.has('mat_suit'), true, `${kind}: missing mat_suit`);
    assert.equal(materialNames.has('mat_suit_dark'), true, `${kind}: missing mat_suit_dark`);
    assert.equal(hasColor0, true, `${kind}: missing COLOR_0 vertex color attribute`);

    loaded.scene.updateMatrixWorld(true);
    const bbox = new THREE.Box3().setFromObject(loaded.scene);
    assert.ok(
      bbox.min.y >= -0.02 && bbox.min.y <= 0.05,
      `${kind}: expected resting min.y near 0, got ${bbox.min.y}`
    );

    assert.ok(originalSuitMat);
    const originalHex = (originalSuitMat as THREE.MeshStandardMaterial).color.getHex();
    applyOwnerColorTintToRig(loaded.scene, '#E91E63');

    let clonedSuitMat: THREE.MeshStandardMaterial | null = null;
    let allSharedGeoMarked = true;
    loaded.scene.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh) return;
      if (!mesh.geometry?.userData?.sharedStatic) {
        allSharedGeoMarked = false;
      }
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const m of mats) {
        if (m?.name === 'mat_suit' && m instanceof THREE.MeshStandardMaterial) {
          clonedSuitMat = m;
        }
      }
    });
    assert.equal(allSharedGeoMarked, true, `${kind}: template geometries must keep sharedStatic=true`);
    assert.ok(clonedSuitMat);
    assert.notEqual(clonedSuitMat, originalSuitMat, 'Suit material must be cloned before tinting');
    assert.equal((clonedSuitMat as THREE.MeshStandardMaterial).color.getHex(), 0xe91e63);
    assert.equal((originalSuitMat as THREE.MeshStandardMaterial).color.getHex(), originalHex);
  }
});

test('ANIM-CHAR-02..06: travel yaw, shortest-arc wrap, 3-phase hop kinematics, and corner banking', () => {
  // Yaw on all 4 board edges (+Z Forward in Three.js)
  assert.ok(Math.abs(computeTravelYaw(0, 0, -1, 0, 0) - -Math.PI / 2) < 1e-6);
  assert.ok(Math.abs(Math.abs(computeTravelYaw(0, 0, 0, -1, 0)) - Math.PI) < 1e-6);
  assert.ok(Math.abs(computeTravelYaw(0, 0, 1, 0, 0) - Math.PI / 2) < 1e-6);
  assert.ok(Math.abs(computeTravelYaw(0, 0, 0, 1, 0) - 0) < 1e-6);

  // Shortest-arc delta across +-PI seam
  const delta = computeShortestYawDelta(3.0, -3.0);
  assert.ok(delta > 0 && delta < 0.35, `Expected small positive wrap, got ${delta}`);

  const takeoff = computeHopKinematics(0.08, false, 1);
  assert.equal(takeoff.phase, 'takeoff');
  assert.ok(takeoff.scaleY > 1.04);

  const airborne = computeHopKinematics(0.5, false, 1);
  assert.equal(airborne.phase, 'airborne');
  assert.ok(airborne.heightY > 0.88 && airborne.heightY <= 0.94);
  assert.equal(airborne.bankRollZ, 0);

  const cornerMid = computeHopKinematics(0.5, true, -1);
  assert.ok(cornerMid.bankRollZ < -0.1, `Expected inward negative corner roll, got ${cornerMid.bankRollZ}`);

  const land = computeHopKinematics(0.9, true, 1);
  assert.equal(land.phase, 'land');
  assert.ok(land.scaleY < 0.94);
});

test('CharacterRigController preserves Low 0 FPS idle, provides instant fallback, upgrades to GLB, and isolates reaction wakeups', async () => {
  const prevDoc = (globalThis as Record<string, unknown>).document;
  const noop = () => {};
  const gradStub = { addColorStop: noop };
  const ctxStub = {
    fillStyle: '',
    strokeStyle: '',
    createRadialGradient: () => gradStub,
    fillRect: noop,
    beginPath: noop,
    arc: noop,
    fill: noop,
  };
  (globalThis as Record<string, unknown>).document = {
    createElement: (tag: string) =>
      tag === 'canvas' ? { width: 64, height: 64, getContext: () => ctxStub } : {},
  };

  try {
    const realCar = await loadGlbFromDisk(
      path.resolve(process.cwd(), 'public', 'assets', 'models', 'pawn_car.glb')
    );

    const scene = new THREE.Scene();
    const director = createAnimationDirector();
    let quality: GraphicsQualityTier = 'low';
    const reducedMotion = false;

    const pool = createGltfAssetPool({
      loadGltf: async (url): Promise<GltfAssetTemplate> => ({
        url,
        scene: realCar.scene.clone(true),
        animations: realCar.animations,
      }),
    });

    const controller = createCharacterRigController({
      scene,
      director,
      gltfPool: pool,
      getQualityTier: () => quality,
      getReducedMotion: () => reducedMotion,
    });

    const player: PlayerState = {
      id: 0,
      name: 'Minh Khôi',
      isBot: false,
      color: '#F5B800',
      colorName: 'Vàng Kim',
      tokenType: 'car',
      cash: 2_000_000,
      position: 0,
      laps: 0,
      inJail: false,
      jailTurns: 0,
      jailFreeCards: 0,
      doublesStreak: 0,
      pendingWorldTour: false,
      bankrupt: false,
    };

    const tokenGroup = controller.ensurePlayerToken(player, new THREE.Vector3(7, 0.44, 7));
    assert.ok(tokenGroup instanceof THREE.Group);
    // Instant procedural fallback exists at t = 0
    assert.ok(tokenGroup.children.length > 0);

    // Wait microtask for async GLB swap
    await new Promise((resolve) => setTimeout(resolve, 25));

    controller.syncIdleState(0, { inJail: false, bankrupt: false, isActiveTurn: true });

    // Low tier in idle MUST NOT block Low 0 FPS idle sleep!
    assert.equal(director.hasBlockingVisualAnimations(), false);
    const idleActive = director.step(0.016, {
      isPaused: false,
      speedMultiplier: 1,
      reducedMotion: false,
      qualityTier: 'low',
    });
    assert.equal(idleActive, false);

    // Triggering a reaction wakes blocking animation temporarily, then stops blocking when finished
    controller.playReaction(0, 'cash_gain');
    assert.equal(director.hasBlockingVisualAnimations(), true);

    for (let i = 0; i < 15; i++) {
      director.step(0.06, {
        isPaused: false,
        speedMultiplier: 1,
        reducedMotion: false,
        qualityTier: 'low',
      });
    }
    assert.equal(director.hasBlockingVisualAnimations(), false);

    // Medium tier runs idle cleanly without blocking sleep
    quality = 'medium';
    controller.syncIdleState(0, { inJail: true, bankrupt: false, isActiveTurn: false });
    assert.equal(director.hasBlockingVisualAnimations(), false);

    controller.dispose();
    pool.dispose();
    director.dispose();
  } finally {
    if (prevDoc === undefined) {
      delete (globalThis as Record<string, unknown>).document;
    } else {
      (globalThis as Record<string, unknown>).document = prevDoc;
    }
  }
});

test('DiceEffectsSystem pools rings/sparks upfront, obeys quality/reducedMotion, and clears cleanly via AnimationDirector', () => {
  const scene = new THREE.Scene();
  const director = createAnimationDirector();
  const diceFx = createDiceEffectsSystem({ scene, director });

  assert.equal(scene.children.length, 1);

  diceFx.triggerAnticipation('EVEN', false);
  assert.equal(director.hasBlockingVisualAnimations(), true);

  // Low quality skips collision sparks; High quality emits pooled sparks
  diceFx.triggerCollisionSparks(0, 0.4, 0, 0.9, 'low', false);
  assert.equal(director.getActiveCount('dice'), 1);

  diceFx.triggerCollisionSparks(0, 0.4, 0, 0.9, 'high', false);
  assert.equal(director.getActiveCount('dice'), 2);

  diceFx.triggerSettle(
    new THREE.Vector3(-0.6, 0.6, 0.5),
    new THREE.Vector3(0.6, 0.6, 0.5),
    true,
    'ODD',
    'high',
    false
  );
  assert.ok(director.hasBlockingVisualAnimations());

  // Advance past all dice FX durations
  for (let i = 0; i < 20; i++) {
    director.step(0.05, {
      isPaused: false,
      speedMultiplier: 1,
      reducedMotion: false,
      qualityTier: 'high',
    });
  }
  assert.equal(director.hasBlockingVisualAnimations(), false);

  diceFx.dispose();
  assert.equal(scene.children.length, 0);
  director.dispose();
});
