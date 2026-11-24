import * as THREE from 'three';
import { COLOR_GROUP_META } from '../game/boardData';
import {
  getTileTransform,
  RESORT_TILE_INDICES,
} from '../game/rules';
import {
  ColorGroup,
  GraphicsQualityTier,
  MatchMode,
  PlayerState,
  PropertyState,
} from '../game/types';
import {
  AnimationDirector,
  createManagedGsapTimeline,
} from './animationDirector';
import { OwnershipBuildingSuiteRefs } from './models';

export interface BrinkAlert {
  key: string;
  tileIndices: number[];
  colorHex: string;
}

function resolveSideKey(
  ownerId: number,
  players: ReadonlyArray<PlayerState>,
  matchMode: MatchMode
): string {
  if (matchMode === 'TEAMS_2V2') {
    const pl = players.find((p) => p.id === ownerId);
    if (pl && pl.teamId !== undefined) {
      return `team:${pl.teamId}`;
    }
  }
  return `player:${ownerId}`;
}

/**
 * Detects newly reached N-1 Color Group brinks and 3/4 Resort brinks
 * across both FFA and TEAMS_2V2 without re-emitting on subsequent upgrades.
 */
export function detectNewlyReachedBrinkTiles(
  prevProps: Record<number, PropertyState>,
  nextProps: Record<number, PropertyState>,
  players: ReadonlyArray<PlayerState>,
  matchMode: MatchMode = 'FFA'
): BrinkAlert[] {
  const alerts: BrinkAlert[] = [];

  const scanSubset = (prefix: string, tileIndices: ReadonlyArray<number>): void => {
    const needed = tileIndices.length - 1;
    if (needed < 1) return;

    const currBuckets = new Map<string, { tiles: number[]; lastOwnerId: number }>();
    for (const idx of tileIndices) {
      const ownerId = nextProps[idx]?.ownerId;
      if (ownerId === null || ownerId === undefined) continue;
      const sideKey = resolveSideKey(ownerId, players, matchMode);
      const entry = currBuckets.get(sideKey) ?? { tiles: [], lastOwnerId: ownerId };
      entry.tiles.push(idx);
      if (prevProps[idx]?.ownerId !== ownerId) {
        entry.lastOwnerId = ownerId;
      }
      currBuckets.set(sideKey, entry);
    }

    for (const [sideKey, bucket] of currBuckets.entries()) {
      if (bucket.tiles.length !== needed) continue;

      let prevCount = 0;
      for (const idx of tileIndices) {
        const pOwnerId = prevProps[idx]?.ownerId;
        if (pOwnerId === null || pOwnerId === undefined) continue;
        if (resolveSideKey(pOwnerId, players, matchMode) === sideKey) {
          prevCount += 1;
        }
      }
      if (prevCount >= needed) continue;

      const activator = players.find((p) => p.id === bucket.lastOwnerId);
      const alertKey = `${prefix}:${sideKey.replace('player:', '').replace('team:', 'T')}`;
      alerts.push({
        key: alertKey,
        tileIndices: bucket.tiles,
        colorHex: activator?.color ?? '#FACC15',
      });
    }
  };

  for (const grp of Object.values(ColorGroup)) {
    scanSubset(`group:${grp}`, COLOR_GROUP_META[grp].tileIndices);
  }
  scanSubset('resort', RESORT_TILE_INDICES);

  return alerts;
}

export interface CreateSpecialEventEffectsOptions {
  scene: THREE.Scene;
  director: AnimationDirector;
  getQualityTier: () => GraphicsQualityTier;
  getReducedMotion: () => boolean;
  onShadowDirty?: () => void;
}

export interface SpecialEventEffects {
  playEarthquakeCollapse: (
    tileIndex: number,
    suite: OwnershipBuildingSuiteRefs | null,
    worldX: number,
    worldZ: number
  ) => void;
  playPowerOutageZap: (tileIndex: number, worldX: number, worldZ: number) => void;
  playShieldDeploy: (tileIndex: number, worldX: number, worldZ: number) => void;
  playShieldBreak: (tileIndex: number, worldX: number, worldZ: number) => void;
  syncLostIslandJail: (inJail: boolean, animateTransition: boolean) => void;
  playWorldTourFlight: (fromTile: number, toTile: number, colorHex: string) => void;
  playChanceCardFlip: (cardId: string) => void;
  playChampionshipSearchlight: (
    tileIndex: number,
    worldX: number,
    worldZ: number
  ) => void;
  syncFestivalLanterns: (
    festivalTileIndices: ReadonlyArray<number>,
    elapsedSec: number,
    animateAmbient: boolean
  ) => void;
  playBrinkPulse: (tileIndices: ReadonlyArray<number>, colorHex: string) => void;
  cancelAll: () => void;
  dispose: () => void;
}

const POOL_SHARD_COUNT = 16;
const POOL_BRINK_RINGS = 4;
const TILE_SURFACE_Y = 0.44;
const CHANCE_DECK_X = -3.68;
const CHANCE_DECK_Y = 0.34;
const CHANCE_DECK_Z = 1.06;

interface ShardSlot {
  active: boolean;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  spinSpeed: number;
  life: number;
  maxLife: number;
}

/**
 * Pre-allocated Special Events & Environment 3D FX pool (`ANIM-BLD-07..09`, `ANIM-EVT-01..06`):
 * zero per-frame allocations, bounded <= 16 shard InstancedMesh, Low 0 FPS idle compliance,
 * and reduced-motion safe transitions.
 */
export function createSpecialEventEffects(
  options: CreateSpecialEventEffectsOptions
): SpecialEventEffects {
  const { scene, director, getQualityTier, getReducedMotion, onShadowDirty } =
    options;

  let disposed = false;
  const createdGeos: THREE.BufferGeometry[] = [];
  const createdMats: THREE.Material[] = [];
  const createdObjects: THREE.Object3D[] = [];

  const trackGeo = <T extends THREE.BufferGeometry>(g: T): T => {
    createdGeos.push(g);
    return g;
  };
  const trackMat = <T extends THREE.Material>(m: T): T => {
    createdMats.push(m);
    return m;
  };
  const trackObj = <T extends THREE.Object3D>(o: T): T => {
    createdObjects.push(o);
    scene.add(o);
    return o;
  };

  // 1. Fixed <= 16 InstancedMesh shard/rubble pool (Earthquake brown rubble + Shield cyan crystals)
  const shardGeo = trackGeo(new THREE.OctahedronGeometry(0.11, 0));
  const shardMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.45,
      metalness: 0.15,
    })
  );
  const shardMesh = trackObj(
    new THREE.InstancedMesh(shardGeo, shardMat, POOL_SHARD_COUNT)
  );
  shardMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const _initCol = new THREE.Color(0xd97706);
  for (let i = 0; i < POOL_SHARD_COUNT; i++) {
    shardMesh.setColorAt(i, _initCol);
  }
  if (shardMesh.instanceColor) {
    shardMesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
  }
  shardMesh.count = 0;
  shardMesh.visible = false;
  shardMesh.frustumCulled = false;

  const shardSlots: ShardSlot[] = Array.from({ length: POOL_SHARD_COUNT }, () => ({
    active: false,
    x: 0,
    y: 0,
    z: 0,
    vx: 0,
    vy: 0,
    vz: 0,
    spinSpeed: 8,
    life: 0,
    maxLife: 0.65,
  }));
  let shardCursor = 0;
  const _sPos = new THREE.Vector3();
  const _sQuat = new THREE.Quaternion();
  const _sEuler = new THREE.Euler();
  const _sScale = new THREE.Vector3();
  const _sMat4 = new THREE.Matrix4();
  const _sColA = new THREE.Color();
  const _sColB = new THREE.Color();

  // 2. Electric Zap Bolt Group for Power Outage (ch-14)
  const outageBoltMat = trackMat(
    new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0,
      toneMapped: false,
    })
  );
  const outageBoltGeo = trackGeo(new THREE.BoxGeometry(0.11, 0.95, 0.11));
  const outageBoltGroup = trackObj(new THREE.Group());
  {
    const segA = new THREE.Mesh(outageBoltGeo, outageBoltMat);
    segA.position.set(-0.12, 0.95, 0);
    segA.rotation.z = 0.45;
    outageBoltGroup.add(segA);
    const segB = new THREE.Mesh(outageBoltGeo, outageBoltMat);
    segB.position.set(0.12, 0.48, 0);
    segB.rotation.z = -0.5;
    outageBoltGroup.add(segB);
  }
  outageBoltGroup.visible = false;

  // 3. Cyan Shield Dome for Protection Shield Deploy / Block (ch-15)
  const shieldDomeGeo = trackGeo(
    new THREE.SphereGeometry(0.76, 14, 9, 0, Math.PI * 2, 0, Math.PI * 0.56)
  );
  const shieldDomeMat = trackMat(
    new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0,
      wireframe: false,
      depthWrite: false,
      side: THREE.DoubleSide,
    })
  );
  const shieldDomeMesh = trackObj(new THREE.Mesh(shieldDomeGeo, shieldDomeMat));
  shieldDomeMesh.visible = false;

  // 4. Lost Island Bamboo Jail Bars around Tile 8 (ANIM-EVT-01)
  const islandTf = getTileTransform(8);
  const bambooMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xd97706,
      roughness: 0.72,
      metalness: 0.05,
    })
  );
  const bambooPostGeo = trackGeo(new THREE.CylinderGeometry(0.042, 0.048, 1.05, 8));
  const bambooRailGeo = trackGeo(new THREE.BoxGeometry(1.18, 0.05, 0.05));
  const islandBarsGroup = trackObj(new THREE.Group());
  islandBarsGroup.position.set(islandTf.x, TILE_SURFACE_Y, islandTf.z);
  {
    const corners: Array<[number, number]> = [
      [-0.56, -0.56],
      [0.56, -0.56],
      [-0.56, 0.56],
      [0.56, 0.56],
    ];
    for (const [cx, cz] of corners) {
      const post = new THREE.Mesh(bambooPostGeo, bambooMat);
      post.position.set(cx, 0.525, cz);
      islandBarsGroup.add(post);
    }
    const railOffsets: Array<[number, number, number]> = [
      [0, 0.85, -0.56],
      [0, 0.85, 0.56],
      [-0.56, 0.85, 0],
      [0.56, 0.85, 0],
    ];
    railOffsets.forEach(([rx, ry, rz], idx) => {
      const rail = new THREE.Mesh(bambooRailGeo, bambooMat);
      rail.position.set(rx, ry, rz);
      if (idx >= 2) rail.rotation.y = Math.PI / 2;
      islandBarsGroup.add(rail);
    });
  }
  islandBarsGroup.visible = false;

  // 5. World Tour Flight Parabolic Jet & Cloud Trail (ANIM-EVT-02)
  const flightGroup = trackObj(new THREE.Group());
  const jetBodyGeo = trackGeo(new THREE.ConeGeometry(0.18, 0.72, 8));
  jetBodyGeo.rotateX(Math.PI / 2);
  const jetWingGeo = trackGeo(new THREE.BoxGeometry(0.86, 0.04, 0.24));
  const jetMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.3,
      metalness: 0.25,
    })
  );
  const trailOrbGeo = trackGeo(new THREE.SphereGeometry(0.11, 8, 6));
  const trailMat = trackMat(
    new THREE.MeshBasicMaterial({
      color: 0xf8fafc,
      transparent: true,
      opacity: 0.75,
      depthWrite: false,
    })
  );
  const flightTrailOrbs: THREE.Mesh[] = [];
  {
    const fuselage = new THREE.Mesh(jetBodyGeo, jetMat);
    flightGroup.add(fuselage);
    const wing = new THREE.Mesh(jetWingGeo, jetMat);
    wing.position.set(0, 0, -0.05);
    flightGroup.add(wing);
    for (let i = 0; i < 4; i++) {
      const orb = new THREE.Mesh(trailOrbGeo, trailMat);
      orb.position.set(0, -i * 0.04, -0.5 - i * 0.34);
      orb.scale.setScalar(1 - i * 0.16);
      flightGroup.add(orb);
      flightTrailOrbs.push(orb);
    }
  }
  flightGroup.visible = false;

  // 6. Courtyard 3D Chance Card Flip Mesh (ANIM-EVT-03)
  const chanceCardGroup = trackObj(new THREE.Group());
  chanceCardGroup.position.set(CHANCE_DECK_X, CHANCE_DECK_Y, CHANCE_DECK_Z);
  chanceCardGroup.rotation.y = Math.PI / 4;
  const cardRimGeo = trackGeo(new THREE.BoxGeometry(1.06, 0.04, 1.54));
  const cardRimMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xfacc15,
      roughness: 0.32,
      metalness: 0.45,
    })
  );
  const cardFaceGeo = trackGeo(new THREE.BoxGeometry(0.92, 0.05, 1.38));
  const cardFaceMat = trackMat(
    new THREE.MeshBasicMaterial({
      color: 0x0ea5e9,
    })
  );
  chanceCardGroup.add(new THREE.Mesh(cardRimGeo, cardRimMat));
  chanceCardGroup.add(new THREE.Mesh(cardFaceGeo, cardFaceMat));
  chanceCardGroup.visible = false;

  // 7. Championship Golden Searchlight Cone (ANIM-EVT-04)
  const beamGeo = trackGeo(new THREE.ConeGeometry(0.95, 3.2, 16, 1, true));
  const beamMat = trackMat(
    new THREE.MeshBasicMaterial({
      color: 0xfde047,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      side: THREE.DoubleSide,
    })
  );
  const beamMesh = trackObj(new THREE.Mesh(beamGeo, beamMat));
  beamMesh.visible = false;

  // 8. 3 Festival Golden Lantern Orbs (ANIM-EVT-05)
  const lanternGeo = trackGeo(new THREE.SphereGeometry(0.11, 10, 8));
  const lanternMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xfef08a,
      emissive: 0xf59e0b,
      emissiveIntensity: 0.85,
      roughness: 0.28,
      metalness: 0.1,
    })
  );
  const lanternMeshes: THREE.Mesh[] = Array.from({ length: 3 }, () => {
    const m = trackObj(new THREE.Mesh(lanternGeo, lanternMat));
    m.visible = false;
    return m;
  });

  // 9. Pooled Brink Pulse Rings (ANIM-EVT-06)
  const brinkRingGeo = trackGeo(new THREE.RingGeometry(0.55, 0.78, 24));
  brinkRingGeo.rotateX(-Math.PI / 2);
  const brinkRingPool: Array<{ mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial }> = [];
  for (let i = 0; i < POOL_BRINK_RINGS; i++) {
    const mat = trackMat(
      new THREE.MeshBasicMaterial({
        color: 0xfacc15,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        side: THREE.DoubleSide,
      })
    );
    const mesh = trackObj(new THREE.Mesh(brinkRingGeo, mat));
    mesh.visible = false;
    mesh.renderOrder = 3;
    brinkRingPool.push({ mesh, mat });
  }
  let brinkCursor = 0;

  const syncShardsToGpu = (): void => {
    let count = 0;
    for (let i = 0; i < POOL_SHARD_COUNT; i++) {
      const sh = shardSlots[i];
      if (!sh.active) continue;
      const prog = Math.min(1, sh.life / sh.maxLife);
      const scale = Math.max(0.05, 1.0 - prog * 0.75);
      _sPos.set(sh.x, sh.y, sh.z);
      _sEuler.set(sh.life * sh.spinSpeed, sh.life * (sh.spinSpeed * 1.15), 0);
      _sQuat.setFromEuler(_sEuler);
      _sScale.setScalar(scale);
      _sMat4.compose(_sPos, _sQuat, _sScale);
      shardMesh.setMatrixAt(count, _sMat4);
      count++;
    }
    shardMesh.count = count;
    shardMesh.visible = count > 0;
    if (count > 0) {
      shardMesh.instanceMatrix.needsUpdate = true;
    }
  };

  const triggerShards = (
    worldX: number,
    worldY: number,
    worldZ: number,
    hexA: string,
    hexB: string,
    count = 12
  ): void => {
    if (disposed || getQualityTier() === 'low' || getReducedMotion()) return;
    _sColA.set(hexA);
    _sColB.set(hexB);
    const actualCount = Math.min(POOL_SHARD_COUNT, Math.max(4, count));
    for (let i = 0; i < actualCount; i++) {
      const idx = shardCursor;
      shardCursor = (shardCursor + 1) % POOL_SHARD_COUNT;
      const sh = shardSlots[idx];
      const angle = (i / actualCount) * Math.PI * 2 + (i % 3) * 0.25;
      const speed = 1.85 + (i % 4) * 0.55;
      sh.active = true;
      sh.x = worldX;
      sh.y = worldY;
      sh.z = worldZ;
      sh.vx = Math.cos(angle) * speed;
      sh.vy = 2.75 + (i % 3) * 0.9;
      sh.vz = Math.sin(angle) * speed;
      sh.spinSpeed = 6 + (i % 3) * 3;
      sh.life = 0;
      sh.maxLife = 0.54 + (i % 3) * 0.08;
      shardMesh.setColorAt(idx, i % 2 === 0 ? _sColA : _sColB);
    }
    if (shardMesh.instanceColor) {
      shardMesh.instanceColor.needsUpdate = true;
    }
    syncShardsToGpu();

    let prevT = 0;
    const driver = { t: 0 };
    const tl = createManagedGsapTimeline({
      id: 'event:shards',
      category: 'event',
      blocksIdleSleep: false,
      build: (g) => {
        g.to(driver, {
          t: 0.7,
          duration: 0.7,
          ease: 'none',
          onUpdate: () => {
            const dt = Math.max(0, driver.t - prevT);
            prevT = driver.t;
            if (dt <= 0) return;
            for (const sh of shardSlots) {
              if (!sh.active) continue;
              sh.life += dt;
              if (sh.life >= sh.maxLife) {
                sh.active = false;
                continue;
              }
              sh.vy -= 8.4 * dt;
              sh.x += sh.vx * dt;
              sh.y = Math.max(TILE_SURFACE_Y, sh.y + sh.vy * dt);
              sh.z += sh.vz * dt;
            }
            syncShardsToGpu();
          },
        });
      },
      onComplete: () => {
        for (const sh of shardSlots) sh.active = false;
        shardMesh.count = 0;
        shardMesh.visible = false;
      },
      onCancel: () => {
        for (const sh of shardSlots) sh.active = false;
        shardMesh.count = 0;
        shardMesh.visible = false;
      },
    });
    director.register(tl);
  };

  /** ANIM-BLD-07: Earthquake structural jolt & rubble debris (ch-13) */
  const playEarthquakeCollapse = (
    tileIndex: number,
    suite: OwnershipBuildingSuiteRefs | null,
    worldX: number,
    worldZ: number
  ): void => {
    if (disposed) return;
    const reduced = getReducedMotion();
    triggerShards(worldX, TILE_SURFACE_Y + 0.65, worldZ, '#92400E', '#D97706', 14);
    if (!suite || reduced) return;

    const proxy = { t: 0 };
    const dur = 0.62;
    const resetRoot = () => {
      suite.root.position.set(0, 0, 0);
      onShadowDirty?.();
    };
    const tl = createManagedGsapTimeline({
      id: `event:quake:${tileIndex}`,
      category: 'event',
      blocksIdleSleep: true,
      build: (g) => {
        g.to(proxy, {
          t: 1,
          duration: dur,
          ease: 'none',
          onUpdate: () => {
            const amp = 0.085 * (1 - proxy.t);
            suite.root.position.set(
              Math.sin(proxy.t * Math.PI * 10) * amp,
              0,
              Math.cos(proxy.t * Math.PI * 8) * amp
            );
          },
        });
      },
      onComplete: resetRoot,
      onCancel: resetRoot,
    });
    director.register(tl);
  };

  /** ANIM-BLD-08: Dual electric zap flashes for Power Outage (ch-14) */
  const playPowerOutageZap = (
    tileIndex: number,
    worldX: number,
    worldZ: number
  ): void => {
    if (disposed) return;
    const reduced = getReducedMotion();
    outageBoltGroup.position.set(worldX, TILE_SURFACE_Y + 0.08, worldZ);
    outageBoltGroup.scale.setScalar(1);
    outageBoltMat.opacity = reduced ? 0.65 : 1;
    outageBoltGroup.visible = true;

    const hideBolts = () => {
      outageBoltGroup.visible = false;
      outageBoltMat.opacity = 0;
    };

    const tl = createManagedGsapTimeline({
      id: `event:outage:${tileIndex}`,
      category: 'event',
      blocksIdleSleep: true,
      build: (g) => {
        if (reduced) {
          g.to(outageBoltMat, { opacity: 0, duration: 0.2, ease: 'power2.out' }, 0);
        } else {
          g.to(outageBoltMat, { opacity: 0.15, duration: 0.12, ease: 'power1.out' }, 0.08);
          g.to(outageBoltMat, { opacity: 1.0, duration: 0.08, ease: 'power1.in' }, 0.2);
          g.to(outageBoltMat, { opacity: 0, duration: 0.25, ease: 'power2.out' }, 0.28);
          g.to(
            outageBoltGroup.scale,
            { x: 1.22, y: 0.88, z: 1.22, duration: 0.52, ease: 'power2.out' },
            0
          );
        }
      },
      onComplete: hideBolts,
      onCancel: hideBolts,
    });
    director.register(tl);
  };

  /** ANIM-BLD-09 (deploy): Cyan energy shield dome expansion */
  const playShieldDeploy = (
    tileIndex: number,
    worldX: number,
    worldZ: number
  ): void => {
    if (disposed) return;
    const reduced = getReducedMotion();
    shieldDomeGroupInit(worldX, worldZ, 0.35);

    const hideDome = () => {
      shieldDomeMesh.visible = false;
      shieldDomeMat.opacity = 0;
    };

    const tl = createManagedGsapTimeline({
      id: `event:shield:${tileIndex}`,
      category: 'event',
      blocksIdleSleep: true,
      build: (g) => {
        if (reduced) {
          shieldDomeMesh.scale.setScalar(1);
          g.to(shieldDomeMat, { opacity: 0, duration: 0.22, ease: 'power2.out' }, 0);
        } else {
          g.to(
            shieldDomeMesh.scale,
            { x: 1.15, y: 1.15, z: 1.15, duration: 0.26, ease: 'back.out(1.6)' },
            0
          );
          g.to(shieldDomeMat, { opacity: 0.56, duration: 0.14, ease: 'power2.out' }, 0);
          g.to(shieldDomeMat, { opacity: 0, duration: 0.24, ease: 'power2.in' }, 0.22);
        }
      },
      onComplete: hideDome,
      onCancel: hideDome,
    });
    director.register(tl);
  };

  function shieldDomeGroupInit(wx: number, wz: number, initScale: number): void {
    shieldDomeMesh.position.set(wx, TILE_SURFACE_Y + 0.04, wz);
    shieldDomeMesh.scale.setScalar(initScale);
    shieldDomeMat.opacity = 0.52;
    shieldDomeMesh.visible = true;
  }

  /** ANIM-BLD-09 (block): Cyan dome impact flash & shattered crystal shards */
  const playShieldBreak = (
    tileIndex: number,
    worldX: number,
    worldZ: number
  ): void => {
    if (disposed) return;
    const reduced = getReducedMotion();
    triggerShards(worldX, TILE_SURFACE_Y + 0.72, worldZ, '#38BDF8', '#E0F2FE', 14);
    shieldDomeGroupInit(worldX, worldZ, 1.05);

    const hideDome = () => {
      shieldDomeMesh.visible = false;
      shieldDomeMat.opacity = 0;
    };

    const tl = createManagedGsapTimeline({
      id: `event:shield:${tileIndex}`,
      category: 'event',
      blocksIdleSleep: true,
      build: (g) => {
        g.to(
          shieldDomeMesh.scale,
          { x: 1.38, y: 1.38, z: 1.38, duration: reduced ? 0.18 : 0.34, ease: 'power3.out' },
          0
        );
        g.to(
          shieldDomeMat,
          { opacity: 0, duration: reduced ? 0.18 : 0.34, ease: 'power3.out' },
          0.04
        );
      },
      onComplete: hideDome,
      onCancel: hideDome,
    });
    director.register(tl);
  };

  /** ANIM-EVT-01: Lost Island bamboo jail bars rise / lower cleanly */
  const syncLostIslandJail = (
    inJail: boolean,
    animateTransition: boolean
  ): void => {
    if (disposed) return;
    if (!animateTransition) {
      islandBarsGroup.visible = inJail;
      islandBarsGroup.scale.set(1, 1, 1);
      islandBarsGroup.position.y = TILE_SURFACE_Y;
      return;
    }

    const reduced = getReducedMotion();
    const finish = () => {
      islandBarsGroup.visible = inJail;
      islandBarsGroup.scale.set(1, 1, 1);
      islandBarsGroup.position.y = TILE_SURFACE_Y;
      onShadowDirty?.();
    };

    islandBarsGroup.visible = true;
    if (inJail) {
      islandBarsGroup.scale.set(1, reduced ? 0.7 : 0.08, 1);
    } else {
      islandBarsGroup.scale.set(1, 1, 1);
    }

    const tl = createManagedGsapTimeline({
      id: 'event:island-bars',
      category: 'event',
      blocksIdleSleep: true,
      build: (g) => {
        g.to(
          islandBarsGroup.scale,
          {
            y: inJail ? 1 : 0.04,
            duration: reduced ? 0.16 : 0.3,
            ease: inJail ? 'back.out(1.5)' : 'power2.in',
          },
          0
        );
      },
      onComplete: finish,
      onCancel: finish,
    });
    director.register(tl);
  };

  /** ANIM-EVT-02: World Tour parabolic jet flight & contrail across board */
  const playWorldTourFlight = (
    fromTile: number,
    toTile: number,
    colorHex: string
  ): void => {
    if (disposed) return;
    const reduced = getReducedMotion();
    const tier = getQualityTier();
    const fromTf = getTileTransform(fromTile);
    const toTf = getTileTransform(toTile);

    jetMat.color.set(colorHex);
    const showTrail = !reduced && tier !== 'low';
    for (const orb of flightTrailOrbs) {
      orb.visible = showTrail;
    }

    const startX = fromTf.x;
    const startZ = fromTf.z;
    const endX = toTf.x;
    const endZ = toTf.z;
    const peakY = reduced ? TILE_SURFACE_Y + 1.05 : TILE_SURFACE_Y + 2.45;
    const yaw = Math.atan2(endX - startX, endZ - startZ);

    flightGroup.position.set(startX, TILE_SURFACE_Y + 0.55, startZ);
    flightGroup.rotation.set(0, yaw, 0);
    flightGroup.scale.setScalar(1);
    flightGroup.visible = true;

    const hideFlight = () => {
      flightGroup.visible = false;
      flightGroup.scale.setScalar(1);
    };

    const proxy = { u: 0 };
    const tl = createManagedGsapTimeline({
      id: 'event:world-tour',
      category: 'event',
      blocksIdleSleep: true,
      build: (g) => {
        g.to(proxy, {
          u: 1,
          duration: reduced ? 0.35 : 0.72,
          ease: 'power2.inOut',
          onUpdate: () => {
            const u = proxy.u;
            const x = startX + (endX - startX) * u;
            const z = startZ + (endZ - startZ) * u;
            const y = TILE_SURFACE_Y + 0.55 + Math.sin(u * Math.PI) * (peakY - TILE_SURFACE_Y - 0.55);
            flightGroup.position.set(x, y, z);
            if (!reduced) {
              flightGroup.rotation.x = Math.cos(u * Math.PI) * -0.35;
              flightGroup.rotation.z = Math.sin(u * Math.PI) * 0.25;
            }
          },
        });
      },
      onComplete: hideFlight,
      onCancel: hideFlight,
    });
    director.register(tl);
  };

  /** ANIM-EVT-03: Courtyard 3D Chance Card lift & 180-deg flip */
  const playChanceCardFlip = (_cardId: string): void => {
    if (disposed) return;
    const reduced = getReducedMotion();
    chanceCardGroup.position.set(CHANCE_DECK_X, CHANCE_DECK_Y, CHANCE_DECK_Z);
    chanceCardGroup.rotation.set(0, Math.PI / 4, 0);
    chanceCardGroup.scale.setScalar(0.85);
    chanceCardGroup.visible = true;

    const hideCard = () => {
      chanceCardGroup.visible = false;
      chanceCardGroup.position.set(CHANCE_DECK_X, CHANCE_DECK_Y, CHANCE_DECK_Z);
      chanceCardGroup.rotation.set(0, Math.PI / 4, 0);
      chanceCardGroup.scale.setScalar(1);
    };

    const tl = createManagedGsapTimeline({
      id: 'event:chance-card',
      category: 'event',
      blocksIdleSleep: true,
      build: (g) => {
        if (reduced) {
          g.to(
            chanceCardGroup.position,
            { y: CHANCE_DECK_Y + 0.55, duration: 0.2, ease: 'power2.out' },
            0
          );
          g.to(chanceCardGroup.scale, { x: 1.05, y: 1.05, z: 1.05, duration: 0.2 }, 0);
        } else {
          g.to(
            chanceCardGroup.position,
            { y: CHANCE_DECK_Y + 1.35, duration: 0.24, ease: 'back.out(1.6)' },
            0
          );
          g.to(
            chanceCardGroup.rotation,
            { z: Math.PI, duration: 0.28, ease: 'power2.inOut' },
            0.06
          );
          g.to(
            chanceCardGroup.scale,
            { x: 1.2, y: 1.2, z: 1.2, duration: 0.24, ease: 'power2.out' },
            0
          );
          g.to(
            chanceCardGroup.position,
            { y: CHANCE_DECK_Y + 0.2, duration: 0.14, ease: 'power2.in' },
            0.34
          );
        }
      },
      onComplete: hideCard,
      onCancel: hideCard,
    });
    director.register(tl);
  };

  /** ANIM-EVT-04: Championship Stadium Searchlight Cone Sweep */
  const playChampionshipSearchlight = (
    _tileIndex: number,
    worldX: number,
    worldZ: number
  ): void => {
    if (disposed || getQualityTier() === 'low' || getReducedMotion()) return;
    beamMesh.position.set(worldX, TILE_SURFACE_Y + 1.6, worldZ);
    beamMesh.rotation.set(0.22, 0, 0);
    beamMat.opacity = 0.38;
    beamMesh.visible = true;

    const hideBeam = () => {
      beamMesh.visible = false;
      beamMat.opacity = 0;
    };

    const tl = createManagedGsapTimeline({
      id: 'event:championship-beam',
      category: 'event',
      blocksIdleSleep: true,
      build: (g) => {
        g.to(beamMesh.rotation, { y: Math.PI * 1.5, duration: 0.7, ease: 'power2.inOut' }, 0);
        g.to(beamMat, { opacity: 0, duration: 0.3, ease: 'power2.in' }, 0.42);
      },
      onComplete: hideBeam,
      onCancel: hideBeam,
    });
    director.register(tl);
  };

  /** ANIM-EVT-05: Festival 2x Golden Lantern Orbs (static on Low/Reduced, gently bobbing on Med/High) */
  const syncFestivalLanterns = (
    festivalTileIndices: ReadonlyArray<number>,
    elapsedSec: number,
    animateAmbient: boolean
  ): void => {
    if (disposed) return;
    for (let i = 0; i < lanternMeshes.length; i++) {
      const m = lanternMeshes[i];
      const tIdx = festivalTileIndices[i];
      if (tIdx === undefined) {
        m.visible = false;
        continue;
      }
      const tf = getTileTransform(tIdx);
      const bobOffset = animateAmbient
        ? Math.sin(elapsedSec * 2.25 + i * 1.8) * 0.08
        : 0;
      m.position.set(tf.x, TILE_SURFACE_Y + 1.05 + bobOffset, tf.z);
      m.visible = true;
    }
  };

  /** ANIM-EVT-06: Monopoly Brink highlight rings on N-1 tiles */
  const playBrinkPulse = (
    tileIndices: ReadonlyArray<number>,
    colorHex: string
  ): void => {
    if (disposed || tileIndices.length === 0) return;
    const reduced = getReducedMotion();
    for (const tIdx of tileIndices) {
      const slotIdx = brinkCursor;
      brinkCursor = (brinkCursor + 1) % POOL_BRINK_RINGS;
      const entry = brinkRingPool[slotIdx];
      const tf = getTileTransform(tIdx);

      entry.mat.color.set(colorHex);
      entry.mat.opacity = 0.85;
      entry.mesh.position.set(tf.x, TILE_SURFACE_Y + 0.032, tf.z);
      entry.mesh.scale.setScalar(0.8);
      entry.mesh.visible = true;

      const hideRing = () => {
        entry.mesh.visible = false;
        entry.mat.opacity = 0;
      };

      const proxy = { s: 0.8, o: 0.85 };
      const tl = createManagedGsapTimeline({
        id: `event:brink:${slotIdx}`,
        category: 'event',
        blocksIdleSleep: !reduced,
        build: (g) => {
          g.to(
            proxy,
            {
              s: reduced ? 1.08 : 1.55,
              o: 0,
              duration: reduced ? 0.25 : 0.58,
              ease: 'power2.out',
              onUpdate: () => {
                entry.mesh.scale.setScalar(proxy.s);
                entry.mat.opacity = proxy.o;
              },
            },
            0
          );
        },
        onComplete: hideRing,
        onCancel: hideRing,
      });
      director.register(tl);
    }
  };

  const cancelAll = (): void => {
    for (const sh of shardSlots) sh.active = false;
    shardMesh.count = 0;
    shardMesh.visible = false;
    outageBoltGroup.visible = false;
    outageBoltMat.opacity = 0;
    shieldDomeMesh.visible = false;
    shieldDomeMat.opacity = 0;
    flightGroup.visible = false;
    chanceCardGroup.visible = false;
    beamMesh.visible = false;
    beamMat.opacity = 0;
    for (const r of brinkRingPool) {
      r.mesh.visible = false;
      r.mat.opacity = 0;
    }
  };

  const dispose = (): void => {
    if (disposed) return;
    disposed = true;
    cancelAll();
    islandBarsGroup.visible = false;
    for (const m of lanternMeshes) m.visible = false;
    for (const o of createdObjects) {
      scene.remove(o);
      if (o instanceof THREE.InstancedMesh) {
        o.dispose();
      }
    }
    for (const g of createdGeos) g.dispose();
    for (const m of createdMats) m.dispose();
  };

  return {
    playEarthquakeCollapse,
    playPowerOutageZap,
    playShieldDeploy,
    playShieldBreak,
    syncLostIslandJail,
    playWorldTourFlight,
    playChanceCardFlip,
    playChampionshipSearchlight,
    syncFestivalLanterns,
    playBrinkPulse,
    cancelAll,
    dispose,
  };
}
