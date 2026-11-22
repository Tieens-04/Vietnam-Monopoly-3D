import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { DICE_BOX_FACE_VALUES } from '../game/rules';
import {
  computePhysicalTrayBounceY,
  sampleDiceTrajectoryAt,
  simulateDeterministicDiceRoll,
} from './physicsEngine';

const LOCAL_FACE_NORMALS: THREE.Vector3[] = [
  new THREE.Vector3(1, 0, 0), // +X -> 2
  new THREE.Vector3(-1, 0, 0), // -X -> 5
  new THREE.Vector3(0, 1, 0), // +Y -> 1
  new THREE.Vector3(0, -1, 0), // -Y -> 6
  new THREE.Vector3(0, 0, 1), // +Z -> 3
  new THREE.Vector3(0, 0, -1), // -Z -> 4
];

function getUpwardFaceValue(quat: THREE.Quaternion): { value: number; dotUp: number } {
  const worldUp = new THREE.Vector3(0, 1, 0);
  const tmp = new THREE.Vector3();
  let bestIdx = 0;
  let bestDot = -Infinity;
  for (let i = 0; i < LOCAL_FACE_NORMALS.length; i++) {
    tmp.copy(LOCAL_FACE_NORMALS[i]).applyQuaternion(quat);
    const d = tmp.dot(worldUp);
    if (d > bestDot) {
      bestDot = d;
      bestIdx = i;
    }
  }
  return { value: DICE_BOX_FACE_VALUES[bestIdx], dotUp: bestDot };
}

test('cannon-es simulateDeterministicDiceRoll lands flat on exact (die1, die2) across all 36 combinations while staying inside courtyard walls', () => {
  for (let d1 = 1; d1 <= 6; d1++) {
    for (let d2 = 1; d2 <= 6; d2++) {
      const traj = simulateDeterministicDiceRoll(d1, d2, d1 * 37 + d2 * 13);
      assert.ok(traj.frames1.length >= 20, 'Trajectory records physical simulation steps');
      assert.ok(traj.collisionTimes.length >= 1, 'Trajectory records real rigid-body impact events');

      // Mid-flight check: dice lift into the air and stay bounded inside [-5.5, +5.5] courtyard walls
      const mid = sampleDiceTrajectoryAt(traj, 0.22);
      assert.ok(Math.abs(mid.pos1.x) <= 5.6 && Math.abs(mid.pos1.z) <= 5.6);
      assert.ok(Math.abs(mid.pos2.x) <= 5.6 && Math.abs(mid.pos2.z) <= 5.6);

      // Final settled check: exact face normal pointing straight +Y (dot > 0.99)
      const end = sampleDiceTrajectoryAt(traj, 1.0);
      const res1 = getUpwardFaceValue(end.quat1);
      const res2 = getUpwardFaceValue(end.quat2);

      assert.equal(
        res1.value,
        d1,
        `Expected die1=${d1}, got ${res1.value} (dot=${res1.dotUp.toFixed(4)})`
      );
      assert.equal(
        res2.value,
        d2,
        `Expected die2=${d2}, got ${res2.value} (dot=${res2.dotUp.toFixed(4)})`
      );
      assert.ok(res1.dotUp > 0.99, `Die 1 must settle flat on floor, got dotUp=${res1.dotUp}`);
      assert.ok(res2.dotUp > 0.99, `Die 2 must settle flat on floor, got dotUp=${res2.dotUp}`);

      // Dice must not overlap at rest and must settle in the open lower-center pitch below "VIỆT NAM 3D"
      const distAtRest = end.pos1.distanceTo(end.pos2);
      assert.ok(distAtRest >= 0.78, `Dice must not interpenetrate at rest, dist=${distAtRest.toFixed(3)}`);
      assert.ok(
        end.pos1.x + end.pos1.z >= 2.35 && end.pos2.x + end.pos2.z >= 2.35,
        `Dice must settle in lower courtyard pitch clear of center text, got (${end.pos1.x.toFixed(2)}, ${end.pos1.z.toFixed(2)}) & (${end.pos2.x.toFixed(2)}, ${end.pos2.z.toFixed(2)})`
      );
    }
  }
});

test('computePhysicalTrayBounceY produces damped rigid-body impacts settling cleanly at 0', () => {
  assert.ok(computePhysicalTrayBounceY(0, 0.4) >= 0);
  const peakBounce = computePhysicalTrayBounceY(0.32, 0.42);
  assert.ok(peakBounce > 0.04, 'Coin bounce lifts off tray after initial impact');
  assert.equal(computePhysicalTrayBounceY(1, 0.42), 0);
});
