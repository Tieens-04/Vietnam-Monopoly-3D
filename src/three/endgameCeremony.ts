import * as THREE from 'three';
import { GraphicsQualityTier, PlayerState } from '../game/types';
import {
  AnimationDirector,
  createManagedGsapTimeline,
} from './animationDirector';
import { CharacterRigController } from './characterRigController';
import { GltfAssetPool } from './gltfAssetPool';

export const TROPHY_PODIUM_MODEL_URL = '/assets/models/trophy_podium.glb';
export const PODIUM_BASE_Y = 0.18;
export const PODIUM_DECK_LOCAL_Y = 0.46;
export const PODIUM_YAW = Math.PI / 4;
export const CONFETTI_DURATION_SEC = 3.2;
export const MAX_CONFETTI_INSTANCES = 140;

export interface CeremonyPawnPose {
  x: number;
  y: number;
  z: number;
  rotY: number;
}

export interface EndgameCeremonyStartOptions {
  winnerIds: number[];
  teamMode: boolean;
  players: PlayerState[];
  characterRigs: CharacterRigController | null;
}

export interface EndgameCeremonyOptions {
  scene: THREE.Scene;
  director: AnimationDirector;
  gltfPool: GltfAssetPool;
  getQualityTier: () => GraphicsQualityTier;
  getReducedMotion: () => boolean;
  onShadowDirty?: () => void;
  onAssetSwapped?: () => void;
}

export interface EndgameCeremonySystem {
  isActive: () => boolean;
  isConfettiActive: () => boolean;
  getActiveConfettiCount: () => number;
  getCeremonyPawnPose: (playerId: number) => CeremonyPawnPose | null;
  isBankruptcyExiting: (playerId: number) => boolean;
  startCeremony: (opts: EndgameCeremonyStartOptions) => void;
  playBankruptcyExit: (playerId: number, tokenGroup: THREE.Group) => void;
  cancelAll: () => void;
  dispose: () => void;
}

interface ConfettiParticle {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  rotX: number;
  rotY: number;
  rotZ: number;
  vRotX: number;
  vRotY: number;
  vRotZ: number;
  scale: number;
}

const CONFETTI_PALETTE = [
  0xf5b800,
  0xe91e63,
  0x29b6f6,
  0x66c61c,
  0xfacc15,
  0x4ade80,
];

/**
 * Computes Three.js world-space podium slot coordinates for 1 (Solo) or 2 (`TEAMS_2V2`) champions.
 * Keeps winners squarely in front of the back golden chalice and comfortably separated.
 */
export function computePodiumSlotWorldPos(
  slotIdx: number,
  totalWinners: number
): CeremonyPawnPose {
  const clampedCount = Math.max(1, totalWinners);
  let lx = 0;
  if (clampedCount > 1) {
    const clampedIdx = Math.max(0, Math.min(clampedCount - 1, slotIdx));
    const span = 1.16;
    lx = -span * 0.5 + (span * clampedIdx) / (clampedCount - 1);
  }
  const lz = 0.26;
  const cosY = Math.cos(PODIUM_YAW);
  const sinY = Math.sin(PODIUM_YAW);
  return {
    x: lx * cosY + lz * sinY,
    y: PODIUM_BASE_Y + PODIUM_DECK_LOCAL_Y,
    z: -lx * sinY + lz * cosY,
    rotY: PODIUM_YAW,
  };
}

/**
 * Returns tier-scaled pooled 3D confetti instance count (strictly 0 on Low & Reduced Motion).
 */
export function resolveConfettiCountForTier(
  tier: GraphicsQualityTier,
  reducedMotion: boolean
): number {
  if (reducedMotion || tier === 'low') return 0;
  return tier === 'high' ? MAX_CONFETTI_INSTANCES : 60;
}

function createProceduralFallbackPodium(): THREE.Group {
  const group = new THREE.Group();

  const slateMat = new THREE.MeshStandardMaterial({
    color: 0x334155,
    roughness: 0.48,
    metalness: 0.14,
  });
  const alabasterMat = new THREE.MeshStandardMaterial({
    color: 0xf8fafc,
    roughness: 0.42,
    metalness: 0.08,
  });
  const crimsonMat = new THREE.MeshStandardMaterial({
    color: 0xc81e3a,
    roughness: 0.36,
    metalness: 0.14,
  });
  const goldMat = new THREE.MeshStandardMaterial({
    color: 0xf5b800,
    roughness: 0.25,
    metalness: 0.8,
  });

  // Note: GLTF forward (+Z) corresponds to Three.js +Z
  const step1Base = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.14, 1.5), slateMat);
  step1Base.position.set(0, 0.07, 0);
  step1Base.castShadow = true;
  step1Base.receiveShadow = true;
  group.add(step1Base);

  const step1Upper = new THREE.Mesh(new THREE.BoxGeometry(2.38, 0.1, 1.36), alabasterMat);
  step1Upper.position.set(0, 0.19, 0);
  step1Upper.castShadow = true;
  step1Upper.receiveShadow = true;
  group.add(step1Upper);

  const stageBody = new THREE.Mesh(new THREE.BoxGeometry(2.16, 0.2, 1.24), alabasterMat);
  stageBody.position.set(0, 0.34, 0);
  stageBody.castShadow = true;
  stageBody.receiveShadow = true;
  group.add(stageBody);

  const goldTrim = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.024, 1.26), goldMat);
  goldTrim.position.set(0, 0.442, 0);
  group.add(goldTrim);

  const crimsonCarpet = new THREE.Mesh(new THREE.BoxGeometry(2.06, 0.022, 1.14), crimsonMat);
  crimsonCarpet.position.set(0, 0.45, 0);
  crimsonCarpet.receiveShadow = true;
  group.add(crimsonCarpet);

  // Back pedestal at local z = -0.38
  const pedestal = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.22, 0.4), slateMat);
  pedestal.position.set(0, 0.57, -0.38);
  pedestal.castShadow = true;
  group.add(pedestal);

  const pedestalCap = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.04, 0.44), goldMat);
  pedestalCap.position.set(0, 0.7, -0.38);
  group.add(pedestalCap);

  // Procedural fallback golden chalice
  const cupBase = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.22, 0.08, 8), goldMat);
  cupBase.position.set(0, 0.76, -0.38);
  cupBase.castShadow = true;
  group.add(cupBase);

  const cupStem = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.07, 0.24, 6), goldMat);
  cupStem.position.set(0, 0.91, -0.38);
  cupStem.castShadow = true;
  group.add(cupStem);

  const cupBowl = new THREE.Mesh(new THREE.CylinderGeometry(0.31, 0.13, 0.38, 8), goldMat);
  cupBowl.position.set(0, 1.24, -0.38);
  cupBowl.castShadow = true;
  group.add(cupBowl);

  const cupCrown = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.21, 0.08, 8), crimsonMat);
  cupCrown.position.set(0, 1.49, -0.38);
  group.add(cupCrown);

  return group;
}

function disposeGroupSubtree(root: THREE.Object3D | null): void {
  if (!root) return;
  root.removeFromParent();
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    if (mesh.geometry && !mesh.geometry.userData?.sharedStatic) {
      mesh.geometry.dispose();
    }
    const disposeMat = (m: THREE.Material) => {
      if (m.userData?.sharedStatic) return;
      m.dispose();
    };
    if (Array.isArray(mesh.material)) {
      mesh.material.forEach(disposeMat);
    } else if (mesh.material) {
      disposeMat(mesh.material);
    }
  });
}

/**
 * Manages Victory Podium GLB, Golden Reveal Ring, 140-piece InstancedMesh 3D Confetti
 * (auto-sleeping after 3.2s and disabled on Low / Reduced Motion), and mid-match
 * bankruptcy pawn shrink/fade transitions.
 */
export function createEndgameCeremonySystem(
  options: EndgameCeremonyOptions
): EndgameCeremonySystem {
  const {
    scene,
    director,
    gltfPool,
    getQualityTier,
    getReducedMotion,
    onShadowDirty,
    onAssetSwapped,
  } = options;

  let disposed = false;
  let active = false;
  let trophyRiseRemainingSec = 0;
  let glbLoadStarted = false;

  const podiumRoot = new THREE.Group();
  podiumRoot.position.set(0, PODIUM_BASE_Y, 0);
  podiumRoot.rotation.y = PODIUM_YAW;
  podiumRoot.visible = false;
  scene.add(podiumRoot);

  const podiumVisualSlot = new THREE.Group();
  podiumRoot.add(podiumVisualSlot);

  let fallbackGroup: THREE.Group | null = createProceduralFallbackPodium();
  podiumVisualSlot.add(fallbackGroup);

  let trophyRigScene: THREE.Object3D | null = null;
  let trophyMixer: THREE.AnimationMixer | null = null;
  let riseAction: THREE.AnimationAction | null = null;
  let idleAction: THREE.AnimationAction | null = null;

  // Reveal golden shockwave ring (ANIM-END-01)
  const revealRingGeo = new THREE.RingGeometry(1.15, 1.48, 32);
  revealRingGeo.rotateX(-Math.PI / 2);
  const revealRingMat = new THREE.MeshBasicMaterial({
    color: 0xfacc15,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0,
    depthWrite: false,
  });
  const revealRingMesh = new THREE.Mesh(revealRingGeo, revealRingMat);
  revealRingMesh.position.set(0, PODIUM_BASE_Y + 0.025, 0);
  revealRingMesh.visible = false;
  scene.add(revealRingMesh);

  // Pre-allocated InstancedMesh Confetti Pool (1 draw call max 140 shards, ANIM-END-05)
  const confettiGeo = new THREE.PlaneGeometry(0.11, 0.17);
  const confettiMat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 1,
    depthWrite: false,
  });
  const confettiMesh = new THREE.InstancedMesh(
    confettiGeo,
    confettiMat,
    MAX_CONFETTI_INSTANCES
  );
  confettiMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  confettiMesh.frustumCulled = false;
  confettiMesh.visible = false;
  confettiMesh.count = 0;

  const colorScratch = new THREE.Color();
  for (let i = 0; i < MAX_CONFETTI_INSTANCES; i++) {
    colorScratch.setHex(CONFETTI_PALETTE[i % CONFETTI_PALETTE.length]);
    confettiMesh.setColorAt(i, colorScratch);
  }
  if (confettiMesh.instanceColor) {
    confettiMesh.instanceColor.needsUpdate = true;
  }
  scene.add(confettiMesh);

  const confettiParticles: ConfettiParticle[] = Array.from(
    { length: MAX_CONFETTI_INSTANCES },
    () => ({
      x: 0,
      y: 0,
      z: 0,
      vx: 0,
      vy: 0,
      vz: 0,
      rotX: 0,
      rotY: 0,
      rotZ: 0,
      vRotX: 0,
      vRotY: 0,
      vRotZ: 0,
      scale: 1,
    })
  );

  let activeConfettiCount = 0;
  let confettiElapsed = 0;
  const confettiDummy = new THREE.Object3D();

  const winnerPoses = new Map<number, CeremonyPawnPose>();
  const bankruptcyExitingIds = new Set<number>();
  let activeRigController: CharacterRigController | null = null;

  const syncTrophyMixerPlayback = (): void => {
    if (!trophyMixer) return;
    const freezeLoop = getQualityTier() === 'low' || getReducedMotion();
    if (!active) {
      trophyMixer.stopAllAction();
      return;
    }

    if (riseAction) {
      riseAction.reset();
      riseAction.enabled = true;
      riseAction.setEffectiveWeight(1);
      riseAction.setLoop(THREE.LoopOnce, 1);
      riseAction.clampWhenFinished = true;
      riseAction.play();
      trophyRiseRemainingSec = freezeLoop
        ? 0
        : Math.max(0.25, riseAction.getClip().duration);
      if (freezeLoop) {
        trophyMixer.update(riseAction.getClip().duration);
      } else {
        trophyMixer.update(0.001);
      }
      return;
    }

    if (idleAction) {
      idleAction.reset();
      idleAction.enabled = true;
      idleAction.setEffectiveWeight(1);
      idleAction.setLoop(THREE.LoopRepeat, Infinity);
      idleAction.clampWhenFinished = false;
      idleAction.play();
      trophyMixer.update(0.001);
    }
  };

  const ensureTrophyGlbLoaded = (): void => {
    if (disposed || glbLoadStarted) return;
    glbLoadStarted = true;
    void gltfPool.acquireClone(TROPHY_PODIUM_MODEL_URL).then((cloned) => {
      if (disposed || !cloned) return;
      cloned.scene.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        if (!mesh.isMesh) return;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        if (mesh.geometry) {
          mesh.geometry.userData = { ...mesh.geometry.userData, sharedStatic: true };
        }
        const markMat = (m: THREE.Material) => {
          m.userData = { ...m.userData, sharedStatic: true };
        };
        if (Array.isArray(mesh.material)) {
          mesh.material.forEach(markMat);
        } else if (mesh.material) {
          markMat(mesh.material);
        }
      });

      disposeGroupSubtree(fallbackGroup);
      fallbackGroup = null;
      trophyRigScene = cloned.scene;
      podiumVisualSlot.add(cloned.scene);

      const rawMixer = new THREE.AnimationMixer(cloned.scene);
      trophyMixer = rawMixer;
      const riseClip = cloned.animations.find((c) => c.name === 'podium_rise') ?? null;
      const idleClip = cloned.animations.find((c) => c.name === 'trophy_idle') ?? null;
      riseAction = riseClip ? rawMixer.clipAction(riseClip) : null;
      idleAction = idleClip ? rawMixer.clipAction(idleClip) : null;

      director.registerMixer({
        id: 'endgame:trophy',
        category: 'endgame',
        mixer: {
          update: (dt: number) => {
            rawMixer.update(dt);
            if (trophyRiseRemainingSec > 0) {
              trophyRiseRemainingSec -= dt;
              if (trophyRiseRemainingSec <= 0) {
                trophyRiseRemainingSec = 0;
                if (active && idleAction && getQualityTier() !== 'low' && !getReducedMotion()) {
                  idleAction.reset();
                  idleAction.enabled = true;
                  idleAction.setEffectiveWeight(1);
                  idleAction.setLoop(THREE.LoopRepeat, Infinity);
                  idleAction.clampWhenFinished = false;
                  idleAction.play();
                  if (riseAction) {
                    riseAction.crossFadeTo(idleAction, 0.16, false);
                  }
                }
              }
            }
          },
          stopAllAction: () => {
            rawMixer.stopAllAction();
          },
        },
        isActive: () => {
          if (!active) return false;
          if (trophyRiseRemainingSec > 0) return true;
          return !getReducedMotion() && getQualityTier() !== 'low';
        },
        blocksIdleSleep: () => active && trophyRiseRemainingSec > 0,
      });

      syncTrophyMixerPlayback();
      onShadowDirty?.();
      onAssetSwapped?.();
    });
  };

  const resetConfettiPool = (): void => {
    activeConfettiCount = 0;
    confettiElapsed = 0;
    confettiMesh.count = 0;
    confettiMesh.visible = false;
    confettiMat.opacity = 1;
  };

  const launchConfettiBurst = (count: number): void => {
    resetConfettiPool();
    if (count <= 0) return;

    activeConfettiCount = Math.min(MAX_CONFETTI_INSTANCES, count);
    confettiMesh.count = activeConfettiCount;
    confettiMesh.visible = true;
    confettiMat.opacity = 1;

    // Deterministic LCG seeded burst from twin podium cannons so behavior is reproducible
    let seed = 0x517cc1b7;
    const rand = (): number => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 4294967296;
    };

    const cosY = Math.cos(PODIUM_YAW);
    const sinY = Math.sin(PODIUM_YAW);

    for (let i = 0; i < activeConfettiCount; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      const localOriginX = side * (1.15 + (rand() - 0.5) * 0.25);
      const localOriginZ = (rand() - 0.5) * 0.6;
      const worldX = localOriginX * cosY + localOriginZ * sinY;
      const worldZ = -localOriginX * sinY + localOriginZ * cosY;

      const angle = rand() * Math.PI * 2;
      const radialSpeed = 1.1 + rand() * 2.4;
      const p = confettiParticles[i];
      p.x = worldX;
      p.y = PODIUM_BASE_Y + 0.45 + rand() * 0.25;
      p.z = worldZ;
      p.vx = Math.cos(angle) * radialSpeed + side * 0.35 * cosY;
      p.vy = 2.6 + rand() * 2.2;
      p.vz = Math.sin(angle) * radialSpeed - side * 0.35 * sinY;
      p.rotX = rand() * Math.PI * 2;
      p.rotY = rand() * Math.PI * 2;
      p.rotZ = rand() * Math.PI * 2;
      p.vRotX = (rand() - 0.5) * 11;
      p.vRotY = (rand() - 0.5) * 9;
      p.vRotZ = (rand() - 0.5) * 11;
      p.scale = 0.85 + rand() * 0.55;

      confettiDummy.position.set(p.x, p.y, p.z);
      confettiDummy.rotation.set(p.rotX, p.rotY, p.rotZ);
      confettiDummy.scale.setScalar(p.scale);
      confettiDummy.updateMatrix();
      confettiMesh.setMatrixAt(i, confettiDummy.matrix);
    }
    confettiMesh.instanceMatrix.needsUpdate = true;

    const tickerState = { t: 0 };
    director.register(
      createManagedGsapTimeline({
        id: 'endgame:confetti',
        category: 'endgame',
        blocksIdleSleep: true,
        build: (tl) => {
          tl.to(tickerState, {
            t: CONFETTI_DURATION_SEC,
            duration: CONFETTI_DURATION_SEC,
            ease: 'none',
            onUpdate: () => {
              const stepDt = Math.max(0, tickerState.t - confettiElapsed);
              confettiElapsed = tickerState.t;
              if (stepDt <= 0) return;

              const drag = Math.exp(-1.15 * stepDt);
              for (let i = 0; i < activeConfettiCount; i++) {
                const p = confettiParticles[i];
                p.vx *= drag;
                p.vz *= drag;
                p.vy -= 4.2 * stepDt;
                p.x += p.vx * stepDt;
                p.y += p.vy * stepDt;
                p.z += p.vz * stepDt;
                p.rotX += p.vRotX * stepDt;
                p.rotY += p.vRotY * stepDt;
                p.rotZ += p.vRotZ * stepDt;

                if (p.y < PODIUM_BASE_Y) {
                  p.y = PODIUM_BASE_Y;
                  p.vy = 0;
                  p.vx *= 0.4;
                  p.vz *= 0.4;
                }

                confettiDummy.position.set(p.x, p.y, p.z);
                confettiDummy.rotation.set(p.rotX, p.rotY, p.rotZ);
                confettiDummy.scale.setScalar(p.scale);
                confettiDummy.updateMatrix();
                confettiMesh.setMatrixAt(i, confettiDummy.matrix);
              }
              confettiMesh.instanceMatrix.needsUpdate = true;

              if (confettiElapsed > 2.5) {
                confettiMat.opacity = Math.max(
                  0,
                  1 - (confettiElapsed - 2.5) / (CONFETTI_DURATION_SEC - 2.5)
                );
              } else {
                confettiMat.opacity = 1;
              }
            },
          });
        },
        onComplete: resetConfettiPool,
        onCancel: resetConfettiPool,
      }),
      'cancel'
    );
  };

  const cancelAll = (): void => {
    active = false;
    trophyRiseRemainingSec = 0;

    director.cancelCategory('endgame');
    bankruptcyExitingIds.clear();

    podiumRoot.visible = false;
    podiumRoot.scale.set(1, 1, 1);
    podiumRoot.position.set(0, PODIUM_BASE_Y, 0);

    revealRingMesh.visible = false;
    revealRingMesh.scale.set(1, 1, 1);
    revealRingMat.opacity = 0;

    resetConfettiPool();
    winnerPoses.clear();

    if (trophyMixer) {
      trophyMixer.stopAllAction();
    }
    if (activeRigController) {
      activeRigController.resetCeremonyRoles();
    }
    onShadowDirty?.();
  };

  const startCeremony = (opts: EndgameCeremonyStartOptions): void => {
    if (disposed) return;

    director.cancelCategory('endgame');

    active = true;
    activeRigController = opts.characterRigs;
    winnerPoses.clear();

    const uniqueWinners = Array.from(new Set(opts.winnerIds));
    const winnerSet = new Set(uniqueWinners);
    const totalSlots = Math.max(1, uniqueWinners.length);
    uniqueWinners.forEach((pid, idx) => {
      winnerPoses.set(pid, computePodiumSlotWorldPos(idx, totalSlots));
    });

    if (opts.characterRigs) {
      for (const p of opts.players) {
        opts.characterRigs.setCeremonyRole(
          p.id,
          winnerSet.has(p.id) ? 'winner' : 'defeated'
        );
      }
    }

    const reducedMotion = getReducedMotion();
    const tier = getQualityTier();

    // 1. Victory Reveal Ring (ANIM-END-01)
    revealRingMesh.visible = true;
    revealRingMesh.scale.set(0.55, 0.55, 1);
    revealRingMat.opacity = 0.85;
    director.register(
      createManagedGsapTimeline({
        id: 'endgame:reveal',
        category: 'endgame',
        blocksIdleSleep: true,
        build: (tl) => {
          tl.to(revealRingMesh.scale, {
            x: 1.95,
            y: 1.95,
            duration: reducedMotion ? 0.2 : 0.45,
            ease: 'expo.out',
          }).to(
            revealRingMat,
            {
              opacity: 0,
              duration: reducedMotion ? 0.2 : 0.45,
              ease: 'power2.out',
            },
            0
          );
        },
        onComplete: () => {
          revealRingMesh.visible = false;
        },
        onCancel: () => {
          revealRingMesh.visible = false;
        },
      }),
      'cancel'
    );

    // 2. Podium & Golden Cup Rise (ANIM-END-02)
    podiumRoot.visible = true;
    if (reducedMotion) {
      podiumRoot.position.set(0, PODIUM_BASE_Y, 0);
      podiumRoot.scale.set(0.92, 0.92, 0.92);
      director.register(
        createManagedGsapTimeline({
          id: 'endgame:podium',
          category: 'endgame',
          blocksIdleSleep: true,
          build: (tl) => {
            tl.to(podiumRoot.scale, {
              x: 1,
              y: 1,
              z: 1,
              duration: 0.2,
              ease: 'power2.out',
            });
          },
          onComplete: () => {
            podiumRoot.scale.set(1, 1, 1);
            onShadowDirty?.();
          },
          onCancel: () => {
            podiumRoot.position.set(0, PODIUM_BASE_Y, 0);
            podiumRoot.scale.set(1, 1, 1);
          },
        }),
        'cancel'
      );
    } else {
      podiumRoot.position.set(0, PODIUM_BASE_Y - 0.42, 0);
      podiumRoot.scale.set(0.25, 0.1, 0.25);
      director.register(
        createManagedGsapTimeline({
          id: 'endgame:podium',
          category: 'endgame',
          blocksIdleSleep: true,
          build: (tl) => {
            tl.to(podiumRoot.position, {
              y: PODIUM_BASE_Y,
              duration: 0.75,
              ease: 'back.out(1.4)',
            }).to(
              podiumRoot.scale,
              {
                x: 1,
                y: 1,
                z: 1,
                duration: 0.75,
                ease: 'back.out(1.4)',
              },
              0
            );
          },
          onComplete: () => {
            podiumRoot.position.set(0, PODIUM_BASE_Y, 0);
            podiumRoot.scale.set(1, 1, 1);
            onShadowDirty?.();
          },
          onCancel: () => {
            podiumRoot.position.set(0, PODIUM_BASE_Y, 0);
            podiumRoot.scale.set(1, 1, 1);
          },
        }),
        'cancel'
      );
    }

    ensureTrophyGlbLoaded();
    syncTrophyMixerPlayback();

    // 3. Pooled InstancedMesh 3D Confetti Fireworks (ANIM-END-05)
    const confettiCount = resolveConfettiCountForTier(tier, reducedMotion);
    launchConfettiBurst(confettiCount);
    onShadowDirty?.();
  };

  const playBankruptcyExit = (playerId: number, tokenGroup: THREE.Group): void => {
    if (disposed || active) return;
    bankruptcyExitingIds.add(playerId);
    tokenGroup.visible = true;
    const reducedMotion = getReducedMotion();
    const duration = reducedMotion ? 0.25 : 0.75;

    const finishExit = () => {
      bankruptcyExitingIds.delete(playerId);
      tokenGroup.visible = false;
      tokenGroup.scale.set(1, 1, 1);
      onShadowDirty?.();
    };

    director.register(
      createManagedGsapTimeline({
        id: `endgame:bankrupt:${playerId}`,
        category: 'endgame',
        blocksIdleSleep: true,
        build: (tl) => {
          tl.to(tokenGroup.scale, {
            x: 0.05,
            y: 0.05,
            z: 0.05,
            duration,
            ease: reducedMotion ? 'power1.out' : 'power3.in',
          });
        },
        onComplete: finishExit,
        onCancel: finishExit,
      }),
      'cancel'
    );
  };

  const dispose = (): void => {
    if (disposed) return;
    disposed = true;
    cancelAll();
    director.unregisterMixer('endgame:trophy');
    if (trophyMixer && trophyRigScene) {
      trophyMixer.uncacheRoot(trophyRigScene);
    }
    disposeGroupSubtree(fallbackGroup);
    fallbackGroup = null;
    if (trophyRigScene) {
      trophyRigScene.removeFromParent();
      trophyRigScene = null;
    }
    podiumRoot.removeFromParent();
    revealRingMesh.removeFromParent();
    revealRingGeo.dispose();
    revealRingMat.dispose();
    confettiMesh.removeFromParent();
    confettiGeo.dispose();
    confettiMat.dispose();
    activeRigController = null;
  };

  return {
    isActive: () => active,
    isConfettiActive: () => activeConfettiCount > 0,
    getActiveConfettiCount: () => activeConfettiCount,
    getCeremonyPawnPose: (playerId: number) => winnerPoses.get(playerId) ?? null,
    isBankruptcyExiting: (playerId: number) => bankruptcyExitingIds.has(playerId),
    startCeremony,
    playBankruptcyExit,
    cancelAll,
    dispose,
  };
}
