import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { DEFAULT_PLAYER_CONFIGS } from '../game/boardData';
import { createInitialPlayers } from '../game/rules';
import {
  createOwnershipBuildingSuite,
  createPlayerTokenMesh,
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
