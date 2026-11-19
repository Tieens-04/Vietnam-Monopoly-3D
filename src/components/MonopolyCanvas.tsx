import React, { useEffect, useImperativeHandle, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { BOARD_TILES } from '../game/boardData';
import {
  computeCinematicCameraPose,
  computeDayNightLightingState,
  DICE_BOX_FACE_VALUES,
  formatBusinessTourSpaced,
  formatTilePriceLabel,
  getDiceFaceBaseEuler,
  getTileTransform,
  getTokenSlotOffset,
} from '../game/rules';
import { PlayerState, PropertyState, TileKind } from '../game/types';
import {
  CornerDioramaAnimRefs,
  createCornerDiorama,
  createCourtyardDiorama,
  createNightLightingPalette,
  createOwnershipBuildingSuite,
  createPlayerTokenMesh,
  createProtrudingPriceTab,
  createSurroundingVista,
  OwnershipBuildingSuiteRefs,
  ProtrudingPriceTabRefs,
} from '../three/models';
import {
  createDiceFaceMaterials,
  createLevelBadgeTexture,
  createOuterPriceTabTexture,
  createStonePaperBumpMap,
  createTileTopTexture,
  createWoodGrainBumpMap,
  resolveDeedGroupPalette,
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
  taxPool: number;
  turnTimeLeft: number;
  turnCount?: number;
  activeSpeechText?: string | null;
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
  priceTab: ProtrudingPriceTabRefs | null;
  accentHex: string;
  flip180: boolean;
  lastTabSignature: string;
  buildingSuite: OwnershipBuildingSuiteRefs | null;
  lastOwnerSignature: string;
  lastBadgeSignature: string;
  displayedLevel: number;
  popTimers: number[]; // [0..2]=houses, [3]=hotel, [4]=starterPavilion
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

// Low-FOV Isometric Camera (~35.6 deg pitch, 45 deg yaw) framing the diamond-oriented board centrally
const DEFAULT_CAM_POS = new THREE.Vector3(24.4, 24.8, 24.4);
const DEFAULT_CAM_TARGET = new THREE.Vector3(0.0, -0.15, 0.0);
const WORLD_UP = new THREE.Vector3(0, 1, 0);
const TILE_SURFACE_Y = 0.44;
const GRASS_SURFACE_Y = 0.16;
const DICE_SIZE = 0.88;
const DICE_REST_Y = GRASS_SURFACE_Y + DICE_SIZE * 0.5;

function computeResponsiveDefaultCamPos(aspect: number, out: THREE.Vector3): THREE.Vector3 {
  const safeAspect = Math.max(0.36, aspect || 1);
  const portraitScale =
    safeAspect < 1 ? Math.min(1.66, 1 / Math.pow(safeAspect, 0.62)) : 1;
  return out.set(
    DEFAULT_CAM_POS.x * portraitScale,
    DEFAULT_CAM_POS.y * portraitScale,
    DEFAULT_CAM_POS.z * portraitScale
  );
}

// Pre-allocated scratch math objects (zero per-frame GC)
const _scratchQuatSpin = new THREE.Quaternion();
const _scratchEuler = new THREE.Euler();
const _scratchVecTarget = new THREE.Vector3();
const _scratchVecPos = new THREE.Vector3();
const _scratchDefaultCamPos = new THREE.Vector3();
const _scratchUnitScale = new THREE.Vector3(1, 1, 1);
const _scratchSpeechProj = new THREE.Vector3();
const _daySunPos = new THREE.Vector3(15, 27, 13);
const _nightMoonPos = new THREE.Vector3(-12, 24, 14);
const _dayOceanColor = new THREE.Color(0xdcf0ff);
const _nightOceanColor = new THREE.Color(0x091122);
const _dayIslandColor = new THREE.Color(0xffffff);
const _nightIslandColor = new THREE.Color(0x1b263b);
const _dayLawnColor = new THREE.Color(0xffffff);
const _nightLawnColor = new THREE.Color(0x365928);

function bounceHeight(t: number): number {
  if (t < 0.44) {
    const u = t / 0.44;
    return (1 - u * u) * 2.95;
  }
  if (t < 0.76) {
    const u = (t - 0.44) / 0.32;
    return Math.sin(u * Math.PI) * 1.12;
  }
  if (t < 0.95) {
    const u = (t - 0.76) / 0.19;
    return Math.sin(u * Math.PI) * 0.36;
  }
  return 0;
}

function springPopScale(progress: number): number {
  if (progress <= 0) return 0.001;
  if (progress >= 1) return 1;
  return (
    1 +
    Math.sin(progress * Math.PI * 1.4) * 0.24 * (1 - progress) -
    Math.pow(1 - progress, 3)
  );
}

export const MonopolyCanvas = React.forwardRef<MonopolyCanvasHandle, MonopolyCanvasProps>(
  (
    {
      players,
      properties,
      selectedTileIndex,
      activePlayerId,
      taxPool,
      turnTimeLeft,
      turnCount = 1,
      activeSpeechText = null,
      cinematicCamera,
      nightMode,
      onSelectTile,
    },
    ref
  ) => {
    const mountRef = useRef<HTMLDivElement | null>(null);
    const speechBubbleRef = useRef<HTMLDivElement | null>(null);
    const speechTextSpanRef = useRef<HTMLSpanElement | null>(null);

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

    const taxPoolRef = useRef(taxPool);
    taxPoolRef.current = taxPool;

    const turnTimeLeftRef = useRef(turnTimeLeft);
    turnTimeLeftRef.current = turnTimeLeft;

    const turnCountRef = useRef(turnCount);
    turnCountRef.current = turnCount;

    const activeSpeechTextRef = useRef(activeSpeechText);
    activeSpeechTextRef.current = activeSpeechText;

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
      // Offset pawns slightly outward on edge tiles so inner half stays clear for 3D buildings!
      let outerBiasX = 0;
      let outerBiasZ = 0;
      if (!tf.isCorner) {
        if (tf.side === 'bottom') outerBiasZ = 0.34;
        else if (tf.side === 'top') outerBiasZ = -0.34;
        else if (tf.side === 'left') outerBiasX = -0.34;
        else if (tf.side === 'right') outerBiasX = 0.34;
      }
      return new THREE.Vector3(
        tf.x + dx + outerBiasX,
        TILE_SURFACE_Y,
        tf.z + dz + outerBiasZ
      );
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

          const angleOffset = (Math.random() - 0.5) * 0.36;
          // Bounce dynamically across the open lower-center grass lawn with zero overlap on center 3D text!
          const endPos1 = new THREE.Vector3(
            1.48 + Math.sin(angleOffset) * 0.16,
            DICE_REST_Y,
            2.68 + Math.cos(angleOffset) * 0.16
          );
          const endPos2 = new THREE.Vector3(
            2.68 - Math.sin(angleOffset) * 0.16,
            DICE_REST_Y,
            1.48 - Math.cos(angleOffset) * 0.16
          );

          activeDiceAnimRef.current = {
            elapsed: 0,
            duration: Math.max(0.62, 1.18 / speedMultiplier),
            startPos1: new THREE.Vector3(-3.05, DICE_REST_Y, 1.15),
            endPos1,
            targetQuat1: buildTargetQuat(die1),
            spinAxis1: new THREE.Vector3(1, 0.72, 0.42).normalize(),
            startPos2: new THREE.Vector3(1.15, DICE_REST_Y, -3.05),
            endPos2,
            targetQuat2: buildTargetQuat(die2),
            spinAxis2: new THREE.Vector3(-0.82, 0.64, 1).normalize(),
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
            stepDuration: Math.max(0.16, 0.3 / speedMultiplier),
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
      scene.background = new THREE.Color(0xdcf0ff);

      // Low-FOV Isometric Camera (26 deg FOV) framing the diamond board cleanly
      const camera = new THREE.PerspectiveCamera(26, width / height, 0.5, 240);
      computeResponsiveDefaultCamPos(width / height, camera.position);
      camera.lookAt(DEFAULT_CAM_TARGET);

      const renderer = new THREE.WebGLRenderer({
        antialias: !isSoftwareGl,
        powerPreference: 'high-performance',
      });
      renderer.setSize(width, height);
      renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.02;
      renderer.shadowMap.enabled = !isSoftwareGl;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;

      container.innerHTML = '';
      container.appendChild(renderer.domElement);

      const handleContextLost = (e: Event) => {
        e.preventDefault();
      };
      renderer.domElement.addEventListener('webglcontextlost', handleContextLost);

      const pmremGenerator = new THREE.PMREMGenerator(renderer);
      const envRT = pmremGenerator.fromScene(new RoomEnvironment(), 0.04);
      scene.environment = envRT.texture;
      scene.environmentIntensity = 0.34;
      pmremGenerator.dispose();

      // Bright, low-contrast global illumination (HemisphereLight + soft DirectionalLight)
      const hemiLight = new THREE.HemisphereLight(0xeef8ff, 0xffe9f2, 0.88);
      hemiLight.position.set(0, 32, 0);
      scene.add(hemiLight);

      const sunLight = new THREE.DirectionalLight(0xfffdf7, 0.96);
      sunLight.position.set(15, 27, 13);
      sunLight.castShadow = !isSoftwareGl;
      sunLight.shadow.mapSize.width = 1024;
      sunLight.shadow.mapSize.height = 1024;
      const shadowD = 14.0;
      sunLight.shadow.camera.left = -shadowD;
      sunLight.shadow.camera.right = shadowD;
      sunLight.shadow.camera.top = shadowD;
      sunLight.shadow.camera.bottom = -shadowD;
      sunLight.shadow.camera.near = 4;
      sunLight.shadow.camera.far = 56;
      sunLight.shadow.bias = -0.0005;
      sunLight.shadow.normalBias = 0.02;
      scene.add(sunLight);

      const rimLight = new THREE.DirectionalLight(0xdcf0ff, 0.44);
      rimLight.position.set(-15, 14, -15);
      scene.add(rimLight);

      // OrbitControls locked gently around clean isometric range
      const controls = new OrbitControls(camera, renderer.domElement);
      controls.target.copy(DEFAULT_CAM_TARGET);
      controls.enableDamping = !isSoftwareGl;
      controls.dampingFactor = 0.07;
      controls.minDistance = 14.0;
      controls.maxDistance = 68;
      controls.minPolarAngle = 0.38;
      controls.maxPolarAngle = Math.PI / 2.3;
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
      const tilePaperBump = createStonePaperBumpMap();
      const nightPalette = createNightLightingPalette(maxAniso);

      // Pastel Sky Gradient + Sakura Branches + Left/Top Cash & '?' Card Stack + Bottom-Right Gold/Silver/Bronze Coins
      const { vista: vistaGroup, animatedCars } = createSurroundingVista(
        woodBump,
        nightPalette,
        maxAniso
      );
      scene.add(vistaGroup);

      // Sunken Bright Lime-Green Courtyard + Sleek Dark-Gray Digital Turn/Timer + Center Flat-Shaded White 3D Tax Text
      const { group: courtyardGroup, animated: courtyardAnim } =
        createCourtyardDiorama(nightPalette, maxAniso);
      scene.add(courtyardGroup);

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

      // Extruded #F4F5F7 Off-White Stone/Plastic Tile Block Materials (roughness: 0.7, metalness: 0.1)
      const sideBodyMat = new THREE.MeshStandardMaterial({
        color: 0xf4f5f7,
        roughness: 0.7,
        metalness: 0.1,
      });
      const lowerBlockMat = new THREE.MeshStandardMaterial({
        color: 0xcbd5e1,
        roughness: 0.7,
        metalness: 0.1,
      });

      const tileEntries: TileVisualEntry[] = [];
      const cornerAnims: CornerDioramaAnimRefs[] = [];
      const clickableMeshes: THREE.Mesh[] = [];

      for (const tile of BOARD_TILES) {
        const tf = getTileTransform(tile.index);
        const tileGroup = new THREE.Group();
        tileGroup.position.set(tf.x, 0, tf.z);
        tileGroup.rotation.y = tf.rotationY;

        const flip180 = tf.side === 'top' || tf.side === 'left';
        const topTex = createTileTopTexture(tile, maxAniso, flip180);
        const topMat = new THREE.MeshStandardMaterial({
          color: 0xffffff,
          map: topTex,
          bumpMap: tilePaperBump,
          bumpScale: 0.0025,
          roughness: 0.7,
          metalness: 0.1,
        });

        // Lower chamfered block base
        const lowerPlinth = new THREE.Mesh(
          new THREE.BoxGeometry(tf.width - 0.09, 0.28, tf.depth - 0.09),
          lowerBlockMat
        );
        lowerPlinth.position.y = -0.24;
        lowerPlinth.castShadow = true;
        lowerPlinth.receiveShadow = true;
        tileGroup.add(lowerPlinth);

        // Extruded #F4F5F7 off-white 3D stone/plastic block up to TILE_SURFACE_Y = 0.44
        const mainBlockHeight = 0.56;
        const tileGeo = new THREE.BoxGeometry(
          tf.width - 0.05,
          mainBlockHeight,
          tf.depth - 0.05
        );
        const mats = [
          sideBodyMat,
          sideBodyMat,
          topMat,
          sideBodyMat,
          sideBodyMat,
          sideBodyMat,
        ];
        const tileMesh = new THREE.Mesh(tileGeo, mats);
        tileMesh.position.y = TILE_SURFACE_Y - mainBlockHeight / 2;
        tileMesh.receiveShadow = true;
        tileMesh.castShadow = true;
        tileMesh.userData.tileIndex = tile.index;
        tileGroup.add(tileMesh);
        clickableMeshes.push(tileMesh);

        // 4 Corner 3D Dioramas (0: Start Arch, 7: Lost Island, 14: World Championships Stadium, 21: World Tour Airport)
        if (tf.isCorner) {
          const { group: dioramaGroup, anim: dioramaAnim } = createCornerDiorama(
            tile.index,
            TILE_SURFACE_Y
          );
          // Cancel tileGroup's rotationY so corner dioramas orient consistently toward the isometric diamond camera
          dioramaGroup.rotation.y = -tf.rotationY;
          tileGroup.add(dioramaGroup);
          cornerAnims.push(dioramaAnim);
        }

        const accentHex =
          tile.kind === TileKind.PROPERTY
            ? resolveDeedGroupPalette(tile.group, tile.groupColor).topHex
            : tile.kind === TileKind.UTILITY
              ? '#F59E0B'
              : tile.kind === TileKind.TAX
                ? '#E11D48'
                : '#0EA5E9';

        // Protruding 3D Outer Price Tab (180K, 660K, 1.2M) extending outward from the tile edge
        let priceTab: ProtrudingPriceTabRefs | null = null;
        let lastTabSignature = '';
        const initialPriceLabel = formatTilePriceLabel(tile, 0);
        if (initialPriceLabel !== null) {
          priceTab = createProtrudingPriceTab(
            initialPriceLabel,
            accentHex,
            flip180,
            maxAniso
          );
          priceTab.hitMesh.userData.tileIndex = tile.index;
          tileGroup.add(priceTab.group);
          clickableMeshes.push(priceTab.hitMesh);
          lastTabSignature = `${initialPriceLabel}|null|false`;
        }

        // Outer rim ownership accent strip
        let ownerStrip: THREE.Mesh | null = null;
        let ownerMat: THREE.MeshStandardMaterial | null = null;
        const isOwnable =
          tile.kind === TileKind.PROPERTY ||
          tile.kind === TileKind.TRANSPORT ||
          tile.kind === TileKind.UTILITY;

        if (isOwnable) {
          ownerMat = new THREE.MeshStandardMaterial({
            color: 0xcbd5e1,
            roughness: 0.65,
            metalness: 0.1,
          });
          ownerStrip = new THREE.Mesh(
            new THREE.BoxGeometry(tf.width - 0.12, 0.08, 0.14),
            ownerMat
          );
          ownerStrip.position.set(0, TILE_SURFACE_Y + 0.024, tf.depth / 2 - 0.1);
          ownerStrip.visible = false;
          tileGroup.add(ownerStrip);
        }

        // Full-Color Ownership 3D Miniature Buildings + Floating 3D Shield + Square Level Badge on PROPERTY tiles
        let buildingSuite: OwnershipBuildingSuiteRefs | null = null;
        if (tile.kind === TileKind.PROPERTY) {
          buildingSuite = createOwnershipBuildingSuite(
            tf.width,
            tf.depth,
            TILE_SURFACE_Y,
            nightPalette,
            maxAniso
          );
          // Orient level badge perpendicular to the isometric camera
          buildingSuite.levelBadgeMesh.rotation.y = -tf.rotationY + Math.PI / 4;
          buildingSuite.shieldGroup.rotation.y = -tf.rotationY + Math.PI / 4;
          tileGroup.add(buildingSuite.root);
        }

        scene.add(tileGroup);
        tileEntries.push({
          index: tile.index,
          group: tileGroup,
          hitMesh: tileMesh,
          ownerStrip,
          ownerMat,
          priceTab,
          accentHex,
          flip180,
          lastTabSignature,
          buildingSuite,
          lastOwnerSignature: '',
          lastBadgeSignature: '',
          displayedLevel: -1,
          popTimers: [0, 0, 0, 0, 0],
          baseY: 0,
          targetLift: 0,
        });
      }
      tileEntriesRef.current = tileEntries;

      // Active player ground halo ring
      const activeRingGeo = new THREE.RingGeometry(0.4, 0.54, 24);
      activeRingGeo.rotateX(-Math.PI / 2);
      const activeRingMat = new THREE.MeshBasicMaterial({
        color: 0xf5b800,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.9,
      });
      const activeRing = new THREE.Mesh(activeRingGeo, activeRingMat);
      activeRing.position.y = TILE_SURFACE_Y + 0.022;
      activeRing.visible = false;
      scene.add(activeRing);
      activeRingRef.current = activeRing;

      // 2 Oversized Glossy Hot-Pink 3D Dice with White Pips bouncing on the sunken grass courtyard
      const diceGeo = new THREE.BoxGeometry(DICE_SIZE, DICE_SIZE, DICE_SIZE);
      const diceMats1 = createDiceFaceMaterials(DICE_BOX_FACE_VALUES, maxAniso);
      const diceMats2 = createDiceFaceMaterials(DICE_BOX_FACE_VALUES, maxAniso);
      const dieMesh1 = new THREE.Mesh(diceGeo, diceMats1);
      const dieMesh2 = new THREE.Mesh(diceGeo, diceMats2);
      dieMesh1.castShadow = true;
      dieMesh2.castShadow = true;
      dieMesh1.position.set(1.48, DICE_REST_Y, 2.68);
      dieMesh2.position.set(2.68, DICE_REST_Y, 1.48);
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

      const handleResize = () => {
        if (!container) return;
        const w = container.clientWidth || window.innerWidth;
        const h = container.clientHeight || window.innerHeight;
        const nextAspect = w / h;
        camera.aspect = nextAspect;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h);
        if (!cinematicCameraRef.current && !manualOrbitOverrideRef.current) {
          computeResponsiveDefaultCamPos(nextAspect, camera.position);
          controls.target.copy(DEFAULT_CAM_TARGET);
          controls.update();
        }
      };
      const resizeObserver = new ResizeObserver(handleResize);
      resizeObserver.observe(container);
      window.addEventListener('resize', handleResize);

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
      let appliedNightSnapshot = -1;
      let lastRenderedSpeech = '';

      const syncSceneFromState = (simDt: number, animDt: number, elapsed: number) => {
        const currentPlayers = playersRef.current;
        const currentProps = propertiesRef.current;
        const selectedIdx = selectedTileRef.current;

        // 0. Smooth Day / Night lighting & Pastel Sky Dome transition
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
          nightPalette.skyDomeUniforms.uNightFactor.value = currentNightFactor;

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
          nightPalette.lawnMat.emissiveIntensity = (1 - currentNightFactor) * 0.06;
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
          nightPalette.streetLampBulbMat.emissiveIntensity =
            lightState.lampBulbEmissiveIntensity;
        } else {
          nightPalette.houseWindowMat.emissiveIntensity = 0;
          nightPalette.hotelWindowMat.emissiveIntensity = 0;
          nightPalette.hotelBeaconMat.emissiveIntensity = 0;
          nightPalette.streetLampBulbMat.emissiveIntensity = 0;
        }

        // 1. Sync Stylized 3D Character Pawns
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

          const hop = activeHopAnimRef.current;
          if (!hop || hop.playerId !== p.id) {
            const targetPos = computeTokenRestWorldPos(p.id, p.position, currentPlayers);
            const alpha = 1 - Math.exp(-12 * simDt);
            token.position.lerp(targetPos, alpha);

            // Orient 3D character pawn toward the isometric camera with a subtle lively idle sway
            const targetRotY =
              Math.PI / 4 + Math.sin(elapsed * 1.8 + p.id * 1.3) * 0.14;
            token.rotation.y = THREE.MathUtils.lerp(token.rotation.y, targetRotY, alpha);
            token.scale.lerp(_scratchUnitScale, alpha);
          }
        }

        const activeP = currentPlayers.find(
          (p) => p.id === activePlayerIdRef.current && !p.bankrupt
        );
        if (activeP && activeRingRef.current && !activeHopAnimRef.current) {
          const tok = tokenGroupsRef.current.get(activeP.id);
          if (tok) {
            activeRingRef.current.visible = true;
            activeRingRef.current.position.x = tok.position.x;
            activeRingRef.current.position.z = tok.position.z;
            const pulse = 1 + Math.sin(elapsed * 4.5) * 0.08;
            activeRingRef.current.scale.set(pulse, pulse, 1);
            (activeRingRef.current.material as THREE.MeshBasicMaterial).color.set(
              activeP.color
            );
          }
        } else if (activeRingRef.current) {
          activeRingRef.current.visible = false;
        }

        // 1b. Sync Sunken Grass Center 3D Spaced Tax Text ("660 000" / "0") & Turn/Timer Console
        courtyardAnim.updateTaxDisplay(formatBusinessTourSpaced(taxPoolRef.current));
        courtyardAnim.updateCountdown(
          turnTimeLeftRef.current,
          turnCountRef.current,
          activeP?.color || '#29B6F6'
        );

        // 1c. Animate 4 Corner 3D Dioramas (Lost Island mascot, World Cup trophy, World Tour jet & radar)
        for (const cAnim of cornerAnims) {
          if (cAnim.spinTarget) {
            cAnim.spinTarget.rotation.y = elapsed * 1.35;
          }
          if (cAnim.bobTarget) {
            cAnim.bobTarget.position.y =
              cAnim.baseBobY + Math.sin(elapsed * 2.8 + cAnim.tileIndex) * 0.075;
          }
        }

        // 2. Sync Full-Color Ownership 3D Buildings, Shield Badges, Level Badges & Outer Price Tabs
        for (const entry of tileEntriesRef.current) {
          const propState = currentProps[entry.index];
          const tileDef = BOARD_TILES[entry.index];
          const owner =
            propState && propState.ownerId !== null
              ? currentPlayers.find((pl) => pl.id === propState.ownerId) || null
              : null;

          const isSel = selectedIdx === entry.index;
          const isHov = hoveredTileIdx === entry.index;

          if (entry.ownerStrip && entry.ownerMat && propState) {
            if (propState.ownerId !== null && owner) {
              entry.ownerStrip.visible = true;
              const stripHex = propState.mortgaged ? '#64748b' : owner.color;
              entry.ownerMat.color.set(stripHex);
            } else {
              entry.ownerStrip.visible = false;
            }
          }

          const isOwned = Boolean(owner && propState && propState.ownerId !== null);
          const targetLevel = isOwned && propState ? propState.level : -1;

          // Sync Protruding 3D Outer Price Tab
          if (entry.priceTab && tileDef) {
            const liveLabel =
              formatTilePriceLabel(tileDef, Math.max(0, targetLevel)) || '';
            const ownerHex = owner ? owner.color : null;
            const isMortgaged = Boolean(propState?.mortgaged);
            const sig = `${liveLabel}|${ownerHex}|${isMortgaged}`;
            if (sig !== entry.lastTabSignature) {
              entry.lastTabSignature = sig;
              const prevMap = entry.priceTab.topMat.map;
              const nextMap = createOuterPriceTabTexture(
                liveLabel,
                entry.accentHex,
                ownerHex,
                isMortgaged,
                entry.flip180,
                maxAniso
              );
              entry.priceTab.topMat.map = nextMap;
              entry.priceTab.topMat.needsUpdate = true;
              prevMap?.dispose();

              const collarColor = isMortgaged
                ? '#64748B'
                : ownerHex
                  ? ownerHex
                  : liveLabel.startsWith('-')
                    ? '#FB7185'
                    : '#D5DCE6';
              entry.priceTab.collarMat.color.set(collarColor);
            }
          }

          // Sync Full-Color Ownership 3D Building Suite on PROPERTY tiles
          if (entry.buildingSuite) {
            const suite = entry.buildingSuite;
            if (!isOwned || !owner) {
              suite.padMesh.visible = false;
              suite.starterPavilion.visible = false;
              suite.hotel.visible = false;
              suite.shieldGroup.visible = false;
              suite.levelBadgeMesh.visible = false;
              for (const h of suite.houses) h.visible = false;
              entry.displayedLevel = -1;
            } else {
              suite.padMesh.visible = true;
              const isMortgaged = Boolean(propState?.mortgaged);
              const ownerSig = `${owner.color}|${isMortgaged}`;
              if (ownerSig !== entry.lastOwnerSignature) {
                entry.lastOwnerSignature = ownerSig;
                suite.setOwnerTint(owner.color, isMortgaged);
              }

              if (targetLevel !== entry.displayedLevel) {
                if (targetLevel === 0) {
                  entry.popTimers[4] = 0.01;
                } else if (targetLevel === 4) {
                  entry.popTimers[3] = 0.01;
                } else if (targetLevel > 0) {
                  for (
                    let h = Math.max(0, entry.displayedLevel);
                    h < Math.min(targetLevel, 3);
                    h++
                  ) {
                    entry.popTimers[h] = 0.01;
                  }
                }
                entry.displayedLevel = targetLevel;
              }

              // Level 0 owned starter pavilion
              const showStarter = targetLevel === 0 && !isMortgaged;
              suite.starterPavilion.visible = showStarter;
              if (showStarter) {
                if (entry.popTimers[4] > 0 && entry.popTimers[4] < 1) {
                  entry.popTimers[4] = Math.min(1, entry.popTimers[4] + animDt * 3.4);
                  suite.starterPavilion.scale.setScalar(
                    Math.max(0.01, springPopScale(entry.popTimers[4]))
                  );
                } else {
                  suite.starterPavilion.scale.setScalar(1);
                }
              }

              // Level 1..3 houses
              for (let h = 0; h < suite.houses.length; h++) {
                const showHouse =
                  !isMortgaged && targetLevel >= h + 1 && targetLevel < 4;
                const hGroup = suite.houses[h];
                hGroup.visible = showHouse;
                if (showHouse) {
                  if (entry.popTimers[h] > 0 && entry.popTimers[h] < 1) {
                    entry.popTimers[h] = Math.min(1, entry.popTimers[h] + animDt * 3.4);
                    hGroup.scale.setScalar(
                      Math.max(0.01, springPopScale(entry.popTimers[h]))
                    );
                  } else {
                    hGroup.scale.setScalar(1);
                  }
                }
              }

              // Level 4 Luxury Hotel + Floating 3D Gold/Red Protection Shield!
              const showHotel = !isMortgaged && targetLevel >= 4;
              suite.hotel.visible = showHotel;
              suite.shieldGroup.visible = showHotel;
              if (showHotel) {
                if (entry.popTimers[3] > 0 && entry.popTimers[3] < 1) {
                  entry.popTimers[3] = Math.min(1, entry.popTimers[3] + animDt * 3.0);
                  suite.hotel.scale.setScalar(
                    Math.max(0.01, springPopScale(entry.popTimers[3]))
                  );
                } else {
                  suite.hotel.scale.setScalar(1);
                }
                suite.shieldGroup.position.y =
                  TILE_SURFACE_Y +
                  1.52 +
                  Math.sin(elapsed * 3.1 + entry.index) * 0.08;
                suite.shieldGroup.rotation.y += animDt * 1.4;
              }

              // Clean Square Level Badge ("1", "2", "3", "★") shown when upgraded (level >= 1) or hovered/selected!
              const displayBadgeLevel = Math.max(1, targetLevel);
              const showBadge =
                !isMortgaged && (targetLevel >= 1 || isHov || isSel);
              suite.levelBadgeMesh.visible = showBadge;
              if (showBadge) {
                const badgeSig = `${displayBadgeLevel}|${owner.color}`;
                if (badgeSig !== entry.lastBadgeSignature) {
                  entry.lastBadgeSignature = badgeSig;
                  const prevBadgeTex = suite.levelBadgeMat.map;
                  const nextBadgeTex = createLevelBadgeTexture(
                    displayBadgeLevel,
                    owner.color,
                    maxAniso
                  );
                  suite.levelBadgeMat.map = nextBadgeTex;
                  suite.levelBadgeMat.needsUpdate = true;
                  prevBadgeTex?.dispose();
                }
                suite.levelBadgeMesh.position.y =
                  TILE_SURFACE_Y +
                  (targetLevel >= 4 ? 1.15 : 0.86) +
                  Math.sin(elapsed * 2.6 + entry.index) * 0.04;
              }
            }
          }

          // Hover / Selected elevation
          entry.targetLift = isSel ? 0.14 : isHov ? 0.06 : 0;
          entry.group.position.y = THREE.MathUtils.lerp(
            entry.group.position.y,
            entry.targetLift,
            1 - Math.exp(-14 * simDt)
          );
        }

        // 3. Advance Oversized Hot-Pink 3D Dice physical bounce & exact face landing
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

        // 4. Advance parabolic step-by-step 3D Pawn Hop animation
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
            token.position.y = TILE_SURFACE_Y + Math.sin(u * Math.PI) * 0.85;

            const stretch = 1 + Math.sin(u * Math.PI) * 0.16;
            const squash = 1 / Math.sqrt(stretch);
            token.scale.set(squash, stretch, squash);

            const targetTileIdx = hopAnim.path[hopAnim.stepIndex];
            token.rotation.y = Math.PI / 4;

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

        // 5. Gentle floating bob for outer 3D Cash Stacks, Gold/Silver/Bronze Coins, '?' Cards & Sakura
        for (const prop of animatedCars) {
          prop.group.position.y =
            prop.baseY + Math.sin(elapsed * 1.35 + prop.phase) * 0.055;
        }

        // 6. Camera Reset & Cinematic Camera Auto-Panning (scaled cleanly for 26-deg low-FOV)
        if (cameraResetActiveRef.current) {
          computeResponsiveDefaultCamPos(camera.aspect, _scratchDefaultCamPos);
          const camAlpha = 1 - Math.exp(-7 * animDt);
          camera.position.lerp(_scratchDefaultCamPos, camAlpha);
          controls.target.lerp(DEFAULT_CAM_TARGET, camAlpha);
          if (
            camera.position.distanceTo(_scratchDefaultCamPos) < 0.04 &&
            controls.target.distanceTo(DEFAULT_CAM_TARGET) < 0.04
          ) {
            camera.position.copy(_scratchDefaultCamPos);
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
            focusX = -1.1;
            focusY = DICE_REST_Y;
            focusZ = -1.1;
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
            const dx = (pose.position.x - pose.target.x) * 1.42;
            const dy = (pose.position.y - pose.target.y) * 1.42;
            const dz = (pose.position.z - pose.target.z) * 1.42;
            _scratchVecPos.set(
              pose.target.x + dx,
              pose.target.y + dy,
              pose.target.z + dz
            );
            const cineAlpha = 1 - Math.exp(-pose.dampLambda * animDt);
            controls.target.lerp(_scratchVecTarget, cineAlpha);
            camera.position.lerp(_scratchVecPos, cineAlpha);
          }
        }

        // 7. Zero-GC World-to-Screen 2D Comic Speech Bubble floating above Active 3D Character Pawn
        const bubbleEl = speechBubbleRef.current;
        const textSpanEl = speechTextSpanRef.current;
        const speechMsg = activeSpeechTextRef.current;
        if (bubbleEl && textSpanEl) {
          const activeTok = activeP ? tokenGroupsRef.current.get(activeP.id) : null;
          if (activeP && activeTok && speechMsg) {
            _scratchSpeechProj.set(
              activeTok.position.x,
              activeTok.position.y + 1.38,
              activeTok.position.z
            );
            camera.updateMatrixWorld();
            _scratchSpeechProj.project(camera);

            if (_scratchSpeechProj.z >= -1 && _scratchSpeechProj.z <= 1) {
              const cw = container.clientWidth || window.innerWidth;
              const ch = container.clientHeight || window.innerHeight;
              const sx = (_scratchSpeechProj.x * 0.5 + 0.5) * cw;
              const sy = (-_scratchSpeechProj.y * 0.5 + 0.5) * ch;

              if (lastRenderedSpeech !== speechMsg) {
                lastRenderedSpeech = speechMsg;
                textSpanEl.textContent = speechMsg;
              }
              bubbleEl.style.borderColor = activeP.color;
              bubbleEl.style.opacity = '1';
              bubbleEl.style.transform = `translate3d(${sx.toFixed(1)}px, ${sy.toFixed(1)}px, 0) translate(-50%, -100%)`;
            } else {
              bubbleEl.style.opacity = '0';
            }
          } else {
            bubbleEl.style.opacity = '0';
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
        courtyardAnim.disposeDynamicTextures();

        scene.traverse((obj) => {
          if (obj instanceof THREE.Mesh) {
            obj.geometry?.dispose();
            if (Array.isArray(obj.material)) {
              obj.material.forEach((m) => {
                m.map?.dispose();
                m.dispose();
              });
            } else if (obj.material) {
              obj.material.map?.dispose();
              obj.material.dispose();
            }
          }
        });
        woodBump.dispose();
        tilePaperBump.dispose();
        envRT.dispose();
        renderer.dispose();
        tokenGroupsRef.current.clear();
        tileEntriesRef.current = [];
        diceMeshesRef.current = null;
      };
    }, []);

    return (
      <div className="relative h-full w-full overflow-hidden">
        <div
          ref={mountRef}
          className="h-full w-full select-none"
          aria-label="Bàn cờ Tỷ Phú Việt Nam 3D"
        />

        {/* Floating 2D Comic Speech Bubble anchored above Active 3D Character Pawn */}
        <div
          ref={speechBubbleRef}
          className="pointer-events-none absolute left-0 top-0 z-10 rounded-2xl border-[3px] bg-white px-3.5 py-1.5 shadow-[0_6px_16px_rgba(15,23,42,0.22)] transition-opacity duration-150"
          style={{ opacity: 0, willChange: 'transform, opacity' }}
        >
          <span
            ref={speechTextSpanRef}
            className="block whitespace-nowrap text-xs font-extrabold tracking-normal text-slate-800 sm:text-[13px]"
          />
          <span className="absolute -bottom-2 left-1/2 h-3 w-3 -translate-x-1/2 rotate-45 border-b-[3px] border-r-[3px] border-inherit bg-white" />
        </div>
      </div>
    );
  }
);

MonopolyCanvas.displayName = 'MonopolyCanvas';
