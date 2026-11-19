import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CHARACTER_PERSONAS,
  computeAvatarPoseTargets,
  computeBlinkFactor,
  deriveAvatarMood,
} from './avatarLogic';

test('all 4 Business Tour character personas define distinct palettes and Vietnamese tycoon identities', () => {
  const keys = Object.keys(CHARACTER_PERSONAS) as Array<keyof typeof CHARACTER_PERSONAS>;
  assert.deepEqual(keys.sort(), ['car', 'crown', 'jet', 'yacht']);

  const names = new Set(keys.map((k) => CHARACTER_PERSONAS[k].personaName));
  const suits = new Set(keys.map((k) => CHARACTER_PERSONAS[k].suitHex));
  assert.equal(names.size, 4);
  assert.equal(suits.size, 4);
});

test('deriveAvatarMood prioritizes bankrupt > jailed > celebrating > stressed > active > idle', () => {
  assert.equal(
    deriveAvatarMood({
      bankrupt: true,
      inJail: true,
      cash: 2000,
      isActive: true,
      recentCashDelta: 200,
    }),
    'bankrupt'
  );

  assert.equal(
    deriveAvatarMood({
      bankrupt: false,
      inJail: true,
      cash: 1500,
      isActive: true,
      recentCashDelta: 200,
    }),
    'jailed'
  );

  assert.equal(
    deriveAvatarMood({
      bankrupt: false,
      inJail: false,
      cash: 1700,
      isActive: false,
      recentCashDelta: 200,
    }),
    'celebrating'
  );

  assert.equal(
    deriveAvatarMood({
      bankrupt: false,
      inJail: false,
      cash: 120,
      isActive: true,
      recentCashDelta: 0,
    }),
    'stressed'
  );

  assert.equal(
    deriveAvatarMood({
      bankrupt: false,
      inJail: false,
      cash: 1500,
      isActive: true,
      recentCashDelta: 0,
    }),
    'active'
  );

  assert.equal(
    deriveAvatarMood({
      bankrupt: false,
      inJail: false,
      cash: 1500,
      isActive: false,
      recentCashDelta: 0,
    }),
    'idle'
  );
});

test('computeBlinkFactor and computeAvatarPoseTargets produce bounded natural kinematics and inward corner gaze', () => {
  for (let t = 0; t <= 5; t += 0.05) {
    const b0 = computeBlinkFactor(t, 0);
    const b1 = computeBlinkFactor(t, 1);
    assert.ok(b0 >= 0 && b0 <= 1);
    assert.ok(b1 >= 0 && b1 <= 1);
  }

  const leftCornerPose = computeAvatarPoseTargets({
    mood: 'idle',
    elapsedSec: 0,
    phaseSeed: 0,
    facingSign: 1,
  });
  const rightCornerPose = computeAvatarPoseTargets({
    mood: 'idle',
    elapsedSec: 0,
    phaseSeed: 0,
    facingSign: -1,
  });

  // Left HUD avatars bias gaze right (+yaw) and right HUD avatars bias gaze left (-yaw)
  assert.ok(leftCornerPose.headYaw > 0.1);
  assert.ok(rightCornerPose.headYaw < -0.1);

  const celebratingPose = computeAvatarPoseTargets({
    mood: 'celebrating',
    elapsedSec: 0.25,
    phaseSeed: 1,
  });
  const bankruptPose = computeAvatarPoseTargets({
    mood: 'bankrupt',
    elapsedSec: 0.25,
    phaseSeed: 1,
  });
  assert.ok(celebratingPose.smileScale > 1);
  assert.ok(bankruptPose.headPitch > 0.2);
  assert.ok(bankruptPose.smileScale < 0);
});
