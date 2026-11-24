import * as THREE from 'three';
import type { GLTFLoader as GLTFLoaderType } from 'three/addons/loaders/GLTFLoader.js';

export const CHARACTER_CLIP_NAMES = [
  'idle_loop',
  'anticipation',
  'hop_takeoff',
  'hop_airborne',
  'hop_land',
  'corner_bank',
  'celebrate_short',
  'proud_gesture',
  'stressed_slump',
  'jailed_loop',
  'victory_dance',
  'defeat_slump',
] as const;

export type CharacterClipName = (typeof CHARACTER_CLIP_NAMES)[number];

export interface GltfAssetTemplate {
  readonly url: string;
  readonly scene: THREE.Group;
  readonly animations: THREE.AnimationClip[];
}

export interface GltfClonedInstance {
  readonly url: string;
  readonly scene: THREE.Object3D;
  readonly animations: THREE.AnimationClip[];
}

export interface GltfContractLimits {
  maxBones: number;
  maxTriangles: number;
  requiredClips: readonly string[];
}

export interface GltfContractValidationResult {
  valid: boolean;
  boneCount: number;
  triangleCount: number;
  missingClips: string[];
  issues: string[];
}

export interface GltfAssetPoolOptions {
  /** Custom loader injection for deterministic tests or offline bundling. */
  loadGltf?: (url: string) => Promise<GltfAssetTemplate>;
}

export interface GltfAssetPool {
  load: (url: string) => Promise<GltfAssetTemplate | null>;
  acquireClone: (url: string) => Promise<GltfClonedInstance | null>;
  getCachedSync: (url: string) => GltfAssetTemplate | null;
  dispose: () => void;
}

const DEFAULT_CONTRACT_LIMITS: GltfContractLimits = {
  maxBones: 12,
  maxTriangles: 1800,
  requiredClips: CHARACTER_CLIP_NAMES,
};

/**
 * Validates triangle budget, bone cap, and clip names for rigged `.glb` character assets
 * so low-end iGPU devices never receive oversized meshes or broken NLA rigs.
 */
export function validateCharacterGltfContract(
  scene: THREE.Object3D,
  animations: readonly THREE.AnimationClip[],
  limits: Partial<GltfContractLimits> = {}
): GltfContractValidationResult {
  const maxBones = limits.maxBones ?? DEFAULT_CONTRACT_LIMITS.maxBones;
  const maxTriangles = limits.maxTriangles ?? DEFAULT_CONTRACT_LIMITS.maxTriangles;
  const requiredClips = limits.requiredClips ?? DEFAULT_CONTRACT_LIMITS.requiredClips;

  let boneCount = 0;
  let triangleCount = 0;

  scene.traverse((obj) => {
    if ((obj as THREE.Bone).isBone || obj instanceof THREE.Bone) {
      boneCount += 1;
    }
    const mesh = obj as THREE.Mesh;
    if (mesh.isMesh && mesh.geometry) {
      const geo = mesh.geometry;
      if (geo.index) {
        triangleCount += Math.floor(geo.index.count / 3);
      } else {
        const pos = geo.getAttribute('position');
        if (pos) {
          triangleCount += Math.floor(pos.count / 3);
        }
      }
    }
  });

  const clipNames = new Set(animations.map((clip) => clip.name));
  const missingClips = requiredClips.filter((name) => !clipNames.has(name));
  const issues: string[] = [];

  if (boneCount > maxBones) {
    issues.push(`Bone count ${boneCount} exceeds limit ${maxBones}`);
  }
  if (triangleCount > maxTriangles) {
    issues.push(`Triangle count ${triangleCount} exceeds limit ${maxTriangles}`);
  }
  if (missingClips.length > 0) {
    issues.push(`Missing clips: ${missingClips.join(', ')}`);
  }

  return {
    valid: issues.length === 0,
    boneCount,
    triangleCount,
    missingClips,
    issues,
  };
}

function disposeObjectSubtreeResources(root: THREE.Object3D): void {
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    if (mesh.geometry && !mesh.geometry.userData?.sharedStatic) {
      mesh.geometry.dispose();
    }
    const disposeMaterial = (material: THREE.Material) => {
      if (material.userData?.sharedStatic) return;
      const std = material as THREE.MeshStandardMaterial;
      if (std.map && !std.map.userData?.sharedStatic) std.map.dispose();
      if (std.normalMap && !std.normalMap.userData?.sharedStatic) std.normalMap.dispose();
      if (std.roughnessMap && !std.roughnessMap.userData?.sharedStatic) {
        std.roughnessMap.dispose();
      }
      if (std.emissiveMap && !std.emissiveMap.userData?.sharedStatic) {
        std.emissiveMap.dispose();
      }
      material.dispose();
    };
    if (Array.isArray(mesh.material)) {
      mesh.material.forEach(disposeMaterial);
    } else if (mesh.material) {
      disposeMaterial(mesh.material);
    }
  });
}

/**
 * In-memory GLTF template cache with concurrent request deduplication,
 * `SkeletonUtils.clone` instantiation, and graceful `null` fallback when assets are
 * absent or fail to load so procedural pawns stay usable immediately.
 */
export function createGltfAssetPool(options: GltfAssetPoolOptions = {}): GltfAssetPool {
  const cache = new Map<string, GltfAssetTemplate>();
  const inFlight = new Map<string, Promise<GltfAssetTemplate | null>>();
  let loaderInstance: GLTFLoaderType | null = null;
  let cloneSkeletonFn: ((src: THREE.Object3D) => THREE.Object3D) | null = null;
  let disposed = false;

  const loadViaGltfLoader = async (url: string): Promise<GltfAssetTemplate> => {
    if (!loaderInstance) {
      const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
      loaderInstance = new GLTFLoader();
    }
    const gltf = await loaderInstance.loadAsync(url);
    return {
      url,
      scene: gltf.scene,
      animations: gltf.animations ?? [],
    };
  };

  const ensureCloneSkeleton = async (): Promise<(src: THREE.Object3D) => THREE.Object3D> => {
    if (!cloneSkeletonFn) {
      const { clone } = await import('three/addons/utils/SkeletonUtils.js');
      cloneSkeletonFn = clone;
    }
    return cloneSkeletonFn;
  };

  const rawLoader = options.loadGltf ?? loadViaGltfLoader;

  const load = (url: string): Promise<GltfAssetTemplate | null> => {
    if (disposed) return Promise.resolve(null);
    const cached = cache.get(url);
    if (cached) return Promise.resolve(cached);

    const pending = inFlight.get(url);
    if (pending) return pending;

    const promise = rawLoader(url)
      .then((template) => {
        inFlight.delete(url);
        if (disposed) {
          disposeObjectSubtreeResources(template.scene);
          return null;
        }
        cache.set(url, template);
        return template;
      })
      .catch(() => {
        inFlight.delete(url);
        return null;
      });

    inFlight.set(url, promise);
    return promise;
  };

  const acquireClone = async (url: string): Promise<GltfClonedInstance | null> => {
    const [template, cloneFn] = await Promise.all([load(url), ensureCloneSkeleton()]);
    if (!template || disposed) return null;
    try {
      return {
        url: template.url,
        scene: cloneFn(template.scene),
        animations: template.animations,
      };
    } catch {
      return null;
    }
  };

  const getCachedSync = (url: string): GltfAssetTemplate | null => {
    if (disposed) return null;
    return cache.get(url) ?? null;
  };

  const dispose = (): void => {
    if (disposed) return;
    disposed = true;
    for (const template of cache.values()) {
      disposeObjectSubtreeResources(template.scene);
    }
    cache.clear();
    inFlight.clear();
    loaderInstance = null;
  };

  return {
    load,
    acquireClone,
    getCachedSync,
    dispose,
  };
}
