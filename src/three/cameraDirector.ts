import * as THREE from 'three';
import { GraphicsQualityTier } from '../game/types';
import { computeSafeBoardCameraPose } from '../game/visualTheme';

export const CINEMATIC_CAMERA_STORAGE_KEY = 'bt_vn_cinematic_camera';

export type CameraShotMode =
  | 'OVERVIEW'
  | 'ACTIVE_PLAYER_FOCUS'
  | 'DICE_FRAMING'
  | 'TOKEN_FOLLOW'
  | 'TRANSACTION_FRAMING'
  | 'LANDMARK_HERO'
  | 'SPECIAL_EVENT_FOCUS'
  | 'VICTORY_PODIUM'
  | 'USER_MANUAL_OVERRIDE';

export interface CameraPoint3 {
  x: number;
  y: number;
  z: number;
}

export interface CameraPoint2 {
  x: number;
  z: number;
}

export interface CameraDirectorHopInput {
  pos: CameraPoint3;
  nextPos: CameraPoint2 | null;
}

export interface CameraDirectorUpdateInput {
  visualAnimDt: number;
  viewportWidth: number;
  viewportHeight: number;
  cinematicEnabled: boolean;
  qualityTier: GraphicsQualityTier;
  reducedMotion: boolean;
  isPaused: boolean;
  isDiceRolling: boolean;
  activeHop: CameraDirectorHopInput | null;
  activePlayerPos: CameraPoint3 | null;
  getTileWorldPos: (tileIndex: number) => CameraPoint2 | null;
  cameraPos: THREE.Vector3;
  controlsTarget: THREE.Vector3;
}

export interface CameraDirectorUpdateResult {
  shot: CameraShotMode;
  isMoving: boolean;
  shakeMagnitude: number;
}

export interface CameraDirector {
  getActiveShot: () => CameraShotMode;
  isUserManualOverride: () => boolean;
  isUserDragging: () => boolean;
  onUserOrbitStart: (cameraPos?: THREE.Vector3, controlsTarget?: THREE.Vector3) => void;
  onUserOrbitEnd: () => void;
  onTurnChanged: (nextTurnCount: number) => void;
  onDiceRollStarted: () => void;
  onCinematicToggled: (enabled: boolean) => void;
  requestResetOverview: (cameraPos?: THREE.Vector3, controlsTarget?: THREE.Vector3) => void;
  setTransactionFocus: (tileIndex: number | null) => void;
  setBoardSelectionOverview: (active: boolean) => void;
  triggerLandmarkHero: (tileIndex: number) => void;
  triggerSpecialEventFocus: (
    tileIndex: number,
    opts?: { shake?: boolean; durationSec?: number }
  ) => void;
  setVictoryPodiumActive: (active: boolean) => void;
  clearPhaseFocus: () => void;
  cancelTransientShots: (cameraPos?: THREE.Vector3, controlsTarget?: THREE.Vector3) => void;
  snapToOverview: (
    viewportWidth: number,
    viewportHeight: number,
    cameraPos: THREE.Vector3,
    controlsTarget: THREE.Vector3
  ) => void;
  update: (input: CameraDirectorUpdateInput) => CameraDirectorUpdateResult;
}

const LOW_FOV_SCALE = 1.42;
const ACTIVE_IDLE_FOV_SCALE = 1.62;
const MAX_VISUAL_DT_SEC = 0.06;
const LANDMARK_HERO_DURATION_SEC = 1.1;
const SPECIAL_EVENT_DURATION_SEC = 0.9;
const POST_HOP_HOLD_DURATION_SEC = 0.9;
const MAX_MICRO_SHAKE_AMP = 0.065;
const MICRO_SHAKE_DURATION_SEC = 0.32;
const VICTORY_ORBIT_MAX_RAD = (12 * Math.PI) / 180;
const CONVERGE_SKIP_DIST_SQ = 1e-6;
const CONVERGE_SNAP_DIST_SQ = 0.0009;
const ACTIVE_MOTION_DIST_SQ = 0.0004;

/**
 * Loads the persisted smart-camera preference, defaulting to enabled (`true`)
 * so players immediately experience non-blocking Business Tour framing.
 */
export function loadSavedCinematicCameraPref(): boolean {
  if (typeof window === 'undefined') return true;
  try {
    const raw = window.localStorage?.getItem(CINEMATIC_CAMERA_STORAGE_KEY);
    if (raw === 'false' || raw === '0') return false;
    return true;
  } catch {
    return true;
  }
}

export function saveCinematicCameraPref(enabled: boolean): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage?.setItem(
      CINEMATIC_CAMERA_STORAGE_KEY,
      enabled ? 'true' : 'false'
    );
  } catch {
    // Ignore storage quota or security restrictions in sandboxed environments
  }
}

/**
 * Scales framing offsets outward on narrow mobile portrait screens so moving pawns
 * and properties stay clear of viewport edges and stacked HUD panels.
 */
export function computeCameraViewportScale(width: number, height: number): number {
  const safeW = Math.max(280, width || 1280);
  const safeH = Math.max(320, height || 800);
  const aspect = Math.max(0.34, safeW / safeH);
  return aspect < 0.85 ? Math.max(1.0, 0.92 / aspect) : 1.0;
}

/**
 * Computes a 0.85-unit look-ahead vector along the pawn's travel direction
 * so TOKEN_FOLLOW frames 2-3 upcoming tiles rather than lagging behind.
 */
export function computeTokenLeadVector(
  currPos: CameraPoint2,
  nextPos: CameraPoint2 | null
): CameraPoint2 {
  if (!nextPos) return { x: 0, z: 0 };
  const dx = nextPos.x - currPos.x;
  const dz = nextPos.z - currPos.z;
  const len = Math.hypot(dx, dz);
  if (len < 1e-4) return { x: 0, z: 0 };
  return {
    x: (dx / len) * 0.85,
    z: (dz / len) * 0.85,
  };
}

/**
 * Creates a non-blocking 9-shot CameraDirector state machine stepped strictly
 * by `visualAnimDt` inside the unified MonopolyCanvas render loop.
 */
export function createCameraDirector(): CameraDirector {
  let activeShot: CameraShotMode = 'OVERVIEW';
  let userManualOverride = false;
  let userDragging = false;
  let resettingToOverview = false;
  let holdOverviewAfterReset = false;
  let boardSelectionOverview = false;
  let victoryPodiumActive = false;
  let transactionTileIndex: number | null = null;
  let landmarkHeroTileIndex: number | null = null;
  let landmarkHeroRemainingSec = 0;
  let specialEventTileIndex: number | null = null;
  let specialEventRemainingSec = 0;
  let wasFollowingHop = false;
  let postHopHoldRemainingSec = 0;
  let victoryOrbitSec = 0;

  let shakeRemainingSec = 0;
  let shakeElapsedSec = 0;
  let shakeDurationSec = MICRO_SHAKE_DURATION_SEC;
  let shakeAmplitude = 0;
  const lastAppliedShakeOffset = new THREE.Vector3();

  // Pre-allocated scratch vectors (zero per-frame allocations)
  const desiredTarget = new THREE.Vector3();
  const desiredPos = new THREE.Vector3();
  const scratchOffset = new THREE.Vector3();
  const postHopLandingPos = new THREE.Vector3();

  const stripAppliedShake = (
    cameraPos?: THREE.Vector3,
    controlsTarget?: THREE.Vector3
  ): void => {
    if (
      lastAppliedShakeOffset.x === 0 &&
      lastAppliedShakeOffset.y === 0 &&
      lastAppliedShakeOffset.z === 0
    ) {
      return;
    }
    if (cameraPos) {
      cameraPos.sub(lastAppliedShakeOffset);
    }
    if (controlsTarget) {
      controlsTarget.sub(lastAppliedShakeOffset);
    }
    lastAppliedShakeOffset.set(0, 0, 0);
  };

  const resetShakeState = (
    cameraPos?: THREE.Vector3,
    controlsTarget?: THREE.Vector3
  ): void => {
    stripAppliedShake(cameraPos, controlsTarget);
    shakeRemainingSec = 0;
    shakeElapsedSec = 0;
    shakeAmplitude = 0;
  };

  const setScaledShotPose = (
    tx: number,
    ty: number,
    tz: number,
    dx: number,
    dy: number,
    dz: number,
    scale: number
  ): void => {
    desiredTarget.set(tx, ty, tz);
    desiredPos.set(tx + dx * scale, ty + dy * scale, tz + dz * scale);
  };

  const onUserOrbitStart = (
    cameraPos?: THREE.Vector3,
    controlsTarget?: THREE.Vector3
  ): void => {
    userDragging = true;
    userManualOverride = true;
    resettingToOverview = false;
    holdOverviewAfterReset = false;
    landmarkHeroRemainingSec = 0;
    landmarkHeroTileIndex = null;
    specialEventRemainingSec = 0;
    specialEventTileIndex = null;
    wasFollowingHop = false;
    postHopHoldRemainingSec = 0;
    resetShakeState(cameraPos, controlsTarget);
    activeShot = 'USER_MANUAL_OVERRIDE';
  };

  const onUserOrbitEnd = (): void => {
    userDragging = false;
  };

  const onTurnChanged = (_nextTurnCount: number): void => {
    // Only recover from manual orbit at a turn boundary if the user isn't actively holding the pointer
    if (!userDragging) {
      userManualOverride = false;
    }
    holdOverviewAfterReset = false;
    transactionTileIndex = null;
    wasFollowingHop = false;
    postHopHoldRemainingSec = 0;
  };

  const onDiceRollStarted = (): void => {
    // Never overwrite manual OrbitControls override during a dice roll in the same turn
    holdOverviewAfterReset = false;
    wasFollowingHop = false;
    postHopHoldRemainingSec = 0;
  };

  const onCinematicToggled = (enabled: boolean): void => {
    userManualOverride = false;
    holdOverviewAfterReset = false;
    if (!enabled) {
      resettingToOverview = true;
      landmarkHeroRemainingSec = 0;
      specialEventRemainingSec = 0;
      wasFollowingHop = false;
      postHopHoldRemainingSec = 0;
      resetShakeState();
    } else {
      resettingToOverview = false;
    }
  };

  const requestResetOverview = (
    cameraPos?: THREE.Vector3,
    controlsTarget?: THREE.Vector3
  ): void => {
    userManualOverride = false;
    resettingToOverview = true;
    holdOverviewAfterReset = true;
    landmarkHeroRemainingSec = 0;
    landmarkHeroTileIndex = null;
    specialEventRemainingSec = 0;
    specialEventTileIndex = null;
    wasFollowingHop = false;
    postHopHoldRemainingSec = 0;
    resetShakeState(cameraPos, controlsTarget);
  };

  const setTransactionFocus = (tileIndex: number | null): void => {
    transactionTileIndex = tileIndex;
    if (tileIndex !== null) {
      boardSelectionOverview = false;
      postHopHoldRemainingSec = 0;
    }
  };

  const setBoardSelectionOverview = (active: boolean): void => {
    boardSelectionOverview = active;
    if (active) {
      transactionTileIndex = null;
      postHopHoldRemainingSec = 0;
    }
  };

  const triggerLandmarkHero = (tileIndex: number): void => {
    landmarkHeroTileIndex = tileIndex;
    landmarkHeroRemainingSec = LANDMARK_HERO_DURATION_SEC;
    holdOverviewAfterReset = false;
  };

  const triggerSpecialEventFocus = (
    tileIndex: number,
    opts?: { shake?: boolean; durationSec?: number }
  ): void => {
    specialEventTileIndex = tileIndex;
    specialEventRemainingSec = Math.max(
      0.1,
      opts?.durationSec ?? SPECIAL_EVENT_DURATION_SEC
    );
    holdOverviewAfterReset = false;
    if (opts?.shake) {
      shakeDurationSec = MICRO_SHAKE_DURATION_SEC;
      shakeRemainingSec = MICRO_SHAKE_DURATION_SEC;
      shakeElapsedSec = 0;
      shakeAmplitude = MAX_MICRO_SHAKE_AMP;
    }
  };

  const setVictoryPodiumActive = (active: boolean): void => {
    victoryPodiumActive = active;
    if (active) {
      victoryOrbitSec = 0;
      holdOverviewAfterReset = false;
      boardSelectionOverview = false;
    } else {
      resetShakeState();
    }
  };

  const clearPhaseFocus = (): void => {
    transactionTileIndex = null;
    boardSelectionOverview = false;
    victoryPodiumActive = false;
  };

  const cancelTransientShots = (
    cameraPos?: THREE.Vector3,
    controlsTarget?: THREE.Vector3
  ): void => {
    landmarkHeroRemainingSec = 0;
    landmarkHeroTileIndex = null;
    specialEventRemainingSec = 0;
    specialEventTileIndex = null;
    wasFollowingHop = false;
    postHopHoldRemainingSec = 0;
    transactionTileIndex = null;
    boardSelectionOverview = false;
    victoryPodiumActive = false;
    resettingToOverview = false;
    holdOverviewAfterReset = false;
    resetShakeState(cameraPos, controlsTarget);
  };

  const snapToOverview = (
    viewportWidth: number,
    viewportHeight: number,
    cameraPos: THREE.Vector3,
    controlsTarget: THREE.Vector3
  ): void => {
    resetShakeState(cameraPos, controlsTarget);
    const pose = computeSafeBoardCameraPose(viewportWidth, viewportHeight);
    cameraPos.set(pose.posX, pose.posY, pose.posZ);
    controlsTarget.set(pose.targetX, pose.targetY, pose.targetZ);
    resettingToOverview = false;
    activeShot = 'OVERVIEW';
  };

  const update = (
    input: CameraDirectorUpdateInput
  ): CameraDirectorUpdateResult => {
    const {
      visualAnimDt,
      viewportWidth,
      viewportHeight,
      cinematicEnabled,
      qualityTier,
      reducedMotion,
      isPaused,
      isDiceRolling,
      activeHop,
      activePlayerPos,
      getTileWorldPos,
      cameraPos,
      controlsTarget,
    } = input;

    // Remove the previous frame's micro-shake before evaluating lerp or manual override so zero drift accrues
    stripAppliedShake(cameraPos, controlsTarget);

    if (userManualOverride) {
      shakeRemainingSec = 0;
      shakeAmplitude = 0;
      activeShot = 'USER_MANUAL_OVERRIDE';
      return { shot: 'USER_MANUAL_OVERRIDE', isMoving: false, shakeMagnitude: 0 };
    }

    const dt = isPaused
      ? 0
      : Math.min(Math.max(0, visualAnimDt), MAX_VISUAL_DT_SEC);

    if (dt > 0) {
      if (landmarkHeroRemainingSec > 0) {
        landmarkHeroRemainingSec = Math.max(0, landmarkHeroRemainingSec - dt);
        if (landmarkHeroRemainingSec === 0) {
          landmarkHeroTileIndex = null;
        }
      }
      if (specialEventRemainingSec > 0) {
        specialEventRemainingSec = Math.max(0, specialEventRemainingSec - dt);
        if (specialEventRemainingSec === 0) {
          specialEventTileIndex = null;
        }
      }
      if (postHopHoldRemainingSec > 0) {
        postHopHoldRemainingSec = Math.max(0, postHopHoldRemainingSec - dt);
      }
      if (victoryPodiumActive && !reducedMotion && qualityTier !== 'low') {
        victoryOrbitSec += dt;
      }
    }

    const viewportScale = computeCameraViewportScale(viewportWidth, viewportHeight);
    const allowDynamicShots =
      cinematicEnabled && qualityTier !== 'low' && !reducedMotion;

    if (activeHop !== null) {
      wasFollowingHop = true;
      postHopHoldRemainingSec = 0;
      const landingAnchor = activeHop.nextPos ?? activeHop.pos;
      postHopLandingPos.set(landingAnchor.x, 0, landingAnchor.z);
    } else if (wasFollowingHop) {
      wasFollowingHop = false;
      if (
        allowDynamicShots &&
        transactionTileIndex === null &&
        !boardSelectionOverview &&
        !resettingToOverview
      ) {
        postHopHoldRemainingSec = POST_HOP_HOLD_DURATION_SEC;
      }
    }

    let shot: CameraShotMode = 'OVERVIEW';
    let dampLambda = 4.0;

    if (!allowDynamicShots) {
      if (victoryPodiumActive && !resettingToOverview) {
        shot = 'VICTORY_PODIUM';
        dampLambda = 2.8;
      } else {
        shot = 'OVERVIEW';
        dampLambda = resettingToOverview ? 7.0 : 4.0;
      }
    } else if (resettingToOverview) {
      shot = 'OVERVIEW';
      dampLambda = 7.0;
    } else if (victoryPodiumActive) {
      shot = 'VICTORY_PODIUM';
      dampLambda = 2.8;
    } else if (landmarkHeroRemainingSec > 0 && landmarkHeroTileIndex !== null) {
      shot = 'LANDMARK_HERO';
      dampLambda = 4.6;
    } else if (specialEventRemainingSec > 0 && specialEventTileIndex !== null) {
      shot = 'SPECIAL_EVENT_FOCUS';
      dampLambda = 5.2;
    } else if (activeHop !== null) {
      shot = 'TOKEN_FOLLOW';
      dampLambda = 5.4;
    } else if (isDiceRolling) {
      shot = 'DICE_FRAMING';
      dampLambda = 4.8;
    } else if (boardSelectionOverview || holdOverviewAfterReset) {
      shot = 'OVERVIEW';
      dampLambda = boardSelectionOverview ? 5.5 : 4.0;
    } else if (transactionTileIndex !== null || postHopHoldRemainingSec > 0) {
      shot = 'TRANSACTION_FRAMING';
      dampLambda = 4.2;
    } else if (activePlayerPos !== null) {
      shot = 'ACTIVE_PLAYER_FOCUS';
      dampLambda = 3.6;
    }

    // Resolve desired target & camera position for the chosen shot
    if (shot === 'OVERVIEW') {
      const safePose = computeSafeBoardCameraPose(viewportWidth, viewportHeight);
      desiredTarget.set(safePose.targetX, safePose.targetY, safePose.targetZ);
      desiredPos.set(safePose.posX, safePose.posY, safePose.posZ);
    } else if (shot === 'ACTIVE_PLAYER_FOCUS' && activePlayerPos) {
      setScaledShotPose(
        activePlayerPos.x * 0.36,
        -0.1,
        activePlayerPos.z * 0.36,
        11.2,
        12.4,
        11.2,
        ACTIVE_IDLE_FOV_SCALE * viewportScale
      );
    } else if (shot === 'DICE_FRAMING') {
      setScaledShotPose(
        0,
        0.18,
        0,
        9.8,
        11.2,
        9.8,
        LOW_FOV_SCALE * viewportScale
      );
    } else if (shot === 'TOKEN_FOLLOW' && activeHop) {
      const lead = computeTokenLeadVector(
        { x: activeHop.pos.x, z: activeHop.pos.z },
        activeHop.nextPos
      );
      setScaledShotPose(
        (activeHop.pos.x + lead.x) * 0.78,
        0.12,
        (activeHop.pos.z + lead.z) * 0.78,
        9.2,
        10.2,
        9.2,
        LOW_FOV_SCALE * viewportScale
      );
    } else if (shot === 'TRANSACTION_FRAMING') {
      const tilePos =
        transactionTileIndex !== null
          ? getTileWorldPos(transactionTileIndex)
          : postHopLandingPos;
      if (tilePos) {
        setScaledShotPose(
          tilePos.x * 0.74,
          0.2,
          tilePos.z * 0.74,
          9.6,
          10.6,
          9.6,
          LOW_FOV_SCALE * viewportScale
        );
      } else {
        const safePose = computeSafeBoardCameraPose(viewportWidth, viewportHeight);
        desiredTarget.set(safePose.targetX, safePose.targetY, safePose.targetZ);
        desiredPos.set(safePose.posX, safePose.posY, safePose.posZ);
        shot = 'OVERVIEW';
      }
    } else if (shot === 'LANDMARK_HERO' && landmarkHeroTileIndex !== null) {
      const tilePos = getTileWorldPos(landmarkHeroTileIndex);
      if (tilePos) {
        setScaledShotPose(
          tilePos.x * 0.84,
          0.42,
          tilePos.z * 0.84,
          7.8,
          7.6,
          7.8,
          LOW_FOV_SCALE * viewportScale
        );
      } else {
        const safePose = computeSafeBoardCameraPose(viewportWidth, viewportHeight);
        desiredTarget.set(safePose.targetX, safePose.targetY, safePose.targetZ);
        desiredPos.set(safePose.posX, safePose.posY, safePose.posZ);
        shot = 'OVERVIEW';
      }
    } else if (shot === 'SPECIAL_EVENT_FOCUS' && specialEventTileIndex !== null) {
      const tilePos = getTileWorldPos(specialEventTileIndex);
      if (tilePos) {
        setScaledShotPose(
          tilePos.x * 0.78,
          0.18,
          tilePos.z * 0.78,
          8.8,
          9.6,
          8.8,
          LOW_FOV_SCALE * viewportScale
        );
      } else {
        const safePose = computeSafeBoardCameraPose(viewportWidth, viewportHeight);
        desiredTarget.set(safePose.targetX, safePose.targetY, safePose.targetZ);
        desiredPos.set(safePose.posX, safePose.posY, safePose.posZ);
        shot = 'OVERVIEW';
      }
    } else if (shot === 'VICTORY_PODIUM') {
      const vicScale = LOW_FOV_SCALE * viewportScale;
      const orbitAngle =
        reducedMotion || qualityTier === 'low'
          ? 0
          : Math.sin(victoryOrbitSec * 0.45) * VICTORY_ORBIT_MAX_RAD;
      const cosA = Math.cos(orbitAngle);
      const sinA = Math.sin(orbitAngle);
      const baseX = 9.4 * vicScale;
      const baseY = 8.2 * vicScale;
      const baseZ = 9.4 * vicScale;
      desiredTarget.set(0, 0.55, 0);
      scratchOffset.set(
        baseX * cosA - baseZ * sinA,
        baseY,
        baseX * sinA + baseZ * cosA
      );
      desiredPos.copy(desiredTarget).add(scratchOffset);
    } else {
      const safePose = computeSafeBoardCameraPose(viewportWidth, viewportHeight);
      desiredTarget.set(safePose.targetX, safePose.targetY, safePose.targetZ);
      desiredPos.set(safePose.posX, safePose.posY, safePose.posZ);
      shot = 'OVERVIEW';
    }

    activeShot = shot;

    const posDistSq = cameraPos.distanceToSquared(desiredPos);
    const tgtDistSq = controlsTarget.distanceToSquared(desiredTarget);
    const victoryActivelyOrbiting =
      shot === 'VICTORY_PODIUM' &&
      !reducedMotion &&
      qualityTier !== 'low' &&
      !isPaused;

    let isMoving = false;
    if (posDistSq <= CONVERGE_SKIP_DIST_SQ && tgtDistSq <= CONVERGE_SKIP_DIST_SQ) {
      resettingToOverview = false;
      isMoving = victoryActivelyOrbiting;
    } else if (posDistSq < CONVERGE_SNAP_DIST_SQ && tgtDistSq < CONVERGE_SNAP_DIST_SQ) {
      cameraPos.copy(desiredPos);
      controlsTarget.copy(desiredTarget);
      resettingToOverview = false;
      isMoving = victoryActivelyOrbiting;
    } else if (dt > 0) {
      const alpha = 1 - Math.exp(-dampLambda * dt);
      cameraPos.lerp(desiredPos, alpha);
      controlsTarget.lerp(desiredTarget, alpha);
      isMoving =
        victoryActivelyOrbiting ||
        cameraPos.distanceToSquared(desiredPos) > ACTIVE_MOTION_DIST_SQ ||
        controlsTarget.distanceToSquared(desiredTarget) > ACTIVE_MOTION_DIST_SQ;
    }

    // Bounded earthquake micro-shake (strictly <= 0.065 world units over 320ms, zero on low/reducedMotion)
    let shakeMagnitude = 0;
    if (shakeRemainingSec > 0) {
      if (reducedMotion || qualityTier === 'low' || !cinematicEnabled) {
        shakeRemainingSec = 0;
        shakeAmplitude = 0;
      } else if (dt > 0) {
        shakeElapsedSec += dt;
        shakeRemainingSec = Math.max(0, shakeDurationSec - shakeElapsedSec);
        if (shakeRemainingSec > 0) {
          const decay = shakeRemainingSec / shakeDurationSec;
          const amp = Math.min(MAX_MICRO_SHAKE_AMP, shakeAmplitude) * decay;
          const dirX = Math.sin(shakeElapsedSec * 68);
          const dirY = Math.cos(shakeElapsedSec * 91) * 0.45;
          const dirZ = Math.sin(shakeElapsedSec * 79 + 1.1);
          const dirLen = Math.hypot(dirX, dirY, dirZ) || 1;
          lastAppliedShakeOffset.set(
            (dirX / dirLen) * amp,
            (dirY / dirLen) * amp,
            (dirZ / dirLen) * amp
          );
          cameraPos.add(lastAppliedShakeOffset);
          controlsTarget.add(lastAppliedShakeOffset);
          shakeMagnitude = lastAppliedShakeOffset.length();
          isMoving = true;
        } else {
          shakeAmplitude = 0;
        }
      }
    }

    return {
      shot,
      isMoving,
      shakeMagnitude,
    };
  };

  return {
    getActiveShot: () => activeShot,
    isUserManualOverride: () => userManualOverride,
    isUserDragging: () => userDragging,
    onUserOrbitStart,
    onUserOrbitEnd,
    onTurnChanged,
    onDiceRollStarted,
    onCinematicToggled,
    requestResetOverview,
    setTransactionFocus,
    setBoardSelectionOverview,
    triggerLandmarkHero,
    triggerSpecialEventFocus,
    setVictoryPodiumActive,
    clearPhaseFocus,
    cancelTransientShots,
    snapToOverview,
    update,
  };
}
