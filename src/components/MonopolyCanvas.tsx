import React, { useEffect, useImperativeHandle, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { soundEngine } from '../audio/soundEngine';
import { BOARD_TILES } from '../game/boardData';
import {
  detectCashFlowTransfers,
  getVaultWorldAnchor,
} from '../game/currencyLogic';
import {
  createBoardFrameScheduler,
  detectBrowserGpu,
  GraphicsQualityProfile,
  resolveGraphicsProfile,
  shouldKeepBoardAnimating,
} from '../game/graphicsQuality';
import {
  computeCinematicCameraPose,
  computeDayNightLightingState,
  computeTokenHopTiming,
  DICE_BOX_FACE_VALUES,
  formatTilePriceLabel,
  getTileTransform,
  getTokenSlotOffset,
  isPurchasableTile,
} from '../game/rules';
import {
  CurrencyStyleId,
  GraphicsQualityTier,
  MatchBoardModifiers,
  PlayerState,
  PropertyState,
  TileKind,
} from '../game/types';
import {
  clampSpeechBubbleToViewport,
  computeSafeBoardCameraPose,
  getCityVisualProfile,
} from '../game/visualTheme';
import {
  CornerDioramaAnimRefs,
  createCornerDiorama,
  createCourtyardDiorama,
  createNightLightingPalette,
  createOwnershipBuildingSuite,
  createPlayerTokenMesh,
  createProtrudingPriceTab,
  createSurroundingVista,
  createTopCappedBoxGeometry,
  OwnershipBuildingSuiteRefs,
  ProtrudingPriceTabRefs,
} from '../three/models';
import { setAvatarOrbitSuspended } from './PlayerAvatar3D';
import {
  sampleDiceTrajectoryAt,
  simulateDeterministicDiceRoll,
  SimulatedDiceTrajectory,
} from '../three/physicsEngine';
import {
  createDiceFaceMaterials,
  createLevelBadgeTexture,
  createOuterPriceTabTexture,
  createStonePaperBumpMap,
  createTileTopTexture,
  createWoodGrainBumpMap,
  resolveDeedGroupPalette,
} from '../three/textures';
import { createTreasurySystem } from '../three/treasurySystem';
import { isGameFontsReadySync, whenAllGameFontsLoaded } from '../utils/fontLoader';

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
  selectableTileIndices?: number[];
  activePlayerId: number | null;
  boardModifiers: MatchBoardModifiers;
  turnTimeLeft: number;
  turnCount?: number;
  activeSpeechText?: string | null;
  currencyStyle?: CurrencyStyleId;
  graphicsQualityTier?: GraphicsQualityTier;
  isBoardOccluded?: boolean;
  cinematicCamera: boolean;
  nightMode: boolean;
  onSelectTile: (tileIndex: number) => void;
}

interface TileVisualEntry {
  index: number;
  group: THREE.Group;
  hitMesh: THREE.Mesh;
  topMat: THREE.MeshStandardMaterial;
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
  trajectory: SimulatedDiceTrajectory;
  nextCollisionIdx: number;
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

const WORLD_UP = new THREE.Vector3(0, 1, 0);
const TILE_SURFACE_Y = 0.44;
const GRASS_SURFACE_Y = 0.16;
const DICE_SIZE = 0.88;
const DICE_REST_Y = GRASS_SURFACE_Y + DICE_SIZE * 0.5;

function applySafeDefaultCameraPose(
  width: number,
  height: number,
  posOut: THREE.Vector3,
  targetOut: THREE.Vector3
): number {
  const pose = computeSafeBoardCameraPose(width, height);
  posOut.set(pose.posX, pose.posY, pose.posZ);
  targetOut.set(pose.targetX, pose.targetY, pose.targetZ);
  return pose.distance;
}

// Pre-allocated scratch math objects (zero per-frame GC)
const _scratchVecTarget = new THREE.Vector3();
const _scratchVecPos = new THREE.Vector3();
const _scratchDefaultCamPos = new THREE.Vector3();
const _scratchDefaultCamTarget = new THREE.Vector3();
const _scratchUnitScale = new THREE.Vector3(1, 1, 1);
const _scratchSpeechProj = new THREE.Vector3();
const _daySunPos = new THREE.Vector3(15, 27, 13);
const _nightMoonPos = new THREE.Vector3(-12, 24, 14);
const _dayOceanColor = new THREE.Color(0xdcf0ff);
const _nightOceanColor = new THREE.Color(0x111c3d);
const _dayIslandColor = new THREE.Color(0xffffff);
const _nightIslandColor = new THREE.Color(0x334155);
const _dayLawnColor = new THREE.Color(0xffffff);
const _nightLawnColor = new THREE.Color(0x528a39);

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
      selectableTileIndices = [],
      activePlayerId,
      boardModifiers,
      turnTimeLeft,
      turnCount = 1,
      activeSpeechText = null,
      currencyStyle = 'mixed',
      graphicsQualityTier = 'low',
      isBoardOccluded = false,
      cinematicCamera,
      nightMode,
      onSelectTile,
    },
    ref
  ) => {
    const mountRef = useRef<HTMLDivElement | null>(null);
    const speechBubbleRef = useRef<HTMLDivElement | null>(null);
    const speechTextSpanRef = useRef<HTMLSpanElement | null>(null);
    const speechTailRef = useRef<HTMLSpanElement | null>(null);

    const onSelectTileRef = useRef(onSelectTile);
    onSelectTileRef.current = onSelectTile;

    const playersRef = useRef(players);
    playersRef.current = players;

    const propertiesRef = useRef(properties);
    propertiesRef.current = properties;

    const selectedTileRef = useRef(selectedTileIndex);
    selectedTileRef.current = selectedTileIndex;

    const selectableTilesRef = useRef<Set<number>>(new Set(selectableTileIndices));
    selectableTilesRef.current = new Set(selectableTileIndices);

    const activePlayerIdRef = useRef(activePlayerId);
    activePlayerIdRef.current = activePlayerId;

    const boardModifiersRef = useRef(boardModifiers);
    boardModifiersRef.current = boardModifiers;

    const turnTimeLeftRef = useRef(turnTimeLeft);
    turnTimeLeftRef.current = turnTimeLeft;

    const turnCountRef = useRef(turnCount);
    turnCountRef.current = turnCount;

    const activeSpeechTextRef = useRef(activeSpeechText);
    activeSpeechTextRef.current = activeSpeechText;

    const currencyStyleRef = useRef<CurrencyStyleId>(currencyStyle);
    currencyStyleRef.current = currencyStyle;

    const qualityTierRef = useRef<GraphicsQualityTier>(graphicsQualityTier);
    qualityTierRef.current = graphicsQualityTier;

    const isBoardOccludedRef = useRef<boolean>(isBoardOccluded);
    isBoardOccludedRef.current = isBoardOccluded;

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
    const wakeRenderRef = useRef<((markBackdropDirty?: boolean) => void) | null>(
      null
    );
    const applyQualityTierRef = useRef<((tier: GraphicsQualityTier) => void) | null>(
      null
    );

    useEffect(() => {
      if (prevCinematicRef.current && !cinematicCamera) {
        cameraResetActiveRef.current = true;
        manualOrbitOverrideRef.current = false;
      } else if (!prevCinematicRef.current && cinematicCamera) {
        cameraResetActiveRef.current = false;
        manualOrbitOverrideRef.current = false;
      }
      prevCinematicRef.current = cinematicCamera;
      wakeRenderRef.current?.(true);
    }, [cinematicCamera]);

    useEffect(() => {
      applyQualityTierRef.current?.(graphicsQualityTier);
    }, [graphicsQualityTier]);

    useEffect(() => {
      // Always wake 1 frame when occlusion or core board state changes (e.g. entering/leaving Lobby or Pause)
      wakeRenderRef.current?.(true);
    }, [
      isBoardOccluded,
      nightMode,
      currencyStyle,
      players,
      properties,
      boardModifiers,
    ]);

    useEffect(() => {
      if (!isBoardOccluded) {
        wakeRenderRef.current?.();
      }
    }, [
      isBoardOccluded,
      selectedTileIndex,
      selectableTileIndices,
      activePlayerId,
      turnTimeLeft,
      turnCount,
      activeSpeechText,
    ]);

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
        wakeRenderRef.current?.();
      },
      animateDiceRoll: (die1: number, die2: number, speedMultiplier: number) => {
        manualOrbitOverrideRef.current = false;
        return new Promise<void>((resolve) => {
          if (activeDiceAnimRef.current) {
            const prevResolve = activeDiceAnimRef.current.resolve;
            activeDiceAnimRef.current = null;
            prevResolve();
          }
          const dice = diceMeshesRef.current;
          if (!dice) {
            resolve();
            return;
          }

          const trajectory = simulateDeterministicDiceRoll(die1, die2);
          activeDiceAnimRef.current = {
            elapsed: 0,
            duration: Math.max(0.62, trajectory.duration / speedMultiplier),
            trajectory,
            nextCollisionIdx: 0,
            resolve,
          };
          wakeRenderRef.current?.();
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
          if (activeHopAnimRef.current) {
            const prevResolve = activeHopAnimRef.current.resolve;
            activeHopAnimRef.current = null;
            prevResolve();
          }
          const token = tokenGroupsRef.current.get(playerId);
          if (!token || tilePath.length === 0) {
            resolve();
            return;
          }

          const firstTargetTf = getTileTransform(tilePath[0]);
          const { stepDurationSec } = computeTokenHopTiming(
            tilePath.length,
            speedMultiplier
          );
          activeHopAnimRef.current = {
            playerId,
            path: tilePath,
            stepIndex: 0,
            stepElapsed: 0,
            stepDuration: stepDurationSec,
            fromVec: token.position.clone(),
            toVec: new THREE.Vector3(firstTargetTf.x, TILE_SURFACE_Y, firstTargetTf.z),
            onStep,
            resolve,
          };
          wakeRenderRef.current?.();
        });
      },
    }));

    // Mount WebGLRenderer & Three.js Scene ONCE
    useEffect(() => {
      const container = mountRef.current;
      if (!container) return;

      const gpuInfo = detectBrowserGpu();
      const isSoftwareGl = gpuInfo.isSoftwareGl;
      let currentProfile: GraphicsQualityProfile = resolveGraphicsProfile(
        qualityTierRef.current,
        isSoftwareGl
      );

      const width = container.clientWidth || window.innerWidth;
      const height = container.clientHeight || window.innerHeight;

      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0xdcf0ff);

      // Low-FOV Isometric Camera (26 deg FOV) framing the full safe diamond board cleanly
      const camera = new THREE.PerspectiveCamera(26, width / height, 0.5, 380);
      const initialSafeDist = applySafeDefaultCameraPose(
        width,
        height,
        camera.position,
        _scratchDefaultCamTarget
      );
      camera.lookAt(_scratchDefaultCamTarget);

      const renderer = new THREE.WebGLRenderer({
        antialias: currentProfile.antialias,
        powerPreference: currentProfile.tier === 'high' ? 'high-performance' : 'default',
      });
      renderer.setSize(width, height);
      let currentPixelRatio = isSoftwareGl
        ? 1
        : Math.min(window.devicePixelRatio || 1, currentProfile.maxPixelRatio);
      renderer.setPixelRatio(currentPixelRatio);
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.02;
      renderer.shadowMap.enabled = currentProfile.shadowsEnabled;
      renderer.shadowMap.autoUpdate = false;
      renderer.shadowMap.type =
        currentProfile.tier === 'high' ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;

      container.innerHTML = '';
      container.appendChild(renderer.domElement);

      // Lazy Hardware WebGL2 MSAA EffectComposer + GTAOPass + Selective UnrealBloomPass (ONLY allocated on 'high' tier!)
      let composer: EffectComposer | null = null;
      let gtaoPass: GTAOPass | null = null;
      let bloomPass: UnrealBloomPass | null = null;
      let outputPass: OutputPass | null = null;
      let composerRT: THREE.WebGLRenderTarget | null = null;
      let composerPixelRatio = 0;
      let composerWidth = 0;
      let composerHeight = 0;
      let transparentListDirty = true;
      let aoCacheDirty = true;
      const cachedTransparentMeshes: THREE.Mesh[] = [];

      const rebuildTransparentMeshCache = () => {
        cachedTransparentMeshes.length = 0;
        scene.traverse((obj) => {
          if (obj instanceof THREE.Mesh) {
            const m = Array.isArray(obj.material) ? obj.material[0] : obj.material;
            if (m && (m.transparent || m.depthWrite === false)) {
              cachedTransparentMeshes.push(obj);
            }
          }
        });
        transparentListDirty = false;
      };

      const disposePostProcessing = () => {
        bloomPass?.dispose();
        outputPass?.dispose();
        gtaoPass?.dispose();
        composer?.dispose();
        composerRT?.dispose();
        bloomPass = null;
        outputPass = null;
        gtaoPass = null;
        composer = null;
        composerRT = null;
        composerPixelRatio = 0;
        composerWidth = 0;
        composerHeight = 0;
      };

      const syncComposerDimensions = (w: number, h: number, pxRatio: number) => {
        if (!composer) return;
        const sizeChanged = composerWidth !== w || composerHeight !== h;
        const ratioChanged = composerPixelRatio !== pxRatio;
        if (!sizeChanged && !ratioChanged) return;
        composerWidth = w;
        composerHeight = h;
        composerPixelRatio = pxRatio;
        if (ratioChanged && !sizeChanged) {
          composer.setPixelRatio(pxRatio);
        } else {
          if (ratioChanged) {
            composer.setPixelRatio(pxRatio);
          }
          composer.setSize(w, h);
        }
      };

      const ensurePostProcessing = (
        w: number,
        h: number,
        pxRatio: number,
        nightFactorNow: number
      ): boolean => {
        if (isSoftwareGl || composer) return false;
        const effW = Math.max(1, Math.floor(w * pxRatio));
        const effH = Math.max(1, Math.floor(h * pxRatio));
        composerRT = new THREE.WebGLRenderTarget(effW, effH, {
          type: THREE.HalfFloatType,
          samples: 4,
        });
        composer = new EffectComposer(renderer, composerRT);
        composerPixelRatio = pxRatio;
        composerWidth = w;
        composerHeight = h;

        const renderPass = new RenderPass(scene, camera);
        composer.addPass(renderPass);

        const aoW = Math.max(1, Math.floor(effW * 0.5));
        const aoH = Math.max(1, Math.floor(effH * 0.5));
        gtaoPass = new GTAOPass(scene, camera, aoW, aoH);
        gtaoPass.output = GTAOPass.OUTPUT.Default;
        gtaoPass.blendIntensity = 0.68;
        gtaoPass.setSceneClipBox(
          new THREE.Box3(new THREE.Vector3(-16, -2, -16), new THREE.Vector3(16, 8, 16))
        );
        gtaoPass.updateGtaoMaterial({
          radius: 0.34,
          distanceExponent: 1.3,
          thickness: 0.65,
          scale: 0.9,
          samples: 8,
        });
        gtaoPass.updatePdMaterial({
          rings: 1,
          samples: 8,
        });
        const origGtaoSetSize = gtaoPass.setSize.bind(gtaoPass);
        gtaoPass.setSize = (fullW: number, fullH: number) => {
          aoCacheDirty = true;
          origGtaoSetSize(
            Math.max(1, Math.floor(fullW * 0.5)),
            Math.max(1, Math.floor(fullH * 0.5))
          );
        };
        const origGtaoRender = gtaoPass.render.bind(gtaoPass);
        const hiddenForPass: THREE.Mesh[] = [];
        const gtaoInternals = gtaoPass as unknown as {
          copyMaterial: THREE.ShaderMaterial;
          blendMaterial: THREE.ShaderMaterial;
          pdRenderTarget: THREE.WebGLRenderTarget;
          renderToScreen: boolean;
          blendIntensity: number;
          _renderPass: (
            r: THREE.WebGLRenderer,
            m: THREE.Material,
            rt: THREE.WebGLRenderTarget | null,
            clearColor?: number,
            clearAlpha?: number
          ) => void;
        };
        aoCacheDirty = true;
        gtaoPass.render = (rendererArg, writeBuf, readBuf, dtArg, maskArg) => {
          if (!aoCacheDirty && gtaoInternals.pdRenderTarget) {
            gtaoInternals.copyMaterial.uniforms.tDiffuse.value = readBuf.texture;
            gtaoInternals.copyMaterial.blending = THREE.NoBlending;
            gtaoInternals._renderPass(
              rendererArg,
              gtaoInternals.copyMaterial,
              gtaoInternals.renderToScreen ? null : writeBuf
            );
            gtaoInternals.blendMaterial.uniforms.intensity.value =
              gtaoInternals.blendIntensity;
            gtaoInternals.blendMaterial.uniforms.tDiffuse.value =
              gtaoInternals.pdRenderTarget.texture;
            gtaoInternals._renderPass(
              rendererArg,
              gtaoInternals.blendMaterial,
              gtaoInternals.renderToScreen ? null : writeBuf
            );
            return;
          }
          if (transparentListDirty) {
            rebuildTransparentMeshCache();
          }
          for (let i = 0; i < cachedTransparentMeshes.length; i++) {
            const mesh = cachedTransparentMeshes[i];
            if (mesh.visible) {
              mesh.visible = false;
              hiddenForPass.push(mesh);
            }
          }
          origGtaoRender(rendererArg, writeBuf, readBuf, dtArg, maskArg);
          for (let i = 0; i < hiddenForPass.length; i++) {
            hiddenForPass[i].visible = true;
          }
          hiddenForPass.length = 0;
          aoCacheDirty = false;
        };
        composer.addPass(gtaoPass);

        bloomPass = new UnrealBloomPass(new THREE.Vector2(effW, effH), 0.0, 0.36, 1.45);
        bloomPass.strength = nightFactorNow * 0.36;
        bloomPass.enabled = nightFactorNow > 0.005;
        composer.addPass(bloomPass);

        outputPass = new OutputPass();
        composer.addPass(outputPass);
        return true;
      };

      const handleContextLost = (e: Event) => {
        e.preventDefault();
      };
      renderer.domElement.addEventListener('webglcontextlost', handleContextLost);

      let envRT: THREE.WebGLRenderTarget | null = null;
      const ensureEnvironmentMap = (): THREE.Texture => {
        if (!envRT) {
          const pmremGenerator = new THREE.PMREMGenerator(renderer);
          envRT = pmremGenerator.fromScene(new RoomEnvironment(), 0.04);
          pmremGenerator.dispose();
        }
        return envRT.texture;
      };
      if (currentProfile.useEnvironmentMap) {
        scene.environment = ensureEnvironmentMap();
        scene.environmentIntensity = 0.34;
      } else {
        scene.environment = null;
      }

      // Bright, low-contrast global illumination (HemisphereLight + soft DirectionalLight)
      const hemiLight = new THREE.HemisphereLight(0xeef8ff, 0xffe9f2, 0.88);
      hemiLight.position.set(0, 32, 0);
      scene.add(hemiLight);

      const sunLight = new THREE.DirectionalLight(0xfffdf7, 0.98);
      sunLight.position.set(15, 27, 13);
      sunLight.castShadow = currentProfile.shadowsEnabled;
      const initialShadowRes =
        currentProfile.shadowMapSize > 0 ? currentProfile.shadowMapSize : 1024;
      sunLight.shadow.mapSize.width = initialShadowRes;
      sunLight.shadow.mapSize.height = initialShadowRes;
      const shadowD = 14.5;
      sunLight.shadow.camera.left = -shadowD;
      sunLight.shadow.camera.right = shadowD;
      sunLight.shadow.camera.top = shadowD;
      sunLight.shadow.camera.bottom = -shadowD;
      sunLight.shadow.camera.near = 4;
      sunLight.shadow.camera.far = 56;
      sunLight.shadow.bias = -0.0004;
      sunLight.shadow.normalBias = 0.018;
      scene.add(sunLight);

      const rimLight = new THREE.DirectionalLight(0xdcf0ff, 0.44);
      rimLight.position.set(-15, 14, -15);
      scene.add(rimLight);

      // OrbitControls locked gently around clean isometric range (dynamic maxDistance for portrait screens)
      let controlsChangedThisFrame = false;
      let isOrbitDragging = false;
      const prevFrameCamPos = new THREE.Vector3();
      const controls = new OrbitControls(camera, renderer.domElement);
      controls.target.copy(_scratchDefaultCamTarget);
      controls.enableDamping = !isSoftwareGl;
      controls.dampingFactor = 0.07;
      controls.minDistance = 14.0;
      controls.maxDistance = Math.max(96, initialSafeDist * 1.35);
      controls.minPolarAngle = 0.38;
      controls.maxPolarAngle = Math.PI / 2.3;
      controls.mouseButtons = {
        LEFT: THREE.MOUSE.ROTATE,
        MIDDLE: THREE.MOUSE.DOLLY,
        RIGHT: THREE.MOUSE.ROTATE,
      };
      controls.addEventListener('start', () => {
        isOrbitDragging = true;
        cameraResetActiveRef.current = false;
        manualOrbitOverrideRef.current = true;
        setAvatarOrbitSuspended(true);
      });
      controls.addEventListener('end', () => {
        isOrbitDragging = false;
        requestRender();
      });
      controls.update();

      if (currentProfile.usePostProcessing) {
        ensurePostProcessing(
          width,
          height,
          currentPixelRatio,
          nightModeRef.current ? 1 : 0
        );
      }

      const maxAniso = renderer.capabilities.getMaxAnisotropy();
      const woodBump = createWoodGrainBumpMap();
      const tilePaperBump = createStonePaperBumpMap();
      const nightPalette = createNightLightingPalette(maxAniso);
      nightPalette.skyDomeUniforms.uLinearOutput.value = composer ? 1 : 0;

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
      const clickableStaticMeshes: THREE.Object3D[] = [];
      const sharedBoxGeoCache = new Map<string, THREE.BufferGeometry>();
      const getSharedBoxGeo = (w: number, h: number, d: number): THREE.BufferGeometry => {
        const key = `box:${w.toFixed(3)}x${h.toFixed(3)}x${d.toFixed(3)}`;
        let geo = sharedBoxGeoCache.get(key);
        if (!geo) {
          geo = new THREE.BoxGeometry(w, h, d);
          geo.userData.sharedStatic = true;
          sharedBoxGeoCache.set(key, geo);
        }
        return geo;
      };
      const getSharedTopCappedBoxGeo = (
        w: number,
        h: number,
        d: number
      ): THREE.BufferGeometry => {
        const key = `capped:${w.toFixed(3)}x${h.toFixed(3)}x${d.toFixed(3)}`;
        let geo = sharedBoxGeoCache.get(key);
        if (!geo) {
          geo = createTopCappedBoxGeometry(w, h, d);
          geo.userData.sharedStatic = true;
          sharedBoxGeoCache.set(key, geo);
        }
        return geo;
      };

      for (const tile of BOARD_TILES) {
        const tf = getTileTransform(tile.index);
        const tileGroup = new THREE.Group();
        tileGroup.position.set(tf.x, 0, tf.z);
        tileGroup.rotation.y = tf.rotationY;
        tileGroup.userData.tileIndex = tile.index;

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
          getSharedBoxGeo(tf.width - 0.09, 0.28, tf.depth - 0.09),
          lowerBlockMat
        );
        lowerPlinth.position.y = -0.24;
        lowerPlinth.castShadow = true;
        lowerPlinth.receiveShadow = true;
        tileGroup.add(lowerPlinth);

        // Extruded #F4F5F7 off-white 3D stone/plastic block up to TILE_SURFACE_Y = 0.44 (2 draw groups instead of 6!)
        const mainBlockHeight = 0.56;
        const tileGeo = getSharedTopCappedBoxGeo(
          tf.width - 0.05,
          mainBlockHeight,
          tf.depth - 0.05
        );
        const mats = [sideBodyMat, topMat];
        const tileMesh = new THREE.Mesh(tileGeo, mats);
        tileMesh.position.y = TILE_SURFACE_Y - mainBlockHeight / 2;
        tileMesh.receiveShadow = true;
        tileMesh.castShadow = true;
        tileMesh.userData.tileIndex = tile.index;
        tileGroup.add(tileMesh);
        clickableStaticMeshes.push(tileMesh);

        // 4 Corner 3D Dioramas (0: Start Arch, 8: Lost Island, 16: National Cup Stadium, 24: World Tour Airport)
        if (tf.isCorner) {
          const { group: dioramaGroup, anim: dioramaAnim } = createCornerDiorama(
            tile.index,
            TILE_SURFACE_Y,
            nightPalette
          );
          // Cancel tileGroup's rotationY so corner dioramas orient consistently toward the isometric diamond camera
          dioramaGroup.rotation.y = -tf.rotationY;
          tileGroup.add(dioramaGroup);
          cornerAnims.push(dioramaAnim);
        }

        const accentHex =
          tile.kind === TileKind.PROPERTY
            ? resolveDeedGroupPalette(tile.group, tile.groupColor).topHex
            : tile.kind === TileKind.TAX
              ? '#E11D48'
              : '#0EA5E9';

        // Protruding 3D Outer Price/Rent Tab extending outward from the tile edge
        let priceTab: ProtrudingPriceTabRefs | null = null;
        let lastTabSignature = '';
        const initialPriceLabel = formatTilePriceLabel(tile);
        if (initialPriceLabel !== null) {
          priceTab = createProtrudingPriceTab(
            initialPriceLabel,
            accentHex,
            flip180,
            maxAniso
          );
          priceTab.hitMesh.userData.tileIndex = tile.index;
          tileGroup.add(priceTab.group);
          clickableStaticMeshes.push(priceTab.hitMesh);
          lastTabSignature = `${initialPriceLabel}|null|false|null|false|false`;
        }

        // Outer rim ownership accent strip
        let ownerStrip: THREE.Mesh | null = null;
        let ownerMat: THREE.MeshStandardMaterial | null = null;
        const isOwnable = isPurchasableTile(tile);

        if (isOwnable) {
          ownerMat = new THREE.MeshStandardMaterial({
            color: 0xcbd5e1,
            roughness: 0.65,
            metalness: 0.1,
          });
          ownerStrip = new THREE.Mesh(
            getSharedBoxGeo(tf.width - 0.12, 0.08, 0.14),
            ownerMat
          );
          ownerStrip.position.set(0, TILE_SURFACE_Y + 0.024, tf.depth / 2 - 0.1);
          ownerStrip.visible = false;
          tileGroup.add(ownerStrip);
        }

        // Full-Color Regional Ownership 3D Miniature Buildings on PROPERTY & RESORT tiles
        let buildingSuite: OwnershipBuildingSuiteRefs | null = null;
        if (isOwnable) {
          const visualProfile = getCityVisualProfile(tile.index);
          buildingSuite = createOwnershipBuildingSuite(
            tf.width,
            tf.depth,
            TILE_SURFACE_Y,
            nightPalette,
            maxAniso,
            visualProfile.architectureStyle
          );
          buildingSuite.setQualityOptions({
            shadowsEnabled: currentProfile.shadowsEnabled,
            clearcoatEnabled: currentProfile.usePhysicalClearcoat,
          });
          buildingSuite.levelBadgeMesh.rotation.y = -tf.rotationY + Math.PI / 4;
          buildingSuite.shieldGroup.rotation.y = -tf.rotationY + Math.PI / 4;
          tileGroup.add(buildingSuite.root);
        }

        scene.add(tileGroup);
        tileEntries.push({
          index: tile.index,
          group: tileGroup,
          hitMesh: tileMesh,
          topMat,
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

      if (!isGameFontsReadySync()) {
        void whenAllGameFontsLoaded().then(() => {
          if (disposed) return;
          for (const entry of tileEntries) {
            const tileDef = BOARD_TILES[entry.index];
            const prevMap = entry.topMat.map;
            const nextMap = createTileTopTexture(tileDef, maxAniso, entry.flip180);
            entry.topMat.map = nextMap;
            entry.topMat.needsUpdate = true;
            prevMap?.dispose();
            entry.lastTabSignature = '';
            entry.lastBadgeSignature = '';
          }
          courtyardAnim.refreshTextTextures();
          wakeRenderRef.current?.();
        });
      }

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

      // 2 Oversized Glossy Hot-Pink Rounded Clearcoat 3D Dice with Recessed Pips
      const diceGeo = new RoundedBoxGeometry(DICE_SIZE, DICE_SIZE, DICE_SIZE, 5, 0.135);
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

      // Zero-GC Pooled 3D Celebratory Sparkle/Star Particle Burst System!
      const PARTICLE_POOL_SIZE = 44;
      const particleGeo = new THREE.OctahedronGeometry(0.095, 0);
      interface SparkParticle {
        mesh: THREE.Mesh;
        mat: THREE.MeshBasicMaterial;
        vx: number;
        vy: number;
        vz: number;
        life: number;
        maxLife: number;
        active: boolean;
      }
      const sparkPool: SparkParticle[] = [];
      let sparkCursor = 0;
      for (let i = 0; i < PARTICLE_POOL_SIZE; i++) {
        const mat = new THREE.MeshBasicMaterial({
          color: 0xfde047,
          transparent: true,
          opacity: 0,
          toneMapped: false,
        });
        const mesh = new THREE.Mesh(particleGeo, mat);
        mesh.visible = false;
        scene.add(mesh);
        sparkPool.push({
          mesh,
          mat,
          vx: 0,
          vy: 0,
          vz: 0,
          life: 0,
          maxLife: 0.75,
          active: false,
        });
      }

      const spawnParticleBurst = (
        wx: number,
        wy: number,
        wz: number,
        primaryHex: string,
        count = 14
      ) => {
        for (let c = 0; c < count; c++) {
          const sp = sparkPool[sparkCursor];
          sparkCursor = (sparkCursor + 1) % PARTICLE_POOL_SIZE;
          const angle = (c / count) * Math.PI * 2 + (c % 3) * 0.21;
          const speed = 1.6 + (c % 4) * 0.65;
          sp.mesh.position.set(wx, wy, wz);
          sp.vx = Math.cos(angle) * speed;
          sp.vy = 2.8 + (c % 3) * 0.95;
          sp.vz = Math.sin(angle) * speed;
          sp.life = 0;
          sp.maxLife = 0.68 + (c % 3) * 0.14;
          sp.active = true;
          sp.mat.color.set(c % 2 === 0 ? primaryHex : '#FDE047');
          sp.mat.opacity = 1;
          sp.mesh.scale.setScalar(1);
          sp.mesh.visible = true;
        }
      };

      // GPU InstancedMesh 3D Treasury Vaults (4 Player Trays + Central Bank + GLSL Flutter/Glint)
      const treasury = createTreasurySystem(maxAniso, isSoftwareGl);
      treasury.setQualityProfile(currentProfile);
      treasury.syncVaults(playersRef.current, currencyStyleRef.current, 0);
      scene.add(treasury.group);

      let prevCashPlayersSnapshot: PlayerState[] = playersRef.current.map((p) => ({
        ...p,
      }));
      let prevCashPropsSnapshot: Record<number, PropertyState> = {
        ...propertiesRef.current,
      };

      if (!isSoftwareGl && currentProfile.tier === 'high') {
        renderer.compile(scene, camera);
      }

      let disposed = false;
      let elapsedSec = 0;
      let shadowMapDirty = true;
      let occludedBackdropDirty = true;
      let renderedFrames = 0;
      let viewportWidth = width;
      let viewportHeight = height;
      let cachedBubbleW = 0;
      let cachedBubbleH = 0;
      let cachedBubbleVisible = false;
      let cachedBubbleBorderColor = '';
      renderer.domElement.dataset.qualityTier = currentProfile.tier;
      renderer.domElement.dataset.renderedFrames = '0';

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

      const resolveHitTileIndex = (obj: THREE.Object3D | null): number | null => {
        let cur: THREE.Object3D | null = obj;
        while (cur) {
          if (typeof cur.userData?.tileIndex === 'number') {
            return cur.userData.tileIndex as number;
          }
          cur = cur.parent;
        }
        return null;
      };

      const raycastBoardTile = (clientX: number, clientY: number): number | null => {
        updateNDC(clientX, clientY);
        raycaster.setFromCamera(pointerNDC, camera);
        const targets: THREE.Object3D[] = [...clickableStaticMeshes];
        for (const entry of tileEntries) {
          if (entry.displayedLevel >= 0 && entry.buildingSuite) {
            targets.push(entry.buildingSuite.root);
          }
        }
        for (const tok of tokenGroupsRef.current.values()) {
          if (tok.visible) targets.push(tok);
        }
        const hits = raycaster.intersectObjects(targets, true);
        for (const hit of hits) {
          const tIdx = resolveHitTileIndex(hit.object);
          if (tIdx !== null) return tIdx;
        }
        return null;
      };

      const onPointerUp = (e: PointerEvent) => {
        const dist = Math.hypot(e.clientX - downX, e.clientY - downY);
        if (dist > 6 || e.button !== 0) return;

        const tIdx = raycastBoardTile(e.clientX, e.clientY);
        if (tIdx !== null) {
          onSelectTileRef.current(tIdx);
        }
      };

      let requestRender: (markBackdropDirty?: boolean) => void = () => {};

      const onPointerMove = (e: PointerEvent) => {
        if (isBoardOccludedRef.current || e.buttons !== 0) return;
        const now = performance.now();
        if (now - lastMoveCheck < 50) return;
        lastMoveCheck = now;

        const nextHovered = raycastBoardTile(e.clientX, e.clientY);
        if (nextHovered !== hoveredTileIdx) {
          hoveredTileIdx = nextHovered;
          renderer.domElement.style.cursor = nextHovered !== null ? 'pointer' : 'grab';
          requestRender();
        } else {
          renderer.domElement.style.cursor = nextHovered !== null ? 'pointer' : 'grab';
        }
      };

      const onPointerLeave = () => {
        if (hoveredTileIdx !== null) {
          hoveredTileIdx = null;
          renderer.domElement.style.cursor = 'grab';
          requestRender();
        }
      };

      renderer.domElement.addEventListener('pointerdown', onPointerDown);
      renderer.domElement.addEventListener('pointerup', onPointerUp);
      renderer.domElement.addEventListener('pointermove', onPointerMove);
      renderer.domElement.addEventListener('pointerleave', onPointerLeave);

      controls.addEventListener('change', () => {
        controlsChangedThisFrame = true;
        requestRender();
      });

      const handleResize = () => {
        if (!container) return;
        const w = container.clientWidth || window.innerWidth;
        const h = container.clientHeight || window.innerHeight;
        viewportWidth = w;
        viewportHeight = h;
        const nextAspect = w / h;
        camera.aspect = nextAspect;
        camera.updateProjectionMatrix();
        currentPixelRatio = isSoftwareGl
          ? 1
          : Math.min(window.devicePixelRatio || 1, currentProfile.maxPixelRatio);
        renderer.setPixelRatio(currentPixelRatio);
        renderer.setSize(w, h);
        syncComposerDimensions(w, h, currentPixelRatio);
        const safeDist = applySafeDefaultCameraPose(
          w,
          h,
          _scratchDefaultCamPos,
          _scratchDefaultCamTarget
        );
        controls.maxDistance = Math.max(96, safeDist * 1.35);
        if (!cinematicCameraRef.current && !manualOrbitOverrideRef.current) {
          camera.position.copy(_scratchDefaultCamPos);
          controls.target.copy(_scratchDefaultCamTarget);
          controls.update();
        }
        shadowMapDirty = true;
        requestRender(true);
      };
      const resizeObserver = new ResizeObserver(handleResize);
      resizeObserver.observe(container);
      window.addEventListener('resize', handleResize);

      let currentNightFactor = nightModeRef.current ? 1 : 0;
      let appliedNightSnapshot = -1;
      let lastRenderedSpeech = '';

      const applyQualityTier = (nextTier: GraphicsQualityTier) => {
        if (disposed) return;
        const nextProfile = resolveGraphicsProfile(nextTier, isSoftwareGl);
        currentProfile = nextProfile;
        renderer.domElement.dataset.qualityTier = nextProfile.tier;

        const w = viewportWidth || container.clientWidth || window.innerWidth;
        const h = viewportHeight || container.clientHeight || window.innerHeight;
        currentPixelRatio = isSoftwareGl
          ? 1
          : Math.min(window.devicePixelRatio || 1, nextProfile.maxPixelRatio);
        renderer.setPixelRatio(currentPixelRatio);
        renderer.setSize(w, h);

        scene.environment = nextProfile.useEnvironmentMap ? ensureEnvironmentMap() : null;
        appliedNightSnapshot = -1;

        renderer.shadowMap.enabled = nextProfile.shadowsEnabled;
        renderer.shadowMap.type =
          nextProfile.tier === 'high' ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
        sunLight.castShadow = nextProfile.shadowsEnabled;

        if (!nextProfile.shadowsEnabled) {
          sunLight.shadow.map?.dispose();
          sunLight.shadow.map = null;
        } else if (
          nextProfile.shadowMapSize > 0 &&
          sunLight.shadow.mapSize.width !== nextProfile.shadowMapSize
        ) {
          sunLight.shadow.map?.dispose();
          sunLight.shadow.map = null;
          sunLight.shadow.mapSize.set(
            nextProfile.shadowMapSize,
            nextProfile.shadowMapSize
          );
        }
        shadowMapDirty = true;

        for (const entry of tileEntriesRef.current) {
          entry.buildingSuite?.setQualityOptions({
            shadowsEnabled: nextProfile.shadowsEnabled,
            clearcoatEnabled: nextProfile.usePhysicalClearcoat,
          });
        }
        treasury.setQualityProfile(nextProfile);

        if (nextProfile.usePostProcessing) {
          const createdNow = ensurePostProcessing(
            w,
            h,
            currentPixelRatio,
            currentNightFactor
          );
          if (!createdNow) {
            syncComposerDimensions(w, h, currentPixelRatio);
          }
        } else {
          disposePostProcessing();
        }
        nightPalette.skyDomeUniforms.uLinearOutput.value = composer ? 1 : 0;

        requestRender(true);
      };
      applyQualityTierRef.current = applyQualityTier;

      const syncSceneFromState = (
        simDt: number,
        animDt: number,
        elapsed: number
      ): boolean => {
        const currentPlayers = playersRef.current;
        const currentProps = propertiesRef.current;
        const selectedIdx = selectedTileRef.current;
        const animateAmbient = currentProfile.animateAmbientProps;
        let hasActiveMotion = false;
        let sceneShadowCastersMoved = false;

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
        } else {
          hasActiveMotion = true;
        }

        const lightState = computeDayNightLightingState(currentNightFactor);
        if (Math.abs(appliedNightSnapshot - currentNightFactor) > 0.0005) {
          appliedNightSnapshot = currentNightFactor;
          sceneShadowCastersMoved = true;
          (scene.background as THREE.Color).setHex(lightState.skyHex);
          nightPalette.skyDomeUniforms.uNightFactor.value = currentNightFactor;

          const noEnvHemiBoost = currentProfile.useEnvironmentMap ? 1.0 : 1.12;
          const noEnvKeyBoost = currentProfile.useEnvironmentMap ? 1.0 : 1.05;

          hemiLight.color.setHex(lightState.hemiSkyHex);
          hemiLight.groundColor.setHex(lightState.hemiGroundHex);
          hemiLight.intensity = lightState.hemiIntensity * noEnvHemiBoost;

          sunLight.color.setHex(lightState.keyLightHex);
          sunLight.intensity = lightState.keyLightIntensity * noEnvKeyBoost;
          sunLight.position.lerpVectors(_daySunPos, _nightMoonPos, currentNightFactor);

          rimLight.intensity = lightState.rimLightIntensity;
          scene.environmentIntensity = currentProfile.useEnvironmentMap
            ? lightState.envIntensity
            : 0;
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
          if (bloomPass) {
            bloomPass.strength = currentNightFactor * 0.36;
            bloomPass.enabled = currentNightFactor > 0.005;
          }
        }

        if (currentNightFactor > 0.005) {
          const gentleShimmer = animateAmbient
            ? 0.94 + Math.sin(elapsed * 2.7) * 0.06
            : 0.97;
          nightPalette.houseWindowMat.emissiveIntensity =
            lightState.windowEmissiveIntensity * gentleShimmer;
          nightPalette.hotelWindowMat.emissiveIntensity =
            lightState.windowEmissiveIntensity * 1.15;
          nightPalette.hotelBeaconMat.emissiveIntensity =
            lightState.windowEmissiveIntensity *
            (animateAmbient ? 0.95 + Math.sin(elapsed * 4.2) * 0.18 : 1.0);
          nightPalette.streetLampBulbMat.emissiveIntensity =
            lightState.lampBulbEmissiveIntensity;
          nightPalette.lanternSilkMat.emissiveIntensity =
            lightState.windowEmissiveIntensity *
            (animateAmbient ? 0.85 + Math.sin(elapsed * 3.1) * 0.1 : 0.92);
          nightPalette.fountainWaterMat.emissiveIntensity = currentNightFactor * 1.1;
          nightPalette.tokenHeadlightMat.emissiveIntensity = currentNightFactor * 2.4;
        } else {
          nightPalette.houseWindowMat.emissiveIntensity = 0;
          nightPalette.hotelWindowMat.emissiveIntensity = 0;
          nightPalette.hotelBeaconMat.emissiveIntensity = 0;
          nightPalette.streetLampBulbMat.emissiveIntensity = 0;
          nightPalette.lanternSilkMat.emissiveIntensity = 0;
          nightPalette.fountainWaterMat.emissiveIntensity = 0;
          nightPalette.tokenHeadlightMat.emissiveIntensity = 0;
        }

        // 1. Sync Stylized 3D Character Pawns
        const validIds = new Set(currentPlayers.map((p) => p.id));
        for (const [id, mesh] of tokenGroupsRef.current.entries()) {
          if (!validIds.has(id)) {
            scene.remove(mesh);
            tokenGroupsRef.current.delete(id);
            transparentListDirty = true;
            sceneShadowCastersMoved = true;
          }
        }

        for (const p of currentPlayers) {
          let token = tokenGroupsRef.current.get(p.id);
          if (
            token &&
            (token.userData.tokenType !== p.tokenType || token.userData.color !== p.color)
          ) {
            scene.remove(token);
            token.traverse((obj) => {
              if (obj instanceof THREE.Mesh) {
                if (obj.geometry && !obj.geometry.userData?.sharedStatic) {
                  obj.geometry.dispose();
                }
                const disposeTokMat = (m: THREE.Material) => {
                  if (m.userData?.sharedStatic) return;
                  m.dispose();
                };
                if (Array.isArray(obj.material)) {
                  obj.material.forEach(disposeTokMat);
                } else if (obj.material) {
                  disposeTokMat(obj.material);
                }
              }
            });
            tokenGroupsRef.current.delete(p.id);
            token = undefined;
            transparentListDirty = true;
            sceneShadowCastersMoved = true;
          }
          if (!token) {
            token = createPlayerTokenMesh(p.tokenType, p.color, nightPalette);
            token.userData.tokenType = p.tokenType;
            token.userData.color = p.color;
            const startPos = computeTokenRestWorldPos(p.id, p.position, currentPlayers);
            token.position.copy(startPos);
            scene.add(token);
            tokenGroupsRef.current.set(p.id, token);
            transparentListDirty = true;
            sceneShadowCastersMoved = true;
          }
          if (token.visible !== !p.bankrupt) {
            token.visible = !p.bankrupt;
            sceneShadowCastersMoved = true;
          }

          const hop = activeHopAnimRef.current;
          if (!hop || hop.playerId !== p.id) {
            const targetPos = computeTokenRestWorldPos(p.id, p.position, currentPlayers);
            token.userData.tileIndex = p.position;
            const alpha = 1 - Math.exp(-12 * simDt);
            if (token.position.distanceToSquared(targetPos) > 0.00002) {
              token.position.lerp(targetPos, alpha);
              hasActiveMotion = true;
              sceneShadowCastersMoved = true;
            } else {
              token.position.copy(targetPos);
            }

            // Orient 3D character pawn toward the isometric camera (idle sway only when ambient props enabled)
            const targetRotY = animateAmbient
              ? Math.PI / 4 + Math.sin(elapsed * 1.8 + p.id * 1.3) * 0.14
              : Math.PI / 4;
            token.rotation.y = animateAmbient
              ? THREE.MathUtils.lerp(token.rotation.y, targetRotY, alpha)
              : targetRotY;
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
            const pulse = animateAmbient ? 1 + Math.sin(elapsed * 4.5) * 0.08 : 1;
            activeRingRef.current.scale.set(pulse, pulse, 1);
            (activeRingRef.current.material as THREE.MeshBasicMaterial).color.set(
              activeP.color
            );
          }
        } else if (activeRingRef.current) {
          activeRingRef.current.visible = false;
        }

        // 1b. Sync Sunken Grass Center 3D Championship Status & Turn/Timer Console
        const currentMods = boardModifiersRef.current;
        if (currentMods.championshipTileIndex !== null) {
          const hostTile = BOARD_TILES[currentMods.championshipTileIndex];
          const hostLabel = hostTile?.shortName || hostTile?.name || '';
          courtyardAnim.updateTaxDisplay(
            `×${currentMods.championshipMultiplier} · ${hostLabel}`,
            'CÚP QUỐC GIA'
          );
        } else {
          courtyardAnim.updateTaxDisplay('VIỆT NAM 3D', 'CỜ TỶ PHÚ');
        }
        courtyardAnim.updateCountdown(
          turnTimeLeftRef.current,
          turnCountRef.current,
          activeP?.color || '#29B6F6'
        );

        // 1c. Animate 4 Corner 3D Dioramas (only when ambient animations enabled)
        if (animateAmbient) {
          for (const cAnim of cornerAnims) {
            if (cAnim.spinTarget) {
              cAnim.spinTarget.rotation.y = elapsed * 1.35;
            }
            if (cAnim.bobTarget) {
              cAnim.bobTarget.position.y =
                cAnim.baseBobY + Math.sin(elapsed * 2.8 + cAnim.tileIndex) * 0.075;
            }
          }
        }

        // 2. Sync Full-Color Ownership 3D Buildings, Shield Badges, Level Badges & Outer Live Rent Tabs
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
              entry.ownerMat.color.set(owner.color);
            } else {
              entry.ownerStrip.visible = false;
            }
          }

          const isOwned = Boolean(owner && propState && propState.ownerId !== null);
          const targetLevel = isOwned && propState ? propState.level : -1;

          const isOutage = Boolean(currentMods.outageTileIndices?.includes(entry.index));
          const isShielded = Boolean(currentMods.shieldedTileIndices?.includes(entry.index));

          // Sync Protruding 3D Outer Price / Live Rent Tab
          if (entry.priceTab && tileDef) {
            const liveLabel =
              formatTilePriceLabel(tileDef, propState, currentProps, currentMods) || '';
            const ownerHex = owner ? owner.color : null;
            const isFestival = currentMods.festivalTileIndices.includes(entry.index);
            const cupMultiplier =
              currentMods.championshipTileIndex === entry.index
                ? Math.max(2, currentMods.championshipMultiplier)
                : null;
            const sig = `${liveLabel}|${ownerHex}|${isFestival}|${cupMultiplier}|${isOutage}|${isShielded}`;
            if (sig !== entry.lastTabSignature) {
              entry.lastTabSignature = sig;
              const prevMap = entry.priceTab.topMat.map;
              const nextMap = createOuterPriceTabTexture(
                liveLabel,
                entry.accentHex,
                ownerHex,
                { isFestival, cupMultiplier, isOutage, isShielded },
                entry.flip180,
                maxAniso
              );
              entry.priceTab.topMat.map = nextMap;
              entry.priceTab.topMat.needsUpdate = true;
              prevMap?.dispose();

              const collarColor = isOutage
                ? '#475569'
                : cupMultiplier
                  ? '#FACC15'
                  : isShielded
                    ? '#38BDF8'
                    : ownerHex
                      ? ownerHex
                      : liveLabel.startsWith('-')
                        ? '#FB7185'
                        : '#D5DCE6';
              entry.priceTab.collarMat.color.set(collarColor);
            }
          }

          // Sync Full-Color Ownership 3D Building Suite on PROPERTY & RESORT tiles
          if (entry.buildingSuite && tileDef) {
            const suite = entry.buildingSuite;
            if (!isOwned || !owner) {
              if (entry.displayedLevel !== -1) {
                sceneShadowCastersMoved = true;
              }
              suite.padMesh.visible = false;
              suite.starterPavilion.visible = false;
              suite.hotel.visible = false;
              suite.shieldGroup.visible = false;
              suite.levelBadgeMesh.visible = false;
              for (const h of suite.houses) h.visible = false;
              entry.displayedLevel = -1;
            } else {
              suite.padMesh.visible = true;
              const ownerSig = owner.color;
              if (ownerSig !== entry.lastOwnerSignature) {
                entry.lastOwnerSignature = ownerSig;
                suite.setOwnerTint(owner.color);
              }

              const effectiveLevel = tileDef.kind === TileKind.RESORT ? 0 : targetLevel;

              if (effectiveLevel !== entry.displayedLevel) {
                sceneShadowCastersMoved = true;
                if (effectiveLevel === 0) {
                  entry.popTimers[4] = 0.01;
                } else if (effectiveLevel === 4) {
                  entry.popTimers[3] = 0.01;
                } else if (effectiveLevel > 0) {
                  for (
                    let h = Math.max(0, entry.displayedLevel);
                    h < Math.min(effectiveLevel, 3);
                    h++
                  ) {
                    entry.popTimers[h] = 0.01;
                  }
                }
                if (effectiveLevel > entry.displayedLevel) {
                  spawnParticleBurst(
                    entry.group.position.x,
                    TILE_SURFACE_Y + (effectiveLevel >= 4 ? 0.9 : 0.45),
                    entry.group.position.z,
                    owner.color,
                    effectiveLevel >= 4 ? 20 : 12
                  );
                }
                entry.displayedLevel = effectiveLevel;
              }

              // Level 0 owned starter pavilion (Land-only PROPERTY or owned RESORT)
              const showStarter = effectiveLevel === 0;
              suite.starterPavilion.visible = showStarter;
              if (showStarter) {
                if (entry.popTimers[4] > 0 && entry.popTimers[4] < 1) {
                  entry.popTimers[4] = Math.min(1, entry.popTimers[4] + animDt * 3.4);
                  suite.starterPavilion.scale.setScalar(
                    Math.max(0.01, springPopScale(entry.popTimers[4]))
                  );
                  hasActiveMotion = true;
                  sceneShadowCastersMoved = true;
                } else {
                  suite.starterPavilion.scale.setScalar(1);
                }
              }

              // Level 1..3 houses
              for (let h = 0; h < suite.houses.length; h++) {
                const showHouse = effectiveLevel >= h + 1 && effectiveLevel < 4;
                const hGroup = suite.houses[h];
                hGroup.visible = showHouse;
                if (showHouse) {
                  if (entry.popTimers[h] > 0 && entry.popTimers[h] < 1) {
                    entry.popTimers[h] = Math.min(1, entry.popTimers[h] + animDt * 3.4);
                    hGroup.scale.setScalar(
                      Math.max(0.01, springPopScale(entry.popTimers[h]))
                    );
                    hasActiveMotion = true;
                    sceneShadowCastersMoved = true;
                  } else {
                    hGroup.scale.setScalar(1);
                  }
                }
              }

              // Level 4 Luxury Hotel + Floating 3D Protection Shield (shown for Hotels ★ AND Shielded cities!)
              const showHotel = effectiveLevel >= 4;
              const showShield = showHotel || isShielded;
              suite.hotel.visible = showHotel;
              suite.shieldGroup.visible = showShield;
              if (showHotel) {
                if (entry.popTimers[3] > 0 && entry.popTimers[3] < 1) {
                  entry.popTimers[3] = Math.min(1, entry.popTimers[3] + animDt * 3.0);
                  suite.hotel.scale.setScalar(
                    Math.max(0.01, springPopScale(entry.popTimers[3]))
                  );
                  hasActiveMotion = true;
                  sceneShadowCastersMoved = true;
                } else {
                  suite.hotel.scale.setScalar(1);
                }
              }
              if (showShield) {
                const shieldBaseY = showHotel ? TILE_SURFACE_Y + 1.52 : TILE_SURFACE_Y + 1.12;
                if (animateAmbient) {
                  suite.shieldGroup.position.y =
                    shieldBaseY + Math.sin(elapsed * 3.1 + entry.index) * 0.08;
                  suite.shieldGroup.rotation.y += animDt * 1.4;
                } else {
                  suite.shieldGroup.position.y = shieldBaseY;
                }
              }

              // Clean Square Level Badge ("1", "2", "3", "★") for upgraded PROPERTY tiles
              const displayBadgeLevel = Math.max(1, effectiveLevel);
              const showBadge = tileDef.kind === TileKind.PROPERTY && effectiveLevel >= 1;
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
                const baseBadgeY =
                  TILE_SURFACE_Y + (effectiveLevel >= 4 ? 1.15 : 0.86);
                suite.levelBadgeMesh.position.y = animateAmbient
                  ? baseBadgeY + Math.sin(elapsed * 2.6 + entry.index) * 0.04
                  : baseBadgeY;
              }
            }
          }

          // Selectable highlight pulse & Hover / Selected elevation
          const isSelectable = selectableTilesRef.current.has(entry.index);
          if (isSelectable) {
            entry.topMat.emissive.setHex(0xf59e0b);
            entry.topMat.emissiveIntensity = animateAmbient
              ? 0.18 + Math.sin(elapsed * 5 + entry.index) * 0.08
              : 0.24;
          } else if (entry.topMat.emissiveIntensity !== 0) {
            entry.topMat.emissiveIntensity = 0;
          }

          entry.targetLift = isSel ? 0.14 : isSelectable ? 0.09 : isHov ? 0.06 : 0;
          if (Math.abs(entry.group.position.y - entry.targetLift) > 0.0015) {
            entry.group.position.y = THREE.MathUtils.lerp(
              entry.group.position.y,
              entry.targetLift,
              1 - Math.exp(-14 * simDt)
            );
            hasActiveMotion = true;
            sceneShadowCastersMoved = true;
          } else if (entry.group.position.y !== entry.targetLift) {
            entry.group.position.y = entry.targetLift;
            sceneShadowCastersMoved = true;
          }
        }

        // 3. Advance cannon-es Rigid-Body 3D Dice trajectory & synchronized collision SFX
        const diceAnim = activeDiceAnimRef.current;
        const diceMeshes = diceMeshesRef.current;
        if (diceAnim && diceMeshes) {
          hasActiveMotion = true;
          sceneShadowCastersMoved = true;
          diceAnim.elapsed += animDt;
          const t = Math.min(1, diceAnim.elapsed / diceAnim.duration);

          while (
            diceAnim.nextCollisionIdx < diceAnim.trajectory.collisionTimes.length &&
            t >= diceAnim.trajectory.collisionTimes[diceAnim.nextCollisionIdx]
          ) {
            const impactIntensity = Math.max(
              0.22,
              1.0 - diceAnim.nextCollisionIdx * 0.2
            );
            soundEngine.playPhysicsDiceHit(impactIntensity);
            diceAnim.nextCollisionIdx++;
          }

          const pose = sampleDiceTrajectoryAt(diceAnim.trajectory, t);
          const [d1, d2] = diceMeshes;
          d1.position.copy(pose.pos1);
          d1.quaternion.copy(pose.quat1);
          d2.position.copy(pose.pos2);
          d2.quaternion.copy(pose.quat2);

          if (t >= 1) {
            const done = diceAnim.resolve;
            activeDiceAnimRef.current = null;
            done();
          }
        }

        // 4. Advance parabolic step-by-step 3D Pawn Hop animation
        const hopAnim = activeHopAnimRef.current;
        if (hopAnim) {
          hasActiveMotion = true;
          sceneShadowCastersMoved = true;
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

        // 5. Gentle floating bob for '?' Cards & Vietnamese Blossoms (when ambient motion enabled)
        if (animateAmbient) {
          for (const prop of animatedCars) {
            prop.group.position.y =
              prop.baseY + Math.sin(elapsed * 1.35 + prop.phase) * 0.055;
          }
        }

        // 5a. Live Per-Player 3D Treasury Vaults & Physical Incoming/Outgoing Cash-Flow Arcs!
        let cashStateChanged =
          prevCashPlayersSnapshot.length !== currentPlayers.length;
        if (!cashStateChanged) {
          for (let i = 0; i < currentPlayers.length; i++) {
            if (
              prevCashPlayersSnapshot[i].cash !== currentPlayers[i].cash ||
              prevCashPlayersSnapshot[i].bankrupt !== currentPlayers[i].bankrupt
            ) {
              cashStateChanged = true;
              break;
            }
          }
        }
        if (cashStateChanged) {
          const transfers = detectCashFlowTransfers(
            prevCashPlayersSnapshot,
            currentPlayers,
            prevCashPropsSnapshot,
            currentProps
          );
          if (transfers.length > 0) {
            treasury.enqueueTransfers(
              transfers,
              currentPlayers,
              currencyStyleRef.current
            );
            const primary = transfers[0];
            const isGain =
              primary.kind === 'BANK_TO_PLAYER' ||
              primary.kind === 'PLAYER_TO_PLAYER';
            soundEngine.playCurrencyTransfer(currencyStyleRef.current, isGain);

            for (const ev of transfers) {
              if (ev.toPlayerId !== null) {
                const dstSlot = currentPlayers.findIndex(
                  (p) => p.id === ev.toPlayerId
                );
                if (dstSlot >= 0) {
                  const va = getVaultWorldAnchor(dstSlot);
                  spawnParticleBurst(
                    va.x,
                    va.y + 0.42,
                    va.z,
                    currentPlayers[dstSlot].color,
                    10
                  );
                }
              }
            }
          }
          prevCashPlayersSnapshot = currentPlayers.map((p) => ({ ...p }));
          prevCashPropsSnapshot = { ...currentProps };
        } else {
          // Keep property snapshot synced across zero-cash mutations (e.g. EARTHQUAKE)
          for (const key of Object.keys(currentProps)) {
            const idx = Number(key);
            const prevP = prevCashPropsSnapshot[idx];
            const currP = currentProps[idx];
            if (!prevP || prevP.ownerId !== currP.ownerId || prevP.level !== currP.level) {
              prevCashPropsSnapshot = { ...currentProps };
              break;
            }
          }
        }

        const activeSlotIdx = Math.max(
          0,
          currentPlayers.findIndex((p) => p.id === activePlayerIdRef.current)
        );
        treasury.syncVaults(
          currentPlayers,
          currencyStyleRef.current,
          activeSlotIdx
        );
        const treasuryWasActive = cashStateChanged || treasury.hasActiveAnimations();
        treasury.update(animDt, elapsed);
        if (treasuryWasActive || treasury.hasActiveAnimations()) {
          hasActiveMotion = true;
          sceneShadowCastersMoved = true;
        }

        // 5b. Advance pooled 3D celebratory sparkle particles
        for (let i = 0; i < PARTICLE_POOL_SIZE; i++) {
          const sp = sparkPool[i];
          if (!sp.active) continue;
          hasActiveMotion = true;
          sp.life += animDt;
          if (sp.life >= sp.maxLife) {
            sp.active = false;
            sp.mesh.visible = false;
            continue;
          }
          const prog = sp.life / sp.maxLife;
          sp.vy -= 7.4 * animDt;
          sp.mesh.position.x += sp.vx * animDt;
          sp.mesh.position.y += sp.vy * animDt;
          sp.mesh.position.z += sp.vz * animDt;
          sp.mesh.rotation.x += 5.2 * animDt;
          sp.mesh.rotation.y += 6.4 * animDt;
          sp.mesh.scale.setScalar(Math.max(0.05, 1.15 * (1 - prog * 0.85)));
          sp.mat.opacity = 1 - prog * prog;
        }

        // 6. Camera Reset & Cinematic Camera Auto-Panning (scaled cleanly for 26-deg low-FOV)
        if (cameraResetActiveRef.current) {
          hasActiveMotion = true;
          const cw = viewportWidth || container.clientWidth || window.innerWidth;
          const ch = viewportHeight || container.clientHeight || window.innerHeight;
          applySafeDefaultCameraPose(
            cw,
            ch,
            _scratchDefaultCamPos,
            _scratchDefaultCamTarget
          );
          const camAlpha = 1 - Math.exp(-7 * animDt);
          camera.position.lerp(_scratchDefaultCamPos, camAlpha);
          controls.target.lerp(_scratchDefaultCamTarget, camAlpha);
          if (
            camera.position.distanceTo(_scratchDefaultCamPos) < 0.04 &&
            controls.target.distanceTo(_scratchDefaultCamTarget) < 0.04
          ) {
            camera.position.copy(_scratchDefaultCamPos);
            controls.target.copy(_scratchDefaultCamTarget);
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
            if (
              camera.position.distanceToSquared(_scratchVecPos) > 0.0004 ||
              controls.target.distanceToSquared(_scratchVecTarget) > 0.0004
            ) {
              hasActiveMotion = true;
            }
          }
        }

        // Apply OrbitControls damping BEFORE speech-bubble projection so 2D overlay has 0-frame lag
        controls.update();

        if (sceneShadowCastersMoved) {
          shadowMapDirty = true;
        }

        // 7. Zero-Reflow World-to-Screen 2D Comic Speech Bubble floating above Active 3D Character Pawn
        const bubbleEl = speechBubbleRef.current;
        const textSpanEl = speechTextSpanRef.current;
        const speechMsg = activeSpeechTextRef.current;
        if (bubbleEl && textSpanEl) {
          const activeTok = activeP ? tokenGroupsRef.current.get(activeP.id) : null;
          if (activeP && activeTok && speechMsg) {
            if (lastRenderedSpeech !== speechMsg) {
              lastRenderedSpeech = speechMsg;
              textSpanEl.textContent = speechMsg;
              cachedBubbleW =
                bubbleEl.offsetWidth || Math.max(120, speechMsg.length * 8.5 + 32);
              cachedBubbleH = bubbleEl.offsetHeight || 38;
            }

            _scratchSpeechProj.set(
              activeTok.position.x,
              activeTok.position.y + 1.38,
              activeTok.position.z
            );
            camera.updateMatrixWorld();
            _scratchSpeechProj.project(camera);

            if (_scratchSpeechProj.z >= -1 && _scratchSpeechProj.z <= 1) {
              const cw = viewportWidth || window.innerWidth;
              const ch = viewportHeight || window.innerHeight;
              const sx = (_scratchSpeechProj.x * 0.5 + 0.5) * cw;
              const sy = (-_scratchSpeechProj.y * 0.5 + 0.5) * ch;

              const estW = cachedBubbleW || Math.max(120, speechMsg.length * 8.5 + 32);
              const estH = cachedBubbleH || 38;
              const clamped = clampSpeechBubbleToViewport(
                sx,
                sy,
                estW,
                estH,
                cw,
                ch,
                14
              );
              if (cachedBubbleBorderColor !== activeP.color) {
                cachedBubbleBorderColor = activeP.color;
                bubbleEl.style.borderColor = activeP.color;
              }
              if (!cachedBubbleVisible) {
                cachedBubbleVisible = true;
                bubbleEl.style.opacity = '1';
              }
              bubbleEl.style.transform = `translate3d(${clamped.x.toFixed(1)}px, ${clamped.y.toFixed(1)}px, 0) translate(-50%, -100%)`;
              if (speechTailRef.current) {
                speechTailRef.current.style.transform = `translateX(calc(-50% + ${clamped.tailOffsetPx.toFixed(1)}px)) rotate(45deg)`;
              }
            } else if (cachedBubbleVisible) {
              cachedBubbleVisible = false;
              bubbleEl.style.opacity = '0';
            }
          } else if (cachedBubbleVisible) {
            cachedBubbleVisible = false;
            bubbleEl.style.opacity = '0';
          }
        }

        return hasActiveMotion;
      };

      const frameScheduler = createBoardFrameScheduler({
        isSoftwareGl,
        isDocumentHidden: () => typeof document !== 'undefined' && document.hidden,
        hasPendingGameplayPromises: () =>
          Boolean(activeDiceAnimRef.current || activeHopAnimRef.current),
        onMarkBackdropDirty: () => {
          occludedBackdropDirty = true;
        },
        afterSoftwareDraw: (scheduleTimeout, runNextTick) => {
          const gl = renderer.getContext() as WebGL2RenderingContext;
          let sync: WebGLSync | null = gl.fenceSync
            ? gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0)
            : null;
          gl.flush();
          const poll = () => {
            if (disposed) return;
            const state = sync
              ? gl.getSyncParameter(sync, gl.SYNC_STATUS)
              : gl.SIGNALED;
            if (state === gl.UNSIGNALED) {
              scheduleTimeout(poll, 5);
            } else {
              if (sync) {
                gl.deleteSync(sync);
                sync = null;
              }
              scheduleTimeout(runNextTick, 33);
            }
          };
          scheduleTimeout(poll, 5);
          return () => {
            if (sync) {
              gl.deleteSync(sync);
              sync = null;
            }
          };
        },
        onFrame: (rawDt) => {
          const simDt = Math.min(rawDt, 0.08);
          const animDt = Math.min(rawDt, isSoftwareGl ? 0.35 : 0.06);
          elapsedSec += simDt;

          controlsChangedThisFrame = false;
          if (isOrbitDragging && hoveredTileIdx !== null) {
            hoveredTileIdx = null;
          }
          prevFrameCamPos.copy(camera.position);
          const sceneMoving = syncSceneFromState(simDt, animDt, elapsedSec);
          const camMovedVisibly =
            prevFrameCamPos.distanceToSquared(camera.position) > 0.0025;
          const cameraOrbitActive = isOrbitDragging || camMovedVisibly;
          setAvatarOrbitSuspended(isOrbitDragging || controlsChangedThisFrame);
          const hasActiveMotion = sceneMoving || controlsChangedThisFrame;

          const docHidden = typeof document !== 'undefined' && document.hidden;
          const occludedNow = isBoardOccludedRef.current;
          if (!occludedNow) {
            occludedBackdropDirty = true;
          }
          const shouldDrawWebGl = !docHidden && (!occludedNow || occludedBackdropDirty);
          if (shouldDrawWebGl) {
            if (shadowMapDirty || controlsChangedThisFrame) {
              aoCacheDirty = true;
            }
            if (currentProfile.shadowsEnabled && shadowMapDirty) {
              renderer.shadowMap.needsUpdate = true;
              shadowMapDirty = false;
            } else if (!currentProfile.shadowsEnabled && shadowMapDirty) {
              shadowMapDirty = false;
            }
            if (gtaoPass) {
              gtaoPass.enabled = !cameraOrbitActive;
            }
            if (composer) {
              composer.render();
            } else {
              renderer.render(scene, camera);
            }
            if (occludedNow) {
              occludedBackdropDirty = false;
            }
            renderedFrames += 1;
            renderer.domElement.dataset.renderedFrames = String(renderedFrames);
          }

          const hasPendingGameplayPromises = Boolean(
            activeDiceAnimRef.current || activeHopAnimRef.current
          );
          return shouldKeepBoardAnimating({
            isDocumentHidden: docHidden,
            isBoardOccluded: occludedNow,
            hasActiveMotion,
            hasPendingGameplayPromises,
            idleBoardFps: currentProfile.idleBoardFps,
          });
        },
      });

      requestRender = frameScheduler.requestRender;
      wakeRenderRef.current = requestRender;
      const handleVisibilityChange = () => frameScheduler.handleVisibilityChange();
      document.addEventListener('visibilitychange', handleVisibilityChange);

      const winHook = window as unknown as {
        __btGetTileScreenPoint?: (
          tileIndex: number,
          mode?: 'tile' | 'buildingTop'
        ) => { x: number; y: number } | null;
      };
      winHook.__btGetTileScreenPoint = (tileIndex: number, mode = 'tile') => {
        const entry = tileEntriesRef.current[tileIndex];
        if (!entry) return null;
        scene.updateMatrixWorld(true);
        camera.updateMatrixWorld(true);
        const worldPos = new THREE.Vector3();
        if (mode === 'buildingTop' && entry.buildingSuite?.hotel.visible) {
          entry.buildingSuite.hotel.getWorldPosition(worldPos);
          worldPos.y += 0.48;
        } else if (mode === 'buildingTop' && entry.buildingSuite?.root.visible) {
          entry.buildingSuite.root.getWorldPosition(worldPos);
          worldPos.y += 0.36;
        } else {
          entry.group.getWorldPosition(worldPos);
          worldPos.y += 0.14;
        }
        worldPos.project(camera);
        const rect = renderer.domElement.getBoundingClientRect();
        return {
          x: rect.left + ((worldPos.x + 1) * 0.5) * rect.width,
          y: rect.top + ((-worldPos.y + 1) * 0.5) * rect.height,
        };
      };

      frameScheduler.runImmediateTick();

      return () => {
        disposed = true;
        setAvatarOrbitSuspended(false);
        delete winHook.__btGetTileScreenPoint;
        wakeRenderRef.current = null;
        applyQualityTierRef.current = null;
        frameScheduler.dispose();
        if (activeDiceAnimRef.current) {
          const pendingDiceResolve = activeDiceAnimRef.current.resolve;
          activeDiceAnimRef.current = null;
          pendingDiceResolve();
        }
        if (activeHopAnimRef.current) {
          const pendingHopResolve = activeHopAnimRef.current.resolve;
          activeHopAnimRef.current = null;
          pendingHopResolve();
        }
        resizeObserver.disconnect();
        window.removeEventListener('resize', handleResize);
        document.removeEventListener('visibilitychange', handleVisibilityChange);
        renderer.domElement.removeEventListener('pointerdown', onPointerDown);
        renderer.domElement.removeEventListener('pointerup', onPointerUp);
        renderer.domElement.removeEventListener('pointermove', onPointerMove);
        renderer.domElement.removeEventListener('pointerleave', onPointerLeave);
        renderer.domElement.removeEventListener('webglcontextlost', handleContextLost);
        controls.dispose();
        courtyardAnim.disposeDynamicTextures();
        treasury.dispose();
        disposePostProcessing();
        sunLight.shadow.map?.dispose();
        sunLight.shadow.map = null;

        scene.traverse((obj) => {
          if (obj instanceof THREE.Mesh || obj instanceof THREE.Points) {
            if (obj.geometry && !obj.geometry.userData?.sharedStatic) {
              obj.geometry.dispose();
            }
            const disposeObjMat = (m: THREE.Material) => {
              if (m.userData?.sharedStatic) return;
              const stdMat = m as THREE.MeshStandardMaterial;
              if (stdMat.map && !stdMat.map.userData?.sharedStatic) {
                stdMat.map.dispose();
              }
              if (stdMat.bumpMap && !stdMat.bumpMap.userData?.sharedStatic) {
                stdMat.bumpMap.dispose();
              }
              m.dispose();
            };
            if (Array.isArray(obj.material)) {
              obj.material.forEach(disposeObjMat);
            } else if (obj.material) {
              disposeObjMat(obj.material);
            }
          }
        });
        for (const geo of sharedBoxGeoCache.values()) {
          geo.dispose();
        }
        sharedBoxGeoCache.clear();
        woodBump.dispose();
        tilePaperBump.dispose();
        envRT?.dispose();
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
          className="pointer-events-none absolute left-0 top-0 z-10 rounded-2xl border-[3px] bg-white px-3.5 py-1.5 shadow-[0_8px_20px_rgba(15,23,42,0.24)] transition-opacity duration-150"
          style={{ opacity: 0, willChange: 'transform, opacity' }}
        >
          <span
            ref={speechTextSpanRef}
            className="block whitespace-nowrap text-xs font-extrabold tracking-normal text-slate-800 sm:text-[13px]"
          />
          <span
            ref={speechTailRef}
            style={{ transform: 'translateX(-50%) rotate(45deg)' }}
            className="absolute -bottom-[7px] left-1/2 h-3 w-3 border-b-[3px] border-r-[3px] border-inherit bg-white"
          />
        </div>
      </div>
    );
  }
);

MonopolyCanvas.displayName = 'MonopolyCanvas';
