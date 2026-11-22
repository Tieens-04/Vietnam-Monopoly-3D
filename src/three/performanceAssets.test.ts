import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { DEFAULT_PLAYER_CONFIGS } from '../game/boardData';
import { createInitialPlayers } from '../game/rules';
import {
  createCornerDiorama,
  createCourtyardDiorama,
  createOwnershipBuildingSuite,
  createPlayerTokenMesh,
  createProtrudingPriceTab,
  createSurroundingVista,
  createTopCappedBoxGeometry,
  NightLightingPalette,
} from './models';
import { createTreasurySystem } from './treasurySystem';

function installMinimalCanvasDomStub(): () => void {
  const prevDoc = (globalThis as Record<string, unknown>).document;
  const noop = () => {};
  const gradStub = { addColorStop: noop };
  const ctxStub = {
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    lineJoin: 'round',
    lineCap: 'round',
    font: '',
    textAlign: 'center',
    textBaseline: 'middle',
    globalAlpha: 1,
    createLinearGradient: () => gradStub,
    createRadialGradient: () => gradStub,
    fillRect: noop,
    strokeRect: noop,
    clearRect: noop,
    beginPath: noop,
    closePath: noop,
    moveTo: noop,
    lineTo: noop,
    arc: noop,
    ellipse: noop,
    quadraticCurveTo: noop,
    bezierCurveTo: noop,
    fill: noop,
    stroke: noop,
    clip: noop,
    save: noop,
    restore: noop,
    translate: noop,
    rotate: noop,
    scale: noop,
    setLineDash: noop,
    fillText: noop,
    strokeText: noop,
    measureText: (s: string) => ({ width: s.length * 8 }),
  };

  (globalThis as Record<string, unknown>).document = {
    createElement: (tag: string) => {
      if (tag === 'canvas') {
        return {
          width: 64,
          height: 64,
          getContext: () => ctxStub,
        };
      }
      return {};
    },
  };

  return () => {
    if (prevDoc === undefined) {
      delete (globalThis as Record<string, unknown>).document;
    } else {
      (globalThis as Record<string, unknown>).document = prevDoc;
    }
  };
}

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

test('createOwnershipBuildingSuite lazily defers levelBadgeTexture, shares static geometries, and toggles quality options', () => {
  const palette = makeDummyNightPalette();
  const suiteA = createOwnershipBuildingSuite(1.6, 2.6, 0.44, palette, 4, 'metropolis');
  const suiteB = createOwnershipBuildingSuite(1.6, 2.6, 0.44, palette, 4, 'metropolis');

  // Lazy texture allocation: unupgraded suites must NOT allocate CanvasTexture at creation time
  assert.equal(suiteA.levelBadgeMat.map, null);
  assert.equal(suiteB.levelBadgeMat.map, null);

  // Shield & badge geometries must be shared across suites and marked sharedStatic
  assert.equal(suiteA.levelBadgeMesh.geometry, suiteB.levelBadgeMesh.geometry);
  assert.equal(suiteA.levelBadgeMesh.geometry.userData.sharedStatic, true);

  const shieldMeshA = suiteA.shieldGroup.children[0] as THREE.Mesh;
  const shieldMeshB = suiteB.shieldGroup.children[0] as THREE.Mesh;
  assert.equal(shieldMeshA.geometry, shieldMeshB.geometry);
  assert.equal(shieldMeshA.geometry.userData.sharedStatic, true);

  // Quality options toggle clearcoat and shadow casting dynamically
  suiteA.setQualityOptions({ shadowsEnabled: false, clearcoatEnabled: false });
  assert.equal(suiteA.padMesh.castShadow, false);
  assert.equal(suiteA.padMesh.receiveShadow, false);
  assert.equal((suiteA.facadeMat as THREE.MeshPhysicalMaterial).clearcoat, 0);
  assert.equal((suiteA.roofMat as THREE.MeshPhysicalMaterial).clearcoat, 0);

  suiteA.setQualityOptions({ shadowsEnabled: true, clearcoatEnabled: true });
  assert.equal(suiteA.padMesh.castShadow, true);
  assert.equal((suiteA.facadeMat as THREE.MeshPhysicalMaterial).clearcoat > 0.4, true);
  assert.equal((suiteA.roofMat as THREE.MeshPhysicalMaterial).clearcoat > 0.4, true);
});

test('createTreasurySystem reports hasActiveAnimations accurately and applies setQualityProfile', () => {
  const restoreDom = installMinimalCanvasDomStub();
  try {
    const treasury = createTreasurySystem(4, false);
    const players = createInitialPlayers(DEFAULT_PLAYER_CONFIGS, 2_000_000);

    treasury.syncVaults(players, 'mixed', 0);
    treasury.update(0.016, 0.016);
    assert.equal(
      treasury.hasActiveAnimations(),
      false,
      'Static treasury must report no active animations so low tier can sleep at 0 FPS'
    );

    // Enqueue a cash transfer -> must wake animation state immediately
    treasury.enqueueTransfers(
      [
        {
          kind: 'BANK_TO_PLAYER',
          fromPlayerId: null,
          toPlayerId: players[0].id,
          tileIndex: null,
          amount: 300_000,
        },
      ],
      players,
      'mixed'
    );
    assert.equal(treasury.hasActiveAnimations(), true);

    // Advance simulation past flight duration + tray recoil damping (~3.5s)
    let elapsed = 0.016;
    for (let step = 0; step < 90; step++) {
      elapsed += 0.05;
      treasury.update(0.05, elapsed);
    }
    assert.equal(
      treasury.hasActiveAnimations(),
      false,
      'Treasury must return to idle after flights and tray spring recoil settle'
    );

    // Quality profile toggles shadow flags & clearcoat across InstancedMesh pools
    treasury.setQualityProfile({ shadowsEnabled: false, usePhysicalClearcoat: false });
    const instancedPools = treasury.group.children.filter(
      (ch): ch is THREE.InstancedMesh => ch instanceof THREE.InstancedMesh
    );
    assert.equal(instancedPools.length, 4);
    assert.equal(
      countMeshes(treasury.group) <= 29,
      true,
      `Expected treasury.group <= 29 meshes after rim wall batching, got ${countMeshes(treasury.group)}`
    );
    for (const im of instancedPools) {
      assert.equal(im.castShadow, false);
      assert.equal(im.receiveShadow, false);
      if (im.material instanceof THREE.MeshPhysicalMaterial) {
        assert.equal(im.material.clearcoat, 0);
      }
    }

    // Idle low-quality update must hold shader time steady instead of jumping on 1s clock ticks
    const tBeforeIdleTick = treasury.getShaderTime();
    treasury.update(0.016, tBeforeIdleTick + 1.0);
    assert.equal(
      treasury.getShaderTime(),
      tBeforeIdleTick,
      'Low quality idle treasury must freeze uTime so bullion glint never jumps on 1s clock ticks'
    );

    treasury.setQualityProfile({ shadowsEnabled: true, usePhysicalClearcoat: true });
    for (const im of instancedPools) {
      assert.equal(im.castShadow, true);
      assert.equal(im.receiveShadow, true);
    }

    treasury.dispose();
  } finally {
    restoreDom();
  }
});

test('createPlayerTokenMesh differentiates female personas (yacht, crown) with necklace/hair locks and no necktie', () => {
  const restoreDom = installMinimalCanvasDomStub();
  try {
    const carPawn = createPlayerTokenMesh('car', '#F5B800');
    const jetPawn = createPlayerTokenMesh('jet', '#E91E63');
    const yachtPawn = createPlayerTokenMesh('yacht', '#66C61C');
    const crownPawn = createPlayerTokenMesh('crown', '#29B6F6');

    assert.equal(carPawn.userData.isFemalePersona, false);
    assert.equal(jetPawn.userData.isFemalePersona, false);
    assert.equal(yachtPawn.userData.isFemalePersona, true);
    assert.equal(crownPawn.userData.isFemalePersona, true);

    assert.equal(carPawn.userData.hasNecktie, true);
    assert.equal(jetPawn.userData.hasNecktie, true);
    assert.equal(yachtPawn.userData.hasNecktie, false);
    assert.equal(crownPawn.userData.hasNecktie, false);
    assert.equal(yachtPawn.userData.hasSideHairLocks, true);
    assert.equal(crownPawn.userData.hasSideHairLocks, true);
  } finally {
    restoreDom();
  }
});

function countMeshes(root: THREE.Object3D): number {
  let count = 0;
  root.traverse((obj) => {
    if (obj instanceof THREE.Mesh) count++;
  });
  return count;
}

test('createTopCappedBoxGeometry batches 5 side/bottom faces into group 0 and top face into group 1 (2 draw calls instead of 6)', () => {
  const restoreDom = installMinimalCanvasDomStub();
  try {
    const geo = createTopCappedBoxGeometry(1.5, 0.56, 2.5);
    assert.equal(geo.groups.length, 2);
    assert.equal(geo.groups[0].materialIndex, 0);
    assert.equal(geo.groups[0].count, 30);
    assert.equal(geo.groups[1].materialIndex, 1);
    assert.equal(geo.groups[1].count, 6);

    const tab = createProtrudingPriceTab('200K', '#22B8F8', false, 4);
    assert.equal(Array.isArray(tab.hitMesh.material), true);
    assert.equal((tab.hitMesh.material as THREE.Material[]).length, 2);
    assert.equal(tab.hitMesh.geometry.groups.length, 2);
    geo.dispose();
  } finally {
    restoreDom();
  }
});

test('static geometry batching cuts mesh draw-call counts across pawns, vista, corners, and courtyard clock reuses texture', () => {
  const restoreDom = installMinimalCanvasDomStub();
  try {
    const palette = makeDummyNightPalette();

    // Pawns: merged by material (was ~29 meshes per pawn -> <= 10 meshes)
    const carPawn = createPlayerTokenMesh('car', '#F5B800', palette);
    const crownPawn = createPlayerTokenMesh('crown', '#29B6F6', palette);
    assert.equal(
      countMeshes(carPawn) <= 10,
      true,
      `Expected carPawn <= 10 meshes after material batching, got ${countMeshes(carPawn)}`
    );
    assert.equal(
      countMeshes(crownPawn) <= 10,
      true,
      `Expected crownPawn <= 10 meshes after material batching, got ${countMeshes(crownPawn)}`
    );

    // Vista: blossoms, clouds, lamp posts, card stack merged (was ~135 meshes -> <= 32 meshes)
    const dummyBump = new THREE.Texture();
    const { vista, animatedCars } = createSurroundingVista(dummyBump, palette, 4);
    assert.equal(animatedCars.length >= 7, true);
    assert.equal(
      countMeshes(vista) <= 34,
      true,
      `Expected vista <= 34 meshes after batching, got ${countMeshes(vista)}`
    );

    // Corners: static parts merged while preserving animated spinTarget / bobTarget
    const c0 = createCornerDiorama(0, 0.44, palette);
    const c8 = createCornerDiorama(8, 0.44, palette);
    const c16 = createCornerDiorama(16, 0.44, palette);
    const c24 = createCornerDiorama(24, 0.44, palette);
    assert.notEqual(c0.anim.spinTarget, null);
    assert.notEqual(c8.anim.bobTarget, null);
    assert.notEqual(c16.anim.spinTarget, null);
    assert.notEqual(c24.anim.spinTarget, null);
    assert.notEqual(c24.anim.bobTarget, null);
    const totalCornerMeshes =
      countMeshes(c0.group) +
      countMeshes(c8.group) +
      countMeshes(c16.group) +
      countMeshes(c24.group);
    assert.equal(
      totalCornerMeshes <= 42,
      true,
      `Expected 4 corners <= 42 total meshes after batching, got ${totalCornerMeshes}`
    );

    // Courtyard digital countdown reuses a single CanvasTexture in-place across 1s ticks
    const courtyard = createCourtyardDiorama(palette, 4);
    let clockScreenMat: THREE.MeshBasicMaterial | null = null;
    courtyard.group.traverse((obj) => {
      if (
        obj instanceof THREE.Mesh &&
        obj.material instanceof THREE.MeshBasicMaterial &&
        !obj.material.transparent &&
        obj.material.map
      ) {
        clockScreenMat = obj.material;
      }
    });
    assert.notEqual(clockScreenMat, null);
    const initialTex = clockScreenMat!.map;
    courtyard.animated.updateCountdown(44, 1, '#F5B800');
    courtyard.animated.updateCountdown(43, 1, '#F5B800');
    assert.equal(
      clockScreenMat!.map,
      initialTex,
      'Countdown ticks must redraw in-place on the persistent CanvasTexture instead of reallocating GPU textures every second'
    );
    courtyard.animated.disposeDynamicTextures();
  } finally {
    restoreDom();
  }
});

