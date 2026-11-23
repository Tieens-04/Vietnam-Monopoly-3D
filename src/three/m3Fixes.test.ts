import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { Pass } from 'three/addons/postprocessing/Pass.js';
import { SoundEngine } from '../audio/soundEngine';
import { detectCashSnapshotChanges } from '../components/MonopolyCanvas';
import { detectCashFlowTransfers } from '../game/currencyLogic';
import type { PlayerState } from '../game/types';
import { createNightLightingPalette, createPlayerTokenMesh } from './models';
import { createOuterPriceTabTexture } from './textures';
import { createTreasurySystem } from './treasurySystem';

interface RecordedTextCall {
  text: string;
  x: number;
  y: number;
}

function installRecordingCanvasStub(): {
  textCalls: RecordedTextCall[];
  restore: () => void;
} {
  const prevDoc = (globalThis as Record<string, unknown>).document;
  const textCalls: RecordedTextCall[] = [];
  const noop = () => {};
  const gradStub = { addColorStop: noop };
  const ctxStub = {
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 1,
    lineJoin: 'round',
    lineCap: 'round',
    font: '',
    textAlign: 'center',
    textBaseline: 'middle',
    globalAlpha: 1,
    createLinearGradient: () => gradStub,
    createRadialGradient: () => gradStub,
    fillRect: noop,
    strokeRect: noop,
    clearRect: noop,
    beginPath: noop,
    closePath: noop,
    moveTo: noop,
    lineTo: noop,
    arc: noop,
    ellipse: noop,
    quadraticCurveTo: noop,
    bezierCurveTo: noop,
    fill: noop,
    stroke: noop,
    clip: noop,
    save: noop,
    restore: noop,
    translate: noop,
    rotate: noop,
    scale: noop,
    setLineDash: noop,
    fillText: (text: string, x: number, y: number) => {
      textCalls.push({ text: String(text), x, y });
    },
    strokeText: noop,
    measureText: (s: string) => ({ width: s.length * 8 }),
  };

  (globalThis as Record<string, unknown>).document = {
    createElement: (tag: string) => {
      if (tag === 'canvas') {
        return {
          width: 384,
          height: 224,
          getContext: () => ctxStub,
        };
      }
      return {};
    },
  };

  return {
    textCalls,
    restore: () => {
      if (prevDoc === undefined) {
        delete (globalThis as Record<string, unknown>).document;
      } else {
        (globalThis as Record<string, unknown>).document = prevDoc;
      }
    },
  };
}

test('BUG-45: createNightLightingPalette marks tokenHeadlightMat as sharedStatic so token swaps do not dispose it', () => {
  const { restore } = installRecordingCanvasStub();
  try {
    const palette = createNightLightingPalette(4);
    assert.equal(palette.tokenHeadlightMat.userData.sharedStatic, true);

    let headlightDisposed = 0;
    const origDispose = palette.tokenHeadlightMat.dispose.bind(palette.tokenHeadlightMat);
    palette.tokenHeadlightMat.dispose = () => {
      headlightDisposed += 1;
      origDispose();
    };

    const carToken = createPlayerTokenMesh('car', '#F5B800', palette);
    carToken.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        for (const m of mats) {
          if (!m.userData?.sharedStatic) m.dispose();
        }
      }
    });

    assert.equal(
      headlightDisposed,
      0,
      'Shared tokenHeadlightMat must not be disposed when a single pawn is swapped/removed'
    );
    origDispose();
  } finally {
    restore();
  }
});

test('BUG-40: createOuterPriceTabTexture renders both 🏆 ×N and 🛡️BV without overwriting each other', () => {
  const { textCalls, restore } = installRecordingCanvasStub();
  try {
    const tex = createOuterPriceTabTexture(
      '600K',
      '#22B8F8',
      '#F5B800',
      {
        isFestival: true,
        cupMultiplier: 3,
        isOutage: false,
        isShielded: true,
      },
      false,
      4
    );

    const cupCall = textCalls.find((c) => c.text.includes('🏆 ×3'));
    const shieldCall = textCalls.find((c) => c.text.includes('🛡️BV'));
    const festivalCall = textCalls.find((c) => c.text.includes('🔥×2'));
    const priceCall = textCalls.find((c) => c.text === '600K');

    assert.ok(cupCall, 'Expected 🏆 ×3 badge to be drawn');
    assert.ok(shieldCall, 'Expected 🛡️BV badge to be drawn alongside 🏆 ×3');
    assert.ok(festivalCall, 'Expected 🔥×2 badge to be drawn');
    assert.ok(priceCall, 'Expected 600K price label to be drawn');
    assert.ok(
      Math.abs(cupCall.x - shieldCall.x) >= 100,
      `Expected non-overlapping horizontal centers for 🏆 ×3 (${cupCall.x}) and 🛡️BV (${shieldCall.x})`
    );
    tex.dispose();
  } finally {
    restore();
  }
});

test('BUG-53: treasurySystem.dispose() traverses group and disposes all tray geometries, shadowPlane materials, and InstancedMesh pools', () => {
  const { restore } = installRecordingCanvasStub();
  try {
    const treasury = createTreasurySystem(4, false);
    const geometries = new Set<THREE.BufferGeometry>();
    const materials = new Set<THREE.Material>();
    const instancedMeshes: THREE.InstancedMesh[] = [];

    treasury.group.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        if (obj.geometry) geometries.add(obj.geometry);
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        for (const m of mats) {
          if (m) materials.add(m);
        }
      }
      if (obj instanceof THREE.InstancedMesh) {
        instancedMeshes.push(obj);
      }
    });

    assert.ok(geometries.size >= 5, 'Expected tray/shadow geometries inside treasury.group');
    assert.ok(materials.size >= 8, 'Expected tray/shadowPlane materials inside treasury.group');
    assert.equal(instancedMeshes.length, 4, 'Expected 4 InstancedMesh currency pools');

    const disposedGeos = new Set<THREE.BufferGeometry>();
    const disposedMats = new Set<THREE.Material>();
    const disposedPoolMeshes = new Set<THREE.InstancedMesh>();
    let instanceMatrixDisposeEvents = 0;
    let instanceColorDisposeEvents = 0;

    for (const geo of geometries) {
      const orig = geo.dispose.bind(geo);
      geo.dispose = () => {
        disposedGeos.add(geo);
        orig();
      };
    }
    for (const mat of materials) {
      const orig = mat.dispose.bind(mat);
      mat.dispose = () => {
        disposedMats.add(mat);
        orig();
      };
    }
    for (const im of instancedMeshes) {
      im.instanceMatrix.addEventListener('dispose', () => {
        instanceMatrixDisposeEvents += 1;
      });
      im.instanceColor?.addEventListener('dispose', () => {
        instanceColorDisposeEvents += 1;
      });
      const orig = im.dispose.bind(im);
      im.dispose = () => {
        disposedPoolMeshes.add(im);
        orig();
      };
    }

    treasury.dispose();

    assert.equal(
      disposedGeos.size,
      geometries.size,
      `Expected all ${geometries.size} geometries to be disposed, got ${disposedGeos.size}`
    );
    assert.equal(
      disposedMats.size,
      materials.size,
      `Expected all ${materials.size} materials to be disposed, got ${disposedMats.size}`
    );
    assert.equal(
      disposedPoolMeshes.size,
      instancedMeshes.length,
      `Expected all ${instancedMeshes.length} InstancedMesh pools to be disposed, got ${disposedPoolMeshes.size}`
    );
    assert.equal(
      instanceMatrixDisposeEvents,
      instancedMeshes.length,
      'Expected instanceMatrix dispose event for every InstancedMesh pool'
    );
    assert.equal(
      instanceColorDisposeEvents,
      instancedMeshes.length,
      'Expected instanceColor dispose event for every InstancedMesh pool'
    );
  } finally {
    restore();
  }
});

test('BUG-47: EffectComposer setSize(w, h) before setPixelRatio(pxRatio) produces zero intermediate pxRatio^2 render target resizes', () => {
  const w = 800;
  const h = 600;
  const pxRatio = 1.75;
  const effW = Math.floor(w * pxRatio);
  const effH = Math.floor(h * pxRatio);

  const fakeRenderer = {
    getPixelRatio: () => pxRatio,
    getSize: (target: THREE.Vector2) => target.set(w, h),
  } as unknown as THREE.WebGLRenderer;

  const rt = new THREE.WebGLRenderTarget(effW, effH);
  const rtSetSizeCalls: Array<[number, number]> = [];
  const origRtSetSize = rt.setSize.bind(rt);
  rt.setSize = (rw: number, rh: number, depth?: number) => {
    rtSetSizeCalls.push([rw, rh]);
    origRtSetSize(rw, rh, depth);
  };

  const composer = new EffectComposer(fakeRenderer, rt);
  composer.setSize(w, h);
  composer.setPixelRatio(pxRatio);

  assert.ok(rtSetSizeCalls.length >= 1, 'Expected renderTarget.setSize to be called');
  for (const [rw, rh] of rtSetSizeCalls) {
    assert.equal(rw, effW, `Expected no intermediate pxRatio^2 width resize, got ${rw}`);
    assert.equal(rh, effH, `Expected no intermediate pxRatio^2 height resize, got ${rh}`);
  }

  let recordedPassW = 0;
  let recordedPassH = 0;
  class ProbePass extends Pass {
    override setSize(pw: number, ph: number): void {
      recordedPassW = pw;
      recordedPassH = ph;
    }
  }

  composer.addPass(new ProbePass());
  assert.equal(recordedPassW, w * pxRatio);
  assert.equal(recordedPassH, h * pxRatio);
  composer.dispose();
});

test('BUG-50: detectCashSnapshotChanges catches player ID changes even when an earlier slot changes cash or bankrupt status', () => {
  const makeTestPlayer = (id: number, cash: number, bankrupt: boolean): PlayerState => ({
    id,
    name: `P${id}`,
    isBot: false,
    color: '#22B8F8',
    colorName: 'Xanh',
    tokenType: 'car',
    cash,
    position: 0,
    laps: 0,
    inJail: false,
    jailTurns: 0,
    jailFreeCards: 0,
    doublesStreak: 0,
    pendingWorldTour: false,
    bankrupt,
  });

  const prev = [
    makeTestPlayer(0, 2_000_000, false),
    makeTestPlayer(1, 2_000_000, false),
  ];
  const currSwapAndCash = [
    makeTestPlayer(0, 2_500_000, false),
    makeTestPlayer(2, 2_000_000, false),
  ];

  const swapResult = detectCashSnapshotChanges(prev, currSwapAndCash);
  assert.deepEqual(swapResult, {
    playerRosterChanged: true,
    cashStateChanged: true,
  });

  // When playerRosterChanged is true, MonopolyCanvas suppresses detectCashFlowTransfers
  const suppressedTransfers = swapResult.playerRosterChanged
    ? []
    : detectCashFlowTransfers(prev, currSwapAndCash, {}, {});
  assert.equal(suppressedTransfers.length, 0);

  const currBankruptAndSwap = [
    makeTestPlayer(0, 2_000_000, true),
    makeTestPlayer(2, 2_000_000, false),
  ];
  assert.deepEqual(detectCashSnapshotChanges(prev, currBankruptAndSwap), {
    playerRosterChanged: true,
    cashStateChanged: true,
  });

  const currSameRosterCashDelta = [
    makeTestPlayer(0, 2_500_000, false),
    makeTestPlayer(1, 2_000_000, false),
  ];
  assert.deepEqual(detectCashSnapshotChanges(prev, currSameRosterCashDelta), {
    playerRosterChanged: false,
    cashStateChanged: true,
  });

  assert.deepEqual(detectCashSnapshotChanges(prev, prev), {
    playerRosterChanged: false,
    cashStateChanged: false,
  });
});

test('BUG-54: SoundEngine guards throwing AudioContext, skips suspended scheduling, and routes running audio through GainNode + DynamicsCompressorNode', () => {
  const prevWin = (globalThis as Record<string, unknown>).window;
  try {
    // 1. Throwing AudioContext constructor must never throw out of SoundEngine
    (globalThis as Record<string, unknown>).window = {
      AudioContext: class ThrowingAudioContext {
        constructor() {
          throw new Error('AudioContext hardware limit reached');
        }
      },
    };
    const throwingEngine = new SoundEngine();
    assert.doesNotThrow(() => {
      throwingEngine.playDiceRoll();
      throwingEngine.playTokenHop(1);
      throwingEngine.playCashGain();
      throwingEngine.playCurrencyTransfer('mixed', true);
      throwingEngine.playPhysicsDiceHit(0.9);
    });

    // 2. Suspended AudioContext must call resume() and NOT schedule oscillators
    let suspendedResumeCalls = 0;
    let suspendedOscCreated = 0;
    (globalThis as Record<string, unknown>).window = {
      AudioContext: class SuspendedAudioContext {
        state = 'suspended';
        currentTime = 0;
        sampleRate = 44100;
        destination = { id: 'dest' };
        resume() {
          suspendedResumeCalls += 1;
          return Promise.resolve();
        }
        createOscillator() {
          suspendedOscCreated += 1;
          return {};
        }
      },
    };
    const suspendedEngine = new SoundEngine();
    suspendedEngine.playDiceRoll();
    suspendedEngine.playCashGain();
    assert.ok(suspendedResumeCalls >= 1, 'Expected suspended context to call resume()');
    assert.equal(suspendedOscCreated, 0, 'Suspended context must not schedule oscillators at t=0');

    // 3. Running AudioContext must route through master GainNode -> DynamicsCompressorNode -> destination
    const connections: Array<{ from: string; to: string }> = [];
    let runningOscCount = 0;
    const makeParam = () => ({
      setValueAtTime: () => {},
      exponentialRampToValueAtTime: () => {},
    });
    (globalThis as Record<string, unknown>).window = {
      AudioContext: class RunningAudioContext {
        state = 'running';
        currentTime = 1.5;
        sampleRate = 44100;
        destination = { tag: 'destination' };
        resume() {
          return Promise.resolve();
        }
        createDynamicsCompressor() {
          const node = {
            tag: 'compressor',
            context: this,
            threshold: makeParam(),
            knee: makeParam(),
            ratio: makeParam(),
            attack: makeParam(),
            release: makeParam(),
            connect: (target: { tag?: string }) => {
              connections.push({ from: 'compressor', to: target.tag ?? 'unknown' });
            },
          };
          return node;
        }
        createGain() {
          const node = {
            tag: 'gain',
            context: this,
            gain: makeParam(),
            connect: (target: { tag?: string }) => {
              connections.push({ from: 'gain', to: target.tag ?? 'unknown' });
            },
          };
          return node;
        }
        createOscillator() {
          runningOscCount += 1;
          return {
            type: 'sine',
            frequency: makeParam(),
            connect: (target: { tag?: string }) => {
              connections.push({ from: 'osc', to: target.tag ?? 'unknown' });
            },
            start: () => {},
            stop: () => {},
          };
        }
        createBuffer(_ch: number, len: number) {
          return { getChannelData: () => new Float32Array(len) };
        }
        createBufferSource() {
          return {
            buffer: null,
            connect: (target: { tag?: string }) => {
              connections.push({ from: 'bufSrc', to: target.tag ?? 'unknown' });
            },
            start: () => {},
          };
        }
        createBiquadFilter() {
          return {
            type: 'bandpass',
            frequency: makeParam(),
            Q: makeParam(),
            connect: (target: { tag?: string }) => {
              connections.push({ from: 'filter', to: target.tag ?? 'unknown' });
            },
          };
        }
      },
    };
    const runningEngine = new SoundEngine();
    runningEngine.playDiceRoll();
    runningEngine.playAuctionGavel();
    runningEngine.playCurrencyTransfer('cash', true);

    assert.ok(runningOscCount > 0, 'Expected oscillators when context is running');
    assert.ok(
      connections.some((c) => c.from === 'gain' && c.to === 'compressor'),
      'Expected master GainNode to connect into DynamicsCompressorNode'
    );
    assert.ok(
      connections.some((c) => c.from === 'compressor' && c.to === 'destination'),
      'Expected DynamicsCompressorNode to connect into ctx.destination'
    );
    assert.equal(
      connections.some((c) => c.from === 'gain' && c.to === 'destination'),
      false,
      'Per-sound GainNodes must route through master GainNode/Compressor instead of directly to ctx.destination'
    );
  } finally {
    if (prevWin === undefined) {
      delete (globalThis as Record<string, unknown>).window;
    } else {
      (globalThis as Record<string, unknown>).window = prevWin;
    }
  }
});
