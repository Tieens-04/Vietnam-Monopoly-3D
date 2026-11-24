import * as THREE from 'three';
import { GraphicsQualityTier, TacticalDiceChoice } from '../game/types';
import { AnimationDirector, createManagedGsapTimeline } from './animationDirector';

export interface DiceEffectsSystemOptions {
  scene: THREE.Scene;
  director: AnimationDirector;
}

export interface DiceEffectsSystem {
  triggerAnticipation: (choice: TacticalDiceChoice, reducedMotion: boolean) => void;
  triggerCollisionSparks: (
    x: number,
    y: number,
    z: number,
    intensity: number,
    qualityTier: GraphicsQualityTier,
    reducedMotion: boolean
  ) => void;
  triggerSettle: (
    pos1: THREE.Vector3,
    pos2: THREE.Vector3,
    isDoubles: boolean,
    choice: TacticalDiceChoice,
    qualityTier: GraphicsQualityTier,
    reducedMotion: boolean
  ) => void;
  triggerStepDust: (x: number, z: number, reducedMotion: boolean) => void;
  cancelAll: () => void;
  dispose: () => void;
}

const SPARK_POOL_SIZE = 16;
const RING_SURFACE_Y = 0.175;
const TILE_DUST_Y = 0.448;

export function createDiceEffectsSystem(
  options: DiceEffectsSystemOptions
): DiceEffectsSystem {
  const { scene, director } = options;

  const group = new THREE.Group();
  group.name = 'diceEffectsRoot';
  scene.add(group);

  const ringGeo = new THREE.RingGeometry(0.26, 0.42, 24);
  ringGeo.rotateX(-Math.PI / 2);

  const wideRingGeo = new THREE.RingGeometry(0.45, 0.68, 32);
  wideRingGeo.rotateX(-Math.PI / 2);

  const dustGeo = new THREE.RingGeometry(0.16, 0.31, 20);
  dustGeo.rotateX(-Math.PI / 2);

  const makeRing = (
    geo: THREE.BufferGeometry,
    colorHex: number
  ): { mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial } => {
    const mat = new THREE.MeshBasicMaterial({
      color: colorHex,
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.visible = false;
    group.add(mesh);
    return { mesh, mat };
  };

  const landRing1 = makeRing(ringGeo, 0xffffff);
  const landRing2 = makeRing(ringGeo, 0xffffff);
  const doublesWave = makeRing(wideRingGeo, 0xfacc15);
  const tacticalAura = makeRing(wideRingGeo, 0x0ea5e9);
  const dustRing1 = makeRing(dustGeo, 0xf8fafc);
  const dustRing2 = makeRing(dustGeo, 0xf8fafc);
  let dustCursor = 0;

  const sparkGeo = new THREE.OctahedronGeometry(0.055, 0);
  const sparkMat = new THREE.MeshBasicMaterial({
    color: 0xfde047,
    transparent: true,
    opacity: 0.9,
  });
  const sparkMesh = new THREE.InstancedMesh(sparkGeo, sparkMat, SPARK_POOL_SIZE);
  sparkMesh.count = 0;
  sparkMesh.frustumCulled = false;
  sparkMesh.visible = false;
  group.add(sparkMesh);

  const sparkDummy = new THREE.Object3D();
  const sparkVel = new Float32Array(SPARK_POOL_SIZE * 3);
  const sparkOrigin = new THREE.Vector3();

  const resolveTacticalHex = (choice: TacticalDiceChoice): number =>
    choice === 'EVEN' ? 0x0ea5e9 : choice === 'ODD' ? 0xa855f7 : 0xfef3c7;

  const triggerAnticipation = (
    choice: TacticalDiceChoice,
    reducedMotion: boolean
  ): void => {
    tacticalAura.mat.color.setHex(resolveTacticalHex(choice));
    tacticalAura.mesh.position.set(1.3, RING_SURFACE_Y + 0.01, 1.3);
    tacticalAura.mesh.scale.setScalar(reducedMotion ? 1.15 : 0.65);
    tacticalAura.mesh.visible = true;
    tacticalAura.mat.opacity = 0.55;

    const animState = { s: reducedMotion ? 1.15 : 0.65, o: 0.55 };
    director.register(
      createManagedGsapTimeline({
        id: 'dice:anticipation',
        category: 'dice',
        blocksIdleSleep: true,
        build: (tl) => {
          tl.to(animState, {
            s: reducedMotion ? 1.2 : 1.45,
            o: 0,
            duration: 0.24,
            ease: 'power2.out',
            onUpdate: () => {
              tacticalAura.mesh.scale.setScalar(animState.s);
              tacticalAura.mat.opacity = animState.o;
            },
          });
        },
        onComplete: () => {
          tacticalAura.mesh.visible = false;
        },
        onCancel: () => {
          tacticalAura.mesh.visible = false;
        },
      }),
      'fastForward'
    );
  };

  const launchSparks = (
    timelineId: string,
    x: number,
    y: number,
    z: number,
    count: number,
    colorHex: number,
    durationSec: number
  ): void => {
    const activeCount = Math.min(SPARK_POOL_SIZE, Math.max(1, count));
    sparkOrigin.set(x, y, z);
    sparkMat.color.setHex(colorHex);
    sparkMesh.count = activeCount;
    sparkMesh.visible = true;

    for (let i = 0; i < activeCount; i++) {
      const a = (i / activeCount) * Math.PI * 2 + (i % 2) * 0.25;
      const spd = 1.2 + (i % 3) * 0.55;
      sparkVel[i * 3] = Math.cos(a) * spd;
      sparkVel[i * 3 + 1] = 1.15 + (i % 2) * 0.5;
      sparkVel[i * 3 + 2] = Math.sin(a) * spd;
    }

    const animState = { p: 0 };
    director.register(
      createManagedGsapTimeline({
        id: timelineId,
        category: 'dice',
        blocksIdleSleep: true,
        build: (tl) => {
          tl.to(animState, {
            p: 1,
            duration: durationSec,
            ease: 'power2.out',
            onUpdate: () => {
              const p = animState.p;
              const scale = Math.max(0.01, 1 - p);
              for (let i = 0; i < activeCount; i++) {
                sparkDummy.position.set(
                  sparkOrigin.x + sparkVel[i * 3] * p * 0.55,
                  Math.max(
                    RING_SURFACE_Y,
                    sparkOrigin.y + sparkVel[i * 3 + 1] * p * 0.4 - p * p * 0.45
                  ),
                  sparkOrigin.z + sparkVel[i * 3 + 2] * p * 0.55
                );
                sparkDummy.scale.setScalar(scale);
                sparkDummy.rotation.set(p * 4, p * 3, 0);
                sparkDummy.updateMatrix();
                sparkMesh.setMatrixAt(i, sparkDummy.matrix);
              }
              sparkMesh.instanceMatrix.needsUpdate = true;
            },
          });
        },
        onComplete: () => {
          sparkMesh.visible = false;
          sparkMesh.count = 0;
        },
        onCancel: () => {
          sparkMesh.visible = false;
          sparkMesh.count = 0;
        },
      }),
      'fastForward'
    );
  };

  const triggerCollisionSparks = (
    x: number,
    y: number,
    z: number,
    intensity: number,
    qualityTier: GraphicsQualityTier,
    reducedMotion: boolean
  ): void => {
    if (reducedMotion || qualityTier === 'low' || intensity <= 0.55) {
      return;
    }
    launchSparks('dice:sparks', x, y, z, qualityTier === 'high' ? 6 : 4, 0xfef08a, 0.24);
  };

  const triggerSettle = (
    pos1: THREE.Vector3,
    pos2: THREE.Vector3,
    isDoubles: boolean,
    choice: TacticalDiceChoice,
    qualityTier: GraphicsQualityTier,
    reducedMotion: boolean
  ): void => {
    const ringHex = choice === 'NORMAL' ? 0xf8fafc : resolveTacticalHex(choice);
    const animateRingPair = (
      id: string,
      ringObj: { mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial },
      pos: THREE.Vector3,
      colorHex: number,
      targetScale: number,
      dur: number
    ) => {
      ringObj.mat.color.setHex(colorHex);
      ringObj.mesh.position.set(pos.x, RING_SURFACE_Y, pos.z);
      ringObj.mesh.scale.setScalar(reducedMotion ? targetScale * 0.85 : 0.4);
      ringObj.mesh.visible = true;
      ringObj.mat.opacity = 0.72;

      const s = { scale: ringObj.mesh.scale.x, opacity: 0.72 };
      director.register(
        createManagedGsapTimeline({
          id,
          category: 'dice',
          blocksIdleSleep: true,
          build: (tl) => {
            tl.to(s, {
              scale: targetScale,
              opacity: 0,
              duration: reducedMotion ? 0.16 : dur,
              ease: 'power2.out',
              onUpdate: () => {
                ringObj.mesh.scale.setScalar(s.scale);
                ringObj.mat.opacity = s.opacity;
              },
            });
          },
          onComplete: () => {
            ringObj.mesh.visible = false;
          },
          onCancel: () => {
            ringObj.mesh.visible = false;
          },
        }),
        'fastForward'
      );
    };

    animateRingPair('dice:land1', landRing1, pos1, ringHex, 1.65, 0.32);
    animateRingPair('dice:land2', landRing2, pos2, ringHex, 1.65, 0.32);

    if (isDoubles) {
      const mid = new THREE.Vector3()
        .addVectors(pos1, pos2)
        .multiplyScalar(0.5);
      animateRingPair('dice:doublesWave', doublesWave, mid, 0xfacc15, 2.75, 0.52);
      if (!reducedMotion && qualityTier !== 'low') {
        launchSparks(
          'dice:doublesSparks',
          mid.x,
          RING_SURFACE_Y + 0.15,
          mid.z,
          qualityTier === 'high' ? 12 : 7,
          0xfacc15,
          0.42
        );
      }
    }
  };

  const triggerStepDust = (
    x: number,
    z: number,
    reducedMotion: boolean
  ): void => {
    if (reducedMotion) return;
    dustCursor = (dustCursor + 1) % 2;
    const target = dustCursor === 0 ? dustRing1 : dustRing2;
    const id = `dice:stepDust:${dustCursor}`;
    target.mesh.position.set(x, TILE_DUST_Y, z);
    target.mesh.scale.setScalar(0.45);
    target.mat.opacity = 0.48;
    target.mesh.visible = true;

    const s = { scale: 0.45, opacity: 0.48 };
    director.register(
      createManagedGsapTimeline({
        id,
        category: 'dice',
        blocksIdleSleep: true,
        build: (tl) => {
          tl.to(s, {
            scale: 1.35,
            opacity: 0,
            duration: 0.22,
            ease: 'power2.out',
            onUpdate: () => {
              target.mesh.scale.setScalar(s.scale);
              target.mat.opacity = s.opacity;
            },
          });
        },
        onComplete: () => {
          target.mesh.visible = false;
        },
        onCancel: () => {
          target.mesh.visible = false;
        },
      }),
      'fastForward'
    );
  };

  const hideAllMeshes = () => {
    for (const r of [landRing1, landRing2, doublesWave, tacticalAura, dustRing1, dustRing2]) {
      r.mesh.visible = false;
    }
    sparkMesh.visible = false;
    sparkMesh.count = 0;
  };

  const cancelAll = (): void => {
    director.cancelCategory('dice');
    hideAllMeshes();
  };

  const dispose = (): void => {
    cancelAll();
    group.removeFromParent();
    ringGeo.dispose();
    wideRingGeo.dispose();
    dustGeo.dispose();
    sparkGeo.dispose();
    sparkMat.dispose();
    for (const r of [landRing1, landRing2, doublesWave, tacticalAura, dustRing1, dustRing2]) {
      r.mat.dispose();
    }
  };

  return {
    triggerAnticipation,
    triggerCollisionSparks,
    triggerSettle,
    triggerStepDust,
    cancelAll,
    dispose,
  };
}
