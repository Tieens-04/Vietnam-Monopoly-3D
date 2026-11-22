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
  assert.equal(CHARACTER_PERSONAS.car.isFemale, false);
  assert.equal(CHARACTER_PERSONAS.jet.isFemale, false);
  assert.equal(CHARACTER_PERSONAS.yacht.isFemale, true);
  assert.equal(CHARACTER_PERSONAS.crown.isFemale, true);
});

test('deriveAvatarMood prioritizes bankrupt > jailed > celebrating > stressed > active > idle', () => {
  assert.equal(
    deriveAvatarMood({
      bankrupt: true,
      inJail: true,
      cash: 2_000_000,
      isActive: true,
      recentCashDelta: 300_000,
    }),
    'bankrupt'
  );

  assert.equal(
    deriveAvatarMood({
      bankrupt: false,
      inJail: true,
      cash: 1_500_000,
      isActive: true,
      recentCashDelta: 300_000,
    }),
    'jailed'
  );

  assert.equal(
    deriveAvatarMood({
      bankrupt: false,
      inJail: false,
      cash: 1_700_000,
      isActive: false,
      recentCashDelta: 120_000,
    }),
    'celebrating'
  );

  assert.equal(
    deriveAvatarMood({
      bankrupt: false,
      inJail: false,
      cash: 1_500_000,
      isActive: false,
      recentCashDelta: 30_000,
    }),
    'idle'
  );

  assert.equal(
    deriveAvatarMood({
      bankrupt: false,
      inJail: false,
      cash: 180_000,
      isActive: true,
      recentCashDelta: 0,
    }),
    'stressed'
  );

  assert.equal(
    deriveAvatarMood({
      bankrupt: false,
      inJail: false,
      cash: 1_500_000,
      isActive: true,
      recentCashDelta: 0,
    }),
    'active'
  );

  assert.equal(
    deriveAvatarMood({
      bankrupt: false,
      inJail: false,
      cash: 1_500_000,
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

  // Celebrating pose (including static snapshot t = 0.35) must keep head upright so royal tiara/crown stays clearly visible
  for (const sampleT of [0, 0.25, 0.35, 0.5, 0.75]) {
    const sampleCelebrate = computeAvatarPoseTargets({
      mood: 'celebrating',
      elapsedSec: sampleT,
      phaseSeed: 0,
    });
    assert.ok(
      sampleCelebrate.headPitch >= -0.06,
      `Expected upright celebrating headPitch >= -0.06 at t=${sampleT}, got ${sampleCelebrate.headPitch}`
    );
    assert.ok(
      sampleCelebrate.smileScale <= 1.18,
      `Expected poised celebrating smileScale <= 1.18 at t=${sampleT}, got ${sampleCelebrate.smileScale}`
    );
  }
});
