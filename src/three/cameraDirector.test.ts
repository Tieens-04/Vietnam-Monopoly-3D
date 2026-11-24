import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { computeSafeBoardCameraPose } from '../game/visualTheme';
import {
  CINEMATIC_CAMERA_STORAGE_KEY,
  computeCameraViewportScale,
  computeTokenLeadVector,
  createCameraDirector,
  loadSavedCinematicCameraPref,
  saveCinematicCameraPref,
} from './cameraDirector';

const TILE_POSITIONS: Record<number, { x: number; z: number }> = {
  0: { x: 8, z: 8 },
  1: { x: 6, z: 8 },
  2: { x: 4, z: 8 },
  3: { x: 2, z: 8 },
  8: { x: -8, z: 8 },
  16: { x: -8, z: -8 },
  24: { x: 8, z: -8 },
};

function getTileWorldPos(tileIndex: number): { x: number; z: number } | null {
  return TILE_POSITIONS[tileIndex] ?? { x: (tileIndex % 8) - 4, z: Math.floor(tileIndex / 8) - 2 };
}

function stepMany(
  director: ReturnType<typeof createCameraDirector>,
  steps: number,
  dtSec: number,
  params: Omit<Parameters<ReturnType<typeof createCameraDirector>['update']>[0], 'visualAnimDt'>
) {
  let last = director.update({ ...params, visualAnimDt: 0 });
  for (let i = 0; i < steps; i++) {
    last = director.update({ ...params, visualAnimDt: dtSec });
  }
  return last;
}

function createOverviewStartState(width = 1280, height = 800) {
  const pose = computeSafeBoardCameraPose(width, height);
  return {
    cameraPos: new THREE.Vector3(pose.posX, pose.posY, pose.posZ),
    controlsTarget: new THREE.Vector3(pose.targetX, pose.targetY, pose.targetZ),
  };
}

test('AT-UNIT-05a: cinematic camera persistence defaults to true and handles storage safely', () => {
  const prevWindow = (globalThis as { window?: unknown }).window;
  try {
    // Missing window -> defaults to true
    delete (globalThis as { window?: unknown }).window;
    assert.equal(loadSavedCinematicCameraPref(), true);
    assert.doesNotThrow(() => saveCinematicCameraPref(false));

    // Mock localStorage
    const store = new Map<string, string>();
    (globalThis as { window?: unknown }).window = {
      localStorage: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, val: string) => {
          store.set(key, val);
        },
      },
    };

    assert.equal(loadSavedCinematicCameraPref(), true);
    saveCinematicCameraPref(false);
    assert.equal(store.get(CINEMATIC_CAMERA_STORAGE_KEY), 'false');
    assert.equal(loadSavedCinematicCameraPref(), false);

    store.set(CINEMATIC_CAMERA_STORAGE_KEY, '0');
    assert.equal(loadSavedCinematicCameraPref(), false);

    saveCinematicCameraPref(true);
    assert.equal(store.get(CINEMATIC_CAMERA_STORAGE_KEY), 'true');
    assert.equal(loadSavedCinematicCameraPref(), true);

    // Throwing storage -> safe fallback to true without throwing
    (globalThis as { window?: unknown }).window = {
      localStorage: {
        getItem: () => {
          throw new Error('SecurityError');
        },
        setItem: () => {
          throw new Error('QuotaExceededError');
        },
      },
    };
    assert.equal(loadSavedCinematicCameraPref(), true);
    assert.doesNotThrow(() => saveCinematicCameraPref(false));
  } finally {
    if (prevWindow === undefined) {
      delete (globalThis as { window?: unknown }).window;
    } else {
      (globalThis as { window?: unknown }).window = prevWindow;
    }
  }
});

test('AT-UNIT-05b: shot priority, lead vector, responsive viewportScale, and timed Landmark/Event holds', () => {
  const director = createCameraDirector();
  const { cameraPos, controlsTarget } = createOverviewStartState(1280, 800);

  // Desktop vs mobile portrait viewportScale
  assert.equal(computeCameraViewportScale(1280, 800), 1.0);
  const mobileScale = computeCameraViewportScale(390, 844);
  assert.ok(Math.abs(mobileScale - 0.92 / (390 / 844)) < 1e-6);

  // Lead vector calculation (0.85 world units ahead along travel axis)
  const lead = computeTokenLeadVector({ x: 8, z: 8 }, { x: 4, z: 8 });
  assert.ok(Math.abs(lead.x - -0.85) < 1e-6);
  assert.ok(Math.abs(lead.z) < 1e-6);
  assert.deepEqual(computeTokenLeadVector({ x: 8, z: 8 }, { x: 8, z: 8 }), { x: 0, z: 0 });
  assert.deepEqual(computeTokenLeadVector({ x: 8, z: 8 }, null), { x: 0, z: 0 });

  const baseParams = {
    viewportWidth: 1280,
    viewportHeight: 800,
    cinematicEnabled: true,
    qualityTier: 'high' as const,
    reducedMotion: false,
    isPaused: false,
    isDiceRolling: false,
    activeHop: null,
    activePlayerPos: { x: 8, y: 0.44, z: 8 },
    getTileWorldPos,
    cameraPos,
    controlsTarget,
  };

  // 1. ACTIVE_PLAYER_FOCUS (target leans 0.36x toward player tile)
  const activeRes = stepMany(director, 120, 1 / 60, baseParams);
  assert.equal(activeRes.shot, 'ACTIVE_PLAYER_FOCUS');
  assert.ok(Math.abs(controlsTarget.x - 8 * 0.36) < 0.05);
  assert.ok(Math.abs(controlsTarget.z - 8 * 0.36) < 0.05);

  // 2. DICE_FRAMING
  const diceRes = stepMany(director, 120, 1 / 60, {
    ...baseParams,
    isDiceRolling: true,
  });
  assert.equal(diceRes.shot, 'DICE_FRAMING');
  assert.ok(controlsTarget.distanceTo(new THREE.Vector3(0, 0.18, 0)) < 0.05);

  // 3. TOKEN_FOLLOW with leadVec
  const hopRes = stepMany(director, 120, 1 / 60, {
    ...baseParams,
    activeHop: {
      pos: { x: 6, y: 0.44, z: 8 },
      nextPos: { x: 2, z: 8 },
    },
  });
  assert.equal(hopRes.shot, 'TOKEN_FOLLOW');
  assert.ok(Math.abs(controlsTarget.x - (6 - 0.85) * 0.78) < 0.05);
  assert.ok(Math.abs(controlsTarget.z - 8 * 0.78) < 0.05);

  // Portrait scaling pushes camera offset outward by mobileScale
  const portraitCam = cameraPos.clone();
  const portraitTgt = controlsTarget.clone();
  const portraitRes = stepMany(director, 150, 1 / 60, {
    ...baseParams,
    viewportWidth: 390,
    viewportHeight: 844,
    activeHop: {
      pos: { x: 6, y: 0.44, z: 8 },
      nextPos: { x: 2, z: 8 },
    },
    cameraPos: portraitCam,
    controlsTarget: portraitTgt,
  });
  assert.equal(portraitRes.shot, 'TOKEN_FOLLOW');
  const desktopOffset = cameraPos.clone().sub(controlsTarget);
  const portraitOffset = portraitCam.clone().sub(portraitTgt);
  assert.ok(portraitOffset.length() > desktopOffset.length() * 1.85);

  // 3b. Post-hop landing hold bridges TOKEN_FOLLOW -> TRANSACTION_FRAMING without pullback whiplash
  const postHopHoldRes = stepMany(director, 12, 0.05, baseParams); // 0.60s < 0.90s hold
  assert.equal(postHopHoldRes.shot, 'TRANSACTION_FRAMING');
  assert.ok(Math.abs(controlsTarget.x - 2 * 0.74) < 0.25);
  assert.ok(Math.abs(controlsTarget.z - 8 * 0.74) < 0.25);

  // 4. TRANSACTION_FRAMING
  director.setTransactionFocus(3);
  const txRes = stepMany(director, 120, 1 / 60, baseParams);
  assert.equal(txRes.shot, 'TRANSACTION_FRAMING');
  assert.ok(Math.abs(controlsTarget.x - 2 * 0.74) < 0.05);
  assert.ok(Math.abs(controlsTarget.z - 8 * 0.74) < 0.05);

  // 5. LANDMARK_HERO holds for 1.1s then returns to transaction/active focus
  director.triggerLandmarkHero(3);
  const heroDuring = stepMany(director, 20, 0.05, baseParams); // 1.00s < 1.10s
  assert.equal(heroDuring.shot, 'LANDMARK_HERO');
  const heroAfter = stepMany(director, 4, 0.05, baseParams); // 1.20s > 1.10s
  assert.equal(heroAfter.shot, 'TRANSACTION_FRAMING');
  director.setTransactionFocus(null);

  // 6. SPECIAL_EVENT_FOCUS holds for 0.9s then returns
  director.triggerSpecialEventFocus(8, { shake: false });
  const evtDuring = stepMany(director, 16, 0.05, baseParams); // 0.80s < 0.90s
  assert.equal(evtDuring.shot, 'SPECIAL_EVENT_FOCUS');
  const evtAfter = stepMany(director, 4, 0.05, baseParams); // 1.00s > 0.90s
  assert.equal(evtAfter.shot, 'ACTIVE_PLAYER_FOCUS');

  // 7. VICTORY_PODIUM orbits smoothly within +/-12 deg
  director.setVictoryPodiumActive(true);
  const vicStart = stepMany(director, 1, 0.05, baseParams);
  assert.equal(vicStart.shot, 'VICTORY_PODIUM');
  const angleSamples: number[] = [];
  for (let i = 0; i < 60; i++) {
    const res = director.update({ ...baseParams, visualAnimDt: 0.05 });
    assert.equal(res.shot, 'VICTORY_PODIUM');
    const off = cameraPos.clone().sub(controlsTarget);
    const angleDeg = (Math.atan2(off.z, off.x) * 180) / Math.PI;
    angleSamples.push(angleDeg);
  }
  const minAngle = Math.min(...angleSamples);
  const maxAngle = Math.max(...angleSamples);
  assert.ok(maxAngle - minAngle > 1.5, 'Victory podium should gently orbit when motion allowed');
  assert.ok(minAngle >= 45 - 13 && maxAngle <= 45 + 13, `Orbit exceeded +-12 deg bounds: [${minAngle}, ${maxAngle}]`);
});

test('AT-UNIT-05c: manual OrbitControls override persists across dice/hop and recovers on turn boundary or reset', () => {
  const director = createCameraDirector();
  const cameraPos = new THREE.Vector3(14, 18, 22);
  const controlsTarget = new THREE.Vector3(1.5, 0.2, -1.2);
  const savedPos = cameraPos.clone();
  const savedTarget = controlsTarget.clone();

  const params = {
    viewportWidth: 1280,
    viewportHeight: 800,
    cinematicEnabled: true,
    qualityTier: 'medium' as const,
    reducedMotion: false,
    isPaused: false,
    isDiceRolling: false,
    activeHop: null,
    activePlayerPos: { x: 8, y: 0.44, z: 8 },
    getTileWorldPos,
    cameraPos,
    controlsTarget,
  };

  director.onUserOrbitStart(cameraPos, controlsTarget);
  assert.equal(director.isUserManualOverride(), true);
  assert.equal(director.isUserDragging(), true);

  // User finishes dragging but stays on turn 1: rolling dice & hopping must NOT clear override!
  director.onUserOrbitEnd();
  assert.equal(director.isUserDragging(), false);
  director.onDiceRollStarted();

  const resDuringDice = stepMany(director, 30, 1 / 60, {
    ...params,
    isDiceRolling: true,
  });
  assert.equal(resDuringDice.shot, 'USER_MANUAL_OVERRIDE');
  assert.equal(resDuringDice.isMoving, false);
  assert.equal(cameraPos.distanceTo(savedPos), 0);
  assert.equal(controlsTarget.distanceTo(savedTarget), 0);

  const resDuringHop = stepMany(director, 30, 1 / 60, {
    ...params,
    activeHop: { pos: { x: 6, y: 0.44, z: 8 }, nextPos: { x: 2, z: 8 } },
  });
  assert.equal(resDuringHop.shot, 'USER_MANUAL_OVERRIDE');
  assert.equal(cameraPos.distanceTo(savedPos), 0);

  // Turn boundary while STILL dragging must NOT steal camera
  director.onUserOrbitStart(cameraPos, controlsTarget);
  director.onTurnChanged(2);
  assert.equal(director.isUserManualOverride(), true);

  // Turn boundary after drag ends DOES recover smoothly
  director.onUserOrbitEnd();
  director.onTurnChanged(3);
  assert.equal(director.isUserManualOverride(), false);
  const resAfterTurn = director.update({ ...params, visualAnimDt: 1 / 60 });
  assert.equal(resAfterTurn.shot, 'ACTIVE_PLAYER_FOCUS');

  // Re-enter override then Reset Overview -> smoothly returns to OVERVIEW and holds until next turn/roll
  director.onUserOrbitStart(cameraPos, controlsTarget);
  director.onUserOrbitEnd();
  director.requestResetOverview(cameraPos, controlsTarget);
  assert.equal(director.isUserManualOverride(), false);
  const resetPose = stepMany(director, 150, 1 / 60, params);
  assert.equal(resetPose.shot, 'OVERVIEW');
  const safePose = computeSafeBoardCameraPose(1280, 800);
  assert.ok(cameraPos.distanceTo(new THREE.Vector3(safePose.posX, safePose.posY, safePose.posZ)) < 0.05);

  // Remains in OVERVIEW until next roll or next turn
  const stillOverview = director.update({ ...params, visualAnimDt: 1 / 60 });
  assert.equal(stillOverview.shot, 'OVERVIEW');
  director.onDiceRollStarted();
  const afterRollStart = director.update({ ...params, isDiceRolling: true, visualAnimDt: 1 / 60 });
  assert.equal(afterRollStart.shot, 'DICE_FRAMING');
});

test('AT-UNIT-05d: Low quality tier preserves 0 FPS idle and reducedMotion disables shakes & victory orbit', () => {
  const director = createCameraDirector();
  const { cameraPos, controlsTarget } = createOverviewStartState(1280, 800);
  const initialPos = cameraPos.clone();
  const initialTarget = controlsTarget.clone();

  director.triggerLandmarkHero(3);
  director.triggerSpecialEventFocus(8, { shake: true });

  const lowRes = director.update({
    visualAnimDt: 0.016,
    viewportWidth: 1280,
    viewportHeight: 800,
    cinematicEnabled: true,
    qualityTier: 'low',
    reducedMotion: false,
    isPaused: false,
    isDiceRolling: true,
    activeHop: { pos: { x: 6, y: 0.44, z: 8 }, nextPos: { x: 2, z: 8 } },
    activePlayerPos: { x: 6, y: 0.44, z: 8 },
    getTileWorldPos,
    cameraPos,
    controlsTarget,
  });

  assert.equal(lowRes.shot, 'OVERVIEW');
  assert.equal(lowRes.isMoving, false);
  assert.equal(lowRes.shakeMagnitude, 0);
  assert.equal(cameraPos.x, initialPos.x);
  assert.equal(cameraPos.y, initialPos.y);
  assert.equal(cameraPos.z, initialPos.z);
  assert.equal(controlsTarget.x, initialTarget.x);
  assert.equal(controlsTarget.y, initialTarget.y);
  assert.equal(controlsTarget.z, initialTarget.z);

  // Reduced motion on High tier: overview during normal turns, zero shake, static victory podium
  const rmRes = director.update({
    visualAnimDt: 0.016,
    viewportWidth: 1280,
    viewportHeight: 800,
    cinematicEnabled: true,
    qualityTier: 'high',
    reducedMotion: true,
    isPaused: false,
    isDiceRolling: true,
    activeHop: null,
    activePlayerPos: { x: 6, y: 0.44, z: 8 },
    getTileWorldPos,
    cameraPos,
    controlsTarget,
  });
  assert.equal(rmRes.shot, 'OVERVIEW');
  assert.equal(rmRes.shakeMagnitude, 0);

  director.setVictoryPodiumActive(true);
  stepMany(director, 180, 0.05, {
    viewportWidth: 1280,
    viewportHeight: 800,
    cinematicEnabled: true,
    qualityTier: 'high',
    reducedMotion: true,
    isPaused: false,
    isDiceRolling: false,
    activeHop: null,
    activePlayerPos: null,
    getTileWorldPos,
    cameraPos,
    controlsTarget,
  });
  const settledOff = cameraPos.clone().sub(controlsTarget);
  const angleBefore = Math.atan2(settledOff.z, settledOff.x);
  const postRes = director.update({
    visualAnimDt: 0.05,
    viewportWidth: 1280,
    viewportHeight: 800,
    cinematicEnabled: true,
    qualityTier: 'high',
    reducedMotion: true,
    isPaused: false,
    isDiceRolling: false,
    activeHop: null,
    activePlayerPos: null,
    getTileWorldPos,
    cameraPos,
    controlsTarget,
  });
  const settledOffAfter = cameraPos.clone().sub(controlsTarget);
  const angleAfter = Math.atan2(settledOffAfter.z, settledOffAfter.x);
  assert.equal(postRes.shot, 'VICTORY_PODIUM');
  assert.equal(postRes.isMoving, false);
  assert.ok(Math.abs(angleAfter - angleBefore) < 1e-6);
});

test('AT-UNIT-05e: earthquake micro-shake <= 0.065 units for 320ms with zero drift, and FPS invariance', () => {
  const director = createCameraDirector();
  const { cameraPos, controlsTarget } = createOverviewStartState(1280, 800);
  const steadyCam = cameraPos.clone();
  const steadyTgt = controlsTarget.clone();

  // Trigger quake shake on Overview (cinematic disabled on Medium) to isolate exact shake delta
  director.triggerSpecialEventFocus(8, { shake: true });

  let maxObservedShake = 0;
  for (let i = 0; i < 40; i++) {
    const res = director.update({
      visualAnimDt: 0.016,
      viewportWidth: 1280,
      viewportHeight: 800,
      cinematicEnabled: true,
      qualityTier: 'high',
      reducedMotion: false,
      isPaused: false,
      isDiceRolling: false,
      activeHop: null,
      activePlayerPos: { x: 8, y: 0.44, z: 8 },
      getTileWorldPos,
      cameraPos,
      controlsTarget,
    });
    assert.ok(
      res.shakeMagnitude <= 0.065 + 1e-9,
      `Micro-shake magnitude ${res.shakeMagnitude} exceeded 0.065`
    );
    maxObservedShake = Math.max(maxObservedShake, res.shakeMagnitude);
  }
  assert.ok(maxObservedShake > 0.01, 'Micro-shake must be active right after quake trigger');

  // After 0.64s (> 0.32s), shake magnitude is exact 0
  const postQuake = director.update({
    visualAnimDt: 0.016,
    viewportWidth: 1280,
    viewportHeight: 800,
    cinematicEnabled: true,
    qualityTier: 'high',
    reducedMotion: false,
    isPaused: false,
    isDiceRolling: false,
    activeHop: null,
    activePlayerPos: { x: 8, y: 0.44, z: 8 },
    getTileWorldPos,
    cameraPos,
    controlsTarget,
  });
  assert.equal(postQuake.shakeMagnitude, 0);

  // Also test zero residual drift when converged on Overview + shake added & removed
  const shakeOnlyDirector = createCameraDirector();
  shakeOnlyDirector.triggerSpecialEventFocus(8, { shake: true });
  // Cancel overview target bias by calling on high with cinematicEnabled=false? No, special_event only activates when cinematicEnabled=true.
  // Verify exact zero drift by returning to OVERVIEW after shake finishes:
  shakeOnlyDirector.requestResetOverview();
  stepMany(shakeOnlyDirector, 240, 1 / 60, {
    viewportWidth: 1280,
    viewportHeight: 800,
    cinematicEnabled: true,
    qualityTier: 'high',
    reducedMotion: false,
    isPaused: false,
    isDiceRolling: false,
    activeHop: null,
    activePlayerPos: null,
    getTileWorldPos,
    cameraPos: steadyCam,
    controlsTarget: steadyTgt,
  });
  const safePose = computeSafeBoardCameraPose(1280, 800);
  assert.ok(steadyCam.distanceTo(new THREE.Vector3(safePose.posX, safePose.posY, safePose.posZ)) < 1e-5);
  assert.ok(steadyTgt.distanceTo(new THREE.Vector3(safePose.targetX, safePose.targetY, safePose.targetZ)) < 1e-5);

  // Critically-damped exponential FPS invariance: 60 * (1/60s) vs 20 * (1/20s) = 1.0s
  const dir60 = createCameraDirector();
  const dir20 = createCameraDirector();
  const cam60 = new THREE.Vector3(24, 24, 24);
  const tgt60 = new THREE.Vector3(0, 0, 0);
  const cam20 = cam60.clone();
  const tgt20 = tgt60.clone();

  stepMany(dir60, 60, 1 / 60, {
    viewportWidth: 1280,
    viewportHeight: 800,
    cinematicEnabled: true,
    qualityTier: 'high',
    reducedMotion: false,
    isPaused: false,
    isDiceRolling: true,
    activeHop: null,
    activePlayerPos: null,
    getTileWorldPos,
    cameraPos: cam60,
    controlsTarget: tgt60,
  });
  stepMany(dir20, 20, 1 / 20, {
    viewportWidth: 1280,
    viewportHeight: 800,
    cinematicEnabled: true,
    qualityTier: 'high',
    reducedMotion: false,
    isPaused: false,
    isDiceRolling: true,
    activeHop: null,
    activePlayerPos: null,
    getTileWorldPos,
    cameraPos: cam20,
    controlsTarget: tgt20,
  });

  assert.ok(cam60.distanceTo(cam20) < 1e-4, `60fps vs 20fps diverged: ${cam60.distanceTo(cam20)}`);
  assert.ok(tgt60.distanceTo(tgt20) < 1e-4);
});
