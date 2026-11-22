# Onboard GPU (iGPU) System & 3D Rendering Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate 100% integrated GPU saturation and frame drops by adding automatic hardware GPU classification, hot-swappable 3-tier graphics profiles (`Auto / Thấp / Vừa / Cao`), demand-driven `0 FPS` idle/occluded board rendering, static cached 3D avatar snapshots on `low`, shared 3D geometries/materials, and `React.memo` UI isolation.

**Architecture:** Pure hardware classification, `localStorage` persistence, quality profile lookup, and animation-activity predicates live in `src/game/graphicsQuality.ts`; `src/three/models.ts` and `src/three/treasurySystem.ts` expose shared asset pools, lazy badge textures, active-animation queries, and dynamic shadow/clearcoat toggles; `PlayerAvatar3D.tsx` caches per-archetype rigs and 2D snapshots at `0 FPS` on `low` (`15/30 FPS` on `medium/high`); `MonopolyCanvas.tsx` runs a demand-driven render loop with on-demand shadows and lazy `high`-only post-processing; `GraphicsQualityPicker.tsx`, `StartModal.tsx`, `ActionDock.tsx`, `PlayerHUD.tsx`, and `App.tsx` connect live UI controls with memoized props.

**Tech Stack:** TypeScript, Three.js `0.187.0`, `cannon-es`, React 19 (`React.memo`, `useCallback`), Tailwind CSS v4, Node test runner (`tsx --test`).

**Spec:** `docs/superpowers/specs/2026-11-21-igpu-performance-optimization-design.md`

## Global Constraints

- Zero `backdrop-filter` over the active WebGL canvas.
- Zero per-frame `Geometry`, `Material`, or `Texture` allocations inside `requestAnimationFrame`.
- Keep native `1.0` `pixelRatio` floor on `low` so Vietnamese typography on 3D tiles remains 100% crisp.
- Hot-swapping graphics quality mid-match must preserve the active match, camera pose, and Online WebSocket session without remounting `<MonopolyCanvas>`.
- All automated tests (`npm test`), TypeScript checks (`npm run lint`), and production bundle (`npm run build`) must pass 100%.

## Review Focus

- Integrated AMD strings (`"AMD Radeon(TM) Graphics"`, `"ANGLE (AMD, AMD Radeon(TM) Vega 8 Graphics ...)"`) must classify as `'low'` onboard, while dedicated `"AMD Radeon RX 6600"` classifies as `'high'`.
- Privacy-masked or generic browser WebGL renderer strings (`"WebKit WebGL"`, `"ANGLE (Generic)"`, `""`) must default safely to `'low'` (`isSoftwareGl: false`) so unknown laptops never boot into GTAO/MSAA overload.
- Manual override to `'high'` on a software WebGL context (`isSoftwareGl === true`) must still clamp `maxPixelRatio` to `1.0` and force `usePostProcessing: false` and `shadowsEnabled: false`.
- `shouldKeepBoardAnimating` must return `false` whenever `isDocumentHidden` or `isBoardOccluded` is `true`, preventing background 60 FPS GPU drain behind `StartModal`, `PauseModal`, or `VictoryModal`.
- `localStorage` access in restricted/private contexts throwing `SecurityError` or holding invalid strings must fall back cleanly to `'auto'`.

---

### Task 1: GPU Hardware Classifier, 3-Tier Profiles, Persistence & Activity Predicates (`graphicsQuality.ts`)

**Files:**
- Modify: `src/game/types.ts`
- Create: `src/game/graphicsQuality.ts`
- Test: `src/game/graphicsQuality.test.ts`

**Interfaces:**
- Produces in `src/game/types.ts`:
  - `export type GraphicsQualityPref = 'auto' | 'low' | 'medium' | 'high'`
  - `export type GraphicsQualityTier = 'low' | 'medium' | 'high'`
- Produces in `src/game/graphicsQuality.ts`:
  - `export interface DetectedGpuInfo { tier: GraphicsQualityTier; isSoftwareGl: boolean; label: string; rawRenderer: string }`
  - `export interface GraphicsQualityProfile { tier: GraphicsQualityTier; maxPixelRatio: number; antialias: boolean; usePostProcessing: boolean; shadowsEnabled: boolean; shadowMapSize: number; useEnvironmentMap: boolean; usePhysicalClearcoat: boolean; animateAmbientProps: boolean; idleBoardFps: number; activeBoardFps: number; avatarFps: number; avatarPixelSize: number }`
  - `export interface BoardAnimationActivityInput { isDocumentHidden: boolean; isBoardOccluded: boolean; hasActiveMotion: boolean; idleBoardFps: number }`
  - `export function classifyGpuRenderer(rendererString: string): DetectedGpuInfo`
  - `export function detectBrowserGpu(): DetectedGpuInfo`
  - `export function resolveEffectiveGraphicsTier(pref: GraphicsQualityPref, detected: DetectedGpuInfo): GraphicsQualityTier`
  - `export function resolveGraphicsProfile(tier: GraphicsQualityTier, isSoftwareGl?: boolean): GraphicsQualityProfile`
  - `export function shouldKeepBoardAnimating(input: BoardAnimationActivityInput): { mode: 'stop' | 'interval' | 'raf'; intervalMs: number }`
  - `export function loadSavedGraphicsQualityPref(storage?: Pick<Storage, 'getItem'> | null): GraphicsQualityPref`
  - `export function saveGraphicsQualityPref(pref: GraphicsQualityPref, storage?: Pick<Storage, 'setItem'> | null): void`

- [ ] **Step 1: Write failing unit tests in `src/game/graphicsQuality.test.ts`**
  Cover Intel UHD/Iris Xe, AMD Radeon(TM) Graphics vs Radeon RX, NVIDIA RTX/GTX, Apple M-series base vs Pro/Max, SwiftShader/llvmpipe, privacy-masked `"WebKit WebGL"`, `localStorage` load/save/corrupt/throwing fallback, `resolveGraphicsProfile` across `low`/`medium`/`high` + `isSoftwareGl = true` clamp, and `shouldKeepBoardAnimating` for hidden/occluded/active/idle modes.
- [ ] **Step 2: Run `npx tsx --test src/game/graphicsQuality.test.ts` and confirm RED failure**
  Expected: FAIL with module `./graphicsQuality` not found.
- [ ] **Step 3: Implement `GraphicsQualityPref`/`GraphicsQualityTier` in `src/game/types.ts` and `src/game/graphicsQuality.ts`**
- [ ] **Step 4: Run `npm test` and confirm GREEN**
  Expected: PASS 100% across all test files.
- [ ] **Step 5: Commit Task 1**
  `git add src/game/types.ts src/game/graphicsQuality.ts src/game/graphicsQuality.test.ts && git commit -m "feat(perf): add GPU classifier, 3-tier graphics profiles, and frame-pacing logic"`

---

### Task 2: Shared 3D Assets, Lazy Level Badges & Treasury Animation/Quality Hooks (`models.ts` & `treasurySystem.ts`)

**Files:**
- Modify: `src/three/models.ts`
- Modify: `src/three/treasurySystem.ts`
- Test: `src/three/performanceAssets.test.ts`

**Interfaces:**
- Consumes: `GraphicsQualityProfile` from `src/game/graphicsQuality.ts`
- Produces in `src/three/models.ts`:
  - `OwnershipBuildingSuiteRefs` extended with `setQualityOptions: (opts: { shadowsEnabled: boolean; clearcoatEnabled: boolean }) => void` and `levelBadgeMat.map` initialized to `null` (lazy texture creation only when `level >= 1`).
  - Shared geometry reuse inside `models.ts` marked with `geo.userData.sharedStatic = true` and shared non-mutated trim materials marked with `mat.userData.sharedStatic = true` so `MonopolyCanvas` unmount skips disposing shared singletons while disposing per-scene assets cleanly.
- Produces in `src/three/treasurySystem.ts`:
  - `TreasurySystemController` extended with:
    - `hasActiveAnimations: () => boolean`
    - `setQualityProfile: (profile: Pick<GraphicsQualityProfile, 'shadowsEnabled' | 'usePhysicalClearcoat'>) => void`

- [ ] **Step 1: Write failing unit tests in `src/three/performanceAssets.test.ts`**
  Assert:
  1. `createOwnershipBuildingSuite` initializes `levelBadgeMat.map === null`, shares static geometries across multiple suites (`suiteA` vs `suiteB`), and `setQualityOptions` toggles `facadeMat.clearcoat` / `roofMat.clearcoat` and shadow flags.
  2. `createTreasurySystem` starts with `hasActiveAnimations() === false` after initial `syncVaults` + `update`, transitions to `true` after `enqueueTransfers(...)`, returns to `false` after advancing `update(0.05, t)` past flight + recoil completion, and `setQualityProfile` toggles shadow casting and clearcoat on metallic pools.
- [ ] **Step 2: Run `npx tsx --test src/three/performanceAssets.test.ts` and confirm RED failure**
  Expected: FAIL (`hasActiveAnimations` / `setQualityOptions` undefined and `levelBadgeMat.map !== null`).
- [ ] **Step 3: Implement shared geometry/material reuse + lazy badge + `setQualityOptions` in `src/three/models.ts`, and `hasActiveAnimations` + `setQualityProfile` in `src/three/treasurySystem.ts`**
- [ ] **Step 4: Run `npm test` and confirm GREEN**
  Expected: PASS 100%.
- [ ] **Step 5: Commit Task 2**
  `git add src/three/models.ts src/three/treasurySystem.ts src/three/performanceAssets.test.ts && git commit -m "perf(three): share static building geometries, lazy-load badge textures, and expose treasury activity hooks"`

---

### Task 3: Snapshot-Cached (`0 FPS` on Low) & Frame-Paced `PlayerAvatar3D` Engine (`PlayerAvatar3D.tsx`)

**Files:**
- Modify: `src/components/PlayerAvatar3D.tsx`

**Interfaces:**
- Consumes: `GraphicsQualityTier`, `resolveGraphicsProfile`, `detectBrowserGpu` from `src/game/graphicsQuality.ts`
- Produces in `src/components/PlayerAvatar3D.tsx`:
  - `export function setAvatarGraphicsTier(tier: GraphicsQualityTier): void`

- [ ] **Step 1: Refactor `SharedAvatarRenderEngine` in `src/components/PlayerAvatar3D.tsx`**
  - Cache 1 shared `CharacterRigRefs` per `AvatarArchetypeId` (`Map<AvatarArchetypeId, CharacterRigRefs>`) instead of rebuilding 45-mesh Three.js scenes per mounted `<PlayerAvatar3D>`.
  - Support `setQualityTier(tier)`:
    - `low` (`avatarFps === 0`): Render static 3D portraits at `160×160` (`blinkAmount = 0` open eyes) into `snapshotCache: Map<string, HTMLCanvasElement>` keyed by `${archetype}|${mood}|${isActive ? 1 : 0}|${facingSign}`, blit onto subscriber `ctx2d`, and keep `requestAnimationFrame` stopped (`0 FPS`). Re-blit immediately via `notifySubscriberChanged` whenever `[archetype, mood, isActive, facingSign]` changes.
    - `medium` (`15 FPS`, `192×192`) & `high` (`30 FPS`, `256×256`): Frame-pace `tick()` via elapsed wall-clock threshold (`66ms` / `33ms`), disable `clearcoat`/`sheen` when `!profile.usePhysicalClearcoat`, and pause automatically while `document.hidden === true`.
- [ ] **Step 2: Run `npm run lint` and `npm test` to verify clean types and test suite**
  Expected: 0 TypeScript errors, 100% tests pass.
- [ ] **Step 3: Commit Task 3**
  `git add src/components/PlayerAvatar3D.tsx && git commit -m "perf(avatar): cache shared 3D rigs and add 0-FPS static 3D snapshot mode for onboard GPUs"`

---

### Task 4: Demand-Driven Render Loop, On-Demand Shadows & Hot-Swap Post-Processing (`MonopolyCanvas.tsx`)

**Files:**
- Modify: `src/components/MonopolyCanvas.tsx`

**Interfaces:**
- Consumes:
  - `GraphicsQualityTier` from `src/game/types.ts`
  - `detectBrowserGpu`, `resolveGraphicsProfile`, `shouldKeepBoardAnimating` from `src/game/graphicsQuality.ts`
  - `treasury.hasActiveAnimations()`, `treasury.setQualityProfile(...)` from `src/three/treasurySystem.ts`
  - `suite.setQualityOptions(...)` from `src/three/models.ts`
- Updates `MonopolyCanvasProps`:
  - `graphicsQualityTier?: GraphicsQualityTier` (defaults to `'low'`)
  - `isBoardOccluded?: boolean` (defaults to `false`)

- [ ] **Step 1: Implement hot-swappable quality pipeline & demand-driven loop in `src/components/MonopolyCanvas.tsx`**
  - Detect hardware once via `detectBrowserGpu()` and apply `resolveGraphicsProfile(graphicsQualityTier, gpuInfo.isSoftwareGl)`.
  - Configure `renderer.shadowMap.autoUpdate = false`; trigger `renderer.shadowMap.needsUpdate = true` only when shadow-casting scene elements move (dice, pawns, flying cash, building pop, tile lift, sun/moon transition) or shadow settings change.
  - Lazy-create `EffectComposer` + `GTAOPass` + `UnrealBloomPass` + `OutputPass` ONLY when `profile.usePostProcessing === true` (`high` tier); cache transparent objects list instead of per-frame `scene.traverse`, set `bloomPass.enabled = currentNightFactor > 0.005`, and `dispose()` composer targets immediately when switching down to `low`/`medium`.
  - Toggle `scene.environment = profile.useEnvironmentMap ? envRT.texture : null` (with subtle light intensity compensation when `null`) and update pixelRatio, shadows, building suites, and treasury quality profile live without remounting the WebGL context.
  - Replace unconditional `requestAnimationFrame(tick)` with demand-driven scheduler using `shouldKeepBoardAnimating`:
    - `0 FPS` when `document.hidden` or `isBoardOccluded` (after rendering 1 clean static backdrop frame).
    - `0 FPS` idle sleep on `low`, `20 FPS` idle timer on `medium`, `60 FPS` on `high`, and immediate `60 FPS` wakeup via `requestRender()` on any prop change, imperative animation call, `OrbitControls` `'change'`, hover tile change, resize, font load, or tab visibility restore.
  - Respect `userData.sharedStatic` during unmount cleanup so shared static geometries/materials are not prematurely disposed.
- [ ] **Step 2: Run `npm run lint` and `npm test` to verify clean compilation and green tests**
  Expected: 0 TypeScript errors, 100% tests pass.
- [ ] **Step 3: Commit Task 4**
  `git add src/components/MonopolyCanvas.tsx && git commit -m "perf(canvas): implement demand-driven render loop, on-demand shadows, and hot-swap quality tiers"`

---

### Task 5: `GraphicsQualityPicker` UI, `React.memo` Isolation & Live Wiring (`GraphicsQualityPicker.tsx`, `StartModal.tsx`, `ActionDock.tsx`, `PlayerHUD.tsx`, `App.tsx`)

**Files:**
- Create: `src/components/GraphicsQualityPicker.tsx`
- Modify: `src/components/StartModal.tsx`
- Modify: `src/components/ActionDock.tsx`
- Modify: `src/components/PlayerHUD.tsx`
- Modify: `src/App.tsx`

**Interfaces:**
- Produces `GraphicsQualityPickerProps` in `src/components/GraphicsQualityPicker.tsx`:
  - `value: GraphicsQualityPref`
  - `effectiveTier: GraphicsQualityTier`
  - `gpuLabel?: string`
  - `compact?: boolean`
  - `onChange: (next: GraphicsQualityPref) => void`

- [ ] **Step 1: Create `src/components/GraphicsQualityPicker.tsx`**
  Render 4 Business Tour glossy buttons (`⚡ Tự động`, `🌱 Thấp`, `⚖️ Vừa`, `✨ Cao`) with `data-testid="bt-graphics-quality-picker"` and `data-testid="bt-quality-opt-{auto|low|medium|high}"`, plus active tier status badge (e.g. `Đang chạy: Thấp · Card Onboard`).
- [ ] **Step 2: Wrap `PlayerCornerCard` & `PlayerHUD` (`src/components/PlayerHUD.tsx`) and `ActionDock` (`src/components/ActionDock.tsx`) in `React.memo`, and embed `GraphicsQualityPicker` in `StartModal.tsx` & `ActionDock.tsx`**
- [ ] **Step 3: Wire `graphicsQualityPref`, `detectedGpu`, `effectiveQualityTier`, `setAvatarGraphicsTier`, `document.body.dataset.quality`, `isBoardOccluded={viewScreenState !== 'playing'}`, and memoized `useCallback` handlers in `src/App.tsx`**
- [ ] **Step 4: Run `npm test`, `npm run lint`, and `npm run build` to verify full integration**
  Expected: All tests PASS, `tsc --noEmit` exits 0, `vite build` + `esbuild` exits 0.
- [ ] **Step 5: Commit Task 5**
  `git add src/components/GraphicsQualityPicker.tsx src/components/StartModal.tsx src/components/ActionDock.tsx src/components/PlayerHUD.tsx src/App.tsx && git commit -m "feat(ui): add graphics quality selector in Lobby/Settings and memoize HUD against timer re-renders"`
