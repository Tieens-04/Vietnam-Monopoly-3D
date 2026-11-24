import * as THREE from 'three';
import { COLOR_GROUP_META } from '../game/boardData';
import { areTeammates, ownsFullColorGroup } from '../game/rules';
import {
  ColorGroup,
  GraphicsQualityTier,
  MatchMode,
  PlayerState,
  PropertyState,
  TileKind,
} from '../game/types';
import {
  AnimationDirector,
  createManagedGsapTimeline,
} from './animationDirector';
import { OwnershipBuildingSuiteRefs } from './models';

export interface NewlyCompletedMonopoly {
  group: ColorGroup;
  tileIndices: number[];
  colorHex: string;
}

/**
 * Pure state-diff helper detecting newly completed Color Group monopolies
 * in both FFA and TEAMS_2V2 modes without re-emitting already completed groups.
 */
export function detectNewlyCompletedMonopolies(
  prevProps: Record<number, PropertyState>,
  nextProps: Record<number, PropertyState>,
  players: ReadonlyArray<PlayerState>,
  matchMode: MatchMode = 'FFA'
): NewlyCompletedMonopoly[] {
  const playerList = players as PlayerState[];
  const results: NewlyCompletedMonopoly[] = [];

  for (const grp of Object.values(ColorGroup)) {
    const indices = COLOR_GROUP_META[grp].tileIndices;
    const leadOwnerId = nextProps[indices[0]]?.ownerId;
    if (leadOwnerId === null || leadOwnerId === undefined) continue;

    if (!ownsFullColorGroup(leadOwnerId, grp, nextProps, playerList, matchMode)) {
      continue;
    }

    const prevLeadOwnerId = prevProps[indices[0]]?.ownerId;
    const prevLeadPlayer =
      prevLeadOwnerId !== null && prevLeadOwnerId !== undefined
        ? playerList.find((p) => p.id === prevLeadOwnerId)
        : undefined;
    const currLeadPlayer = playerList.find((p) => p.id === leadOwnerId);
    const sameSide =
      prevLeadOwnerId === leadOwnerId ||
      (matchMode === 'TEAMS_2V2' && areTeammates(prevLeadPlayer, currLeadPlayer));
    const alreadyOwnedBySameTeam =
      prevLeadOwnerId !== null &&
      prevLeadOwnerId !== undefined &&
      ownsFullColorGroup(prevLeadOwnerId, grp, prevProps, playerList, matchMode) &&
      sameSide;

    if (alreadyOwnedBySameTeam) {
      continue;
    }

    // Prefer the color of the player who just changed a tile in this group
    let activatorId = leadOwnerId;
    for (const idx of indices) {
      const nOwner = nextProps[idx]?.ownerId;
      const pOwner = prevProps[idx]?.ownerId;
      if (nOwner !== null && nOwner !== undefined && nOwner !== pOwner) {
        activatorId = nOwner;
        break;
      }
    }
    const activator =
      playerList.find((p) => p.id === activatorId) ??
      playerList.find((p) => p.id === leadOwnerId);

    results.push({
      group: grp,
      tileIndices: [...indices],
      colorHex: activator?.color ?? '#F5B800',
    });
  }

  return results;
}

export interface BuildingWaveTarget {
  tileIndex: number;
  suite: OwnershipBuildingSuiteRefs | null;
  worldX: number;
  worldZ: number;
}

export interface CreateBuildingAnimatorOptions {
  scene: THREE.Scene;
  director: AnimationDirector;
  getQualityTier: () => GraphicsQualityTier;
  getReducedMotion: () => boolean;
  onShadowDirty?: () => void;
}

export interface BuildingAnimator {
  isTileAnimating: (tileIndex: number) => boolean;
  playBuyLand: (
    tileIndex: number,
    suite: OwnershipBuildingSuiteRefs,
    worldX: number,
    worldZ: number,
    ownerHex: string
  ) => void;
  playHousesBuild: (
    tileIndex: number,
    suite: OwnershipBuildingSuiteRefs,
    prevLevel: number,
    nextLevel: number,
    worldX: number,
    worldZ: number,
    ownerHex: string,
    isShielded?: boolean,
    tileKind?: TileKind
  ) => void;
  playLandmarkReveal: (
    tileIndex: number,
    suite: OwnershipBuildingSuiteRefs,
    prevLevel: number,
    worldX: number,
    worldZ: number,
    ownerHex: string,
    isShielded?: boolean
  ) => void;
  playBuyoutSweep: (
    tileIndex: number,
    suite: OwnershipBuildingSuiteRefs,
    currentLevel: number,
    isShielded: boolean,
    tileKind: TileKind,
    worldX: number,
    worldZ: number,
    newOwnerHex: string
  ) => void;
  playSellDismantle: (
    tileIndex: number,
    suite: OwnershipBuildingSuiteRefs,
    prevLevel: number,
    worldX: number,
    worldZ: number
  ) => void;
  playChampionshipDrop: (
    tileIndex: number,
    suite: OwnershipBuildingSuiteRefs | null,
    worldX: number,
    worldZ: number,
    tileKind?: TileKind
  ) => void;
  playMonopolyWave: (
    groupKey: string,
    targets: BuildingWaveTarget[],
    ownerHex: string
  ) => void;
  cancelAll: () => void;
  dispose: () => void;
}

const POOL_RING_COUNT = 6;
const POOL_SPARK_COUNT = 24;

interface SparkSlot {
  active: boolean;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  maxLife: number;
}

/**
 * Sets exact authoritative Three.js visibility and resting scale/Y on an OwnershipBuildingSuite.
 */
export function applyBuildingRestPose(
  suite: OwnershipBuildingSuiteRefs,
  effectiveLevel: number,
  isShielded: boolean,
  tileKind: TileKind = TileKind.PROPERTY
): void {
  const padRestY = suite.buildBaseY - 0.025;
  suite.padMesh.position.y = padRestY;
  suite.padMesh.scale.set(1, 1, 1);

  suite.starterPavilion.position.y = suite.buildBaseY;
  suite.starterPavilion.scale.set(1, 1, 1);

  for (const h of suite.houses) {
    h.position.y = suite.buildBaseY;
    h.scale.set(1, 1, 1);
  }

  suite.hotel.position.y = suite.buildBaseY;
  suite.hotel.scale.set(1, 1, 1);
  suite.shieldGroup.scale.set(1, 1, 1);
  suite.levelBadgeMesh.scale.set(1, 1, 1);

  if (effectiveLevel < 0) {
    suite.padMesh.visible = false;
    suite.starterPavilion.visible = false;
    for (const h of suite.houses) h.visible = false;
    suite.hotel.visible = false;
    suite.shieldGroup.visible = false;
    suite.levelBadgeMesh.visible = false;
    return;
  }

  suite.padMesh.visible = true;
  suite.starterPavilion.visible = effectiveLevel === 0;
  for (let i = 0; i < suite.houses.length; i++) {
    suite.houses[i].visible = effectiveLevel >= i + 1 && effectiveLevel < 4;
  }
  const showHotel = effectiveLevel >= 4;
  suite.hotel.visible = showHotel;
  suite.shieldGroup.visible = showHotel || isShielded;
  suite.levelBadgeMesh.visible =
    tileKind === TileKind.PROPERTY && effectiveLevel >= 1;
}

/**
 * GSAP-based 3D Building Animator for Business Tour Vietnam 3D:
 * drives ANIM-BLD-01..06, 10, 11 with pooled shockwave rings & InstancedMesh star sparks,
 * deduplicated per tile (`building:${tileIndex}`) inside AnimationDirector.
 */
export function createBuildingAnimator(
  options: CreateBuildingAnimatorOptions
): BuildingAnimator {
  const { scene, director, getQualityTier, getReducedMotion, onShadowDirty } =
    options;

  const activeTileTokens = new Map<number, symbol>();
  const ringY = 0.468;

  // Pooled expanding ground rings (0 runtime Geometry/Material allocations)
  const ringGeo = new THREE.RingGeometry(0.42, 0.72, 24);
  ringGeo.rotateX(-Math.PI / 2);
  const ringPool: Array<{ mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial }> = [];
  for (let i = 0; i < POOL_RING_COUNT; i++) {
    const mat = new THREE.MeshBasicMaterial({
      color: 0xfacc15,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(ringGeo, mat);
    mesh.visible = false;
    mesh.renderOrder = 2;
    scene.add(mesh);
    ringPool.push({ mesh, mat });
  }
  let ringCursor = 0;

  // Pooled celebratory InstancedMesh sparks (skipped on Low / reducedMotion)
  const sparkGeo = new THREE.OctahedronGeometry(0.085, 0);
  const sparkMat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.95,
    toneMapped: false,
  });
  const sparkMesh = new THREE.InstancedMesh(sparkGeo, sparkMat, POOL_SPARK_COUNT);
  sparkMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const initColor = new THREE.Color(0xfde047);
  for (let i = 0; i < POOL_SPARK_COUNT; i++) {
    sparkMesh.setColorAt(i, initColor);
  }
  if (sparkMesh.instanceColor) {
    sparkMesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
  }
  sparkMesh.count = 0;
  sparkMesh.visible = false;
  sparkMesh.frustumCulled = false;
  scene.add(sparkMesh);

  const sparkSlots: SparkSlot[] = Array.from({ length: POOL_SPARK_COUNT }, () => ({
    active: false,
    x: 0,
    y: 0,
    z: 0,
    vx: 0,
    vy: 0,
    vz: 0,
    life: 0,
    maxLife: 0.6,
  }));
  let sparkCursor = 0;
  const _sparkPos = new THREE.Vector3();
  const _sparkQuat = new THREE.Quaternion();
  const _sparkEuler = new THREE.Euler();
  const _sparkScale = new THREE.Vector3(1, 1, 1);
  const _sparkMat4 = new THREE.Matrix4();
  const _sparkColA = new THREE.Color();
  const _sparkColGold = new THREE.Color(0xfde047);

  let disposed = false;

  const triggerRing = (
    worldX: number,
    worldZ: number,
    colorHex: string,
    maxScale = 2.0,
    durationSec = 0.5
  ): void => {
    if (disposed) return;
    const slotIdx = ringCursor;
    ringCursor = (ringCursor + 1) % POOL_RING_COUNT;
    const entry = ringPool[slotIdx];
    entry.mat.color.set(colorHex);
    entry.mat.opacity = 0.85;
    entry.mesh.position.set(worldX, ringY, worldZ);
    entry.mesh.scale.setScalar(0.45);
    entry.mesh.visible = true;

    const proxy = { scale: 0.45, opacity: 0.85 };
    const tl = createManagedGsapTimeline({
      id: `building:ring:${slotIdx}`,
      category: 'building',
      blocksIdleSleep: false,
      build: (g) => {
        g.to(proxy, {
          scale: maxScale,
          opacity: 0,
          duration: durationSec,
          ease: 'power2.out',
          onUpdate: () => {
            entry.mesh.scale.setScalar(proxy.scale);
            entry.mat.opacity = proxy.opacity;
          },
        });
      },
      onComplete: () => {
        entry.mesh.visible = false;
      },
      onCancel: () => {
        entry.mesh.visible = false;
      },
    });
    director.register(tl);
  };

  const syncSparksToGpu = (): void => {
    let count = 0;
    for (let i = 0; i < POOL_SPARK_COUNT; i++) {
      const sp = sparkSlots[i];
      if (!sp.active) continue;
      const prog = Math.min(1, sp.life / sp.maxLife);
      const s = Math.max(0.05, 1.15 * (1 - prog * 0.85));
      _sparkPos.set(sp.x, sp.y, sp.z);
      _sparkEuler.set(sp.life * 6.5, sp.life * 7.8, 0);
      _sparkQuat.setFromEuler(_sparkEuler);
      _sparkScale.setScalar(s);
      _sparkMat4.compose(_sparkPos, _sparkQuat, _sparkScale);
      sparkMesh.setMatrixAt(count, _sparkMat4);
      count++;
    }
    sparkMesh.count = count;
    sparkMesh.visible = count > 0;
    if (count > 0) {
      sparkMesh.instanceMatrix.needsUpdate = true;
    }
  };

  const triggerSparks = (
    worldX: number,
    worldY: number,
    worldZ: number,
    primaryHex: string,
    count = 12
  ): void => {
    if (disposed || getQualityTier() === 'low' || getReducedMotion()) return;
    _sparkColA.set(primaryHex);
    const actualCount = Math.min(POOL_SPARK_COUNT, Math.max(4, count));
    for (let i = 0; i < actualCount; i++) {
      const slotIdx = sparkCursor;
      sparkCursor = (sparkCursor + 1) % POOL_SPARK_COUNT;
      const sp = sparkSlots[slotIdx];
      const angle = (i / actualCount) * Math.PI * 2 + (i % 3) * 0.19;
      const speed = 1.65 + (i % 4) * 0.52;
      sp.active = true;
      sp.x = worldX;
      sp.y = worldY;
      sp.z = worldZ;
      sp.vx = Math.cos(angle) * speed;
      sp.vy = 2.6 + (i % 3) * 0.85;
      sp.vz = Math.sin(angle) * speed;
      sp.life = 0;
      sp.maxLife = 0.56 + (i % 3) * 0.08;
      sparkMesh.setColorAt(slotIdx, i % 2 === 0 ? _sparkColA : _sparkColGold);
    }
    if (sparkMesh.instanceColor) {
      sparkMesh.instanceColor.needsUpdate = true;
    }
    syncSparksToGpu();

    let prevTime = 0;
    const driver = { t: 0 };
    const tl = createManagedGsapTimeline({
      id: 'building:sparks',
      category: 'building',
      blocksIdleSleep: false,
      build: (g) => {
        g.to(driver, {
          t: 0.72,
          duration: 0.72,
          ease: 'none',
          onUpdate: () => {
            const dt = Math.max(0, driver.t - prevTime);
            prevTime = driver.t;
            if (dt <= 0) return;
            for (const sp of sparkSlots) {
              if (!sp.active) continue;
              sp.life += dt;
              if (sp.life >= sp.maxLife) {
                sp.active = false;
                continue;
              }
              sp.vy -= 7.4 * dt;
              sp.x += sp.vx * dt;
              sp.y += sp.vy * dt;
              sp.z += sp.vz * dt;
            }
            syncSparksToGpu();
          },
        });
      },
      onComplete: () => {
        for (const sp of sparkSlots) sp.active = false;
        sparkMesh.count = 0;
        sparkMesh.visible = false;
      },
      onCancel: () => {
        for (const sp of sparkSlots) sp.active = false;
        sparkMesh.count = 0;
        sparkMesh.visible = false;
      },
    });
    director.register(tl);
  };

  const registerTileTimeline = (
    tileIndex: number,
    suite: OwnershipBuildingSuiteRefs,
    finalLevel: number,
    isShielded: boolean,
    tileKind: TileKind,
    build: Parameters<typeof createManagedGsapTimeline>[0]['build']
  ): void => {
    if (disposed) return;
    const token = Symbol(`bld:${tileIndex}`);
    activeTileTokens.set(tileIndex, token);
    onShadowDirty?.();

    const finish = () => {
      if (activeTileTokens.get(tileIndex) === token) {
        activeTileTokens.delete(tileIndex);
      }
      applyBuildingRestPose(suite, finalLevel, isShielded, tileKind);
      onShadowDirty?.();
    };

    const tl = createManagedGsapTimeline({
      id: `building:${tileIndex}`,
      category: 'building',
      blocksIdleSleep: true,
      build,
      onComplete: finish,
      onCancel: finish,
    });
    director.register(tl);
  };

  /** ANIM-BLD-01: Pad unfurl & starter pavilion drop stamp */
  const playBuyLand = (
    tileIndex: number,
    suite: OwnershipBuildingSuiteRefs,
    worldX: number,
    worldZ: number,
    ownerHex: string
  ): void => {
    const reduced = getReducedMotion();
    const tier = getQualityTier();
    suite.setOwnerTint(ownerHex);
    applyBuildingRestPose(suite, 0, false, TileKind.PROPERTY);

    if (reduced) {
      suite.padMesh.scale.set(0.75, 0.75, 0.75);
      suite.starterPavilion.scale.setScalar(0.6);
      registerTileTimeline(tileIndex, suite, 0, false, TileKind.PROPERTY, (g) => {
        g.to(suite.padMesh.scale, { x: 1, y: 1, z: 1, duration: 0.18, ease: 'power2.out' }, 0);
        g.to(
          suite.starterPavilion.scale,
          { x: 1, y: 1, z: 1, duration: 0.18, ease: 'power2.out' },
          0
        );
      });
      return;
    }

    suite.padMesh.scale.set(0.15, 0.4, 0.15);
    suite.starterPavilion.scale.setScalar(0.1);
    suite.starterPavilion.position.y = suite.buildBaseY + 0.42;

    if (tier !== 'low') {
      triggerRing(worldX, worldZ, ownerHex, 1.75, 0.42);
      triggerSparks(worldX, suite.buildBaseY + 0.35, worldZ, ownerHex, 8);
    }

    registerTileTimeline(tileIndex, suite, 0, false, TileKind.PROPERTY, (g) => {
      g.to(
        suite.padMesh.scale,
        { x: 1, y: 1, z: 1, duration: 0.24, ease: 'back.out(1.7)' },
        0
      );
      g.to(
        suite.starterPavilion.position,
        { y: suite.buildBaseY, duration: 0.3, ease: 'bounce.out' },
        0.08
      );
      g.to(
        suite.starterPavilion.scale,
        { x: 1, y: 1, z: 1, duration: 0.28, ease: 'back.out(1.6)' },
        0.08
      );
    });
  };

  /** ANIM-BLD-02 / 03: Sequential 85ms staggered house construction + badge pop */
  const playHousesBuild = (
    tileIndex: number,
    suite: OwnershipBuildingSuiteRefs,
    prevLevel: number,
    nextLevel: number,
    worldX: number,
    worldZ: number,
    ownerHex: string,
    isShielded = false,
    tileKind: TileKind = TileKind.PROPERTY
  ): void => {
    const reduced = getReducedMotion();
    const tier = getQualityTier();
    const cappedNext = Math.min(3, Math.max(1, nextLevel));
    const startIdx = Math.max(0, prevLevel);

    suite.setOwnerTint(ownerHex);
    applyBuildingRestPose(suite, cappedNext, isShielded, tileKind);

    if (reduced) {
      for (let h = startIdx; h < cappedNext; h++) {
        suite.houses[h].scale.setScalar(0.65);
      }
      if (suite.levelBadgeMesh.visible) {
        suite.levelBadgeMesh.scale.setScalar(0.7);
      }
      registerTileTimeline(tileIndex, suite, cappedNext, isShielded, tileKind, (g) => {
        for (let h = startIdx; h < cappedNext; h++) {
          g.to(
            suite.houses[h].scale,
            { x: 1, y: 1, z: 1, duration: 0.16, ease: 'power2.out' },
            0
          );
        }
        if (suite.levelBadgeMesh.visible) {
          g.to(
            suite.levelBadgeMesh.scale,
            { x: 1, y: 1, z: 1, duration: 0.16, ease: 'power2.out' },
            0
          );
        }
      });
      return;
    }

    for (let h = startIdx; h < cappedNext; h++) {
      suite.houses[h].scale.setScalar(0.05);
      suite.houses[h].position.y = suite.buildBaseY + 0.34;
    }
    if (suite.levelBadgeMesh.visible) {
      suite.levelBadgeMesh.scale.setScalar(0.15);
    }

    if (tier !== 'low') {
      triggerSparks(worldX, suite.buildBaseY + 0.45, worldZ, ownerHex, 10);
    }

    registerTileTimeline(tileIndex, suite, cappedNext, isShielded, tileKind, (g) => {
      for (let h = startIdx; h < cappedNext; h++) {
        const offset = (h - startIdx) * 0.085;
        g.to(
          suite.houses[h].position,
          { y: suite.buildBaseY, duration: 0.32, ease: 'bounce.out' },
          offset
        );
        g.to(
          suite.houses[h].scale,
          { x: 1, y: 1, z: 1, duration: 0.34, ease: 'back.out(1.5)' },
          offset
        );
      }
      if (suite.levelBadgeMesh.visible) {
        const badgeOffset = Math.max(0, cappedNext - startIdx - 1) * 0.085 + 0.06;
        g.to(
          suite.levelBadgeMesh.scale,
          { x: 1, y: 1, z: 1, duration: 0.28, ease: 'elastic.out(1, 0.6)' },
          badgeOffset
        );
      }
    });
  };

  /** ANIM-BLD-04: 3-stage Landmark ★ reveal (Lv4) with golden ring + star sparks */
  const playLandmarkReveal = (
    tileIndex: number,
    suite: OwnershipBuildingSuiteRefs,
    _prevLevel: number,
    worldX: number,
    worldZ: number,
    ownerHex: string,
    isShielded = false
  ): void => {
    const reduced = getReducedMotion();
    const tier = getQualityTier();
    suite.setOwnerTint(ownerHex);
    applyBuildingRestPose(suite, 4, isShielded, TileKind.PROPERTY);

    if (reduced) {
      suite.hotel.scale.setScalar(0.65);
      suite.shieldGroup.scale.setScalar(0.65);
      suite.levelBadgeMesh.scale.setScalar(0.65);
      registerTileTimeline(tileIndex, suite, 4, isShielded, TileKind.PROPERTY, (g) => {
        g.to(suite.hotel.scale, { x: 1, y: 1, z: 1, duration: 0.28, ease: 'power2.out' }, 0);
        g.to(
          suite.shieldGroup.scale,
          { x: 1, y: 1, z: 1, duration: 0.24, ease: 'power2.out' },
          0.04
        );
        g.to(
          suite.levelBadgeMesh.scale,
          { x: 1, y: 1, z: 1, duration: 0.22, ease: 'power2.out' },
          0.04
        );
      });
      return;
    }

    suite.hotel.scale.set(0.35, 0.08, 0.35);
    suite.hotel.position.y = suite.buildBaseY + 0.26;
    suite.shieldGroup.scale.setScalar(0.05);
    suite.levelBadgeMesh.scale.setScalar(0.05);

    if (tier !== 'low') {
      triggerRing(worldX, worldZ, '#FACC15', 2.25, 0.62);
      triggerSparks(worldX, suite.buildBaseY + 0.92, worldZ, ownerHex, 18);
    }

    registerTileTimeline(tileIndex, suite, 4, isShielded, TileKind.PROPERTY, (g) => {
      // Stage 1: Foundation punch
      g.to(
        suite.padMesh.scale,
        { x: 1.08, y: 1.25, z: 1.08, duration: 0.14, ease: 'power2.out' },
        0
      );
      g.to(
        suite.padMesh.scale,
        { x: 1, y: 1, z: 1, duration: 0.18, ease: 'power2.inOut' },
        0.14
      );
      // Stage 2: Skyscraper spire surge & settle
      g.to(
        suite.hotel.position,
        { y: suite.buildBaseY, duration: 0.38, ease: 'power3.out' },
        0.06
      );
      g.to(
        suite.hotel.scale,
        { x: 1, y: 1.12, z: 1, duration: 0.32, ease: 'back.out(1.4)' },
        0.06
      );
      g.to(suite.hotel.scale, { y: 1, duration: 0.24, ease: 'bounce.out' }, 0.38);
      // Stage 3: Shield & ★ badge crown pop
      g.to(
        suite.shieldGroup.scale,
        { x: 1, y: 1, z: 1, duration: 0.36, ease: 'back.out(1.7)' },
        0.38
      );
      g.to(
        suite.levelBadgeMesh.scale,
        { x: 1, y: 1, z: 1, duration: 0.34, ease: 'back.out(1.7)' },
        0.4
      );
    });
  };

  /** ANIM-BLD-05: 2x Buyout takeover color-wave sweep */
  const playBuyoutSweep = (
    tileIndex: number,
    suite: OwnershipBuildingSuiteRefs,
    currentLevel: number,
    isShielded: boolean,
    tileKind: TileKind,
    worldX: number,
    worldZ: number,
    newOwnerHex: string
  ): void => {
    const reduced = getReducedMotion();
    const tier = getQualityTier();
    suite.setOwnerTint(newOwnerHex);
    applyBuildingRestPose(suite, currentLevel, isShielded, tileKind);

    if (reduced) {
      suite.padMesh.scale.setScalar(0.88);
      registerTileTimeline(tileIndex, suite, currentLevel, isShielded, tileKind, (g) => {
        g.to(suite.padMesh.scale, { x: 1, y: 1, z: 1, duration: 0.2, ease: 'power2.out' }, 0);
      });
      return;
    }

    if (tier !== 'low') {
      triggerRing(worldX, worldZ, newOwnerHex, 2.15, 0.52);
      triggerSparks(worldX, suite.buildBaseY + 0.55, worldZ, newOwnerHex, 14);
    }

    registerTileTimeline(tileIndex, suite, currentLevel, isShielded, tileKind, (g) => {
      g.to(
        suite.padMesh.scale,
        { x: 1.12, y: 1.4, z: 1.12, duration: 0.18, ease: 'power2.out' },
        0
      );
      g.to(
        suite.padMesh.scale,
        { x: 1, y: 1, z: 1, duration: 0.3, ease: 'back.out(1.4)' },
        0.18
      );
      const liftTargets: THREE.Object3D[] = [];
      if (suite.starterPavilion.visible) liftTargets.push(suite.starterPavilion);
      for (const h of suite.houses) {
        if (h.visible) liftTargets.push(h);
      }
      if (suite.hotel.visible) liftTargets.push(suite.hotel);
      liftTargets.forEach((obj, idx) => {
        g.to(
          obj.position,
          { y: suite.buildBaseY + 0.22, duration: 0.18, ease: 'power2.out' },
          idx * 0.04
        );
        g.to(
          obj.position,
          { y: suite.buildBaseY, duration: 0.28, ease: 'bounce.out' },
          0.18 + idx * 0.04
        );
      });
    });
  };

  /** ANIM-BLD-06: Liquidation dismantle during debt sell */
  const playSellDismantle = (
    tileIndex: number,
    suite: OwnershipBuildingSuiteRefs,
    prevLevel: number,
    _worldX: number,
    _worldZ: number
  ): void => {
    const reduced = getReducedMotion();
    applyBuildingRestPose(suite, Math.max(0, prevLevel), false, TileKind.PROPERTY);

    const activeObjects: THREE.Object3D[] = [suite.padMesh];
    if (suite.starterPavilion.visible) activeObjects.push(suite.starterPavilion);
    for (const h of suite.houses) {
      if (h.visible) activeObjects.push(h);
    }
    if (suite.hotel.visible) activeObjects.push(suite.hotel);
    if (suite.shieldGroup.visible) activeObjects.push(suite.shieldGroup);
    if (suite.levelBadgeMesh.visible) activeObjects.push(suite.levelBadgeMesh);

    const dur = reduced ? 0.15 : 0.36;
    registerTileTimeline(tileIndex, suite, -1, false, TileKind.PROPERTY, (g) => {
      for (const obj of activeObjects) {
        g.to(
          obj.scale,
          { x: 0.01, y: 0.01, z: 0.01, duration: dur, ease: 'power2.in' },
          0
        );
      }
    });
  };

  /** ANIM-BLD-10: National Championship trophy-drop celebratory bounce */
  const playChampionshipDrop = (
    tileIndex: number,
    suite: OwnershipBuildingSuiteRefs | null,
    worldX: number,
    worldZ: number,
    tileKind: TileKind = TileKind.PROPERTY
  ): void => {
    const reduced = getReducedMotion();
    const tier = getQualityTier();
    if (tier !== 'low' && !reduced) {
      triggerRing(worldX, worldZ, '#FACC15', 2.3, 0.58);
      triggerSparks(worldX, 0.85, worldZ, '#FACC15', 14);
    }
    if (!suite || !suite.padMesh.visible || reduced) return;

    const currentLevel = suite.hotel.visible
      ? 4
      : suite.houses.filter((h) => h.visible).length || (suite.starterPavilion.visible ? 0 : -1);
    if (currentLevel < 0) return;

    const isShielded = suite.shieldGroup.visible && currentLevel < 4;
    registerTileTimeline(tileIndex, suite, currentLevel, isShielded, tileKind, (g) => {
      g.to(
        suite.padMesh.scale,
        { x: 1.1, y: 1.35, z: 1.1, duration: 0.18, ease: 'power2.out' },
        0
      );
      g.to(
        suite.padMesh.scale,
        { x: 1, y: 1, z: 1, duration: 0.42, ease: 'bounce.out' },
        0.18
      );
      const liftTarget = suite.hotel.visible
        ? suite.hotel
        : suite.houses.find((h) => h.visible) ?? suite.starterPavilion;
      if (liftTarget.visible) {
        g.to(liftTarget.position, { y: suite.buildBaseY + 0.24, duration: 0.18, ease: 'power2.out' }, 0);
        g.to(liftTarget.position, { y: suite.buildBaseY, duration: 0.44, ease: 'bounce.out' }, 0.18);
      }
    });
  };

  /** ANIM-BLD-11: Color-group Monopoly 90ms staggered celebratory wave */
  const playMonopolyWave = (
    groupKey: string,
    targets: BuildingWaveTarget[],
    ownerHex: string
  ): void => {
    if (disposed || targets.length === 0) return;
    const reduced = getReducedMotion();
    const tier = getQualityTier();

    if (tier !== 'low' && !reduced) {
      targets.forEach((t, idx) => {
        triggerRing(t.worldX, t.worldZ, ownerHex, 2.05, 0.52 + idx * 0.08);
      });
    }

    const activeSuites = targets
      .map((t) => t.suite)
      .filter((s): s is OwnershipBuildingSuiteRefs => Boolean(s && s.padMesh.visible));
    if (activeSuites.length === 0) return;

    const finishWave = () => {
      for (const s of activeSuites) {
        s.padMesh.scale.set(1, 1, 1);
        s.starterPavilion.position.y = s.buildBaseY;
        s.hotel.position.y = s.buildBaseY;
        for (const h of s.houses) h.position.y = s.buildBaseY;
      }
      onShadowDirty?.();
    };

    const tl = createManagedGsapTimeline({
      id: `monopoly:${groupKey}`,
      category: 'building',
      blocksIdleSleep: !reduced,
      build: (g) => {
        activeSuites.forEach((s, idx) => {
          const offset = reduced ? 0 : idx * 0.09;
          g.to(
            s.padMesh.scale,
            { x: 1.09, y: 1.28, z: 1.09, duration: reduced ? 0.12 : 0.18, ease: 'sine.out' },
            offset
          );
          g.to(
            s.padMesh.scale,
            { x: 1, y: 1, z: 1, duration: reduced ? 0.12 : 0.26, ease: 'sine.inOut' },
            offset + (reduced ? 0.12 : 0.18)
          );
          if (!reduced) {
            const liftObjs: THREE.Object3D[] = [];
            if (s.starterPavilion.visible) liftObjs.push(s.starterPavilion);
            for (const h of s.houses) if (h.visible) liftObjs.push(h);
            if (s.hotel.visible) liftObjs.push(s.hotel);
            for (const obj of liftObjs) {
              g.to(obj.position, { y: s.buildBaseY + 0.16, duration: 0.18, ease: 'sine.out' }, offset);
              g.to(obj.position, { y: s.buildBaseY, duration: 0.26, ease: 'sine.inOut' }, offset + 0.18);
            }
          }
        });
      },
      onComplete: finishWave,
      onCancel: finishWave,
    });
    director.register(tl);
  };

  const cancelAll = (): void => {
    activeTileTokens.clear();
    for (const r of ringPool) {
      r.mesh.visible = false;
    }
    for (const sp of sparkSlots) {
      sp.active = false;
    }
    sparkMesh.count = 0;
    sparkMesh.visible = false;
  };

  const dispose = (): void => {
    if (disposed) return;
    disposed = true;
    cancelAll();
    ringGeo.dispose();
    for (const r of ringPool) {
      scene.remove(r.mesh);
      r.mat.dispose();
    }
    scene.remove(sparkMesh);
    sparkGeo.dispose();
    sparkMat.dispose();
    sparkMesh.dispose();
  };

  return {
    isTileAnimating: (tileIndex: number) => activeTileTokens.has(tileIndex),
    playBuyLand,
    playHousesBuild,
    playLandmarkReveal,
    playBuyoutSweep,
    playSellDismantle,
    playChampionshipDrop,
    playMonopolyWave,
    cancelAll,
    dispose,
  };
}
