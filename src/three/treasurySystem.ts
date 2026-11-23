import * as THREE from 'three';
import {
  CashFlowTransferEvent,
  decomposeCashToVisualUnits,
  getVaultWorldAnchor,
  METALLIC_COLORS,
  POLYMER_COLORS,
  VaultMeshCategory,
} from '../game/currencyLogic';
import { GraphicsQualityProfile } from '../game/graphicsQuality';
import { getTileTransform } from '../game/rules';
import { CurrencyStyleId, PlayerState } from '../game/types';
import { mergeGroupMeshesByMaterial } from './models';
import { computePhysicalTrayBounceY } from './physicsEngine';

export interface TreasurySystemController {
  group: THREE.Group;
  syncVaults: (
    players: PlayerState[],
    style: CurrencyStyleId,
    activePlayerIndex?: number
  ) => void;
  enqueueTransfers: (
    events: CashFlowTransferEvent[],
    players: PlayerState[],
    style: CurrencyStyleId
  ) => void;
  update: (dt: number, elapsed: number) => void;
  hasActiveAnimations: () => boolean;
  getShaderTime: () => number;
  setQualityProfile: (
    profile: Pick<GraphicsQualityProfile, 'shadowsEnabled' | 'usePhysicalClearcoat'>
  ) => void;
  dispose: () => void;
}

interface StaticPoolInstance {
  matrix: THREE.Matrix4;
  color: THREE.Color;
  flutterPhase: number;
}

interface FlyingCurrencyParticle {
  category: VaultMeshCategory;
  color: THREE.Color;
  p0: THREE.Vector3;
  p1: THREE.Vector3;
  p2: THREE.Vector3;
  delay: number;
  elapsed: number;
  duration: number;
  spinSpeedX: number;
  spinSpeedY: number;
  spinSpeedZ: number;
  restYaw: number;
  restitution: number;
  flutterPhase: number;
  targetTraySlot: number | null;
  impactTriggered: boolean;
}

interface VaultTrayVisualRefs {
  slotIndex: number;
  root: THREE.Group;
  baseY: number;
  accentBarMat: THREE.MeshStandardMaterial;
  feltMat: THREE.MeshStandardMaterial;
  recoilOffset: number;
  recoilVelocity: number;
}

const MAX_INSTANCES_PER_POOL = 320;
const MAX_ACTIVE_FLIGHTS = 64;
const BANK_RESERVE_CASH = 3_800_000;
const BANK_VAULT_SCALE = 0.76;
const PLAYER_VAULT_SCALE = 1.08;

function createNeutralPolymerBillTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const w = 256;
  const h = 144;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;

  // High-luminance neutral base so instanceColor tints vivid Vietnamese Polymer denominations
  const bg = ctx.createLinearGradient(0, 0, w, h);
  bg.addColorStop(0, '#FFFFFF');
  bg.addColorStop(0.5, '#F1F5F9');
  bg.addColorStop(1, '#E2E8F0');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);

  // Guilloche security frame
  ctx.strokeStyle = 'rgba(71, 85, 105, 0.42)';
  ctx.lineWidth = 4;
  ctx.strokeRect(10, 10, w - 20, h - 20);

  ctx.strokeStyle = 'rgba(100, 116, 139, 0.28)';
  ctx.lineWidth = 2;
  ctx.strokeRect(18, 18, w - 36, h - 36);

  // Polymer transparent security window oval on right side
  ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
  ctx.beginPath();
  ctx.ellipse(w - 44, h / 2, 16, 28, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.55)';
  ctx.lineWidth = 1.8;
  ctx.stroke();

  // Lotus rosette medallion on left side
  ctx.strokeStyle = 'rgba(71, 85, 105, 0.35)';
  ctx.lineWidth = 2;
  for (let r = 12; r <= 28; r += 8) {
    ctx.beginPath();
    ctx.arc(58, h / 2, r, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Subtle stacked-sheet horizontal micro-striations along sides
  ctx.fillStyle = 'rgba(100, 116, 139, 0.16)';
  for (let y = 24; y < h - 24; y += 8) {
    ctx.fillRect(26, y, w - 92, 1.5);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

function createEmbossedCoinTextures(maxAnisotropy: number): {
  map: THREE.CanvasTexture;
  bumpMap: THREE.CanvasTexture;
} {
  const size = 192;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  const bumpCanvas = document.createElement('canvas');
  bumpCanvas.width = size;
  bumpCanvas.height = size;
  const bctx = bumpCanvas.getContext('2d')!;

  const cx = size / 2;
  const cy = size / 2;

  const rad = ctx.createRadialGradient(cx - 24, cy - 24, 8, cx, cy, size * 0.5);
  rad.addColorStop(0, '#FFFFFF');
  rad.addColorStop(0.68, '#F1F5F9');
  rad.addColorStop(1, '#CBD5E1');
  ctx.fillStyle = rad;
  ctx.fillRect(0, 0, size, size);

  bctx.fillStyle = '#808080';
  bctx.fillRect(0, 0, size, size);

  // Milled coin rim + recessed inner field
  ctx.strokeStyle = 'rgba(71, 85, 105, 0.42)';
  ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.arc(cx, cy, size * 0.41, 0, Math.PI * 2);
  ctx.stroke();

  bctx.strokeStyle = '#E5E5E5';
  bctx.lineWidth = 9;
  bctx.beginPath();
  bctx.arc(cx, cy, size * 0.42, 0, Math.PI * 2);
  bctx.stroke();

  // Embossed 5-pointed star / Đông Sơn sun emblem in center
  const drawStar = (targetCtx: CanvasRenderingContext2D, fill: string, rOuter: number, rInner: number) => {
    targetCtx.save();
    targetCtx.fillStyle = fill;
    targetCtx.beginPath();
    for (let i = 0; i < 10; i++) {
      const r = i % 2 === 0 ? rOuter : rInner;
      const a = (i * Math.PI) / 5 - Math.PI / 2;
      const px = cx + Math.cos(a) * r;
      const py = cy + Math.sin(a) * r;
      if (i === 0) targetCtx.moveTo(px, py);
      else targetCtx.lineTo(px, py);
    }
    targetCtx.closePath();
    targetCtx.fill();
    targetCtx.restore();
  };

  drawStar(ctx, '#FFFFFF', 34, 15);
  drawStar(bctx, '#F0F0F0', 35, 16);

  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = maxAnisotropy;

  const bumpMap = new THREE.CanvasTexture(bumpCanvas);
  bumpMap.anisotropy = maxAnisotropy;

  return { map, bumpMap };
}

function createBullionHallmarkBumpTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const w = 256;
  const h = 128;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#909090';
  ctx.fillRect(0, 0, w, h);

  // Recessed ingot border & 999.9 stamp
  ctx.strokeStyle = '#D8D8D8';
  ctx.lineWidth = 6;
  ctx.strokeRect(18, 18, w - 36, h - 36);

  ctx.fillStyle = '#505050';
  ctx.fillRect(42, 34, w - 84, h - 68);

  ctx.fillStyle = '#DCDCDC';
  ctx.font = 'bold 28px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('999.9', w / 2, h / 2);

  const tex = new THREE.CanvasTexture(canvas);
  tex.anisotropy = maxAnisotropy;
  return tex;
}

function createCasinoChipTexture(maxAnisotropy: number): THREE.CanvasTexture {
  const size = 192;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const cx = size / 2;
  const cy = size / 2;

  ctx.fillStyle = '#F8FAFC';
  ctx.fillRect(0, 0, size, size);

  // Colored outer body (multiplied by instanceColor)
  ctx.fillStyle = '#E2E8F0';
  ctx.beginPath();
  ctx.arc(cx, cy, size * 0.48, 0, Math.PI * 2);
  ctx.fill();

  // 6 crisp white casino edge-spot stripes
  ctx.strokeStyle = '#FFFFFF';
  ctx.lineWidth = 16;
  for (let i = 0; i < 6; i++) {
    const a = (i * Math.PI) / 3;
    ctx.beginPath();
    ctx.arc(cx, cy, size * 0.42, a - 0.14, a + 0.14);
    ctx.stroke();
  }

  // Inner pearl medallion ring
  ctx.fillStyle = '#FFFFFF';
  ctx.beginPath();
  ctx.arc(cx, cy, size * 0.24, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = 'rgba(51, 65, 85, 0.45)';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(cx, cy, size * 0.3, 0, Math.PI * 2);
  ctx.stroke();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

function createVaultContactShadowTexture(): THREE.CanvasTexture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(size / 2, size / 2, 10, size / 2, size / 2, size / 2);
  grad.addColorStop(0, 'rgba(15, 23, 42, 0.38)');
  grad.addColorStop(0.65, 'rgba(15, 23, 42, 0.16)');
  grad.addColorStop(1, 'rgba(15, 23, 42, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(canvas);
}

function buildVaultTrayMesh(
  slotIndex: number,
  shadowTex: THREE.Texture,
  trayBaseMat: THREE.Material,
  goldRimMat: THREE.Material,
  isBank: boolean
): VaultTrayVisualRefs {
  const anchor = getVaultWorldAnchor(slotIndex);
  const root = new THREE.Group();
  root.position.set(anchor.x, anchor.y, anchor.z);
  root.rotation.y = anchor.rotY;
  root.scale.setScalar(isBank ? BANK_VAULT_SCALE : PLAYER_VAULT_SCALE);

  // Soft grounded contact shadow
  const shadowPlane = new THREE.Mesh(
    new THREE.PlaneGeometry(2.55, 1.55),
    new THREE.MeshBasicMaterial({
      map: shadowTex,
      transparent: true,
      depthWrite: false,
    })
  );
  shadowPlane.rotation.x = -Math.PI / 2;
  shadowPlane.position.y = 0.005;
  root.add(shadowPlane);

  // Dark slate luxury tray plinth
  const trayW = 2.02;
  const trayD = 1.08;
  const baseBox = new THREE.Mesh(new THREE.BoxGeometry(trayW, 0.09, trayD), trayBaseMat);
  baseBox.position.y = 0.045;
  baseBox.castShadow = true;
  baseBox.receiveShadow = true;
  root.add(baseBox);

  // Velvet recessed inner liner (royal teal-indigo for active players, emerald for Bank)
  const feltMat = new THREE.MeshStandardMaterial({
    color: isBank ? 0x065f46 : 0x17324d,
    roughness: 0.78,
    metalness: 0.06,
  });
  const feltBed = new THREE.Mesh(
    new THREE.BoxGeometry(trayW - 0.16, 0.02, trayD - 0.16),
    feltMat
  );
  feltBed.position.y = 0.092;
  feltBed.receiveShadow = true;
  root.add(feltBed);

  // 4 Brushed-Gold beveled retaining walls around the tray perimeter
  const rimThick = 0.075;
  const rimH = 0.125;
  const wallSpecs: Array<[number, number, number, number]> = [
    [0, -trayD / 2 + rimThick / 2, trayW, rimThick],
    [0, trayD / 2 - rimThick / 2, trayW, rimThick],
    [-trayW / 2 + rimThick / 2, 0, rimThick, trayD - rimThick * 2],
    [trayW / 2 - rimThick / 2, 0, rimThick, trayD - rimThick * 2],
  ];
  for (const [wx, wz, ww, wd] of wallSpecs) {
    const rim = new THREE.Mesh(new THREE.BoxGeometry(ww, rimH, wd), goldRimMat);
    rim.position.set(wx, rimH / 2 + 0.02, wz);
    rim.castShadow = true;
    rim.receiveShadow = true;
    root.add(rim);
  }

  // Player-colored glowing front status bar (gold-emerald for Central Bank)
  const accentBarMat = new THREE.MeshStandardMaterial({
    color: isBank ? 0xfacc15 : 0x38bdf8,
    emissive: isBank ? 0xf59e0b : 0x0284c7,
    emissiveIntensity: 0.35,
    roughness: 0.3,
    metalness: 0.4,
  });
  const accentBar = new THREE.Mesh(
    new THREE.BoxGeometry(trayW * 0.68, 0.055, 0.05),
    accentBarMat
  );
  accentBar.position.set(0, 0.085, trayD / 2 + 0.018);
  root.add(accentBar);

  mergeGroupMeshesByMaterial(root);

  root.traverse((obj) => {
    if (obj instanceof THREE.Mesh) {
      if (obj.castShadow) obj.userData.canCastShadow = true;
      if (obj.receiveShadow) obj.userData.canReceiveShadow = true;
    }
  });

  return {
    slotIndex,
    root,
    baseY: anchor.y,
    accentBarMat,
    feltMat,
    recoilOffset: 0,
    recoilVelocity: 0,
  };
}

function chooseTransferPalette(
  amount: number,
  style: CurrencyStyleId,
  index: number
): { category: VaultMeshCategory; hex: string; restitution: number } {
  if (style === 'cash') {
    const hex =
      amount >= 500_000
        ? POLYMER_COLORS.BILL_500K
        : amount >= 200_000
          ? POLYMER_COLORS.BILL_200K
          : amount >= 100_000
            ? POLYMER_COLORS.BILL_100K
            : amount >= 50_000
              ? POLYMER_COLORS.BILL_50K
              : POLYMER_COLORS.BILL_20K;
    return { category: 'bill', hex, restitution: 0.18 };
  }
  if (style === 'coins') {
    const hex =
      index % 3 === 0
        ? METALLIC_COLORS.COIN_GOLD
        : index % 3 === 1
          ? METALLIC_COLORS.COIN_SILVER
          : METALLIC_COLORS.COIN_BRONZE;
    return { category: 'coin', hex, restitution: 0.45 };
  }
  if (style === 'bullion') {
    if (amount >= 200_000 && index % 2 === 0) {
      return {
        category: 'bullion',
        hex: METALLIC_COLORS.BULLION_GOLD,
        restitution: 0.28,
      };
    }
    const chipHex =
      amount >= 150_000
        ? METALLIC_COLORS.CHIP_100K
        : index % 2 === 0
          ? METALLIC_COLORS.CHIP_50K
          : METALLIC_COLORS.CHIP_10K;
    return { category: 'chip', hex: chipHex, restitution: 0.38 };
  }

  // 'mixed': interleave crisp Polymer bills and gleaming metallic coins
  if (index % 2 === 0) {
    const billHex =
      amount >= 400_000
        ? POLYMER_COLORS.BILL_500K
        : amount >= 180_000
          ? POLYMER_COLORS.BILL_200K
          : POLYMER_COLORS.BILL_100K;
    return { category: 'bill', hex: billHex, restitution: 0.18 };
  }
  return {
    category: 'coin',
    hex: index % 4 === 1 ? METALLIC_COLORS.COIN_GOLD : METALLIC_COLORS.COIN_SILVER,
    restitution: 0.44,
  };
}

/**
 * Builds the GPU-instanced 3D Treasury Vault & Live Cash-Flow System:
 * - 4 Personal Player Vault Trays outside the 4 board edges + 1 Central Bank Vault.
 * - 4 Batched `InstancedMesh` layers (`bill`, `coin`, `bullion`, `chip`) with Custom GLSL
 *   Vertex Flutter on Polymer Banknotes and Specular Metallic Glint Sweep on 999.9 Gold Bullion.
 */
export function createTreasurySystem(
  maxAnisotropy = 4,
  isSoftwareGl = false
): TreasurySystemController {
  const group = new THREE.Group();

  const uTimeShared = { value: 0 };

  // Shared tray materials & textures
  const shadowTex = createVaultContactShadowTexture();
  const trayBaseMat = new THREE.MeshStandardMaterial({
    color: 0x1e293b,
    roughness: 0.48,
    metalness: 0.32,
  });
  const goldRimMat = new THREE.MeshStandardMaterial({
    color: 0xfbbf24,
    roughness: 0.26,
    metalness: 0.62,
  });

  const playerTrays: VaultTrayVisualRefs[] = [0, 1, 2, 3].map((slot) =>
    buildVaultTrayMesh(slot, shadowTex, trayBaseMat, goldRimMat, false)
  );
  const bankTray = buildVaultTrayMesh(-1, shadowTex, trayBaseMat, goldRimMat, true);

  for (const t of playerTrays) group.add(t.root);
  group.add(bankTray.root);

  // 1. Polymer Banknote InstancedMesh + Custom GLSL Vertex Flutter & Crisp Bank Strap Shader
  const billTex = createNeutralPolymerBillTexture(maxAnisotropy);
  const billGeo = new THREE.BoxGeometry(0.54, 0.116, 0.3, 8, 1, 2);
  const billFlutterArray = new Float32Array(MAX_INSTANCES_PER_POOL * 2);
  const billFlutterAttr = new THREE.InstancedBufferAttribute(billFlutterArray, 2);
  billFlutterAttr.setUsage(THREE.DynamicDrawUsage);
  billGeo.setAttribute('aFlutter', billFlutterAttr);

  const billMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: billTex,
    roughness: 0.56,
    metalness: 0.06,
  });
  if (!isSoftwareGl) {
    billMat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = uTimeShared;
      shader.vertexShader =
        `uniform float uTime;\nattribute vec2 aFlutter;\nvarying float vFlutterAmp;\nvarying float vLocalX;\n` +
        shader.vertexShader.replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
          vFlutterAmp = aFlutter.x;
          vLocalX = position.x;
          if (aFlutter.x > 0.001) {
            float wave = sin(uTime * 19.0 + aFlutter.y + position.x * 11.0) * 0.048 * aFlutter.x;
            float twist = cos(uTime * 13.5 + aFlutter.y * 1.3) * position.z * 0.14 * aFlutter.x;
            transformed.y += wave + twist;
          }`
        );
      shader.fragmentShader =
        `varying float vFlutterAmp;\nvarying float vLocalX;\n` +
        shader.fragmentShader.replace(
          '#include <color_fragment>',
          `#include <color_fragment>
          if (vFlutterAmp < 0.25) {
            float absX = abs(vLocalX);
            if (absX < 0.052) {
              vec3 strapCol = absX < 0.013 ? vec3(0.98, 0.78, 0.08) : vec3(0.97, 0.98, 0.99);
              diffuseColor.rgb = mix(diffuseColor.rgb, strapCol, 0.94);
            }
          }`
        );
    };
    billMat.customProgramCacheKey = () => 'polymer-bill-flutter-v1';
  }

  // 2. Metallic Embossed Coin InstancedMesh
  const { map: coinMap, bumpMap: coinBump } = createEmbossedCoinTextures(maxAnisotropy);
  const coinGeo = new THREE.CylinderGeometry(0.165, 0.165, 0.076, 20);
  const coinMat = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    map: coinMap,
    bumpMap: coinBump,
    bumpScale: 0.016,
    roughness: 0.26,
    metalness: 0.64,
    clearcoat: 0.55,
    clearcoatRoughness: 0.18,
  });

  // 3. 999.9 Gold Bullion Bar InstancedMesh + Custom GLSL Specular Glint Sweep Shader
  const bullionBump = createBullionHallmarkBumpTexture(maxAnisotropy);
  const bullionGeo = new THREE.CylinderGeometry(0.158, 0.208, 0.136, 4);
  bullionGeo.rotateY(Math.PI / 4);
  bullionGeo.scale(1.68, 1.0, 0.9);
  const bullionMat = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    bumpMap: bullionBump,
    bumpScale: 0.018,
    roughness: 0.2,
    metalness: 0.68,
    clearcoat: 0.78,
    clearcoatRoughness: 0.12,
  });
  if (!isSoftwareGl) {
    bullionMat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = uTimeShared;
      shader.vertexShader =
        `varying vec3 vWorldPosGlint;\n` +
        shader.vertexShader.replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
          vec4 wpGlint = vec4(transformed, 1.0);
          #ifdef USE_INSTANCING
            wpGlint = instanceMatrix * wpGlint;
          #endif
          wpGlint = modelMatrix * wpGlint;
          vWorldPosGlint = wpGlint.xyz;`
        );
      shader.fragmentShader =
        `uniform float uTime;\nvarying vec3 vWorldPosGlint;\n` +
        shader.fragmentShader.replace(
          '#include <emissivemap_fragment>',
          `#include <emissivemap_fragment>
          float glintWave = sin((vWorldPosGlint.x + vWorldPosGlint.z * 0.85 + vWorldPosGlint.y * 1.4) * 3.4 - uTime * 2.6);
          float glintMask = pow(max(0.0, glintWave), 14.0);
          totalEmissiveRadiance += vec3(1.0, 0.86, 0.38) * glintMask * 0.52;`
        );
    };
    bullionMat.customProgramCacheKey = () => 'bullion-specular-glint-v1';
  }

  // 4. Striped Luxury Casino Chip InstancedMesh
  const chipTex = createCasinoChipTexture(maxAnisotropy);
  const chipGeo = new THREE.CylinderGeometry(0.165, 0.165, 0.068, 20);
  const chipMat = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    map: chipTex,
    roughness: 0.3,
    metalness: 0.18,
    clearcoat: 0.65,
    clearcoatRoughness: 0.15,
  });

  const makePoolMesh = (
    geo: THREE.BufferGeometry,
    mat: THREE.Material
  ): THREE.InstancedMesh => {
    const im = new THREE.InstancedMesh(geo, mat, MAX_INSTANCES_PER_POOL);
    im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    // Pre-initialize instanceColor before renderer.compile() so USE_INSTANCING_COLOR is active from frame 0!
    const initCol = new THREE.Color(0xffffff);
    for (let i = 0; i < MAX_INSTANCES_PER_POOL; i++) {
      im.setColorAt(i, initCol);
    }
    if (im.instanceColor) {
      im.instanceColor.setUsage(THREE.DynamicDrawUsage);
    }
    im.count = 0;
    im.castShadow = !isSoftwareGl;
    im.receiveShadow = !isSoftwareGl;
    im.frustumCulled = false;
    group.add(im);
    return im;
  };

  const pools: Record<VaultMeshCategory, THREE.InstancedMesh> = {
    bill: makePoolMesh(billGeo, billMat),
    coin: makePoolMesh(coinGeo, coinMat),
    bullion: makePoolMesh(bullionGeo, bullionMat),
    chip: makePoolMesh(chipGeo, chipMat),
  };

  const staticUnits: Record<VaultMeshCategory, StaticPoolInstance[]> = {
    bill: [],
    coin: [],
    bullion: [],
    chip: [],
  };

  const activeFlights: FlyingCurrencyParticle[] = [];
  let lastVaultSignature = '';
  let staticDirty = true;

  // Scratch math objects for zero-GC per-frame updates
  const _trayMat = new THREE.Matrix4();
  const _unitLocalMat = new THREE.Matrix4();
  const _pos = new THREE.Vector3();
  const _quat = new THREE.Quaternion();
  const _euler = new THREE.Euler();
  const _scale = new THREE.Vector3(1, 1, 1);
  const _flightMat = new THREE.Matrix4();
  const _bezierA = new THREE.Vector3();
  const _bezierB = new THREE.Vector3();

  const rebuildStaticVaultUnits = (
    players: PlayerState[],
    style: CurrencyStyleId,
    activePlayerIndex = 0
  ) => {
    staticUnits.bill.length = 0;
    staticUnits.coin.length = 0;
    staticUnits.bullion.length = 0;
    staticUnits.chip.length = 0;

    const appendTrayUnits = (
      slotIdx: number,
      cashAmount: number,
      trayScale: number,
      recoilY: number
    ) => {
      const anchor = getVaultWorldAnchor(slotIdx);
      _euler.set(0, anchor.rotY, 0);
      _quat.setFromEuler(_euler);
      _pos.set(anchor.x, anchor.y + recoilY, anchor.z);
      _scale.setScalar(trayScale);
      _trayMat.compose(_pos, _quat, _scale);

      const decomposed = decomposeCashToVisualUnits(cashAmount, style);
      decomposed.forEach((u, idx) => {
        _euler.set(0, u.rotY, 0);
        _quat.setFromEuler(_euler);
        _pos.set(u.localX, u.localY, u.localZ);
        _scale.set(1, 1, 1);
        _unitLocalMat.compose(_pos, _quat, _scale);

        const worldMat = new THREE.Matrix4().multiplyMatrices(_trayMat, _unitLocalMat);
        staticUnits[u.meshCategory].push({
          matrix: worldMat,
          color: new THREE.Color(u.colorHex),
          flutterPhase: (idx * 0.77 + (slotIdx + 2) * 1.3) % (Math.PI * 2),
        });
      });
    };

    // 4 Player Vault Trays
    for (let slot = 0; slot < 4; slot++) {
      const tray = playerTrays[slot];
      const player = players[slot];
      if (!player) {
        tray.root.visible = false;
        continue;
      }
      tray.root.visible = true;
      const isAct = slot === activePlayerIndex && !player.bankrupt;
      if (player.bankrupt) {
        tray.accentBarMat.color.setHex(0x475569);
        tray.accentBarMat.emissive.setHex(0x1e293b);
        tray.accentBarMat.emissiveIntensity = 0.08;
        tray.feltMat.color.setHex(0x1e293b);
      } else {
        tray.accentBarMat.color.set(player.color);
        tray.accentBarMat.emissive.set(player.color);
        tray.accentBarMat.emissiveIntensity = isAct ? 0.72 : 0.28;
        tray.feltMat.color.setHex(0x17324d);
        appendTrayUnits(slot, player.cash, PLAYER_VAULT_SCALE, tray.recoilOffset);
      }
    }

    // Central Bank Reserve Vault
    appendTrayUnits(-1, BANK_RESERVE_CASH, BANK_VAULT_SCALE, bankTray.recoilOffset);
    staticDirty = true;
  };

  let cachedPlayersSnapshot: PlayerState[] = [];
  let cachedStyle: CurrencyStyleId = 'mixed';
  let cachedActiveIdx = 0;

  const syncVaults = (
    players: PlayerState[],
    style: CurrencyStyleId,
    activePlayerIndex = 0
  ) => {
    const sig = `${style}|${activePlayerIndex}|${players
      .map((p) => `${p.id}:${Math.floor(p.cash)}:${p.bankrupt ? 1 : 0}:${p.color}`)
      .join(',')}`;
    if (sig === lastVaultSignature) return;
    lastVaultSignature = sig;
    cachedPlayersSnapshot = players;
    cachedStyle = style;
    cachedActiveIdx = activePlayerIndex;
    rebuildStaticVaultUnits(players, style, activePlayerIndex);
  };

  const resolveEndpoint = (
    playerId: number | null,
    tileIndex: number | null,
    players: PlayerState[],
    isTarget: boolean
  ): { vec: THREE.Vector3; traySlot: number | null } => {
    if (playerId !== null) {
      const slot = players.findIndex((p) => p.id === playerId);
      if (slot >= 0 && slot < 4) {
        const va = getVaultWorldAnchor(slot);
        return {
          vec: new THREE.Vector3(va.x, va.y + (isTarget ? 0.16 : 0.26), va.z),
          traySlot: slot,
        };
      }
    }
    if (tileIndex !== null) {
      const tf = getTileTransform(tileIndex);
      return {
        vec: new THREE.Vector3(tf.x, 0.54, tf.z),
        traySlot: null,
      };
    }
    const bankVa = getVaultWorldAnchor(-1);
    return {
      vec: new THREE.Vector3(bankVa.x, bankVa.y + 0.18, bankVa.z),
      traySlot: -1,
    };
  };

  const enqueueTransfers = (
    events: CashFlowTransferEvent[],
    players: PlayerState[],
    style: CurrencyStyleId
  ) => {
    for (const ev of events) {
      if (ev.amount <= 0) continue;
      const fromEp = resolveEndpoint(
        ev.fromPlayerId,
        ev.kind === 'PLAYER_TO_BANK' ? ev.tileIndex : null,
        players,
        false
      );
      const toEp = resolveEndpoint(
        ev.toPlayerId,
        ev.kind === 'PLAYER_TO_TILE' ? ev.tileIndex : null,
        players,
        true
      );

      // Trigger subtle lift recoil on outgoing tray
      if (fromEp.traySlot !== null) {
        const srcTray =
          fromEp.traySlot === -1 ? bankTray : playerTrays[fromEp.traySlot];
        if (srcTray) srcTray.recoilVelocity = -0.55;
      }

      const unitCount = Math.max(
        4,
        Math.min(11, Math.ceil(ev.amount / 140_000) + 3)
      );
      const chordDist = fromEp.vec.distanceTo(toEp.vec);
      const dirX = toEp.vec.x - fromEp.vec.x;
      const dirZ = toEp.vec.z - fromEp.vec.z;
      const lenXZ = Math.max(0.001, Math.hypot(dirX, dirZ));
      const perpX = -dirZ / lenXZ;
      const perpZ = dirX / lenXZ;

      for (let i = 0; i < unitCount; i++) {
        if (activeFlights.length >= MAX_ACTIVE_FLIGHTS) {
          activeFlights.shift();
        }
        const { category, hex, restitution } = chooseTransferPalette(
          ev.amount,
          style,
          i
        );
        const spread = ((i % 5) - 2) * 0.16;
        const p0 = new THREE.Vector3(
          fromEp.vec.x + perpX * spread * 0.6,
          fromEp.vec.y + (i % 3) * 0.05,
          fromEp.vec.z + perpZ * spread * 0.6
        );
        const p2 = new THREE.Vector3(
          toEp.vec.x + Math.sin(i * 2.1) * 0.34,
          toEp.vec.y,
          toEp.vec.z + Math.cos(i * 1.7) * 0.22
        );
        const arcPeakY =
          Math.max(p0.y, p2.y) + 2.35 + Math.min(3.1, chordDist * 0.18) + (i % 3) * 0.18;
        const p1 = new THREE.Vector3(
          (p0.x + p2.x) * 0.5 + perpX * spread * 1.45,
          arcPeakY,
          (p0.z + p2.z) * 0.5 + perpZ * spread * 1.45
        );

        activeFlights.push({
          category,
          color: new THREE.Color(hex),
          p0,
          p1,
          p2,
          delay: i * 0.052,
          elapsed: 0,
          duration: 0.86 + (i % 3) * 0.055,
          spinSpeedX: category === 'bill' ? 2.4 : 9.5 + (i % 4) * 2.2,
          spinSpeedY: 4.2 + (i % 3) * 1.8,
          spinSpeedZ: category === 'bill' ? 3.1 : 7.8 + (i % 3) * 2.0,
          restYaw: Math.PI / 4 + ((i % 3) - 1) * 0.18,
          restitution,
          flutterPhase: (i * 1.37) % (Math.PI * 2),
          targetTraySlot: toEp.traySlot,
          impactTriggered: false,
        });
      }
    }
  };

  const commitPoolsToGpu = () => {
    const categories: VaultMeshCategory[] = ['bill', 'coin', 'bullion', 'chip'];

    for (const cat of categories) {
      const mesh = pools[cat];
      const statics = staticUnits[cat];
      let cursor = 0;

      for (let i = 0; i < statics.length && cursor < MAX_INSTANCES_PER_POOL; i++) {
        const st = statics[i];
        mesh.setMatrixAt(cursor, st.matrix);
        mesh.setColorAt(cursor, st.color);
        if (cat === 'bill') {
          billFlutterArray[cursor * 2] = 0.0;
          billFlutterArray[cursor * 2 + 1] = st.flutterPhase;
        }
        cursor++;
      }

      // Append active flying currency units of matching category
      for (let f = 0; f < activeFlights.length && cursor < MAX_INSTANCES_PER_POOL; f++) {
        const fl = activeFlights[f];
        if (fl.category !== cat || fl.elapsed < fl.delay) continue;

        const t = Math.min(1, (fl.elapsed - fl.delay) / fl.duration);
        let flutterAmp = 0;

        if (t <= 0.76) {
          // Airborne quadratic Bezier trajectory
          const s = t / 0.76;
          _bezierA.lerpVectors(fl.p0, fl.p1, s);
          _bezierB.lerpVectors(fl.p1, fl.p2, s);
          _pos.lerpVectors(_bezierA, _bezierB, s);

          _euler.set(
            s * fl.spinSpeedX,
            fl.restYaw + s * fl.spinSpeedY,
            s * fl.spinSpeedZ
          );
          _quat.setFromEuler(_euler);
          _scale.setScalar(1.16);
          flutterAmp = cat === 'bill' ? 1.0 : 0.0;
        } else {
          // Physical damped rigid-body impact bounce on destination Vault Tray / Tile!
          const b = (t - 0.76) / 0.24;
          const bounceY = computePhysicalTrayBounceY(b, fl.restitution);
          _pos.set(fl.p2.x, fl.p2.y + bounceY, fl.p2.z);

          const settleFade = 1 - b;
          _euler.set(
            settleFade * 0.35 * Math.sin(b * Math.PI * 2),
            fl.restYaw,
            settleFade * 0.28 * Math.cos(b * Math.PI * 2)
          );
          _quat.setFromEuler(_euler);
          _scale.setScalar(THREE.MathUtils.lerp(1.16, 1.0, b));
          flutterAmp = cat === 'bill' ? settleFade * 0.45 : 0.0;
        }

        _flightMat.compose(_pos, _quat, _scale);
        mesh.setMatrixAt(cursor, _flightMat);
        mesh.setColorAt(cursor, fl.color);
        if (cat === 'bill') {
          billFlutterArray[cursor * 2] = flutterAmp;
          billFlutterArray[cursor * 2 + 1] = fl.flutterPhase;
        }
        cursor++;
      }

      mesh.count = cursor;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) {
        mesh.instanceColor.needsUpdate = true;
      }
    }

    billFlutterAttr.needsUpdate = true;
  };

  let freezeIdleGlint = false;

  const update = (dt: number, elapsed: number) => {
    if (!freezeIdleGlint || activeFlights.length > 0) {
      uTimeShared.value = elapsed;
    }

    // 1. Advance damped spring physics on Vault Trays when outgoing/incoming cash strikes them
    let anyTrayMoved = false;
    const allTrays = [...playerTrays, bankTray];
    for (const tr of allTrays) {
      if (Math.abs(tr.recoilOffset) > 0.0004 || Math.abs(tr.recoilVelocity) > 0.0004) {
        const springK = 150;
        const damping = 16;
        const accel = -springK * tr.recoilOffset - damping * tr.recoilVelocity;
        tr.recoilVelocity += accel * dt;
        tr.recoilOffset += tr.recoilVelocity * dt;
        if (Math.abs(tr.recoilOffset) < 0.0004 && Math.abs(tr.recoilVelocity) < 0.002) {
          tr.recoilOffset = 0;
          tr.recoilVelocity = 0;
        }
        tr.root.position.y = tr.baseY + tr.recoilOffset;
        anyTrayMoved = true;
      }
    }

    if (anyTrayMoved && cachedPlayersSnapshot.length > 0) {
      rebuildStaticVaultUnits(cachedPlayersSnapshot, cachedStyle, cachedActiveIdx);
    }

    // 2. Advance active flying currency transfers
    let hadActiveFlights = activeFlights.length > 0;
    for (let i = activeFlights.length - 1; i >= 0; i--) {
      const fl = activeFlights[i];
      fl.elapsed += dt;
      const activeTime = fl.elapsed - fl.delay;
      if (activeTime >= fl.duration * 0.76 && !fl.impactTriggered) {
        fl.impactTriggered = true;
        if (fl.targetTraySlot !== null) {
          const dstTray =
            fl.targetTraySlot === -1 ? bankTray : playerTrays[fl.targetTraySlot];
          if (dstTray) {
            dstTray.recoilVelocity = Math.max(dstTray.recoilVelocity - 0.35, -0.95);
          }
        }
      }
      if (activeTime >= fl.duration) {
        activeFlights.splice(i, 1);
        hadActiveFlights = true;
      }
    }

    if (staticDirty || hadActiveFlights) {
      commitPoolsToGpu();
      staticDirty = false;
    }
  };

  const hasActiveAnimations = (): boolean => {
    if (activeFlights.length > 0 || staticDirty) return true;
    for (const tr of [...playerTrays, bankTray]) {
      if (
        Math.abs(tr.recoilOffset) > 0.0004 ||
        Math.abs(tr.recoilVelocity) > 0.0004
      ) {
        return true;
      }
    }
    return false;
  };

  const getShaderTime = (): number => uTimeShared.value;

  const setQualityProfile = (
    profile: Pick<GraphicsQualityProfile, 'shadowsEnabled' | 'usePhysicalClearcoat'>
  ) => {
    const wantShadows = !isSoftwareGl && profile.shadowsEnabled;
    const wantClearcoat = !isSoftwareGl && profile.usePhysicalClearcoat;
    freezeIdleGlint = !wantClearcoat;

    for (const im of Object.values(pools)) {
      im.castShadow = wantShadows;
      im.receiveShadow = wantShadows;
    }

    for (const tr of [...playerTrays, bankTray]) {
      tr.root.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          if (obj.userData.canCastShadow) obj.castShadow = wantShadows;
          if (obj.userData.canReceiveShadow) obj.receiveShadow = wantShadows;
        }
      });
    }

    const applyClearcoat = (mat: THREE.MeshPhysicalMaterial, highVal: number) => {
      const nextVal = wantClearcoat ? highVal : 0;
      if ((mat.clearcoat > 0) !== (nextVal > 0)) {
        mat.needsUpdate = true;
      }
      mat.clearcoat = nextVal;
    };
    applyClearcoat(coinMat, 0.55);
    applyClearcoat(bullionMat, 0.78);
    applyClearcoat(chipMat, 0.65);
  };

  const dispose = () => {
    shadowTex.dispose();
    billTex.dispose();
    coinMap.dispose();
    coinBump.dispose();
    bullionBump.dispose();
    chipTex.dispose();

    const disposedGeos = new Set<THREE.BufferGeometry>();
    const disposedMats = new Set<THREE.Material>();
    group.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        if (obj.geometry && !disposedGeos.has(obj.geometry)) {
          disposedGeos.add(obj.geometry);
          obj.geometry.dispose();
        }
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        for (const m of mats) {
          if (m && !disposedMats.has(m)) {
            disposedMats.add(m);
            m.dispose();
          }
        }
      }
      if (obj instanceof THREE.InstancedMesh) {
        obj.dispose();
      }
    });

    trayBaseMat.dispose();
    goldRimMat.dispose();
    for (const tr of [...playerTrays, bankTray]) {
      tr.accentBarMat.dispose();
      tr.feltMat.dispose();
    }

    billGeo.dispose();
    billMat.dispose();
    coinGeo.dispose();
    coinMat.dispose();
    bullionGeo.dispose();
    bullionMat.dispose();
    chipGeo.dispose();
    chipMat.dispose();
  };

  return {
    group,
    syncVaults,
    enqueueTransfers,
    update,
    hasActiveAnimations,
    getShaderTime,
    setQualityProfile,
    dispose,
  };
}
