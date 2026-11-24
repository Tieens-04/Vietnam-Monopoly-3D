import * as THREE from 'three';
import { BoardTauntKind } from '../game/onlineTypes';
import { GraphicsQualityTier } from '../game/types';
import {
  AnimationDirector,
  createManagedGsapTimeline,
  ManagedVisualTimeline,
} from './animationDirector';

export const POOL_TAUNT_SLOTS = 4;

const TILE_SURFACE_Y = 0.44;
const TAUNT_KINDS: ReadonlyArray<BoardTauntKind> = [
  'slipper',
  'tomato',
  'confetti',
  'cash_stack',
];

export interface CreateTauntProjectilePoolOptions {
  scene: THREE.Scene;
  director: AnimationDirector;
  getQualityTier: () => GraphicsQualityTier;
  getReducedMotion: () => boolean;
}

export interface TauntProjectilePool {
  playTaunt(
    kind: BoardTauntKind,
    fromX: number,
    fromZ: number,
    toX: number,
    toZ: number
  ): void;
  cancelAll(): void;
  dispose(): void;
  getActiveSlotCount(): number;
}

interface TauntSlot {
  root: THREE.Group;
  variantGroups: Record<BoardTauntKind, THREE.Group>;
  projGroups: Record<BoardTauntKind, THREE.Group>;
  tomatoBurstGroup: THREE.Group;
  tomatoDrops: THREE.Mesh[];
  confettiBurstGroup: THREE.Group;
  confettiChips: THREE.Mesh[];
  active: boolean;
  runToken: number;
  timeline: ManagedVisualTimeline | null;
  animProxy: { flight: number; impact: number; blink: number };
}

function addStaticMesh(
  parent: THREE.Object3D,
  geo: THREE.BufferGeometry,
  mat: THREE.Material
): THREE.Mesh {
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  parent.add(mesh);
  return mesh;
}

/**
 * Pre-allocated 4-slot 3D Board Taunt Projectile Pool (`slipper`, `tomato`, `confetti`, `cash_stack`).
 * Allocates all shared geometries, materials, and mesh slots once at init for 0-alloc gameplay.
 */
export function createTauntProjectilePool(
  options: CreateTauntProjectilePoolOptions
): TauntProjectilePool {
  const { scene, director, getQualityTier, getReducedMotion } = options;

  let disposed = false;
  let cursor = 0;
  const createdGeos: THREE.BufferGeometry[] = [];
  const createdMats: THREE.Material[] = [];

  const trackGeo = <T extends THREE.BufferGeometry>(g: T): T => {
    createdGeos.push(g);
    return g;
  };
  const trackMat = <T extends THREE.Material>(m: T): T => {
    createdMats.push(m);
    return m;
  };

  // Shared geometries & materials for the 4 BoardTauntKind variants
  // 1. Slipper (Dép tổ ong)
  const slipperSoleGeo = trackGeo(new THREE.BoxGeometry(0.32, 0.055, 0.4));
  const slipperCapGeo = trackGeo(new THREE.CylinderGeometry(0.16, 0.16, 0.055, 10));
  const slipperStrapGeo = trackGeo(
    new THREE.TorusGeometry(0.145, 0.042, 6, 10, Math.PI)
  );
  const slipperHoleGeo = trackGeo(new THREE.CylinderGeometry(0.022, 0.022, 0.024, 6));
  const slipperSoleMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xf4efe0,
      roughness: 0.65,
      metalness: 0.05,
    })
  );
  const slipperStrapMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xe2e8f0,
      roughness: 0.55,
      metalness: 0.05,
    })
  );
  const slipperHoleMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x334155,
      roughness: 0.85,
      metalness: 0.02,
    })
  );

  // 2. Tomato (Cà chua + giọt vỡ)
  const tomatoBodyGeo = trackGeo(new THREE.SphereGeometry(0.22, 10, 8));
  const tomatoCalyxGeo = trackGeo(new THREE.ConeGeometry(0.09, 0.06, 5));
  const tomatoStemGeo = trackGeo(new THREE.CylinderGeometry(0.018, 0.024, 0.09, 5));
  const tomatoDropGeo = trackGeo(new THREE.SphereGeometry(0.065, 6, 5));
  const tomatoRedMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xef4444,
      roughness: 0.34,
      metalness: 0.05,
    })
  );
  const tomatoGreenMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x16a34a,
      roughness: 0.6,
      metalness: 0.04,
    })
  );

  // 3. Confetti (Pháo giấy + mảnh sắc màu)
  const confettiConeGeo = trackGeo(new THREE.ConeGeometry(0.14, 0.36, 8));
  const confettiChipGeo = trackGeo(new THREE.BoxGeometry(0.11, 0.02, 0.07));
  const confettiConeMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xf59e0b,
      roughness: 0.35,
      metalness: 0.25,
    })
  );
  const confettiChipMats = [0xf43f5e, 0x38bdf8, 0xfacc15, 0x4ade80].map((hex) =>
    trackMat(
      new THREE.MeshStandardMaterial({
        color: hex,
        roughness: 0.42,
        metalness: 0.1,
      })
    )
  );

  // 4. Cash Stack (Cọc tiền buộc đai vàng)
  const cashBlockGeo = trackGeo(new THREE.BoxGeometry(0.42, 0.14, 0.24));
  const cashBandGeo = trackGeo(new THREE.BoxGeometry(0.11, 0.152, 0.25));
  const cashTopBillGeo = trackGeo(new THREE.BoxGeometry(0.4, 0.018, 0.22));
  const cashGreenMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x22c55e,
      roughness: 0.48,
      metalness: 0.08,
    })
  );
  const cashDarkGreenMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x15803d,
      roughness: 0.55,
      metalness: 0.05,
    })
  );
  const cashBandMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xfacc15,
      roughness: 0.28,
      metalness: 0.45,
    })
  );

  const buildSlot = (): TauntSlot => {
    const root = new THREE.Group();
    root.visible = false;
    scene.add(root);

    // Slipper variant
    const slipperGroup = new THREE.Group();
    slipperGroup.visible = false;
    const slipperProj = new THREE.Group();
    addStaticMesh(slipperProj, slipperSoleGeo, slipperSoleMat);
    const toeCap = addStaticMesh(slipperProj, slipperCapGeo, slipperSoleMat);
    toeCap.position.set(0, 0, 0.2);
    const heelCap = addStaticMesh(slipperProj, slipperCapGeo, slipperSoleMat);
    heelCap.position.set(0, 0, -0.2);
    const strap = addStaticMesh(slipperProj, slipperStrapGeo, slipperStrapMat);
    strap.position.set(0, 0.02, 0.04);
    strap.scale.set(1.02, 0.72, 2.0);
    const holeOffsets: Array<[number, number]> = [
      [-0.055, -0.02],
      [0.055, -0.02],
      [-0.055, 0.09],
      [0.055, 0.09],
    ];
    for (const [hx, hz] of holeOffsets) {
      const hole = addStaticMesh(slipperProj, slipperHoleGeo, slipperHoleMat);
      hole.position.set(hx, 0.132, hz);
    }
    slipperGroup.add(slipperProj);
    root.add(slipperGroup);

    // Tomato variant
    const tomatoGroup = new THREE.Group();
    tomatoGroup.visible = false;
    const tomatoProj = new THREE.Group();
    const tomatoBody = addStaticMesh(tomatoProj, tomatoBodyGeo, tomatoRedMat);
    tomatoBody.scale.set(1, 0.82, 1);
    const calyx = addStaticMesh(tomatoProj, tomatoCalyxGeo, tomatoGreenMat);
    calyx.position.set(0, 0.18, 0);
    calyx.rotation.x = Math.PI;
    const stem = addStaticMesh(tomatoProj, tomatoStemGeo, tomatoGreenMat);
    stem.position.set(0, 0.23, 0);
    tomatoGroup.add(tomatoProj);

    const tomatoBurstGroup = new THREE.Group();
    tomatoBurstGroup.visible = false;
    const tomatoDrops: THREE.Mesh[] = [];
    for (let d = 0; d < 4; d++) {
      const drop = addStaticMesh(tomatoBurstGroup, tomatoDropGeo, tomatoRedMat);
      tomatoDrops.push(drop);
    }
    tomatoGroup.add(tomatoBurstGroup);
    root.add(tomatoGroup);

    // Confetti variant
    const confettiGroup = new THREE.Group();
    confettiGroup.visible = false;
    const confettiProj = new THREE.Group();
    const cone = addStaticMesh(confettiProj, confettiConeGeo, confettiConeMat);
    cone.rotation.x = Math.PI;
    confettiGroup.add(confettiProj);

    const confettiBurstGroup = new THREE.Group();
    confettiBurstGroup.visible = false;
    const confettiChips: THREE.Mesh[] = [];
    for (let c = 0; c < 6; c++) {
      const chip = addStaticMesh(
        confettiBurstGroup,
        confettiChipGeo,
        confettiChipMats[c % confettiChipMats.length]
      );
      confettiChips.push(chip);
    }
    confettiGroup.add(confettiBurstGroup);
    root.add(confettiGroup);

    // Cash Stack variant
    const cashGroup = new THREE.Group();
    cashGroup.visible = false;
    const cashProj = new THREE.Group();
    addStaticMesh(cashProj, cashBlockGeo, cashGreenMat);
    addStaticMesh(cashProj, cashBandGeo, cashBandMat);
    const topBillA = addStaticMesh(cashProj, cashTopBillGeo, cashDarkGreenMat);
    topBillA.position.set(0, 0.082, 0);
    topBillA.rotation.y = 0.13;
    const topBillB = addStaticMesh(cashProj, cashTopBillGeo, cashGreenMat);
    topBillB.position.set(0, 0.095, 0);
    topBillB.rotation.y = -0.11;
    cashGroup.add(cashProj);
    root.add(cashGroup);

    return {
      root,
      variantGroups: {
        slipper: slipperGroup,
        tomato: tomatoGroup,
        confetti: confettiGroup,
        cash_stack: cashGroup,
      },
      projGroups: {
        slipper: slipperProj,
        tomato: tomatoProj,
        confetti: confettiProj,
        cash_stack: cashProj,
      },
      tomatoBurstGroup,
      tomatoDrops,
      confettiBurstGroup,
      confettiChips,
      active: false,
      runToken: 0,
      timeline: null,
      animProxy: { flight: 0, impact: 0, blink: 0 },
    };
  };

  const slots: TauntSlot[] = Array.from({ length: POOL_TAUNT_SLOTS }, buildSlot);

  const resetSlot = (slot: TauntSlot): void => {
    slot.active = false;
    slot.root.visible = false;
    slot.root.position.set(0, 0, 0);
    slot.root.rotation.set(0, 0, 0);
    slot.root.scale.setScalar(1);

    for (const kind of TAUNT_KINDS) {
      const vg = slot.variantGroups[kind];
      vg.visible = false;
      const pg = slot.projGroups[kind];
      pg.visible = true;
      pg.position.set(0, 0, 0);
      pg.rotation.set(0, 0, 0);
      pg.scale.setScalar(1);
    }

    slot.tomatoBurstGroup.visible = false;
    for (const drop of slot.tomatoDrops) {
      drop.position.set(0, 0, 0);
      drop.scale.setScalar(1);
    }

    slot.confettiBurstGroup.visible = false;
    for (let i = 0; i < slot.confettiChips.length; i++) {
      const chip = slot.confettiChips[i];
      chip.visible = true;
      chip.position.set(0, 0.18, 0);
      chip.rotation.set(0, i * 0.8, 0);
      chip.scale.setScalar(1);
    }
  };

  const claimSlotIndex = (): number => {
    for (let offset = 0; offset < POOL_TAUNT_SLOTS; offset++) {
      const idx = (cursor + offset) % POOL_TAUNT_SLOTS;
      if (!slots[idx].active) {
        cursor = (idx + 1) % POOL_TAUNT_SLOTS;
        return idx;
      }
    }
    const evicted = cursor;
    cursor = (cursor + 1) % POOL_TAUNT_SLOTS;
    return evicted;
  };

  const playTaunt = (
    kind: BoardTauntKind,
    fromX: number,
    fromZ: number,
    toX: number,
    toZ: number
  ): void => {
    if (disposed) return;
    if (!Object.prototype.hasOwnProperty.call(slots[0].variantGroups, kind)) {
      return;
    }
    if (
      !Number.isFinite(fromX) ||
      !Number.isFinite(fromZ) ||
      !Number.isFinite(toX) ||
      !Number.isFinite(toZ)
    ) {
      return;
    }

    const slotIdx = claimSlotIndex();
    const slot = slots[slotIdx];
    slot.runToken += 1;
    const myToken = slot.runToken;

    if (slot.timeline) {
      slot.timeline.cancel();
      slot.timeline = null;
    }

    resetSlot(slot);
    slot.active = true;
    slot.root.visible = true;
    slot.variantGroups[kind].visible = true;
    slot.animProxy.flight = 0;
    slot.animProxy.impact = 0;
    slot.animProxy.blink = 0;

    const reduced = getReducedMotion();
    const tier = getQualityTier();
    const activeVariant = slot.variantGroups[kind];
    const activeProj = slot.projGroups[kind];

    const finishSlot = (): void => {
      if (slot.runToken !== myToken) return;
      slot.timeline = null;
      resetSlot(slot);
    };

    if (reduced) {
      slot.root.position.set(toX, TILE_SURFACE_Y + 0.55, toZ);
      slot.root.rotation.set(0, 0, 0);
      slot.root.scale.setScalar(1);

      const tl = createManagedGsapTimeline({
        id: `taunt:slot:${slotIdx}`,
        category: 'event',
        blocksIdleSleep: true,
        build: (g) => {
          g.to(
            slot.animProxy,
            {
              blink: 1,
              duration: 0.25,
              ease: 'none',
              onUpdate: () => {
                const u = slot.animProxy.blink;
                activeVariant.visible = u < 0.35 || u > 0.58;
              },
            },
            0
          );
        },
        onComplete: finishSlot,
        onCancel: finishSlot,
      });
      slot.timeline = tl;
      director.register(tl, 'cancel');
      return;
    }

    const dx = toX - fromX;
    const dz = toZ - fromZ;
    const dist = Math.hypot(dx, dz);
    const yaw = dist > 1e-4 ? Math.atan2(dx, dz) : 0;
    const arcHeight = Math.min(3.2, Math.max(1.4, 1.3 + dist * 0.14));

    slot.root.position.set(fromX, TILE_SURFACE_Y + 0.52, fromZ);
    slot.root.rotation.set(0, yaw, 0);

    const confettiChipCount = tier === 'low' ? 3 : slot.confettiChips.length;
    if (kind === 'confetti') {
      slot.confettiBurstGroup.visible = true;
      for (let i = 0; i < slot.confettiChips.length; i++) {
        slot.confettiChips[i].visible = i < confettiChipCount;
      }
    }

    const tl = createManagedGsapTimeline({
      id: `taunt:slot:${slotIdx}`,
      category: 'event',
      blocksIdleSleep: true,
      build: (g) => {
        g.to(
          slot.animProxy,
          {
            flight: 1,
            duration: 0.48,
            ease: 'none',
            onUpdate: () => {
              const u = slot.animProxy.flight;
              const x = fromX + dx * u;
              const z = fromZ + dz * u;
              const y =
                TILE_SURFACE_Y +
                0.52 * (1 - u) +
                0.24 * u +
                Math.sin(u * Math.PI) * arcHeight;
              slot.root.position.set(x, y, z);

              if (kind === 'slipper') {
                activeProj.rotation.set(
                  u * Math.PI * 3.5,
                  0,
                  Math.sin(u * Math.PI * 2) * 0.25
                );
              } else if (kind === 'tomato') {
                activeProj.rotation.set(u * Math.PI * 2, 0, 0);
              } else if (kind === 'confetti') {
                activeProj.rotation.set(-0.35 + u * 0.7, 0, u * Math.PI * 1.5);
                for (let i = 0; i < slot.confettiChips.length; i++) {
                  const chip = slot.confettiChips[i];
                  if (!chip.visible) continue;
                  const a = (i / confettiChipCount) * Math.PI * 2;
                  const r = 0.06 + u * 0.16;
                  chip.position.set(
                    Math.cos(a) * r,
                    0.2 + u * 0.14,
                    Math.sin(a) * r
                  );
                  chip.rotation.set(u * 4 + i, a, u * 3);
                }
              } else {
                activeProj.rotation.set(
                  0,
                  u * Math.PI * 4,
                  Math.sin(u * Math.PI * 3) * 0.18
                );
              }
            },
          },
          0
        );

        g.to(
          slot.animProxy,
          {
            impact: 1,
            duration: 0.18,
            ease: 'power2.out',
            onUpdate: () => {
              const b = slot.animProxy.impact;
              const bounceY = Math.sin(b * Math.PI) * 0.28;
              slot.root.position.set(toX, TILE_SURFACE_Y + 0.24 + bounceY, toZ);

              if (kind === 'slipper') {
                activeProj.rotation.set(Math.PI * 3.5 + b * 0.6, 0, 0);
                const s = 1 + Math.sin(b * Math.PI) * 0.1;
                activeProj.scale.set(s, Math.max(0.85, 1 - Math.sin(b * Math.PI) * 0.12), s);
              } else if (kind === 'tomato') {
                activeProj.scale.set(
                  1 + b * 0.45,
                  Math.max(0.28, 1 - b * 0.72),
                  1 + b * 0.45
                );
                if (tier !== 'low') {
                  slot.tomatoBurstGroup.visible = true;
                  for (let d = 0; d < slot.tomatoDrops.length; d++) {
                    const drop = slot.tomatoDrops[d];
                    const a = (d / slot.tomatoDrops.length) * Math.PI * 2 + 0.35;
                    const radius = 0.16 + b * 0.44;
                    drop.position.set(
                      Math.cos(a) * radius,
                      0.06 + Math.sin(b * Math.PI) * 0.22,
                      Math.sin(a) * radius
                    );
                    drop.scale.setScalar(Math.max(0.35, 1 - b * 0.55));
                  }
                }
              } else if (kind === 'confetti') {
                activeProj.scale.setScalar(Math.max(0.4, 1 - b * 0.45));
                for (let i = 0; i < slot.confettiChips.length; i++) {
                  const chip = slot.confettiChips[i];
                  if (!chip.visible) continue;
                  const a = (i / confettiChipCount) * Math.PI * 2;
                  const r = 0.22 + b * 0.56;
                  chip.position.set(
                    Math.cos(a) * r,
                    0.26 + Math.sin(b * Math.PI) * 0.48 - b * 0.12,
                    Math.sin(a) * r
                  );
                  chip.rotation.set(4 + b * 6 + i, a + b * 2, 3 + b * 5);
                }
              } else {
                const s = 1 + Math.sin(b * Math.PI) * 0.16;
                activeProj.scale.setScalar(s);
              }
            },
          },
          0.48
        );
      },
      onComplete: finishSlot,
      onCancel: finishSlot,
    });
    slot.timeline = tl;
    director.register(tl, 'cancel');
  };

  const cancelAll = (): void => {
    for (const slot of slots) {
      slot.runToken += 1;
      const tl = slot.timeline;
      slot.timeline = null;
      if (tl) {
        tl.cancel();
      }
      resetSlot(slot);
    }
  };

  const dispose = (): void => {
    if (disposed) return;
    disposed = true;
    cancelAll();
    for (const slot of slots) {
      scene.remove(slot.root);
    }
    for (const g of createdGeos) g.dispose();
    for (const m of createdMats) m.dispose();
  };

  const getActiveSlotCount = (): number => {
    let count = 0;
    for (const slot of slots) {
      if (slot.active) count += 1;
    }
    return count;
  };

  return {
    playTaunt,
    cancelAll,
    dispose,
    getActiveSlotCount,
  };
}
