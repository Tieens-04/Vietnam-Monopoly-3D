import * as CANNON from 'cannon-es';
import * as THREE from 'three';
import { DICE_BOX_FACE_VALUES } from '../game/rules';

export interface DicePoseFrame {
  px: number;
  py: number;
  pz: number;
  qx: number;
  qy: number;
  qz: number;
  qw: number;
}

export interface SimulatedDiceTrajectory {
  duration: number;
  frames1: DicePoseFrame[];
  frames2: DicePoseFrame[];
  collisionTimes: number[];
}

const GRASS_Y = 0.16;
const DICE_SIZE = 0.88;
const HALF_EXTENT = DICE_SIZE * 0.5;
const WORLD_UP = new THREE.Vector3(0, 1, 0);

const LOCAL_FACE_NORMALS: THREE.Vector3[] = [
  new THREE.Vector3(1, 0, 0), // 0 (+X) -> 2
  new THREE.Vector3(-1, 0, 0), // 1 (-X) -> 5
  new THREE.Vector3(0, 1, 0), // 2 (+Y) -> 1
  new THREE.Vector3(0, -1, 0), // 3 (-Y) -> 6
  new THREE.Vector3(0, 0, 1), // 4 (+Z) -> 3
  new THREE.Vector3(0, 0, -1), // 5 (-Z) -> 4
];

function seededUnit(seed: number, salt: number): number {
  const x = Math.sin(seed * 12.9898 + salt * 78.233) * 43758.5453;
  return x - Math.floor(x);
}

/**
 * Computes an exact proper cube-symmetry rotation `qRemap` in local space (`SO(3)` octahedral group)
 * such that `qRemap * nTarget = nLanded`. Post-multiplying every physics quaternion `qPhys * qRemap`
 * preserves 100% of box corner/edge geometry during collisions while guaranteeing `nTarget` faces `+Y` at rest!
 */
function computeOctahedralFaceRemap(landedFaceIdx: number, targetValue: number): THREE.Quaternion {
  const targetFaceIdx = Math.max(0, DICE_BOX_FACE_VALUES.indexOf(targetValue));
  if (landedFaceIdx === targetFaceIdx) {
    return new THREE.Quaternion();
  }

  const nLanded = LOCAL_FACE_NORMALS[landedFaceIdx];
  const nTarget = LOCAL_FACE_NORMALS[targetFaceIdx];
  const dot = nTarget.dot(nLanded);

  if (dot < -0.99) {
    // Opposite faces: rotate 180 deg around an orthogonal coordinate axis so cube axes map to cube axes
    const orthoAxis =
      Math.abs(nTarget.x) < 0.5 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 0, 1);
    return new THREE.Quaternion().setFromAxisAngle(orthoAxis, Math.PI);
  }

  // Orthogonal faces: 90 deg rotation around cross(nTarget, nLanded) (which is also a unit coordinate axis!)
  const crossAxis = new THREE.Vector3().crossVectors(nTarget, nLanded).normalize();
  return new THREE.Quaternion().setFromAxisAngle(crossAxis, Math.PI / 2);
}

function findBestUpwardFace(quat: THREE.Quaternion): { faceIdx: number; dotUp: number } {
  const v = new THREE.Vector3();
  let bestIdx = 0;
  let bestDot = -Infinity;
  for (let i = 0; i < LOCAL_FACE_NORMALS.length; i++) {
    v.copy(LOCAL_FACE_NORMALS[i]).applyQuaternion(quat);
    const d = v.dot(WORLD_UP);
    if (d > bestDot) {
      bestDot = d;
      bestIdx = i;
    }
  }
  return { faceIdx: bestIdx, dotUp: bestDot };
}

/**
 * Runs a fast, genuine `cannon-es` rigid-body simulation (gravity, floor bounce, sunken courtyard
 * retaining walls, clock-console collider, and die-to-die collisions) and applies `computeOctahedralFaceRemap`
 * so the dice physically tumble and collide yet always settle flat on `(die1, die2)`.
 */
export function simulateDeterministicDiceRoll(
  die1: number,
  die2: number,
  seed = Math.random() * 10_000
): SimulatedDiceTrajectory {
  const safeD1 = Math.max(1, Math.min(6, Math.round(die1)));
  const safeD2 = Math.max(1, Math.min(6, Math.round(die2)));

  let bestResult: {
    raw1: DicePoseFrame[];
    raw2: DicePoseFrame[];
    impacts: number[];
    f1: number;
    f2: number;
    simDuration: number;
  } | null = null;

  for (let attempt = 0; attempt < 8; attempt++) {
    const curSeed = seed + attempt * 131.7;
    const world = new CANNON.World({
      gravity: new CANNON.Vec3(0, -34, 0),
    });
    world.broadphase = new CANNON.NaiveBroadphase();
    (world.solver as CANNON.GSSolver).iterations = 10;

    const floorMat = new CANNON.Material('turf');
    const dieMat = new CANNON.Material('die');
    world.addContactMaterial(
      new CANNON.ContactMaterial(floorMat, dieMat, {
        friction: 0.42,
        restitution: 0.46,
      })
    );
    world.addContactMaterial(
      new CANNON.ContactMaterial(dieMat, dieMat, {
        friction: 0.25,
        restitution: 0.56,
      })
    );

    // 1. Sunken grass courtyard floor at y = GRASS_Y (0.16)
    const floorBody = new CANNON.Body({ mass: 0, material: floorMat });
    floorBody.addShape(new CANNON.Plane());
    floorBody.position.set(0, GRASS_Y, 0);
    floorBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
    world.addBody(floorBody);

    // 2. 4 Sunken courtyard retaining step walls at x = ±4.95, z = ±4.95
    // + diagonal guard bumper along x + z = 2.25 keeping dice clear of center "VIỆT NAM 3D" grass emblem!
    const wallExtent = 4.95;
    const wallConfigs: Array<[number, number, number, number]> = [
      [0, wallExtent, Math.PI, 0], // +Z wall facing -Z
      [0, -wallExtent, 0, 0], // -Z wall facing +Z
      [wallExtent, 0, -Math.PI / 2, 0], // +X wall facing -X
      [-wallExtent, 0, Math.PI / 2, 0], // -X wall facing +X
    ];
    for (const [wx, wz, ry] of wallConfigs) {
      const wb = new CANNON.Body({ mass: 0, material: floorMat });
      wb.addShape(new CANNON.Plane());
      wb.position.set(wx, GRASS_Y, wz);
      wb.quaternion.setFromEuler(0, ry, 0);
      world.addBody(wb);
    }

    // Diagonal center-logo guard plane: normal (+1/sqrt(2), 0, +1/sqrt(2)) at (1.22, GRASS_Y, 1.22) -> x + z >= 2.44 + r
    const centerGuard = new CANNON.Body({ mass: 0, material: floorMat });
    centerGuard.addShape(new CANNON.Plane());
    centerGuard.position.set(1.22, GRASS_Y, 1.22);
    centerGuard.quaternion.setFromEuler(0, Math.PI / 4, 0);
    world.addBody(centerGuard);

    // 4. Two physical 3D dice launched crosswise into the lower-center open grass pitch
    const dieShape = new CANNON.Box(new CANNON.Vec3(HALF_EXTENT, HALF_EXTENT, HALF_EXTENT));
    const b1 = new CANNON.Body({
      mass: 1.0,
      material: dieMat,
      shape: dieShape,
      linearDamping: 0.2,
      angularDamping: 0.2,
    });
    const b2 = new CANNON.Body({
      mass: 1.0,
      material: dieMat,
      shape: dieShape,
      linearDamping: 0.2,
      angularDamping: 0.2,
    });

    const jitter1 = (seededUnit(curSeed, 1) - 0.5) * 0.45;
    const jitter2 = (seededUnit(curSeed, 2) - 0.5) * 0.45;

    b1.position.set(0.15 + jitter1, GRASS_Y + 2.45, 3.25 - jitter1 * 0.4);
    b1.velocity.set(
      3.5 + seededUnit(curSeed, 3) * 1.1,
      1.9 + seededUnit(curSeed, 4) * 0.9,
      -0.35 + seededUnit(curSeed, 5) * 0.7
    );
    b1.angularVelocity.set(
      9.5 + seededUnit(curSeed, 6) * 7.0,
      (seededUnit(curSeed, 7) - 0.5) * 14.0,
      -8.5 - seededUnit(curSeed, 8) * 6.5
    );
    b1.quaternion.setFromEuler(
      seededUnit(curSeed, 9) * Math.PI,
      seededUnit(curSeed, 10) * Math.PI,
      seededUnit(curSeed, 11) * Math.PI
    );

    b2.position.set(3.25 - jitter2 * 0.4, GRASS_Y + 2.65, 0.15 + jitter2);
    b2.velocity.set(
      -0.35 + seededUnit(curSeed, 12) * 0.7,
      2.1 + seededUnit(curSeed, 13) * 0.9,
      3.6 + seededUnit(curSeed, 14) * 1.1
    );
    b2.angularVelocity.set(
      -9.0 - seededUnit(curSeed, 15) * 6.5,
      (seededUnit(curSeed, 16) - 0.5) * 14.0,
      9.2 + seededUnit(curSeed, 17) * 7.0
    );
    b2.quaternion.setFromEuler(
      seededUnit(curSeed, 18) * Math.PI,
      seededUnit(curSeed, 19) * Math.PI,
      seededUnit(curSeed, 20) * Math.PI
    );

    const impactSteps: number[] = [];
    let currentStep = 0;
    let lastImpactStep = -8;
    const onCollide = (evt: { contact: CANNON.ContactEquation }) => {
      const relVel = Math.abs(evt.contact.getImpactVelocityAlongNormal());
      if (relVel > 1.35 && currentStep - lastImpactStep >= 5 && impactSteps.length < 10) {
        lastImpactStep = currentStep;
        impactSteps.push(currentStep);
      }
    };
    b1.addEventListener('collide', onCollide);
    b2.addEventListener('collide', onCollide);

    world.addBody(b1);
    world.addBody(b2);

    const raw1: DicePoseFrame[] = [];
    const raw2: DicePoseFrame[] = [];
    const dt = 1 / 90;
    const maxSteps = 165;
    let restCounter = 0;

    for (let s = 0; s < maxSteps; s++) {
      currentStep = s;
      world.step(dt);

      raw1.push({
        px: b1.position.x,
        py: b1.position.y,
        pz: b1.position.z,
        qx: b1.quaternion.x,
        qy: b1.quaternion.y,
        qz: b1.quaternion.z,
        qw: b1.quaternion.w,
      });
      raw2.push({
        px: b2.position.x,
        py: b2.position.y,
        pz: b2.position.z,
        qx: b2.quaternion.x,
        qy: b2.quaternion.y,
        qz: b2.quaternion.z,
        qw: b2.quaternion.w,
      });

      const speedSq =
        b1.velocity.lengthSquared() +
        b2.velocity.lengthSquared() +
        b1.angularVelocity.lengthSquared() * 0.08 +
        b2.angularVelocity.lengthSquared() * 0.08;
      if (s > 45 && speedSq < 0.012) {
        restCounter++;
        if (restCounter >= 8) break;
      } else {
        restCounter = 0;
      }
    }

    const last1 = raw1[raw1.length - 1];
    const last2 = raw2[raw2.length - 1];
    const qEnd1 = new THREE.Quaternion(last1.qx, last1.qy, last1.qz, last1.qw);
    const qEnd2 = new THREE.Quaternion(last2.qx, last2.qy, last2.qz, last2.qw);
    const up1 = findBestUpwardFace(qEnd1);
    const up2 = findBestUpwardFace(qEnd2);
    const sep = Math.hypot(last1.px - last2.px, last1.pz - last2.pz);

    const simDuration = Math.max(0.85, Math.min(1.38, raw1.length * dt));
    const normalizedImpacts =
      impactSteps.length > 0
        ? impactSteps.map((st) => Math.min(0.95, st / Math.max(1, raw1.length - 1)))
        : [0.24, 0.52, 0.74];

    bestResult = {
      raw1,
      raw2,
      impacts: normalizedImpacts,
      f1: up1.faceIdx,
      f2: up2.faceIdx,
      simDuration,
    };

    // Accept immediately if both dice settled flat on the grass without stacking on each other
    if (
      up1.dotUp > 0.994 &&
      up2.dotUp > 0.994 &&
      last1.py < GRASS_Y + HALF_EXTENT + 0.08 &&
      last2.py < GRASS_Y + HALF_EXTENT + 0.08 &&
      sep >= 0.84
    ) {
      break;
    }
  }

  const chosen = bestResult!;
  const remap1 = computeOctahedralFaceRemap(chosen.f1, safeD1);
  const remap2 = computeOctahedralFaceRemap(chosen.f2, safeD2);

  const applyRemapAndLevel = (
    frames: DicePoseFrame[],
    remap: THREE.Quaternion,
    targetVal: number
  ): DicePoseFrame[] => {
    const qTmp = new THREE.Quaternion();
    const out: DicePoseFrame[] = frames.map((f) => {
      qTmp.set(f.qx, f.qy, f.qz, f.qw).multiply(remap).normalize();
      return {
        px: f.px,
        py: Math.max(GRASS_Y + HALF_EXTENT, f.py),
        pz: f.pz,
        qx: qTmp.x,
        qy: qTmp.y,
        qz: qTmp.z,
        qw: qTmp.w,
      };
    });

    // Ensure final 4 frames settle with exact 1.0000 upward face alignment (guards rare tilted rests)
    const last = out[out.length - 1];
    const qFinal = new THREE.Quaternion(last.qx, last.qy, last.qz, last.qw);
    const targetIdx = Math.max(0, DICE_BOX_FACE_VALUES.indexOf(targetVal));
    const curUp = LOCAL_FACE_NORMALS[targetIdx].clone().applyQuaternion(qFinal);
    if (curUp.dot(WORLD_UP) < 0.9999) {
      const qAlign = new THREE.Quaternion().setFromUnitVectors(curUp, WORLD_UP);
      const qExact = qAlign.multiply(qFinal).normalize();
      const tailCount = Math.min(6, out.length);
      for (let k = 0; k < tailCount; k++) {
        const idx = out.length - tailCount + k;
        const alpha = (k + 1) / tailCount;
        qTmp
          .set(out[idx].qx, out[idx].qy, out[idx].qz, out[idx].qw)
          .slerp(qExact, alpha);
        out[idx].qx = qTmp.x;
        out[idx].qy = qTmp.y;
        out[idx].qz = qTmp.z;
        out[idx].qw = qTmp.w;
        out[idx].py = THREE.MathUtils.lerp(out[idx].py, GRASS_Y + HALF_EXTENT, alpha);
      }
    }
    return out;
  };

  return {
    duration: chosen.simDuration,
    frames1: applyRemapAndLevel(chosen.raw1, remap1, safeD1),
    frames2: applyRemapAndLevel(chosen.raw2, remap2, safeD2),
    collisionTimes: chosen.impacts,
  };
}

const _samplePos1 = new THREE.Vector3();
const _samplePos2 = new THREE.Vector3();
const _sampleQuat1 = new THREE.Quaternion();
const _sampleQuat2 = new THREE.Quaternion();
const _nextQuat = new THREE.Quaternion();

/**
 * Zero-GC interpolated sampling of a `SimulatedDiceTrajectory` at `normalizedT` in `[0, 1]`.
 */
export function sampleDiceTrajectoryAt(
  traj: SimulatedDiceTrajectory,
  normalizedT: number
): {
  pos1: THREE.Vector3;
  quat1: THREE.Quaternion;
  pos2: THREE.Vector3;
  quat2: THREE.Quaternion;
} {
  const t = Math.max(0, Math.min(1, normalizedT));
  const maxIdx = traj.frames1.length - 1;
  const exact = t * maxIdx;
  const idx0 = Math.min(maxIdx, Math.floor(exact));
  const idx1 = Math.min(maxIdx, idx0 + 1);
  const frac = exact - idx0;

  const a1 = traj.frames1[idx0];
  const b1 = traj.frames1[idx1];
  _samplePos1.set(
    THREE.MathUtils.lerp(a1.px, b1.px, frac),
    THREE.MathUtils.lerp(a1.py, b1.py, frac),
    THREE.MathUtils.lerp(a1.pz, b1.pz, frac)
  );
  _sampleQuat1.set(a1.qx, a1.qy, a1.qz, a1.qw);
  _nextQuat.set(b1.qx, b1.qy, b1.qz, b1.qw);
  _sampleQuat1.slerp(_nextQuat, frac);

  const a2 = traj.frames2[idx0];
  const b2 = traj.frames2[idx1];
  _samplePos2.set(
    THREE.MathUtils.lerp(a2.px, b2.px, frac),
    THREE.MathUtils.lerp(a2.py, b2.py, frac),
    THREE.MathUtils.lerp(a2.pz, b2.pz, frac)
  );
  _sampleQuat2.set(a2.qx, a2.qy, a2.qz, a2.qw);
  _nextQuat.set(b2.qx, b2.qy, b2.qz, b2.qw);
  _sampleQuat2.slerp(_nextQuat, frac);

  return {
    pos1: _samplePos1,
    quat1: _sampleQuat1,
    pos2: _samplePos2,
    quat2: _sampleQuat2,
  };
}

/**
 * Evaluates a damped 2-bounce rigid-body tray impact curve for `u` in `[0, 1]`
 * after a flying coin / gold bar / bill stack strikes the destination Vault Tray.
 */
export function computePhysicalTrayBounceY(u: number, restitution = 0.38): number {
  if (u <= 0 || u >= 1) return 0;
  if (u < 0.58) {
    const p = u / 0.58;
    return Math.sin(p * Math.PI) * (0.42 * restitution);
  }
  const p2 = (u - 0.58) / 0.42;
  return Math.sin(p2 * Math.PI) * (0.16 * restitution * restitution);
}
