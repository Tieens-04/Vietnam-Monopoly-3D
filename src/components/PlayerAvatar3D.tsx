import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import {
  AvatarArchetypeId,
  AvatarMood,
  CHARACTER_PERSONAS,
  computeAvatarPoseTargets,
} from '../game/avatarLogic';

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
  keyLight: THREE.DirectionalLight;
  rimLight: THREE.DirectionalLight;
  disposables: Array<{ dispose: () => void }>;
}

interface AvatarSubscriber {
  canvas2d: HTMLCanvasElement;
  ctx2d: CanvasRenderingContext2D;
  rig: CharacterRigRefs;
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

/**
 * Shared Single-Context Offscreen WebGL Avatar Engine.
 * Renders all mounted `<PlayerAvatar3D>` busts through ONE tiny WebGLRenderer (zero context-limit issues!)
 * and paces frames with `afterDraw()` fenceSync when running on software WebGL (SwiftShader).
 */
class SharedAvatarRenderEngine {
  private renderer: THREE.WebGLRenderer | null = null;
  private envTexture: THREE.Texture | null = null;
  private isSoftwareGl = false;
  private webglFailed = false;
  private renderPixelSize = 192;
  private subscribers = new Set<AvatarSubscriber>();
  private running = false;
  private timerOrRafId = 0;
  private useTimeoutId = false;
  private lastTimeMs = 0;
  private elapsedSec = 0;

  private ensureInitialized(): boolean {
    if (this.webglFailed) return false;
    if (this.renderer) return true;
    if (typeof document === 'undefined') return false;

    try {
      const probe = document.createElement('canvas');
      const gl = probe.getContext('webgl2') || probe.getContext('webgl');
      if (!gl) {
        this.webglFailed = true;
        return false;
      }
      const dbg = gl.getExtension('WEBGL_debug_renderer_info');
      const gpuName = String(
        gl.getParameter(dbg ? dbg.UNMASKED_RENDERER_WEBGL : gl.RENDERER)
      );
      gl.getExtension('WEBGL_lose_context')?.loseContext();

      this.isSoftwareGl = /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpuName);
      this.renderPixelSize = this.isSoftwareGl ? 144 : 192;

      const renderer = new THREE.WebGLRenderer({
        antialias: !this.isSoftwareGl,
        alpha: true,
        powerPreference: 'high-performance',
      });
      renderer.setPixelRatio(1);
      renderer.setSize(this.renderPixelSize, this.renderPixelSize, false);
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.08;
      renderer.setClearColor(0x000000, 0);

      renderer.domElement.addEventListener('webglcontextlost', (e) => {
        e.preventDefault();
      });

      const pmrem = new THREE.PMREMGenerator(renderer);
      const envRT = pmrem.fromScene(new RoomEnvironment(), 0.04);
      this.envTexture = envRT.texture;
      pmrem.dispose();

      this.renderer = renderer;
      return true;
    } catch {
      this.webglFailed = true;
      return false;
    }
  }

  public getEnvTexture(): THREE.Texture | null {
    this.ensureInitialized();
    return this.envTexture;
  }

  public subscribe(sub: AvatarSubscriber): () => void {
    const ok = this.ensureInitialized();
    this.subscribers.add(sub);

    if (!ok) {
      drawFallback2DPortrait(sub);
    } else if (!this.running) {
      this.startLoop();
    }

    return () => {
      this.subscribers.delete(sub);
      if (this.subscribers.size === 0) {
        this.stopLoop();
      }
    };
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
    if (!this.running || this.subscribers.size === 0) return;

    const now = performance.now();
    const rawDt = Math.max(0.001, (now - this.lastTimeMs) / 1000);
    this.lastTimeMs = now;
    const dt = Math.min(rawDt, 0.12);
    this.elapsedSec += Math.min(rawDt, 0.08);

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

      const { rig } = sub;
      rig.torsoGroup.position.y = -0.62 + cur.torsoBobY;
      rig.torsoGroup.rotation.y = cur.torsoYaw;
      rig.torsoGroup.rotation.z = cur.shoulderTiltZ;

      rig.headGroup.rotation.set(cur.headPitch, cur.headYaw, cur.headRoll);

      // Eyelid blink sweep: rotates smoothly from open upper crease (-0.58 rad) down to closed (+0.14 rad)
      const lidScaleY = 0.14 + target.blinkAmount * 0.86;
      const lidRotX = -0.58 + target.blinkAmount * 0.72;
      rig.leftEyelid.scale.y = lidScaleY;
      rig.rightEyelid.scale.y = lidScaleY;
      rig.leftEyelid.rotation.x = lidRotX;
      rig.rightEyelid.rotation.x = lidRotX;

      // Expressive articulated eyebrows
      rig.leftBrow.position.y = 0.145 + cur.browLiftY;
      rig.rightBrow.position.y = 0.145 + cur.browLiftY;
      rig.leftBrow.rotation.z = cur.browAngle;
      rig.rightBrow.rotation.z = -cur.browAngle;

      // Confident smile vs stressed/jailed frown
      const smileMag = Math.max(0.35, Math.abs(cur.smileScale));
      rig.mouthArc.scale.set(1, smileMag * (cur.smileScale >= 0 ? 1 : -0.75), 1);
      rig.mouthArc.position.y = cur.smileScale >= 0 ? -0.115 : -0.145;

      if (rig.propPivot) {
        rig.propPivot.rotation.z = cur.propGestureAngle;
      }

      rig.jailBarsGroup.visible = st.mood === 'jailed';

      // Dynamic active-turn golden rim boost
      rig.keyLight.intensity = st.mood === 'bankrupt' ? 0.72 : st.isActive ? 1.65 : 1.32;
      rig.rimLight.intensity = st.isActive || st.mood === 'celebrating' ? 1.35 : 0.78;

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
      this.useTimeoutId = false;
      this.timerOrRafId = window.requestAnimationFrame(this.tick);
    }
  };
}

const sharedAvatarEngine = new SharedAvatarRenderEngine();

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

  // Studio 3-point warm/cool portrait lighting
  const hemiLight = new THREE.HemisphereLight(0xe0f2fe, 0xfde68a, 0.92);
  scene.add(hemiLight);

  const keyLight = new THREE.DirectionalLight(0xfffbeb, 1.38);
  keyLight.position.set(1.8, 2.4, 2.6);
  scene.add(keyLight);

  const fillLight = new THREE.DirectionalLight(0xbae6fd, 0.55);
  fillLight.position.set(-2.0, 0.8, 1.8);
  scene.add(fillLight);

  const rimLight = new THREE.DirectionalLight(0xfde047, 0.95);
  rimLight.position.set(-1.2, 2.2, -2.0);
  scene.add(rimLight);

  // Shared PBR Materials with deliberate roughness/metalness contrast
  const skinMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: persona.skinHex,
      roughness: 0.54,
      metalness: 0.02,
      emissive: 0x4a1d12,
      emissiveIntensity: 0.06,
    })
  );
  const suitMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: persona.suitHex,
      roughness: 0.76,
      metalness: 0.06,
    })
  );
  const lapelMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: persona.lapelHex,
      roughness: 0.5,
      metalness: 0.12,
    })
  );
  const shirtMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xf8fafc,
      roughness: 0.42,
      metalness: 0.02,
    })
  );
  const accentMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: persona.accentHex,
      roughness: 0.28,
      metalness: 0.42,
    })
  );
  const goldMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0xfbbf24,
      roughness: 0.18,
      metalness: 0.88,
    })
  );
  const hairMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: persona.hairHex,
      roughness: 0.46,
      metalness: 0.08,
    })
  );

  // 1. TORSO & TAILORED EXECUTIVE BLAZER
  const torsoGroup = new THREE.Group();
  torsoGroup.position.set(0, -0.62, 0);
  scene.add(torsoGroup);

  const chestMesh = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(0.36, 0.44, 0.56, 20)),
    suitMat
  );
  chestMesh.scale.set(1.22, 1, 0.72);
  chestMesh.position.y = 0.04;
  torsoGroup.add(chestMesh);

  // Rounded tailored shoulders
  const shoulderGeo = trackGeo(new THREE.SphereGeometry(0.21, 16, 12));
  for (const sx of [-0.36, 0.36]) {
    const sh = new THREE.Mesh(shoulderGeo, suitMat);
    sh.position.set(sx, 0.18, 0);
    sh.scale.set(1.05, 0.85, 0.82);
    torsoGroup.add(sh);
  }

  // Crisp White Dress Shirt V-Insert & Winged Collar
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

  // Notched Blazer Lapels
  const lapelGeo = trackGeo(new THREE.BoxGeometry(0.11, 0.34, 0.06));
  for (const side of [-1, 1]) {
    const lap = new THREE.Mesh(lapelGeo, lapelMat);
    lap.position.set(side * 0.155, 0.14, 0.248);
    lap.rotation.z = side * 0.34;
    lap.rotation.y = side * 0.16;
    torsoGroup.add(lap);
  }

  // Silk Tie / Ascot + Gold Lapel Pin
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

  // Sculpted Neck
  const neck = new THREE.Mesh(
    trackGeo(new THREE.CylinderGeometry(0.105, 0.12, 0.2, 14)),
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
  cranium.scale.set(0.95, 1.06, 0.92);
  headGroup.add(cranium);

  // Subtle sculpted jawline/chin volume
  const chin = new THREE.Mesh(
    trackGeo(new THREE.SphereGeometry(0.18, 16, 12)),
    skinMat
  );
  chin.position.set(0, -0.14, 0.065);
  chin.scale.set(1.02, 0.86, 0.88);
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
      color: 0xfb7185,
      transparent: true,
      opacity: 0.2,
    })
  );
  const cheekGeo = trackGeo(new THREE.CircleGeometry(0.052, 12));
  for (const side of [-1, 1]) {
    const cheek = new THREE.Mesh(cheekGeo, cheekMat);
    cheek.position.set(side * 0.155, -0.055, 0.258);
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
    new THREE.TorusGeometry(0.058, 0.0085, 6, 14, Math.PI * 0.86)
  );
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
    lashArc.position.set(0, 0.004, 0.036);
    lashArc.rotation.z = (Math.PI - Math.PI * 0.86) / 2;
    eyeSocket.add(lashArc);

    const eyelid = new THREE.Mesh(eyelidGeo, skinMat);
    eyelid.scale.set(1.04, 0.14, 0.72);
    eyelid.rotation.x = -0.58;
    eyeSocket.add(eyelid);

    headGroup.add(eyeSocket);
    return eyelid;
  };

  const leftEyelid = buildEye(-1);
  const rightEyelid = buildEye(1);

  // Articulated 3D Eyebrows
  const browGeo = trackGeo(new THREE.CapsuleGeometry(0.018, 0.082, 6, 8));
  browGeo.rotateZ(Math.PI / 2);

  const leftBrow = new THREE.Mesh(browGeo, hairMat);
  leftBrow.position.set(-0.115, 0.145, 0.268);
  leftBrow.rotation.set(0, -0.14, 0);
  headGroup.add(leftBrow);

  const rightBrow = new THREE.Mesh(browGeo, hairMat);
  rightBrow.position.set(0.115, 0.145, 0.268);
  rightBrow.rotation.set(0, 0.14, 0);
  headGroup.add(rightBrow);

  // Expressive Confident Smile Arc
  const mouthMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: archetype === 'yacht' || archetype === 'crown' ? 0xe11d48 : 0x9f1239,
      roughness: 0.35,
    })
  );
  const mouthArc = new THREE.Mesh(
    trackGeo(new THREE.TorusGeometry(0.068, 0.015, 8, 16, Math.PI * 0.78)),
    mouthMat
  );
  mouthArc.position.set(0, -0.115, 0.258);
  mouthArc.rotation.z = Math.PI + (Math.PI - Math.PI * 0.78) / 2;
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
    // Chủ Tịch Lan Anh: Chic Asymmetric Bob + Sleek Gold-Blue Glasses + Smartphone Deal Gesture
    const bobDome = new THREE.Mesh(
      trackGeo(
        new THREE.SphereGeometry(0.326, 22, 18, 0, Math.PI * 2, 0, Math.PI * 0.54)
      ),
      hairMat
    );
    bobDome.position.set(0, 0.065, -0.04);
    bobDome.rotation.x = -0.5;
    headGroup.add(bobDome);

    // Framing side bob locks tucked neatly beside the cheeks
    const lockGeo = trackGeo(new THREE.CapsuleGeometry(0.076, 0.25, 8, 12));
    for (const side of [-1, 1]) {
      const lock = new THREE.Mesh(lockGeo, hairMat);
      lock.position.set(side * 0.278, -0.02, -0.01);
      lock.rotation.z = side * 0.1;
      lock.rotation.x = 0.08;
      headGroup.add(lock);
    }

    // High swept side bangs leaving eyebrows and eyes completely clear
    const bangs = new THREE.Mesh(
      trackGeo(new THREE.CapsuleGeometry(0.062, 0.22, 8, 12)),
      hairMat
    );
    bangs.rotation.z = Math.PI / 2 - 0.22;
    bangs.position.set(-0.045, 0.278, 0.155);
    headGroup.add(bangs);

    // Sleek Champagne-Gold Executive Glasses Frames (unobstructed open lenses!)
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

    // Articulated Executive Smartphone Gesture (matches Business Tour's iconic lobby character!)
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
    // Phu Nhân Ngọc Diệp: Voluminous Royal Chignon + Golden Emerald Tiara Crown + Drop Earrings
    const hairDome = new THREE.Mesh(
      trackGeo(
        new THREE.SphereGeometry(0.324, 22, 18, 0, Math.PI * 2, 0, Math.PI * 0.53)
      ),
      hairMat
    );
    hairDome.position.set(0, 0.065, -0.04);
    hairDome.rotation.x = -0.5;
    headGroup.add(hairDome);

    const royalBun = new THREE.Mesh(
      trackGeo(new THREE.SphereGeometry(0.16, 16, 14)),
      hairMat
    );
    royalBun.position.set(0, 0.31, -0.08);
    royalBun.scale.set(1.15, 0.86, 0.95);
    headGroup.add(royalBun);

    const waveGeo = trackGeo(new THREE.CapsuleGeometry(0.064, 0.19, 8, 12));
    for (const side of [-1, 1]) {
      const wave = new THREE.Mesh(waveGeo, hairMat);
      wave.position.set(side * 0.268, 0.045, 0.02);
      wave.rotation.z = side * -0.18;
      headGroup.add(wave);

      // Gold Drop Earrings
      const earring = new THREE.Mesh(
        trackGeo(new THREE.SphereGeometry(0.032, 10, 10)),
        goldMat
      );
      earring.position.set(side * 0.292, -0.085, 0.02);
      headGroup.add(earring);
    }

    // Gleaming 3D Golden Royal Tiara Crown with Emerald Center Jewel
    const tiaraGroup = new THREE.Group();
    tiaraGroup.position.set(0, 0.268, 0.095);
    tiaraGroup.rotation.x = -0.16;

    const tiaraBand = new THREE.Mesh(
      trackGeo(new THREE.TorusGeometry(0.19, 0.022, 8, 20, Math.PI)),
      goldMat
    );
    tiaraBand.rotation.x = Math.PI / 2;
    tiaraBand.rotation.z = -Math.PI / 2;
    tiaraGroup.add(tiaraBand);

    const peakSpecs: Array<[number, number, number]> = [
      [0, 0.11, 0.19],
      [-0.11, 0.075, 0.155],
      [0.11, 0.075, 0.155],
    ];
    const peakGeo = trackGeo(new THREE.ConeGeometry(0.038, 0.11, 4));
    for (const [px, py, pz] of peakSpecs) {
      const pk = new THREE.Mesh(peakGeo, goldMat);
      pk.position.set(px, py * 0.55, pz);
      pk.rotation.y = Math.PI / 4;
      tiaraGroup.add(pk);
    }

    const emeraldGem = new THREE.Mesh(
      trackGeo(new THREE.OctahedronGeometry(0.036, 0)),
      trackMat(
        new THREE.MeshStandardMaterial({
          color: 0x10b981,
          emissive: 0x059669,
          emissiveIntensity: 0.35,
          roughness: 0.12,
          metalness: 0.4,
        })
      )
    );
    emeraldGem.position.set(0, 0.045, 0.205);
    tiaraGroup.add(emeraldGem);
    headGroup.add(tiaraGroup);
  }

  // 4. TOGGLEABLE 3D MINI JAIL BARS FOREGROUND (Appears when player is locked in Nhà Tù!)
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
    keyLight,
    rimLight,
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

    const envTex = sharedAvatarEngine.getEnvTexture();
    const rig = buildStylizedCharacterRig(archetype, envTex);

    const subscriber: AvatarSubscriber = {
      canvas2d: canvas,
      ctx2d,
      rig,
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

    const unsubscribe = sharedAvatarEngine.subscribe(subscriber);

    return () => {
      unsubscribe();
      for (const d of rig.disposables) {
        d.dispose();
      }
    };
  }, [archetype, facingSign]);

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
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
