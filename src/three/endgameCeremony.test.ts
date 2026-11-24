import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DEFAULT_PLAYER_CONFIGS } from '../game/boardData';
import { createInitialPlayers } from '../game/rules';
import { GraphicsQualityTier } from '../game/types';
import { createAnimationDirector } from './animationDirector';
import {
  CharacterCeremonyRole,
  CharacterRigController,
} from './characterRigController';
import { createGltfAssetPool, validateCharacterGltfContract } from './gltfAssetPool';
import {
  CONFETTI_DURATION_SEC,
  PODIUM_BASE_Y,
  PODIUM_DECK_LOCAL_Y,
  PODIUM_YAW,
  TROPHY_PODIUM_MODEL_URL,
  computePodiumSlotWorldPos,
  createEndgameCeremonySystem,
  resolveConfettiCountForTier,
} from './endgameCeremony';

function advanceDirector(
  director: ReturnType<typeof createAnimationDirector>,
  steps: number,
  dt: number,
  opts: {
    qualityTier?: GraphicsQualityTier;
    reducedMotion?: boolean;
    speedMultiplier?: number;
  } = {}
): boolean {
  const stepOpts = {
    isPaused: false,
    speedMultiplier: opts.speedMultiplier ?? 1,
    reducedMotion: opts.reducedMotion ?? false,
    qualityTier: opts.qualityTier ?? ('high' as const),
  };
  let anyActive = false;
  for (let i = 0; i < steps; i++) {
    anyActive = director.step(dt, stepOpts);
  }
  return anyActive;
}

function makeMockRigController() {
  const roles = new Map<number, CharacterCeremonyRole>();
  let resetCalls = 0;
  const controller: CharacterRigController = {
    getModelUrl: (t) => `/assets/models/pawn_${t}.glb`,
    ensurePlayerToken: () => new THREE.Group(),
    syncIdleState: () => {},
    onHopStep: () => {},
    playReaction: () => {},
    setCeremonyRole: (playerId, role) => {
      roles.set(playerId, role);
    },
    resetCeremonyRoles: () => {
      resetCalls += 1;
      for (const id of roles.keys()) {
        roles.set(id, 'none');
      }
    },
    removePlayer: () => {},
    dispose: () => {},
  };
  return {
    controller,
    roles,
    getResetCalls: () => resetCalls,
  };
}

test('trophy_podium.glb binary asset satisfies glTF 2.0 header, <=30KB, <=3 bones, <=3 materials, <=1200 tris, and required clips', async () => {
  const filePath = path.resolve(
    process.cwd(),
    'public',
    TROPHY_PODIUM_MODEL_URL.replace(/^\/+/, '')
  );
  assert.equal(fs.existsSync(filePath), true, `Expected ${filePath} to exist`);

  const buf = fs.readFileSync(filePath);
  assert.ok(buf.length <= 30_720, `trophy_podium.glb size ${buf.length} exceeds 30,720 bytes`);

  // Validate binary glTF 2.0 container header + JSON chunk
  assert.equal(buf.readUInt32LE(0), 0x46546c67, 'Expected glTF magic header');
  assert.equal(buf.readUInt32LE(4), 2, 'Expected glTF version 2');
  const jsonLen = buf.readUInt32LE(12);
  assert.equal(buf.readUInt32LE(16), 0x4e4f534a, 'Expected JSON chunk type');
  const gltfJson = JSON.parse(buf.subarray(20, 20 + jsonLen).toString('utf8')) as {
    materials?: Array<{ name?: string }>;
    skins?: Array<{ joints?: number[] }>;
    animations?: Array<{ name?: string }>;
  };
  assert.ok((gltfJson.materials?.length ?? 0) <= 3, 'Expected <= 3 materials');
  assert.ok(
    (gltfJson.skins?.[0]?.joints?.length ?? 0) <= 3,
    'Expected <= 3 joints in trophy skeleton'
  );

  // Parse via Three.js GLTFLoader & validate runtime contract
  const arrayBuf = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  const loader = new GLTFLoader();
  const gltf = await new Promise<{ scene: THREE.Group; animations: THREE.AnimationClip[] }>(
    (resolve, reject) => {
      loader.parse(arrayBuf, '', resolve, reject);
    }
  );
  const validation = validateCharacterGltfContract(gltf.scene, gltf.animations ?? [], {
    maxBones: 3,
    maxTriangles: 1200,
    requiredClips: ['podium_rise', 'trophy_idle'],
  });
  assert.equal(validation.valid, true, validation.issues.join('; '));
  assert.ok(validation.boneCount >= 1 && validation.boneCount <= 3);
  assert.ok(validation.triangleCount > 50 && validation.triangleCount <= 1200);
});

test('computePodiumSlotWorldPos and resolveConfettiCountForTier stay geometrically valid and tier-gated', () => {
  // Back trophy center in world space when podium is at (0, PODIUM_BASE_Y, 0) rotated by PODIUM_YAW:
  const trophyWorldX = -0.38 * Math.sin(PODIUM_YAW);
  const trophyWorldZ = -0.38 * Math.cos(PODIUM_YAW);

  const soloSlot = computePodiumSlotWorldPos(0, 1);
  assert.equal(soloSlot.y, PODIUM_BASE_Y + PODIUM_DECK_LOCAL_Y);
  assert.equal(soloSlot.rotY, PODIUM_YAW);
  const soloTrophyDist = Math.hypot(soloSlot.x - trophyWorldX, soloSlot.z - trophyWorldZ);
  assert.ok(
    soloTrophyDist >= 0.6,
    `Solo winner must stand >= 0.60 away from trophy pedestal (got ${soloTrophyDist.toFixed(3)})`
  );

  const teamSlot0 = computePodiumSlotWorldPos(0, 2);
  const teamSlot1 = computePodiumSlotWorldPos(1, 2);
  assert.equal(teamSlot0.y, PODIUM_BASE_Y + PODIUM_DECK_LOCAL_Y);
  assert.equal(teamSlot1.y, PODIUM_BASE_Y + PODIUM_DECK_LOCAL_Y);
  assert.equal(teamSlot0.rotY, PODIUM_YAW);
  assert.equal(teamSlot1.rotY, PODIUM_YAW);
  const slotSep = Math.hypot(teamSlot1.x - teamSlot0.x, teamSlot1.z - teamSlot0.z);
  assert.ok(
    slotSep >= 1.1,
    `2v2 podium slots must stay >= 1.10 apart (got ${slotSep.toFixed(3)})`
  );

  assert.equal(resolveConfettiCountForTier('low', false), 0);
  assert.equal(resolveConfettiCountForTier('medium', false), 60);
  assert.equal(resolveConfettiCountForTier('high', false), 140);
  assert.equal(resolveConfettiCountForTier('high', true), 0);
  assert.equal(resolveConfettiCountForTier('medium', true), 0);
  assert.equal(resolveConfettiCountForTier('low', true), 0);
});

test('createEndgameCeremonySystem drives Solo & 2v2 podium, 3.2s confetti auto-sleep, Low 0 FPS idle, AT-LIFE-RESET, and bankruptcy shrink', () => {
  let activeTier: GraphicsQualityTier = 'high';
  let reducedMotion = false;
  const scene = new THREE.Scene();
  const director = createAnimationDirector();
  const gltfPool = createGltfAssetPool();
  const rigMock = makeMockRigController();

  const ceremony = createEndgameCeremonySystem({
    scene,
    director,
    gltfPool,
    getQualityTier: () => activeTier,
    getReducedMotion: () => reducedMotion,
  });

  // 1. 2v2 victory ceremony on High tier: 2 winner poses + 2 defeated + 140 confetti
  const teamPlayers = createInitialPlayers(DEFAULT_PLAYER_CONFIGS, 2_000_000, 'TEAMS_2V2');
  ceremony.startCeremony({
    winnerIds: [teamPlayers[0].id, teamPlayers[2].id],
    teamMode: true,
    players: teamPlayers,
    characterRigs: rigMock.controller,
  });

  assert.equal(ceremony.isActive(), true);
  assert.equal(ceremony.getCeremonyPawnPose(teamPlayers[0].id)?.rotY, PODIUM_YAW);
  assert.equal(ceremony.getCeremonyPawnPose(teamPlayers[2].id)?.rotY, PODIUM_YAW);
  assert.equal(ceremony.getCeremonyPawnPose(teamPlayers[1].id), null);
  assert.equal(rigMock.roles.get(teamPlayers[0].id), 'winner');
  assert.equal(rigMock.roles.get(teamPlayers[2].id), 'winner');
  assert.equal(rigMock.roles.get(teamPlayers[1].id), 'defeated');
  assert.equal(rigMock.roles.get(teamPlayers[3].id), 'defeated');
  assert.equal(ceremony.isConfettiActive(), true);
  assert.equal(ceremony.getActiveConfettiCount(), 140);

  // Step through full CONFETTI_DURATION_SEC (3.2s) -> confetti sleeps to 0
  advanceDirector(director, Math.ceil((CONFETTI_DURATION_SEC + 0.25) / 0.05), 0.05, {
    qualityTier: 'high',
    reducedMotion: false,
  });
  assert.equal(ceremony.isConfettiActive(), false);
  assert.equal(ceremony.getActiveConfettiCount(), 0);
  assert.equal(director.hasBlockingVisualAnimations(), false);

  // 2. AT-LIFE-RESET: cancelAll mid-ceremony wipes podium, confetti, poses & director timelines
  const soloPlayers = createInitialPlayers(DEFAULT_PLAYER_CONFIGS, 2_000_000, 'FFA');
  ceremony.startCeremony({
    winnerIds: [soloPlayers[1].id],
    teamMode: false,
    players: soloPlayers,
    characterRigs: rigMock.controller,
  });
  assert.equal(ceremony.isActive(), true);
  assert.equal(ceremony.getActiveConfettiCount(), 140);
  ceremony.cancelAll();
  assert.equal(ceremony.isActive(), false);
  assert.equal(ceremony.isConfettiActive(), false);
  assert.equal(ceremony.getActiveConfettiCount(), 0);
  assert.equal(ceremony.getCeremonyPawnPose(soloPlayers[1].id), null);
  assert.equal(director.getActiveCount(), 0);
  assert.ok(rigMock.getResetCalls() >= 1);

  // 3. Low tier preserves 0 FPS idle after podium reveal (~0.75s) and spawns 0 confetti
  activeTier = 'low';
  reducedMotion = false;
  ceremony.startCeremony({
    winnerIds: [soloPlayers[0].id],
    teamMode: false,
    players: soloPlayers,
    characterRigs: rigMock.controller,
  });
  assert.equal(ceremony.isConfettiActive(), false);
  assert.equal(ceremony.getActiveConfettiCount(), 0);
  const lowActiveAfter1s = advanceDirector(director, 25, 0.05, {
    qualityTier: 'low',
    reducedMotion: false,
  });
  assert.equal(lowActiveAfter1s, false, 'Low tier ceremony must settle to 0 FPS idle after rise');

  // 4. Reduced motion disables confetti on Medium/High too
  ceremony.cancelAll();
  activeTier = 'medium';
  reducedMotion = true;
  ceremony.startCeremony({
    winnerIds: [soloPlayers[0].id],
    teamMode: false,
    players: soloPlayers,
    characterRigs: rigMock.controller,
  });
  assert.equal(ceremony.getActiveConfettiCount(), 0);
  assert.equal(ceremony.isConfettiActive(), false);

  // 5. Mid-match bankruptcy shrink restores clean unit scale & hides pawn
  ceremony.cancelAll();
  activeTier = 'high';
  reducedMotion = false;
  const pawnGroup = new THREE.Group();
  scene.add(pawnGroup);
  ceremony.playBankruptcyExit(soloPlayers[2].id, pawnGroup);
  assert.equal(ceremony.isBankruptcyExiting(soloPlayers[2].id), true);
  advanceDirector(director, 18, 0.05, { qualityTier: 'high', reducedMotion: false });
  assert.equal(ceremony.isBankruptcyExiting(soloPlayers[2].id), false);
  assert.equal(pawnGroup.visible, false);
  assert.equal(pawnGroup.scale.x, 1);
  assert.equal(pawnGroup.scale.y, 1);
  assert.equal(pawnGroup.scale.z, 1);

  ceremony.dispose();
  director.dispose();
  gltfPool.dispose();
});
