import * as THREE from 'three';
import {
  createBoulevardRoadTexture,
  createCardDeckTopTexture,
  createMonopolyCenterBannerTexture,
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
}

export interface BoulevardCarAnim {
  group: THREE.Group;
  laneRadius: number;
  speed: number;
  phase: number;
  clockwise: boolean;
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

function createSkyscraperWindowEmissiveMap(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const cols = 8;
  const rows = 18;
  const padX = 10;
  const padY = 12;
  const cellW = (canvas.width - padX * 2) / cols;
  const cellH = (canvas.height - padY * 2) / rows;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const hash = (r * 31 + c * 17 + r * c * 7) % 11;
      if (hash <= 6) {
        ctx.fillStyle =
          hash % 3 === 0 ? '#FEF08A' : hash % 4 === 0 ? '#BAE6FD' : '#FBBF24';
        ctx.fillRect(
          padX + c * cellW + 2,
          padY + r * cellH + 2,
          Math.max(4, cellW - 5),
          Math.max(4, cellH - 5)
        );
      }
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

export function createNightLightingPalette(maxAnisotropy = 4): NightLightingPalette {
  const lampHaloTex = createSoftGlowDiscTexture(
    'rgba(254, 240, 138, 0.92)',
    'rgba(245, 158, 11, 0.42)',
    'rgba(245, 158, 11, 0)'
  );
  const skylineEmissiveTex = createSkyscraperWindowEmissiveMap();
  const roadTex = createBoulevardRoadTexture(maxAnisotropy);

  return {
    houseWindowMat: new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      roughness: 0.22,
      metalness: 0.15,
      emissive: 0xfbbf24,
      emissiveIntensity: 0,
    }),
    hotelWindowMat: new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      roughness: 0.16,
      metalness: 0.35,
      emissive: 0xfde047,
      emissiveIntensity: 0,
    }),
    hotelBeaconMat: new THREE.MeshStandardMaterial({
      color: 0xfbbf24,
      roughness: 0.22,
      metalness: 0.68,
      emissive: 0xfef08a,
      emissiveIntensity: 0,
    }),
    skylineTowerMat: new THREE.MeshStandardMaterial({
      color: 0x0ea5e9,
      roughness: 0.18,
      metalness: 0.58,
      emissive: 0xffffff,
      emissiveMap: skylineEmissiveTex,
      emissiveIntensity: 0,
    }),
    cityBuildingWinMat: new THREE.MeshStandardMaterial({
      color: 0xbae6fd,
      roughness: 0.24,
      metalness: 0.2,
      emissive: 0xfde047,
      emissiveIntensity: 0,
    }),
    streetLampBulbMat: new THREE.MeshStandardMaterial({
      color: 0xfef9c3,
      roughness: 0.18,
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
      color: 0xef4444,
      roughness: 0.42,
      emissive: 0xf97316,
      emissiveIntensity: 0,
    }),
    fountainWaterMat: new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      roughness: 0.14,
      metalness: 0.22,
      emissive: 0x0284c7,
      emissiveIntensity: 0,
    }),
    balloonGlowMat: new THREE.MeshStandardMaterial({
      color: 0xf97316,
      roughness: 0.38,
      flatShading: true,
      emissive: 0xfb923c,
      emissiveIntensity: 0,
    }),
    tokenHeadlightMat: new THREE.MeshStandardMaterial({
      color: 0xfef08a,
      roughness: 0.2,
      metalness: 0.3,
      emissive: 0xfde047,
      emissiveIntensity: 0,
    }),
    oceanMat: new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      roughness: 0.22,
      metalness: 0.12,
    }),
    islandMat: new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: roadTex,
      roughness: 0.82,
      metalness: 0.02,
    }),
    lawnMat: new THREE.MeshStandardMaterial({
      color: 0xbfead0,
      roughness: 0.78,
      metalness: 0.02,
    }),
    starMat: new THREE.PointsMaterial({
      color: 0xfef9c3,
      size: 0.62,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0,
      fog: false,
    }),
  };
}

function createContactShadow(radius: number, opacity = 0.38): THREE.Mesh {
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
  grad.addColorStop(0.65, `rgba(15, 23, 42, ${opacity * 0.45})`);
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
 * Builds 4 distinct glossy collectible 3D player tokens (Monopoly GO! enamel figurine look).
 */
export function createPlayerTokenMesh(
  tokenType: 'car' | 'yacht' | 'jet' | 'crown',
  colorHex: string,
  palette?: NightLightingPalette
): THREE.Group {
  const group = new THREE.Group();
  const primaryMat = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(colorHex),
    roughness: 0.24,
    metalness: 0.22,
    clearcoat: 0.75,
    clearcoatRoughness: 0.14,
  });
  const accentGoldMat = new THREE.MeshStandardMaterial({
    color: 0xfbbf24,
    roughness: 0.2,
    metalness: 0.82,
  });
  const glassMat = new THREE.MeshStandardMaterial({
    color: 0x0f172a,
    roughness: 0.12,
    metalness: 0.68,
  });
  const whiteMat = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    roughness: 0.35,
    metalness: 0.08,
    clearcoat: 0.5,
  });
  const darkWheelMat = new THREE.MeshStandardMaterial({
    color: 0x1e293b,
    roughness: 0.8,
    metalness: 0.12,
  });
  const lightAccentMat = palette ? palette.tokenHeadlightMat : accentGoldMat;

  group.add(createContactShadow(0.44, 0.44));

  // Signature Monopoly GO! Pedestal Coin Base under every figurine
  const coinRim = new THREE.Mesh(
    new THREE.CylinderGeometry(0.36, 0.4, 0.07, 20),
    accentGoldMat
  );
  coinRim.position.y = 0.035;
  coinRim.castShadow = true;
  group.add(coinRim);

  const coinTop = new THREE.Mesh(
    new THREE.CylinderGeometry(0.31, 0.31, 0.025, 20),
    whiteMat
  );
  coinTop.position.y = 0.075;
  group.add(coinTop);

  if (tokenType === 'car') {
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.18, 0.76), primaryMat);
    body.position.y = 0.22;
    body.castShadow = true;
    group.add(body);

    const cabin = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.16, 0.38), glassMat);
    cabin.position.set(0, 0.37, -0.03);
    cabin.castShadow = true;
    group.add(cabin);

    const roof = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.045, 0.32), primaryMat);
    roof.position.set(0, 0.46, -0.04);
    group.add(roof);

    const spoiler = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.045, 0.1), accentGoldMat);
    spoiler.position.set(0, 0.36, -0.33);
    group.add(spoiler);

    const hlGeo = new THREE.BoxGeometry(0.1, 0.06, 0.03);
    const hlL = new THREE.Mesh(hlGeo, lightAccentMat);
    hlL.position.set(-0.15, 0.23, 0.39);
    const hlR = new THREE.Mesh(hlGeo, lightAccentMat);
    hlR.position.set(0.15, 0.23, 0.39);
    group.add(hlL, hlR);

    const wheelGeo = new THREE.CylinderGeometry(0.1, 0.1, 0.08, 12);
    wheelGeo.rotateZ(Math.PI / 2);
    for (const [wx, wy, wz] of [
      [-0.25, 0.17, 0.22],
      [0.25, 0.17, 0.22],
      [-0.25, 0.17, -0.22],
      [0.25, 0.17, -0.22],
    ]) {
      const w = new THREE.Mesh(wheelGeo, darkWheelMat);
      w.position.set(wx, wy, wz);
      group.add(w);
    }
  } else if (tokenType === 'yacht') {
    const hull = new THREE.Mesh(new THREE.CylinderGeometry(0.29, 0.18, 0.22, 6), primaryMat);
    hull.scale.set(0.86, 1, 1.58);
    hull.position.y = 0.2;
    hull.castShadow = true;
    group.add(hull);

    const deck = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.15, 0.46), whiteMat);
    deck.position.set(0, 0.37, -0.04);
    deck.castShadow = true;
    group.add(deck);

    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.27, 0.1, 0.24), lightAccentMat);
    visor.position.set(0, 0.48, 0.02);
    group.add(visor);

    const mast = new THREE.Mesh(
      new THREE.CylinderGeometry(0.025, 0.035, 0.24, 8),
      accentGoldMat
    );
    mast.position.set(0, 0.62, -0.05);
    group.add(mast);
  } else if (tokenType === 'jet') {
    const strut = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.065, 0.24, 8), whiteMat);
    strut.position.y = 0.19;
    group.add(strut);

    const fuselage = new THREE.Mesh(new THREE.ConeGeometry(0.15, 0.8, 12), primaryMat);
    fuselage.rotation.x = Math.PI / 2;
    fuselage.position.set(0, 0.35, 0.04);
    fuselage.castShadow = true;
    group.add(fuselage);

    const wings = new THREE.Mesh(new THREE.BoxGeometry(0.76, 0.045, 0.22), primaryMat);
    wings.position.set(0, 0.34, -0.02);
    wings.castShadow = true;
    group.add(wings);

    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.23, 0.18), accentGoldMat);
    tail.position.set(0, 0.46, -0.24);
    group.add(tail);

    const canopy = new THREE.Mesh(new THREE.SphereGeometry(0.092, 10, 8), lightAccentMat);
    canopy.scale.set(0.8, 0.75, 1.6);
    canopy.position.set(0, 0.42, 0.12);
    group.add(canopy);
  } else {
    const cushion = new THREE.Mesh(new THREE.SphereGeometry(0.28, 14, 10), primaryMat);
    cushion.scale.set(1, 0.7, 1);
    cushion.position.y = 0.25;
    cushion.castShadow = true;
    group.add(cushion);

    const band = new THREE.Mesh(
      new THREE.CylinderGeometry(0.28, 0.24, 0.18, 12),
      accentGoldMat
    );
    band.position.y = 0.35;
    band.castShadow = true;
    group.add(band);

    for (let i = 0; i < 5; i++) {
      const angle = (i / 5) * Math.PI * 2;
      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.068, 0.21, 6), accentGoldMat);
      spike.position.set(Math.cos(angle) * 0.21, 0.51, Math.sin(angle) * 0.21);
      group.add(spike);
    }

    const orb = new THREE.Mesh(new THREE.OctahedronGeometry(0.095, 0), lightAccentMat);
    orb.position.y = 0.6;
    group.add(orb);
  }

  return group;
}

/**
 * Glossy 3D Monopoly GO! Emerald Green House (level 1..3) with warm glowing windows at night.
 */
export function createHouseModel(palette?: NightLightingPalette): THREE.Group {
  const group = new THREE.Group();

  const wallMat = new THREE.MeshPhysicalMaterial({
    color: 0xfffbeb,
    roughness: 0.48,
    metalness: 0.02,
    clearcoat: 0.35,
  });
  const roofMat = new THREE.MeshPhysicalMaterial({
    color: 0x10b981,
    roughness: 0.26,
    metalness: 0.12,
    clearcoat: 0.65,
    clearcoatRoughness: 0.16,
  });
  const doorMat = new THREE.MeshStandardMaterial({
    color: 0x92400e,
    roughness: 0.7,
  });
  const winMat =
    palette?.houseWindowMat ||
    new THREE.MeshStandardMaterial({ color: 0x38bdf8, roughness: 0.2 });

  const walls = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.26, 0.34), wallMat);
  walls.position.y = 0.13;
  walls.castShadow = true;
  walls.receiveShadow = true;
  group.add(walls);

  const roof = new THREE.Mesh(new THREE.ConeGeometry(0.32, 0.25, 4), roofMat);
  roof.rotation.y = Math.PI / 4;
  roof.position.y = 0.385;
  roof.castShadow = true;
  group.add(roof);

  const chimney = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.16, 0.075), roofMat);
  chimney.position.set(0.1, 0.41, -0.07);
  group.add(chimney);

  const door = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.14, 0.03), doorMat);
  door.position.set(0, 0.07, 0.172);
  group.add(door);

  const frontWinGeo = new THREE.BoxGeometry(0.075, 0.075, 0.025);
  const fw1 = new THREE.Mesh(frontWinGeo, winMat);
  fw1.position.set(-0.11, 0.16, 0.172);
  const fw2 = new THREE.Mesh(frontWinGeo, winMat);
  fw2.position.set(0.11, 0.16, 0.172);
  const bw1 = new THREE.Mesh(frontWinGeo, winMat);
  bw1.position.set(-0.09, 0.15, -0.172);
  const bw2 = new THREE.Mesh(frontWinGeo, winMat);
  bw2.position.set(0.09, 0.15, -0.172);
  group.add(fw1, fw2, bw1, bw2);

  const sideWinGeo = new THREE.BoxGeometry(0.025, 0.075, 0.11);
  const swL = new THREE.Mesh(sideWinGeo, winMat);
  swL.position.set(-0.182, 0.15, 0);
  const swR = new THREE.Mesh(sideWinGeo, winMat);
  swR.position.set(0.182, 0.15, 0);
  group.add(swL, swR);

  if (palette) {
    const porchGlow = new THREE.Mesh(
      new THREE.PlaneGeometry(0.62, 0.62),
      palette.streetLampHaloMat
    );
    porchGlow.rotation.x = -Math.PI / 2;
    porchGlow.position.y = 0.012;
    group.add(porchGlow);
  }

  return group;
}

/**
 * Grand Glossy 3D Monopoly GO! Crimson & Gold Hotel (level 4).
 */
export function createHotelModel(palette?: NightLightingPalette): THREE.Group {
  const group = new THREE.Group();

  const towerMat = new THREE.MeshPhysicalMaterial({
    color: 0xfffdf7,
    roughness: 0.42,
    metalness: 0.05,
    clearcoat: 0.45,
  });
  const crimsonMat = new THREE.MeshPhysicalMaterial({
    color: 0xef4444,
    roughness: 0.24,
    metalness: 0.18,
    clearcoat: 0.72,
    clearcoatRoughness: 0.15,
  });
  const goldMat = new THREE.MeshStandardMaterial({
    color: 0xf59e0b,
    roughness: 0.22,
    metalness: 0.78,
  });
  const winMat = palette?.hotelWindowMat || goldMat;
  const beaconMat = palette?.hotelBeaconMat || goldMat;

  const plinth = new THREE.Mesh(new THREE.BoxGeometry(0.88, 0.08, 0.5), goldMat);
  plinth.position.y = 0.04;
  plinth.castShadow = true;
  group.add(plinth);

  const centerTower = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.58, 0.4), towerMat);
  centerTower.position.y = 0.37;
  centerTower.castShadow = true;
  centerTower.receiveShadow = true;
  group.add(centerTower);

  const mainWinBandGeo = new THREE.BoxGeometry(0.33, 0.065, 0.42);
  for (const wy of [0.22, 0.37, 0.52]) {
    const band = new THREE.Mesh(mainWinBandGeo, winMat);
    band.position.y = wy;
    group.add(band);
  }

  const wingGeo = new THREE.BoxGeometry(0.21, 0.39, 0.34);
  const leftWing = new THREE.Mesh(wingGeo, towerMat);
  leftWing.position.set(-0.31, 0.275, 0);
  leftWing.castShadow = true;
  group.add(leftWing);

  const rightWing = new THREE.Mesh(wingGeo, towerMat);
  rightWing.position.set(0.31, 0.275, 0);
  rightWing.castShadow = true;
  group.add(rightWing);

  const wingWinGeo = new THREE.BoxGeometry(0.13, 0.06, 0.36);
  for (const wy of [0.2, 0.34]) {
    const lw = new THREE.Mesh(wingWinGeo, winMat);
    lw.position.set(-0.31, wy, 0);
    const rw = new THREE.Mesh(wingWinGeo, winMat);
    rw.position.set(0.31, wy, 0);
    group.add(lw, rw);
  }

  const mainRoof = new THREE.Mesh(new THREE.ConeGeometry(0.39, 0.29, 4), crimsonMat);
  mainRoof.rotation.y = Math.PI / 4;
  mainRoof.position.y = 0.8;
  mainRoof.castShadow = true;
  group.add(mainRoof);

  const wingCapGeo = new THREE.BoxGeometry(0.23, 0.06, 0.36);
  const leftCap = new THREE.Mesh(wingCapGeo, crimsonMat);
  leftCap.position.set(-0.31, 0.5, 0);
  group.add(leftCap);

  const rightCap = new THREE.Mesh(wingCapGeo, crimsonMat);
  rightCap.position.set(0.31, 0.5, 0);
  group.add(rightCap);

  const spire = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.05, 0.18, 8), goldMat);
  spire.position.y = 0.98;
  group.add(spire);

  const crownBeacon = new THREE.Mesh(new THREE.SphereGeometry(0.058, 8, 8), beaconMat);
  crownBeacon.position.y = 1.09;
  group.add(crownBeacon);

  if (palette) {
    const hotelHalo = new THREE.Mesh(
      new THREE.PlaneGeometry(1.25, 0.95),
      palette.streetLampHaloMat
    );
    hotelHalo.rotation.x = -Math.PI / 2;
    hotelHalo.position.y = 0.014;
    group.add(hotelHalo);
  }

  return group;
}

/**
 * Miniature Boulevard Bollard Lamp placed on inner promenade corners of city tiles.
 */
export function createBoulevardBollardLamp(palette: NightLightingPalette): THREE.Group {
  const g = new THREE.Group();
  const brassMat = new THREE.MeshStandardMaterial({
    color: 0xd97706,
    roughness: 0.35,
    metalness: 0.72,
  });

  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.042, 0.17, 6), brassMat);
  post.position.y = 0.085;
  g.add(post);

  const globe = new THREE.Mesh(
    new THREE.SphereGeometry(0.068, 8, 8),
    palette.streetLampBulbMat
  );
  globe.position.y = 0.21;
  g.add(globe);

  const curbHalo = new THREE.Mesh(
    new THREE.PlaneGeometry(0.5, 0.5),
    palette.streetLampHaloMat
  );
  curbHalo.rotation.x = -Math.PI / 2;
  curbHalo.position.y = 0.012;
  g.add(curbHalo);

  return g;
}

/**
 * Composite 5-part Vintage Park Streetlamp.
 */
function createCourtyardStreetLamp(
  palette: NightLightingPalette,
  armAngleY = 0
): THREE.Group {
  const lamp = new THREE.Group();
  const ironMat = new THREE.MeshStandardMaterial({
    color: 0x1e293b,
    roughness: 0.42,
    metalness: 0.68,
  });
  const brassMat = new THREE.MeshStandardMaterial({
    color: 0xd97706,
    roughness: 0.3,
    metalness: 0.75,
  });

  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.125, 0.13, 8), ironMat);
  base.position.y = 0.065;
  base.castShadow = true;
  lamp.add(base);

  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.052, 0.92, 8), ironMat);
  pole.position.y = 0.59;
  pole.castShadow = true;
  lamp.add(pole);

  const head = new THREE.Group();
  head.position.y = 1.04;
  head.rotation.y = armAngleY;

  const arm = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.032, 0.032), brassMat);
  arm.position.set(0.1, 0.02, 0);
  head.add(arm);

  const shade = new THREE.Mesh(new THREE.ConeGeometry(0.125, 0.085, 6), ironMat);
  shade.position.set(0.21, 0.02, 0);
  head.add(shade);

  const bulb = new THREE.Mesh(
    new THREE.SphereGeometry(0.1, 10, 8),
    palette.streetLampBulbMat
  );
  bulb.position.set(0.21, -0.05, 0);
  head.add(bulb);

  lamp.add(head);

  const halo = new THREE.Mesh(
    new THREE.PlaneGeometry(1.75, 1.75),
    palette.streetLampHaloMat
  );
  halo.rotation.x = -Math.PI / 2;
  halo.position.set(Math.cos(armAngleY) * 0.2, 0.024, -Math.sin(armAngleY) * 0.2);
  lamp.add(halo);

  return lamp;
}

/**
 * Soft rounded Monopoly GO-style stylized tree (lush layered canopy spheres + trunk).
 */
function createRoundedParkTree(scale = 1, tintHex = 0x22c55e): THREE.Group {
  const tree = new THREE.Group();
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x78350f, roughness: 0.85 });
  const leafMat = new THREE.MeshStandardMaterial({
    color: tintHex,
    roughness: 0.58,
  });

  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.075, 0.125, 0.54, 8),
    trunkMat
  );
  trunk.position.y = 0.27;
  trunk.castShadow = true;
  tree.add(trunk);

  const c1 = new THREE.Mesh(new THREE.SphereGeometry(0.42, 12, 10), leafMat);
  c1.position.set(0, 0.76, 0);
  c1.castShadow = true;
  tree.add(c1);

  const c2 = new THREE.Mesh(new THREE.SphereGeometry(0.3, 10, 8), leafMat);
  c2.position.set(0.22, 0.64, 0.14);
  c2.castShadow = true;
  tree.add(c2);

  const c3 = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 8), leafMat);
  c3.position.set(-0.2, 0.92, -0.1);
  c3.castShadow = true;
  tree.add(c3);

  tree.scale.setScalar(scale);
  return tree;
}

/**
 * 3D Card Stack (Chance / Community Chest) placed on the classic Monopoly diagonal slots.
 */
function createCardDeckMesh(
  deckType: 'CHANCE' | 'CHEST',
  maxAnisotropy: number
): THREE.Group {
  const g = new THREE.Group();
  const cardSideMat = new THREE.MeshStandardMaterial({
    color: 0xf8fafc,
    roughness: 0.65,
  });
  const topTex = createCardDeckTopTexture(deckType, maxAnisotropy);
  const topMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: topTex,
    roughness: 0.42,
  });

  // Dashed gold slot frame on the mint court
  const slotBorder = new THREE.Mesh(
    new THREE.BoxGeometry(1.56, 0.015, 1.02),
    new THREE.MeshStandardMaterial({
      color: deckType === 'CHANCE' ? 0xf59e0b : 0x0284c7,
      roughness: 0.5,
    })
  );
  slotBorder.position.y = 0.008;
  g.add(slotBorder);

  const deckGeo = new THREE.BoxGeometry(1.42, 0.13, 0.88);
  const deckMesh = new THREE.Mesh(deckGeo, [
    cardSideMat,
    cardSideMat,
    topMat,
    cardSideMat,
    cardSideMat,
    cardSideMat,
  ]);
  deckMesh.position.y = 0.075;
  deckMesh.castShadow = true;
  deckMesh.receiveShadow = true;
  g.add(deckMesh);

  return g;
}

export interface CourtyardAnimatedRefs {
  fountainRing: THREE.Mesh;
  fountainJet: THREE.Group;
  balloonGroup: THREE.Group;
}

/**
 * Builds the MONOPOLY GO! inspired central courtyard diorama inside [-5.66, +5.66]:
 * - Classic Monopoly Mint-Sage Court + Gold Art-Deco Frame
 * - Iconic Diagonal Red & Gold "CỜ TỶ PHÚ VIỆT NAM" 3D Centerpiece Plaque (dice bounce right over it!)
 * - 3D Chance (Cơ Hội) & Community Chest (Khí Vận) Card Decks
 * - 4 Vietnamese Landmarks: Lotus Fountain, Landmark 81 & Bitexco, One Pillar Pagoda, Golden Bridge + Festive Striped Balloon
 */
export function createCourtyardDiorama(
  palette: NightLightingPalette,
  maxAnisotropy = 4
): {
  group: THREE.Group;
  animated: CourtyardAnimatedRefs;
} {
  const group = new THREE.Group();

  // Classic Monopoly Mint-Sage Center Court filling [-5.66, +5.66]
  const lawnGeo = new THREE.BoxGeometry(11.32, 0.24, 11.32);
  const lawn = new THREE.Mesh(lawnGeo, palette.lawnMat);
  lawn.position.y = 0.12;
  lawn.receiveShadow = true;
  group.add(lawn);

  // Crisp White & Brushed-Gold Inner Promenade Frame around the court perimeter
  const frameWhiteMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.55,
  });
  const goldMat = new THREE.MeshStandardMaterial({
    color: 0xf59e0b,
    roughness: 0.26,
    metalness: 0.72,
  });

  const innerPromenade = new THREE.Mesh(
    new THREE.RingGeometry(5.18, 5.52, 4),
    frameWhiteMat
  );
  innerPromenade.rotation.x = -Math.PI / 2;
  innerPromenade.rotation.z = Math.PI / 4;
  innerPromenade.position.y = 0.246;
  group.add(innerPromenade);

  // Classic Monopoly thin emerald-and-gold inner pinstripe frame on the mint court
  const innerGoldLine = new THREE.Mesh(
    new THREE.RingGeometry(5.06, 5.16, 4),
    goldMat
  );
  innerGoldLine.rotation.x = -Math.PI / 2;
  innerGoldLine.rotation.z = Math.PI / 4;
  innerGoldLine.position.y = 0.247;
  group.add(innerGoldLine);

  // --- ICONIC HORIZONTAL "CỜ TỶ PHÚ VIỆT NAM" 3D CENTERPIECE BANNER (matches monopolygo.com!) ---
  const bannerGroup = new THREE.Group();
  bannerGroup.position.set(-0.22, 0.25, -0.22);
  bannerGroup.rotation.y = Math.PI / 4;

  const goldBasePlaque = new THREE.Mesh(
    new THREE.BoxGeometry(5.55, 0.045, 2.08),
    goldMat
  );
  goldBasePlaque.position.y = 0.022;
  goldBasePlaque.receiveShadow = true;
  bannerGroup.add(goldBasePlaque);

  const bannerTex = createMonopolyCenterBannerTexture(maxAnisotropy);
  const bannerTopMat = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    map: bannerTex,
    roughness: 0.32,
    metalness: 0.05,
    clearcoat: 0.55,
  });
  const crimsonEdgeMat = new THREE.MeshStandardMaterial({
    color: 0x991b1b,
    roughness: 0.45,
  });
  const bannerPlaque = new THREE.Mesh(
    new THREE.BoxGeometry(5.38, 0.035, 1.94),
    [
      crimsonEdgeMat,
      crimsonEdgeMat,
      bannerTopMat,
      crimsonEdgeMat,
      crimsonEdgeMat,
      crimsonEdgeMat,
    ]
  );
  bannerPlaque.position.y = 0.052;
  bannerPlaque.receiveShadow = true;
  bannerGroup.add(bannerPlaque);
  group.add(bannerGroup);

  // --- 3D CHANCE (CƠ HỘI) & COMMUNITY CHEST (KHÍ VẬN) CARD DECKS ---
  const chestDeck = createCardDeckMesh('CHEST', maxAnisotropy);
  chestDeck.position.set(-2.02, 0.25, -2.02);
  chestDeck.rotation.y = Math.PI / 4;
  group.add(chestDeck);

  const chanceDeck = createCardDeckMesh('CHANCE', maxAnisotropy);
  chanceDeck.position.set(-0.62, 0.25, 2.08);
  chanceDeck.rotation.y = Math.PI / 4;
  group.add(chanceDeck);

  // --- 8 Vintage Park Streetlamps along walkways ---
  const streetLampSpecs: Array<[number, number, number]> = [
    [-4.35, -0.62, -Math.PI / 2],
    [-2.55, 0.62, Math.PI / 2],
    [2.55, -0.62, -Math.PI / 2],
    [4.35, 0.62, Math.PI / 2],
    [-0.62, -4.35, 0],
    [0.62, -2.55, Math.PI],
    [-0.62, 2.55, 0],
    [0.62, 4.35, Math.PI],
  ];
  for (const [lx, lz, rotY] of streetLampSpecs) {
    const lamp = createCourtyardStreetLamp(palette, rotY);
    lamp.position.set(lx, 0.25, lz);
    group.add(lamp);
  }

  // --- Quadrant 1 (NW: -3.85, -3.85): Illuminated Emerald & Gold Lotus Fountain ---
  const fountainGroup = new THREE.Group();
  fountainGroup.position.set(-3.85, 0.25, -3.85);

  const stoneMat = new THREE.MeshStandardMaterial({ color: 0xfffdf7, roughness: 0.55 });

  const basin = new THREE.Mesh(new THREE.CylinderGeometry(1.24, 1.34, 0.28, 16), stoneMat);
  basin.position.y = 0.14;
  basin.castShadow = true;
  basin.receiveShadow = true;
  fountainGroup.add(basin);

  const basinGoldRim = new THREE.Mesh(
    new THREE.TorusGeometry(1.25, 0.045, 8, 24),
    goldMat
  );
  basinGoldRim.rotation.x = Math.PI / 2;
  basinGoldRim.position.y = 0.28;
  fountainGroup.add(basinGoldRim);

  const waterPool = new THREE.Mesh(
    new THREE.CylinderGeometry(1.12, 1.12, 0.06, 16),
    palette.fountainWaterMat
  );
  waterPool.position.y = 0.26;
  fountainGroup.add(waterPool);

  const fountainRing = new THREE.Mesh(
    new THREE.RingGeometry(0.45, 0.58, 24),
    new THREE.MeshBasicMaterial({
      color: 0xe0f2fe,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.75,
    })
  );
  fountainRing.rotation.x = -Math.PI / 2;
  fountainRing.position.y = 0.305;
  fountainGroup.add(fountainRing);

  const tier1 = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.32, 0.55, 12), stoneMat);
  tier1.position.y = 0.52;
  tier1.castShadow = true;
  fountainGroup.add(tier1);

  const tierBowl = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.24, 0.16, 12), stoneMat);
  tierBowl.position.y = 0.82;
  tierBowl.castShadow = true;
  fountainGroup.add(tierBowl);

  const lotusTop = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.23, 0),
    palette.hotelBeaconMat
  );
  lotusTop.position.y = 1.09;
  lotusTop.castShadow = true;
  fountainGroup.add(lotusTop);

  const fountainJet = new THREE.Group();
  fountainJet.position.y = 1.15;
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const drop = new THREE.Mesh(
      new THREE.SphereGeometry(0.07, 8, 8),
      palette.fountainWaterMat
    );
    drop.position.set(Math.cos(a) * 0.28, 0.12, Math.sin(a) * 0.28);
    fountainJet.add(drop);
  }
  fountainGroup.add(fountainJet);
  group.add(fountainGroup);

  // --- Quadrant 2 (NE: +3.85, -3.85): Landmark 81 & Bitexco Skyline ---
  const skylineGroup = new THREE.Group();
  skylineGroup.position.set(3.85, 0.25, -3.85);

  const silverTrimMat = new THREE.MeshStandardMaterial({
    color: 0xf8fafc,
    roughness: 0.3,
    metalness: 0.55,
  });

  const plaza = new THREE.Mesh(new THREE.CylinderGeometry(1.32, 1.38, 0.08, 16), stoneMat);
  plaza.position.y = 0.04;
  plaza.receiveShadow = true;
  skylineGroup.add(plaza);

  const t1 = new THREE.Mesh(
    new THREE.BoxGeometry(0.76, 1.12, 0.76),
    palette.skylineTowerMat
  );
  t1.position.set(-0.18, 0.6, -0.14);
  t1.castShadow = true;
  skylineGroup.add(t1);

  const t2 = new THREE.Mesh(
    new THREE.BoxGeometry(0.54, 0.86, 0.54),
    palette.skylineTowerMat
  );
  t2.position.set(-0.18, 1.56, -0.14);
  t2.castShadow = true;
  skylineGroup.add(t2);

  const t3 = new THREE.Mesh(
    new THREE.BoxGeometry(0.34, 0.68, 0.34),
    palette.skylineTowerMat
  );
  t3.position.set(-0.18, 2.28, -0.14);
  t3.castShadow = true;
  skylineGroup.add(t3);

  const spire = new THREE.Mesh(
    new THREE.CylinderGeometry(0.02, 0.05, 0.56, 8),
    palette.hotelBeaconMat
  );
  spire.position.set(-0.18, 2.86, -0.14);
  skylineGroup.add(spire);

  const spireBeacon = new THREE.Mesh(
    new THREE.SphereGeometry(0.065, 8, 8),
    palette.lanternSilkMat
  );
  spireBeacon.position.set(-0.18, 3.16, -0.14);
  skylineGroup.add(spireBeacon);

  const bitexco = new THREE.Mesh(
    new THREE.CylinderGeometry(0.24, 0.36, 1.56, 14),
    palette.skylineTowerMat
  );
  bitexco.position.set(0.6, 0.82, 0.38);
  bitexco.castShadow = true;
  skylineGroup.add(bitexco);

  const helipad = new THREE.Mesh(
    new THREE.CylinderGeometry(0.24, 0.24, 0.06, 14),
    silverTrimMat
  );
  helipad.position.set(0.82, 1.24, 0.38);
  skylineGroup.add(helipad);

  const helipadRing = new THREE.Mesh(
    new THREE.RingGeometry(0.13, 0.19, 16),
    palette.hotelBeaconMat
  );
  helipadRing.rotation.x = -Math.PI / 2;
  helipadRing.position.set(0.82, 1.275, 0.38);
  skylineGroup.add(helipadRing);

  group.add(skylineGroup);

  // --- Quadrant 3 (SE: +3.85, +3.85): Chùa Một Cột & Hồ Sen Hồng ---
  const heritageGroup = new THREE.Group();
  heritageGroup.position.set(3.85, 0.25, 3.85);

  const lotusPond = new THREE.Mesh(new THREE.BoxGeometry(2.15, 0.13, 2.15), stoneMat);
  lotusPond.position.y = 0.065;
  lotusPond.receiveShadow = true;
  heritageGroup.add(lotusPond);

  const pondWater = new THREE.Mesh(
    new THREE.BoxGeometry(1.88, 0.05, 1.88),
    palette.fountainWaterMat
  );
  pondWater.position.y = 0.115;
  heritageGroup.add(pondWater);

  // Floating green lily pads & pink lotus blossoms
  const padMat = new THREE.MeshStandardMaterial({ color: 0x16a34a, roughness: 0.65 });
  const pinkLotusMat = new THREE.MeshStandardMaterial({ color: 0xf472b6, roughness: 0.45 });
  for (const [lx, lz] of [
    [-0.58, -0.52],
    [0.62, -0.48],
    [-0.52, 0.62],
    [0.56, 0.58],
  ]) {
    const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.02, 10), padMat);
    pad.position.set(lx, 0.145, lz);
    heritageGroup.add(pad);
    const flower = new THREE.Mesh(new THREE.SphereGeometry(0.065, 8, 6), pinkLotusMat);
    flower.position.set(lx, 0.18, lz);
    heritageGroup.add(flower);
  }

  const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 0.62, 10), stoneMat);
  pillar.position.y = 0.42;
  pillar.castShadow = true;
  heritageGroup.add(pillar);

  const redWoodMat = new THREE.MeshPhysicalMaterial({
    color: 0xdc2626,
    roughness: 0.36,
    clearcoat: 0.45,
  });
  const templeBody = new THREE.Mesh(new THREE.BoxGeometry(0.94, 0.44, 0.94), redWoodMat);
  templeBody.position.y = 0.92;
  templeBody.castShadow = true;
  heritageGroup.add(templeBody);

  const sancWinA = new THREE.Mesh(
    new THREE.BoxGeometry(0.46, 0.22, 0.97),
    palette.houseWindowMat
  );
  sancWinA.position.y = 0.92;
  const sancWinB = new THREE.Mesh(
    new THREE.BoxGeometry(0.97, 0.22, 0.46),
    palette.houseWindowMat
  );
  sancWinB.position.y = 0.92;
  heritageGroup.add(sancWinA, sancWinB);

  const templeRoof1 = new THREE.Mesh(new THREE.ConeGeometry(0.94, 0.38, 4), redWoodMat);
  templeRoof1.rotation.y = Math.PI / 4;
  templeRoof1.position.y = 1.32;
  templeRoof1.castShadow = true;
  heritageGroup.add(templeRoof1);

  for (const [ex, ez] of [
    [0.56, 0.56],
    [-0.56, 0.56],
    [0.56, -0.56],
    [-0.56, -0.56],
  ]) {
    const lantern = new THREE.Mesh(
      new THREE.SphereGeometry(0.082, 8, 8),
      palette.lanternSilkMat
    );
    lantern.scale.set(1, 1.25, 1);
    lantern.position.set(ex, 1.07, ez);
    heritageGroup.add(lantern);
  }

  const templeRoof2 = new THREE.Mesh(new THREE.ConeGeometry(0.62, 0.32, 4), goldMat);
  templeRoof2.rotation.y = Math.PI / 4;
  templeRoof2.position.y = 1.62;
  templeRoof2.castShadow = true;
  heritageGroup.add(templeRoof2);

  group.add(heritageGroup);

  // --- Quadrant 4 (SW: -3.85, +3.85): Đà Nẵng Golden Arch Landmark & Lush Park Grove ---
  const swParkGroup = new THREE.Group();
  swParkGroup.position.set(-3.85, 0.25, 3.85);

  const goldenArch = new THREE.Mesh(
    new THREE.TorusGeometry(0.95, 0.085, 10, 24, Math.PI),
    goldMat
  );
  goldenArch.rotation.y = Math.PI / 4;
  goldenArch.position.set(0, 0.05, 0);
  goldenArch.castShadow = true;
  swParkGroup.add(goldenArch);

  const archPillarGeo = new THREE.CylinderGeometry(0.11, 0.14, 0.55, 8);
  const ap1 = new THREE.Mesh(archPillarGeo, stoneMat);
  ap1.position.set(-0.48, 0.27, -0.48);
  const ap2 = new THREE.Mesh(archPillarGeo, stoneMat);
  ap2.position.set(0.48, 0.27, 0.48);
  swParkGroup.add(ap1, ap2);
  group.add(swParkGroup);

  const treeSpecs: Array<[number, number, number, number]> = [
    [-4.65, 3.15, 0.98, 0x16a34a],
    [-3.1, 4.65, 0.92, 0x22c55e],
    [-4.65, 4.65, 1.12, 0x15803d],
    [-4.85, -2.15, 0.84, 0x22c55e],
    [-2.15, -4.85, 0.86, 0x84cc16],
    [2.2, -4.85, 0.82, 0x16a34a],
    [4.85, 2.2, 0.86, 0x22c55e],
    [2.3, 4.85, 0.8, 0xf59e0b],
  ];
  for (const [tx, tz, sc, tint] of treeSpecs) {
    const t = createRoundedParkTree(sc, tint);
    t.position.set(tx, 0.24, tz);
    group.add(t);
  }

  // Festive Monopoly GO! Striped Hot Air Balloon
  const balloonGroup = new THREE.Group();
  balloonGroup.position.set(-4.1, 3.65, -4.1);
  const envelope = new THREE.Mesh(
    new THREE.SphereGeometry(0.54, 16, 12),
    palette.balloonGlowMat
  );
  envelope.scale.set(1, 1.24, 1);
  envelope.castShadow = true;
  balloonGroup.add(envelope);

  const belt = new THREE.Mesh(
    new THREE.TorusGeometry(0.52, 0.065, 8, 20),
    palette.hotelBeaconMat
  );
  belt.rotation.x = Math.PI / 2;
  balloonGroup.add(belt);

  const topStripe = new THREE.Mesh(
    new THREE.TorusGeometry(0.38, 0.045, 8, 20),
    frameWhiteMat
  );
  topStripe.rotation.x = Math.PI / 2;
  topStripe.position.y = 0.34;
  balloonGroup.add(topStripe);

  const burnerFlame = new THREE.Mesh(
    new THREE.SphereGeometry(0.09, 8, 8),
    palette.streetLampBulbMat
  );
  burnerFlame.position.y = -0.58;
  balloonGroup.add(burnerFlame);

  const basketMat = new THREE.MeshStandardMaterial({ color: 0x92400e, roughness: 0.65 });
  const basket = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.2, 0.24), basketMat);
  basket.position.y = -0.82;
  balloonGroup.add(basket);

  group.add(balloonGroup);

  return {
    group,
    animated: {
      fountainRing,
      fountainJet,
      balloonGroup,
    },
  };
}

/**
 * Helper: Builds a colorful Vietnamese shop-house / mid-rise city building for the surrounding blocks.
 */
function createCityBlockBuilding(
  w: number,
  h: number,
  d: number,
  wallHex: number,
  roofHex: number,
  palette: NightLightingPalette
): THREE.Group {
  const b = new THREE.Group();
  const wallMat = new THREE.MeshStandardMaterial({
    color: wallHex,
    roughness: 0.62,
  });
  const roofMat = new THREE.MeshStandardMaterial({
    color: roofHex,
    roughness: 0.45,
  });

  const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wallMat);
  body.position.y = h / 2;
  body.castShadow = true;
  body.receiveShadow = true;
  b.add(body);

  // Roof cornice & pitched or stepped cap
  const cornice = new THREE.Mesh(
    new THREE.BoxGeometry(w + 0.18, 0.14, d + 0.18),
    roofMat
  );
  cornice.position.y = h + 0.07;
  b.add(cornice);

  const roofTop = new THREE.Mesh(
    new THREE.ConeGeometry(Math.min(w, d) * 0.62, 0.55, 4),
    roofMat
  );
  roofTop.rotation.y = Math.PI / 4;
  roofTop.position.y = h + 0.41;
  b.add(roofTop);

  // Horizontal window bands that illuminate warmly at night
  const floors = Math.max(2, Math.floor(h / 0.85));
  for (let f = 0; f < floors; f++) {
    const wy = 0.52 + f * 0.78;
    if (wy < h - 0.25) {
      const winBand = new THREE.Mesh(
        new THREE.BoxGeometry(w * 0.76, 0.24, d + 0.04),
        palette.cityBuildingWinMat
      );
      winBand.position.y = wy;
      b.add(winBand);

      const winBandSide = new THREE.Mesh(
        new THREE.BoxGeometry(w + 0.04, 0.24, d * 0.76),
        palette.cityBuildingWinMat
      );
      winBandSide.position.y = wy;
      b.add(winBandSide);
    }
  }

  return b;
}

/**
 * Helper: Miniature yellow taxi / city vehicle cruising the boulevard outside the board.
 */
function createMiniatureCityVehicle(
  bodyHex: number,
  palette: NightLightingPalette
): THREE.Group {
  const car = new THREE.Group();
  const bodyMat = new THREE.MeshPhysicalMaterial({
    color: bodyHex,
    roughness: 0.28,
    clearcoat: 0.65,
  });
  const cabinMat = new THREE.MeshStandardMaterial({
    color: 0x1e293b,
    roughness: 0.2,
    metalness: 0.5,
  });
  const wheelMat = new THREE.MeshStandardMaterial({
    color: 0x0f172a,
    roughness: 0.75,
  });

  const lower = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.24, 1.24), bodyMat);
  lower.position.y = 0.22;
  lower.castShadow = true;
  car.add(lower);

  const upper = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.22, 0.64), cabinMat);
  upper.position.set(0, 0.43, -0.05);
  car.add(upper);

  // Taxi roof light sign for yellow cabs
  if (bodyHex === 0xfacc15) {
    const sign = new THREE.Mesh(
      new THREE.BoxGeometry(0.24, 0.08, 0.12),
      palette.streetLampBulbMat
    );
    sign.position.set(0, 0.58, -0.04);
    car.add(sign);
  }

  const wheelGeo = new THREE.CylinderGeometry(0.13, 0.13, 0.1, 10);
  wheelGeo.rotateZ(Math.PI / 2);
  for (const [wx, wz] of [
    [-0.34, 0.38],
    [0.34, 0.38],
    [-0.34, -0.38],
    [0.34, -0.38],
  ]) {
    const wh = new THREE.Mesh(wheelGeo, wheelMat);
    wh.position.set(wx, 0.13, wz);
    car.add(wh);
  }

  const hlGeo = new THREE.BoxGeometry(0.14, 0.08, 0.04);
  const hl1 = new THREE.Mesh(hlGeo, palette.tokenHeadlightMat);
  hl1.position.set(-0.19, 0.24, 0.63);
  const hl2 = new THREE.Mesh(hlGeo, palette.tokenHeadlightMat);
  hl2.position.set(0.19, 0.24, 0.63);
  car.add(hl1, hl2);

  return car;
}

/**
 * MONOPOLY GO! Surrounding 3D Living Vietnamese City Diorama, Ivory-Gold Board Plinth,
 * Cruising Boulevard Vehicles, Canal Park, Harbor Yachts & Starry Night Sky Dome.
 */
export function createSurroundingVista(
  woodBumpMap: THREE.Texture,
  palette: NightLightingPalette
): {
  vista: THREE.Group;
  animatedCars: BoulevardCarAnim[];
} {
  const vista = new THREE.Group();

  // 1. Luxury Warm Alabaster & Brushed Royal-Gold Board Plinth (replaces dark muddy brown!)
  const ivoryPlinthMat = new THREE.MeshStandardMaterial({
    color: 0xfffbeb,
    roughness: 0.46,
    metalness: 0.06,
    bumpMap: woodBumpMap,
    bumpScale: 0.008,
  });
  const goldTrimMat = new THREE.MeshStandardMaterial({
    color: 0xf59e0b,
    roughness: 0.25,
    metalness: 0.76,
  });
  const emeraldBaseMat = new THREE.MeshStandardMaterial({
    color: 0x059669,
    roughness: 0.52,
    metalness: 0.1,
  });

  const upperCurb = new THREE.Mesh(
    new THREE.BoxGeometry(17.46, 0.28, 17.46),
    ivoryPlinthMat
  );
  upperCurb.position.y = -0.11;
  upperCurb.receiveShadow = true;
  upperCurb.castShadow = true;
  vista.add(upperCurb);

  const goldBelt = new THREE.Mesh(
    new THREE.BoxGeometry(17.78, 0.12, 17.78),
    goldTrimMat
  );
  goldBelt.position.y = -0.29;
  goldBelt.receiveShadow = true;
  vista.add(goldBelt);

  const lowerTerrace = new THREE.Mesh(
    new THREE.BoxGeometry(18.24, 0.22, 18.24),
    emeraldBaseMat
  );
  lowerTerrace.position.y = -0.44;
  lowerTerrace.receiveShadow = true;
  vista.add(lowerTerrace);

  // 2. Surrounding City Island Platform with 4-Way Boulevard, Sidewalks & Crosswalks [-34, +34]
  const cityGround = new THREE.Mesh(
    new THREE.BoxGeometry(68, 0.4, 68),
    palette.islandMat
  );
  cityGround.position.y = -0.74;
  cityGround.receiveShadow = true;
  vista.add(cityGround);

  // Outer Turquoise Sea & Ha Long Horizon beyond the city island
  const ocean = new THREE.Mesh(new THREE.CircleGeometry(105, 40), palette.oceanMat);
  ocean.rotation.x = -Math.PI / 2;
  ocean.position.y = -0.92;
  ocean.receiveShadow = true;
  vista.add(ocean);

  // 3. Eight Surrounding MONOPOLY GO! City & Canal-Park Blocks right outside the ring boulevard!
  // --- WEST EDGE BLOCK (x = -16..-21, z = -7..+7 — prominently visible on LEFT of screen!) ---
  const cityBuildings: Array<[number, number, number, number, number, number, number]> = [
    // West Avenue Shop-houses & Mid-Rises (Left of screen)
    [-16.4, -5.8, 2.3, 3.2, 2.3, 0xfbbf24, 0xb91c1c],
    [-16.5, -1.8, 2.4, 4.3, 2.4, 0x38bdf8, 0x0369a1],
    [-16.4, 2.4, 2.3, 2.9, 2.3, 0xfb923c, 0x9a3412],
    [-16.5, 6.2, 2.4, 3.7, 2.4, 0x34d399, 0x065f46],
    [-20.2, -3.8, 2.8, 5.1, 2.8, 0xfef3c7, 0xdc2626],
    [-20.2, 0.8, 2.7, 4.6, 2.7, 0xe0f2fe, 0x1d4ed8],
    [-20.0, 5.0, 2.6, 3.9, 2.6, 0xfde047, 0xb45309],
    // North Avenue Towers (Top-Left & Top-Right behind crosswalks)
    [-5.8, -16.4, 2.4, 3.6, 2.4, 0xfca5a5, 0x991b1b],
    [-1.8, -16.5, 2.5, 4.5, 2.5, 0xfef08a, 0xb45309],
    [2.4, -16.4, 2.4, 3.4, 2.4, 0x7dd3fc, 0x0284c7],
    [6.2, -16.5, 2.5, 4.2, 2.5, 0xa7f3d0, 0x047857],
    // NW & NE Outer Corner Accent Towers
    [-16.8, -16.6, 2.8, 4.8, 2.8, 0xfbbf24, 0xb91c1c],
    [21.2, -5.4, 2.7, 4.8, 2.7, 0xe0f2fe, 0x0369a1],
    [21.2, 4.8, 2.7, 4.2, 2.7, 0xfef3c7, 0xdc2626],
    // South Foreground Low Boutique Pavilions (Bottom-Left & Bottom-Right edges)
    [-6.2, 16.4, 2.2, 2.3, 2.2, 0xfde68a, 0xd97706],
    [6.2, 16.4, 2.2, 2.3, 2.2, 0xbae6fd, 0x0284c7],
  ];
  for (const [bx, bz, bw, bh, bd, wallHex, roofHex] of cityBuildings) {
    const bMesh = createCityBlockBuilding(bw, bh, bd, wallHex, roofHex, palette);
    bMesh.position.set(bx, -0.54, bz);
    vista.add(bMesh);
  }

  // --- EAST EDGE BLOCK (x = +15.5..+20.5, z = -7.5..+7.5 — Scenic Canal Park & Footbridge on RIGHT of screen!) ---
  const canalBorder = new THREE.Mesh(
    new THREE.BoxGeometry(2.6, 0.06, 15.2),
    ivoryPlinthMat
  );
  canalBorder.position.set(17.6, -0.52, 0);
  vista.add(canalBorder);

  const canalWater = new THREE.Mesh(
    new THREE.BoxGeometry(2.1, 0.09, 14.8),
    palette.fountainWaterMat
  );
  canalWater.position.set(17.6, -0.49, 0);
  vista.add(canalWater);

  // Charming arched park footbridge over the turquoise canal
  const bridgeDeck = new THREE.Mesh(
    new THREE.BoxGeometry(3.2, 0.18, 1.85),
    ivoryPlinthMat
  );
  bridgeDeck.position.set(17.6, -0.32, -0.4);
  bridgeDeck.castShadow = true;
  vista.add(bridgeDeck);

  const bridgeRailMat = goldTrimMat;
  for (const rz of [-1.22, 0.42]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.22, 0.08), bridgeRailMat);
    rail.position.set(17.6, -0.16, rz);
    vista.add(rail);
  }

  // Winding park footpath through the East Canal Park
  const parkPath = new THREE.Mesh(
    new THREE.BoxGeometry(5.6, 0.04, 1.2),
    new THREE.MeshStandardMaterial({ color: 0xfde68a, roughness: 0.78 })
  );
  parkPath.position.set(17.5, -0.51, -0.4);
  vista.add(parkPath);

  // --- SOUTH HARBOR POND & SAILBOAT (z = +16.8, x = -2.2..+2.2) ---
  const marinaLagoon = new THREE.Mesh(
    new THREE.CylinderGeometry(3.1, 3.1, 0.08, 24),
    palette.fountainWaterMat
  );
  marinaLagoon.position.set(-1.8, -0.5, 17.6);
  vista.add(marinaLagoon);

  const boat = new THREE.Group();
  const hull = new THREE.Mesh(
    new THREE.CylinderGeometry(0.42, 0.26, 0.24, 6),
    ivoryPlinthMat
  );
  hull.scale.set(0.75, 1, 1.7);
  boat.add(hull);
  const sail = new THREE.Mesh(
    new THREE.ConeGeometry(0.4, 1.1, 3),
    new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.5 })
  );
  sail.position.y = 0.65;
  boat.add(sail);
  boat.position.set(-1.8, -0.37, 17.4);
  boat.rotation.y = 0.6;
  vista.add(boat);

  // Lush Avenue & City Park Trees framing West, East, North & South blocks (emerald, lime & golden-autumn hues)
  const outerTreeSpots: Array<[number, number, number, number]> = [
    // East Canal Park trees (Right of screen)
    [15.4, -6.2, 1.25, 0x22c55e],
    [15.5, -3.0, 1.18, 0xf59e0b],
    [15.5, 2.2, 1.28, 0x16a34a],
    [15.4, 5.8, 1.2, 0x84cc16],
    [19.5, -2.6, 1.35, 0x15803d],
    [19.5, 2.4, 1.3, 0xeab308],
    [16.2, -15.6, 1.3, 0x22c55e],
    [15.6, 15.6, 1.25, 0x16a34a],
    // West Old Quarter sidewalk trees (Left of screen)
    [-14.9, -3.8, 1.05, 0x22c55e],
    [-14.9, 0.4, 1.08, 0xf59e0b],
    [-14.9, 4.2, 1.05, 0x16a34a],
    [-15.6, 15.4, 1.28, 0x22c55e],
    [-18.2, 15.8, 1.22, 0x84cc16],
    [-15.4, -15.2, 1.18, 0x22c55e],
    // North & South Park trees
    [-3.8, -14.9, 1.08, 0x22c55e],
    [0.5, -14.9, 1.12, 0xeab308],
    [4.3, -14.9, 1.08, 0x16a34a],
    [2.4, 16.2, 1.18, 0x22c55e],
    [-4.2, 15.4, 1.12, 0x10b981],
  ];
  for (const [tx, tz, sc, hex] of outerTreeSpots) {
    const tr = createRoundedParkTree(sc, hex);
    tr.position.set(tx, -0.54, tz);
    vista.add(tr);
  }

  // Boulevard Streetlamps along outer sidewalks
  for (const [lx, lz, lRot] of [
    [-14.1, -6.5, 0],
    [-14.1, 6.5, 0],
    [14.1, -6.5, Math.PI],
    [14.1, 6.5, Math.PI],
    [-6.5, -14.1, -Math.PI / 2],
    [6.5, -14.1, -Math.PI / 2],
    [-6.5, 14.1, Math.PI / 2],
    [6.5, 14.1, Math.PI / 2],
  ]) {
    const bLamp = createCourtyardStreetLamp(palette, lRot);
    bLamp.position.set(lx, -0.54, lz);
    bLamp.scale.setScalar(1.18);
    vista.add(bLamp);
  }

  // 4. Cruising Miniature City Vehicles along the Ring Boulevard (Yellow Taxis, Red & Sky Cars)
  const carSpecs: Array<{
    color: number;
    laneRadius: number;
    speed: number;
    phase: number;
    clockwise: boolean;
  }> = [
    { color: 0xfacc15, laneRadius: 10.35, speed: 0.055, phase: 0.08, clockwise: true },
    { color: 0xfacc15, laneRadius: 10.35, speed: 0.055, phase: 0.58, clockwise: true },
    { color: 0x38bdf8, laneRadius: 12.25, speed: 0.046, phase: 0.32, clockwise: false },
    { color: 0xef4444, laneRadius: 12.25, speed: 0.046, phase: 0.82, clockwise: false },
  ];
  const animatedCars: BoulevardCarAnim[] = carSpecs.map((spec) => {
    const carGroup = createMiniatureCityVehicle(spec.color, palette);
    carGroup.position.set(spec.laneRadius, -0.54, 0);
    vista.add(carGroup);
    return {
      group: carGroup,
      laneRadius: spec.laneRadius,
      speed: spec.speed,
      phase: spec.phase,
      clockwise: spec.clockwise,
    };
  });

  // 5. Starry Night Sky Dome (fades in smoothly as nightFactor -> 1)
  const starCount = 220;
  const starPositions = new Float32Array(starCount * 3);
  for (let i = 0; i < starCount; i++) {
    const theta = (i * 2.399963) % (Math.PI * 2);
    const elevation = 0.18 + ((i * 0.618034) % 0.75);
    const radius = 68 + (i % 7) * 2.5;
    const horiz = Math.cos(elevation * (Math.PI / 2)) * radius;
    starPositions[i * 3] = Math.cos(theta) * horiz;
    starPositions[i * 3 + 1] = 6 + Math.sin(elevation * (Math.PI / 2)) * 38;
    starPositions[i * 3 + 2] = Math.sin(theta) * horiz;
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
  const stars = new THREE.Points(starGeo, palette.starMat);
  vista.add(stars);

  return { vista, animatedCars };
}
