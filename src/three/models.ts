import * as THREE from 'three';
import { formatCountdownClock } from '../game/rules';
import {
  create3DTaxGrassTexture,
  createBoulevardRoadTexture,
  createBusinessTourPitchTexture,
  createCardDeckTopTexture,
  createCashBillSideTexture,
  createCashBillTopTexture,
  createCountdownClockBoardTexture,
  createLevelBadgeTexture,
  createMetallicCoinTopTexture,
  createOuterPriceTabTexture,
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
  facadeMat: THREE.MeshStandardMaterial;
  roofMat: THREE.MeshStandardMaterial;
  starterPavilion: THREE.Group;
  houses: THREE.Group[];
  hotel: THREE.Group;
  shieldGroup: THREE.Group;
  levelBadgeMesh: THREE.Mesh;
  levelBadgeMat: THREE.MeshBasicMaterial;
  setOwnerTint: (ownerHex: string, mortgaged: boolean) => void;
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
    tokenHeadlightMat: new THREE.MeshStandardMaterial({
      color: 0xfef08a,
      roughness: 0.45,
      metalness: 0.15,
      emissive: 0xfde047,
      emissiveIntensity: 0,
    }),
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
      uDayBlueTop: { value: new THREE.Color('#7CC6FE') },
      uDayBlueMid: { value: new THREE.Color('#B5E2FF') },
      uDayHorizon: { value: new THREE.Color('#FFF0F5') },
      uDayPinkMid: { value: new THREE.Color('#FFC6D9') },
      uDayPinkWarm: { value: new THREE.Color('#FFB5A7') },
      uNightTop: { value: new THREE.Color('#0B1120') },
      uNightBottom: { value: new THREE.Color('#1E1B4B') },
    },
  };
}

function createContactShadow(radius: number, opacity = 0.3): THREE.Mesh {
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

  const tex = new THREE.CanvasTexture(canvas);
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
  const collarMat = new THREE.MeshStandardMaterial({
    color: isNegative ? 0xfb7185 : 0xd5dce6,
    roughness: 0.7,
    metalness: 0.1,
  });

  const tabWallMat = new THREE.MeshStandardMaterial({
    color: 0xf4f5f7,
    roughness: 0.7,
    metalness: 0.1,
  });

  const topTex = createOuterPriceTabTexture(
    initialLabel,
    accentHex,
    null,
    false,
    flip180,
    maxAnisotropy
  );
  const topMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: topTex,
    roughness: 0.68,
    metalness: 0.08,
  });

  // 1. Structural 3D bridge neck anchored into the tile's outer wall
  const neck = new THREE.Mesh(
    new THREE.BoxGeometry(1.24, 0.24, 0.38),
    collarMat
  );
  neck.position.set(0, 0.1, 1.35);
  neck.castShadow = true;
  group.add(neck);

  // 2. Chunky lower bevelled 3D collar extending outward from the tile edge
  const lowerCollar = new THREE.Mesh(
    new THREE.BoxGeometry(1.7, 0.18, 1.04),
    collarMat
  );
  lowerCollar.position.set(0, 0.08, 1.81);
  lowerCollar.castShadow = true;
  lowerCollar.receiveShadow = true;
  group.add(lowerCollar);

  // 3. Raised #F4F5F7 3D price plate displaying bold dark-slate shorthand (180K, 660K, 1.2M)
  const hitMesh = new THREE.Mesh(
    new THREE.BoxGeometry(1.58, 0.18, 0.92),
    [tabWallMat, tabWallMat, topMat, tabWallMat, tabWallMat, tabWallMat]
  );
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
  _palette?: NightLightingPalette
): THREE.Group {
  const group = new THREE.Group();

  const suitColor = new THREE.Color(colorHex);
  const darkSuitColor = suitColor.clone().multiplyScalar(0.76);

  const suitMat = new THREE.MeshStandardMaterial({
    color: suitColor,
    roughness: 0.65,
    metalness: 0.1,
  });
  const suitDarkMat = new THREE.MeshStandardMaterial({
    color: darkSuitColor,
    roughness: 0.68,
    metalness: 0.1,
  });
  const whiteMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.65,
    metalness: 0.06,
  });
  const skinMat = new THREE.MeshStandardMaterial({
    color: 0xfad2b8,
    roughness: 0.72,
    metalness: 0.04,
  });
  const shoeMat = new THREE.MeshStandardMaterial({
    color: 0x1e293b,
    roughness: 0.7,
    metalness: 0.12,
  });
  const goldMat = new THREE.MeshStandardMaterial({
    color: 0xfacc15,
    roughness: 0.38,
    metalness: 0.45,
  });
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
    roughness: 0.72,
    metalness: 0.05,
  });

  group.add(createContactShadow(0.42, 0.34));

  // Glossy pedestal base coin with white bevel & player-colored center
  const baseDisc = new THREE.Mesh(
    new THREE.CylinderGeometry(0.32, 0.35, 0.07, 20),
    whiteMat
  );
  baseDisc.position.y = 0.035;
  baseDisc.castShadow = true;
  group.add(baseDisc);

  const baseInner = new THREE.Mesh(
    new THREE.CylinderGeometry(0.26, 0.26, 0.03, 20),
    suitMat
  );
  baseInner.position.y = 0.075;
  group.add(baseInner);

  // Shoes & Legs standing on pedestal
  const legGeo = new THREE.CylinderGeometry(0.068, 0.062, 0.22, 10);
  const shoeGeo = new THREE.BoxGeometry(0.13, 0.07, 0.18);
  for (const lx of [-0.095, 0.095]) {
    const shoe = new THREE.Mesh(shoeGeo, shoeMat);
    shoe.position.set(lx, 0.115, 0.025);
    shoe.castShadow = true;
    group.add(shoe);

    const leg = new THREE.Mesh(legGeo, suitDarkMat);
    leg.position.set(lx, 0.24, 0);
    leg.castShadow = true;
    group.add(leg);
  }

  // Stylized Suit Torso + White Shirt V-Collar + Gold Tie/Brooch
  const torso = new THREE.Mesh(
    new THREE.CylinderGeometry(0.18, 0.155, 0.32, 14),
    suitMat
  );
  torso.scale.set(1.08, 1, 0.82);
  torso.position.y = 0.48;
  torso.castShadow = true;
  group.add(torso);

  const shirtFront = new THREE.Mesh(
    new THREE.BoxGeometry(0.13, 0.18, 0.04),
    whiteMat
  );
  shirtFront.position.set(0, 0.53, 0.13);
  group.add(shirtFront);

  const tie = new THREE.Mesh(
    new THREE.BoxGeometry(0.045, 0.14, 0.05),
    goldMat
  );
  tie.position.set(0, 0.51, 0.14);
  group.add(tie);

  // Arms angled naturally at sides
  const armGeo = new THREE.CylinderGeometry(0.052, 0.046, 0.26, 10);
  const handGeo = new THREE.SphereGeometry(0.052, 10, 8);
  for (const side of [-1, 1]) {
    const arm = new THREE.Mesh(armGeo, suitMat);
    arm.position.set(side * 0.225, 0.48, 0.01);
    arm.rotation.z = side * -0.22;
    arm.castShadow = true;
    group.add(arm);

    const hand = new THREE.Mesh(handGeo, skinMat);
    hand.position.set(side * 0.255, 0.35, 0.02);
    group.add(hand);
  }

  // Expressive Chibi Head
  const headGroup = new THREE.Group();
  headGroup.position.y = 0.82;

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.21, 18, 14), skinMat);
  head.scale.set(1.02, 0.98, 0.98);
  head.castShadow = true;
  headGroup.add(head);

  // Eyes + Cute rosy cheeks
  const eyeGeo = new THREE.SphereGeometry(0.026, 8, 8);
  for (const ex of [-0.072, 0.072]) {
    const eye = new THREE.Mesh(eyeGeo, shoeMat);
    eye.position.set(ex, 0.015, 0.192);
    headGroup.add(eye);
  }

  // Hair & Archetype Signature Accessory
  const hairBack = new THREE.Mesh(
    new THREE.SphereGeometry(0.222, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.64),
    hairMat
  );
  hairBack.rotation.x = -0.22;
  hairBack.position.set(0, 0.02, -0.02);
  headGroup.add(hairBack);

  if (tokenType === 'car') {
    // Cool executive visor sunglasses + windswept top hair
    const crest = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.09, 0.22), hairMat);
    crest.position.set(0, 0.19, 0.04);
    crest.rotation.x = -0.18;
    headGroup.add(crest);

    const shades = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.065, 0.06), shoeMat);
    shades.position.set(0, 0.03, 0.195);
    headGroup.add(shades);
  } else if (tokenType === 'yacht') {
    // Resort captain white-and-gold sunhat
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.31, 0.31, 0.03, 18), whiteMat);
    brim.position.set(0, 0.16, 0);
    brim.rotation.x = -0.1;
    headGroup.add(brim);

    const hatCrown = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.19, 0.12, 16), suitMat);
    hatCrown.position.set(0, 0.22, -0.01);
    headGroup.add(hatCrown);
  } else if (tokenType === 'jet') {
    // Aviator top-hat / tycoon fedora in signature hot-pink & gold band
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
    // Golden Royal Crown on top of head
    const crownBase = new THREE.Mesh(
      new THREE.CylinderGeometry(0.15, 0.13, 0.09, 12),
      goldMat
    );
    crownBase.position.y = 0.22;
    headGroup.add(crownBase);

    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.042, 0.11, 6), goldMat);
      spike.position.set(Math.cos(a) * 0.11, 0.3, Math.sin(a) * 0.11);
      headGroup.add(spike);
    }
  }

  group.add(headGroup);
  return group;
}

/**
 * Floating 3D Gold/Red Protection Shield Icon bobbing above Level 4 Luxury Hotels.
 */
function createProtectionShieldModel(): THREE.Group {
  const shield = new THREE.Group();

  const goldRimMat = new THREE.MeshStandardMaterial({
    color: 0xfacc15,
    roughness: 0.35,
    metalness: 0.55,
  });
  const rubyCoreMat = new THREE.MeshStandardMaterial({
    color: 0xef4444,
    roughness: 0.45,
    metalness: 0.15,
  });
  const whiteCrestMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.5,
    metalness: 0.08,
  });

  // Outer Gold Shield Body (upper crest + lower tapered point)
  const upperGold = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.28, 0.08), goldRimMat);
  upperGold.position.y = 0.12;
  upperGold.castShadow = true;
  shield.add(upperGold);

  const lowerGold = new THREE.Mesh(new THREE.ConeGeometry(0.295, 0.28, 4), goldRimMat);
  lowerGold.rotation.z = Math.PI;
  lowerGold.rotation.y = Math.PI / 4;
  lowerGold.scale.set(1, 1, 0.28);
  lowerGold.position.y = -0.14;
  shield.add(lowerGold);

  // Inner Crimson-Red Shield Face (both front & back)
  const upperRed = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.21, 0.098), rubyCoreMat);
  upperRed.position.y = 0.12;
  shield.add(upperRed);

  const lowerRed = new THREE.Mesh(new THREE.ConeGeometry(0.225, 0.21, 4), rubyCoreMat);
  lowerRed.rotation.z = Math.PI;
  lowerRed.rotation.y = Math.PI / 4;
  lowerRed.scale.set(1, 1, 0.34);
  lowerRed.position.y = -0.11;
  shield.add(lowerRed);

  // Crisp White Star/Cross Emblem in center of shield
  const vBar = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.2, 0.112), whiteCrestMat);
  vBar.position.y = 0.07;
  shield.add(vBar);

  const hBar = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.07, 0.112), whiteCrestMat);
  hBar.position.y = 0.09;
  shield.add(hBar);

  return shield;
}

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
  maxAnisotropy: number
): OwnershipBuildingSuiteRefs {
  const root = new THREE.Group();
  const innerZ = -tileDepth / 2 + 0.46;

  // Dynamic owner-tinted matte/toon PBR materials (roughness: 0.7, metalness: 0.1)
  const padMat = new THREE.MeshStandardMaterial({
    color: 0xe2e8f0,
    roughness: 0.7,
    metalness: 0.1,
  });
  const facadeMat = new THREE.MeshStandardMaterial({
    color: 0xf5b800,
    roughness: 0.68,
    metalness: 0.1,
  });
  const roofMat = new THREE.MeshStandardMaterial({
    color: 0xd97706,
    roughness: 0.64,
    metalness: 0.12,
  });
  const whiteTrimMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.65,
    metalness: 0.06,
  });
  const goldMat = new THREE.MeshStandardMaterial({
    color: 0xfacc15,
    roughness: 0.36,
    metalness: 0.45,
  });

  // Inner tile accent pad (tints to owner color immediately upon purchase!)
  const padMesh = new THREE.Mesh(
    new THREE.BoxGeometry(tileWidth - 0.2, 0.045, 0.72),
    padMat
  );
  padMesh.position.set(0, tileSurfaceY + 0.022, innerZ);
  padMesh.receiveShadow = true;
  padMesh.castShadow = true;
  padMesh.visible = false;
  root.add(padMesh);

  const buildBaseY = tileSurfaceY + 0.045;

  // Level 0 (Owned Land Starter Pavilion — full-color miniature booth so newly bought land immediately pops!)
  const starterPavilion = new THREE.Group();
  starterPavilion.position.set(0, buildBaseY, innerZ);
  starterPavilion.visible = false;
  {
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.05, 0.36), whiteTrimMat);
    base.position.y = 0.025;
    starterPavilion.add(base);

    const body = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.2, 0.28), facadeMat);
    body.position.y = 0.15;
    body.castShadow = true;
    starterPavilion.add(body);

    const awning = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.2, 4), roofMat);
    awning.rotation.y = Math.PI / 4;
    awning.position.y = 0.33;
    awning.castShadow = true;
    starterPavilion.add(awning);

    const win = new THREE.Mesh(
      new THREE.BoxGeometry(0.16, 0.08, 0.3),
      palette.houseWindowMat
    );
    win.position.y = 0.16;
    starterPavilion.add(win);
  }
  root.add(starterPavilion);

  // Level 1..3 Full-Color Stylized Miniature Houses
  const houses: THREE.Group[] = [];
  const houseXs = [-0.54, 0, 0.54];
  for (let i = 0; i < 3; i++) {
    const hGroup = new THREE.Group();
    hGroup.position.set(houseXs[i], buildBaseY, innerZ);
    hGroup.visible = false;

    const plinth = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.045, 0.4), whiteTrimMat);
    plinth.position.y = 0.022;
    hGroup.add(plinth);

    const walls = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.28, 0.34), facadeMat);
    walls.position.y = 0.185;
    walls.castShadow = true;
    walls.receiveShadow = true;
    hGroup.add(walls);

    const eave = new THREE.Mesh(new THREE.BoxGeometry(0.43, 0.04, 0.41), whiteTrimMat);
    eave.position.y = 0.33;
    hGroup.add(eave);

    const roof = new THREE.Mesh(new THREE.ConeGeometry(0.34, 0.26, 4), roofMat);
    roof.rotation.y = Math.PI / 4;
    roof.position.y = 0.47;
    roof.castShadow = true;
    hGroup.add(roof);

    const chimney = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.16, 0.07), roofMat);
    chimney.position.set(0.1, 0.48, -0.08);
    hGroup.add(chimney);

    const winGeo = new THREE.BoxGeometry(0.09, 0.09, 0.36);
    const w1 = new THREE.Mesh(winGeo, palette.houseWindowMat);
    w1.position.set(-0.09, 0.2, 0);
    const w2 = new THREE.Mesh(winGeo, palette.houseWindowMat);
    w2.position.set(0.09, 0.2, 0);
    hGroup.add(w1, w2);

    root.add(hGroup);
    houses.push(hGroup);
  }

  // Level 4 Full-Color Grand Luxury Hotel
  const hotel = new THREE.Group();
  hotel.position.set(0, buildBaseY, innerZ);
  hotel.visible = false;
  {
    const plinth = new THREE.Mesh(new THREE.BoxGeometry(1.06, 0.07, 0.54), whiteTrimMat);
    plinth.position.y = 0.035;
    plinth.castShadow = true;
    hotel.add(plinth);

    const centerTower = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.64, 0.44), facadeMat);
    centerTower.position.y = 0.39;
    centerTower.castShadow = true;
    centerTower.receiveShadow = true;
    hotel.add(centerTower);

    const wingGeo = new THREE.BoxGeometry(0.25, 0.44, 0.38);
    const leftWing = new THREE.Mesh(wingGeo, facadeMat);
    leftWing.position.set(-0.37, 0.29, 0);
    leftWing.castShadow = true;
    hotel.add(leftWing);

    const rightWing = new THREE.Mesh(wingGeo, facadeMat);
    rightWing.position.set(0.37, 0.29, 0);
    rightWing.castShadow = true;
    hotel.add(rightWing);

    const mainWinGeo = new THREE.BoxGeometry(0.36, 0.07, 0.46);
    for (const wy of [0.22, 0.39, 0.56]) {
      const wb = new THREE.Mesh(mainWinGeo, palette.hotelWindowMat);
      wb.position.y = wy;
      hotel.add(wb);
    }

    const cornice = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.045, 0.49), whiteTrimMat);
    cornice.position.y = 0.72;
    hotel.add(cornice);

    const mainRoof = new THREE.Mesh(new THREE.ConeGeometry(0.43, 0.3, 4), roofMat);
    mainRoof.rotation.y = Math.PI / 4;
    mainRoof.position.y = 0.89;
    mainRoof.castShadow = true;
    hotel.add(mainRoof);

    const wingRoofGeo = new THREE.ConeGeometry(0.23, 0.18, 4);
    const lRoof = new THREE.Mesh(wingRoofGeo, roofMat);
    lRoof.rotation.y = Math.PI / 4;
    lRoof.position.set(-0.37, 0.6, 0);
    hotel.add(lRoof);

    const rRoof = new THREE.Mesh(wingRoofGeo, roofMat);
    rRoof.rotation.y = Math.PI / 4;
    rRoof.position.set(0.37, 0.6, 0);
    hotel.add(rRoof);

    const spire = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.05, 0.2, 8), goldMat);
    spire.position.y = 1.08;
    hotel.add(spire);
  }
  root.add(hotel);

  // Floating 3D Gold/Red Shield Icon above Protected Level 4 Properties
  const shieldGroup = createProtectionShieldModel();
  shieldGroup.position.set(0, buildBaseY + 1.48, innerZ);
  shieldGroup.visible = false;
  root.add(shieldGroup);

  // Clean Square Level Badge ("1", "2", "3", "★") floating above upgraded / hovered owned tiles
  const initBadgeTex = createLevelBadgeTexture(1, '#F5B800', maxAnisotropy);
  const levelBadgeMat = new THREE.MeshBasicMaterial({
    map: initBadgeTex,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const levelBadgeMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(0.46, 0.46),
    levelBadgeMat
  );
  levelBadgeMesh.position.set(0.56, buildBaseY + 0.82, innerZ + 0.16);
  levelBadgeMesh.visible = false;
  root.add(levelBadgeMesh);

  const _tmpBase = new THREE.Color();
  const _tmpFacade = new THREE.Color();
  const _tmpRoof = new THREE.Color();
  const _white = new THREE.Color(0xffffff);

  const setOwnerTint = (ownerHex: string, mortgaged: boolean) => {
    if (mortgaged) {
      padMat.color.setHex(0x94a3b8);
      facadeMat.color.setHex(0x94a3b8);
      roofMat.color.setHex(0x64748b);
      return;
    }
    _tmpBase.set(ownerHex);
    // Facade gets rich luminous owner color; Roof gets deep saturated owner color; Pad gets clean owner accent!
    _tmpFacade.copy(_tmpBase).lerp(_white, 0.16);
    _tmpRoof.copy(_tmpBase).multiplyScalar(0.8);

    padMat.color.copy(_tmpBase);
    facadeMat.color.copy(_tmpFacade);
    roofMat.color.copy(_tmpRoof);
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
  };
}

/**
 * Legacy exports preserved for compatibility if referenced elsewhere.
 */
export function createHouseModel(palette?: NightLightingPalette): THREE.Group {
  void palette;
  return new THREE.Group();
}
export function createHotelModel(palette?: NightLightingPalette): THREE.Group {
  void palette;
  return new THREE.Group();
}
export function createBoulevardBollardLamp(palette: NightLightingPalette): THREE.Group {
  void palette;
  return new THREE.Group();
}

/**
 * Builds the 4 Distinct 3D Corner Dioramas of Business Tour:
 * - Corner 0 (Bottom): BẮT ĐẦU (START) — 3D celebratory arch/banner with golden star crest.
 * - Corner 7 (Left): ĐẢO HOANG / VÀO TÙ (LOST ISLAND) — 3D tropical island with water rim, palm trees & animated mascot.
 * - Corner 14 (Top): CÚP THẾ GIỚI / LỄ HỘI (WORLD CHAMPIONSHIPS) — 3D miniature stadium dome & rotating trophy.
 * - Corner 21 (Right): DU LỊCH (WORLD TOUR) — 3D terminal control tower & poised 3D airplane.
 */
export function createCornerDiorama(
  tileIndex: number,
  tileSurfaceY: number
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

    for (const px of [-0.88, 0.88]) {
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
    const topBeam = new THREE.Mesh(new THREE.BoxGeometry(2.12, 0.28, 0.26), redMat);
    topBeam.position.set(0, 1.34, 0);
    topBeam.castShadow = true;
    archGroup.add(topBeam);

    const innerBanner = new THREE.Mesh(new THREE.BoxGeometry(1.86, 0.18, 0.3), greenMat);
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
  } else if (tileIndex === 7) {
    // CORNER 7: ĐẢO HOANG / LOST ISLAND — Tropical Lagoon Rim, Sandy Mound, Twin Palm Trees & Animated Mascot
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
    group.add(waterRim);

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
    group.add(sandMound);

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
    group.add(palm1);

    const palm2 = buildPalmTree(0.6, -0.25, 0.82);
    palm2.position.set(0.32, 0.12, -0.28);
    group.add(palm2);

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

    group.add(mascot);
    bobTarget = mascot;
  } else if (tileIndex === 14) {
    // CORNER 14: CÚP THẾ GIỚI / WORLD CHAMPIONSHIPS — 3D Miniature Stadium Dome + Rotating Golden Cup
    const stadium = new THREE.Group();

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
        new THREE.BoxGeometry(0.16, 0.1, 0.06),
        whiteMat
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
  } else if (tileIndex === 21) {
    // CORNER 21: DU LỊCH (WORLD TOUR) — 3D Airport Terminal + Control Tower + Poised 3D Jetliner
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
    baseBobY = 0.42;
    jet.position.set(0.12, baseBobY, 0.22);
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

  // Fan of 4 thick 3D question-mark cards stacked organically
  const cardGeo = new THREE.BoxGeometry(1.78, 0.12, 1.16);
  const mats = [cardSideMat, cardSideMat, topMat, cardSideMat, cardSideMat, cardSideMat];
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
  updateTaxDisplay: (spacedTaxText: string) => void;
  updateCountdown: (
    secondsLeft: number,
    turnNumber: number,
    activeColorHex: string
  ) => void;
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

  // 3. CENTER GRASS LARGE BOLD FLAT-SHADED WHITE 3D TAX / JACKPOT TEXT ("660 000" / "0")
  const taxGroup = new THREE.Group();
  taxGroup.position.set(0.12, GRASS_Y + 0.005, 0.12);
  taxGroup.rotation.y = Math.PI / 4; // Aligned horizontally to isometric diamond camera!

  let currentTaxStr = '0';
  let taxShadowTex = create3DTaxGrassTexture(currentTaxStr, 'shadow', maxAnisotropy);
  let taxExtrudeTex = create3DTaxGrassTexture(currentTaxStr, 'extrude', maxAnisotropy);
  let taxCapTex = create3DTaxGrassTexture(currentTaxStr, 'cap', maxAnisotropy);

  const taxPlaneGeo = new THREE.PlaneGeometry(6.3, 2.36);
  taxPlaneGeo.rotateX(-Math.PI / 2);

  const taxShadowMat = new THREE.MeshBasicMaterial({
    map: taxShadowTex,
    transparent: true,
    opacity: 0.34,
    depthWrite: false,
  });
  const taxShadowMesh = new THREE.Mesh(taxPlaneGeo, taxShadowMat);
  taxShadowMesh.position.set(0.08, 0.004, 0.08);
  taxGroup.add(taxShadowMesh);

  const taxExtrudeMat = new THREE.MeshBasicMaterial({
    color: 0xdbe4ef,
    map: taxExtrudeTex,
    alphaTest: 0.45,
    toneMapped: false,
  });

  const extrudeSlices = 9;
  for (let s = 0; s < extrudeSlices; s++) {
    const sliceMesh = new THREE.Mesh(taxPlaneGeo, taxExtrudeMat);
    sliceMesh.position.y = 0.012 + s * 0.015;
    taxGroup.add(sliceMesh);
  }

  // Flat-shaded pure white top cap (toneMapped: false so #FFFFFF stays pure bright white!)
  const taxCapMat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    map: taxCapTex,
    alphaTest: 0.45,
    toneMapped: false,
  });
  const taxCapMesh = new THREE.Mesh(taxPlaneGeo, taxCapMat);
  taxCapMesh.position.y = 0.012 + extrudeSlices * 0.015;
  taxGroup.add(taxCapMesh);

  group.add(taxGroup);

  const updateTaxDisplay = (spacedTaxText: string) => {
    if (spacedTaxText === currentTaxStr) return;
    currentTaxStr = spacedTaxText;

    const prevShadow = taxShadowTex;
    const prevExtrude = taxExtrudeTex;
    const prevCap = taxCapTex;

    taxShadowTex = create3DTaxGrassTexture(spacedTaxText, 'shadow', maxAnisotropy);
    taxExtrudeTex = create3DTaxGrassTexture(spacedTaxText, 'extrude', maxAnisotropy);
    taxCapTex = create3DTaxGrassTexture(spacedTaxText, 'cap', maxAnisotropy);

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

  // 4. SLEEK DARK-GRAY 3D DIGITAL TIMER / TURN COUNTER AT TOP INNER CORNER OF SUNKEN GRASS
  const clockBoardGroup = new THREE.Group();
  clockBoardGroup.position.set(-3.76, GRASS_Y, -3.76);
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

  clockBoardGroup.add(createContactShadow(1.55, 0.26));

  // Low-profile sleek dark-gray angled digital console pedestal
  const basePlinth = new THREE.Mesh(
    new THREE.BoxGeometry(2.68, 0.14, 0.74),
    darkSlateTrimMat
  );
  basePlinth.position.set(0, 0.07, 0);
  basePlinth.castShadow = true;
  clockBoardGroup.add(basePlinth);

  const clockCasing = new THREE.Mesh(
    new THREE.BoxGeometry(3.08, 1.38, 0.36),
    darkGrayCasingMat
  );
  clockCasing.position.set(0, 0.84, 0);
  clockCasing.rotation.x = -0.18; // Tilted slightly upward toward isometric camera!
  clockCasing.castShadow = true;
  clockCasing.receiveShadow = true;
  clockBoardGroup.add(clockCasing);

  const topVisor = new THREE.Mesh(
    new THREE.BoxGeometry(3.18, 0.1, 0.44),
    darkSlateTrimMat
  );
  topVisor.position.set(0, 1.54, -0.11);
  topVisor.rotation.x = -0.18;
  clockBoardGroup.add(topVisor);

  // Subtle status indicator nodes (kept compatible with clockBellLeft / clockBellRight refs)
  const nodeGeo = new THREE.CylinderGeometry(0.11, 0.11, 0.08, 12);
  const clockBellLeft = new THREE.Mesh(nodeGeo, darkSlateTrimMat);
  clockBellLeft.position.set(-1.12, 1.59, -0.12);
  clockBoardGroup.add(clockBellLeft);

  const clockBellRight = new THREE.Mesh(nodeGeo, darkSlateTrimMat);
  clockBellRight.position.set(1.12, 1.59, -0.12);
  clockBoardGroup.add(clockBellRight);

  let lastClockSec = 30;
  let lastTurnNum = 1;
  let lastClockHex = '#F5B800';
  let clockScreenTex = createCountdownClockBoardTexture(
    formatCountdownClock(lastClockSec),
    lastTurnNum,
    lastClockSec,
    lastClockHex,
    maxAnisotropy
  );
  const clockScreenMat = new THREE.MeshBasicMaterial({
    map: clockScreenTex,
  });
  const clockScreenMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(2.84, 1.16),
    clockScreenMat
  );
  clockScreenMesh.position.set(0, 0.84, 0.185);
  clockScreenMesh.rotation.x = -0.18;
  clockBoardGroup.add(clockScreenMesh);

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

    const prevTex = clockScreenTex;
    clockScreenTex = createCountdownClockBoardTexture(
      formatCountdownClock(clampedSec),
      safeTurn,
      clampedSec,
      activeColorHex,
      maxAnisotropy
    );
    clockScreenMat.map = clockScreenTex;
    clockScreenMat.needsUpdate = true;
    prevTex.dispose();
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
      disposeDynamicTextures,
    },
  };
}

function createCashBundleMesh(
  billTopMat: THREE.Material,
  billSideMat: THREE.Material,
  strapWhiteMat: THREE.Material,
  strapGoldMat: THREE.Material
): THREE.Group {
  const bundle = new THREE.Group();

  const brick = new THREE.Mesh(
    new THREE.BoxGeometry(1.24, 0.26, 0.66),
    [billSideMat, billSideMat, billTopMat, billTopMat, billSideMat, billSideMat]
  );
  brick.position.y = 0.13;
  brick.castShadow = true;
  brick.receiveShadow = true;
  bundle.add(brick);

  const strap = new THREE.Mesh(
    new THREE.BoxGeometry(0.32, 0.276, 0.685),
    strapWhiteMat
  );
  strap.position.y = 0.13;
  bundle.add(strap);

  const goldStripe = new THREE.Mesh(
    new THREE.BoxGeometry(0.08, 0.282, 0.692),
    strapGoldMat
  );
  goldStripe.position.y = 0.13;
  bundle.add(goldStripe);

  return bundle;
}

function createMixedCoinTowers(
  goldMats: [THREE.Material, THREE.Material, THREE.Material],
  silverMats: [THREE.Material, THREE.Material, THREE.Material],
  bronzeMats: [THREE.Material, THREE.Material, THREE.Material],
  towers: Array<[number, number, number, 'gold' | 'silver' | 'bronze']>
): THREE.Group {
  const g = new THREE.Group();
  const coinGeo = new THREE.CylinderGeometry(0.32, 0.32, 0.095, 20);

  for (const [ox, oz, count, tier] of towers) {
    const mats =
      tier === 'gold' ? goldMats : tier === 'silver' ? silverMats : bronzeMats;
    for (let i = 0; i < count; i++) {
      const coin = new THREE.Mesh(coinGeo, mats);
      const jitterX = Math.sin(i * 1.9 + ox) * 0.024;
      const jitterZ = Math.cos(i * 2.3 + oz) * 0.024;
      coin.position.set(ox + jitterX, 0.048 + i * 0.096, oz + jitterZ);
      coin.rotation.y = (i * 0.45) % (Math.PI * 2);
      coin.castShadow = true;
      coin.receiveShadow = true;
      g.add(coin);
    }
  }

  const leaningCoin = new THREE.Mesh(coinGeo, goldMats);
  leaningCoin.position.set(0.42, 0.23, 0.38);
  leaningCoin.rotation.set(0.95, 0.4, 0.25);
  leaningCoin.castShadow = true;
  g.add(leaningCoin);

  return g;
}

function createSoftPastelCloud(scale = 1): THREE.Group {
  const cloud = new THREE.Group();
  const cloudMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.88,
    metalness: 0.0,
    emissive: 0xffe4ec,
    emissiveIntensity: 0.22,
  });

  for (const [x, y, z, r] of [
    [0, 0.22, 0, 0.72],
    [-0.58, 0.14, 0.12, 0.52],
    [0.6, 0.16, -0.08, 0.54],
    [0.12, 0.12, 0.44, 0.46],
  ]) {
    const puff = new THREE.Mesh(new THREE.SphereGeometry(r, 14, 10), cloudMat);
    puff.scale.set(1.25, 0.58, 1.06);
    puff.position.set(x, y, z);
    cloud.add(puff);
  }
  cloud.scale.setScalar(scale);
  return cloud;
}

/**
 * Builds subtle 3D Cherry Blossom (Sakura) Branch Accents framing the pastel sky backdrop.
 */
function createSakuraBranchAccent(mirror = false): THREE.Group {
  const sakura = new THREE.Group();
  const sign = mirror ? -1 : 1;

  const barkMat = new THREE.MeshStandardMaterial({
    color: 0x6d4c41,
    roughness: 0.82,
    metalness: 0.04,
  });
  const petalPinkMat = new THREE.MeshStandardMaterial({
    color: 0xffb7c5,
    roughness: 0.65,
    metalness: 0.02,
    emissive: 0xffccd5,
    emissiveIntensity: 0.22,
  });
  const petalSoftMat = new THREE.MeshStandardMaterial({
    color: 0xffe4ec,
    roughness: 0.65,
    metalness: 0.02,
    emissive: 0xfff0f5,
    emissiveIntensity: 0.26,
  });
  const stamenMat = new THREE.MeshStandardMaterial({
    color: 0xfde047,
    roughness: 0.5,
  });

  // Curved main bough + sub-twig
  const segments: Array<[number, number, number, number, number, number]> = [
    [0, 0, 0, 1.4, 0.11, 0.35 * sign],
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
    sakura.add(twig);
  }

  const buildBlossomCluster = (bx: number, by: number, bz: number, sc: number) => {
    const flower = new THREE.Group();
    flower.position.set(bx, by, bz);
    const pMat = (Math.abs(bx * 10) | 0) % 2 === 0 ? petalPinkMat : petalSoftMat;

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
    sakura.add(buildBlossomCluster(fx, fy, fz, fsc));
  }

  return sakura;
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
        vec3 finalLinear = mix(pastelSky, nightSky, clamp(uNightFactor, 0.0, 1.0));

        vec3 finalSrgb = pow(max(finalLinear, vec3(0.0)), vec3(1.0 / 2.2));
        gl_FragColor = vec4(finalSrgb, 1.0);
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

  // 3. LEFT & TOP OUTER SIDES: 3D GREEN CASH BILL STACKS + '?' QUESTION-MARK CARD STACK
  const billTopTex = createCashBillTopTexture(maxAnisotropy);
  const billSideTex = createCashBillSideTexture(maxAnisotropy);
  const billTopMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: billTopTex,
    roughness: 0.68,
    metalness: 0.06,
  });
  const billSideMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: billSideTex,
    roughness: 0.72,
    metalness: 0.05,
  });
  const strapWhiteMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.65,
    metalness: 0.05,
  });
  const strapGoldMat = new THREE.MeshStandardMaterial({
    color: 0xfacc15,
    roughness: 0.4,
    metalness: 0.35,
  });

  // In diamond isometric view (camera at +X,+Y,+Z):
  // - Screen Left & Top-Left = negative X (-11.6, z in [-4..+6])
  // - Screen Top & Top-Right = negative Z (x in [-6..+4], -11.6)
  const cashClusterPlacements: Array<[number, number, number, number, number]> = [
    [-11.35, -0.28, 3.85, 0.36, 1.12],
    [-11.45, -0.26, -5.85, -0.24, 1.06],
    [-4.85, -0.26, -11.45, 0.48, 1.1],
    [1.85, -0.26, -11.35, -0.35, 1.06],
  ];

  cashClusterPlacements.forEach(([cx, cy, cz, ry, sc], idx) => {
    const cluster = new THREE.Group();
    cluster.position.set(cx, cy, cz);
    cluster.rotation.y = ry;
    cluster.scale.setScalar(sc);
    cluster.add(createContactShadow(1.5, 0.22));

    const stacks: Array<[number, number, number, number]> = [
      [-0.56, 0, -0.28, 0.08],
      [-0.52, 0, 0.44, -0.06],
      [-0.54, 0.26, 0.08, 0.14],
      [0.52, 0, -0.18, -0.24],
      [0.48, 0.26, -0.14, -0.06],
      [-0.52, 0.52, 0.06, -0.08],
    ];
    for (const [bx, by, bz, bry] of stacks) {
      const b = createCashBundleMesh(billTopMat, billSideMat, strapWhiteMat, strapGoldMat);
      b.position.set(bx, by, bz);
      b.rotation.y = bry;
      cluster.add(b);
    }

    vista.add(cluster);
    animatedProps.push({
      group: cluster,
      baseY: cy,
      phase: idx * 0.85,
    });
  });

  // 3b. 3D Stack of '?' Question-Mark Cards resting outside the Top-Left board edge!
  const outerChanceStack = createOuterQuestionCardStack(maxAnisotropy);
  outerChanceStack.position.set(-10.85, -0.24, -0.85);
  outerChanceStack.rotation.y = Math.PI / 5;
  vista.add(outerChanceStack);
  animatedProps.push({
    group: outerChanceStack,
    baseY: -0.24,
    phase: 1.9,
  });

  // 4. BOTTOM-RIGHT OUTER SIDE: 3D STACKS OF GOLD, SILVER & BRONZE COINS!
  const goldTopTex = createMetallicCoinTopTexture('gold', maxAnisotropy);
  const silverTopTex = createMetallicCoinTopTexture('silver', maxAnisotropy);
  const bronzeTopTex = createMetallicCoinTopTexture('bronze', maxAnisotropy);

  const goldMats: [THREE.Material, THREE.Material, THREE.Material] = [
    new THREE.MeshStandardMaterial({ color: 0xfacc15, roughness: 0.36, metalness: 0.55 }),
    new THREE.MeshStandardMaterial({ color: 0xffffff, map: goldTopTex, roughness: 0.38, metalness: 0.45 }),
    new THREE.MeshStandardMaterial({ color: 0xffffff, map: goldTopTex, roughness: 0.38, metalness: 0.45 }),
  ];
  const silverMats: [THREE.Material, THREE.Material, THREE.Material] = [
    new THREE.MeshStandardMaterial({ color: 0xcbd5e1, roughness: 0.38, metalness: 0.58 }),
    new THREE.MeshStandardMaterial({ color: 0xffffff, map: silverTopTex, roughness: 0.4, metalness: 0.48 }),
    new THREE.MeshStandardMaterial({ color: 0xffffff, map: silverTopTex, roughness: 0.4, metalness: 0.48 }),
  ];
  const bronzeMats: [THREE.Material, THREE.Material, THREE.Material] = [
    new THREE.MeshStandardMaterial({ color: 0xea580c, roughness: 0.44, metalness: 0.5 }),
    new THREE.MeshStandardMaterial({ color: 0xffffff, map: bronzeTopTex, roughness: 0.44, metalness: 0.42 }),
    new THREE.MeshStandardMaterial({ color: 0xffffff, map: bronzeTopTex, roughness: 0.44, metalness: 0.42 }),
  ];

  // In diamond isometric view, Bottom-Right of the board is +X / +Z outer perimeter!
  const coinClusterPlacements: Array<[number, number, number, number, number]> = [
    [11.25, -0.28, 2.65, -0.32, 1.14],
    [11.15, -0.28, -2.95, 0.26, 1.06],
    [3.85, -0.28, 11.25, -0.44, 1.12],
    [9.65, -0.3, 9.25, 0.18, 1.08],
  ];

  coinClusterPlacements.forEach(([cx, cy, cz, ry, sc], idx) => {
    const cluster = new THREE.Group();
    cluster.position.set(cx, cy, cz);
    cluster.rotation.y = ry;
    cluster.scale.setScalar(sc);
    cluster.add(createContactShadow(1.45, 0.22));

    const coins = createMixedCoinTowers(goldMats, silverMats, bronzeMats, [
      [-0.38, 0.14, 11, 'gold'],
      [0.26, 0.3, 8, 'silver'],
      [-0.22, -0.46, 7, 'gold'],
      [0.42, -0.32, 5, 'bronze'],
    ]);
    cluster.add(coins);

    vista.add(cluster);
    animatedProps.push({
      group: cluster,
      baseY: cy,
      phase: idx * 0.92 + 0.4,
    });
  });

  // 5. SUBTLE 3D CHERRY BLOSSOM (SAKURA) BRANCH ACCENTS & PASTEL CLOUDS
  const sakuraLeft = createSakuraBranchAccent(false);
  sakuraLeft.position.set(-14.6, 1.1, -4.2);
  sakuraLeft.rotation.y = 0.55;
  vista.add(sakuraLeft);
  animatedProps.push({ group: sakuraLeft, baseY: 1.1, phase: 0.3 });

  const sakuraTopRight = createSakuraBranchAccent(true);
  sakuraTopRight.position.set(5.4, 1.25, -14.6);
  sakuraTopRight.rotation.y = -0.52;
  vista.add(sakuraTopRight);
  animatedProps.push({ group: sakuraTopRight, baseY: 1.25, phase: 1.6 });

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
