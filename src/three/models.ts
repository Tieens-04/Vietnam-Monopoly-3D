import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CHARACTER_PERSONAS } from '../game/avatarLogic';
import { formatCountdownClock } from '../game/rules';
import { RegionalArchitectureStyle } from '../game/visualTheme';
import {
  create3DTaxGrassTexture,
  createBoulevardRoadTexture,
  createBusinessTourPitchTexture,
  createCardDeckTopTexture,
  createCountdownClockBoardTexture,
  createOuterPriceTabTexture,
  drawCountdownClockBoardToCanvas,
} from './textures';

export interface NightLightingPalette {
  houseWindowMat: THREE.MeshStandardMaterial;
  hotelWindowMat: THREE.MeshStandardMaterial;
  hotelBeaconMat: THREE.MeshStandardMaterial;
  skylineTowerMat: THREE.MeshStandardMaterial;
  cityBuildingWinMat: THREE.MeshStandardMaterial;
  streetLampBulbMat: THREE.MeshStandardMaterial;
  streetLampHaloMat: THREE.MeshBasicMaterial;
  lanternSilkMat: THREE.MeshStandardMaterial;
  fountainWaterMat: THREE.MeshStandardMaterial;
  balloonGlowMat: THREE.MeshStandardMaterial;
  tokenHeadlightMat: THREE.MeshStandardMaterial;
  oceanMat: THREE.MeshStandardMaterial;
  islandMat: THREE.MeshStandardMaterial;
  lawnMat: THREE.MeshStandardMaterial;
  starMat: THREE.PointsMaterial;
  skyDomeUniforms: {
    uNightFactor: { value: number };
    uLinearOutput: { value: number };
    uDayBlueTop: { value: THREE.Color };
    uDayBlueMid: { value: THREE.Color };
    uDayHorizon: { value: THREE.Color };
    uDayPinkMid: { value: THREE.Color };
    uDayPinkWarm: { value: THREE.Color };
    uNightTop: { value: THREE.Color };
    uNightBottom: { value: THREE.Color };
  };
}

export interface BoulevardCarAnim {
  group: THREE.Group;
  baseY: number;
  phase: number;
}

export interface ProtrudingPriceTabRefs {
  group: THREE.Group;
  hitMesh: THREE.Mesh;
  collarMat: THREE.MeshStandardMaterial;
  topMat: THREE.MeshStandardMaterial;
}

export interface OwnershipBuildingSuiteRefs {
  root: THREE.Group;
  padMesh: THREE.Mesh;
  padMat: THREE.MeshStandardMaterial;
  facadeMat: THREE.MeshPhysicalMaterial;
  roofMat: THREE.MeshPhysicalMaterial;
  starterPavilion: THREE.Group;
  houses: THREE.Group[];
  hotel: THREE.Group;
  shieldGroup: THREE.Group;
  levelBadgeMesh: THREE.Mesh;
  levelBadgeMat: THREE.MeshBasicMaterial;
  setOwnerTint: (ownerHex: string) => void;
  setQualityOptions: (opts: {
    shadowsEnabled: boolean;
    clearcoatEnabled: boolean;
  }) => void;
}

export interface CornerDioramaAnimRefs {
  tileIndex: number;
  bobTarget: THREE.Object3D | null;
  spinTarget: THREE.Object3D | null;
  baseBobY: number;
}

function createSoftGlowDiscTexture(
  innerRgba: string,
  midRgba: string,
  outerRgba = 'rgba(251, 191, 36, 0)'
): THREE.CanvasTexture {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(
    size / 2,
    size / 2,
    2,
    size / 2,
    size / 2,
    size / 2
  );
  grad.addColorStop(0, innerRgba);
  grad.addColorStop(0.55, midRgba);
  grad.addColorStop(1, outerRgba);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createNightLightingPalette(maxAnisotropy = 4): NightLightingPalette {
  const lampHaloTex = createSoftGlowDiscTexture(
    'rgba(254, 240, 138, 0.92)',
    'rgba(217, 119, 6, 0.42)',
    'rgba(217, 119, 6, 0)'
  );
  const tabletopTex = createBoulevardRoadTexture(maxAnisotropy);
  const pitchTex = createBusinessTourPitchTexture(maxAnisotropy);

  return {
    houseWindowMat: new THREE.MeshStandardMaterial({
      color: 0xf8fafc,
      roughness: 0.45,
      metalness: 0.1,
      emissive: 0xfbbf24,
      emissiveIntensity: 0,
    }),
    hotelWindowMat: new THREE.MeshStandardMaterial({
      color: 0xe0f2fe,
      roughness: 0.35,
      metalness: 0.15,
      emissive: 0xfde047,
      emissiveIntensity: 0,
    }),
    hotelBeaconMat: new THREE.MeshStandardMaterial({
      color: 0xfacc15,
      roughness: 0.35,
      metalness: 0.45,
      emissive: 0xfef08a,
      emissiveIntensity: 0,
    }),
    skylineTowerMat: new THREE.MeshStandardMaterial({
      color: 0x29b6f6,
      roughness: 0.5,
      metalness: 0.15,
      emissive: 0x5eead4,
      emissiveIntensity: 0,
    }),
    cityBuildingWinMat: new THREE.MeshStandardMaterial({
      color: 0xe2e8f0,
      roughness: 0.5,
      metalness: 0.1,
      emissive: 0xfde047,
      emissiveIntensity: 0,
    }),
    streetLampBulbMat: new THREE.MeshStandardMaterial({
      color: 0xfef9c3,
      roughness: 0.4,
      metalness: 0.05,
      emissive: 0xfbbf24,
      emissiveIntensity: 0,
    }),
    streetLampHaloMat: new THREE.MeshBasicMaterial({
      map: lampHaloTex,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      opacity: 0,
    }),
    lanternSilkMat: new THREE.MeshStandardMaterial({
      color: 0xf43f5e,
      roughness: 0.65,
      metalness: 0.08,
      emissive: 0xf59e0b,
      emissiveIntensity: 0,
    }),
    fountainWaterMat: new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      roughness: 0.32,
      metalness: 0.12,
      emissive: 0x0ea5e9,
      emissiveIntensity: 0,
    }),
    balloonGlowMat: new THREE.MeshStandardMaterial({
      color: 0xf472b6,
      roughness: 0.68,
      metalness: 0.1,
      emissive: 0xf59e0b,
      emissiveIntensity: 0,
    }),
    tokenHeadlightMat: markSharedMat(
      new THREE.MeshStandardMaterial({
        color: 0xfef08a,
        roughness: 0.45,
        metalness: 0.15,
        emissive: 0xfde047,
        emissiveIntensity: 0,
      })
    ),
    oceanMat: new THREE.MeshStandardMaterial({
      color: 0xdcf0ff,
      roughness: 0.85,
      metalness: 0.02,
    }),
    islandMat: new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: tabletopTex,
      roughness: 0.7,
      metalness: 0.1,
      emissive: 0x000000,
      emissiveIntensity: 0,
    }),
    lawnMat: new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: pitchTex,
      roughness: 0.78,
      metalness: 0.04,
      envMapIntensity: 0.08,
      emissive: 0x62c42c,
      emissiveIntensity: 0.06,
    }),
    starMat: new THREE.PointsMaterial({
      color: 0xfef9c3,
      size: 0.68,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0,
      fog: false,
    }),
    skyDomeUniforms: {
      uNightFactor: { value: 0 },
      uLinearOutput: { value: 0 },
      uDayBlueTop: { value: new THREE.Color('#7CC6FE') },
      uDayBlueMid: { value: new THREE.Color('#B5E2FF') },
      uDayHorizon: { value: new THREE.Color('#FFF0F5') },
      uDayPinkMid: { value: new THREE.Color('#FFC6D9') },
      uDayPinkWarm: { value: new THREE.Color('#FFB5A7') },
      uNightTop: { value: new THREE.Color('#0B1638') },
      uNightBottom: { value: new THREE.Color('#232F6E') },
    },
  };
}

function markSharedGeo<T extends THREE.BufferGeometry>(geo: T): T {
  geo.userData.sharedStatic = true;
  return geo;
}

function markSharedMat<T extends THREE.Material>(mat: T): T {
  mat.userData.sharedStatic = true;
  return mat;
}

/**
 * Builds a BoxGeometry whose 5 side/bottom faces (+X, -X, -Y, +Z, -Z) are batched into
 * Group 0 (`materialIndex = 0`) and whose +Y top face is in Group 1 (`materialIndex = 1`).
 * Cuts WebGL draw calls per textured tile/tab/card from 6 down to 2 with identical visuals!
 */
export function createTopCappedBoxGeometry(
  width: number,
  height: number,
  depth: number
): THREE.BufferGeometry {
  const box = new THREE.BoxGeometry(width, height, depth);
  const srcIndex = box.getIndex();
  if (!srcIndex || box.groups.length !== 6) return box;

  const srcArr = srcIndex.array;
  const reordered = new Uint16Array(srcArr.length);
  let writeCursor = 0;

  for (let g = 0; g < box.groups.length; g++) {
    if (g === 2) continue;
    const grp = box.groups[g];
    for (let k = 0; k < grp.count; k++) {
      reordered[writeCursor++] = srcArr[grp.start + k];
    }
  }
  const sideCount = writeCursor;

  const topGrp = box.groups[2];
  for (let k = 0; k < topGrp.count; k++) {
    reordered[writeCursor++] = srcArr[topGrp.start + k];
  }
  const topCount = topGrp.count;

  box.setIndex(new THREE.BufferAttribute(reordered, 1));
  box.clearGroups();
  box.addGroup(0, sideCount, 0);
  box.addGroup(sideCount, topCount, 1);
  return box;
}

/**
 * Merges static `THREE.Mesh` descendants inside `root` that share the exact same `Material`
 * instance (skipping excluded subtrees, multi-material meshes, and `depthWrite: false` decals).
 * Preserves local-to-root vertex positions, normals, UVs, and shadow flags while drastically
 * reducing per-frame WebGL draw calls during camera rotation.
 */
export function mergeGroupMeshesByMaterial(
  root: THREE.Group,
  excludeSubtrees?: Set<THREE.Object3D>
): void {
  const savedPos = root.position.clone();
  const savedQuat = root.quaternion.clone();
  const savedScale = root.scale.clone();

  root.position.set(0, 0, 0);
  root.quaternion.identity();
  root.scale.set(1, 1, 1);
  root.updateMatrixWorld(true);

  const buckets = new Map<THREE.Material, THREE.Mesh[]>();
  const walk = (node: THREE.Object3D) => {
    if (excludeSubtrees?.has(node)) return;
    if (node instanceof THREE.Mesh) {
      if (
        !Array.isArray(node.material) &&
        node.material &&
        node.material.depthWrite !== false
      ) {
        let list = buckets.get(node.material);
        if (!list) {
          list = [];
          buckets.set(node.material, list);
        }
        list.push(node);
      }
    }
    for (let i = 0; i < node.children.length; i++) {
      walk(node.children[i]);
    }
  };
  walk(root);

  for (const [mat, meshes] of buckets.entries()) {
    if (meshes.length < 2) continue;

    const bakedParts: THREE.BufferGeometry[] = [];
    let anyCastShadow = false;
    let anyReceiveShadow = false;

    for (const m of meshes) {
      if (m.castShadow) anyCastShadow = true;
      if (m.receiveShadow) anyReceiveShadow = true;

      const baked = m.geometry.index
        ? m.geometry.toNonIndexed()
        : m.geometry.clone();
      const posAttr = baked.getAttribute('position');
      if (!baked.hasAttribute('normal')) {
        baked.computeVertexNormals();
      }
      if (!baked.hasAttribute('uv') && posAttr) {
        baked.setAttribute(
          'uv',
          new THREE.Float32BufferAttribute(new Float32Array(posAttr.count * 2), 2)
        );
      }
      for (const attrName of Object.keys(baked.attributes)) {
        if (attrName !== 'position' && attrName !== 'normal' && attrName !== 'uv') {
          baked.deleteAttribute(attrName);
        }
      }
      baked.clearGroups();
      baked.applyMatrix4(m.matrixWorld);
      bakedParts.push(baked);
    }

    const mergedGeo = mergeGeometries(bakedParts, false);
    for (const bp of bakedParts) {
      bp.dispose();
    }
    if (!mergedGeo) continue;

    for (const m of meshes) {
      m.parent?.remove(m);
      if (m.geometry && !m.geometry.userData?.sharedStatic) {
        m.geometry.dispose();
      }
    }

    const mergedMesh = new THREE.Mesh(mergedGeo, mat);
    mergedMesh.castShadow = anyCastShadow;
    mergedMesh.receiveShadow = anyReceiveShadow;
    root.add(mergedMesh);
  }

  // Prune empty intermediate Groups left behind after merging
  const pruneEmptyGroups = (parent: THREE.Object3D) => {
    for (let i = parent.children.length - 1; i >= 0; i--) {
      const child = parent.children[i];
      if (excludeSubtrees?.has(child)) continue;
      if (child.type === 'Group') {
        pruneEmptyGroups(child);
        if (child.children.length === 0) {
          parent.remove(child);
        }
      }
    }
  };
  pruneEmptyGroups(root);

  root.position.copy(savedPos);
  root.quaternion.copy(savedQuat);
  root.scale.copy(savedScale);
}

const contactShadowTexCache = new Map<number, THREE.CanvasTexture>();

function createContactShadow(radius: number, opacity = 0.3): THREE.Mesh {
  let tex = contactShadowTexCache.get(opacity);
  if (!tex) {
    const size = 64;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    const grad = ctx.createRadialGradient(
      size / 2,
      size / 2,
      2,
      size / 2,
      size / 2,
      size / 2
    );
    grad.addColorStop(0, `rgba(15, 23, 42, ${opacity})`);
    grad.addColorStop(0.65, `rgba(15, 23, 42, ${opacity * 0.42})`);
    grad.addColorStop(1, 'rgba(15, 23, 42, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);

    tex = new THREE.CanvasTexture(canvas);
    tex.userData.sharedStatic = true;
    contactShadowTexCache.set(opacity, tex);
  }

  const geo = new THREE.PlaneGeometry(radius * 2, radius * 2);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshBasicMaterial({
    map: tex,
    transparent: true,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.y = 0.015;
  return mesh;
}

const SHARED_TAB_WALL_MAT = markSharedMat(
  new THREE.MeshStandardMaterial({
    color: 0xf4f5f7,
    roughness: 0.7,
    metalness: 0.1,
  })
);
const SHARED_TAB_NECK_GEO = markSharedGeo(new THREE.BoxGeometry(1.04, 0.24, 0.38));
const SHARED_TAB_COLLAR_GEO = markSharedGeo(new THREE.BoxGeometry(1.44, 0.18, 1.04));
const SHARED_TAB_PLATE_GEO = markSharedGeo(
  createTopCappedBoxGeometry(1.34, 0.18, 0.92)
);

/**
 * Builds a chunky Business Tour 3D Price Tab extending OUTWARD from the outer edge of a tile.
 * Uses matte/toon-like PBR materials (roughness: 0.7, metalness: 0.1).
 */
export function createProtrudingPriceTab(
  initialLabel: string,
  accentHex: string,
  flip180: boolean,
  maxAnisotropy: number
): ProtrudingPriceTabRefs {
  const group = new THREE.Group();

  const isNegative = initialLabel.startsWith('-');
  const initialCollarColor = new THREE.Color(
    isNegative ? '#FB7185' : accentHex || '#CBD5E1'
  ).lerp(new THREE.Color('#FFFFFF'), isNegative ? 0.08 : 0.35);
  const collarMat = new THREE.MeshStandardMaterial({
    color: initialCollarColor,
    roughness: 0.58,
    metalness: 0.12,
  });

  const topTex = createOuterPriceTabTexture(
    initialLabel,
    accentHex,
    null,
    { isFestival: false, cupMultiplier: null },
    flip180,
    maxAnisotropy
  );
  const topMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: topTex,
    roughness: 0.68,
    metalness: 0.08,
  });

  // 1. Structural 3D bridge neck + 2. Chunky lower bevelled 3D collar (merged into 1 draw call!)
  const collarGroup = new THREE.Group();
  const neck = new THREE.Mesh(SHARED_TAB_NECK_GEO, collarMat);
  neck.position.set(0, 0.1, 1.35);
  neck.castShadow = true;
  collarGroup.add(neck);

  const lowerCollar = new THREE.Mesh(SHARED_TAB_COLLAR_GEO, collarMat);
  lowerCollar.position.set(0, 0.08, 1.81);
  lowerCollar.castShadow = true;
  lowerCollar.receiveShadow = true;
  collarGroup.add(lowerCollar);
  mergeGroupMeshesByMaterial(collarGroup);
  group.add(collarGroup);

  // 3. Raised #F4F5F7 3D price plate displaying bold dark-slate shorthand (200K, 1.2M)
  const hitMesh = new THREE.Mesh(SHARED_TAB_PLATE_GEO, [
    SHARED_TAB_WALL_MAT,
    topMat,
  ]);
  hitMesh.position.set(0, 0.22, 1.81);
  hitMesh.castShadow = true;
  hitMesh.receiveShadow = true;
  group.add(hitMesh);

  return { group, hitMesh, collarMat, topMat };
}

/**
 * Stylized 3D Character Pawns standing directly on the tiles in Business Tour fashion!
 * Each pawn wears a vibrant tailored suit in the player's signature color (#F5B800, #66C61C, #E91E63, #29B6F6)
 * with expressive chibi proportions and distinct character headwear.
 */
export function createPlayerTokenMesh(
  tokenType: 'car' | 'yacht' | 'jet' | 'crown',
  colorHex: string,
  palette?: NightLightingPalette
): THREE.Group {
  const group = new THREE.Group();

  const suitColor = new THREE.Color(colorHex);
  const darkSuitColor = suitColor.clone().multiplyScalar(0.74);

  const suitMat = new THREE.MeshPhysicalMaterial({
    color: suitColor,
    roughness: 0.38,
    metalness: 0.14,
    clearcoat: 0.65,
    clearcoatRoughness: 0.18,
  });
  const suitDarkMat = new THREE.MeshStandardMaterial({
    color: darkSuitColor,
    roughness: 0.55,
    metalness: 0.14,
  });
  const whiteMat = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    roughness: 0.36,
    metalness: 0.08,
    clearcoat: 0.55,
    clearcoatRoughness: 0.2,
  });
  const skinMat = new THREE.MeshStandardMaterial({
    color: 0xfbd5bd,
    roughness: 0.62,
    metalness: 0.02,
    emissive: 0xffbfa3,
    emissiveIntensity: 0.05,
  });
  const blushMat = new THREE.MeshBasicMaterial({
    color: 0xff8fab,
    transparent: true,
    opacity: 0.45,
  });
  const shoeMat = new THREE.MeshStandardMaterial({
    color: 0x1e293b,
    roughness: 0.45,
    metalness: 0.22,
  });
  const goldMat = new THREE.MeshStandardMaterial({
    color: 0xfacc15,
    roughness: 0.26,
    metalness: 0.65,
  });
  const glassMat = new THREE.MeshPhysicalMaterial({
    color: 0x38bdf8,
    roughness: 0.16,
    metalness: 0.2,
    clearcoat: 0.9,
  });
  const headlightMat = palette?.tokenHeadlightMat ?? goldMat;

  const hairHex =
    tokenType === 'car'
      ? 0x2a1810
      : tokenType === 'yacht'
        ? 0x1e293b
        : tokenType === 'jet'
          ? 0x4a2512
          : 0x6b2814;
  const hairMat = new THREE.MeshStandardMaterial({
    color: hairHex,
    roughness: 0.58,
    metalness: 0.08,
  });

  group.add(createContactShadow(0.46, 0.38));

  // Glossy metallic-rimmed pedestal base + bespoke Business Tour vehicle/emblem mount!
  const baseGoldRim = new THREE.Mesh(
    new THREE.CylinderGeometry(0.36, 0.39, 0.06, 24),
    goldMat
  );
  baseGoldRim.position.y = 0.03;
  baseGoldRim.castShadow = true;
  group.add(baseGoldRim);

  const baseDisc = new THREE.Mesh(
    new THREE.CylinderGeometry(0.32, 0.34, 0.05, 24),
    whiteMat
  );
  baseDisc.position.y = 0.068;
  group.add(baseDisc);

  const baseInner = new THREE.Mesh(
    new THREE.CylinderGeometry(0.26, 0.26, 0.03, 24),
    suitMat
  );
  baseInner.position.y = 0.095;
  group.add(baseInner);

  // Signature Archetype Luxury Mount around Pedestal so all 4 tokens have unmistakable silhouettes!
  if (tokenType === 'car') {
    // Sleek Supercar front nose, fenders, wheels & glowing LED headlights
    const hood = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.12, 0.56), suitMat);
    hood.position.set(0, 0.14, 0.08);
    hood.castShadow = true;
    group.add(hood);

    const splitter = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.035, 0.14), goldMat);
    splitter.position.set(0, 0.09, 0.34);
    group.add(splitter);

    const wheelGeo = new THREE.CylinderGeometry(0.085, 0.085, 0.06, 12);
    wheelGeo.rotateZ(Math.PI / 2);
    for (const [wx, wz] of [
      [-0.24, 0.2],
      [0.24, 0.2],
      [-0.24, -0.14],
      [0.24, -0.14],
    ]) {
      const wheel = new THREE.Mesh(wheelGeo, shoeMat);
      wheel.position.set(wx, 0.1, wz);
      group.add(wheel);
    }

    for (const hx of [-0.14, 0.14]) {
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.04, 0.05), headlightMat);
      lamp.position.set(hx, 0.15, 0.36);
      group.add(lamp);
    }
  } else if (tokenType === 'yacht') {
    // Luxury Speed-Yacht pointed white hull bow + golden deck rail + windshield
    const hull = new THREE.Mesh(new THREE.ConeGeometry(0.32, 0.62, 4), whiteMat);
    hull.rotation.x = Math.PI / 2;
    hull.rotation.z = Math.PI / 4;
    hull.scale.set(0.95, 1, 0.44);
    hull.position.set(0, 0.14, 0.16);
    hull.castShadow = true;
    group.add(hull);

    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.045, 0.44), suitMat);
    stripe.position.set(0, 0.16, 0.02);
    group.add(stripe);

    const windshield = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.09, 0.08), glassMat);
    windshield.rotation.x = -0.35;
    windshield.position.set(0, 0.22, 0.18);
    group.add(windshield);
  } else if (tokenType === 'jet') {
    // Executive Jet swept wings + twin gold-trimmed turbofan engines
    const wings = new THREE.Mesh(new THREE.BoxGeometry(0.82, 0.04, 0.22), suitMat);
    wings.position.set(0, 0.15, -0.02);
    wings.castShadow = true;
    group.add(wings);

    const wingTips = new THREE.Mesh(new THREE.BoxGeometry(0.86, 0.1, 0.05), goldMat);
    wingTips.position.set(0, 0.19, -0.08);
    group.add(wingTips);

    const engGeo = new THREE.CylinderGeometry(0.065, 0.055, 0.24, 12);
    engGeo.rotateX(Math.PI / 2);
    for (const ex of [-0.26, 0.26]) {
      const eng = new THREE.Mesh(engGeo, whiteMat);
      eng.position.set(ex, 0.12, 0.06);
      group.add(eng);
      const glow = new THREE.Mesh(new THREE.SphereGeometry(0.042, 8, 8), headlightMat);
      glow.position.set(ex, 0.12, 0.18);
      group.add(glow);
    }
  } else {
    // Royal Crown Jewel Pedestal Cushion with 6 glowing golden spires around the rim
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const jewel = new THREE.Mesh(new THREE.OctahedronGeometry(0.06, 0), goldMat);
      jewel.position.set(Math.cos(a) * 0.31, 0.14, Math.sin(a) * 0.31);
      group.add(jewel);
    }
  }

  // Shoes & Legs standing proudly
  const legGeo = new THREE.CylinderGeometry(0.068, 0.062, 0.22, 10);
  const shoeGeo = new THREE.BoxGeometry(0.13, 0.07, 0.18);
  for (const lx of [-0.095, 0.095]) {
    const shoe = new THREE.Mesh(shoeGeo, shoeMat);
    shoe.position.set(lx, 0.13, 0.025);
    shoe.castShadow = true;
    group.add(shoe);

    const leg = new THREE.Mesh(legGeo, suitDarkMat);
    leg.position.set(lx, 0.255, 0);
    leg.castShadow = true;
    group.add(leg);
  }

  const isFemale = CHARACTER_PERSONAS[tokenType]?.isFemale ?? (tokenType === 'yacht' || tokenType === 'crown');
  group.userData.isFemalePersona = isFemale;

  // Stylized Suit Torso + Crisp White Shirt V-Collar + Male Tie vs Female Pearl Necklace & Royal Brooch
  const torso = new THREE.Mesh(
    new THREE.CylinderGeometry(isFemale ? 0.168 : 0.185, isFemale ? 0.148 : 0.158, 0.32, 16),
    suitMat
  );
  torso.scale.set(isFemale ? 1.02 : 1.08, 1, 0.84);
  torso.position.y = 0.495;
  torso.castShadow = true;
  group.add(torso);

  const shirtFront = new THREE.Mesh(
    new THREE.BoxGeometry(isFemale ? 0.118 : 0.13, 0.18, 0.04),
    whiteMat
  );
  shirtFront.position.set(0, 0.545, 0.132);
  group.add(shirtFront);

  if (isFemale) {
    group.userData.hasNecktie = false;
    const pearlNecklace = new THREE.Mesh(
      new THREE.TorusGeometry(0.068, 0.016, 8, 16, Math.PI * 1.15),
      whiteMat
    );
    pearlNecklace.rotation.x = Math.PI * 0.42;
    pearlNecklace.rotation.z = Math.PI * 0.92;
    pearlNecklace.position.set(0, 0.615, 0.115);
    group.add(pearlNecklace);

    const brooch = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.036, 0),
      goldMat
    );
    brooch.position.set(0, 0.555, 0.15);
    group.add(brooch);
  } else {
    group.userData.hasNecktie = true;
    const tie = new THREE.Mesh(
      new THREE.BoxGeometry(0.048, 0.14, 0.055),
      goldMat
    );
    tie.position.set(0, 0.525, 0.145);
    group.add(tie);
  }

  const armGeo = new THREE.CylinderGeometry(0.052, 0.046, 0.26, 10);
  const handGeo = new THREE.SphereGeometry(0.052, 10, 8);
  for (const side of [-1, 1]) {
    const arm = new THREE.Mesh(armGeo, suitMat);
    arm.position.set(side * 0.225, 0.495, 0.01);
    arm.rotation.z = side * -0.22;
    arm.castShadow = true;
    group.add(arm);

    const hand = new THREE.Mesh(handGeo, skinMat);
    hand.position.set(side * 0.255, 0.365, 0.02);
    group.add(hand);
  }

  // Expressive Chibi Head with Eye Catchlights & Rosy Cheeks
  const headGroup = new THREE.Group();
  headGroup.position.y = 0.835;

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.212, 20, 16), skinMat);
  head.scale.set(1.02, 0.98, 0.98);
  head.castShadow = true;
  headGroup.add(head);

  const eyeGeo = new THREE.SphereGeometry(0.028, 10, 10);
  const catchGeo = new THREE.SphereGeometry(0.011, 8, 8);
  const blushGeo = new THREE.SphereGeometry(0.032, 8, 8);
  for (const ex of [-0.072, 0.072]) {
    const eye = new THREE.Mesh(eyeGeo, shoeMat);
    eye.position.set(ex, 0.015, 0.193);
    headGroup.add(eye);

    const catchLight = new THREE.Mesh(catchGeo, whiteMat);
    catchLight.position.set(ex + 0.009, 0.025, 0.214);
    headGroup.add(catchLight);

    const cheek = new THREE.Mesh(blushGeo, blushMat);
    cheek.scale.set(1.2, 0.65, 0.35);
    cheek.position.set(ex * 1.48, -0.032, 0.184);
    headGroup.add(cheek);
  }

  const hairBack = new THREE.Mesh(
    new THREE.SphereGeometry(0.224, 18, 14, 0, Math.PI * 2, 0, Math.PI * 0.64),
    hairMat
  );
  hairBack.rotation.x = -0.22;
  hairBack.position.set(0, 0.02, -0.02);
  headGroup.add(hairBack);

  if (tokenType === 'car') {
    group.userData.hasSideHairLocks = false;
    const crest = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.09, 0.22), hairMat);
    crest.position.set(0, 0.19, 0.04);
    crest.rotation.x = -0.18;
    headGroup.add(crest);

    const shades = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.065, 0.06), shoeMat);
    shades.position.set(0, 0.03, 0.196);
    headGroup.add(shades);
  } else if (tokenType === 'yacht') {
    group.userData.hasSideHairLocks = true;
    const bobLockGeo = new THREE.CapsuleGeometry(0.052, 0.16, 6, 10);
    for (const side of [-1, 1]) {
      const lock = new THREE.Mesh(bobLockGeo, hairMat);
      lock.position.set(side * 0.195, -0.06, 0.035);
      lock.rotation.z = side * 0.14;
      headGroup.add(lock);
    }

    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.31, 0.31, 0.03, 18), whiteMat);
    brim.position.set(0, 0.16, 0);
    brim.rotation.x = -0.1;
    headGroup.add(brim);

    const hatCrown = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.19, 0.12, 16), suitMat);
    hatCrown.position.set(0, 0.22, -0.01);
    headGroup.add(hatCrown);
  } else if (tokenType === 'jet') {
    group.userData.hasSideHairLocks = false;
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.27, 0.035, 16), suitDarkMat);
    brim.position.set(0, 0.16, 0);
    headGroup.add(brim);

    const topHat = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.16, 0.18, 16), suitMat);
    topHat.position.set(0, 0.25, 0);
    headGroup.add(topHat);

    const hatBand = new THREE.Mesh(new THREE.CylinderGeometry(0.172, 0.172, 0.04, 16), goldMat);
    hatBand.position.set(0, 0.19, 0);
    headGroup.add(hatBand);
  } else {
    group.userData.hasSideHairLocks = true;
    // Flowing shoulder-length royal chestnut curls + golden 5-spire crown with emerald gem
    const royalLockGeo = new THREE.CapsuleGeometry(0.058, 0.22, 8, 10);
    for (const side of [-1, 1]) {
      const lock = new THREE.Mesh(royalLockGeo, hairMat);
      lock.position.set(side * 0.198, -0.095, 0.05);
      lock.rotation.z = side * 0.12;
      lock.rotation.x = 0.1;
      headGroup.add(lock);
    }

    const crownBase = new THREE.Mesh(
      new THREE.CylinderGeometry(0.165, 0.145, 0.105, 14),
      goldMat
    );
    crownBase.position.y = 0.225;
    headGroup.add(crownBase);

    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.046, 0.13, 6), goldMat);
      spike.position.set(Math.cos(a) * 0.12, 0.315, Math.sin(a) * 0.12);
      headGroup.add(spike);
    }
  }

  group.add(headGroup);
  mergeGroupMeshesByMaterial(group);
  return group;
}

const SHARED_SHIELD_GOLD_MAT = markSharedMat(
  new THREE.MeshStandardMaterial({
    color: 0xfacc15,
    roughness: 0.35,
    metalness: 0.55,
  })
);
const SHARED_SHIELD_RUBY_MAT = markSharedMat(
  new THREE.MeshStandardMaterial({
    color: 0xef4444,
    roughness: 0.45,
    metalness: 0.15,
  })
);
const SHARED_SHIELD_WHITE_MAT = markSharedMat(
  new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.5,
    metalness: 0.08,
  })
);

const SHARED_SHIELD_GEOS: {
  gold: THREE.BufferGeometry;
  ruby: THREE.BufferGeometry;
  white: THREE.BufferGeometry;
} = (() => {
  const proto = new THREE.Group();

  const upperGold = new THREE.Mesh(
    new THREE.BoxGeometry(0.42, 0.28, 0.08),
    SHARED_SHIELD_GOLD_MAT
  );
  upperGold.position.y = 0.12;
  proto.add(upperGold);

  const lowerGold = new THREE.Mesh(
    new THREE.ConeGeometry(0.295, 0.28, 4),
    SHARED_SHIELD_GOLD_MAT
  );
  lowerGold.rotation.z = Math.PI;
  lowerGold.rotation.y = Math.PI / 4;
  lowerGold.scale.set(1, 1, 0.28);
  lowerGold.position.y = -0.14;
  proto.add(lowerGold);

  const upperRed = new THREE.Mesh(
    new THREE.BoxGeometry(0.32, 0.21, 0.098),
    SHARED_SHIELD_RUBY_MAT
  );
  upperRed.position.y = 0.12;
  proto.add(upperRed);

  const lowerRed = new THREE.Mesh(
    new THREE.ConeGeometry(0.225, 0.21, 4),
    SHARED_SHIELD_RUBY_MAT
  );
  lowerRed.rotation.z = Math.PI;
  lowerRed.rotation.y = Math.PI / 4;
  lowerRed.scale.set(1, 1, 0.34);
  lowerRed.position.y = -0.11;
  proto.add(lowerRed);

  const vBar = new THREE.Mesh(
    new THREE.BoxGeometry(0.07, 0.2, 0.112),
    SHARED_SHIELD_WHITE_MAT
  );
  vBar.position.y = 0.07;
  proto.add(vBar);

  const hBar = new THREE.Mesh(
    new THREE.BoxGeometry(0.18, 0.07, 0.112),
    SHARED_SHIELD_WHITE_MAT
  );
  hBar.position.y = 0.09;
  proto.add(hBar);

  mergeGroupMeshesByMaterial(proto);

  let goldGeo: THREE.BufferGeometry | null = null;
  let rubyGeo: THREE.BufferGeometry | null = null;
  let whiteGeo: THREE.BufferGeometry | null = null;
  for (const ch of proto.children) {
    if (ch instanceof THREE.Mesh) {
      if (ch.material === SHARED_SHIELD_GOLD_MAT) goldGeo = markSharedGeo(ch.geometry);
      else if (ch.material === SHARED_SHIELD_RUBY_MAT) rubyGeo = markSharedGeo(ch.geometry);
      else if (ch.material === SHARED_SHIELD_WHITE_MAT) whiteGeo = markSharedGeo(ch.geometry);
    }
  }
  return {
    gold: goldGeo!,
    ruby: rubyGeo!,
    white: whiteGeo!,
  };
})();

/**
 * Floating 3D Gold/Red Protection Shield Icon bobbing above Level 4 Luxury Hotels.
 */
function createProtectionShieldModel(): THREE.Group {
  const shield = new THREE.Group();

  const goldBody = new THREE.Mesh(SHARED_SHIELD_GEOS.gold, SHARED_SHIELD_GOLD_MAT);
  goldBody.castShadow = true;
  shield.add(goldBody);

  const rubyFace = new THREE.Mesh(SHARED_SHIELD_GEOS.ruby, SHARED_SHIELD_RUBY_MAT);
  shield.add(rubyFace);

  const whiteCross = new THREE.Mesh(SHARED_SHIELD_GEOS.white, SHARED_SHIELD_WHITE_MAT);
  shield.add(whiteCross);

  return shield;
}

const SHARED_BUILDING_WHITE_TRIM_MAT = markSharedMat(
  new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.5,
    metalness: 0.08,
  })
);
const SHARED_BUILDING_GOLD_MAT = markSharedMat(
  new THREE.MeshStandardMaterial({
    color: 0xfacc15,
    roughness: 0.28,
    metalness: 0.62,
  })
);
const SHARED_STARTER_BASE_GEO = markSharedGeo(new THREE.BoxGeometry(0.46, 0.05, 0.38));
const SHARED_HOUSE_PLINTH_GEO = markSharedGeo(new THREE.BoxGeometry(0.36, 0.045, 0.36));
const SHARED_HOTEL_PLINTH_GEO = markSharedGeo(new THREE.BoxGeometry(1.08, 0.075, 0.56));
const SHARED_LEVEL_BADGE_GEO = markSharedGeo(new THREE.PlaneGeometry(0.46, 0.46));

/**
 * Full-Color Ownership 3D Building Suite placed on the inner half of each PROPERTY tile!
 * When a player buys a tile, tints the ENTIRE 3D building roof + facade + inner foundation pad
 * in the owner's vibrant signature color (#F5B800, #66C61C, #E91E63, #29B6F6).
 */
export function createOwnershipBuildingSuite(
  tileWidth: number,
  tileDepth: number,
  tileSurfaceY: number,
  palette: NightLightingPalette,
  _maxAnisotropy: number,
  architectureStyle: RegionalArchitectureStyle = 'metropolis'
): OwnershipBuildingSuiteRefs {
  const root = new THREE.Group();
  const innerZ = -tileDepth / 2 + 0.46;

  // Glossy tactile Clearcoat/PBR materials tinted dynamically to the owner's color!
  const padMat = new THREE.MeshStandardMaterial({
    color: 0xe2e8f0,
    roughness: 0.55,
    metalness: 0.12,
  });
  const facadeMat = new THREE.MeshPhysicalMaterial({
    color: 0xf5b800,
    roughness: 0.44,
    metalness: 0.12,
    clearcoat: 0.48,
    clearcoatRoughness: 0.22,
  });
  const roofMat = new THREE.MeshPhysicalMaterial({
    color: 0xd97706,
    roughness: 0.42,
    metalness: 0.18,
    clearcoat: 0.52,
    clearcoatRoughness: 0.2,
  });
  const whiteTrimMat = SHARED_BUILDING_WHITE_TRIM_MAT;
  const goldMat = SHARED_BUILDING_GOLD_MAT;

  const padMesh = new THREE.Mesh(
    new THREE.BoxGeometry(tileWidth - 0.18, 0.05, 0.74),
    padMat
  );
  padMesh.position.set(0, tileSurfaceY + 0.025, innerZ);
  padMesh.receiveShadow = true;
  padMesh.castShadow = true;
  padMesh.visible = false;
  root.add(padMesh);

  const buildBaseY = tileSurfaceY + 0.05;

  // Level 0 Starter Pavilion tailored to regional style
  const starterPavilion = new THREE.Group();
  starterPavilion.position.set(0, buildBaseY, innerZ);
  starterPavilion.visible = false;
  {
    const base = new THREE.Mesh(SHARED_STARTER_BASE_GEO, whiteTrimMat);
    base.position.y = 0.025;
    starterPavilion.add(base);

    if (architectureStyle === 'coastal') {
      // Luxury Resort Cabana + Mini Palm Accent
      const deckBody = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.2, 0.3), facadeMat);
      deckBody.position.y = 0.15;
      deckBody.castShadow = true;
      starterPavilion.add(deckBody);

      const canopy = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.3, 0.18, 6), roofMat);
      canopy.position.y = 0.33;
      canopy.castShadow = true;
      starterPavilion.add(canopy);

      const glass = new THREE.Mesh(
        new THREE.BoxGeometry(0.24, 0.09, 0.32),
        palette.houseWindowMat
      );
      glass.position.y = 0.16;
      starterPavilion.add(glass);
    } else if (architectureStyle === 'heritage') {
      // Indochine Heritage Gate Pavilion + Silk Lantern
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.21, 0.28), facadeMat);
      body.position.y = 0.155;
      body.castShadow = true;
      starterPavilion.add(body);

      const eaveSkirt = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.04, 0.38), goldMat);
      eaveSkirt.position.y = 0.27;
      starterPavilion.add(eaveSkirt);

      const roof = new THREE.Mesh(new THREE.ConeGeometry(0.32, 0.2, 4), roofMat);
      roof.rotation.y = Math.PI / 4;
      roof.position.y = 0.38;
      roof.castShadow = true;
      starterPavilion.add(roof);

      const lantern = new THREE.Mesh(
        new THREE.SphereGeometry(0.048, 8, 8),
        palette.lanternSilkMat
      );
      lantern.position.set(0, 0.21, 0.17);
      starterPavilion.add(lantern);
    } else {
      // Modern Boutique Kiosk Tower
      const body = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.25, 0.3), facadeMat);
      body.position.y = 0.175;
      body.castShadow = true;
      starterPavilion.add(body);

      const crown = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.05, 0.34), roofMat);
      crown.position.y = 0.32;
      starterPavilion.add(crown);

      const win = new THREE.Mesh(
        new THREE.BoxGeometry(0.24, 0.11, 0.32),
        palette.houseWindowMat
      );
      win.position.y = 0.18;
      starterPavilion.add(win);
    }
  }
  root.add(starterPavilion);

  // Level 1..3 Regional Stylized Miniature Houses / Villas / Commercial Towers
  const houses: THREE.Group[] = [];
  const houseXs = [-(tileWidth * 0.28), 0, tileWidth * 0.28];
  for (let i = 0; i < 3; i++) {
    const hGroup = new THREE.Group();
    hGroup.position.set(houseXs[i], buildBaseY, innerZ);
    hGroup.visible = false;

    const plinth = new THREE.Mesh(SHARED_HOUSE_PLINTH_GEO, whiteTrimMat);
    plinth.position.y = 0.022;
    hGroup.add(plinth);

    if (architectureStyle === 'heritage') {
      // Two-tier Oriental Curved-Eave Villa + Glowing Lantern
      const walls = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.26, 0.3), facadeMat);
      walls.position.y = 0.175;
      walls.castShadow = true;
      walls.receiveShadow = true;
      hGroup.add(walls);

      const goldEave = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.038, 0.4), goldMat);
      goldEave.position.y = 0.315;
      hGroup.add(goldEave);

      const roof = new THREE.Mesh(new THREE.ConeGeometry(0.31, 0.24, 4), roofMat);
      roof.rotation.y = Math.PI / 4;
      roof.position.y = 0.45;
      roof.castShadow = true;
      hGroup.add(roof);

      const finial = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 8), goldMat);
      finial.position.y = 0.58;
      hGroup.add(finial);

      const winGeo = new THREE.BoxGeometry(0.16, 0.1, 0.33);
      const win = new THREE.Mesh(winGeo, palette.houseWindowMat);
      win.position.y = 0.18;
      hGroup.add(win);
    } else if (architectureStyle === 'coastal') {
      // Stepped Mediterranean Beach Villa with Cantilevered Balcony
      const lower = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.2, 0.33), whiteTrimMat);
      lower.position.y = 0.145;
      lower.castShadow = true;
      hGroup.add(lower);

      const upper = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.19, 0.26), facadeMat);
      upper.position.set(0, 0.33, -0.02);
      upper.castShadow = true;
      hGroup.add(upper);

      const terrace = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.035, 0.12), roofMat);
      terrace.position.set(0, 0.25, 0.14);
      hGroup.add(terrace);

      const sunRoof = new THREE.Mesh(new THREE.BoxGeometry(0.33, 0.045, 0.31), roofMat);
      sunRoof.position.set(0, 0.445, -0.02);
      sunRoof.castShadow = true;
      hGroup.add(sunRoof);

      const win1 = new THREE.Mesh(
        new THREE.BoxGeometry(0.2, 0.08, 0.35),
        palette.houseWindowMat
      );
      win1.position.y = 0.15;
      const win2 = new THREE.Mesh(
        new THREE.BoxGeometry(0.18, 0.08, 0.28),
        palette.houseWindowMat
      );
      win2.position.set(0, 0.34, -0.02);
      hGroup.add(win1, win2);
    } else {
      // Contemporary Glass-Curtain Boutique Tower
      const towerH = 0.36 + (i === 1 ? 0.08 : 0);
      const walls = new THREE.Mesh(new THREE.BoxGeometry(0.3, towerH, 0.31), facadeMat);
      walls.position.y = 0.045 + towerH / 2;
      walls.castShadow = true;
      walls.receiveShadow = true;
      hGroup.add(walls);

      const roofCap = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.045, 0.35), roofMat);
      roofCap.position.y = 0.045 + towerH + 0.022;
      roofCap.castShadow = true;
      hGroup.add(roofCap);

      const spire = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.035, 0.1, 8), goldMat);
      spire.position.y = 0.045 + towerH + 0.09;
      hGroup.add(spire);

      for (const wy of [0.16, 0.3]) {
        const wBand = new THREE.Mesh(
          new THREE.BoxGeometry(0.22, 0.065, 0.33),
          palette.houseWindowMat
        );
        wBand.position.y = wy;
        hGroup.add(wBand);
      }
    }

    root.add(hGroup);
    houses.push(hGroup);
  }

  // Level 4 Full-Color Grand Regional Luxury Hotel!
  const hotel = new THREE.Group();
  hotel.position.set(0, buildBaseY, innerZ);
  hotel.visible = false;
  {
    const plinth = new THREE.Mesh(SHARED_HOTEL_PLINTH_GEO, whiteTrimMat);
    plinth.position.y = 0.037;
    plinth.castShadow = true;
    hotel.add(plinth);

    if (architectureStyle === 'heritage') {
      // Grand Imperial Palace Hotel with Double Tiered Golden-Trimmed Roofs & Silk Lanterns
      const hall = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.44, 0.44), facadeMat);
      hall.position.y = 0.29;
      hall.castShadow = true;
      hall.receiveShadow = true;
      hotel.add(hall);

      for (const wx of [-0.42, 0.42]) {
        const pavilion = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.34, 0.38), facadeMat);
        pavilion.position.set(wx, 0.24, 0);
        pavilion.castShadow = true;
        hotel.add(pavilion);

        const pRoof = new THREE.Mesh(new THREE.ConeGeometry(0.21, 0.18, 4), roofMat);
        pRoof.rotation.y = Math.PI / 4;
        pRoof.position.set(wx, 0.5, 0);
        hotel.add(pRoof);
      }

      const midEave = new THREE.Mesh(new THREE.BoxGeometry(0.82, 0.05, 0.54), goldMat);
      midEave.position.y = 0.53;
      hotel.add(midEave);

      const upperTier = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.24, 0.34), facadeMat);
      upperTier.position.y = 0.67;
      upperTier.castShadow = true;
      hotel.add(upperTier);

      const topEave = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.045, 0.44), goldMat);
      topEave.position.y = 0.8;
      hotel.add(topEave);

      const imperialRoof = new THREE.Mesh(new THREE.ConeGeometry(0.42, 0.26, 4), roofMat);
      imperialRoof.rotation.y = Math.PI / 4;
      imperialRoof.position.y = 0.95;
      imperialRoof.castShadow = true;
      hotel.add(imperialRoof);

      const pearlSpire = new THREE.Mesh(
        new THREE.SphereGeometry(0.06, 10, 10),
        palette.hotelBeaconMat
      );
      pearlSpire.position.y = 1.11;
      hotel.add(pearlSpire);

      for (const wy of [0.22, 0.38, 0.67]) {
        const wSpan = wy > 0.5 ? 0.32 : 0.52;
        const wb = new THREE.Mesh(
          new THREE.BoxGeometry(wSpan, 0.075, wy > 0.5 ? 0.36 : 0.46),
          palette.hotelWindowMat
        );
        wb.position.y = wy;
        hotel.add(wb);
      }

      for (const lx of [-0.32, 0.32]) {
        const lantern = new THREE.Mesh(
          new THREE.SphereGeometry(0.055, 8, 8),
          palette.lanternSilkMat
        );
        lantern.position.set(lx, 0.46, 0.26);
        hotel.add(lantern);
      }
    } else if (architectureStyle === 'coastal') {
      // Twin-Sail Oceanfront Resort Hotel with Sky-Bridge Infinity Pool!
      for (const sx of [-0.26, 0.26]) {
        const sailTower = new THREE.Mesh(
          new THREE.CylinderGeometry(0.15, 0.22, 0.72, 12),
          facadeMat
        );
        sailTower.scale.set(1.05, 1, 0.88);
        sailTower.position.set(sx, 0.43, 0);
        sailTower.castShadow = true;
        sailTower.receiveShadow = true;
        hotel.add(sailTower);

        for (const wy of [0.24, 0.42, 0.6]) {
          const glassRing = new THREE.Mesh(
            new THREE.CylinderGeometry(0.195, 0.205, 0.065, 12),
            palette.hotelWindowMat
          );
          glassRing.scale.set(1.06, 1, 0.9);
          glassRing.position.set(sx, wy, 0);
          hotel.add(glassRing);
        }
      }

      // Sky-Park Infinity Pool Deck Spanning Both Towers (Marina / Phu Quoc Grand style!)
      const skyDeck = new THREE.Mesh(new THREE.BoxGeometry(0.86, 0.07, 0.38), whiteTrimMat);
      skyDeck.position.y = 0.82;
      skyDeck.castShadow = true;
      hotel.add(skyDeck);

      const infinityPool = new THREE.Mesh(
        new THREE.BoxGeometry(0.68, 0.03, 0.24),
        palette.fountainWaterMat
      );
      infinityPool.position.y = 0.865;
      hotel.add(infinityPool);

      const crownBeacon = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.08, 0),
        palette.hotelBeaconMat
      );
      crownBeacon.position.y = 0.98;
      hotel.add(crownBeacon);
    } else {
      // Landmark 81-Inspired Stepped Supertall Metropolis Skyscraper Hotel!
      const centerCore = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.84, 0.38), facadeMat);
      centerCore.position.y = 0.49;
      centerCore.castShadow = true;
      centerCore.receiveShadow = true;
      hotel.add(centerCore);

      const bundleOffsets: Array<[number, number, number]> = [
        [-0.24, 0.56, 0],
        [0.24, 0.62, 0],
        [0, 0.68, -0.14],
        [-0.38, 0.38, 0.04],
        [0.38, 0.42, 0.04],
      ];
      for (const [bx, bh, bz] of bundleOffsets) {
        const col = new THREE.Mesh(new THREE.BoxGeometry(0.18, bh, 0.28), facadeMat);
        col.position.set(bx, 0.075 + bh / 2, bz);
        col.castShadow = true;
        hotel.add(col);

        const cap = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.035, 0.29), roofMat);
        cap.position.set(bx, 0.075 + bh + 0.017, bz);
        hotel.add(cap);
      }

      for (const wy of [0.22, 0.38, 0.54, 0.7, 0.84]) {
        const wSpan = wy > 0.64 ? 0.3 : 0.64;
        const wb = new THREE.Mesh(
          new THREE.BoxGeometry(wSpan, 0.06, 0.4),
          palette.hotelWindowMat
        );
        wb.position.y = wy;
        hotel.add(wb);
      }

      const crownTier = new THREE.Mesh(new THREE.ConeGeometry(0.24, 0.22, 4), roofMat);
      crownTier.rotation.y = Math.PI / 4;
      crownTier.position.y = 1.02;
      crownTier.castShadow = true;
      hotel.add(crownTier);

      const spire = new THREE.Mesh(
        new THREE.CylinderGeometry(0.018, 0.048, 0.26, 8),
        palette.hotelBeaconMat
      );
      spire.position.y = 1.22;
      hotel.add(spire);
    }
  }
  mergeGroupMeshesByMaterial(starterPavilion);
  for (const hGroup of houses) {
    mergeGroupMeshesByMaterial(hGroup);
  }
  mergeGroupMeshesByMaterial(hotel);
  root.add(hotel);

  // Floating 3D Gold/Red Shield Icon above Protected Level 4 Properties
  const shieldGroup = createProtectionShieldModel();
  shieldGroup.position.set(0, buildBaseY + 1.48, innerZ);
  shieldGroup.visible = false;
  root.add(shieldGroup);

  // Clean Square Level Badge ("1", "2", "3", "★") floating above upgraded / hovered owned tiles (lazily allocated when level >= 1)
  const levelBadgeMat = new THREE.MeshBasicMaterial({
    map: null,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const levelBadgeMesh = new THREE.Mesh(SHARED_LEVEL_BADGE_GEO, levelBadgeMat);
  levelBadgeMesh.position.set(tileWidth * 0.29, buildBaseY + 0.82, innerZ + 0.16);
  levelBadgeMesh.visible = false;
  root.add(levelBadgeMesh);

  root.traverse((obj) => {
    if (obj instanceof THREE.Mesh) {
      if (obj.castShadow) obj.userData.canCastShadow = true;
      if (obj.receiveShadow) obj.userData.canReceiveShadow = true;
    }
  });

  const _tmpBase = new THREE.Color();
  const _tmpFacade = new THREE.Color();
  const _tmpRoof = new THREE.Color();
  const _white = new THREE.Color(0xffffff);

  const setOwnerTint = (ownerHex: string) => {
    _tmpBase.set(ownerHex);
    _tmpFacade.copy(_tmpBase).lerp(_white, 0.16);
    _tmpRoof.copy(_tmpBase).multiplyScalar(0.8);

    padMat.color.copy(_tmpBase);
    facadeMat.color.copy(_tmpFacade);
    roofMat.color.copy(_tmpRoof);
  };

  const setQualityOptions = (opts: {
    shadowsEnabled: boolean;
    clearcoatEnabled: boolean;
  }) => {
    const nextFacadeClearcoat = opts.clearcoatEnabled ? 0.48 : 0;
    const nextRoofClearcoat = opts.clearcoatEnabled ? 0.52 : 0;
    if ((facadeMat.clearcoat > 0) !== (nextFacadeClearcoat > 0)) {
      facadeMat.needsUpdate = true;
    }
    if ((roofMat.clearcoat > 0) !== (nextRoofClearcoat > 0)) {
      roofMat.needsUpdate = true;
    }
    facadeMat.clearcoat = nextFacadeClearcoat;
    roofMat.clearcoat = nextRoofClearcoat;

    root.traverse((obj) => {
      if (obj instanceof THREE.Mesh && obj !== levelBadgeMesh) {
        if (obj.userData.canCastShadow) {
          obj.castShadow = opts.shadowsEnabled;
        }
        if (obj.userData.canReceiveShadow) {
          obj.receiveShadow = opts.shadowsEnabled;
        }
      }
    });
  };

  return {
    root,
    padMesh,
    padMat,
    facadeMat,
    roofMat,
    starterPavilion,
    houses,
    hotel,
    shieldGroup,
    levelBadgeMesh,
    levelBadgeMat,
    setOwnerTint,
    setQualityOptions,
  };
}

/**
 * Builds the 4 Distinct 3D Corner Dioramas of Business Tour:
 * - Corner 0 (Bottom): BẮT ĐẦU (START) — 3D celebratory arch/banner with golden star crest.
 * - Corner 8 (Left): ĐẢO HOANG (LOST ISLAND) — 3D tropical island with water rim, palm trees & animated mascot.
 * - Corner 16 (Top): CÚP QUỐC GIA (NATIONAL CHAMPIONSHIPS) — 3D miniature stadium dome & rotating trophy.
 * - Corner 24 (Right): DU LỊCH XUYÊN VIỆT (WORLD TOUR) — 3D terminal control tower & poised 3D airplane.
 */
export function createCornerDiorama(
  tileIndex: number,
  tileSurfaceY: number,
  palette?: NightLightingPalette
): {
  group: THREE.Group;
  anim: CornerDioramaAnimRefs;
} {
  const group = new THREE.Group();
  group.position.y = tileSurfaceY;

  const whiteMat = new THREE.MeshStandardMaterial({
    color: 0xf8fafc,
    roughness: 0.65,
    metalness: 0.08,
  });
  const goldMat = new THREE.MeshStandardMaterial({
    color: 0xfacc15,
    roughness: 0.38,
    metalness: 0.45,
  });
  const redMat = new THREE.MeshStandardMaterial({
    color: 0xef4444,
    roughness: 0.65,
    metalness: 0.1,
  });
  const greenMat = new THREE.MeshStandardMaterial({
    color: 0x22c55e,
    roughness: 0.68,
    metalness: 0.08,
  });
  const cyanMat = new THREE.MeshStandardMaterial({
    color: 0x29b6f6,
    roughness: 0.45,
    metalness: 0.15,
  });
  const slateMat = new THREE.MeshStandardMaterial({
    color: 0x334155,
    roughness: 0.68,
    metalness: 0.12,
  });

  let bobTarget: THREE.Object3D | null = null;
  let spinTarget: THREE.Object3D | null = null;
  let baseBobY = 0;

  if (tileIndex === 0) {
    // CORNER 0: BẮT ĐẦU (START) — 3D Celebratory Arch & Festive Banner
    const archGroup = new THREE.Group();
    archGroup.rotation.y = Math.PI / 4;

    for (const px of [-0.98, 0.98]) {
      const ped = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.14, 0.32), goldMat);
      ped.position.set(px, 0.07, 0);
      ped.castShadow = true;
      archGroup.add(ped);

      const pillar = new THREE.Mesh(
        new THREE.CylinderGeometry(0.11, 0.125, 1.18, 14),
        whiteMat
      );
      pillar.position.set(px, 0.68, 0);
      pillar.castShadow = true;
      archGroup.add(pillar);

      const stripe = new THREE.Mesh(
        new THREE.CylinderGeometry(0.128, 0.128, 0.14, 14),
        redMat
      );
      stripe.position.set(px, 0.95, 0);
      archGroup.add(stripe);
    }

    // Overhead celebratory ribbon beam
    const topBeam = new THREE.Mesh(new THREE.BoxGeometry(2.28, 0.28, 0.26), redMat);
    topBeam.position.set(0, 1.34, 0);
    topBeam.castShadow = true;
    archGroup.add(topBeam);

    const innerBanner = new THREE.Mesh(new THREE.BoxGeometry(2.02, 0.18, 0.3), greenMat);
    innerBanner.position.set(0, 1.34, 0);
    archGroup.add(innerBanner);

    // Festive pennant flags under beam
    for (const fx of [-0.56, -0.28, 0, 0.28, 0.56]) {
      const flag = new THREE.Mesh(
        new THREE.ConeGeometry(0.085, 0.18, 4),
        Math.abs(fx) === 0.28 ? goldMat : whiteMat
      );
      flag.rotation.z = Math.PI;
      flag.position.set(fx, 1.12, 0);
      archGroup.add(flag);
    }

    // Spinning golden star emblem atop the START arch
    const starCrest = new THREE.Mesh(new THREE.OctahedronGeometry(0.22, 0), goldMat);
    starCrest.position.set(0, 1.66, 0);
    starCrest.castShadow = true;
    archGroup.add(starCrest);
    spinTarget = starCrest;

    group.add(archGroup);
  } else if (tileIndex === 8) {
    // CORNER 8: ĐẢO HOANG / LOST ISLAND — Tropical Lagoon Rim, Sandy Mound, Twin Palm Trees & Animated Mascot
    const islandGroup = new THREE.Group();
    islandGroup.scale.setScalar(0.84);
    islandGroup.position.set(-0.26, 0, 0.22);

    const waterRim = new THREE.Mesh(
      new THREE.TorusGeometry(0.96, 0.13, 12, 28),
      new THREE.MeshStandardMaterial({
        color: 0x06b6d4,
        roughness: 0.35,
        metalness: 0.1,
      })
    );
    waterRim.rotation.x = Math.PI / 2;
    waterRim.scale.set(1, 1, 0.42);
    waterRim.position.y = 0.04;
    islandGroup.add(waterRim);

    const sandMat = new THREE.MeshStandardMaterial({
      color: 0xfde047,
      roughness: 0.78,
      metalness: 0.04,
    });
    const sandMound = new THREE.Mesh(
      new THREE.SphereGeometry(0.76, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.5),
      sandMat
    );
    sandMound.scale.set(1, 0.36, 1);
    sandMound.position.y = 0.01;
    sandMound.receiveShadow = true;
    islandGroup.add(sandMound);

    const trunkMat = new THREE.MeshStandardMaterial({
      color: 0x92400e,
      roughness: 0.8,
      metalness: 0.05,
    });
    const frondMat = new THREE.MeshStandardMaterial({
      color: 0x66c61c,
      roughness: 0.66,
      metalness: 0.06,
    });

    const buildPalmTree = (leanX: number, leanZ: number, heightScale: number) => {
      const palm = new THREE.Group();
      for (let s = 0; s < 5; s++) {
        const seg = new THREE.Mesh(
          new THREE.CylinderGeometry(0.068 - s * 0.007, 0.08 - s * 0.007, 0.22, 8),
          trunkMat
        );
        seg.position.set(
          leanX * (s * s) * 0.035,
          0.1 + s * 0.19,
          leanZ * (s * s) * 0.035
        );
        seg.rotation.z = -leanX * s * 0.08;
        seg.rotation.x = leanZ * s * 0.08;
        seg.castShadow = true;
        palm.add(seg);
      }

      const crownTopX = leanX * 16 * 0.035;
      const crownTopY = 0.1 + 4.4 * 0.19;
      const crownTopZ = leanZ * 16 * 0.035;

      for (let f = 0; f < 6; f++) {
        const a = (f / 6) * Math.PI * 2;
        const frondPivot = new THREE.Group();
        frondPivot.position.set(crownTopX, crownTopY, crownTopZ);
        frondPivot.rotation.y = a;

        const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.58, 4), frondMat);
        leaf.rotation.x = Math.PI * 0.42;
        leaf.scale.set(1.1, 1, 0.25);
        leaf.position.set(0, -0.04, 0.26);
        leaf.castShadow = true;
        frondPivot.add(leaf);
        palm.add(frondPivot);
      }
      palm.scale.setScalar(heightScale);
      return palm;
    };

    const palm1 = buildPalmTree(-0.55, -0.35, 1.05);
    palm1.position.set(-0.28, 0.14, -0.22);
    islandGroup.add(palm1);

    const palm2 = buildPalmTree(0.6, -0.25, 0.82);
    palm2.position.set(0.32, 0.12, -0.28);
    islandGroup.add(palm2);

    // Animated Tropical Island Mascot (vibrant toucan/castaway buddy bobbing happily on the beach!)
    const mascot = new THREE.Group();
    baseBobY = 0.26;
    mascot.position.set(0.05, baseBobY, 0.22);
    mascot.rotation.y = Math.PI / 4;

    const body = new THREE.Mesh(
      new THREE.SphereGeometry(0.18, 14, 12),
      new THREE.MeshStandardMaterial({ color: 0xff5722, roughness: 0.62, metalness: 0.08 })
    );
    body.scale.set(0.95, 1.15, 0.95);
    body.castShadow = true;
    mascot.add(body);

    const belly = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 10), whiteMat);
    belly.position.set(0, -0.02, 0.08);
    mascot.add(belly);

    const beak = new THREE.Mesh(new THREE.ConeGeometry(0.075, 0.2, 8), goldMat);
    beak.rotation.x = Math.PI / 2;
    beak.position.set(0, 0.08, 0.22);
    mascot.add(beak);

    const floatRing = new THREE.Mesh(new THREE.TorusGeometry(0.21, 0.055, 10, 18), redMat);
    floatRing.rotation.x = Math.PI / 2;
    floatRing.position.y = -0.08;
    mascot.add(floatRing);

    islandGroup.add(mascot);
    group.add(islandGroup);
    bobTarget = mascot;
  } else if (tileIndex === 16) {
    // CORNER 16: CÚP QUỐC GIA / NATIONAL CHAMPIONSHIPS — 3D Miniature Stadium Dome + Rotating Golden Cup
    const stadium = new THREE.Group();
    stadium.scale.setScalar(0.82);
    stadium.position.set(-0.2, 0, -0.2);

    const outerBowl = new THREE.Mesh(
      new THREE.CylinderGeometry(1.04, 0.86, 0.42, 24, 1, true),
      whiteMat
    );
    outerBowl.position.y = 0.22;
    outerBowl.castShadow = true;
    stadium.add(outerBowl);

    const blueBand = new THREE.Mesh(
      new THREE.CylinderGeometry(1.055, 0.98, 0.12, 24, 1, true),
      cyanMat
    );
    blueBand.position.y = 0.28;
    stadium.add(blueBand);

    // Sculpted Stadium Canopy Roof Ring
    const canopyRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.95, 0.14, 12, 28),
      whiteMat
    );
    canopyRing.rotation.x = Math.PI / 2;
    canopyRing.scale.set(1, 1, 0.48);
    canopyRing.position.y = 0.44;
    canopyRing.castShadow = true;
    stadium.add(canopyRing);

    // Dome Arch Rib Spanning Over the Pitch
    const domeArch = new THREE.Mesh(
      new THREE.TorusGeometry(0.96, 0.06, 10, 24, Math.PI),
      goldMat
    );
    domeArch.rotation.y = Math.PI / 4;
    domeArch.position.y = 0.44;
    domeArch.castShadow = true;
    stadium.add(domeArch);

    // 4 Corner Floodlight Pylons
    for (const [lx, lz] of [
      [-0.72, -0.72],
      [0.72, -0.72],
      [-0.72, 0.72],
      [0.72, 0.72],
    ]) {
      const mast = new THREE.Mesh(
        new THREE.CylinderGeometry(0.028, 0.038, 0.72, 8),
        slateMat
      );
      mast.position.set(lx, 0.42, lz);
      stadium.add(mast);

      const lampPanel = new THREE.Mesh(
        new THREE.BoxGeometry(0.18, 0.11, 0.065),
        palette?.streetLampBulbMat ?? whiteMat
      );
      lampPanel.position.set(lx, 0.8, lz);
      lampPanel.lookAt(0, 0.2, 0);
      stadium.add(lampPanel);
    }

    // Gleaming Rotating Golden Championship Trophy in Center Pitch
    const trophy = new THREE.Group();
    trophy.position.y = 0.06;

    const tBase = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 0.1, 14), slateMat);
    tBase.position.y = 0.05;
    trophy.add(tBase);

    const tStem = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.1, 0.22, 12), goldMat);
    tStem.position.y = 0.2;
    trophy.add(tStem);

    const tGlobe = new THREE.Mesh(new THREE.SphereGeometry(0.17, 16, 12), goldMat);
    tGlobe.position.y = 0.42;
    tGlobe.castShadow = true;
    trophy.add(tGlobe);

    stadium.add(trophy);
    spinTarget = trophy;
    group.add(stadium);
  } else if (tileIndex === 24) {
    // CORNER 24: DU LỊCH XUYÊN VIỆT (WORLD TOUR) — 3D Airport Terminal + Control Tower + Poised 3D Jetliner
    const airport = new THREE.Group();

    // Modern Curved Airport Terminal Building on Rear Edge
    const terminalBody = new THREE.Mesh(
      new THREE.BoxGeometry(1.12, 0.34, 0.46),
      whiteMat
    );
    terminalBody.position.set(-0.28, 0.17, -0.56);
    terminalBody.castShadow = true;
    airport.add(terminalBody);

    const terminalGlass = new THREE.Mesh(
      new THREE.BoxGeometry(1.02, 0.16, 0.48),
      cyanMat
    );
    terminalGlass.position.set(-0.28, 0.2, -0.56);
    airport.add(terminalGlass);

    const terminalRoof = new THREE.Mesh(
      new THREE.CylinderGeometry(0.28, 0.28, 1.18, 14, 1, false, 0, Math.PI),
      cyanMat
    );
    terminalRoof.rotation.z = Math.PI / 2;
    terminalRoof.scale.set(0.55, 1, 1);
    terminalRoof.position.set(-0.28, 0.34, -0.56);
    airport.add(terminalRoof);

    // Control Tower with Spinning Radar
    const towerShaft = new THREE.Mesh(
      new THREE.CylinderGeometry(0.11, 0.14, 0.88, 12),
      whiteMat
    );
    towerShaft.position.set(0.52, 0.44, -0.58);
    towerShaft.castShadow = true;
    airport.add(towerShaft);

    const towerCab = new THREE.Mesh(
      new THREE.CylinderGeometry(0.22, 0.16, 0.18, 12),
      cyanMat
    );
    towerCab.position.set(0.52, 0.92, -0.58);
    airport.add(towerCab);

    const towerCap = new THREE.Mesh(
      new THREE.CylinderGeometry(0.24, 0.24, 0.05, 12),
      whiteMat
    );
    towerCap.position.set(0.52, 1.03, -0.58);
    airport.add(towerCap);

    const radarGroup = new THREE.Group();
    radarGroup.position.set(0.52, 1.12, -0.58);
    const radarBar = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.05, 0.06), goldMat);
    radarGroup.add(radarBar);
    airport.add(radarGroup);
    spinTarget = radarGroup;

    // Stylized 3D Passenger Jetliner Poised on Takeoff Climb!
    const jet = new THREE.Group();
    baseBobY = 0.54;
    jet.position.set(0.0, baseBobY, -0.06);
    jet.rotation.y = Math.PI / 4;
    jet.rotation.x = -0.22; // Climbing pitch!

    const fuselage = new THREE.Mesh(
      new THREE.CylinderGeometry(0.14, 0.12, 1.12, 14),
      whiteMat
    );
    fuselage.rotation.x = Math.PI / 2;
    fuselage.castShadow = true;
    jet.add(fuselage);

    const nose = new THREE.Mesh(new THREE.SphereGeometry(0.14, 14, 10), whiteMat);
    nose.scale.set(1, 0.95, 1.45);
    nose.position.set(0, 0, 0.56);
    jet.add(nose);

    const cockpit = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.08, 0.18), cyanMat);
    cockpit.position.set(0, 0.08, 0.52);
    jet.add(cockpit);

    const mainWings = new THREE.Mesh(new THREE.BoxGeometry(1.28, 0.045, 0.28), cyanMat);
    mainWings.position.set(0, -0.02, 0.06);
    mainWings.castShadow = true;
    jet.add(mainWings);

    const tailFin = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.32, 0.24), redMat);
    tailFin.position.set(0, 0.2, -0.44);
    jet.add(tailFin);

    const tailPlane = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.04, 0.16), cyanMat);
    tailPlane.position.set(0, 0.06, -0.46);
    jet.add(tailPlane);

    airport.add(jet);
    bobTarget = jet;
    group.add(airport);
  }

  if (spinTarget instanceof THREE.Group) {
    mergeGroupMeshesByMaterial(spinTarget);
  }
  if (bobTarget instanceof THREE.Group) {
    mergeGroupMeshesByMaterial(bobTarget);
  }
  const excludedAnimTargets = new Set<THREE.Object3D>();
  if (spinTarget) excludedAnimTargets.add(spinTarget);
  if (bobTarget) excludedAnimTargets.add(bobTarget);
  mergeGroupMeshesByMaterial(group, excludedAnimTargets);

  return {
    group,
    anim: {
      tileIndex,
      bobTarget,
      spinTarget,
      baseBobY,
    },
  };
}

/**
 * Builds the 3D Stack of Question-Mark Cards resting outside the top-left board edge.
 */
function createOuterQuestionCardStack(maxAnisotropy: number): THREE.Group {
  const g = new THREE.Group();

  const cardSideMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.65,
    metalness: 0.06,
  });
  const topTex = createCardDeckTopTexture('CHANCE', maxAnisotropy);
  const topMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: topTex,
    roughness: 0.58,
    metalness: 0.08,
  });

  g.add(createContactShadow(1.35, 0.26));

  // Fan of 4 thick 3D question-mark cards stacked organically (2 groups instead of 6!)
  const cardGeo = createTopCappedBoxGeometry(1.78, 0.12, 1.16);
  const mats = [cardSideMat, topMat];
  for (let i = 0; i < 4; i++) {
    const slice = new THREE.Mesh(cardGeo, mats);
    slice.position.set(
      Math.sin(i * 1.4) * 0.06,
      0.06 + i * 0.125,
      Math.cos(i * 1.7) * 0.05
    );
    slice.rotation.y = (i - 1.5) * 0.065;
    slice.castShadow = true;
    slice.receiveShadow = true;
    g.add(slice);
  }

  return g;
}

export interface CourtyardAnimatedRefs {
  clockBellLeft: THREE.Mesh;
  clockBellRight: THREE.Mesh;
  updateTaxDisplay: (mainText: string, subtitle?: string) => void;
  updateCountdown: (
    secondsLeft: number,
    turnNumber: number,
    activeColorHex: string
  ) => void;
  refreshTextTextures: () => void;
  disposeDynamicTextures: () => void;
}

/**
 * Builds the Business Tour Sunken Center Grass Courtyard (#8CD756 to #A3E66A) inside [-5.68, +5.68]:
 * - Sunken down to y = 0.16 (0.28 units below the #F4F5F7 tile top surfaces at y = 0.44!).
 * - Sleek dark-gray 3D digital timer + active turn counter at the top inner corner (-3.72, 0.16, -3.72).
 * - Large, bold white flat-shaded 3D Tax/Pot text directly in the center of the grass.
 */
export function createCourtyardDiorama(
  palette: NightLightingPalette,
  maxAnisotropy = 4
): {
  group: THREE.Group;
  animated: CourtyardAnimatedRefs;
} {
  const group = new THREE.Group();
  const GRASS_Y = 0.16;

  // 1. Sunken Bright Lime-Green Checker/Lawn Courtyard Surface at y = 0.16
  const lawnGeo = new THREE.BoxGeometry(11.38, 0.32, 11.38);
  const lawn = new THREE.Mesh(lawnGeo, palette.lawnMat);
  lawn.position.y = GRASS_Y - 0.16;
  lawn.receiveShadow = true;
  group.add(lawn);

  // 2. Crisp #E2E8F0 Sunken Retaining Step Walls around [-5.68, +5.68] up to y = 0.42
  const innerStepMat = new THREE.MeshStandardMaterial({
    color: 0xe2e8f0,
    roughness: 0.7,
    metalness: 0.1,
  });
  const stepWallThickness = 0.14;
  const stepWallSpan = 11.36;
  const stepEdge = 5.61;
  for (const [cx, cz, w, d] of [
    [0, -stepEdge, stepWallSpan, stepWallThickness],
    [0, stepEdge, stepWallSpan, stepWallThickness],
    [-stepEdge, 0, stepWallThickness, stepWallSpan - stepWallThickness * 2],
    [stepEdge, 0, stepWallThickness, stepWallSpan - stepWallThickness * 2],
  ] as const) {
    const wall = new THREE.Mesh(
      new THREE.BoxGeometry(w, 0.26, d),
      innerStepMat
    );
    wall.position.set(cx, GRASS_Y + 0.13, cz);
    wall.receiveShadow = true;
    wall.castShadow = true;
    group.add(wall);
  }

  // 3. CENTER GRASS LARGE BOLD FLAT-SHADED WHITE 3D TOURNAMENT STATUS TEXT
  const taxGroup = new THREE.Group();
  taxGroup.position.set(0.12, GRASS_Y + 0.005, 0.12);
  taxGroup.rotation.y = Math.PI / 4; // Aligned horizontally to isometric diamond camera!

  let currentTaxStr = 'VIỆT NAM 3D';
  let currentSubStr = 'CỜ TỶ PHÚ';
  let taxShadowTex = create3DTaxGrassTexture(currentTaxStr, 'shadow', maxAnisotropy, currentSubStr);
  let taxExtrudeTex = create3DTaxGrassTexture(currentTaxStr, 'extrude', maxAnisotropy, currentSubStr);
  let taxCapTex = create3DTaxGrassTexture(currentTaxStr, 'cap', maxAnisotropy, currentSubStr);

  const taxPlaneGeo = new THREE.PlaneGeometry(6.48, 2.43);
  taxPlaneGeo.rotateX(-Math.PI / 2);

  const taxShadowMat = new THREE.MeshBasicMaterial({
    map: taxShadowTex,
    transparent: true,
    opacity: 0.36,
    depthWrite: false,
  });
  const taxShadowMesh = new THREE.Mesh(taxPlaneGeo, taxShadowMat);
  taxShadowMesh.position.set(0.08, 0.005, 0.08);
  taxShadowMesh.renderOrder = 1;
  taxGroup.add(taxShadowMesh);

  const taxExtrudeMat = new THREE.MeshBasicMaterial({
    color: 0xdbe4ef,
    map: taxExtrudeTex,
    transparent: true,
    depthWrite: false,
    toneMapped: false,
  });

  const extrudeSlices = 7;
  for (let s = 0; s < extrudeSlices; s++) {
    const sliceMesh = new THREE.Mesh(taxPlaneGeo, taxExtrudeMat);
    sliceMesh.position.y = 0.014 + s * 0.016;
    sliceMesh.renderOrder = 2 + s;
    taxGroup.add(sliceMesh);
  }

  // Smooth anti-aliased top cap (toneMapped: true prevents over-blooming white text in HDR Night Mode!)
  const taxCapMat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    map: taxCapTex,
    transparent: true,
    depthWrite: false,
    toneMapped: true,
  });
  const taxCapMesh = new THREE.Mesh(taxPlaneGeo, taxCapMat);
  taxCapMesh.position.y = 0.014 + extrudeSlices * 0.016;
  taxCapMesh.renderOrder = 12;
  taxGroup.add(taxCapMesh);

  group.add(taxGroup);

  const updateTaxDisplay = (mainText: string, subtitle = 'CÚP QUỐC GIA') => {
    if (mainText === currentTaxStr && subtitle === currentSubStr) return;
    currentTaxStr = mainText;
    currentSubStr = subtitle;

    const prevShadow = taxShadowTex;
    const prevExtrude = taxExtrudeTex;
    const prevCap = taxCapTex;

    taxShadowTex = create3DTaxGrassTexture(mainText, 'shadow', maxAnisotropy, subtitle);
    taxExtrudeTex = create3DTaxGrassTexture(mainText, 'extrude', maxAnisotropy, subtitle);
    taxCapTex = create3DTaxGrassTexture(mainText, 'cap', maxAnisotropy, subtitle);

    taxShadowMat.map = taxShadowTex;
    taxShadowMat.needsUpdate = true;
    taxExtrudeMat.map = taxExtrudeTex;
    taxExtrudeMat.needsUpdate = true;
    taxCapMat.map = taxCapTex;
    taxCapMat.needsUpdate = true;

    prevShadow.dispose();
    prevExtrude.dispose();
    prevCap.dispose();
  };

  // 4. INLAID LOW-PROFILE 3D DIGITAL TIMER / TURN COUNTER ON THE GRASS COURTYARD
  // Positioned cleanly in the upper-center courtyard so it NEVER occludes tiles behind it.
  const clockBoardGroup = new THREE.Group();
  clockBoardGroup.position.set(-2.55, GRASS_Y, -2.55);
  clockBoardGroup.rotation.y = Math.PI / 4;

  const darkGrayCasingMat = new THREE.MeshStandardMaterial({
    color: 0x1e293b,
    roughness: 0.6,
    metalness: 0.18,
  });
  const darkSlateTrimMat = new THREE.MeshStandardMaterial({
    color: 0x334155,
    roughness: 0.55,
    metalness: 0.22,
  });

  clockBoardGroup.add(createContactShadow(1.65, 0.22));

  const consoleGroup = new THREE.Group();
  consoleGroup.position.set(0, 0.1, 0);
  consoleGroup.rotation.x = 0.1; // Slight upward pitch toward isometric camera without rising above tile surface

  const basePlinth = new THREE.Mesh(
    new THREE.BoxGeometry(3.48, 0.1, 1.68),
    darkSlateTrimMat
  );
  basePlinth.position.set(0, 0, 0);
  basePlinth.castShadow = true;
  basePlinth.receiveShadow = true;
  consoleGroup.add(basePlinth);

  const clockCasing = new THREE.Mesh(
    new THREE.BoxGeometry(3.32, 0.1, 1.54),
    darkGrayCasingMat
  );
  clockCasing.position.set(0, 0.015, 0);
  clockCasing.castShadow = true;
  clockCasing.receiveShadow = true;
  consoleGroup.add(clockCasing);

  // Subtle low-profile status indicator nodes (kept compatible with clockBellLeft / clockBellRight refs)
  const nodeGeo = new THREE.CylinderGeometry(0.06, 0.06, 0.03, 12);
  const clockBellLeft = new THREE.Mesh(nodeGeo, darkSlateTrimMat);
  clockBellLeft.position.set(-1.58, 0.058, -0.66);
  consoleGroup.add(clockBellLeft);

  const clockBellRight = new THREE.Mesh(nodeGeo, darkSlateTrimMat);
  clockBellRight.position.set(1.58, 0.058, -0.66);
  consoleGroup.add(clockBellRight);

  let lastClockSec = 45;
  let lastTurnNum = 1;
  let lastClockHex = '#F5B800';
  const clockScreenTex = createCountdownClockBoardTexture(
    formatCountdownClock(lastClockSec),
    lastTurnNum,
    lastClockSec,
    lastClockHex,
    maxAnisotropy
  );
  const clockCanvas = clockScreenTex.image as HTMLCanvasElement;
  const clockScreenMat = new THREE.MeshBasicMaterial({
    map: clockScreenTex,
  });
  const clockScreenMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(3.14, 1.38),
    clockScreenMat
  );
  clockScreenMesh.position.set(0, 0.068, 0);
  clockScreenMesh.rotation.x = -Math.PI / 2;
  consoleGroup.add(clockScreenMesh);

  clockBoardGroup.add(consoleGroup);
  group.add(clockBoardGroup);

  const updateCountdown = (
    secondsLeft: number,
    turnNumber: number,
    activeColorHex: string
  ) => {
    const clampedSec = Math.max(0, Math.floor(secondsLeft));
    const safeTurn = Math.max(1, Math.floor(turnNumber));
    if (
      clampedSec === lastClockSec &&
      safeTurn === lastTurnNum &&
      activeColorHex === lastClockHex
    ) {
      return;
    }
    lastClockSec = clampedSec;
    lastTurnNum = safeTurn;
    lastClockHex = activeColorHex;

    drawCountdownClockBoardToCanvas(
      clockCanvas,
      formatCountdownClock(clampedSec),
      safeTurn,
      clampedSec,
      activeColorHex
    );
    clockScreenTex.needsUpdate = true;
  };

  const refreshTextTextures = () => {
    const savedTax = currentTaxStr;
    const savedSub = currentSubStr;
    currentTaxStr = '';
    updateTaxDisplay(savedTax, savedSub);

    const savedSec = lastClockSec;
    lastClockSec = -1;
    updateCountdown(savedSec, lastTurnNum, lastClockHex);
  };

  const disposeDynamicTextures = () => {
    taxShadowTex.dispose();
    taxExtrudeTex.dispose();
    taxCapTex.dispose();
    clockScreenTex.dispose();
  };

  return {
    group,
    animated: {
      clockBellLeft,
      clockBellRight,
      updateTaxDisplay,
      updateCountdown,
      refreshTextTextures,
      disposeDynamicTextures,
    },
  };
}

const SHARED_PASTEL_CLOUD_MAT = markSharedMat(
  new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.88,
    metalness: 0.0,
    emissive: 0xffe4ec,
    emissiveIntensity: 0.22,
  })
);

function createSoftPastelCloud(scale = 1): THREE.Group {
  const cloud = new THREE.Group();

  for (const [x, y, z, r] of [
    [0, 0.22, 0, 0.72],
    [-0.58, 0.14, 0.12, 0.52],
    [0.6, 0.16, -0.08, 0.54],
    [0.12, 0.12, 0.44, 0.46],
  ]) {
    const puff = new THREE.Mesh(
      new THREE.SphereGeometry(r, 14, 10),
      SHARED_PASTEL_CLOUD_MAT
    );
    puff.scale.set(1.25, 0.58, 1.06);
    puff.position.set(x, y, z);
    cloud.add(puff);
  }
  mergeGroupMeshesByMaterial(cloud);
  cloud.scale.setScalar(scale);
  return cloud;
}

/**
 * Builds Festive Vietnamese Hoa Đào Thắm (Northern Peach Blossom) & Hoa Mai Vàng (Southern Golden Apricot)
 * Boughs with Suspended Glowing Hoi An Silk Lanterns!
 */
function createVietnameseBlossomAndLanternAccent(
  variant: 'dao_bac' | 'mai_nam',
  palette: NightLightingPalette
): THREE.Group {
  const branch = new THREE.Group();
  const sign = variant === 'mai_nam' ? -1 : 1;

  const barkMat = new THREE.MeshStandardMaterial({
    color: 0x5d4037,
    roughness: 0.8,
    metalness: 0.04,
  });
  const isMai = variant === 'mai_nam';
  const petalPrimaryMat = new THREE.MeshStandardMaterial({
    color: isMai ? 0xfacc15 : 0xff5c8a,
    roughness: 0.55,
    metalness: 0.04,
    emissive: isMai ? 0xfbbf24 : 0xff85a1,
    emissiveIntensity: 0.25,
  });
  const petalSecondaryMat = new THREE.MeshStandardMaterial({
    color: isMai ? 0xfef08a : 0xffb3c6,
    roughness: 0.55,
    metalness: 0.04,
    emissive: isMai ? 0xfde047 : 0xffccd5,
    emissiveIntensity: 0.28,
  });
  const stamenMat = new THREE.MeshStandardMaterial({
    color: isMai ? 0xd97706 : 0xfde047,
    roughness: 0.45,
  });
  const goldTrimMat = new THREE.MeshStandardMaterial({
    color: 0xfacc15,
    roughness: 0.32,
    metalness: 0.55,
  });

  const segments: Array<[number, number, number, number, number, number]> = [
    [0, 0, 0, 1.45, 0.11, 0.35 * sign],
    [sign * 1.05, -0.18, 0.22, 1.35, 0.085, 0.52 * sign],
    [sign * 2.05, -0.44, 0.48, 1.15, 0.062, 0.68 * sign],
    [sign * 1.35, 0.16, -0.25, 0.95, 0.058, 0.22 * sign],
  ];

  for (const [sx, sy, sz, len, rad, rotZ] of segments) {
    const twig = new THREE.Mesh(
      new THREE.CylinderGeometry(rad * 0.75, rad, len, 8),
      barkMat
    );
    twig.position.set(sx, sy, sz);
    twig.rotation.z = -Math.PI / 2 + rotZ * 0.35;
    twig.rotation.y = sign * 0.24;
    branch.add(twig);
  }

  const buildBlossomCluster = (bx: number, by: number, bz: number, sc: number) => {
    const flower = new THREE.Group();
    flower.position.set(bx, by, bz);
    const pMat = (Math.abs(bx * 10) | 0) % 2 === 0 ? petalPrimaryMat : petalSecondaryMat;

    for (let p = 0; p < 5; p++) {
      const a = (p / 5) * Math.PI * 2;
      const petal = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), pMat);
      petal.scale.set(1.05, 0.32, 1.35);
      petal.position.set(Math.cos(a) * 0.17, 0, Math.sin(a) * 0.17);
      petal.rotation.y = -a;
      flower.add(petal);
    }

    const center = new THREE.Mesh(new THREE.SphereGeometry(0.075, 8, 8), stamenMat);
    center.position.y = 0.03;
    flower.add(center);

    flower.scale.setScalar(sc);
    flower.rotation.x = 0.35;
    return flower;
  };

  for (const [fx, fy, fz, fsc] of [
    [sign * 0.65, 0.08, 0.14, 1.15],
    [sign * 1.25, -0.1, 0.32, 1.3],
    [sign * 1.88, -0.34, 0.52, 1.2],
    [sign * 2.45, -0.52, 0.62, 1.05],
    [sign * 1.62, 0.24, -0.22, 1.1],
    [sign * 0.95, -0.28, -0.12, 0.95],
  ]) {
    branch.add(buildBlossomCluster(fx, fy, fz, fsc));
  }

  // Suspended Hoi An Silk Lantern with golden caps & tassel!
  const lanternGroup = new THREE.Group();
  lanternGroup.position.set(sign * 1.55, -0.68, 0.38);

  const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.34, 6), goldTrimMat);
  cord.position.y = 0.28;
  lanternGroup.add(cord);

  const silkBody = new THREE.Mesh(
    new THREE.SphereGeometry(0.24, 14, 12),
    palette.lanternSilkMat
  );
  silkBody.scale.set(0.95, 1.18, 0.95);
  lanternGroup.add(silkBody);

  for (const cy of [-0.26, 0.26]) {
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.05, 10), goldTrimMat);
    cap.position.y = cy;
    lanternGroup.add(cap);
  }

  const tassel = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.22, 6), goldTrimMat);
  tassel.rotation.z = Math.PI;
  tassel.position.y = -0.4;
  lanternGroup.add(tassel);

  branch.add(lanternGroup);
  mergeGroupMeshesByMaterial(branch);
  return branch;
}

/**
 * Business Tour Environment Backdrop & Outer Props:
 * - Soft pastel sky gradient backdrop (pastel blue -> warm peach/pink clouds) with subtle cherry blossom branch accents.
 * - Left & Top outer sides of the board: 3D stacks of green cash bills + 3D stack of '?' question-mark cards.
 * - Bottom-Right outer side of the board: 3D stacks of Gold, Silver, and Bronze coins.
 */
export function createSurroundingVista(
  _woodBumpMap: THREE.Texture,
  palette: NightLightingPalette,
  maxAnisotropy = 4
): {
  vista: THREE.Group;
  animatedCars: BoulevardCarAnim[];
} {
  const vista = new THREE.Group();
  const animatedProps: BoulevardCarAnim[] = [];

  // 1. Pastel Sky Gradient Dome (Pastel Sky Blue -> Warm Peach/Pink Clouds)
  const skyDomeGeo = new THREE.SphereGeometry(110, 40, 28);
  const skyDomeMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    toneMapped: false,
    uniforms: palette.skyDomeUniforms,
    vertexShader: /* glsl */ `
      varying vec3 vWorldDir;
      void main() {
        vec4 worldPos = modelMatrix * vec4(position, 1.0);
        vWorldDir = normalize(worldPos.xyz);
        gl_Position = projectionMatrix * viewMatrix * worldPos;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uNightFactor;
      uniform float uLinearOutput;
      uniform vec3 uDayBlueTop;
      uniform vec3 uDayBlueMid;
      uniform vec3 uDayHorizon;
      uniform vec3 uDayPinkMid;
      uniform vec3 uDayPinkWarm;
      uniform vec3 uNightTop;
      uniform vec3 uNightBottom;
      varying vec3 vWorldDir;

      void main() {
        vec3 d = normalize(vWorldDir);

        // Calibrated to low-FOV isometric view rays (d.y in [-0.78, -0.32])
        float viewVert = smoothstep(-0.78, -0.34, d.y);
        float viewCross = clamp((d.x - d.z) * 0.65 + 0.5, 0.0, 1.0);
        float blendT = clamp(viewVert * 0.68 + (1.0 - viewCross) * 0.32, 0.0, 1.0);

        vec3 pastelSky;
        if (blendT > 0.72) {
          float k = (blendT - 0.72) / 0.28;
          pastelSky = mix(uDayBlueMid, uDayBlueTop, smoothstep(0.0, 1.0, k));
        } else if (blendT > 0.46) {
          float k = (blendT - 0.46) / 0.26;
          pastelSky = mix(uDayHorizon, uDayBlueMid, smoothstep(0.0, 1.0, k));
        } else if (blendT > 0.22) {
          float k = (blendT - 0.22) / 0.24;
          pastelSky = mix(uDayPinkMid, uDayHorizon, smoothstep(0.0, 1.0, k));
        } else {
          float k = blendT / 0.22;
          pastelSky = mix(uDayPinkWarm, uDayPinkMid, smoothstep(0.0, 1.0, k));
        }

        // Dreamy soft peach/white cloud billows
        float cloudWave = sin(d.x * 10.0 + d.z * 8.0) * cos(d.z * 9.0 - d.y * 7.0);
        float wisp = smoothstep(0.22, 0.92, cloudWave) * 0.16;
        pastelSky = mix(pastelSky, vec3(1.0, 0.96, 0.98), wisp);

        vec3 nightSky = mix(uNightBottom, uNightTop, clamp(viewVert, 0.0, 1.0));
        vec3 finalLinear = max(mix(pastelSky, nightSky, clamp(uNightFactor, 0.0, 1.0)), vec3(0.0));

        // Avoid double-gamma encoding when rendering into HalfFloat EffectComposer + OutputPass!
        vec3 finalSrgb = pow(finalLinear, vec3(1.0 / 2.2));
        gl_FragColor = vec4(mix(finalSrgb, finalLinear, uLinearOutput), 1.0);
      }
    `,
  });
  const skyDome = new THREE.Mesh(skyDomeGeo, skyDomeMat);
  skyDome.renderOrder = -10;
  vista.add(skyDome);

  // 2. Clean #DCE2EC Recessed Structural Under-Chassis beneath the #F4F5F7 Board
  const chassisUpperMat = new THREE.MeshStandardMaterial({
    color: 0xdce2ec,
    roughness: 0.7,
    metalness: 0.1,
  });
  const chassisLowerMat = new THREE.MeshStandardMaterial({
    color: 0xbac4d4,
    roughness: 0.7,
    metalness: 0.1,
  });

  const chassisTop = new THREE.Mesh(
    new THREE.BoxGeometry(16.44, 0.24, 16.44),
    chassisUpperMat
  );
  chassisTop.position.y = -0.26;
  chassisTop.receiveShadow = true;
  vista.add(chassisTop);

  const chassisBottom = new THREE.Mesh(
    new THREE.BoxGeometry(15.9, 0.18, 15.9),
    chassisLowerMat
  );
  chassisBottom.position.y = -0.45;
  vista.add(chassisBottom);

  const boardShadow = createContactShadow(10.9, 0.2);
  boardShadow.position.y = -0.55;
  vista.add(boardShadow);

  // 3. 3D Stack of '?' Question-Mark Cards resting outside the South-West outer edge
  // (Per-player dynamic 3D Vault Trays & Bank Reserve are managed live by treasurySystem.ts!)
  const outerChanceStack = createOuterQuestionCardStack(maxAnisotropy);
  outerChanceStack.position.set(-10.95, -0.24, 3.65);
  outerChanceStack.rotation.y = Math.PI / 5;
  vista.add(outerChanceStack);
  animatedProps.push({
    group: outerChanceStack,
    baseY: -0.24,
    phase: 1.9,
  });

  // 5. FESTIVE VIETNAMESE HOA ĐÀO THẮM & HOA MAI VÀNG + HOI AN SILK LANTERNS + PERIMETER LAMPS
  const daoLeft = createVietnameseBlossomAndLanternAccent('dao_bac', palette);
  daoLeft.position.set(-14.6, 1.15, -4.2);
  daoLeft.rotation.y = 0.55;
  vista.add(daoLeft);
  animatedProps.push({ group: daoLeft, baseY: 1.15, phase: 0.3 });

  const maiTopRight = createVietnameseBlossomAndLanternAccent('mai_nam', palette);
  maiTopRight.position.set(5.4, 1.28, -14.6);
  maiTopRight.rotation.y = -0.52;
  vista.add(maiTopRight);
  animatedProps.push({ group: maiTopRight, baseY: 1.28, phase: 1.6 });

  // 5b. Ornate Perimeter Boulevard Lantern Posts Illuminating the 4 Outer Board Corners at Night!
  const lampPostMat = new THREE.MeshStandardMaterial({
    color: 0x334155,
    roughness: 0.45,
    metalness: 0.55,
  });
  const lampGoldMat = new THREE.MeshStandardMaterial({
    color: 0xfacc15,
    roughness: 0.3,
    metalness: 0.65,
  });
  const haloPlaneGeo = new THREE.PlaneGeometry(1.9, 1.9);
  haloPlaneGeo.rotateX(-Math.PI / 2);

  const perimeterLampsGroup = new THREE.Group();
  for (const [lx, lz] of [
    [-8.65, 8.65],
    [8.65, -8.65],
    [-8.65, -8.65],
    [8.65, 8.65],
  ]) {
    const postGroup = new THREE.Group();
    postGroup.position.set(lx, -0.14, lz);

    const plinth = new THREE.Mesh(
      new THREE.CylinderGeometry(0.14, 0.18, 0.14, 10),
      lampGoldMat
    );
    plinth.position.y = 0.07;
    postGroup.add(plinth);

    const pole = new THREE.Mesh(
      new THREE.CylinderGeometry(0.042, 0.058, 1.18, 8),
      lampPostMat
    );
    pole.position.y = 0.68;
    pole.castShadow = true;
    postGroup.add(pole);

    const globe = new THREE.Mesh(
      new THREE.SphereGeometry(0.15, 12, 10),
      palette.streetLampBulbMat
    );
    globe.position.y = 1.34;
    postGroup.add(globe);

    const finialCap = new THREE.Mesh(
      new THREE.ConeGeometry(0.16, 0.12, 8),
      lampGoldMat
    );
    finialCap.position.y = 1.49;
    postGroup.add(finialCap);

    const groundHalo = new THREE.Mesh(haloPlaneGeo, palette.streetLampHaloMat);
    groundHalo.position.y = 0.03;
    postGroup.add(groundHalo);

    perimeterLampsGroup.add(postGroup);
  }
  mergeGroupMeshesByMaterial(perimeterLampsGroup);
  vista.add(perimeterLampsGroup);

  const cloudSpots: Array<[number, number, number, number, number]> = [
    [-13.8, -1.1, -9.8, 1.35, 0.4],
    [9.4, -1.25, -13.6, 1.4, -0.3],
    [14.2, -1.15, 6.4, 1.28, 0.8],
    [-6.6, -1.35, 13.6, 1.25, -0.6],
  ];
  cloudSpots.forEach(([cx, cy, cz, sc, ry], idx) => {
    const cloud = createSoftPastelCloud(sc);
    cloud.position.set(cx, cy, cz);
    cloud.rotation.y = ry;
    vista.add(cloud);
    animatedProps.push({
      group: cloud,
      baseY: cy,
      phase: idx * 1.15 + 0.5,
    });
  });

  // 6. Starry Night Sky Points
  const starCount = 200;
  const starPositions = new Float32Array(starCount * 3);
  for (let i = 0; i < starCount; i++) {
    const theta = (i * 2.399963) % (Math.PI * 2);
    const elevation = -0.35 + ((i * 0.618034) % 1.15);
    const radius = 76 + (i % 7) * 2.5;
    const horiz = Math.cos(elevation * (Math.PI / 2)) * radius;
    starPositions[i * 3] = Math.cos(theta) * horiz;
    starPositions[i * 3 + 1] = Math.sin(elevation * (Math.PI / 2)) * 48;
    starPositions[i * 3 + 2] = Math.sin(theta) * horiz;
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
  const stars = new THREE.Points(starGeo, palette.starMat);
  vista.add(stars);

  return { vista, animatedCars: animatedProps };
}
