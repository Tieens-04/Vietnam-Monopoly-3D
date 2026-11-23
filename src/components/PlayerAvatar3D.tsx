import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import {
  AvatarArchetypeId,
  AvatarMood,
  CHARACTER_PERSONAS,
  computeAvatarPoseTargets,
} from '../game/avatarLogic';
import {
  detectBrowserGpu,
  resolveGraphicsProfile,
} from '../game/graphicsQuality';
import { GraphicsQualityTier } from '../game/types';

export interface PlayerAvatar3DProps {
  archetype: AvatarArchetypeId;
  mood?: AvatarMood;
  /** Player slot index (0..3) used to stagger blink & idle phases naturally */
  phaseSeed?: number;
  /** +1 = left HUD card gazing slightly right/inward; -1 = right HUD card gazing slightly left/inward */
  facingSign?: -1 | 0 | 1;
  isBot?: boolean;
  isActive?: boolean;
  showBotStamp?: boolean;
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  ariaLabel?: string;
}

interface CharacterRigRefs {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  torsoGroup: THREE.Group;
  headGroup: THREE.Group;
  leftEyelid: THREE.Mesh;
  rightEyelid: THREE.Mesh;
  leftBrow: THREE.Mesh;
  rightBrow: THREE.Mesh;
  mouthArc: THREE.Mesh;
  propPivot: THREE.Group | null;
  jailBarsGroup: THREE.Group;
  hemiLight: THREE.HemisphereLight;
  keyLight: THREE.DirectionalLight;
  rimLight: THREE.DirectionalLight;
  setQualityFeatures: (
    envTex: THREE.Texture | null,
    useClearcoat: boolean
  ) => void;
  disposables: Array<{ dispose: () => void }>;
}

interface AvatarSubscriber {
  archetype: AvatarArchetypeId;
  canvas2d: HTMLCanvasElement;
  ctx2d: CanvasRenderingContext2D;
  getState: () => {
    mood: AvatarMood;
    phaseSeed: number;
    facingSign: -1 | 0 | 1;
    isActive: boolean;
    pointerX: number;
    pointerY: number;
  };
  currentPose: {
    headYaw: number;
    headPitch: number;
    headRoll: number;
    torsoYaw: number;
    torsoBobY: number;
    shoulderTiltZ: number;
    browAngle: number;
    browLiftY: number;
    smileScale: number;
    propGestureAngle: number;
  };
}

function applyPoseStateToRig(
  rig: CharacterRigRefs,
  pose: AvatarSubscriber['currentPose'],
  blinkAmount: number,
  mood: AvatarMood,
  isActive: boolean
): void {
  rig.torsoGroup.position.y = -0.62 + pose.torsoBobY;
  rig.torsoGroup.rotation.y = pose.torsoYaw;
  rig.torsoGroup.rotation.z = pose.shoulderTiltZ;

  rig.headGroup.rotation.set(pose.headPitch, pose.headYaw, pose.headRoll);

  // Eyelid blink sweep: rotates smoothly from open upper crease (-0.58 rad) down to closed (+0.14 rad)
  const lidScaleY = 0.14 + blinkAmount * 0.86;
  const lidRotX = -0.58 + blinkAmount * 0.72;
  rig.leftEyelid.scale.y = lidScaleY;
  rig.rightEyelid.scale.y = lidScaleY;
  rig.leftEyelid.rotation.x = lidRotX;
  rig.rightEyelid.rotation.x = lidRotX;

  // Expressive articulated eyebrows
  rig.leftBrow.position.y = 0.145 + pose.browLiftY;
  rig.rightBrow.position.y = 0.145 + pose.browLiftY;
  rig.leftBrow.rotation.z = pose.browAngle;
  rig.rightBrow.rotation.z = -pose.browAngle;

  // Confident smile vs stressed/jailed frown
  const smileMag = Math.max(0.35, Math.abs(pose.smileScale));
  rig.mouthArc.scale.set(1, smileMag * (pose.smileScale >= 0 ? 1 : -0.75), 1);
  rig.mouthArc.position.y = pose.smileScale >= 0 ? -0.115 : -0.145;

  if (rig.propPivot) {
    rig.propPivot.rotation.z = pose.propGestureAngle;
  }

  rig.jailBarsGroup.visible = mood === 'jailed';

  // Dynamic active-turn golden rim boost
  rig.keyLight.intensity = mood === 'bankrupt' ? 0.72 : isActive ? 1.65 : 1.32;
  rig.rimLight.intensity = isActive || mood === 'celebrating' ? 1.35 : 0.78;
}

/**
 * Shared Single-Context Offscreen WebGL Avatar Engine.
 * - Caches at most 4 shared `CharacterRigRefs` (`car`, `yacht`, `jet`, `crown`) for the entire app lifetime.
 * - On `low` tier (onboard GPU default): renders 1 crisp 3D snapshot per unique state into a 2D bitmap cache
 *   and sleeps at 0 FPS (zero continuous WebGL->2D drawImage stalls!).
 * - On `medium` / `high`: paces animations cleanly at 15 FPS / 30 FPS and sleeps when the tab is hidden.
 */
class SharedAvatarRenderEngine {
  private renderer: THREE.WebGLRenderer | null = null;
  private envRT: THREE.WebGLRenderTarget | null = null;
  private envTexture: THREE.Texture | null = null;
  private isSoftwareGl = false;
  private webglFailed = false;
  private contextLost = false;
  private qualityTier: GraphicsQualityTier = 'low';
  private tierInitialized = false;
  private renderPixelSize = 160;
  private rigCache = new Map<AvatarArchetypeId, CharacterRigRefs>();
  private snapshotCache = new Map<string, HTMLCanvasElement>();
  private subscribers = new Set<AvatarSubscriber>();
  private running = false;
  private orbitSuspended = false;
  private timerOrRafId = 0;
  private useTimeoutId = false;
  private visibilityBound = false;
  private lastTimeMs = 0;
  private elapsedSec = 0;

  private ensureTierLoaded(): void {
    if (this.tierInitialized) return;
    this.tierInitialized = true;
    const gpu = detectBrowserGpu();
    this.isSoftwareGl = gpu.isSoftwareGl;
    this.qualityTier = gpu.tier;
  }

  public getQualityTier(): GraphicsQualityTier {
    this.ensureTierLoaded();
    return this.qualityTier;
  }

  private ensureInitialized(): boolean {
    if (this.webglFailed) return false;
    this.ensureTierLoaded();
    if (this.renderer) return true;
    if (typeof document === 'undefined') return false;

    try {
      const profile = resolveGraphicsProfile(this.qualityTier, this.isSoftwareGl);
      this.renderPixelSize = profile.avatarPixelSize;

      const renderer = new THREE.WebGLRenderer({
        antialias: !this.isSoftwareGl,
        alpha: true,
        powerPreference: 'default',
      });
      renderer.setPixelRatio(1);
      renderer.setSize(this.renderPixelSize, this.renderPixelSize, false);
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.08;
      renderer.setClearColor(0x000000, 0);

      renderer.domElement.addEventListener('webglcontextlost', (e) => {
        e.preventDefault();
        this.contextLost = true;
        this.stopLoop();
        for (const sub of this.subscribers) {
          drawFallback2DPortrait(sub);
        }
      });
      renderer.domElement.addEventListener('webglcontextrestored', () => {
        this.contextLost = false;
        this.snapshotCache.clear();
        this.envRT?.dispose();
        this.envRT = null;
        this.envTexture = null;
        this.syncRendererAndRigsToProfile();
        const profile = resolveGraphicsProfile(this.qualityTier, this.isSoftwareGl);
        if (profile.avatarFps <= 0 || this.orbitSuspended) {
          for (const sub of this.subscribers) {
            this.renderStaticSnapshotToSubscriber(sub);
          }
        } else {
          this.syncSchedule();
        }
      });

      this.renderer = renderer;
      this.bindVisibilityListener();
      this.syncRendererAndRigsToProfile();
      return true;
    } catch {
      this.webglFailed = true;
      return false;
    }
  }

  private bindVisibilityListener(): void {
    if (this.visibilityBound || typeof document === 'undefined') return;
    this.visibilityBound = true;
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.stopLoop();
      } else if (this.subscribers.size > 0) {
        this.syncSchedule();
      }
    });
    if (typeof window !== 'undefined') {
      window.addEventListener('pagehide', (e) => {
        if (e.persisted) return;
        this.stopLoop();
        if (this.renderer && !this.contextLost) {
          this.contextLost = true;
          try {
            const gl = this.renderer.getContext();
            this.renderer.dispose();
            gl?.getExtension('WEBGL_lose_context')?.loseContext();
          } catch {
            // Ignore unload WebGL teardown errors
          }
          this.renderer = null;
        }
      });
    }
  }

  private ensureEnvTexture(): THREE.Texture | null {
    if (this.envTexture) return this.envTexture;
    if (!this.renderer || this.contextLost) return null;
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const roomEnv = new RoomEnvironment();
    const envRT = pmrem.fromScene(roomEnv, 0.04);
    roomEnv.dispose();
    this.envRT = envRT;
    this.envTexture = envRT.texture;
    pmrem.dispose();
    return this.envTexture;
  }

  private syncRendererAndRigsToProfile(): void {
    const profile = resolveGraphicsProfile(this.qualityTier, this.isSoftwareGl);
    if (this.renderer && this.renderPixelSize !== profile.avatarPixelSize) {
      this.renderPixelSize = profile.avatarPixelSize;
      this.renderer.setSize(this.renderPixelSize, this.renderPixelSize, false);
    }
    const envTex = profile.useEnvironmentMap ? this.ensureEnvTexture() : null;
    for (const rig of this.rigCache.values()) {
      rig.setQualityFeatures(envTex, profile.usePhysicalClearcoat);
    }
  }

  private getOrCreateRig(archetype: AvatarArchetypeId): CharacterRigRefs {
    const existing = this.rigCache.get(archetype);
    if (existing) return existing;

    const profile = resolveGraphicsProfile(this.qualityTier, this.isSoftwareGl);
    const envTex = profile.useEnvironmentMap ? this.ensureEnvTexture() : null;
    const rig = buildStylizedCharacterRig(archetype, envTex);
    rig.setQualityFeatures(envTex, profile.usePhysicalClearcoat);
    this.rigCache.set(archetype, rig);
    return rig;
  }

  public setQualityTier(nextTier: GraphicsQualityTier): void {
    this.ensureTierLoaded();
    if (this.qualityTier === nextTier && this.renderer) return;
    this.qualityTier = nextTier;

    if (!this.renderer) {
      if (this.subscribers.size > 0) {
        this.ensureInitialized();
      } else {
        return;
      }
    }

    this.syncRendererAndRigsToProfile();
    this.syncSchedule();
  }

  private renderStaticSnapshotToSubscriber(sub: AvatarSubscriber): void {
    const renderer = this.renderer;
    if (!renderer || this.contextLost) {
      drawFallback2DPortrait(sub);
      return;
    }

    const st = sub.getState();
    const snapKey = `${sub.archetype}|${st.mood}|${st.isActive ? 1 : 0}|${st.facingSign}|${this.qualityTier}|${this.renderPixelSize}`;
    let snapCanvas = this.snapshotCache.get(snapKey);

    if (!snapCanvas) {
      const rig = this.getOrCreateRig(sub.archetype);
      const target = computeAvatarPoseTargets({
        mood: st.mood,
        elapsedSec: 0.35,
        phaseSeed: 0,
        facingSign: st.facingSign,
        pointerX: 0,
        pointerY: 0,
      });
      applyPoseStateToRig(rig, target, 0, st.mood, st.isActive);

      renderer.clear();
      renderer.render(rig.scene, rig.camera);

      snapCanvas = document.createElement('canvas');
      snapCanvas.width = this.renderPixelSize;
      snapCanvas.height = this.renderPixelSize;
      const sctx = snapCanvas.getContext('2d');
      if (sctx) {
        sctx.drawImage(
          renderer.domElement,
          0,
          0,
          this.renderPixelSize,
          this.renderPixelSize
        );
      }
      if (this.snapshotCache.size >= 64) {
        const oldestKey = this.snapshotCache.keys().next().value;
        if (oldestKey) this.snapshotCache.delete(oldestKey);
      }
      this.snapshotCache.set(snapKey, snapCanvas);
    }

    const w = sub.canvas2d.width;
    const h = sub.canvas2d.height;
    sub.ctx2d.clearRect(0, 0, w, h);
    sub.ctx2d.drawImage(snapCanvas, 0, 0, w, h);
  }

  public subscribe(sub: AvatarSubscriber): () => void {
    const ok = this.ensureInitialized();
    this.subscribers.add(sub);

    if (!ok || this.contextLost) {
      drawFallback2DPortrait(sub);
    } else {
      const profile = resolveGraphicsProfile(this.qualityTier, this.isSoftwareGl);
      if (profile.avatarFps <= 0 || this.orbitSuspended) {
        this.renderStaticSnapshotToSubscriber(sub);
      } else {
        this.syncSchedule();
      }
    }

    return () => {
      this.subscribers.delete(sub);
      if (this.subscribers.size === 0) {
        this.stopLoop();
      }
    };
  }

  public refreshSubscriber(sub: AvatarSubscriber): void {
    if (!this.subscribers.has(sub)) return;
    if (this.webglFailed || !this.renderer || this.contextLost) {
      drawFallback2DPortrait(sub);
      return;
    }
    const profile = resolveGraphicsProfile(this.qualityTier, this.isSoftwareGl);
    if (profile.avatarFps <= 0 || this.orbitSuspended) {
      this.renderStaticSnapshotToSubscriber(sub);
    }
  }

  public setOrbitSuspended(suspended: boolean): void {
    if (this.orbitSuspended === suspended) return;
    this.orbitSuspended = suspended;
    if (suspended) {
      this.stopLoop();
    } else {
      this.syncSchedule();
    }
  }

  private syncSchedule(): void {
    const profile = resolveGraphicsProfile(this.qualityTier, this.isSoftwareGl);
    if (
      this.contextLost ||
      this.webglFailed ||
      !this.renderer ||
      this.subscribers.size === 0 ||
      this.orbitSuspended ||
      (typeof document !== 'undefined' && document.hidden)
    ) {
      this.stopLoop();
      if (this.contextLost || this.webglFailed) {
        for (const sub of this.subscribers) {
          drawFallback2DPortrait(sub);
        }
      }
      return;
    }

    if (profile.avatarFps <= 0) {
      this.stopLoop();
      for (const sub of this.subscribers) {
        this.renderStaticSnapshotToSubscriber(sub);
      }
      return;
    }

    if (!this.running) {
      this.startLoop();
    }
  }

  private startLoop(): void {
    if (this.running) return;
    this.running = true;
    this.lastTimeMs = performance.now();
    this.tick();
  }

  private stopLoop(): void {
    this.running = false;
    if (this.useTimeoutId) {
      window.clearTimeout(this.timerOrRafId);
    } else {
      window.cancelAnimationFrame(this.timerOrRafId);
    }
  }

  private afterDraw(cb: () => void): void {
    if (!this.renderer) return;
    const gl = this.renderer.getContext() as WebGL2RenderingContext;
    const sync = gl.fenceSync ? gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0) : null;
    gl.flush();
    const poll = () => {
      if (!this.running) {
        if (sync) gl.deleteSync(sync);
        return;
      }
      const state = sync ? gl.getSyncParameter(sync, gl.SYNC_STATUS) : gl.SIGNALED;
      if (state === gl.UNSIGNALED) {
        this.useTimeoutId = true;
        this.timerOrRafId = window.setTimeout(poll, 5);
      } else {
        if (sync) gl.deleteSync(sync);
        this.useTimeoutId = true;
        this.timerOrRafId = window.setTimeout(cb, 90);
      }
    };
    this.useTimeoutId = true;
    this.timerOrRafId = window.setTimeout(poll, 5);
  }

  private tick = (): void => {
    if (!this.running || this.subscribers.size === 0 || this.contextLost) {
      if (this.contextLost) this.stopLoop();
      return;
    }
    if (typeof document !== 'undefined' && document.hidden) {
      this.stopLoop();
      return;
    }

    const profile = resolveGraphicsProfile(this.qualityTier, this.isSoftwareGl);
    if (profile.avatarFps <= 0) {
      this.syncSchedule();
      return;
    }

    const now = performance.now();
    const rawDt = Math.max(0.001, (now - this.lastTimeMs) / 1000);
    this.lastTimeMs = now;
    const dt = Math.min(rawDt, 0.14);
    this.elapsedSec += Math.min(rawDt, 0.1);

    const renderer = this.renderer;
    if (!renderer) return;

    const dampAlpha = 1 - Math.exp(-10 * dt);

    for (const sub of this.subscribers) {
      const st = sub.getState();
      const target = computeAvatarPoseTargets({
        mood: st.mood,
        elapsedSec: this.elapsedSec,
        phaseSeed: st.phaseSeed,
        facingSign: st.facingSign,
        pointerX: st.pointerX,
        pointerY: st.pointerY,
      });

      const cur = sub.currentPose;
      cur.headYaw = THREE.MathUtils.lerp(cur.headYaw, target.headYaw, dampAlpha);
      cur.headPitch = THREE.MathUtils.lerp(cur.headPitch, target.headPitch, dampAlpha);
      cur.headRoll = THREE.MathUtils.lerp(cur.headRoll, target.headRoll, dampAlpha);
      cur.torsoYaw = THREE.MathUtils.lerp(cur.torsoYaw, target.torsoYaw, dampAlpha);
      cur.torsoBobY = THREE.MathUtils.lerp(cur.torsoBobY, target.torsoBobY, dampAlpha);
      cur.shoulderTiltZ = THREE.MathUtils.lerp(
        cur.shoulderTiltZ,
        target.shoulderTiltZ,
        dampAlpha
      );
      cur.browAngle = THREE.MathUtils.lerp(cur.browAngle, target.browAngle, dampAlpha);
      cur.browLiftY = THREE.MathUtils.lerp(cur.browLiftY, target.browLiftY, dampAlpha);
      cur.smileScale = THREE.MathUtils.lerp(cur.smileScale, target.smileScale, dampAlpha);
      cur.propGestureAngle = THREE.MathUtils.lerp(
        cur.propGestureAngle,
        target.propGestureAngle,
        dampAlpha
      );

      const rig = this.getOrCreateRig(sub.archetype);
      applyPoseStateToRig(rig, cur, target.blinkAmount, st.mood, st.isActive);

      renderer.clear();
      renderer.render(rig.scene, rig.camera);

      const w = sub.canvas2d.width;
      const h = sub.canvas2d.height;
      sub.ctx2d.clearRect(0, 0, w, h);
      sub.ctx2d.drawImage(renderer.domElement, 0, 0, w, h);
    }

    if (this.isSoftwareGl) {
      this.afterDraw(this.tick);
    } else {
      const delayMs = Math.max(16, Math.round(1000 / profile.avatarFps));
      this.useTimeoutId = true;
      this.timerOrRafId = window.setTimeout(this.tick, delayMs);
    }
  };
}

const sharedAvatarEngine = new SharedAvatarRenderEngine();

export function setAvatarGraphicsTier(tier: GraphicsQualityTier): void {
  sharedAvatarEngine.setQualityTier(tier);
}

export function setAvatarOrbitSuspended(suspended: boolean): void {
  sharedAvatarEngine.setOrbitSuspended(suspended);
}

function drawFallback2DPortrait(sub: AvatarSubscriber): void {
  const { ctx2d, canvas2d } = sub;
  const w = canvas2d.width;
  const h = canvas2d.height;
  ctx2d.clearRect(0, 0, w, h);
  ctx2d.fillStyle = '#f8fafc';
  ctx2d.beginPath();
  ctx2d.arc(w / 2, h * 0.38, w * 0.22, 0, Math.PI * 2);
  ctx2d.fill();
  ctx2d.beginPath();
  ctx2d.arc(w / 2, h * 0.92, w * 0.36, Math.PI, 0);
  ctx2d.fill();
}

/**
 * Builds a composite 14+ part procedural 3D Business Tour stylized tycoon character bust.
 */
function buildStylizedCharacterRig(
  archetype: AvatarArchetypeId,
  envTexture: THREE.Texture | null
): CharacterRigRefs {
  const persona = CHARACTER_PERSONAS[archetype] || CHARACTER_PERSONAS.car;
  const disposables: Array<{ dispose: () => void }> = [];

  const trackGeo = <T extends THREE.BufferGeometry>(g: T): T => {
    disposables.push(g);
    return g;
  };
  const trackMat = <T extends THREE.Material>(m: T): T => {
    disposables.push(m);
    return m;
  };

  const scene = new THREE.Scene();
  if (envTexture) {
    scene.environment = envTexture;
    scene.environmentIntensity = 0.5;
  }

  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 12);
  camera.position.set(0, 0.075, 2.38);
  camera.lookAt(0, -0.01, 0);

  // Studio 3-point warm/cool portrait lighting + Pixar-style physical sheen & hair clearcoat
  const hemiLight = new THREE.HemisphereLight(0xf0f9ff, 0xfde68a, 1.02);
  scene.add(hemiLight);

  const keyLight = new THREE.DirectionalLight(0xfffdf5, 1.28);
  keyLight.position.set(1.9, 2.3, 2.7);
  scene.add(keyLight);

  const fillLight = new THREE.DirectionalLight(0xe0f2fe, 0.62);
  fillLight.position.set(-2.1, 0.9, 1.9);
  scene.add(fillLight);

  const rimLight = new THREE.DirectionalLight(0xfde047, 1.12);
  rimLight.position.set(-1.3, 2.3, -2.0);
  scene.add(rimLight);

  // Physical Materials with velvety skin sheen, tailored fabric sheen & hair clearcoat
  const skinMat = trackMat(
    new THREE.MeshPhysicalMaterial({
      color: persona.skinHex,
      roughness: 0.64,
      metalness: 0.01,
      sheen: 0.42,
      sheenRoughness: 0.72,
      sheenColor: new THREE.Color(0xff9ebb),
      emissive: 0x5c2418,
      emissiveIntensity: 0.045,
    })
  );
  const suitMat = trackMat(
    new THREE.MeshPhysicalMaterial({
      color: persona.suitHex,
      roughness: 0.62,
      metalness: 0.06,
      sheen: 0.48,
      sheenRoughness: 0.55,
      sheenColor: new THREE.Color(0xffffff),
    })
  );
  const lapelMat = trackMat(
    new THREE.MeshPhysicalMaterial({
      color: persona.lapelHex,
      roughness: 0.42,
      metalness: 0.14,
      clearcoat: 0.25,
    })
  );
  const shirtMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.38,
      metalness: 0.02,
    })
  );
  const accentMat = trackMat(
    new THREE.MeshPhysicalMaterial({
      color: persona.accentHex,
      roughness: 0.24,
      metalness: 0.48,
      clearcoat: 0.45,
    })
  );
  const goldMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xfbbf24,
      emissive: 0xb45309,
      emissiveIntensity: 0.22,
      roughness: 0.16,
      metalness: 0.82,
    })
  );
  const pearlMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xfffbeb,
      emissive: 0xfef3c7,
      emissiveIntensity: 0.2,
      roughness: 0.18,
      metalness: 0.12,
    })
  );
  const hairMat = trackMat(
    new THREE.MeshPhysicalMaterial({
      color: persona.hairHex,
      roughness: 0.42,
      metalness: 0.06,
      clearcoat: 0.42,
      clearcoatRoughness: 0.28,
    })
  );

  const isFemale = persona.isFemale;

  // 1. TORSO & TAILORED EXECUTIVE BLAZER
  const torsoGroup = new THREE.Group();
  torsoGroup.position.set(0, -0.62, 0);
  scene.add(torsoGroup);

  const chestMesh = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(isFemale ? 0.33 : 0.36, isFemale ? 0.41 : 0.44, 0.56, 20)),
    suitMat
  );
  chestMesh.scale.set(isFemale ? 1.12 : 1.22, 1, 0.72);
  chestMesh.position.y = 0.04;
  torsoGroup.add(chestMesh);

  // Rounded tailored shoulders (sleeker feminine silhouette for Lan Anh & Ngọc Diệp)
  const shoulderGeo = trackGeo(new THREE.SphereGeometry(isFemale ? 0.19 : 0.21, 16, 12));
  const shoulderSpan = isFemale ? 0.325 : 0.36;
  for (const sx of [-shoulderSpan, shoulderSpan]) {
    const sh = new THREE.Mesh(shoulderGeo, suitMat);
    sh.position.set(sx, isFemale ? 0.17 : 0.18, 0);
    sh.scale.set(isFemale ? 0.98 : 1.05, 0.85, 0.82);
    torsoGroup.add(sh);
  }

  if (isFemale) {
    // Elegant Feminine Collarless Shawl Blazer + Silk Camisole + Pearl Strand Necklace & Royal Brooch
    const silkBlouseV = new THREE.Mesh(
      trackGeo(new THREE.ConeGeometry(0.195, 0.34, 4)),
      shirtMat
    );
    silkBlouseV.rotation.z = Math.PI;
    silkBlouseV.rotation.y = Math.PI / 4;
    silkBlouseV.scale.set(0.92, 1, 0.34);
    silkBlouseV.position.set(0, 0.155, 0.242);
    torsoGroup.add(silkBlouseV);

    // Open V-neck skin décolleté above camisole so there is never a male shirt collar/tie
    const necklineSkinV = new THREE.Mesh(
      trackGeo(new THREE.ConeGeometry(0.135, 0.22, 4)),
      skinMat
    );
    necklineSkinV.rotation.z = Math.PI;
    necklineSkinV.rotation.y = Math.PI / 4;
    necklineSkinV.scale.set(0.9, 1, 0.36);
    necklineSkinV.position.set(0, 0.245, 0.248);
    torsoGroup.add(necklineSkinV);

    const shawlLapelGeo = trackGeo(new THREE.CapsuleGeometry(0.046, 0.28, 8, 12));
    for (const side of [-1, 1]) {
      const lap = new THREE.Mesh(shawlLapelGeo, lapelMat);
      lap.position.set(side * 0.148, 0.145, 0.248);
      lap.rotation.z = side * 0.36;
      lap.rotation.y = side * 0.16;
      torsoGroup.add(lap);
    }

    // 7-Pearl Necklace curving gracefully around the base of the neck
    const pearlGeo = trackGeo(new THREE.SphereGeometry(0.021, 10, 10));
    const pearlCount = 7;
    for (let i = 0; i < pearlCount; i++) {
      const u = (i / (pearlCount - 1)) * 2 - 1; // [-1..+1]
      const pearl = new THREE.Mesh(pearlGeo, pearlMat);
      pearl.position.set(
        u * 0.115,
        0.282 + u * u * 0.042,
        0.264 - u * u * 0.032
      );
      torsoGroup.add(pearl);
    }

    // Golden Royal Jewel Brooch at center camisole neckline
    const broochSetting = new THREE.Mesh(
      trackGeo(new THREE.OctahedronGeometry(0.038, 0)),
      goldMat
    );
    broochSetting.scale.set(1.1, 1.1, 0.55);
    broochSetting.position.set(0, 0.205, 0.268);
    torsoGroup.add(broochSetting);

    const broochGem = new THREE.Mesh(
      trackGeo(new THREE.OctahedronGeometry(0.024, 0)),
      trackMat(
        new THREE.MeshStandardMaterial({
          color: archetype === 'crown' ? 0x10b981 : 0x0ea5e9,
          emissive: archetype === 'crown' ? 0x059669 : 0x0284c7,
          emissiveIntensity: 0.4,
          roughness: 0.14,
          metalness: 0.35,
        })
      )
    );
    broochGem.position.set(0, 0.205, 0.282);
    torsoGroup.add(broochGem);
  } else {
    // Crisp White Dress Shirt V-Insert & Winged Collar + Silk Tie (Male Executives)
    const shirtV = new THREE.Mesh(
      trackGeo(new THREE.ConeGeometry(0.2, 0.36, 4)),
      shirtMat
    );
    shirtV.rotation.z = Math.PI;
    shirtV.rotation.y = Math.PI / 4;
    shirtV.scale.set(0.95, 1, 0.35);
    shirtV.position.set(0, 0.18, 0.245);
    torsoGroup.add(shirtV);

    const collarGeo = trackGeo(new THREE.BoxGeometry(0.14, 0.08, 0.06));
    for (const side of [-1, 1]) {
      const col = new THREE.Mesh(collarGeo, shirtMat);
      col.position.set(side * 0.085, 0.31, 0.23);
      col.rotation.z = side * -0.35;
      col.rotation.y = side * 0.25;
      torsoGroup.add(col);
    }

    const lapelGeo = trackGeo(new THREE.BoxGeometry(0.11, 0.34, 0.06));
    for (const side of [-1, 1]) {
      const lap = new THREE.Mesh(lapelGeo, lapelMat);
      lap.position.set(side * 0.155, 0.14, 0.248);
      lap.rotation.z = side * 0.34;
      lap.rotation.y = side * 0.16;
      torsoGroup.add(lap);
    }

    const tieKnot = new THREE.Mesh(
      trackGeo(new THREE.SphereGeometry(0.048, 12, 10)),
      accentMat
    );
    tieKnot.position.set(0, 0.26, 0.268);
    torsoGroup.add(tieKnot);

    const tieBlade = new THREE.Mesh(
      trackGeo(new THREE.ConeGeometry(0.055, 0.24, 4)),
      accentMat
    );
    tieBlade.rotation.y = Math.PI / 4;
    tieBlade.scale.set(1, 1, 0.35);
    tieBlade.position.set(0, 0.13, 0.272);
    torsoGroup.add(tieBlade);

    const lapelPin = new THREE.Mesh(
      trackGeo(new THREE.OctahedronGeometry(0.032, 0)),
      goldMat
    );
    lapelPin.position.set(-0.2, 0.2, 0.28);
    torsoGroup.add(lapelPin);
  }

  // Sculpted Neck
  const neck = new THREE.Mesh(
    trackGeo(
      new THREE.CylinderGeometry(
        isFemale ? 0.088 : 0.105,
        isFemale ? 0.102 : 0.12,
        0.2,
        14
      )
    ),
    skinMat
  );
  neck.position.set(0, 0.38, 0.02);
  torsoGroup.add(neck);

  // 2. EXPRESSIVE STYLIZED HEAD & FACIAL FEATURES
  const headGroup = new THREE.Group();
  headGroup.position.set(0, 0.66, 0.03);
  torsoGroup.add(headGroup);

  const cranium = new THREE.Mesh(
    trackGeo(new THREE.SphereGeometry(0.305, 24, 20)),
    skinMat
  );
  cranium.scale.set(isFemale ? 0.92 : 0.95, 1.05, 0.92);
  headGroup.add(cranium);

  // Subtle sculpted jawline/chin volume (delicate tapered oval chin for female personas)
  const chin = new THREE.Mesh(
    trackGeo(new THREE.SphereGeometry(0.18, 16, 12)),
    skinMat
  );
  chin.position.set(0, -0.14, 0.065);
  chin.scale.set(isFemale ? 0.86 : 1.02, isFemale ? 0.82 : 0.86, 0.86);
  headGroup.add(chin);

  // Ears
  const earGeo = trackGeo(new THREE.SphereGeometry(0.068, 12, 10));
  for (const side of [-1, 1]) {
    const ear = new THREE.Mesh(earGeo, skinMat);
    ear.position.set(side * 0.285, -0.01, -0.01);
    ear.scale.set(0.55, 0.95, 0.7);
    headGroup.add(ear);
  }

  // Stylized Nose
  const nose = new THREE.Mesh(
    trackGeo(new THREE.CapsuleGeometry(0.034, 0.055, 8, 10)),
    skinMat
  );
  nose.position.set(0, -0.01, 0.285);
  nose.rotation.x = -0.22;
  headGroup.add(nose);

  // Warm Cheek Blush Accents (painterly Business Tour warmth)
  const cheekMat = trackMat(
    new THREE.MeshBasicMaterial({
      color: isFemale ? 0xf43f5e : 0xfb7185,
      transparent: true,
      opacity: isFemale ? 0.28 : 0.2,
    })
  );
  const cheekGeo = trackGeo(new THREE.CircleGeometry(0.054, 12));
  for (const side of [-1, 1]) {
    const cheek = new THREE.Mesh(cheekGeo, cheekMat);
    cheek.position.set(side * 0.155, -0.052, 0.258);
    cheek.rotation.y = side * 0.38;
    headGroup.add(cheek);
  }

  // Expressive Eyes with Bright Sclera, Colored Iris, Dark Pupil, Twin Catchlights, Lash Line & Blinking Eyelids
  const scleraMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.18,
      emissive: 0xf8fafc,
      emissiveIntensity: 0.34,
    })
  );
  const irisMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: persona.irisHex,
      roughness: 0.22,
      emissive: persona.irisHex,
      emissiveIntensity: 0.28,
    })
  );
  const pupilMat = trackMat(new THREE.MeshBasicMaterial({ color: 0x060913 }));
  const catchlightMat = trackMat(new THREE.MeshBasicMaterial({ color: 0xffffff }));
  const lashMat = trackMat(new THREE.MeshBasicMaterial({ color: 0x171010 }));

  const scleraGeo = trackGeo(new THREE.SphereGeometry(0.06, 16, 14));
  const irisGeo = trackGeo(new THREE.CircleGeometry(0.04, 16));
  const pupilGeo = trackGeo(new THREE.CircleGeometry(0.024, 14));
  const catchGeo = trackGeo(new THREE.CircleGeometry(0.011, 10));
  const subCatchGeo = trackGeo(new THREE.CircleGeometry(0.0055, 8));
  const lashGeo = trackGeo(
    new THREE.TorusGeometry(0.058, isFemale ? 0.0105 : 0.0085, 6, 14, Math.PI * 0.88)
  );
  const wingLashGeo = trackGeo(new THREE.ConeGeometry(0.013, 0.038, 5));
  const eyelidGeo = trackGeo(
    new THREE.SphereGeometry(0.065, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.56)
  );

  const buildEye = (side: -1 | 1): THREE.Mesh => {
    const eyeSocket = new THREE.Group();
    eyeSocket.position.set(side * 0.11, 0.044, 0.258);
    eyeSocket.rotation.y = side * 0.12;

    const sclera = new THREE.Mesh(scleraGeo, scleraMat);
    sclera.scale.set(1, 1.06, 0.62);
    eyeSocket.add(sclera);

    const iris = new THREE.Mesh(irisGeo, irisMat);
    iris.position.z = 0.039;
    eyeSocket.add(iris);

    const pupil = new THREE.Mesh(pupilGeo, pupilMat);
    pupil.position.z = 0.041;
    eyeSocket.add(pupil);

    const spark = new THREE.Mesh(catchGeo, catchlightMat);
    spark.position.set(0.013, 0.014, 0.043);
    eyeSocket.add(spark);

    const subSpark = new THREE.Mesh(subCatchGeo, catchlightMat);
    subSpark.position.set(-0.012, -0.011, 0.043);
    eyeSocket.add(subSpark);

    const lashArc = new THREE.Mesh(lashGeo, lashMat);
    lashArc.position.set(0, 0.005, 0.036);
    lashArc.rotation.z = (Math.PI - Math.PI * 0.88) / 2;
    eyeSocket.add(lashArc);

    if (isFemale) {
      const wingLash = new THREE.Mesh(wingLashGeo, lashMat);
      wingLash.position.set(side * 0.058, 0.026, 0.034);
      wingLash.rotation.z = side * -0.78;
      eyeSocket.add(wingLash);
    }

    const eyelid = new THREE.Mesh(eyelidGeo, skinMat);
    eyelid.scale.set(1.04, 0.14, 0.72);
    eyelid.rotation.x = -0.58;
    eyeSocket.add(eyelid);

    headGroup.add(eyeSocket);
    return eyelid;
  };

  const leftEyelid = buildEye(-1);
  const rightEyelid = buildEye(1);

  // Articulated 3D Eyebrows (delicate arched brow for female personas)
  const browGeo = trackGeo(
    new THREE.CapsuleGeometry(isFemale ? 0.013 : 0.018, isFemale ? 0.078 : 0.082, 6, 8)
  );
  browGeo.rotateZ(Math.PI / 2);

  const leftBrow = new THREE.Mesh(browGeo, hairMat);
  leftBrow.position.set(-0.115, isFemale ? 0.148 : 0.145, 0.268);
  leftBrow.rotation.set(0, -0.14, 0);
  headGroup.add(leftBrow);

  const rightBrow = new THREE.Mesh(browGeo, hairMat);
  rightBrow.position.set(0.115, isFemale ? 0.148 : 0.145, 0.268);
  rightBrow.rotation.set(0, 0.14, 0);
  headGroup.add(rightBrow);

  // Expressive Confident Smile Arc (rose lipstick fullness for female personas)
  const mouthMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: isFemale ? 0xe11d48 : 0x9f1239,
      emissive: isFemale ? 0x9f1239 : 0x000000,
      emissiveIntensity: isFemale ? 0.18 : 0,
      roughness: 0.3,
    })
  );
  const mouthArc = new THREE.Mesh(
    trackGeo(
      new THREE.TorusGeometry(
        isFemale ? 0.062 : 0.068,
        isFemale ? 0.0175 : 0.015,
        8,
        16,
        Math.PI * 0.76
      )
    ),
    mouthMat
  );
  mouthArc.position.set(0, -0.115, 0.258);
  mouthArc.rotation.z = Math.PI + (Math.PI - Math.PI * 0.76) / 2;
  headGroup.add(mouthArc);

  // 3. ARCHETYPE-SPECIFIC HAIRSTYLES, EYEWEAR & BUSINESS TOUR SIGNATURE PROPS
  let propPivot: THREE.Group | null = null;

  if (archetype === 'car') {
    // CEO Minh Khôi: Sculpted Swept-Back Executive Pompadour + Wireless Earpiece
    const hairCap = new THREE.Mesh(
      trackGeo(
        new THREE.SphereGeometry(0.316, 20, 16, 0, Math.PI * 2, 0, Math.PI * 0.52)
      ),
      hairMat
    );
    hairCap.position.set(0, 0.065, -0.035);
    hairCap.rotation.x = -0.48;
    headGroup.add(hairCap);

    const quiffWave = new THREE.Mesh(
      trackGeo(new THREE.CapsuleGeometry(0.088, 0.23, 10, 14)),
      hairMat
    );
    quiffWave.rotation.z = Math.PI / 2 - 0.18;
    quiffWave.position.set(0.03, 0.305, 0.105);
    headGroup.add(quiffWave);

    const sideWave = new THREE.Mesh(
      trackGeo(new THREE.CapsuleGeometry(0.058, 0.17, 8, 12)),
      hairMat
    );
    sideWave.rotation.z = Math.PI / 2 + 0.16;
    sideWave.position.set(-0.08, 0.275, 0.13);
    headGroup.add(sideWave);

    // Sleek Silver-Cyan Executive Headset on Right Ear
    const headsetMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xe2e8f0,
        metalness: 0.75,
        roughness: 0.22,
      })
    );
    const earpiece = new THREE.Mesh(
      trackGeo(new THREE.CapsuleGeometry(0.024, 0.08, 6, 8)),
      headsetMat
    );
    earpiece.position.set(0.295, -0.03, 0.05);
    earpiece.rotation.z = 0.35;
    earpiece.rotation.x = 0.55;
    headGroup.add(earpiece);
  } else if (archetype === 'yacht') {
    // Chủ Tịch Lan Anh: Chic Asymmetric Shoulder-Grazing Bob + Pearl Studs + Gold-Blue Glasses + Smartphone Gesture
    const bobDome = new THREE.Mesh(
      trackGeo(
        new THREE.SphereGeometry(0.332, 22, 18, 0, Math.PI * 2, 0, Math.PI * 0.56)
      ),
      hairMat
    );
    bobDome.position.set(0, 0.065, -0.035);
    bobDome.rotation.x = -0.46;
    headGroup.add(bobDome);

    const bobBack = new THREE.Mesh(
      trackGeo(new THREE.CylinderGeometry(0.28, 0.31, 0.34, 16)),
      hairMat
    );
    bobBack.position.set(0, -0.055, -0.075);
    bobBack.scale.set(1.04, 1, 0.76);
    headGroup.add(bobBack);

    // Fuller chin-to-collarbone inward-curved bob locks framing both sides of the face
    const lockGeo = trackGeo(new THREE.CapsuleGeometry(0.082, 0.29, 8, 12));
    const tipCurlGeo = trackGeo(new THREE.SphereGeometry(0.075, 10, 10));
    const studGeo = trackGeo(new THREE.SphereGeometry(0.026, 10, 10));
    for (const side of [-1, 1]) {
      const lock = new THREE.Mesh(lockGeo, hairMat);
      lock.position.set(side * 0.268, -0.065, 0.042);
      lock.rotation.z = side * 0.14;
      lock.rotation.x = 0.12;
      headGroup.add(lock);

      const tipCurl = new THREE.Mesh(tipCurlGeo, hairMat);
      tipCurl.position.set(side * 0.23, -0.225, 0.085);
      tipCurl.scale.set(1.05, 0.75, 0.9);
      headGroup.add(tipCurl);

      const pearlStud = new THREE.Mesh(studGeo, pearlMat);
      pearlStud.position.set(side * 0.282, -0.055, 0.075);
      headGroup.add(pearlStud);
    }

    // Swept side bangs leaving eyebrows and eyes clear
    const bangs = new THREE.Mesh(
      trackGeo(new THREE.CapsuleGeometry(0.064, 0.23, 8, 12)),
      hairMat
    );
    bangs.rotation.z = Math.PI / 2 - 0.22;
    bangs.position.set(-0.045, 0.275, 0.16);
    headGroup.add(bangs);

    // Sleek Champagne-Blue Executive Glasses Frames
    const frameMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x38bdf8,
        metalness: 0.72,
        roughness: 0.18,
      })
    );
    const rimGeo = trackGeo(new THREE.TorusGeometry(0.076, 0.009, 8, 22));
    for (const side of [-1, 1]) {
      const rim = new THREE.Mesh(rimGeo, frameMat);
      rim.position.set(side * 0.112, 0.044, 0.302);
      rim.rotation.y = side * 0.11;
      headGroup.add(rim);
    }
    const bridge = new THREE.Mesh(
      trackGeo(new THREE.CylinderGeometry(0.0075, 0.0075, 0.072, 8)),
      frameMat
    );
    bridge.rotation.z = Math.PI / 2;
    bridge.position.set(0, 0.055, 0.306);
    headGroup.add(bridge);

    // Articulated Executive Smartphone Gesture
    propPivot = new THREE.Group();
    propPivot.position.set(0.33, 0.2, 0.2);
    const phoneBody = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(0.095, 0.18, 0.022)),
      trackMat(
        new THREE.MeshStandardMaterial({
          color: 0x0f172a,
          metalness: 0.6,
          roughness: 0.2,
          emissive: 0x38bdf8,
          emissiveIntensity: 0.25,
        })
      )
    );
    phoneBody.position.set(-0.04, 0.16, 0.04);
    phoneBody.rotation.z = 0.28;
    phoneBody.rotation.y = -0.35;
    propPivot.add(phoneBody);

    const handSphere = new THREE.Mesh(
      trackGeo(new THREE.SphereGeometry(0.052, 10, 10)),
      skinMat
    );
    handSphere.position.set(-0.02, 0.13, 0.055);
    propPivot.add(handSphere);
    torsoGroup.add(propPivot);
  } else if (archetype === 'jet') {
    // Shark Hoàng Nam: Slicked Executive Hair + Reflective Gold Aviator Sunglasses
    const slickCap = new THREE.Mesh(
      trackGeo(
        new THREE.SphereGeometry(0.318, 20, 16, 0, Math.PI * 2, 0, Math.PI * 0.52)
      ),
      hairMat
    );
    slickCap.position.set(0, 0.065, -0.035);
    slickCap.rotation.x = -0.48;
    headGroup.add(slickCap);

    const partSweep = new THREE.Mesh(
      trackGeo(new THREE.CapsuleGeometry(0.072, 0.24, 8, 12)),
      hairMat
    );
    partSweep.rotation.z = Math.PI / 2 + 0.14;
    partSweep.position.set(0.04, 0.285, 0.115);
    headGroup.add(partSweep);

    // Iconic Gold-Rimmed Reflective Aviator Sunglasses
    const aviatorLensMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x0f172a,
        metalness: 0.9,
        roughness: 0.1,
      })
    );
    const lensGeo = trackGeo(new THREE.CircleGeometry(0.082, 18));
    const aviatorRimGeo = trackGeo(new THREE.TorusGeometry(0.082, 0.011, 8, 20));
    for (const side of [-1, 1]) {
      const lens = new THREE.Mesh(lensGeo, aviatorLensMat);
      lens.position.set(side * 0.114, 0.045, 0.298);
      lens.scale.set(1.08, 0.9, 1);
      lens.rotation.y = side * 0.12;
      headGroup.add(lens);

      const rim = new THREE.Mesh(aviatorRimGeo, goldMat);
      rim.position.copy(lens.position);
      rim.scale.copy(lens.scale);
      rim.rotation.copy(lens.rotation);
      headGroup.add(rim);
    }
    const browBar = new THREE.Mesh(
      trackGeo(new THREE.CylinderGeometry(0.009, 0.009, 0.22, 8)),
      goldMat
    );
    browBar.rotation.z = Math.PI / 2;
    browBar.position.set(0, 0.105, 0.304);
    headGroup.add(browBar);
  } else {
    // Phu Nhân Ngọc Diệp: Cascading Shoulder-Length Royal Chestnut Waves + Bright 24K Gold & Emerald Crown + Pearl Drop Earrings
    const crownGoldMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xfde047,
        emissive: 0xd97706,
        emissiveIntensity: 0.32,
        roughness: 0.14,
        metalness: 0.78,
      })
    );

    const hairDome = new THREE.Mesh(
      trackGeo(
        new THREE.SphereGeometry(0.332, 22, 18, 0, Math.PI * 2, 0, Math.PI * 0.56)
      ),
      hairMat
    );
    hairDome.position.set(0, 0.068, -0.035);
    hairDome.rotation.x = -0.46;
    headGroup.add(hairDome);

    // Voluminous back silhouette so neck/ears are framed by lush royal hair
    const backCascade = new THREE.Mesh(
      trackGeo(new THREE.CylinderGeometry(0.285, 0.34, 0.44, 16)),
      hairMat
    );
    backCascade.position.set(0, -0.095, -0.075);
    backCascade.scale.set(1.08, 1, 0.78);
    headGroup.add(backCascade);

    const royalCrownBun = new THREE.Mesh(
      trackGeo(new THREE.SphereGeometry(0.175, 16, 14)),
      hairMat
    );
    royalCrownBun.position.set(0, 0.305, -0.035);
    royalCrownBun.scale.set(1.22, 0.88, 0.96);
    headGroup.add(royalCrownBun);

    // Soft side-swept curtain bangs framing the forehead cleanly beneath the tiara
    const leftSweepBang = new THREE.Mesh(
      trackGeo(new THREE.CapsuleGeometry(0.056, 0.19, 8, 12)),
      hairMat
    );
    leftSweepBang.position.set(-0.115, 0.255, 0.16);
    leftSweepBang.rotation.z = Math.PI / 2 + 0.34;
    leftSweepBang.rotation.y = -0.18;
    headGroup.add(leftSweepBang);

    const rightSweepBang = new THREE.Mesh(
      trackGeo(new THREE.CapsuleGeometry(0.054, 0.18, 8, 12)),
      hairMat
    );
    rightSweepBang.position.set(0.115, 0.255, 0.16);
    rightSweepBang.rotation.z = Math.PI / 2 - 0.34;
    rightSweepBang.rotation.y = 0.18;
    headGroup.add(rightSweepBang);

    // Front-visible cascading wavy curls draping down both cheeks onto the front shoulders!
    const upperWaveGeo = trackGeo(new THREE.CapsuleGeometry(0.078, 0.22, 8, 12));
    const lowerCurlGeo = trackGeo(new THREE.CapsuleGeometry(0.082, 0.2, 8, 12));
    const shoulderTipGeo = trackGeo(new THREE.SphereGeometry(0.082, 10, 10));
    const pearlStudGeo = trackGeo(new THREE.SphereGeometry(0.026, 10, 10));
    const goldDropGeo = trackGeo(new THREE.OctahedronGeometry(0.03, 0));

    for (const side of [-1, 1]) {
      const upperWave = new THREE.Mesh(upperWaveGeo, hairMat);
      upperWave.position.set(side * 0.278, -0.015, 0.045);
      upperWave.rotation.z = side * -0.1;
      upperWave.rotation.x = 0.12;
      headGroup.add(upperWave);

      const lowerCurl = new THREE.Mesh(lowerCurlGeo, hairMat);
      lowerCurl.position.set(side * 0.268, -0.185, 0.095);
      lowerCurl.rotation.z = side * 0.16;
      lowerCurl.rotation.x = 0.18;
      headGroup.add(lowerCurl);

      const shoulderCurl = new THREE.Mesh(shoulderTipGeo, hairMat);
      shoulderCurl.position.set(side * 0.238, -0.285, 0.135);
      shoulderCurl.scale.set(1.12, 0.85, 0.95);
      headGroup.add(shoulderCurl);

      // Luminous Pearl & Gold Drop Earrings
      const stud = new THREE.Mesh(pearlStudGeo, pearlMat);
      stud.position.set(side * 0.288, -0.055, 0.085);
      headGroup.add(stud);

      const drop = new THREE.Mesh(goldDropGeo, crownGoldMat);
      drop.scale.set(0.85, 1.35, 0.85);
      drop.position.set(side * 0.288, -0.105, 0.088);
      headGroup.add(drop);
    }

    // Prominent 24K Golden Royal Crown Tiara with 5 Spires, Pearl Tips & Glowing Emerald Centerpiece
    const tiaraGroup = new THREE.Group();
    tiaraGroup.position.set(0, 0.285, 0.088);
    tiaraGroup.rotation.x = -0.05;

    const tiaraBaseRim = new THREE.Mesh(
      trackGeo(new THREE.CylinderGeometry(0.205, 0.195, 0.052, 24, 1, false, -Math.PI * 0.55, Math.PI * 1.1)),
      crownGoldMat
    );
    tiaraBaseRim.position.y = 0.02;
    tiaraGroup.add(tiaraBaseRim);

    const tiaraBand = new THREE.Mesh(
      trackGeo(new THREE.TorusGeometry(0.2, 0.026, 8, 24, Math.PI * 1.05)),
      crownGoldMat
    );
    tiaraBand.rotation.x = Math.PI / 2;
    tiaraBand.rotation.z = -Math.PI * 0.525;
    tiaraGroup.add(tiaraBand);

    const spireSpecs: Array<{ x: number; h: number; z: number; r: number }> = [
      { x: 0, h: 0.155, z: 0.198, r: 0.054 },
      { x: -0.095, h: 0.115, z: 0.175, r: 0.042 },
      { x: 0.095, h: 0.115, z: 0.175, r: 0.042 },
      { x: -0.168, h: 0.082, z: 0.112, r: 0.034 },
      { x: 0.168, h: 0.082, z: 0.112, r: 0.034 },
    ];
    const pearlTipGeo = trackGeo(new THREE.SphereGeometry(0.018, 8, 8));
    for (const sp of spireSpecs) {
      const pk = new THREE.Mesh(
        trackGeo(new THREE.ConeGeometry(sp.r, sp.h, 4)),
        crownGoldMat
      );
      pk.position.set(sp.x, 0.035 + sp.h * 0.5, sp.z);
      pk.rotation.y = Math.PI / 4;
      tiaraGroup.add(pk);

      const tipPearl = new THREE.Mesh(pearlTipGeo, pearlMat);
      tipPearl.position.set(sp.x, 0.035 + sp.h + 0.008, sp.z);
      tiaraGroup.add(tipPearl);
    }

    const emeraldGem = new THREE.Mesh(
      trackGeo(new THREE.OctahedronGeometry(0.044, 0)),
      trackMat(
        new THREE.MeshStandardMaterial({
          color: 0x10b981,
          emissive: 0x059669,
          emissiveIntensity: 0.45,
          roughness: 0.1,
          metalness: 0.35,
        })
      )
    );
    emeraldGem.position.set(0, 0.068, 0.218);
    tiaraGroup.add(emeraldGem);
    headGroup.add(tiaraGroup);
  }

  // 4. TOGGLEABLE 3D MINI JAIL BARS FOREGROUND (Appears when player is stranded on Đảo Hoang!)
  const jailBarsGroup = new THREE.Group();
  jailBarsGroup.position.set(0, 0.02, 0.82);
  jailBarsGroup.visible = false;
  const ironBarMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x334155,
      metalness: 0.78,
      roughness: 0.32,
    })
  );
  const barGeo = trackGeo(new THREE.CylinderGeometry(0.018, 0.018, 1.1, 8));
  for (const bx of [-0.26, -0.09, 0.09, 0.26]) {
    const bar = new THREE.Mesh(barGeo, ironBarMat);
    bar.position.x = bx;
    jailBarsGroup.add(bar);
  }
  scene.add(jailBarsGroup);

  const setQualityFeatures = (
    nextEnvTex: THREE.Texture | null,
    useClearcoat: boolean
  ) => {
    scene.environment = nextEnvTex;
    scene.environmentIntensity = nextEnvTex ? 0.5 : 0;
    hemiLight.intensity = nextEnvTex ? 1.02 : 1.18;

    const applyPhys = (
      mat: THREE.MeshPhysicalMaterial,
      sheenVal: number,
      coatVal: number
    ) => {
      const nextSheen = useClearcoat ? sheenVal : 0;
      const nextCoat = useClearcoat ? coatVal : 0;
      if ((mat.sheen > 0) !== (nextSheen > 0) || (mat.clearcoat > 0) !== (nextCoat > 0)) {
        mat.needsUpdate = true;
      }
      mat.sheen = nextSheen;
      mat.clearcoat = nextCoat;
    };

    applyPhys(skinMat, 0.42, 0);
    applyPhys(suitMat, 0.48, 0);
    applyPhys(lapelMat, 0, 0.25);
    applyPhys(accentMat, 0, 0.45);
    applyPhys(hairMat, 0, 0.42);
  };

  return {
    scene,
    camera,
    torsoGroup,
    headGroup,
    leftEyelid,
    rightEyelid,
    leftBrow,
    rightBrow,
    mouthArc,
    propPivot,
    jailBarsGroup,
    hemiLight,
    keyLight,
    rimLight,
    setQualityFeatures,
    disposables,
  };
}

const SIZE_CLASSES: Record<
  NonNullable<PlayerAvatar3DProps['size']>,
  { box: string; pixel: number; border: string; radius: string }
> = {
  xs: {
    box: 'h-7 w-7',
    pixel: 64,
    border: 'border-2',
    radius: 'rounded-lg',
  },
  sm: {
    box: 'h-9 w-9',
    pixel: 84,
    border: 'border-2',
    radius: 'rounded-xl',
  },
  md: {
    box: 'h-12 w-12',
    pixel: 112,
    border: 'border-[2.5px]',
    radius: 'rounded-2xl',
  },
  lg: {
    box: 'h-14 w-14 sm:h-18 sm:w-18',
    pixel: 160,
    border: 'border-[3px]',
    radius: 'rounded-2xl',
  },
  xl: {
    box: 'h-28 w-28 sm:h-32 sm:w-32',
    pixel: 224,
    border: 'border-4',
    radius: 'rounded-3xl',
  },
};

export const PlayerAvatar3D: React.FC<PlayerAvatar3DProps> = ({
  archetype,
  mood = 'idle',
  phaseSeed = 0,
  facingSign = 0,
  isBot = false,
  isActive = false,
  showBotStamp = false,
  size = 'lg',
  className = '',
  ariaLabel,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const subscriberRef = useRef<AvatarSubscriber | null>(null);
  const pointerRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  const stateRef = useRef({
    mood,
    phaseSeed,
    facingSign,
    isActive,
  });
  stateRef.current = { mood, phaseSeed, facingSign, isActive };

  const persona = CHARACTER_PERSONAS[archetype] || CHARACTER_PERSONAS.car;
  const sizeSpec = SIZE_CLASSES[size];

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx2d = canvas.getContext('2d');
    if (!ctx2d) return;

    const subscriber: AvatarSubscriber = {
      archetype,
      canvas2d: canvas,
      ctx2d,
      getState: () => ({
        ...stateRef.current,
        pointerX: pointerRef.current.x,
        pointerY: pointerRef.current.y,
      }),
      currentPose: {
        headYaw: facingSign * 0.2,
        headPitch: 0,
        headRoll: 0,
        torsoYaw: facingSign * 0.14,
        torsoBobY: 0,
        shoulderTiltZ: 0,
        browAngle: 0,
        browLiftY: 0,
        smileScale: 1,
        propGestureAngle: 0,
      },
    };
    subscriberRef.current = subscriber;

    const unsubscribe = sharedAvatarEngine.subscribe(subscriber);

    return () => {
      subscriberRef.current = null;
      unsubscribe();
    };
  }, [archetype, facingSign]);

  useEffect(() => {
    if (subscriberRef.current) {
      sharedAvatarEngine.refreshSubscriber(subscriberRef.current);
    }
  }, [mood, isActive, sizeSpec.pixel]);

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (sharedAvatarEngine.getQualityTier() === 'low') return;
    const rect = e.currentTarget.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const nx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    const ny = ((e.clientY - rect.top) / rect.height) * 2 - 1;
    pointerRef.current.x = Math.max(-1, Math.min(1, nx));
    pointerRef.current.y = Math.max(-1, Math.min(1, ny));
  };

  const handlePointerLeave = () => {
    pointerRef.current.x = 0;
    pointerRef.current.y = 0;
  };

  return (
    <div
      role={ariaLabel ? 'img' : undefined}
      aria-label={ariaLabel}
      aria-hidden={ariaLabel ? undefined : true}
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
      data-avatar-archetype={archetype}
      data-avatar-mood={mood}
      className={`relative ${sizeSpec.box} ${sizeSpec.radius} ${sizeSpec.border} ${
        isActive ? 'border-[#e2b857] ring-2 ring-[#c89b3c]/55' : 'border-[#ede5d5]'
      } shrink-0 select-none shadow-md transition-transform duration-150 ${className}`}
      style={{
        background: `radial-gradient(circle at 50% 24%, rgba(255,255,255,0.28) 0%, transparent 58%), linear-gradient(180deg, ${persona.backdropGradient[0]} 0%, ${persona.backdropGradient[1]} 100%)`,
      }}
    >
      <canvas
        ref={canvasRef}
        width={sizeSpec.pixel}
        height={sizeSpec.pixel}
        className={`h-full w-full ${sizeSpec.radius} block object-cover pointer-events-none`}
      />

      {isBot && showBotStamp && (
        <span
          className={`pointer-events-none absolute -bottom-1 ${
            facingSign === -1 ? 'left-1' : 'right-1'
          } px-1.5 py-[1px] rounded-[4px] bg-slate-900/95 border border-[#d4af37]/75 text-[9px] font-bold tracking-wider text-amber-200 leading-tight shadow-xs`}
        >
          AI
        </span>
      )}
    </div>
  );
};
