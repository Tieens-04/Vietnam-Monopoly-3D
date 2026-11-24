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

test('BUG-10: computeBoardFrameDeltas decouples gameplayAnimDt from visualAnimDt across 60/30/15/5/2.5 FPS and Pause/Resume', async () => {
  const gqMod = (await import('./graphicsQuality')) as Record<string, unknown>;
  const computeBoardFrameDeltas = gqMod.computeBoardFrameDeltas as
    | ((input: {
        rawDtSec: number;
        isPaused: boolean;
        wasPausedPrevFrame: boolean;
        isDocumentHidden: boolean;
        isSoftwareGl: boolean;
      }) => { simDt: number; visualAnimDt: number; gameplayAnimDt: number })
    | undefined;
  assert.equal(typeof computeBoardFrameDeltas, 'function', 'computeBoardFrameDeltas must be exported');
  if (!computeBoardFrameDeltas) return;

  // Test across 60, 30, 15, 5, and 2.5 FPS on hardware WebGL (document visible)
  const cases = [
    { fps: 60, rawDt: 1 / 60, expectVisualMax: 0.06 },
    { fps: 30, rawDt: 1 / 30, expectVisualMax: 0.06 },
    { fps: 15, rawDt: 1 / 15, expectVisualMax: 0.06 },
    { fps: 5, rawDt: 0.2, expectVisualMax: 0.06 },
    { fps: 2.5, rawDt: 0.4, expectVisualMax: 0.06 },
  ];
  for (const c of cases) {
    const d = computeBoardFrameDeltas({
      rawDtSec: c.rawDt,
      isPaused: false,
      wasPausedPrevFrame: false,
      isDocumentHidden: false,
      isSoftwareGl: false,
    });
    assert.ok(d.visualAnimDt <= c.expectVisualMax + 1e-9, `visualAnimDt must stay <= 0.06 at ${c.fps} FPS`);
    assert.ok(
      Math.abs(d.gameplayAnimDt - c.rawDt) < 1e-6,
      `gameplayAnimDt must track exact real time at ${c.fps} FPS (got ${d.gameplayAnimDt}, expected ${c.rawDt})`
    );
  }

  // Pause freezes all deltas to 0; first frame after Resume caps gameplayAnimDt to <= 0.05s (zero catch-up jump!)
  const paused = computeBoardFrameDeltas({
    rawDtSec: 4.5,
    isPaused: true,
    wasPausedPrevFrame: false,
    isDocumentHidden: false,
    isSoftwareGl: false,
  });
  assert.deepEqual(paused, { simDt: 0, visualAnimDt: 0, gameplayAnimDt: 0 });

  const resumed = computeBoardFrameDeltas({
    rawDtSec: 4.5,
    isPaused: false,
    wasPausedPrevFrame: true,
    isDocumentHidden: false,
    isSoftwareGl: false,
  });
  assert.ok(resumed.gameplayAnimDt <= 0.05 + 1e-9, 'Resume frame must not leap forward by pause duration');

  // Verify designed hop duration & exact onStep sequence across 60, 30, 15, 5, 2.5 FPS (11-tile path passing Start)
  const path = [25, 26, 27, 28, 29, 30, 31, 0, 1, 2, 3];
  const stepDuration = 0.22; // 11 * 0.22 = 2.42s designed duration
  const designedTotalSec = path.length * stepDuration;

  for (const fps of [60, 30, 15, 5, 2.5]) {
    const frameDt = 1 / fps;
    let stepIndex = 0;
    let stepElapsed = 0;
    let wallSec = 0;
    let doneCount = 0;
    const stepsSeen: Array<[number, number]> = [];

    while (doneCount === 0 && wallSec < 20) {
      wallSec += frameDt;
      const { gameplayAnimDt } = computeBoardFrameDeltas({
        rawDtSec: frameDt,
        isPaused: false,
        wasPausedPrevFrame: false,
        isDocumentHidden: false,
        isSoftwareGl: false,
      });
      let remaining = gameplayAnimDt;
      while (remaining > 0 && doneCount === 0) {
        const needed = Math.max(0, stepDuration - stepElapsed);
        const consume = Math.min(remaining, needed);
        stepElapsed += consume;
        remaining -= consume;
        if (stepElapsed / stepDuration >= 1 - 1e-9) {
          stepsSeen.push([stepIndex, path[stepIndex]]);
          stepIndex += 1;
          if (stepIndex >= path.length) {
            doneCount += 1;
            break;
          }
          stepElapsed = 0;
        }
      }
    }

    assert.equal(doneCount, 1, `Completion callback must fire exactly once at ${fps} FPS`);
    assert.deepEqual(
      stepsSeen,
      path.map((tile, idx) => [idx, tile]),
      `onStep order (including Start tile 0) must be preserved at ${fps} FPS`
    );
    assert.ok(
      wallSec >= designedTotalSec - 1e-6 && wallSec <= designedTotalSec + frameDt + 1e-6,
      `Duration at ${fps} FPS (${wallSec.toFixed(3)}s) must match designed ${designedTotalSec.toFixed(2)}s within 1 frame`
    );
  }
});

test('BUG-10: createBoardFrameScheduler runs single-flight RAF fallback when RAF stalls during gameplay promises without duplicate ticks or idle timer leaks', () => {
  let nowMs = 1000;
  let nextId = 1;
  const activeRafs = new Map<number, () => void>();
  const activeTimers = new Map<number, { cb: () => void; ms: number; fireAt: number }>();

  let hasPromises = false;
  let frameCount = 0;
  let gameplayElapsedSec = 0;

  const scheduler = createBoardFrameScheduler({
    isSoftwareGl: false,
    now: () => nowMs,
    isDocumentHidden: () => false,
    hasPendingGameplayPromises: () => hasPromises,
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
      activeTimers.set(id, { cb, ms, fireAt: nowMs + ms });
      return id;
    },
    clearTimer: (id) => {
      activeTimers.delete(id);
    },
    onFrame: (rawDtSec) => {
      frameCount++;
      if (hasPromises) {
        gameplayElapsedSec += rawDtSec;
        if (gameplayElapsedSec >= 1.35) {
          hasPromises = false;
        }
        return { mode: 'raf', intervalMs: 0 };
      }
      return { mode: 'stop', intervalMs: 0 };
    },
  });

  // 1. Idle (no gameplay promises): Demand-Driven low tier schedules ZERO timers and ZERO RAFs
  scheduler.runImmediateTick();
  assert.equal(activeRafs.size, 0);
  assert.equal(activeTimers.size, 0);

  // 2. Start a 1.35s gameplay promise while RAF is completely stalled (0 Hz occluded window, document.hidden=false)
  hasPromises = true;
  gameplayElapsedSec = 0;
  const startMs = nowMs;
  scheduler.requestRender();

  assert.equal(activeRafs.size, 1, 'Must request RAF');
  assert.equal(activeTimers.size, 1, 'Must arm single-flight RAF watchdog timer when gameplay promises are pending');

  // Keep reference to initial RAF callback to simulate a hostile late RAF firing AFTER fallback already fired
  const staleRafCb = [...activeRafs.values()][0];

  // Advance using ONLY fallback timers (RAF never fires!) until promise completes
  let guard = 0;
  while (hasPromises && guard++ < 40) {
    assert.equal(activeTimers.size, 1, 'Must never accumulate multiple fallback timers');
    const [[tid, timer]] = [...activeTimers.entries()];
    activeTimers.delete(tid);
    nowMs = timer.fireAt;
    const beforeFrames = frameCount;
    timer.cb();
    assert.equal(frameCount, beforeFrames + 1);
    // Even if the stale RAF callback fires right after fallback tick, token guard MUST block duplicate execution!
    staleRafCb();
    assert.equal(frameCount, beforeFrames + 1, 'Stale RAF callback must NOT execute duplicate tick');
  }

  assert.equal(hasPromises, false, 'Gameplay promise must complete even when RAF is stalled at 0 Hz');
  const wallMs = nowMs - startMs;
  assert.ok(wallMs >= 1300 && wallMs <= 1600, `Expected ~1350ms completion via fallback, got ${wallMs}ms`);

  // One final settle frame returns 'stop' -> 0 timers and 0 RAFs left (Demand-Driven preserved!)
  if (activeRafs.size > 0) {
    const [, cb] = [...activeRafs.entries()][0];
    activeRafs.clear();
    nowMs += 16;
    cb();
  }
  assert.equal(activeRafs.size, 0);
  assert.equal(activeTimers.size, 0);

  // 3. Normal 60 FPS: RAF fires first every time (<500ms default fallback) and cancels fallback timer cleanly
  hasPromises = true;
  gameplayElapsedSec = 0;
  scheduler.requestRender();
  assert.equal(activeRafs.size, 1);
  assert.equal(activeTimers.size, 1);
  const [[rafId, rafCb]] = [...activeRafs.entries()];
  activeRafs.delete(rafId);
  nowMs += 16.67;
  const framesBeforeNormal = frameCount;
  rafCb();
  assert.equal(frameCount, framesBeforeNormal + 1);
  // Previous fallback was cancelled and replaced by at most 1 fresh fallback
  assert.equal(activeTimers.size, 1);

  scheduler.dispose();
  assert.equal(activeRafs.size, 0);
  assert.equal(activeTimers.size, 0);
});

test('BUG-10 (Review Round 2): default RAF fallback does not preempt genuine 5 FPS / 2.5 FPS RAF frames, and handleVisibilityChange from idle does not leak stale idle time', () => {
  let nowMs = 1000;
  let nextId = 1;
  const activeRafs = new Map<number, () => void>();
  const activeTimers = new Map<number, { cb: () => void; ms: number; fireAt: number }>();
  let docHidden = false;
  let hasPromises = false;
  const observedDts: number[] = [];

  const scheduler = createBoardFrameScheduler({
    isSoftwareGl: false,
    now: () => nowMs,
    isDocumentHidden: () => docHidden,
    hasPendingGameplayPromises: () => hasPromises,
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
      activeTimers.set(id, { cb, ms, fireAt: nowMs + ms });
      return id;
    },
    clearTimer: (id) => {
      activeTimers.delete(id);
    },
    onFrame: (rawDtSec) => {
      observedDts.push(rawDtSec);
      if (hasPromises) {
        return docHidden
          ? { mode: 'background_sim', intervalMs: 80 }
          : { mode: 'raf', intervalMs: 0 };
      }
      return { mode: 'stop', intervalMs: 0 };
    },
  });

  // 1. Enter idle ('stop') at t=1000ms
  scheduler.runImmediateTick();
  assert.equal(activeRafs.size, 0);
  assert.equal(activeTimers.size, 0);

  // 2. Verify default rafFallbackMs is safely above 2.5 FPS (400ms + vsync jitter) so 5 FPS & 2.5 FPS stay pure RAF!
  hasPromises = true;
  nowMs = 2000;
  scheduler.requestRender();
  assert.equal(activeRafs.size, 1);
  assert.equal(activeTimers.size, 1);
  const [[, fallbackTimer]] = [...activeTimers.entries()];
  assert.ok(
    fallbackTimer.ms >= 450,
    `Default rafFallbackMs (${fallbackTimer.ms}ms) must be >= 450ms so 5 FPS (200ms) and 2.5 FPS (400ms) never get preempted off-vsync`
  );

  // Simulate genuine 2.5 FPS RAF frame arriving at +416ms -> RAF wins before fallback timer fires!
  nowMs += 416;
  assert.ok(nowMs < fallbackTimer.fireAt, '2.5 FPS RAF (+416ms) must fire strictly before fallback timer');
  const [[rafId, rafCb]] = [...activeRafs.entries()];
  activeRafs.delete(rafId);
  rafCb();
  assert.equal(activeRafs.size, 1);
  assert.equal(activeTimers.size, 1);

  // Stop back to idle
  hasPromises = false;
  const [[rafId2, rafCb2]] = [...activeRafs.entries()];
  activeRafs.delete(rafId2);
  nowMs += 16;
  rafCb2();
  assert.equal(activeRafs.size, 0);
  assert.equal(activeTimers.size, 0);

  // 3. Sit idle for 25 seconds (scheduledMode === 'none'), then start a promise and immediately hide document
  nowMs += 25_000;
  hasPromises = true;
  docHidden = true;
  observedDts.length = 0;
  scheduler.handleVisibilityChange();
  assert.equal(activeTimers.size, 1);
  const [[bgId, bgTimer]] = [...activeTimers.entries()];
  activeTimers.delete(bgId);
  nowMs = bgTimer.fireAt;
  bgTimer.cb();
  assert.equal(observedDts.length, 1);
  assert.ok(
    observedDts[0] < 0.25,
    `First background_sim tick after 25s idle must not leak idle time into rawDtSec (got ${observedDts[0]}s)`
  );

  scheduler.dispose();
});


