import * as THREE from 'three';
import { GraphicsQualityTier, PlayerState } from '../game/types';
import { AnimationDirector, createManagedGsapTimeline } from './animationDirector';
import { CharacterClipName, CHARACTER_CLIP_NAMES, GltfAssetPool } from './gltfAssetPool';
import { createPlayerTokenMesh, NightLightingPalette } from './models';

export type PawnReactionKind =
  | 'anticipation'
  | 'cash_gain'
  | 'cash_pay'
  | 'buy_proud'
  | 'jail'
  | 'bankrupt'
  | 'victory';

export type HopPhase = 'takeoff' | 'airborne' | 'land';

export type CharacterCeremonyRole = 'none' | 'winner' | 'defeated';

export interface HopKinematicsSample {
  heightY: number;
  scaleX: number;
  scaleY: number;
  scaleZ: number;
  bankRollZ: number;
  phase: HopPhase;
}

export interface CharacterRigControllerOptions {
  scene: THREE.Scene;
  director: AnimationDirector;
  gltfPool: GltfAssetPool;
  nightPalette?: NightLightingPalette;
  getQualityTier: () => GraphicsQualityTier;
  getReducedMotion: () => boolean;
  onAssetSwapped?: () => void;
}

export interface CharacterRigController {
  getModelUrl: (tokenType: PlayerState['tokenType']) => string;
  ensurePlayerToken: (player: PlayerState, initialWorldPos: THREE.Vector3) => THREE.Group;
  syncIdleState: (
    playerId: number,
    state: { inJail: boolean; bankrupt: boolean; isActiveTurn: boolean }
  ) => void;
  onHopStep: (playerId: number, phase: HopPhase, isCornerStep: boolean) => void;
  playReaction: (playerId: number, reaction: PawnReactionKind) => void;
  setCeremonyRole: (playerId: number, role: CharacterCeremonyRole) => void;
  resetCeremonyRoles: () => void;
  removePlayer: (playerId: number) => void;
  dispose: () => void;
}

interface ManagedPlayerEntry {
  playerId: number;
  tokenType: PlayerState['tokenType'];
  colorHex: string;
  generation: number;
  rootGroup: THREE.Group;
  visualSlot: THREE.Group;
  fallbackMesh: THREE.Group | null;
  rigRoot: THREE.Object3D | null;
  mixer: THREE.AnimationMixer | null;
  actions: Partial<Record<CharacterClipName, THREE.AnimationAction>>;
  currentClip: CharacterClipName | null;
  restingClip: 'idle_loop' | 'jailed_loop';
  oneShotRemainingSec: number;
  inJail: boolean;
  bankrupt: boolean;
  ceremonyRole: CharacterCeremonyRole;
}

const LOOP_CLIPS = new Set<CharacterClipName>([
  'idle_loop',
  'jailed_loop',
  'victory_dance',
]);

const DEFAULT_FALLBACK_REST_YAW = Math.PI / 4;

/**
 * Wraps shortest angular delta `(to - from)` strictly into `[-PI, PI]`.
 */
export function computeShortestYawDelta(fromRad: number, toRad: number): number {
  let delta = (toRad - fromRad) % (Math.PI * 2);
  if (delta > Math.PI) delta -= Math.PI * 2;
  if (delta < -Math.PI) delta += Math.PI * 2;
  return delta;
}

/**
 * Computes Three.js Y-axis yaw for a pawn facing local `+Z` moving from `(fromX, fromZ)` to `(toX, toZ)`.
 */
export function computeTravelYaw(
  fromX: number,
  fromZ: number,
  toX: number,
  toZ: number,
  fallbackYaw = DEFAULT_FALLBACK_REST_YAW
): number {
  const dx = toX - fromX;
  const dz = toZ - fromZ;
  if (dx * dx + dz * dz < 1e-6) {
    return fallbackYaw;
  }
  return Math.atan2(dx, dz);
}

export function isBoardCornerTile(tileIndex: number): boolean {
  return tileIndex === 0 || tileIndex === 8 || tileIndex === 16 || tileIndex === 24;
}

/**
 * 3-phase Business Tour / Monopoly Madness hop curve:
 * - Takeoff (`u < 0.18`): vertical stretch push-off
 * - Airborne (`0.18 <= u <= 0.78`): 0.92u parabolic arc + optional corner banking roll
 * - Landing (`u > 0.78`): elastic squash compression returning to volume 1.0
 */
export function computeHopKinematics(
  u: number,
  isCornerStep: boolean,
  bankSign = 1
): HopKinematicsSample {
  const clampedU = Math.max(0, Math.min(1, Number.isFinite(u) ? u : 0));
  const arc = Math.sin(clampedU * Math.PI);
  const heightY = arc * 0.92;

  let phase: HopPhase;
  let scaleY = 1;
  if (clampedU < 0.18) {
    phase = 'takeoff';
    const t = clampedU / 0.18;
    scaleY = 1 + Math.sin(t * Math.PI * 0.5) * 0.14;
  } else if (clampedU <= 0.78) {
    phase = 'airborne';
    const t = (clampedU - 0.18) / 0.6;
    scaleY = 1 + Math.sin(t * Math.PI) * 0.08;
  } else {
    phase = 'land';
    const t = (clampedU - 0.78) / 0.22;
    scaleY = 1 - Math.sin(t * Math.PI) * 0.16;
  }

  const invSq = 1 / Math.sqrt(Math.max(0.5, scaleY));
  const bankRollZ = isCornerStep ? bankSign * 0.18 * arc : 0;

  return {
    heightY,
    scaleX: invSq,
    scaleY,
    scaleZ: invSq,
    bankRollZ,
    phase,
  };
}

/**
 * Safely clones owner-tinted materials on a GLB clone without mutating cached templates
 * and marks all template geometries `sharedStatic = true`.
 */
export function applyOwnerColorTintToRig(root: THREE.Object3D, colorHex: string): void {
  const primary = new THREE.Color(colorHex);
  const darker = primary.clone().multiplyScalar(0.74);
  const clonedMap = new Map<THREE.Material, THREE.Material>();

  const tintMaterial = (mat: THREE.Material): THREE.Material => {
    const isSuit = mat.name === 'mat_suit';
    const isSuitDark = mat.name === 'mat_suit_dark';
    if (!isSuit && !isSuitDark) {
      return mat;
    }
    const existing = clonedMap.get(mat);
    if (existing) return existing;

    const cloned = mat.clone();
    cloned.userData = { ...cloned.userData, rigInstanceCloned: true };
    if (cloned instanceof THREE.MeshStandardMaterial) {
      cloned.color.copy(isSuit ? primary : darker);
      cloned.needsUpdate = true;
    }
    clonedMap.set(mat, cloned);
    return cloned;
  };

  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.castShadow = true;
    if (mesh.geometry) {
      mesh.geometry.userData = { ...mesh.geometry.userData, sharedStatic: true };
    }
    if (Array.isArray(mesh.material)) {
      mesh.material = mesh.material.map(tintMaterial);
    } else if (mesh.material) {
      mesh.material = tintMaterial(mesh.material);
    }
  });
}

function disposeFallbackMesh(group: THREE.Group | null): void {
  if (!group) return;
  group.removeFromParent();
  group.traverse((obj) => {
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

function disposeRigMaterials(root: THREE.Object3D | null): void {
  if (!root) return;
  root.removeFromParent();
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    const disposeMat = (m: THREE.Material) => {
      if (m.userData?.rigInstanceCloned && !m.userData?.sharedStatic) {
        m.dispose();
      }
    };
    if (Array.isArray(mesh.material)) {
      mesh.material.forEach(disposeMat);
    } else if (mesh.material) {
      disposeMat(mesh.material);
    }
  });
}

export function createCharacterRigController(
  options: CharacterRigControllerOptions
): CharacterRigController {
  const {
    scene,
    director,
    gltfPool,
    nightPalette,
    getQualityTier,
    getReducedMotion,
    onAssetSwapped,
  } = options;
  const entries = new Map<number, ManagedPlayerEntry>();
  let disposed = false;

  const getModelUrl = (tokenType: PlayerState['tokenType']): string =>
    `/assets/models/pawn_${tokenType}.glb`;

  const transitionToClip = (
    entry: ManagedPlayerEntry,
    clipName: CharacterClipName,
    fadeSec = 0.14
  ): THREE.AnimationAction | null => {
    const nextAction = entry.actions[clipName];
    if (!nextAction) return null;

    if (entry.currentClip === clipName && LOOP_CLIPS.has(clipName)) {
      nextAction.enabled = true;
      return nextAction;
    }

    const prevAction = entry.currentClip ? entry.actions[entry.currentClip] : null;
    nextAction.reset();
    nextAction.enabled = true;
    nextAction.setEffectiveTimeScale(1);
    nextAction.setEffectiveWeight(1);
    if (LOOP_CLIPS.has(clipName)) {
      nextAction.setLoop(THREE.LoopRepeat, Infinity);
      nextAction.clampWhenFinished = false;
    } else {
      nextAction.setLoop(THREE.LoopOnce, 1);
      nextAction.clampWhenFinished = true;
    }
    nextAction.play();

    if (prevAction && prevAction !== nextAction) {
      prevAction.crossFadeTo(nextAction, fadeSec, false);
    }
    entry.currentClip = clipName;
    return nextAction;
  };

  const cleanupEntryResources = (entry: ManagedPlayerEntry): void => {
    entry.generation += 1;
    director.unregisterMixer(`pawn:${entry.playerId}`);
    if (entry.mixer && entry.rigRoot) {
      entry.mixer.stopAllAction();
      entry.mixer.uncacheRoot(entry.rigRoot);
    }
    disposeFallbackMesh(entry.fallbackMesh);
    disposeRigMaterials(entry.rigRoot);
    entry.fallbackMesh = null;
    entry.rigRoot = null;
    entry.mixer = null;
    entry.actions = {};
    entry.rootGroup.removeFromParent();
  };

  const beginAsyncGlbUpgrade = (entry: ManagedPlayerEntry): void => {
    const targetGen = entry.generation;
    const url = getModelUrl(entry.tokenType);

    void gltfPool.acquireClone(url).then((cloned) => {
      if (disposed || entry.generation !== targetGen || entries.get(entry.playerId) !== entry) {
        if (cloned) {
          disposeRigMaterials(cloned.scene);
        }
        return;
      }
      if (!cloned) {
        return;
      }

      applyOwnerColorTintToRig(cloned.scene, entry.colorHex);
      cloned.scene.position.set(0, 0, 0);

      // Swap fallback procedural pawn cleanly out for rigged GLB
      disposeFallbackMesh(entry.fallbackMesh);
      entry.fallbackMesh = null;
      entry.rigRoot = cloned.scene;
      entry.visualSlot.add(cloned.scene);

      const rawMixer = new THREE.AnimationMixer(cloned.scene);
      const actions: Partial<Record<CharacterClipName, THREE.AnimationAction>> = {};
      for (const clip of cloned.animations) {
        if ((CHARACTER_CLIP_NAMES as readonly string[]).includes(clip.name)) {
          const name = clip.name as CharacterClipName;
          actions[name] = rawMixer.clipAction(clip);
        }
      }

      entry.mixer = rawMixer;
      entry.actions = actions;
      entry.restingClip = entry.inJail ? 'jailed_loop' : 'idle_loop';
      if (entry.ceremonyRole === 'winner' && actions.victory_dance) {
        transitionToClip(entry, 'victory_dance', 0.05);
        rawMixer.update(getQualityTier() === 'low' || getReducedMotion() ? 0.42 : 0.001);
      } else if (entry.ceremonyRole === 'defeated' && actions.defeat_slump) {
        const slumpAct = transitionToClip(entry, 'defeat_slump', 0.05);
        if (getQualityTier() === 'low' || getReducedMotion()) {
          entry.oneShotRemainingSec = 0;
          rawMixer.update(0.88);
        } else {
          entry.oneShotRemainingSec = slumpAct
            ? Math.max(0.14, slumpAct.getClip().duration)
            : 0.9;
          rawMixer.update(0.001);
        }
      } else {
        transitionToClip(entry, entry.restingClip, 0.05);
        // Sample resting pose once so skinned mesh shows immediate initial frame cleanly
        rawMixer.update(0.001);
      }

      director.registerMixer({
        id: `pawn:${entry.playerId}`,
        category: 'character',
        mixer: {
          update: (dt: number) => {
            rawMixer.update(dt);
            if (entry.oneShotRemainingSec > 0) {
              entry.oneShotRemainingSec -= dt;
              if (entry.oneShotRemainingSec <= 0) {
                entry.oneShotRemainingSec = 0;
                if (!entry.bankrupt && entry.ceremonyRole === 'none') {
                  transitionToClip(entry, entry.restingClip, 0.14);
                }
              }
            }
          },
          stopAllAction: () => {
            rawMixer.stopAllAction();
          },
        },
        isActive: () => {
          if (entry.ceremonyRole === 'defeated') {
            return entry.oneShotRemainingSec > 0;
          }
          if (entry.ceremonyRole === 'winner') {
            return !getReducedMotion() && getQualityTier() !== 'low';
          }
          if (entry.bankrupt && entry.oneShotRemainingSec <= 0) return false;
          if (entry.oneShotRemainingSec > 0) return true;
          if (getReducedMotion()) return false;
          // Freeze idle_loop / jailed_loop strictly on Low tier to preserve 0 FPS idle
          return getQualityTier() !== 'low';
        },
        blocksIdleSleep: () => entry.oneShotRemainingSec > 0,
      });

      onAssetSwapped?.();
    });
  };

  const ensurePlayerToken = (
    player: PlayerState,
    initialWorldPos: THREE.Vector3
  ): THREE.Group => {
    const existing = entries.get(player.id);
    if (existing) {
      if (existing.tokenType === player.tokenType) {
        if (existing.colorHex !== player.color) {
          existing.colorHex = player.color;
          existing.rootGroup.userData.color = player.color;
          if (existing.rigRoot) {
            applyOwnerColorTintToRig(existing.rigRoot, player.color);
          } else if (existing.fallbackMesh) {
            disposeFallbackMesh(existing.fallbackMesh);
            const nextFallback = createPlayerTokenMesh(
              player.tokenType,
              player.color,
              nightPalette
            );
            existing.fallbackMesh = nextFallback;
            existing.visualSlot.add(nextFallback);
          }
        }
        return existing.rootGroup;
      }
      cleanupEntryResources(existing);
      entries.delete(player.id);
    }

    const rootGroup = new THREE.Group();
    rootGroup.userData.playerId = player.id;
    rootGroup.userData.tokenType = player.tokenType;
    rootGroup.userData.color = player.color;
    rootGroup.position.copy(initialWorldPos);

    const visualSlot = new THREE.Group();
    const fallbackMesh = createPlayerTokenMesh(
      player.tokenType,
      player.color,
      nightPalette
    );
    visualSlot.add(fallbackMesh);
    rootGroup.add(visualSlot);
    scene.add(rootGroup);

    const entry: ManagedPlayerEntry = {
      playerId: player.id,
      tokenType: player.tokenType,
      colorHex: player.color,
      generation: 1,
      rootGroup,
      visualSlot,
      fallbackMesh,
      rigRoot: null,
      mixer: null,
      actions: {},
      currentClip: null,
      restingClip: player.inJail ? 'jailed_loop' : 'idle_loop',
      oneShotRemainingSec: 0,
      inJail: player.inJail,
      bankrupt: player.bankrupt,
      ceremonyRole: 'none',
    };
    entries.set(player.id, entry);
    beginAsyncGlbUpgrade(entry);
    return rootGroup;
  };

  const syncIdleState = (
    playerId: number,
    state: { inJail: boolean; bankrupt: boolean; isActiveTurn: boolean }
  ): void => {
    const entry = entries.get(playerId);
    if (!entry) return;
    entry.inJail = state.inJail;
    entry.bankrupt = state.bankrupt;
    const nextRest: 'idle_loop' | 'jailed_loop' = state.inJail
      ? 'jailed_loop'
      : 'idle_loop';
    entry.restingClip = nextRest;

    if (
      entry.ceremonyRole === 'none' &&
      entry.mixer &&
      entry.oneShotRemainingSec <= 0 &&
      !state.bankrupt
    ) {
      if (entry.currentClip !== nextRest && entry.currentClip !== 'victory_dance') {
        transitionToClip(entry, nextRest, 0.16);
      }
    }
  };

  const onHopStep = (
    playerId: number,
    phase: HopPhase,
    isCornerStep: boolean
  ): void => {
    const entry = entries.get(playerId);
    if (!entry || !entry.mixer) return;
    const desired: CharacterClipName = isCornerStep
      ? 'corner_bank'
      : phase === 'takeoff'
        ? 'hop_takeoff'
        : phase === 'land'
          ? 'hop_land'
          : 'hop_airborne';

    if (entry.currentClip !== desired) {
      const act = transitionToClip(entry, desired, 0.08);
      if (act) {
        entry.oneShotRemainingSec = Math.max(
          entry.oneShotRemainingSec,
          Math.min(0.24, act.getClip().duration)
        );
      }
    }
  };

  const playReaction = (playerId: number, reaction: PawnReactionKind): void => {
    const entry = entries.get(playerId);
    if (!entry) return;

    const clipMap: Record<PawnReactionKind, CharacterClipName> = {
      anticipation: 'anticipation',
      cash_gain: 'celebrate_short',
      cash_pay: 'stressed_slump',
      buy_proud: 'proud_gesture',
      jail: 'jailed_loop',
      bankrupt: 'defeat_slump',
      victory: 'victory_dance',
    };
    const clipName = clipMap[reaction];

    if (entry.mixer && entry.actions[clipName]) {
      const action = transitionToClip(entry, clipName, 0.1);
      if (action) {
        if (clipName === 'victory_dance') {
          entry.oneShotRemainingSec = 0;
        } else if (clipName === 'jailed_loop') {
          entry.restingClip = 'jailed_loop';
          entry.oneShotRemainingSec = 0.25;
        } else {
          entry.oneShotRemainingSec = Math.max(0.14, action.getClip().duration);
        }
      }
      return;
    }

    // Lightweight procedural fallback bounce via paused GSAP timeline
    if (getReducedMotion()) return;
    const slot = entry.visualSlot;
    director.register(
      createManagedGsapTimeline({
        id: `pawn-fallback:${playerId}`,
        category: 'character',
        blocksIdleSleep: true,
        build: (tl) => {
          if (reaction === 'cash_gain' || reaction === 'buy_proud' || reaction === 'victory') {
            tl.to(slot.position, { y: 0.14, duration: 0.16, ease: 'power2.out' }).to(
              slot.position,
              { y: 0, duration: 0.2, ease: 'bounce.out' }
            );
          } else if (reaction === 'cash_pay' || reaction === 'bankrupt') {
            tl.to(slot.rotation, { x: 0.14, duration: 0.14, ease: 'power2.out' }).to(
              slot.rotation,
              { x: 0, duration: 0.22, ease: 'power2.inOut' }
            );
          } else {
            tl.to(slot.scale, { y: 0.9, duration: 0.09 }).to(slot.scale, {
              y: 1,
              duration: 0.12,
            });
          }
        },
        onComplete: () => {
          slot.position.set(0, 0, 0);
          slot.rotation.set(0, 0, 0);
          slot.scale.set(1, 1, 1);
        },
        onCancel: () => {
          slot.position.set(0, 0, 0);
          slot.rotation.set(0, 0, 0);
          slot.scale.set(1, 1, 1);
        },
      }),
      'fastForward'
    );
  };

  const setCeremonyRole = (playerId: number, role: CharacterCeremonyRole): void => {
    const entry = entries.get(playerId);
    if (!entry) return;
    entry.ceremonyRole = role;

    const freezePose = getQualityTier() === 'low' || getReducedMotion();
    if (role === 'winner') {
      if (entry.mixer && entry.actions.victory_dance) {
        const action = transitionToClip(entry, 'victory_dance', 0.1);
        entry.oneShotRemainingSec = 0;
        if (action && freezePose) {
          entry.mixer.update(0.42);
        }
        return;
      }
      if (!getReducedMotion()) {
        playReaction(playerId, 'victory');
      }
      return;
    }

    if (role === 'defeated') {
      if (entry.mixer && entry.actions.defeat_slump) {
        const action = transitionToClip(entry, 'defeat_slump', 0.12);
        if (action && freezePose) {
          entry.oneShotRemainingSec = 0;
          entry.mixer.update(0.88);
        } else {
          entry.oneShotRemainingSec = action
            ? Math.max(0.14, action.getClip().duration)
            : 0.9;
        }
      }
      return;
    }

    // role === 'none'
    entry.oneShotRemainingSec = 0;
    entry.restingClip = entry.inJail ? 'jailed_loop' : 'idle_loop';
    if (entry.mixer && !entry.bankrupt) {
      transitionToClip(entry, entry.restingClip, 0.12);
      if (freezePose) {
        entry.mixer.update(0.001);
      }
    }
  };

  const resetCeremonyRoles = (): void => {
    for (const playerId of entries.keys()) {
      setCeremonyRole(playerId, 'none');
    }
  };

  const removePlayer = (playerId: number): void => {
    const entry = entries.get(playerId);
    if (!entry) return;
    entries.delete(playerId);
    cleanupEntryResources(entry);
  };

  const dispose = (): void => {
    if (disposed) return;
    disposed = true;
    for (const entry of entries.values()) {
      cleanupEntryResources(entry);
    }
    entries.clear();
  };

  return {
    getModelUrl,
    ensurePlayerToken,
    syncIdleState,
    onHopStep,
    playReaction,
    setCeremonyRole,
    resetCeremonyRoles,
    removePlayer,
    dispose,
  };
}
