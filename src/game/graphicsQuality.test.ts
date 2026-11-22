import assert from 'node:assert/strict';
import test from 'node:test';
import {
  classifyGpuRenderer,
  createBoardFrameScheduler,
  loadSavedGraphicsQualityPref,
  resolveEffectiveGraphicsTier,
  resolveGraphicsProfile,
  saveGraphicsQualityPref,
  shouldKeepBoardAnimating,
} from './graphicsQuality';

test('classifyGpuRenderer classifies onboard Intel/AMD/Apple/masked GPUs as low and dedicated GPUs as high', () => {
  // Software GL fallbacks
  const swift = classifyGpuRenderer(
    'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), Google-5.0.0)'
  );
  assert.equal(swift.isSoftwareGl, true);
  assert.equal(swift.tier, 'low');

  const basicRender = classifyGpuRenderer('Microsoft Basic Render Driver');
  assert.equal(basicRender.isSoftwareGl, true);
  assert.equal(basicRender.tier, 'low');

  // Integrated / Onboard GPUs -> must default safely to 'low' (isSoftwareGl: false)
  const intelUhd = classifyGpuRenderer(
    'ANGLE (Intel, Intel(R) UHD Graphics 630 Direct3D11 vs_5_0 ps_5_0, D3D11)'
  );
  assert.equal(intelUhd.isSoftwareGl, false);
  assert.equal(intelUhd.tier, 'low');

  const intelIris = classifyGpuRenderer(
    'ANGLE (Intel, Intel(R) Iris(R) Xe Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)'
  );
  assert.equal(intelIris.isSoftwareGl, false);
  assert.equal(intelIris.tier, 'low');

  const amdOnboard = classifyGpuRenderer(
    'ANGLE (AMD, AMD Radeon(TM) Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)'
  );
  assert.equal(amdOnboard.isSoftwareGl, false);
  assert.equal(amdOnboard.tier, 'low');

  const amdVegaOnboard = classifyGpuRenderer(
    'ANGLE (AMD, AMD Radeon(TM) Vega 8 Graphics Direct3D11 vs_5_0 ps_5_0)'
  );
  assert.equal(amdVegaOnboard.isSoftwareGl, false);
  assert.equal(amdVegaOnboard.tier, 'low');

  // Privacy-masked / generic strings -> must default safely to 'low'
  const masked = classifyGpuRenderer('WebKit WebGL');
  assert.equal(masked.isSoftwareGl, false);
  assert.equal(masked.tier, 'low');

  const empty = classifyGpuRenderer('');
  assert.equal(empty.isSoftwareGl, false);
  assert.equal(empty.tier, 'low');

  // Dedicated GPUs -> 'high'
  const rtx = classifyGpuRenderer(
    'ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0, D3D11)'
  );
  assert.equal(rtx.isSoftwareGl, false);
  assert.equal(rtx.tier, 'high');

  const radeonRx = classifyGpuRenderer(
    'ANGLE (AMD, AMD Radeon RX 6600 XT Direct3D11 vs_5_0 ps_5_0, D3D11)'
  );
  assert.equal(radeonRx.isSoftwareGl, false);
  assert.equal(radeonRx.tier, 'high');

  const appleMax = classifyGpuRenderer('Apple M2 Max');
  assert.equal(appleMax.isSoftwareGl, false);
  assert.equal(appleMax.tier, 'high');
});

test('resolveEffectiveGraphicsTier respects auto detection and explicit user overrides', () => {
  const onboardGpu = classifyGpuRenderer('Intel(R) UHD Graphics 620');
  const dGpu = classifyGpuRenderer('NVIDIA GeForce GTX 1660 Super');

  assert.equal(resolveEffectiveGraphicsTier('auto', onboardGpu), 'low');
  assert.equal(resolveEffectiveGraphicsTier('auto', dGpu), 'high');
  assert.equal(resolveEffectiveGraphicsTier('medium', onboardGpu), 'medium');
  assert.equal(resolveEffectiveGraphicsTier('high', onboardGpu), 'high');
  assert.equal(resolveEffectiveGraphicsTier('low', dGpu), 'low');
});

test('resolveGraphicsProfile configures 3 distinct tiers and clamps software GL safely', () => {
  const low = resolveGraphicsProfile('low', false);
  assert.equal(low.maxPixelRatio, 1.0);
  assert.equal(low.usePostProcessing, false);
  assert.equal(low.shadowsEnabled, false);
  assert.equal(low.useEnvironmentMap, false);
  assert.equal(low.usePhysicalClearcoat, false);
  assert.equal(low.animateAmbientProps, false);
  assert.equal(low.idleBoardFps, 0);
  assert.equal(low.avatarFps, 0);
  assert.equal(low.avatarPixelSize, 160);

  const med = resolveGraphicsProfile('medium', false);
  assert.equal(med.maxPixelRatio, 1.25);
  assert.equal(med.usePostProcessing, false);
  assert.equal(med.shadowsEnabled, true);
  assert.equal(med.shadowMapSize, 1024);
  assert.equal(med.useEnvironmentMap, true);
  assert.equal(med.usePhysicalClearcoat, false);
  assert.equal(med.animateAmbientProps, true);
  assert.equal(med.idleBoardFps, 20);
  assert.equal(med.avatarFps, 15);
  assert.equal(med.avatarPixelSize, 192);

  const high = resolveGraphicsProfile('high', false);
  assert.equal(high.maxPixelRatio, 1.75);
  assert.equal(high.usePostProcessing, true);
  assert.equal(high.shadowsEnabled, true);
  assert.equal(high.shadowMapSize, 2048);
  assert.equal(high.usePhysicalClearcoat, true);
  assert.equal(high.idleBoardFps, 60);
  assert.equal(high.avatarFps, 30);
  assert.equal(high.avatarPixelSize, 256);

  // Software GL safety clamp even if user manually selected 'high'
  const highOnSoftware = resolveGraphicsProfile('high', true);
  assert.equal(highOnSoftware.maxPixelRatio, 1.0);
  assert.equal(highOnSoftware.usePostProcessing, false);
  assert.equal(highOnSoftware.shadowsEnabled, false);
  assert.equal(highOnSoftware.avatarPixelSize, 144);
});

test('loadSavedGraphicsQualityPref and saveGraphicsQualityPref handle valid, invalid, and throwing storage', () => {
  const store = new Map<string, string>();
  const mockStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => {
      store.set(k, v);
    },
  };

  assert.equal(loadSavedGraphicsQualityPref(mockStorage), 'auto');

  saveGraphicsQualityPref('medium', mockStorage);
  assert.equal(loadSavedGraphicsQualityPref(mockStorage), 'medium');

  store.set('bt_vn_graphics_quality', 'ultra-invalid');
  assert.equal(loadSavedGraphicsQualityPref(mockStorage), 'auto');

  const throwingStorage = {
    getItem: () => {
      throw new Error('SecurityError');
    },
    setItem: () => {
      throw new Error('QuotaExceededError');
    },
  };
  assert.equal(loadSavedGraphicsQualityPref(throwingStorage), 'auto');
  assert.doesNotThrow(() => saveGraphicsQualityPref('low', throwingStorage));
});

test('shouldKeepBoardAnimating stops when hidden/occluded, runs raf on motion, and paces idle FPS', () => {
  // Hidden tab -> always stop
  assert.deepEqual(
    shouldKeepBoardAnimating({
      isDocumentHidden: true,
      isBoardOccluded: false,
      hasActiveMotion: true,
      idleBoardFps: 60,
    }),
    { mode: 'stop', intervalMs: 0 }
  );

  // Occluded by StartModal / PauseModal / VictoryModal -> always stop after backdrop frame
  assert.deepEqual(
    shouldKeepBoardAnimating({
      isDocumentHidden: false,
      isBoardOccluded: true,
      hasActiveMotion: true,
      idleBoardFps: 60,
    }),
    { mode: 'stop', intervalMs: 0 }
  );

  // Active dice/pawn/camera/cash motion -> full smooth RAF even on low tier
  assert.deepEqual(
    shouldKeepBoardAnimating({
      isDocumentHidden: false,
      isBoardOccluded: false,
      hasActiveMotion: true,
      idleBoardFps: 0,
    }),
    { mode: 'raf', intervalMs: 0 }
  );

  // Idle board on 'low' (idleBoardFps = 0) -> sleep 0 FPS!
  assert.deepEqual(
    shouldKeepBoardAnimating({
      isDocumentHidden: false,
      isBoardOccluded: false,
      hasActiveMotion: false,
      idleBoardFps: 0,
    }),
    { mode: 'stop', intervalMs: 0 }
  );

  // Idle board on 'medium' (idleBoardFps = 20) -> 50ms interval
  assert.deepEqual(
    shouldKeepBoardAnimating({
      isDocumentHidden: false,
      isBoardOccluded: false,
      hasActiveMotion: false,
      idleBoardFps: 20,
    }),
    { mode: 'interval', intervalMs: 50 }
  );

  // Idle board on 'high' (idleBoardFps = 60) -> RAF
  assert.deepEqual(
    shouldKeepBoardAnimating({
      isDocumentHidden: false,
      isBoardOccluded: false,
      hasActiveMotion: false,
      idleBoardFps: 60,
    }),
    { mode: 'raf', intervalMs: 0 }
  );

  // Pending dice/hop Promises while tab hidden or occluded -> background_sim at 80ms (0 GPU draw, 0 hung Promises!)
  assert.deepEqual(
    shouldKeepBoardAnimating({
      isDocumentHidden: true,
      isBoardOccluded: false,
      hasActiveMotion: true,
      hasPendingGameplayPromises: true,
      idleBoardFps: 0,
    }),
    { mode: 'background_sim', intervalMs: 80 }
  );

  assert.deepEqual(
    shouldKeepBoardAnimating({
      isDocumentHidden: false,
      isBoardOccluded: true,
      hasActiveMotion: true,
      hasPendingGameplayPromises: true,
      idleBoardFps: 0,
    }),
    { mode: 'background_sim', intervalMs: 80 }
  );
});

test('createBoardFrameScheduler prevents 2^N RAF fork bomb when OrbitControls dispatches change inside onFrame', () => {
  let nowMs = 1000;
  let nextId = 1;
  const activeRafs = new Map<number, () => void>();
  const activeTimers = new Map<number, { cb: () => void; ms: number }>();

  let frameExecutions = 0;
  let orbitDampingActive = false;

  const scheduler = createBoardFrameScheduler({
    isSoftwareGl: false,
    now: () => nowMs,
    isDocumentHidden: () => false,
    hasPendingGameplayPromises: () => false,
    requestRaf: (cb) => {
      const id = nextId++;
      activeRafs.set(id, cb);
      return id;
    },
    cancelRaf: (id) => {
      activeRafs.delete(id);
    },
    setTimer: (cb, ms) => {
      const id = nextId++;
      activeTimers.set(id, { cb, ms });
      return id;
    },
    clearTimer: (id) => {
      activeTimers.delete(id);
    },
    onFrame: () => {
      frameExecutions++;
      if (orbitDampingActive) {
        // Simulates OrbitControls.update() synchronously firing 'change' -> requestRender() inside tick()!
        scheduler.requestRender();
        return { mode: 'raf', intervalMs: 0 };
      }
      return { mode: 'interval', intervalMs: 50 };
    },
  });

  // Initial mount renders 1 frame and schedules 50ms idle interval (medium tier)
  scheduler.runImmediateTick();
  assert.equal(frameExecutions, 1);
  assert.equal(activeRafs.size, 0);
  assert.equal(activeTimers.size, 1);

  // Simulate 16 high-polling pointermove events arriving before next VSync while user starts dragging
  orbitDampingActive = true;
  for (let p = 0; p < 16; p++) {
    scheduler.requestRender();
  }
  assert.equal(
    activeTimers.size,
    0,
    'Pending idle timeout must be cancelled when upgrading to RAF'
  );
  assert.equal(
    activeRafs.size,
    1,
    'High-frequency pointermove must queue at most 1 RAF callback'
  );

  // Advance 20 VSync frames while OrbitControls damping continues firing requestRender() inside onFrame
  for (let vsync = 0; vsync < 20; vsync++) {
    nowMs += 16.67;
    const queuedThisVsync = [...activeRafs.entries()];
    assert.equal(
      queuedThisVsync.length,
      1,
      `VSync ${vsync + 1} must execute exactly 1 RAF callback (got ${queuedThisVsync.length})`
    );
    activeRafs.clear();
    for (const [, cb] of queuedThisVsync) {
      cb();
    }
  }

  assert.equal(frameExecutions, 21);

  // Stop damping -> next VSync transitions cleanly back to 1 idle timer with 0 stray RAFs
  orbitDampingActive = false;
  nowMs += 16.67;
  const finalMotionVsync = [...activeRafs.values()];
  activeRafs.clear();
  finalMotionVsync.forEach((cb) => cb());
  assert.equal(activeRafs.size, 0);
  assert.equal(activeTimers.size, 1);

  // Dispose cleans up all pending timers/RAFs
  scheduler.dispose();
  assert.equal(activeRafs.size, 0);
  assert.equal(activeTimers.size, 0);
});

