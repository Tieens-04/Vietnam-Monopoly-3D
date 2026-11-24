import { CurrencyStyleId, TacticalDiceChoice } from '../game/types';

/**
 * Procedural Web Audio API Sound Synthesizer for 3D Monopoly.
 * Zero external audio files required.
 */
export class SoundEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private compressor: DynamicsCompressorNode | null = null;
  private muted = false;

  public setMuted(muted: boolean): void {
    this.muted = muted;
  }

  public isMuted(): boolean {
    return this.muted;
  }

  private ensureContext(): AudioContext | null {
    if (this.muted || typeof window === 'undefined') return null;
    if (this.ctx && this.ctx.state === 'closed') {
      this.ctx = null;
      this.masterGain = null;
      this.compressor = null;
    }
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return null;
      try {
        this.ctx = new AudioCtx();
      } catch {
        return null;
      }
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    if (this.ctx.state !== 'running') {
      return null;
    }
    return this.ctx;
  }

  private getOutputNode(ctx: AudioContext): AudioNode {
    if (
      !this.masterGain ||
      !this.compressor ||
      this.masterGain.context !== ctx
    ) {
      try {
        const compressor = ctx.createDynamicsCompressor();
        compressor.threshold.setValueAtTime(-14, ctx.currentTime);
        compressor.knee.setValueAtTime(18, ctx.currentTime);
        compressor.ratio.setValueAtTime(6, ctx.currentTime);
        compressor.attack.setValueAtTime(0.005, ctx.currentTime);
        compressor.release.setValueAtTime(0.15, ctx.currentTime);

        const masterGain = ctx.createGain();
        masterGain.gain.setValueAtTime(0.9, ctx.currentTime);

        masterGain.connect(compressor);
        compressor.connect(ctx.destination);
        this.masterGain = masterGain;
        this.compressor = compressor;
      } catch {
        return ctx.destination;
      }
    }
    return this.masterGain;
  }

  /** Rattling wooden dice shake & bounce sound */
  public playDiceRoll(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const hitTimes = [0, 0.07, 0.15, 0.24, 0.35, 0.48, 0.63];

    hitTimes.forEach((offset, idx) => {
      const t = now + offset;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      const baseFreq = 260 + ((idx * 53) % 180) + Math.random() * 40;
      osc.frequency.setValueAtTime(baseFreq, t);
      osc.frequency.exponentialRampToValueAtTime(95, t + 0.045);

      const vol = Math.max(0.03, 0.16 * (1 - idx * 0.11));
      gain.gain.setValueAtTime(vol, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.05);

      osc.connect(gain);
      gain.connect(this.getOutputNode(ctx));
      osc.start(t);
      osc.stop(t + 0.055);
    });
  }

  /** Crisp wooden marimba hop sound as token steps tile by tile */
  public playTokenHop(stepIndex: number): void {
    const ctx = this.ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    // Subtle rising pentatonic feel
    const scale = [330, 370, 415, 494, 554, 659];
    const freq = scale[stepIndex % scale.length] * (0.97 + Math.random() * 0.06);

    osc.type = 'sine';
    osc.frequency.setValueAtTime(freq, now);
    osc.frequency.exponentialRampToValueAtTime(freq * 1.28, now + 0.065);

    gain.gain.setValueAtTime(0.14, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.085);

    osc.connect(gain);
    gain.connect(this.getOutputNode(ctx));
    osc.start(now);
    osc.stop(now + 0.09);
  }

  /** Classic metallic "cha-ching" cash register bell */
  public playCashGain(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const notes = [
      { freq: 1046.5, delay: 0, dur: 0.14, gain: 0.13 },
      { freq: 1318.5, delay: 0.07, dur: 0.34, gain: 0.16 },
      { freq: 2093.0, delay: 0.075, dur: 0.28, gain: 0.08 },
    ];

    notes.forEach((n) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(n.freq, now + n.delay);
      g.gain.setValueAtTime(n.gain, now + n.delay);
      g.gain.exponentialRampToValueAtTime(0.001, now + n.delay + n.dur);
      osc.connect(g);
      g.connect(this.getOutputNode(ctx));
      osc.start(now + n.delay);
      osc.stop(now + n.delay + n.dur + 0.02);
    });
  }

  /** Descending tone when paying rent or tax */
  public playCashPay(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    [392, 311.1].forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'triangle';
      const t = now + idx * 0.09;
      osc.frequency.setValueAtTime(freq, t);
      g.gain.setValueAtTime(0.13, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
      osc.connect(g);
      g.connect(this.getOutputNode(ctx));
      osc.start(t);
      osc.stop(t + 0.17);
    });
  }

  /** Warm major chord arpeggio when purchasing a city property */
  public playBuyProperty(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const chord = [523.25, 659.25, 783.99, 1046.5];
    chord.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'triangle';
      const t = now + idx * 0.055;
      osc.frequency.setValueAtTime(freq, t);
      g.gain.setValueAtTime(0.14, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.26);
      osc.connect(g);
      g.connect(this.getOutputNode(ctx));
      osc.start(t);
      osc.stop(t + 0.28);
    });
  }

  /** Rising construction chime when building a house or grand hotel */
  public playBuildHouse(level: number): void {
    const ctx = this.ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const base = 440 + level * 85;
    const seq = level >= 4 ? [base, base * 1.25, base * 1.5, base * 2] : [base, base * 1.33];
    seq.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'sine';
      const t = now + idx * 0.065;
      osc.frequency.setValueAtTime(freq, t);
      g.gain.setValueAtTime(0.15, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
      osc.connect(g);
      g.connect(this.getOutputNode(ctx));
      osc.start(t);
      osc.stop(t + 0.24);
    });
  }

  /** Crisp card flip chime */
  public playCardDraw(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(587.33, now);
    osc.frequency.exponentialRampToValueAtTime(880, now + 0.11);
    g.gain.setValueAtTime(0.12, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
    osc.connect(g);
    g.connect(this.getOutputNode(ctx));
    osc.start(now);
    osc.stop(now + 0.16);
  }

  /** Playful two-tone alert when sent to Jail */
  public playJailAlert(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    [440, 311.13, 440, 311.13].forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'sawtooth';
      const t = now + idx * 0.12;
      osc.frequency.setValueAtTime(freq, t);
      g.gain.setValueAtTime(0.07, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.11);
      osc.connect(g);
      g.connect(this.getOutputNode(ctx));
      osc.start(t);
      osc.stop(t + 0.115);
    });
  }

  /** Celebratory fanfare when winning the game */
  public playVictoryFanfare(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const melody = [
      { f: 523.25, t: 0, d: 0.13 },
      { f: 659.25, t: 0.13, d: 0.13 },
      { f: 783.99, t: 0.26, d: 0.13 },
      { f: 1046.5, t: 0.4, d: 0.35 },
      { f: 783.99, t: 0.76, d: 0.14 },
      { f: 1046.5, t: 0.92, d: 0.55 },
    ];

    melody.forEach((n) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(n.f, now + n.t);
      g.gain.setValueAtTime(0.18, now + n.t);
      g.gain.exponentialRampToValueAtTime(0.001, now + n.t + n.d);
      osc.connect(g);
      g.connect(this.getOutputNode(ctx));
      osc.start(now + n.t);
      osc.stop(now + n.t + n.d + 0.03);
    });
  }

  /** Crisp ascending chime when a new bid is placed in an auction */
  public playAuctionBid(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(620, now);
    osc.frequency.exponentialRampToValueAtTime(840, now + 0.08);
    g.gain.setValueAtTime(0.13, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.11);
    osc.connect(g);
    g.connect(this.getOutputNode(ctx));
    osc.start(now);
    osc.stop(now + 0.12);
  }

  /** Double wooden gavel knock + bright bell for winning an auction or closing a trade */
  public playAuctionGavel(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    [0, 0.12].forEach((offset) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(240, now + offset);
      osc.frequency.exponentialRampToValueAtTime(80, now + offset + 0.07);
      g.gain.setValueAtTime(0.2, now + offset);
      g.gain.exponentialRampToValueAtTime(0.001, now + offset + 0.08);
      osc.connect(g);
      g.connect(this.getOutputNode(ctx));
      osc.start(now + offset);
      osc.stop(now + offset + 0.09);
    });

    const bell = ctx.createOscillator();
    const bg = ctx.createGain();
    bell.type = 'triangle';
    bell.frequency.setValueAtTime(987.77, now + 0.24);
    bg.gain.setValueAtTime(0.16, now + 0.24);
    bg.gain.exponentialRampToValueAtTime(0.001, now + 0.58);
    bell.connect(bg);
    bg.connect(this.getOutputNode(ctx));
    bell.start(now + 0.24);
    bell.stop(now + 0.6);
  }

  /** Soft harmonic chime when switching Day/Night mode or Cinematic Camera */
  public playAmbienceToggle(active: boolean): void {
    const ctx = this.ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const freqs = active ? [523.25, 783.99] : [783.99, 523.25];
    freqs.forEach((f, idx) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'sine';
      const t = now + idx * 0.065;
      osc.frequency.setValueAtTime(f, t);
      g.gain.setValueAtTime(0.09, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
      osc.connect(g);
      g.connect(this.getOutputNode(ctx));
      osc.start(t);
      osc.stop(t + 0.17);
    });
  }

  /** Playful bubble pop sound when a Bot AI posts a witty chat bubble */
  public playChatPop(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(480, now);
    osc.frequency.exponentialRampToValueAtTime(920, now + 0.085);
    g.gain.setValueAtTime(0.11, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.11);
    osc.connect(g);
    g.connect(this.getOutputNode(ctx));
    osc.start(now);
    osc.stop(now + 0.12);
  }

  /** Crisp rigid-body impact sound synchronized to cannon-es dice collision timestamps */
  public playPhysicsDiceHit(intensity = 0.8): void {
    const ctx = this.ensureContext();
    if (!ctx) return;

    const clamped = Math.max(0.15, Math.min(1, intensity));
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    const f0 = 240 + clamped * 190 + Math.random() * 35;
    osc.frequency.setValueAtTime(f0, now);
    osc.frequency.exponentialRampToValueAtTime(88, now + 0.048);

    gain.gain.setValueAtTime(0.16 * clamped, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.052);

    osc.connect(gain);
    gain.connect(this.getOutputNode(ctx));
    osc.start(now);
    osc.stop(now + 0.056);
  }

  /** Material-specific 3D currency transfer SFX ('cash' Polymer rustle, 'coins' clink, 'bullion' gold chime, 'mixed') */
  public playCurrencyTransfer(style: CurrencyStyleId, isGain: boolean): void {
    const ctx = this.ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime;

    const triggerPaperRustle = (count: number, startOffset = 0) => {
      const sampleCount = Math.floor(ctx.sampleRate * 0.055);
      const noiseBuf = ctx.createBuffer(1, sampleCount, ctx.sampleRate);
      const ch = noiseBuf.getChannelData(0);
      for (let i = 0; i < sampleCount; i++) {
        ch[i] = (Math.random() * 2 - 1) * Math.sin((i / sampleCount) * Math.PI);
      }

      for (let k = 0; k < count; k++) {
        const t = now + startOffset + k * 0.052;
        const src = ctx.createBufferSource();
        src.buffer = noiseBuf;

        const filter = ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(2200 + k * 280, t);
        filter.Q.setValueAtTime(2.4, t);

        const g = ctx.createGain();
        g.gain.setValueAtTime(0.12, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.052);

        src.connect(filter);
        filter.connect(g);
        g.connect(this.getOutputNode(ctx));
        src.start(t);
      }
    };

    const triggerCoinClinks = (count: number, startOffset = 0) => {
      const freqs = isGain
        ? [2349, 2793, 3136, 3951]
        : [2637, 2349, 2093, 1975];
      for (let k = 0; k < count; k++) {
        const t = now + startOffset + k * 0.055;
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = 'sine';
        const f = freqs[k % freqs.length] * (0.98 + (k % 2) * 0.03);
        osc.frequency.setValueAtTime(f, t);
        g.gain.setValueAtTime(0.085, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
        osc.connect(g);
        g.connect(this.getOutputNode(ctx));
        osc.start(t);
        osc.stop(t + 0.13);
      }
    };

    if (style === 'cash') {
      triggerPaperRustle(4, 0);
      return;
    }

    if (style === 'coins') {
      triggerCoinClinks(4, 0);
      return;
    }

    if (style === 'bullion') {
      // Heavy resonant 999.9 gold bullion ring + ceramic casino chip clack
      const harmonics = isGain ? [1174.66, 1760.0, 2637.02] : [987.77, 1479.98, 2217.46];
      harmonics.forEach((f, idx) => {
        const t = now + idx * 0.045;
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = idx === 0 ? 'triangle' : 'sine';
        osc.frequency.setValueAtTime(f, t);
        g.gain.setValueAtTime(idx === 0 ? 0.12 : 0.07, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.28);
        osc.connect(g);
        g.connect(this.getOutputNode(ctx));
        osc.start(t);
        osc.stop(t + 0.3);
      });
      return;
    }

    // 'mixed': crisp Polymer rustle followed by metallic coin clinks on tray landing
    triggerPaperRustle(2, 0);
    triggerCoinClinks(2, 0.1);
  }

  /** Shimmering golden chord burst when rolling Doubles */
  public playDoublesBurst(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const notes = [523.25, 659.25, 783.99, 1046.5, 1174.66];
    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = idx % 2 === 0 ? 'triangle' : 'sine';
      const t = now + idx * 0.042;
      osc.frequency.setValueAtTime(freq, t);
      g.gain.setValueAtTime(0.11, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.28);
      osc.connect(g);
      g.connect(this.getOutputNode(ctx));
      osc.start(t);
      osc.stop(t + 0.3);
    });
  }

  /** Distinct ascending cue when triggering Tactical Even/Odd dice */
  public playTacticalRollCue(choice: TacticalDiceChoice): void {
    if (choice === 'NORMAL') return;
    const ctx = this.ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const freqs = choice === 'EVEN' ? [587.33, 880.0] : [523.25, 739.99];
    freqs.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = choice === 'EVEN' ? 'sine' : 'triangle';
      const t = now + idx * 0.05;
      osc.frequency.setValueAtTime(freq, t);
      g.gain.setValueAtTime(0.1, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
      osc.connect(g);
      g.connect(this.getOutputNode(ctx));
      osc.start(t);
      osc.stop(t + 0.18);
    });
  }

  /** Low descending minor sigh when a player declares bankruptcy */
  public playBankruptSlump(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    [329.63, 261.63, 196.0].forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'sawtooth';
      const t = now + idx * 0.12;
      osc.frequency.setValueAtTime(freq, t);
      g.gain.setValueAtTime(0.065, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.24);
      osc.connect(g);
      g.connect(this.getOutputNode(ctx));
      osc.start(t);
      osc.stop(t + 0.26);
    });
  }

  /** Triumphant ascending 4-note arpeggio when upgrading a property to Landmark ★ (Lv4) */
  public playLandmarkReveal(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    [523.25, 659.25, 783.99, 1046.5].forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = idx === 3 ? 'sine' : 'triangle';
      const t = now + idx * 0.065;
      osc.frequency.setValueAtTime(freq, t);
      g.gain.setValueAtTime(idx === 3 ? 0.14 : 0.1, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + (idx === 3 ? 0.42 : 0.22));
      osc.connect(g);
      g.connect(this.getOutputNode(ctx));
      osc.start(t);
      osc.stop(t + (idx === 3 ? 0.44 : 0.24));
    });
  }

  /** Bright Vietnamese pentatonic chime when completing a color-group Monopoly */
  public playMonopolyChime(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    [783.99, 880.0, 1174.66].forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'sine';
      const t = now + idx * 0.075;
      osc.frequency.setValueAtTime(freq, t);
      g.gain.setValueAtTime(0.11, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.28);
      osc.connect(g);
      g.connect(this.getOutputNode(ctx));
      osc.start(t);
      osc.stop(t + 0.3);
    });
  }

  /** Deep low-frequency earthquake rumble + structural crunch decay (ch-13) */
  public playEarthquakeImpact(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const subOsc = ctx.createOscillator();
    const subGain = ctx.createGain();
    subOsc.type = 'sawtooth';
    subOsc.frequency.setValueAtTime(110, now);
    subOsc.frequency.exponentialRampToValueAtTime(42, now + 0.38);
    subGain.gain.setValueAtTime(0.14, now);
    subGain.gain.exponentialRampToValueAtTime(0.001, now + 0.42);
    subOsc.connect(subGain);
    subGain.connect(this.getOutputNode(ctx));
    subOsc.start(now);
    subOsc.stop(now + 0.44);

    const crunchOsc = ctx.createOscillator();
    const crunchGain = ctx.createGain();
    crunchOsc.type = 'triangle';
    crunchOsc.frequency.setValueAtTime(185, now + 0.04);
    crunchOsc.frequency.exponentialRampToValueAtTime(58, now + 0.34);
    crunchGain.gain.setValueAtTime(0.1, now + 0.04);
    crunchGain.gain.exponentialRampToValueAtTime(0.001, now + 0.36);
    crunchOsc.connect(crunchGain);
    crunchGain.connect(this.getOutputNode(ctx));
    crunchOsc.start(now + 0.04);
    crunchOsc.stop(now + 0.38);
  }

  /** Sharp dual electric buzz/discharge on Power Outage (ch-14) */
  public playPowerOutageZap(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    [
      [0, 640, 180, 0.12],
      [0.11, 420, 95, 0.16],
    ].forEach(([offset, fStart, fEnd, dur]) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'sawtooth';
      const t = now + offset;
      osc.frequency.setValueAtTime(fStart, t);
      osc.frequency.exponentialRampToValueAtTime(fEnd, t + dur);
      g.gain.setValueAtTime(0.085, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      osc.connect(g);
      g.connect(this.getOutputNode(ctx));
      osc.start(t);
      osc.stop(t + dur + 0.02);
    });
  }

  /** Crystalline ascending shimmer when deploying Protection Shield (ch-15) */
  public playShieldDeploy(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    [523.25, 783.99, 1318.5].forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = 'sine';
      const t = now + idx * 0.055;
      osc.frequency.setValueAtTime(freq, t);
      g.gain.setValueAtTime(0.095, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
      osc.connect(g);
      g.connect(this.getOutputNode(ctx));
      osc.start(t);
      osc.stop(t + 0.2);
    });
  }

  /** Metallic deflection ring + crystal burst when Protection Shield blocks sabotage */
  public playShieldBlock(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    [987.77, 659.25, 1479.98].forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = idx === 2 ? 'sine' : 'triangle';
      const t = now + idx * 0.06;
      osc.frequency.setValueAtTime(freq, t);
      g.gain.setValueAtTime(0.11, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
      osc.connect(g);
      g.connect(this.getOutputNode(ctx));
      osc.start(t);
      osc.stop(t + 0.22);
    });
  }

  /** Ascending turbine swoosh + crisp departure ding for World Tour flight */
  public playWorldTourTakeoff(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const turbine = ctx.createOscillator();
    const turbineGain = ctx.createGain();
    turbine.type = 'triangle';
    turbine.frequency.setValueAtTime(220, now);
    turbine.frequency.exponentialRampToValueAtTime(580, now + 0.32);
    turbineGain.gain.setValueAtTime(0.08, now);
    turbineGain.gain.exponentialRampToValueAtTime(0.001, now + 0.36);
    turbine.connect(turbineGain);
    turbineGain.connect(this.getOutputNode(ctx));
    turbine.start(now);
    turbine.stop(now + 0.38);

    const ding = ctx.createOscillator();
    const dingGain = ctx.createGain();
    ding.type = 'sine';
    ding.frequency.setValueAtTime(880, now + 0.14);
    dingGain.gain.setValueAtTime(0.11, now + 0.14);
    dingGain.gain.exponentialRampToValueAtTime(0.001, now + 0.42);
    ding.connect(dingGain);
    dingGain.connect(this.getOutputNode(ctx));
    ding.start(now + 0.14);
    ding.stop(now + 0.44);
  }

  /** Stadium trumpet fanfare triad for World Championships host selection */
  public playChampionshipFanfare(): void {
    const ctx = this.ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    [523.25, 659.25, 783.99, 1046.5].forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = idx < 3 ? 'triangle' : 'sine';
      const t = now + idx * 0.08;
      osc.frequency.setValueAtTime(freq, t);
      g.gain.setValueAtTime(idx === 3 ? 0.13 : 0.09, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + (idx === 3 ? 0.3 : 0.18));
      osc.connect(g);
      g.connect(this.getOutputNode(ctx));
      osc.start(t);
      osc.stop(t + (idx === 3 ? 0.32 : 0.2));
    });
  }
}

export const soundEngine = new SoundEngine();
