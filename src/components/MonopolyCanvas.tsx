import React, { useEffect, useImperativeHandle, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { BOARD_TILES } from '../game/boardData';
import {
  computeCinematicCameraPose,
  computeDayNightLightingState,
  DICE_BOX_FACE_VALUES,
  getDiceFaceBaseEuler,
  getTileTransform,
  getTokenSlotOffset,
} from '../game/rules';
import { PlayerState, PropertyState, TileKind } from '../game/types';
import {
  BoulevardCarAnim,
  createBoulevardBollardLamp,
  createCourtyardDiorama,
  createHotelModel,
  createHouseModel,
  createNightLightingPalette,
  createPlayerTokenMesh,
  createSurroundingVista,
} from '../three/models';
import {
  createDiceFaceMaterials,
  createTileTopTexture,
  createWoodGrainBumpMap,
} from '../three/textures';

export interface MonopolyCanvasHandle {
  animateDiceRoll: (die1: number, die2: number, speedMultiplier: number) => Promise<void>;
  animateTokenPath: (
    playerId: number,
    tilePath: number[],
    speedMultiplier: number,
    onStep?: (stepIdx: number, tileIdx: number) => void
  ) => Promise<void>;
  resetCamera: () => void;
}

interface MonopolyCanvasProps {
  players: PlayerState[];
  properties: Record<number, PropertyState>;
  selectedTileIndex: number | null;
  activePlayerId: number | null;
  cinematicCamera: boolean;
  nightMode: boolean;
  onSelectTile: (tileIndex: number) => void;
}

interface TileVisualEntry {
  index: number;
  group: THREE.Group;
  hitMesh: THREE.Mesh;
  ownerStrip: THREE.Mesh | null;
  ownerMat: THREE.MeshStandardMaterial | null;
  houses: THREE.Group[];
  hotel: THREE.Group | null;
  displayedLevel: number;
  popTimers: number[]; // 0..1 progress for houses[0..2] and [3]=hotel
  baseY: number;
  targetLift: number;
}

interface ActiveDiceAnim {
  elapsed: number;
  duration: number;
  startPos1: THREE.Vector3;
  endPos1: THREE.Vector3;
  targetQuat1: THREE.Quaternion;
  spinAxis1: THREE.Vector3;
  startPos2: THREE.Vector3;
  endPos2: THREE.Vector3;
  targetQuat2: THREE.Quaternion;
  spinAxis2: THREE.Vector3;
  resolve: () => void;
}

interface ActiveHopAnim {
  playerId: number;
  path: number[];
  stepIndex: number;
  stepElapsed: number;
  stepDuration: number;
  fromVec: THREE.Vector3;
  toVec: THREE.Vector3;
  onStep?: (stepIdx: number, tileIdx: number) => void;
  resolve: () => void;
}

const DEFAULT_CAM_POS = new THREE.Vector3(18.0, 19.2, 18.0);
const DEFAULT_CAM_TARGET = new THREE.Vector3(0.55, -0.95, 0.55);
const WORLD_UP = new THREE.Vector3(0, 1, 0);
const TILE_SURFACE_Y = 0.28;
const DICE_REST_Y = 0.625;

// Pre-allocated scratch math objects (zero per-frame GC)
const _scratchQuatSpin = new THREE.Quaternion();
const _scratchEuler = new THREE.Euler();
const _scratchVecTarget = new THREE.Vector3();
const _scratchVecPos = new THREE.Vector3();
const _scratchUnitScale = new THREE.Vector3(1, 1, 1);
const _daySunPos = new THREE.Vector3(15, 25, 13);
const _nightMoonPos = new THREE.Vector3(-12, 23, 14);
const _dayOceanColor = new THREE.Color(0x38bdf8);
const _nightOceanColor = new THREE.Color(0x06152d);
const _dayIslandColor = new THREE.Color(0xffffff);
const _nightIslandColor = new THREE.Color(0x3b4d6b);
const _dayLawnColor = new THREE.Color(0xbfead0);
const _nightLawnColor = new THREE.Color(0x1e3f3b);

function updateBoulevardCar(car: BoulevardCarAnim, elapsed: number): void {
  const r = car.laneRadius;
  const cornerR = 1.4;
  const straightLen = 2 * (r - cornerR);
  const arcLen = 0.5 * Math.PI * cornerR;
  const sideLen = straightLen + arcLen;
  const perimeter = 4 * sideLen;

  const dirSign = car.clockwise ? 1 : -1;
  const u = (((car.phase + dirSign * elapsed * car.speed) % 1) + 1) % 1;
  const dist = u * perimeter;
  const q = Math.floor(dist / sideLen) % 4;
  const rem = dist - q * sideLen;

  let lx = 0;
  let lz = 0;
  let tx = 0;
  let tz = 0;
  if (rem < straightLen) {
    lx = -(r - cornerR) + rem;
    lz = -r;
    tx = 1;
    tz = 0;
  } else {
    const ang = (rem - straightLen) / cornerR;
    lx = r - cornerR + Math.sin(ang) * cornerR;
    lz = -(r - cornerR) - Math.cos(ang) * cornerR;
    tx = Math.cos(ang);
    tz = Math.sin(ang);
  }

  for (let i = 0; i < q; i++) {
    const nx = -lz;
    const nz = lx;
    lx = nx;
    lz = nz;
    const ntx = -tz;
    const ntz = tx;
    tx = ntx;
    tz = ntz;
  }

  if (!car.clockwise) {
    tx = -tx;
    tz = -tz;
  }

  car.group.position.set(lx, -0.54, lz);
  car.group.rotation.y = Math.atan2(tx, tz);
}

function bounceHeight(t: number): number {
  // 3 physical bounces decaying to 0 at t = 1
  if (t < 0.45) {
    const u = t / 0.45;
    return (1 - u * u) * 2.55;
  }
  if (t < 0.76) {
    const u = (t - 0.45) / 0.31;
    return Math.sin(u * Math.PI) * 0.92;
  }
  if (t < 0.94) {
    const u = (t - 0.76) / 0.18;
    return Math.sin(u * Math.PI) * 0.28;
  }
  return 0;
}

function springPopScale(progress: number): number {
  if (progress <= 0) return 0.001;
  if (progress >= 1) return 1;
  // Overshoot curve peaking ~1.18 around p=0.65
  return 1 + Math.sin(progress * Math.PI * 1.4) * 0.24 * (1 - progress) - Math.pow(1 - progress, 3);
}

export const MonopolyCanvas = React.forwardRef<MonopolyCanvasHandle, MonopolyCanvasProps>(
  (
    {
      players,
      properties,
      selectedTileIndex,
      activePlayerId,
      cinematicCamera,
      nightMode,
      onSelectTile,
    },
    ref
  ) => {
    const mountRef = useRef<HTMLDivElement | null>(null);

    // Keep latest React props in refs so WebGL scene mounts strictly ONCE
    const onSelectTileRef = useRef(onSelectTile);
    onSelectTileRef.current = onSelectTile;

    const playersRef = useRef(players);
    playersRef.current = players;

    const propertiesRef = useRef(properties);
    propertiesRef.current = properties;

    const selectedTileRef = useRef(selectedTileIndex);
    selectedTileRef.current = selectedTileIndex;

    const activePlayerIdRef = useRef(activePlayerId);
    activePlayerIdRef.current = activePlayerId;

    const prevCinematicRef = useRef(cinematicCamera);
    const cinematicCameraRef = useRef(cinematicCamera);
    cinematicCameraRef.current = cinematicCamera;

    const nightModeRef = useRef(nightMode);
    nightModeRef.current = nightMode;

    // Scene imperative stores
    const tileEntriesRef = useRef<TileVisualEntry[]>([]);
    const tokenGroupsRef = useRef<Map<number, THREE.Group>>(new Map());
    const diceMeshesRef = useRef<[THREE.Mesh, THREE.Mesh] | null>(null);
    const activeDiceAnimRef = useRef<ActiveDiceAnim | null>(null);
    const activeHopAnimRef = useRef<ActiveHopAnim | null>(null);
    const cameraResetActiveRef = useRef<boolean>(false);
    const manualOrbitOverrideRef = useRef<boolean>(false);
    const activeRingRef = useRef<THREE.Mesh | null>(null);

    // When toggling Cinematic Camera OFF, smoothly return to the full isometric overview
    useEffect(() => {
      if (prevCinematicRef.current && !cinematicCamera) {
        cameraResetActiveRef.current = true;
        manualOrbitOverrideRef.current = false;
      } else if (!prevCinematicRef.current && cinematicCamera) {
        cameraResetActiveRef.current = false;
        manualOrbitOverrideRef.current = false;
      }
      prevCinematicRef.current = cinematicCamera;
    }, [cinematicCamera]);

    const computeTokenRestWorldPos = (
      playerId: number,
      tileIdx: number,
      allPlayers: PlayerState[]
    ): THREE.Vector3 => {
      const tf = getTileTransform(tileIdx);
      const coLocated = allPlayers
        .filter((p) => !p.bankrupt && p.position === tileIdx)
        .sort((a, b) => a.id - b.id);
      const slotIdx = Math.max(
        0,
        coLocated.findIndex((p) => p.id === playerId)
      );
      const { dx, dz } = getTokenSlotOffset(slotIdx, coLocated.length, tf.isCorner);
      return new THREE.Vector3(tf.x + dx, TILE_SURFACE_Y, tf.z + dz);
    };

    useImperativeHandle(ref, () => ({
      resetCamera: () => {
        cameraResetActiveRef.current = true;
        manualOrbitOverrideRef.current = false;
      },
      animateDiceRoll: (die1: number, die2: number, speedMultiplier: number) => {
        manualOrbitOverrideRef.current = false;
        return new Promise<void>((resolve) => {
          const dice = diceMeshesRef.current;
          if (!dice) {
            resolve();
            return;
          }

          const buildTargetQuat = (val: number) => {
            const [rx, ry, rz] = getDiceFaceBaseEuler(val);
            _scratchEuler.set(rx, ry, rz, 'XYZ');
            const qBase = new THREE.Quaternion().setFromEuler(_scratchEuler);
            const qYaw = new THREE.Quaternion().setFromAxisAngle(
              WORLD_UP,
              (Math.random() - 0.5) * Math.PI * 1.6
            );
            return qYaw.multiply(qBase);
          };

          const angleOffset = (Math.random() - 0.5) * 0.45;
          const endPos1 = new THREE.Vector3(
            0.86 + Math.sin(angleOffset) * 0.16,
            DICE_REST_Y,
            1.52 + Math.cos(angleOffset) * 0.12
          );
          const endPos2 = new THREE.Vector3(
            1.62 - Math.sin(angleOffset) * 0.16,
            DICE_REST_Y,
            0.88 - Math.cos(angleOffset) * 0.12
          );

          activeDiceAnimRef.current = {
            elapsed: 0,
            duration: Math.max(0.42, 0.86 / speedMultiplier),
            startPos1: new THREE.Vector3(0.25, DICE_REST_Y, 2.35),
            endPos1,
            targetQuat1: buildTargetQuat(die1),
            spinAxis1: new THREE.Vector3(1, 0.7, 0.4).normalize(),
            startPos2: new THREE.Vector3(2.35, DICE_REST_Y, 0.25),
            endPos2,
            targetQuat2: buildTargetQuat(die2),
            spinAxis2: new THREE.Vector3(-0.8, 0.6, 1).normalize(),
            resolve,
          };
        });
      },
      animateTokenPath: (
        playerId: number,
        tilePath: number[],
        speedMultiplier: number,
        onStep?: (stepIdx: number, tileIdx: number) => void
      ) => {
        manualOrbitOverrideRef.current = false;
        return new Promise<void>((resolve) => {
          const token = tokenGroupsRef.current.get(playerId);
          if (!token || tilePath.length === 0) {
            resolve();
            return;
          }

          const firstTargetTf = getTileTransform(tilePath[0]);
          activeHopAnimRef.current = {
            playerId,
            path: tilePath,
            stepIndex: 0,
            stepElapsed: 0,
            stepDuration: Math.max(0.11, 0.22 / speedMultiplier),
            fromVec: token.position.clone(),
            toVec: new THREE.Vector3(firstTargetTf.x, TILE_SURFACE_Y, firstTargetTf.z),
            onStep,
            resolve,
          };
        });
      },
    }));

    // Mount WebGLRenderer & Three.js Scene ONCE
    useEffect(() => {
      const container = mountRef.current;
      if (!container) return;

      const isSoftwareGl = (() => {
        const probeCanvas = document.createElement('canvas');
        const gl = probeCanvas.getContext('webgl2');
        if (!gl) return true;
        const ext = gl.getExtension('WEBGL_debug_renderer_info');
        const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
        const gpu = String(gl.getParameter(param));
        gl.getExtension('WEBGL_lose_context')?.loseContext();
        return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
      })();

      const width = container.clientWidth || window.innerWidth;
      const height = container.clientHeight || window.innerHeight;

      const scene = new THREE.Scene();
      const skyColor = 0xdceefb;
      scene.background = new THREE.Color(skyColor);
      scene.fog = new THREE.Fog(skyColor, 34, 88);

      const camera = new THREE.PerspectiveCamera(38, width / height, 0.5, 130);
      camera.position.copy(DEFAULT_CAM_POS);
      camera.lookAt(DEFAULT_CAM_TARGET);

      const renderer = new THREE.WebGLRenderer({
        antialias: !isSoftwareGl,
        powerPreference: 'high-performance',
      });
      renderer.setSize(width, height);
      renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 0.96;
      renderer.shadowMap.enabled = !isSoftwareGl;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;

      container.innerHTML = '';
      container.appendChild(renderer.domElement);

      // Context loss safety
      const handleContextLost = (e: Event) => {
        e.preventDefault();
      };
      renderer.domElement.addEventListener('webglcontextlost', handleContextLost);

      // Studio environment reflections (PMREM RoomEnvironment) calibrated to avoid white glare
      const pmremGenerator = new THREE.PMREMGenerator(renderer);
      const envRT = pmremGenerator.fromScene(new RoomEnvironment(), 0.04);
      scene.environment = envRT.texture;
      scene.environmentIntensity = 0.42;
      pmremGenerator.dispose();

      // Balanced warm/cool lighting rig (single shadow-casting sun light)
      const hemiLight = new THREE.HemisphereLight(0xe0f2fe, 0xfde68a, 0.56);
      hemiLight.position.set(0, 30, 0);
      scene.add(hemiLight);

      const sunLight = new THREE.DirectionalLight(0xfff7ed, 1.12);
      sunLight.position.set(14, 24, 12);
      sunLight.castShadow = !isSoftwareGl;
      sunLight.shadow.mapSize.width = 1024;
      sunLight.shadow.mapSize.height = 1024;
      const shadowD = 12.5;
      sunLight.shadow.camera.left = -shadowD;
      sunLight.shadow.camera.right = shadowD;
      sunLight.shadow.camera.top = shadowD;
      sunLight.shadow.camera.bottom = -shadowD;
      sunLight.shadow.camera.near = 4;
      sunLight.shadow.camera.far = 48;
      sunLight.shadow.bias = -0.0005;
      sunLight.shadow.normalBias = 0.02;
      scene.add(sunLight);

      const rimLight = new THREE.DirectionalLight(0xbae6fd, 0.45);
      rimLight.position.set(-14, 12, -14);
      scene.add(rimLight);

      // OrbitControls (supports left/right drag orbit & pinch/wheel zoom)
      const controls = new OrbitControls(camera, renderer.domElement);
      controls.target.copy(DEFAULT_CAM_TARGET);
      controls.enableDamping = !isSoftwareGl;
      controls.dampingFactor = 0.07;
      controls.minDistance = 8.2;
      controls.maxDistance = 33;
      controls.minPolarAngle = 0.32;
      controls.maxPolarAngle = Math.PI / 2.28;
      controls.mouseButtons = {
        LEFT: THREE.MOUSE.ROTATE,
        MIDDLE: THREE.MOUSE.DOLLY,
        RIGHT: THREE.MOUSE.ROTATE,
      };
      controls.addEventListener('start', () => {
        cameraResetActiveRef.current = false;
        manualOrbitOverrideRef.current = true;
      });
      controls.update();

      const maxAniso = renderer.capabilities.getMaxAnisotropy();
      const woodBump = createWoodGrainBumpMap();
      const nightPalette = createNightLightingPalette(maxAniso);

      // Surrounding MONOPOLY GO! living city vista + boulevard cars + ivory-gold board plinth + starfield
      const { vista: vistaGroup, animatedCars } = createSurroundingVista(woodBump, nightPalette);
      scene.add(vistaGroup);

      // Central courtyard Monopoly mint-sage court + diagonal 3D logo plaque + card decks + landmarks
      const { group: courtyardGroup, animated: courtyardAnim } =
        createCourtyardDiorama(nightPalette, maxAniso);
      scene.add(courtyardGroup);

      // 4 Warm Unshadowed PointLights over central island streetlamps & landmarks (active at night)
      const courtyardLampSpots: Array<[number, number, number]> = [
        [-3.25, 1.9, -3.25],
        [3.25, 2.25, -3.25],
        [3.25, 1.95, 3.25],
        [-3.25, 1.85, 3.25],
      ];
      const courtyardPointLights: THREE.PointLight[] = courtyardLampSpots.map(
        ([px, py, pz]) => {
          const pl = new THREE.PointLight(0xffb347, 0, 14.0, 1.45);
          pl.position.set(px, py, pz);
          pl.visible = false;
          scene.add(pl);
          return pl;
        }
      );

      // Build all 28 3D Board Tiles with warm alabaster-white side bevels
      const sideBodyMat = new THREE.MeshStandardMaterial({
        color: 0xf8fafc,
        roughness: 0.52,
        metalness: 0.04,
      });

      const tileEntries: TileVisualEntry[] = [];
      const clickableMeshes: THREE.Mesh[] = [];

      for (const tile of BOARD_TILES) {
        const tf = getTileTransform(tile.index);
        const tileGroup = new THREE.Group();
        tileGroup.position.set(tf.x, 0, tf.z);
        tileGroup.rotation.y = tf.rotationY;

        const topTex = createTileTopTexture(tile, maxAniso);
        const topMat = new THREE.MeshStandardMaterial({
          color: 0xffffff,
          map: topTex,
          roughness: 0.78,
          metalness: 0.0,
        });

        const tileGeo = new THREE.BoxGeometry(tf.width - 0.05, TILE_SURFACE_Y, tf.depth - 0.05);
        const mats = [
          sideBodyMat,
          sideBodyMat,
          topMat,
          sideBodyMat,
          sideBodyMat,
          sideBodyMat,
        ];
        const tileMesh = new THREE.Mesh(tileGeo, mats);
        tileMesh.position.y = TILE_SURFACE_Y / 2;
        tileMesh.receiveShadow = true;
        tileMesh.castShadow = true;
        tileMesh.userData.tileIndex = tile.index;
        tileGroup.add(tileMesh);
        clickableMeshes.push(tileMesh);

        // Ownership indicator rim along outer edge (+Z in local tile space)
        let ownerStrip: THREE.Mesh | null = null;
        let ownerMat: THREE.MeshStandardMaterial | null = null;
        const isOwnable =
          tile.kind === TileKind.PROPERTY ||
          tile.kind === TileKind.TRANSPORT ||
          tile.kind === TileKind.UTILITY;

        if (isOwnable) {
          ownerMat = new THREE.MeshStandardMaterial({
            color: 0xcbd5e1,
            roughness: 0.4,
            metalness: 0.18,
          });
          ownerStrip = new THREE.Mesh(
            new THREE.BoxGeometry(tf.width - 0.12, 0.09, 0.16),
            ownerMat
          );
          ownerStrip.position.set(0, TILE_SURFACE_Y + 0.025, tf.depth / 2 - 0.11);
          ownerStrip.visible = false;
          tileGroup.add(ownerStrip);
        }

        // Pre-instantiate 3 Green Houses + 1 Grand Hotel + 2 Boulevard Curb Lamps on PROPERTY tiles
        const houses: THREE.Group[] = [];
        let hotel: THREE.Group | null = null;
        if (tile.kind === TileKind.PROPERTY) {
          // Subtle inner promenade bollard lamps so the board perimeter glows warmly at night
          for (const bx of [-tf.width / 2 + 0.16, tf.width / 2 - 0.16]) {
            const bollard = createBoulevardBollardLamp(nightPalette);
            bollard.position.set(bx, TILE_SURFACE_Y, -tf.depth / 2 + 0.14);
            tileGroup.add(bollard);
          }

          const houseXs = [-0.54, 0, 0.54];
          const bandZ = -tf.depth / 2 + 0.36; // sits cleanly on inner color band
          for (let hIdx = 0; hIdx < 3; hIdx++) {
            const hModel = createHouseModel(nightPalette);
            hModel.position.set(houseXs[hIdx], TILE_SURFACE_Y, bandZ);
            hModel.scale.setScalar(0.001);
            hModel.visible = false;
            tileGroup.add(hModel);
            houses.push(hModel);
          }

          hotel = createHotelModel(nightPalette);
          hotel.position.set(0, TILE_SURFACE_Y, bandZ);
          hotel.scale.setScalar(0.001);
          hotel.visible = false;
          tileGroup.add(hotel);
        }

        scene.add(tileGroup);
        tileEntries.push({
          index: tile.index,
          group: tileGroup,
          hitMesh: tileMesh,
          ownerStrip,
          ownerMat,
          houses,
          hotel,
          displayedLevel: 0,
          popTimers: [0, 0, 0, 0],
          baseY: 0,
          targetLift: 0,
        });
      }
      tileEntriesRef.current = tileEntries;

      // Active player ground halo ring
      const activeRingGeo = new THREE.RingGeometry(0.42, 0.54, 24);
      activeRingGeo.rotateX(-Math.PI / 2);
      const activeRingMat = new THREE.MeshBasicMaterial({
        color: 0xfbbf24,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.85,
      });
      const activeRing = new THREE.Mesh(activeRingGeo, activeRingMat);
      activeRing.position.y = TILE_SURFACE_Y + 0.022;
      activeRing.visible = false;
      scene.add(activeRing);
      activeRingRef.current = activeRing;

      // 2 Physical Glossy Pearl-Ivory 3D Dice resting right in front of the CỜ TỶ PHÚ banner
      const diceGeo = new THREE.BoxGeometry(0.75, 0.75, 0.75);
      const diceMats1 = createDiceFaceMaterials(DICE_BOX_FACE_VALUES, maxAniso);
      const diceMats2 = createDiceFaceMaterials(DICE_BOX_FACE_VALUES, maxAniso);
      const dieMesh1 = new THREE.Mesh(diceGeo, diceMats1);
      const dieMesh2 = new THREE.Mesh(diceGeo, diceMats2);
      dieMesh1.castShadow = true;
      dieMesh2.castShadow = true;
      dieMesh1.position.set(0.86, DICE_REST_Y, 1.52);
      dieMesh2.position.set(1.62, DICE_REST_Y, 0.88);
      scene.add(dieMesh1);
      scene.add(dieMesh2);
      diceMeshesRef.current = [dieMesh1, dieMesh2];

      if (!isSoftwareGl) {
        renderer.compile(scene, camera);
      }

      // Raycasting interaction (click vs drag)
      const raycaster = new THREE.Raycaster();
      const pointerNDC = new THREE.Vector2();
      let downX = 0;
      let downY = 0;
      let hoveredTileIdx: number | null = null;
      let lastMoveCheck = 0;

      const updateNDC = (clientX: number, clientY: number) => {
        const rect = renderer.domElement.getBoundingClientRect();
        pointerNDC.x = ((clientX - rect.left) / rect.width) * 2 - 1;
        pointerNDC.y = -((clientY - rect.top) / rect.height) * 2 + 1;
      };

      const onPointerDown = (e: PointerEvent) => {
        downX = e.clientX;
        downY = e.clientY;
      };

      const onPointerUp = (e: PointerEvent) => {
        const dist = Math.hypot(e.clientX - downX, e.clientY - downY);
        if (dist > 6 || e.button !== 0) return;

        updateNDC(e.clientX, e.clientY);
        raycaster.setFromCamera(pointerNDC, camera);
        const hits = raycaster.intersectObjects(clickableMeshes, false);
        if (hits.length > 0) {
          const tIdx = hits[0].object.userData.tileIndex;
          if (typeof tIdx === 'number') {
            onSelectTileRef.current(tIdx);
          }
        }
      };

      const onPointerMove = (e: PointerEvent) => {
        const now = performance.now();
        if (now - lastMoveCheck < 50) return;
        lastMoveCheck = now;

        updateNDC(e.clientX, e.clientY);
        raycaster.setFromCamera(pointerNDC, camera);
        const hits = raycaster.intersectObjects(clickableMeshes, false);
        if (hits.length > 0) {
          const tIdx = hits[0].object.userData.tileIndex;
          hoveredTileIdx = typeof tIdx === 'number' ? tIdx : null;
          renderer.domElement.style.cursor = 'pointer';
        } else {
          hoveredTileIdx = null;
          renderer.domElement.style.cursor = 'grab';
        }
      };

      renderer.domElement.addEventListener('pointerdown', onPointerDown);
      renderer.domElement.addEventListener('pointerup', onPointerUp);
      renderer.domElement.addEventListener('pointermove', onPointerMove);

      // Resize observer
      const handleResize = () => {
        if (!container) return;
        const w = container.clientWidth || window.innerWidth;
        const h = container.clientHeight || window.innerHeight;
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h);
      };
      const resizeObserver = new ResizeObserver(handleResize);
      resizeObserver.observe(container);
      window.addEventListener('resize', handleResize);

      // Paced Render Loop (software-WebGL safe via afterDraw, zero deprecated Clock)
      let frameId = 0;
      let disposed = false;
      let lastTimeMs = performance.now();
      let elapsedSec = 0;

      const afterDraw = (cb: () => void) => {
        const gl = renderer.getContext() as WebGL2RenderingContext;
        const sync = gl.fenceSync ? gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0) : null;
        gl.flush();
        const poll = () => {
          if (disposed) return;
          const state = sync ? gl.getSyncParameter(sync, gl.SYNC_STATUS) : gl.SIGNALED;
          if (state === gl.UNSIGNALED) {
            frameId = window.setTimeout(poll, 5);
          } else {
            if (sync) gl.deleteSync(sync);
            frameId = window.setTimeout(cb, 80);
          }
        };
        frameId = window.setTimeout(poll, 5);
      };

      let currentNightFactor = nightModeRef.current ? 1 : 0;
      // Force initial lighting application on frame 1
      let appliedNightSnapshot = -1;

      const syncSceneFromState = (simDt: number, animDt: number, elapsed: number) => {
        const currentPlayers = playersRef.current;
        const currentProps = propertiesRef.current;
        const selectedIdx = selectedTileRef.current;

        // 0. Smooth Day / Night lighting & architectural emissive transition (uses real-time animDt)
        const targetNight = nightModeRef.current ? 1 : 0;
        const nightStepAlpha = 1 - Math.exp(-3.8 * animDt);
        currentNightFactor = THREE.MathUtils.lerp(
          currentNightFactor,
          targetNight,
          nightStepAlpha
        );
        if (Math.abs(targetNight - currentNightFactor) < 0.002) {
          currentNightFactor = targetNight;
        }

        const lightState = computeDayNightLightingState(currentNightFactor);
        if (Math.abs(appliedNightSnapshot - currentNightFactor) > 0.0005) {
          appliedNightSnapshot = currentNightFactor;
          (scene.background as THREE.Color).setHex(lightState.skyHex);
          if (scene.fog) {
            scene.fog.color.setHex(lightState.skyHex);
          }
          hemiLight.color.setHex(lightState.hemiSkyHex);
          hemiLight.groundColor.setHex(lightState.hemiGroundHex);
          hemiLight.intensity = lightState.hemiIntensity;

          sunLight.color.setHex(lightState.keyLightHex);
          sunLight.intensity = lightState.keyLightIntensity;
          sunLight.position.lerpVectors(_daySunPos, _nightMoonPos, currentNightFactor);

          rimLight.intensity = lightState.rimLightIntensity;
          scene.environmentIntensity = lightState.envIntensity;
          renderer.toneMappingExposure = lightState.exposure;

          nightPalette.oceanMat.color
            .copy(_dayOceanColor)
            .lerp(_nightOceanColor, currentNightFactor);
          nightPalette.islandMat.color
            .copy(_dayIslandColor)
            .lerp(_nightIslandColor, currentNightFactor);
          nightPalette.lawnMat.color
            .copy(_dayLawnColor)
            .lerp(_nightLawnColor, currentNightFactor);
          nightPalette.starMat.opacity = lightState.starOpacity;
          nightPalette.streetLampHaloMat.opacity = currentNightFactor * 0.85;

          const lampsActive = currentNightFactor > 0.01;
          for (const pl of courtyardPointLights) {
            pl.visible = lampsActive;
            pl.intensity = lightState.courtyardPointLightIntensity;
          }
        }

        if (currentNightFactor > 0.005) {
          const gentleShimmer = 0.94 + Math.sin(elapsed * 2.7) * 0.06;
          nightPalette.houseWindowMat.emissiveIntensity =
            lightState.windowEmissiveIntensity * gentleShimmer;
          nightPalette.hotelWindowMat.emissiveIntensity =
            lightState.windowEmissiveIntensity * 1.12;
          nightPalette.hotelBeaconMat.emissiveIntensity =
            lightState.windowEmissiveIntensity * (0.92 + Math.sin(elapsed * 4.2) * 0.16);
          nightPalette.skylineTowerMat.emissiveIntensity =
            lightState.windowEmissiveIntensity * 1.15;
          nightPalette.cityBuildingWinMat.emissiveIntensity =
            lightState.windowEmissiveIntensity * 0.95;
          nightPalette.streetLampBulbMat.emissiveIntensity =
            lightState.lampBulbEmissiveIntensity;
          nightPalette.lanternSilkMat.emissiveIntensity =
            lightState.lampBulbEmissiveIntensity * (0.92 + Math.sin(elapsed * 3.1) * 0.08);
          nightPalette.fountainWaterMat.emissiveIntensity = currentNightFactor * 0.72;
          nightPalette.balloonGlowMat.emissiveIntensity =
            currentNightFactor * (0.85 + Math.sin(elapsed * 3.5) * 0.15);
          nightPalette.tokenHeadlightMat.emissiveIntensity =
            lightState.lampBulbEmissiveIntensity * 0.9;
        } else {
          nightPalette.houseWindowMat.emissiveIntensity = 0;
          nightPalette.hotelWindowMat.emissiveIntensity = 0;
          nightPalette.hotelBeaconMat.emissiveIntensity = 0;
          nightPalette.skylineTowerMat.emissiveIntensity = 0;
          nightPalette.cityBuildingWinMat.emissiveIntensity = 0;
          nightPalette.streetLampBulbMat.emissiveIntensity = 0;
          nightPalette.lanternSilkMat.emissiveIntensity = 0;
          nightPalette.fountainWaterMat.emissiveIntensity = 0;
          nightPalette.balloonGlowMat.emissiveIntensity = 0;
          nightPalette.tokenHeadlightMat.emissiveIntensity = 0;
        }

        // 1. Sync player tokens (create/remove/hide bankrupt)
        const validIds = new Set(currentPlayers.map((p) => p.id));
        for (const [id, mesh] of tokenGroupsRef.current.entries()) {
          if (!validIds.has(id)) {
            scene.remove(mesh);
            tokenGroupsRef.current.delete(id);
          }
        }

        for (const p of currentPlayers) {
          let token = tokenGroupsRef.current.get(p.id);
          if (!token) {
            token = createPlayerTokenMesh(p.tokenType, p.color, nightPalette);
            const startPos = computeTokenRestWorldPos(p.id, p.position, currentPlayers);
            token.position.copy(startPos);
            scene.add(token);
            tokenGroupsRef.current.set(p.id, token);
          }
          token.visible = !p.bankrupt;

          // If this player is NOT mid-hop, smoothly damp to their resting slot on tile
          const hop = activeHopAnimRef.current;
          if (!hop || hop.playerId !== p.id) {
            const targetPos = computeTokenRestWorldPos(p.id, p.position, currentPlayers);
            const alpha = 1 - Math.exp(-12 * simDt);
            token.position.lerp(targetPos, alpha);

            // Orient token clockwise along board edge
            const tf = getTileTransform(p.position);
            const targetRotY = tf.rotationY - Math.PI / 2;
            token.rotation.y = THREE.MathUtils.lerp(token.rotation.y, targetRotY, alpha);
            token.scale.lerp(_scratchUnitScale, alpha);
          }
        }

        // Active player ring indicator
        const activeP = currentPlayers.find(
          (p) => p.id === activePlayerIdRef.current && !p.bankrupt
        );
        if (activeP && activeRingRef.current) {
          const tok = tokenGroupsRef.current.get(activeP.id);
          if (tok) {
            activeRingRef.current.visible = true;
            activeRingRef.current.position.x = tok.position.x;
            activeRingRef.current.position.z = tok.position.z;
            (activeRingRef.current.material as THREE.MeshBasicMaterial).color.set(
              activeP.color
            );
          }
        } else if (activeRingRef.current) {
          activeRingRef.current.visible = false;
        }

        // 2. Sync tile ownership colors, hover/selected lift & house/hotel pop-in animations
        for (const entry of tileEntriesRef.current) {
          const propState = currentProps[entry.index];
          if (entry.ownerStrip && entry.ownerMat && propState) {
            if (propState.ownerId !== null) {
              const owner = currentPlayers.find((pl) => pl.id === propState.ownerId);
              entry.ownerStrip.visible = true;
              if (owner) {
                entry.ownerMat.color.set(owner.color);
                entry.ownerMat.emissive.set(owner.color);
                entry.ownerMat.emissiveIntensity = currentNightFactor * 0.45;
              }
            } else {
              entry.ownerStrip.visible = false;
              entry.ownerMat.emissiveIntensity = 0;
            }
          }

          // House / Hotel level pop-in
          const targetLevel = propState ? propState.level : 0;
          if (targetLevel !== entry.displayedLevel) {
            if (targetLevel > entry.displayedLevel) {
              if (targetLevel === 4) {
                entry.popTimers[3] = 0.01;
              } else {
                for (let h = entry.displayedLevel; h < Math.min(targetLevel, 3); h++) {
                  entry.popTimers[h] = 0.01;
                }
              }
            }
            entry.displayedLevel = targetLevel;
          }

          // Animate houses (levels 1..3) & hotel (level 4)
          for (let h = 0; h < entry.houses.length; h++) {
            const showHouse = targetLevel >= h + 1 && targetLevel < 4;
            const hGroup = entry.houses[h];
            hGroup.visible = showHouse;
            if (showHouse) {
              if (entry.popTimers[h] > 0 && entry.popTimers[h] < 1) {
                entry.popTimers[h] = Math.min(1, entry.popTimers[h] + animDt * 3.4);
                hGroup.scale.setScalar(Math.max(0.01, springPopScale(entry.popTimers[h])));
              } else {
                hGroup.scale.setScalar(1);
              }
            }
          }

          if (entry.hotel) {
            const showHotel = targetLevel >= 4;
            entry.hotel.visible = showHotel;
            if (showHotel) {
              if (entry.popTimers[3] > 0 && entry.popTimers[3] < 1) {
                entry.popTimers[3] = Math.min(1, entry.popTimers[3] + animDt * 3.0);
                entry.hotel.scale.setScalar(Math.max(0.01, springPopScale(entry.popTimers[3])));
              } else {
                entry.hotel.scale.setScalar(1);
              }
            }
          }

          // Hover / Selected elevation
          const isSel = selectedIdx === entry.index;
          const isHov = hoveredTileIdx === entry.index;
          entry.targetLift = isSel ? 0.14 : isHov ? 0.06 : 0;
          entry.group.position.y = THREE.MathUtils.lerp(
            entry.group.position.y,
            entry.targetLift,
            1 - Math.exp(-14 * simDt)
          );
        }

        // 3. Advance 3D Dice physical bounce & exact face landing
        const diceAnim = activeDiceAnimRef.current;
        const diceMeshes = diceMeshesRef.current;
        if (diceAnim && diceMeshes) {
          diceAnim.elapsed += animDt;
          const t = Math.min(1, diceAnim.elapsed / diceAnim.duration);
          const easeXZ = 1 - Math.pow(1 - t, 2.4);
          const yOffset = bounceHeight(t);

          const [d1, d2] = diceMeshes;
          d1.position.lerpVectors(diceAnim.startPos1, diceAnim.endPos1, easeXZ);
          d1.position.y = DICE_REST_Y + yOffset;

          d2.position.lerpVectors(diceAnim.startPos2, diceAnim.endPos2, easeXZ);
          d2.position.y = DICE_REST_Y + bounceHeight(Math.min(1, t * 1.04));

          // Tumble angle smoothly decays to 0 at t = 1 so final quaternion equals targetQuat!
          const remainingSpin = Math.pow(1 - t, 2.1) * Math.PI * 6;
          _scratchQuatSpin.setFromAxisAngle(diceAnim.spinAxis1, remainingSpin);
          d1.quaternion.copy(diceAnim.targetQuat1).multiply(_scratchQuatSpin);

          _scratchQuatSpin.setFromAxisAngle(diceAnim.spinAxis2, remainingSpin * 1.15);
          d2.quaternion.copy(diceAnim.targetQuat2).multiply(_scratchQuatSpin);

          if (t >= 1) {
            d1.quaternion.copy(diceAnim.targetQuat1);
            d2.quaternion.copy(diceAnim.targetQuat2);
            d1.position.copy(diceAnim.endPos1);
            d2.position.copy(diceAnim.endPos2);
            const done = diceAnim.resolve;
            activeDiceAnimRef.current = null;
            done();
          }
        }

        // 4. Advance parabolic step-by-step Token Hop animation
        const hopAnim = activeHopAnimRef.current;
        if (hopAnim) {
          const token = tokenGroupsRef.current.get(hopAnim.playerId);
          if (!token) {
            const done = hopAnim.resolve;
            activeHopAnimRef.current = null;
            done();
          } else {
            hopAnim.stepElapsed += animDt;
            const u = Math.min(1, hopAnim.stepElapsed / hopAnim.stepDuration);

            token.position.lerpVectors(hopAnim.fromVec, hopAnim.toVec, u);
            token.position.y = TILE_SURFACE_Y + Math.sin(u * Math.PI) * 0.82;

            // Subtle squash & stretch
            const stretch = 1 + Math.sin(u * Math.PI) * 0.16;
            const squash = 1 / Math.sqrt(stretch);
            token.scale.set(squash, stretch, squash);

            const targetTileIdx = hopAnim.path[hopAnim.stepIndex];
            const tf = getTileTransform(targetTileIdx);
            token.rotation.y = tf.rotationY - Math.PI / 2;

            if (u >= 1) {
              hopAnim.onStep?.(hopAnim.stepIndex, targetTileIdx);
              hopAnim.stepIndex += 1;

              if (hopAnim.stepIndex >= hopAnim.path.length) {
                token.scale.set(1, 1, 1);
                token.position.y = TILE_SURFACE_Y;
                const done = hopAnim.resolve;
                activeHopAnimRef.current = null;
                done();
              } else {
                hopAnim.stepElapsed = 0;
                hopAnim.fromVec.copy(hopAnim.toVec);
                const nextTileIdx = hopAnim.path[hopAnim.stepIndex];
                // On the very last step, aim directly at the non-overlapping slot
                if (hopAnim.stepIndex === hopAnim.path.length - 1) {
                  const simulatedPlayers = currentPlayers.map((pl) =>
                    pl.id === hopAnim.playerId ? { ...pl, position: nextTileIdx } : pl
                  );
                  hopAnim.toVec.copy(
                    computeTokenRestWorldPos(hopAnim.playerId, nextTileIdx, simulatedPlayers)
                  );
                } else {
                  const nextTf = getTileTransform(nextTileIdx);
                  hopAnim.toVec.set(nextTf.x, TILE_SURFACE_Y, nextTf.z);
                }
              }
            }
          }
        }

        // 5. Ambient Diorama Motion (fountain ripples, balloon float & cruising boulevard vehicles)
        const rippleScale = 0.82 + ((elapsed * 0.65) % 1) * 0.85;
        courtyardAnim.fountainRing.scale.setScalar(rippleScale);
        (courtyardAnim.fountainRing.material as THREE.MeshBasicMaterial).opacity =
          0.75 * (1 - ((elapsed * 0.65) % 1));
        courtyardAnim.fountainJet.position.y = 1.12 + Math.sin(elapsed * 4.5) * 0.06;
        courtyardAnim.fountainJet.rotation.y = elapsed * 0.9;

        courtyardAnim.balloonGroup.position.y = 3.65 + Math.sin(elapsed * 1.1) * 0.22;
        courtyardAnim.balloonGroup.rotation.y = elapsed * 0.25;

        for (const car of animatedCars) {
          updateBoulevardCar(car, elapsed);
        }

        // 6. Camera Reset & Cinematic Camera Auto-Panning (uses real-time animDt)
        if (cameraResetActiveRef.current) {
          const camAlpha = 1 - Math.exp(-7 * animDt);
          camera.position.lerp(DEFAULT_CAM_POS, camAlpha);
          controls.target.lerp(DEFAULT_CAM_TARGET, camAlpha);
          if (
            camera.position.distanceTo(DEFAULT_CAM_POS) < 0.04 &&
            controls.target.distanceTo(DEFAULT_CAM_TARGET) < 0.04
          ) {
            camera.position.copy(DEFAULT_CAM_POS);
            controls.target.copy(DEFAULT_CAM_TARGET);
            cameraResetActiveRef.current = false;
          }
        } else if (cinematicCameraRef.current && !manualOrbitOverrideRef.current) {
          let cineMode: 'dice' | 'hop' | 'idle' | null = null;
          let focusX = 0;
          let focusY = TILE_SURFACE_Y;
          let focusZ = 0;

          if (activeHopAnimRef.current) {
            const hopTok = tokenGroupsRef.current.get(activeHopAnimRef.current.playerId);
            if (hopTok) {
              cineMode = 'hop';
              focusX = hopTok.position.x;
              focusY = hopTok.position.y;
              focusZ = hopTok.position.z;
            }
          } else if (activeDiceAnimRef.current) {
            cineMode = 'dice';
            focusX = 0;
            focusY = DICE_REST_Y;
            focusZ = 0;
          } else if (activeP) {
            const activeTok = tokenGroupsRef.current.get(activeP.id);
            if (activeTok) {
              cineMode = 'idle';
              focusX = activeTok.position.x;
              focusY = activeTok.position.y;
              focusZ = activeTok.position.z;
            }
          }

          if (cineMode) {
            const pose = computeCinematicCameraPose(cineMode, {
              x: focusX,
              y: focusY,
              z: focusZ,
            });
            _scratchVecTarget.set(pose.target.x, pose.target.y, pose.target.z);
            _scratchVecPos.set(pose.position.x, pose.position.y, pose.position.z);
            const cineAlpha = 1 - Math.exp(-pose.dampLambda * animDt);
            controls.target.lerp(_scratchVecTarget, cineAlpha);
            camera.position.lerp(_scratchVecPos, cineAlpha);
          }
        }
      };

      const tick = () => {
        if (disposed) return;
        const nowMs = performance.now();
        const rawDt = Math.max(0.001, (nowMs - lastTimeMs) / 1000);
        lastTimeMs = nowMs;

        const simDt = Math.min(rawDt, 0.08);
        const animDt = Math.min(rawDt, isSoftwareGl ? 0.35 : 0.06);
        elapsedSec += simDt;

        syncSceneFromState(simDt, animDt, elapsedSec);
        controls.update();
        renderer.render(scene, camera);

        if (isSoftwareGl) {
          afterDraw(tick);
        } else {
          frameId = requestAnimationFrame(tick);
        }
      };

      tick();

      return () => {
        disposed = true;
        cancelAnimationFrame(frameId);
        clearTimeout(frameId);
        resizeObserver.disconnect();
        window.removeEventListener('resize', handleResize);
        renderer.domElement.removeEventListener('pointerdown', onPointerDown);
        renderer.domElement.removeEventListener('pointerup', onPointerUp);
        renderer.domElement.removeEventListener('pointermove', onPointerMove);
        renderer.domElement.removeEventListener('webglcontextlost', handleContextLost);
        controls.dispose();
        envRT.dispose();
        renderer.dispose();
      };
    }, []);

    return (
      <div
        ref={mountRef}
        data-testid="monopoly-3d-canvas"
        className="fixed inset-0 h-full w-full overflow-hidden"
      />
    );
  }
);

MonopolyCanvas.displayName = 'MonopolyCanvas';
