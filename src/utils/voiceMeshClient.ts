import type { RtcSignalPayload } from '../game/onlineTypes';

export type VoiceInputMode = 'open_mic' | 'push_to_talk';
export type VoicePermissionStatus =
  | 'idle'
  | 'granted'
  | 'denied'
  | 'insecure_context'
  | 'unsupported';

export interface VoicePeerState {
  participantId: string;
  connectionState: RTCPeerConnectionState | 'new';
  mutedLocally: boolean;
  volume: number;
  isSpeaking: boolean;
}

export interface VoiceMeshSnapshot {
  micEnabled: boolean;
  inputMode: VoiceInputMode;
  pttPressed: boolean;
  permissionStatus: VoicePermissionStatus;
  localSpeaking: boolean;
  peers: Record<string, VoicePeerState>;
}

export interface AudioTrackLike {
  id?: string;
  kind?: string;
  enabled: boolean;
  stop?: () => void;
}

export interface MediaStreamLike {
  id?: string;
  getAudioTracks?: () => AudioTrackLike[];
  getTracks?: () => AudioTrackLike[];
}

export interface RTCRtpSenderLike {
  track?: AudioTrackLike | null;
  replaceTrack?: (withTrack: AudioTrackLike | null) => Promise<void> | void;
}

export interface RTCRtpTransceiverLike {
  direction: RTCRtpTransceiverDirection;
  mid?: string | null;
  sender: RTCRtpSenderLike;
  receiver?: { track?: AudioTrackLike | null };
}

export interface RTCPeerConnectionLike {
  signalingState: RTCSignalingState;
  connectionState: RTCPeerConnectionState;
  localDescription?: RTCSessionDescriptionInit | RTCSessionDescription | null;
  remoteDescription?: RTCSessionDescriptionInit | RTCSessionDescription | null;
  onnegotiationneeded: ((ev?: unknown) => unknown) | null;
  onicecandidate: ((ev: { candidate: RTCIceCandidate | RTCIceCandidateInit | null }) => unknown) | null;
  ontrack: ((ev: { track?: AudioTrackLike; streams?: readonly MediaStreamLike[] }) => unknown) | null;
  onconnectionstatechange: ((ev?: unknown) => unknown) | null;
  addTransceiver?: (
    trackOrKind: string | AudioTrackLike,
    init?: RTCRtpTransceiverInit
  ) => RTCRtpTransceiverLike;
  getTransceivers?: () => RTCRtpTransceiverLike[];
  getSenders?: () => RTCRtpSenderLike[];
  addTrack?: (track: AudioTrackLike, ...streams: MediaStreamLike[]) => RTCRtpSenderLike;
  createOffer: (options?: RTCOfferOptions) => Promise<RTCSessionDescriptionInit>;
  createAnswer: (options?: RTCAnswerOptions) => Promise<RTCSessionDescriptionInit>;
  setLocalDescription: (description?: RTCSessionDescriptionInit) => Promise<void>;
  setRemoteDescription: (description: RTCSessionDescriptionInit) => Promise<void>;
  addIceCandidate: (candidate: RTCIceCandidateInit) => Promise<void>;
  setConfiguration?: (configuration: RTCConfiguration) => void;
  restartIce?: () => void;
  close: () => void;
}

export interface AnalyserNodeLike {
  fftSize: number;
  frequencyBinCount?: number;
  getFloatTimeDomainData?: (array: Float32Array<ArrayBuffer>) => void;
  getByteTimeDomainData?: (array: Uint8Array<ArrayBuffer>) => void;
  disconnect?: () => void;
}

export interface MediaStreamAudioSourceLike {
  connect: (destination: unknown) => unknown;
  disconnect?: () => void;
}

export interface AudioContextLike {
  state?: AudioContextState;
  resume?: () => Promise<void>;
  close?: () => Promise<void>;
  createMediaStreamSource: (stream: MediaStreamLike) => MediaStreamAudioSourceLike;
  createAnalyser: () => AnalyserNodeLike;
}

export interface RemoteAudioTargetLike {
  muted: boolean;
  volume: number;
  pause?: () => void;
  remove?: () => void;
}

export interface VoiceMeshClientOptions {
  myParticipantId: string;
  sendSignal: (targetParticipantId: string, signal: RtcSignalPayload) => void;
  createPeerConnection?: (config: RTCConfiguration) => RTCPeerConnectionLike | RTCPeerConnection;
  getUserMedia?: (constraints: MediaStreamConstraints) => Promise<MediaStreamLike>;
  isSecureContext?: boolean | (() => boolean);
  fetchIceServers?: () => Promise<RTCIceServer[]>;
  createAudioContext?: () => AudioContextLike | null;
  attachRemoteAudioElement?: (
    participantId: string,
    stream: MediaStreamLike
  ) => RemoteAudioTargetLike | void;
  iceRestartDelayMs?: number;
  speakingPollIntervalMs?: number;
  speakingRmsThreshold?: number;
}

const DEFAULT_ICE_SERVERS: readonly RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun.cloudflare.com:3478' },
];

const DEFAULT_ICE_RESTART_DELAY_MS = 4000;
const DEFAULT_SPEAKING_POLL_INTERVAL_MS = 120;
const DEFAULT_SPEAKING_RMS_THRESHOLD = 0.025;
const RTC_CONFIG_FETCH_TIMEOUT_MS = 2500;

const AUDIO_CONSTRAINTS: MediaStreamConstraints = {
  audio: {
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
  },
};

export function isPolitePeer(myParticipantId: string, remoteParticipantId: string): boolean {
  return myParticipantId < remoteParticipantId;
}

function cloneIceServers(servers: readonly RTCIceServer[]): RTCIceServer[] {
  return servers.map((server) => ({
    ...server,
    urls: Array.isArray(server.urls) ? [...server.urls] : server.urls,
  }));
}

function clampVolume(volume: number): number {
  if (!Number.isFinite(volume)) return 1;
  return Math.min(1, Math.max(0, volume));
}

function createBrowserAudioContext(): AudioContextLike | null {
  if (typeof window === 'undefined') return null;
  const AudioCtx =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) return null;
  try {
    return new AudioCtx() as unknown as AudioContextLike;
  } catch {
    return null;
  }
}

function attachBrowserRemoteAudioElement(
  participantId: string,
  stream: MediaStreamLike
): RemoteAudioTargetLike | undefined {
  if (typeof document === 'undefined') return undefined;
  const audio = document.createElement('audio');
  audio.autoplay = true;
  audio.setAttribute('playsinline', 'true');
  audio.style.display = 'none';
  audio.dataset.voicePeer = participantId;
  audio.srcObject = stream as unknown as MediaStream;
  if (document.body) {
    document.body.appendChild(audio);
  }
  void audio.play().catch(() => {});
  return {
    get muted() {
      return audio.muted;
    },
    set muted(value: boolean) {
      audio.muted = value;
    },
    get volume() {
      return audio.volume;
    },
    set volume(value: number) {
      audio.volume = value;
    },
    pause: () => {
      audio.pause();
      audio.srcObject = null;
    },
    remove: () => {
      audio.remove();
    },
  };
}

async function fetchDefaultIceServers(): Promise<RTCIceServer[]> {
  if (typeof fetch !== 'function') {
    return cloneIceServers(DEFAULT_ICE_SERVERS);
  }
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = controller
    ? setTimeout(() => {
        controller.abort();
      }, RTC_CONFIG_FETCH_TIMEOUT_MS)
    : null;
  try {
    const res = await fetch('/api/rtc-config', controller ? { signal: controller.signal } : undefined);
    if (!res.ok) {
      return cloneIceServers(DEFAULT_ICE_SERVERS);
    }
    const payload = (await res.json()) as { iceServers?: unknown };
    if (Array.isArray(payload?.iceServers) && payload.iceServers.length > 0) {
      return cloneIceServers(payload.iceServers as RTCIceServer[]);
    }
  } catch {
    // Fall back to default public STUN servers on fetch failure/timeout
  } finally {
    if (timer !== null) {
      clearTimeout(timer);
    }
  }
  return cloneIceServers(DEFAULT_ICE_SERVERS);
}

interface PeerRecord {
  participantId: string;
  polite: boolean;
  pc: RTCPeerConnectionLike;
  makingOffer: boolean;
  ignoreOffer: boolean;
  isSettingRemoteAnswerPending: boolean;
  offerEpoch: number;
  pendingIceCandidates: RTCIceCandidateInit[];
  signalQueue: Promise<void>;
  audioTransceiver: RTCRtpTransceiverLike | null;
  audioSender: RTCRtpSenderLike | null;
  remoteAudioTarget: RemoteAudioTargetLike | null;
  remoteAnalyser: AnalyserNodeLike | null;
  remoteAudioSourceCleanup: (() => void) | null;
  iceRestartTimer: ReturnType<typeof setTimeout> | null;
  connectionState: RTCPeerConnectionState | 'new';
  mutedLocally: boolean;
  volume: number;
  isSpeaking: boolean;
  disposed: boolean;
}

interface PeerPreferences {
  mutedLocally: boolean;
  volume: number;
}

export class VoiceMeshClient {
  private readonly myParticipantId: string;
  private readonly sendSignalFn: (targetParticipantId: string, signal: RtcSignalPayload) => void;
  private readonly createPeerConnectionFn: (config: RTCConfiguration) => RTCPeerConnectionLike;
  private readonly getUserMediaFn?: (constraints: MediaStreamConstraints) => Promise<MediaStreamLike>;
  private readonly isSecureContextOption?: boolean | (() => boolean);
  private readonly createAudioContextFn: () => AudioContextLike | null;
  private readonly attachRemoteAudioElementFn: (
    participantId: string,
    stream: MediaStreamLike
  ) => RemoteAudioTargetLike | void;
  private readonly iceRestartDelayMs: number;
  private readonly speakingPollIntervalMs: number;
  private readonly speakingRmsThreshold: number;

  private iceServers: RTCIceServer[] = cloneIceServers(DEFAULT_ICE_SERVERS);
  private iceServersReadyPromise: Promise<void> | null = null;

  private micEnabled = false;
  private inputMode: VoiceInputMode = 'open_mic';
  private pttPressed = false;
  private permissionStatus: VoicePermissionStatus = 'idle';
  private localSpeaking = false;
  private micToggleEpoch = 0;
  private audioUnlockBound = false;

  private localStream: MediaStreamLike | null = null;
  private localAudioTrack: AudioTrackLike | null = null;
  private micRequestPromise: Promise<boolean> | null = null;

  private audioContext: AudioContextLike | null = null;
  private localAnalyser: AnalyserNodeLike | null = null;
  private localAudioSourceCleanup: (() => void) | null = null;
  private speakingPollTimer: ReturnType<typeof setInterval> | null = null;
  private floatBuffer: Float32Array<ArrayBuffer> = new Float32Array(256);
  private byteBuffer: Uint8Array<ArrayBuffer> = new Uint8Array(256);

  private readonly peers = new Map<string, PeerRecord>();
  private readonly peerPreferences = new Map<string, PeerPreferences>();
  private readonly listeners = new Set<(snap: VoiceMeshSnapshot) => void>();
  private disposed = false;

  constructor(options: VoiceMeshClientOptions) {
    this.myParticipantId = options.myParticipantId;
    this.sendSignalFn = options.sendSignal;
    const peerFactory = options.createPeerConnection;
    this.createPeerConnectionFn = peerFactory
      ? (config) => peerFactory(config) as unknown as RTCPeerConnectionLike
      : (config) => new RTCPeerConnection(config) as unknown as RTCPeerConnectionLike;
    this.getUserMediaFn = options.getUserMedia;
    this.isSecureContextOption = options.isSecureContext;
    this.createAudioContextFn = options.createAudioContext ?? createBrowserAudioContext;
    this.attachRemoteAudioElementFn =
      options.attachRemoteAudioElement ?? attachBrowserRemoteAudioElement;
    this.iceRestartDelayMs = options.iceRestartDelayMs ?? DEFAULT_ICE_RESTART_DELAY_MS;
    this.speakingPollIntervalMs =
      options.speakingPollIntervalMs ?? DEFAULT_SPEAKING_POLL_INTERVAL_MS;
    this.speakingRmsThreshold =
      options.speakingRmsThreshold ?? DEFAULT_SPEAKING_RMS_THRESHOLD;

    if (options.fetchIceServers) {
      this.iceServersReadyPromise = this.loadIceServers(options.fetchIceServers);
    } else if (typeof window !== 'undefined' && typeof fetch === 'function') {
      this.iceServersReadyPromise = this.loadIceServers(fetchDefaultIceServers);
    }
  }

  private async loadIceServers(fetcher: () => Promise<RTCIceServer[]>): Promise<void> {
    try {
      const loaded = await fetcher();
      if (this.disposed) return;
      if (Array.isArray(loaded) && loaded.length > 0) {
        this.iceServers = cloneIceServers(loaded);
        for (const peer of this.peers.values()) {
          if (!peer.disposed && peer.connectionState !== 'closed') {
            try {
              peer.pc.setConfiguration?.({ iceServers: cloneIceServers(this.iceServers) });
            } catch {
              // Ignore setConfiguration errors if peer is closing or mock rejects
            }
          }
        }
      }
    } catch {
      // Keep default STUN servers on error
    }
  }

  private checkIsSecureContext(): boolean {
    if (typeof this.isSecureContextOption === 'function') {
      return Boolean(this.isSecureContextOption());
    }
    if (typeof this.isSecureContextOption === 'boolean') {
      return this.isSecureContextOption;
    }
    if (typeof window !== 'undefined' && typeof window.isSecureContext === 'boolean') {
      return window.isSecureContext;
    }
    if (
      typeof globalThis !== 'undefined' &&
      typeof (globalThis as { isSecureContext?: unknown }).isSecureContext === 'boolean'
    ) {
      return Boolean((globalThis as { isSecureContext?: unknown }).isSecureContext);
    }
    return true;
  }

  syncPeers(remoteParticipantIds: string[]): void {
    if (this.disposed) return;

    const targetIds = new Set<string>();
    for (const rawId of remoteParticipantIds) {
      const id = typeof rawId === 'string' ? rawId.trim() : '';
      if (id && id !== this.myParticipantId) {
        targetIds.add(id);
      }
    }

    let changed = false;

    for (const [id, peer] of this.peers) {
      if (!targetIds.has(id)) {
        this.teardownPeer(peer);
        this.peers.delete(id);
        changed = true;
      }
    }

    for (const id of targetIds) {
      if (!this.peers.has(id)) {
        this.createPeer(id, { attachInitial: true });
        changed = true;
      }
    }

    if (changed) {
      this.emitSnapshot();
    }
  }

  async handleSignal(fromParticipantId: string, signal: RtcSignalPayload): Promise<void> {
    if (this.disposed) return;
    if (!fromParticipantId || fromParticipantId === this.myParticipantId) return;

    let peer = this.peers.get(fromParticipantId);
    if (!peer) {
      // Drop stray answers for unknown peers, but accept early offers or ICE from valid peers
      if (signal.kind === 'answer') return;
      peer = this.createPeer(fromParticipantId, {
        attachInitial: signal.kind !== 'offer',
      });
      this.emitSnapshot();
    }

    const activePeer = peer;
    activePeer.signalQueue = activePeer.signalQueue
      .then(() => this.processSignal(activePeer, signal))
      .catch(() => {
        // Guard against unhandled promise rejections in peer signaling queue
      });

    await activePeer.signalQueue;
  }

  async toggleMic(): Promise<void> {
    if (this.disposed) return;

    if (!this.micEnabled) {
      const startEpoch = ++this.micToggleEpoch;
      const acquired = await this.acquireLocalMic();
      if (
        !acquired ||
        this.disposed ||
        !this.localAudioTrack ||
        this.micToggleEpoch !== startEpoch ||
        this.inputMode === 'push_to_talk'
      ) {
        if (
          this.localAudioTrack &&
          (this.micToggleEpoch !== startEpoch || this.inputMode === 'push_to_talk')
        ) {
          this.localAudioTrack.enabled = false;
        }
        if (!this.disposed) {
          this.micEnabled = false;
          if (this.inputMode === 'push_to_talk') {
            this.pttPressed = false;
          }
          this.localSpeaking = false;
          this.emitSnapshot();
        }
        return;
      }
      void this.audioContext?.resume?.().catch(() => {});
      this.micEnabled = true;
      this.localAudioTrack.enabled = true;
      this.emitSnapshot();
      return;
    }

    this.micToggleEpoch += 1;
    this.micEnabled = false;
    if (this.inputMode === 'push_to_talk') {
      this.pttPressed = false;
    }
    if (this.localAudioTrack) {
      this.localAudioTrack.enabled = false;
    }
    this.localSpeaking = false;
    this.emitSnapshot();
  }

  setInputMode(mode: VoiceInputMode): void {
    if (this.disposed || this.inputMode === mode) return;
    this.micToggleEpoch += 1;
    this.inputMode = mode;
    this.pttPressed = false;
    if (mode === 'push_to_talk') {
      this.micEnabled = false;
      this.localSpeaking = false;
      if (this.localAudioTrack) {
        this.localAudioTrack.enabled = false;
      }
    } else if (this.localAudioTrack) {
      this.localAudioTrack.enabled = this.micEnabled;
    }
    this.emitSnapshot();
  }

  async setPushToTalkPressed(pressed: boolean): Promise<void> {
    if (this.disposed) return;
    this.micToggleEpoch += 1;
    if (this.inputMode !== 'push_to_talk') {
      if (!pressed && this.pttPressed) {
        this.pttPressed = false;
        this.emitSnapshot();
      }
      return;
    }

    if (!pressed) {
      this.pttPressed = false;
      this.micEnabled = false;
      this.localSpeaking = false;
      if (this.localAudioTrack) {
        this.localAudioTrack.enabled = false;
      }
      this.emitSnapshot();
      return;
    }

    this.pttPressed = true;
    const acquired = await this.acquireLocalMic();
    if (this.disposed) return;

    if (!acquired || !this.localAudioTrack) {
      this.pttPressed = false;
      this.micEnabled = false;
      this.localSpeaking = false;
      this.emitSnapshot();
      return;
    }

    void this.audioContext?.resume?.().catch(() => {});
    // Re-read this.pttPressed after async getUserMedia in case user released key while prompt was open
    const stillHeld = this.inputMode === 'push_to_talk' && this.pttPressed;
    this.micEnabled = stillHeld;
    this.localAudioTrack.enabled = stillHeld;
    if (!stillHeld) {
      this.localSpeaking = false;
    }
    this.emitSnapshot();
  }

  setPeerMuted(participantId: string, muted: boolean): void {
    if (this.disposed) return;
    const nextMuted = Boolean(muted);
    const prevPrefs = this.peerPreferences.get(participantId) ?? {
      mutedLocally: false,
      volume: 1,
    };
    this.peerPreferences.set(participantId, {
      ...prevPrefs,
      mutedLocally: nextMuted,
    });

    const peer = this.peers.get(participantId);
    if (!peer) return;
    peer.mutedLocally = nextMuted;
    if (nextMuted) {
      peer.isSpeaking = false;
    }
    if (peer.remoteAudioTarget) {
      peer.remoteAudioTarget.muted = nextMuted;
    }
    this.emitSnapshot();
  }

  setPeerVolume(participantId: string, volume: number): void {
    if (this.disposed) return;
    const clamped = clampVolume(volume);
    const prevPrefs = this.peerPreferences.get(participantId) ?? {
      mutedLocally: false,
      volume: 1,
    };
    this.peerPreferences.set(participantId, {
      ...prevPrefs,
      volume: clamped,
    });

    const peer = this.peers.get(participantId);
    if (!peer) return;
    peer.volume = clamped;
    if (peer.remoteAudioTarget) {
      peer.remoteAudioTarget.volume = clamped;
    }
    this.emitSnapshot();
  }

  getSnapshot(): VoiceMeshSnapshot {
    const peersSnapshot: Record<string, VoicePeerState> = {};
    for (const [id, peer] of this.peers) {
      peersSnapshot[id] = {
        participantId: peer.participantId,
        connectionState: peer.connectionState,
        mutedLocally: peer.mutedLocally,
        volume: peer.volume,
        isSpeaking: peer.isSpeaking,
      };
    }

    return {
      micEnabled: this.micEnabled,
      inputMode: this.inputMode,
      pttPressed: this.pttPressed,
      permissionStatus: this.permissionStatus,
      localSpeaking: this.localSpeaking,
      peers: peersSnapshot,
    };
  }

  subscribe(listener: (snap: VoiceMeshSnapshot) => void): () => void {
    if (this.disposed) {
      return () => {};
    }
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.micToggleEpoch += 1;
    this.unbindAudioUnlockListeners();

    this.stopSpeakingDetectorLoop();

    for (const peer of this.peers.values()) {
      this.teardownPeer(peer);
    }
    this.peers.clear();

    this.localAudioSourceCleanup?.();
    this.localAudioSourceCleanup = null;
    this.localAnalyser = null;

    if (this.localStream) {
      const tracks = this.localStream.getTracks?.() ?? this.localStream.getAudioTracks?.() ?? [];
      for (const track of tracks) {
        track.stop?.();
      }
    }
    this.localAudioTrack?.stop?.();
    this.localStream = null;
    this.localAudioTrack = null;

    if (this.audioContext) {
      void this.audioContext.close?.().catch(() => {});
      this.audioContext = null;
    }

    this.micEnabled = false;
    this.pttPressed = false;
    this.localSpeaking = false;
    this.listeners.clear();
  }

  private emitSnapshot(): void {
    if (this.disposed) return;
    const snapshot = this.getSnapshot();
    for (const listener of [...this.listeners]) {
      listener(snapshot);
    }
  }

  private createPeer(
    remoteParticipantId: string,
    options: { attachInitial: boolean }
  ): PeerRecord {
    const pc = this.createPeerConnectionFn({
      iceServers: cloneIceServers(this.iceServers),
    }) as RTCPeerConnectionLike;

    const prefs = this.peerPreferences.get(remoteParticipantId) ?? {
      mutedLocally: false,
      volume: 1,
    };

    const peer: PeerRecord = {
      participantId: remoteParticipantId,
      polite: isPolitePeer(this.myParticipantId, remoteParticipantId),
      pc,
      makingOffer: false,
      ignoreOffer: false,
      isSettingRemoteAnswerPending: false,
      offerEpoch: 0,
      pendingIceCandidates: [],
      signalQueue: Promise.resolve(),
      audioTransceiver: null,
      audioSender: null,
      remoteAudioTarget: null,
      remoteAnalyser: null,
      remoteAudioSourceCleanup: null,
      iceRestartTimer: null,
      connectionState: pc.connectionState ?? 'new',
      mutedLocally: prefs.mutedLocally,
      volume: prefs.volume,
      isSpeaking: false,
      disposed: false,
    };

    this.peers.set(remoteParticipantId, peer);

    pc.onicecandidate = (event) => {
      if (this.disposed || peer.disposed || this.peers.get(remoteParticipantId) !== peer) return;
      if (!event?.candidate) return;
      const rawCandidate = event.candidate as RTCIceCandidate & RTCIceCandidateInit;
      const candidateInit: RTCIceCandidateInit =
        typeof rawCandidate.toJSON === 'function' ? rawCandidate.toJSON() : rawCandidate;
      this.sendSignalFn(remoteParticipantId, {
        kind: 'ice',
        candidate: candidateInit,
      });
    };

    pc.onnegotiationneeded = () => this.negotiatePeer(peer);

    pc.onconnectionstatechange = () => {
      if (this.disposed || peer.disposed || this.peers.get(remoteParticipantId) !== peer) return;
      const nextState = pc.connectionState ?? 'new';
      peer.connectionState = nextState;
      if (nextState === 'failed' || nextState === 'disconnected') {
        this.scheduleIceRestart(peer);
      } else if (nextState === 'connected' || nextState === 'closed') {
        this.clearIceRestartTimer(peer);
      }
      this.emitSnapshot();
    };

    pc.ontrack = (event) => {
      if (this.disposed || peer.disposed || this.peers.get(remoteParticipantId) !== peer) return;
      const stream = this.resolveRemoteStream(event);
      if (!stream) return;
      this.attachRemoteMedia(peer, stream);
    };

    if (options.attachInitial) {
      if (this.localAudioTrack && this.localStream) {
        this.attachLocalTrackToPeer(peer, this.localAudioTrack, this.localStream);
      } else if (pc.addTransceiver) {
        peer.audioTransceiver = pc.addTransceiver('audio', { direction: 'recvonly' });
        peer.audioSender = peer.audioTransceiver?.sender ?? null;
      }
    }

    return peer;
  }

  private resolveRemoteStream(event: {
    track?: AudioTrackLike;
    streams?: readonly MediaStreamLike[];
  }): MediaStreamLike | null {
    if (event.streams && event.streams.length > 0 && event.streams[0]) {
      return event.streams[0];
    }
    if (!event.track) return null;
    if (typeof MediaStream !== 'undefined') {
      return new MediaStream([event.track as unknown as MediaStreamTrack]) as unknown as MediaStreamLike;
    }
    const track = event.track;
    return {
      getAudioTracks: () => [track],
      getTracks: () => [track],
    };
  }

  private attachRemoteMedia(peer: PeerRecord, stream: MediaStreamLike): void {
    this.cleanupRemoteMedia(peer);

    const target = this.attachRemoteAudioElementFn(peer.participantId, stream);
    if (target) {
      target.muted = peer.mutedLocally;
      target.volume = peer.volume;
      peer.remoteAudioTarget = target;
    }

    const analyserSetup = this.createStreamAnalyser(stream);
    if (analyserSetup) {
      peer.remoteAnalyser = analyserSetup.analyser;
      peer.remoteAudioSourceCleanup = analyserSetup.cleanup;
      this.ensureSpeakingDetectorLoop();
    }
  }

  private cleanupRemoteMedia(peer: PeerRecord): void {
    if (peer.remoteAudioTarget) {
      try {
        peer.remoteAudioTarget.pause?.();
        peer.remoteAudioTarget.remove?.();
      } catch {
        // Ignore DOM cleanup errors
      }
      peer.remoteAudioTarget = null;
    }
    peer.remoteAudioSourceCleanup?.();
    peer.remoteAudioSourceCleanup = null;
    peer.remoteAnalyser = null;
    peer.isSpeaking = false;
    this.stopSpeakingDetectorIfIdle();
  }

  private async negotiatePeer(peer: PeerRecord): Promise<void> {
    if (this.disposed || peer.disposed || this.peers.get(peer.participantId) !== peer) return;
    if (peer.makingOffer) return;

    const startEpoch = peer.offerEpoch;
    peer.makingOffer = true;
    try {
      if (this.iceServersReadyPromise) {
        await this.iceServersReadyPromise;
        if (this.disposed || peer.disposed || this.peers.get(peer.participantId) !== peer) return;
      }

      if (peer.offerEpoch !== startEpoch || peer.pc.signalingState !== 'stable') {
        return;
      }

      const offer = await peer.pc.createOffer();
      if (this.disposed || peer.disposed || this.peers.get(peer.participantId) !== peer) return;
      if (peer.offerEpoch !== startEpoch || peer.pc.signalingState !== 'stable') {
        return;
      }

      await peer.pc.setLocalDescription(offer);
      if (this.disposed || peer.disposed || this.peers.get(peer.participantId) !== peer) return;
      if (peer.offerEpoch !== startEpoch) return;

      const localDesc = peer.pc.localDescription ?? offer;
      if (localDesc?.sdp) {
        this.sendSignalFn(peer.participantId, {
          kind: 'offer',
          sdp: localDesc.sdp,
        });
      }
    } catch {
      // Ignore transient WebRTC negotiation errors during glare or teardown
    } finally {
      peer.makingOffer = false;
    }
  }

  private async processSignal(peer: PeerRecord, signal: RtcSignalPayload): Promise<void> {
    if (this.disposed || peer.disposed || this.peers.get(peer.participantId) !== peer) return;
    const pc = peer.pc;

    if (signal.kind === 'offer' || signal.kind === 'answer') {
      const readyForOffer =
        !peer.makingOffer &&
        (pc.signalingState === 'stable' || peer.isSettingRemoteAnswerPending);
      const offerCollision = signal.kind === 'offer' && !readyForOffer;

      peer.ignoreOffer = !peer.polite && offerCollision;
      if (peer.ignoreOffer) {
        return;
      }

      if (signal.kind === 'offer') {
        peer.offerEpoch += 1;
      }

      peer.isSettingRemoteAnswerPending = signal.kind === 'answer';
      try {
        if (offerCollision && peer.polite && pc.signalingState !== 'stable') {
          await pc.setLocalDescription({ type: 'rollback' });
          if (this.disposed || peer.disposed || this.peers.get(peer.participantId) !== peer) return;
        }

        await pc.setRemoteDescription({
          type: signal.kind,
          sdp: signal.sdp,
        });
        if (this.disposed || peer.disposed || this.peers.get(peer.participantId) !== peer) return;
      } finally {
        peer.isSettingRemoteAnswerPending = false;
      }

      await this.flushPendingIceCandidates(peer);
      if (this.disposed || peer.disposed || this.peers.get(peer.participantId) !== peer) return;

      if (signal.kind === 'offer') {
        if (this.iceServersReadyPromise) {
          await this.iceServersReadyPromise;
          if (this.disposed || peer.disposed || this.peers.get(peer.participantId) !== peer) return;
        }
        if (this.localAudioTrack && this.localStream && !peer.audioSender?.track) {
          this.attachLocalTrackToPeer(peer, this.localAudioTrack, this.localStream);
        }
        const answer = await pc.createAnswer();
        if (this.disposed || peer.disposed || this.peers.get(peer.participantId) !== peer) return;
        await pc.setLocalDescription(answer);
        if (this.disposed || peer.disposed || this.peers.get(peer.participantId) !== peer) return;
        const localDesc = pc.localDescription ?? answer;
        if (localDesc?.sdp) {
          this.sendSignalFn(peer.participantId, {
            kind: 'answer',
            sdp: localDesc.sdp,
          });
        }
      }
      return;
    }

    if (signal.kind === 'ice') {
      if (peer.ignoreOffer) return;
      try {
        if (!pc.remoteDescription) {
          peer.pendingIceCandidates.push(signal.candidate);
          return;
        }
        await pc.addIceCandidate(signal.candidate);
      } catch {
        // Ignore ICE candidate errors during offer glare or teardown
      }
    }
  }

  private async flushPendingIceCandidates(peer: PeerRecord): Promise<void> {
    while (peer.pendingIceCandidates.length > 0) {
      if (this.disposed || peer.disposed || this.peers.get(peer.participantId) !== peer) return;
      const nextCandidate = peer.pendingIceCandidates.shift();
      if (!nextCandidate) continue;
      try {
        await peer.pc.addIceCandidate(nextCandidate);
      } catch {
        // Ignore malformed or stale buffered ICE candidate
      }
    }
  }

  private async acquireLocalMic(): Promise<boolean> {
    if (this.disposed) return false;
    if (this.localAudioTrack) return true;
    if (this.micRequestPromise) {
      return this.micRequestPromise;
    }

    this.micRequestPromise = (async () => {
      if (!this.checkIsSecureContext()) {
        this.permissionStatus = 'insecure_context';
        this.micEnabled = false;
        this.pttPressed = false;
        this.emitSnapshot();
        return false;
      }

      let requestStream: ((constraints: MediaStreamConstraints) => Promise<MediaStreamLike>) | null =
        null;
      if (this.getUserMediaFn) {
        requestStream = this.getUserMediaFn;
      } else if (
        typeof navigator !== 'undefined' &&
        navigator.mediaDevices &&
        typeof navigator.mediaDevices.getUserMedia === 'function'
      ) {
        requestStream = (constraints) =>
          navigator.mediaDevices.getUserMedia(constraints) as Promise<MediaStreamLike>;
      }

      if (!requestStream) {
        this.permissionStatus = 'unsupported';
        this.micEnabled = false;
        this.pttPressed = false;
        this.emitSnapshot();
        return false;
      }

      try {
        const stream = await requestStream(AUDIO_CONSTRAINTS);
        if (this.disposed) {
          const staleTracks = stream.getTracks?.() ?? stream.getAudioTracks?.() ?? [];
          for (const track of staleTracks) {
            track.stop?.();
          }
          return false;
        }

        const audioTracks = stream.getAudioTracks?.() ?? stream.getTracks?.() ?? [];
        const audioTrack = audioTracks[0] ?? null;
        if (!audioTrack) {
          for (const t of stream.getTracks?.() ?? []) {
            t.stop?.();
          }
          this.permissionStatus = 'unsupported';
          this.micEnabled = false;
          this.pttPressed = false;
          this.emitSnapshot();
          return false;
        }

        this.localStream = stream;
        this.localAudioTrack = audioTrack;
        this.permissionStatus = 'granted';

        const analyserSetup = this.createStreamAnalyser(stream);
        if (analyserSetup) {
          this.localAnalyser = analyserSetup.analyser;
          this.localAudioSourceCleanup = analyserSetup.cleanup;
          this.ensureSpeakingDetectorLoop();
        }

        for (const peer of this.peers.values()) {
          if (!peer.disposed) {
            this.attachLocalTrackToPeer(peer, audioTrack, stream);
          }
        }

        return true;
      } catch {
        if (!this.disposed) {
          this.permissionStatus = 'denied';
          this.micEnabled = false;
          this.pttPressed = false;
          this.emitSnapshot();
        }
        return false;
      }
    })();

    try {
      return await this.micRequestPromise;
    } finally {
      this.micRequestPromise = null;
    }
  }

  private attachLocalTrackToPeer(
    peer: PeerRecord,
    track: AudioTrackLike,
    stream: MediaStreamLike
  ): void {
    if (this.disposed || peer.disposed || peer.connectionState === 'closed') return;
    const pc = peer.pc;

    const transceivers = pc.getTransceivers?.() ?? [];
    const isAudioTransceiver = (t: RTCRtpTransceiverLike): boolean =>
      t.sender?.track?.kind === 'audio' ||
      t.receiver?.track?.kind === 'audio' ||
      t.sender === peer.audioSender;
    const existingTransceiver =
      peer.audioTransceiver ??
      transceivers.find((t) => t.mid !== null && t.mid !== undefined && isAudioTransceiver(t)) ??
      transceivers.find((t) => isAudioTransceiver(t)) ??
      transceivers.find((t) => t.mid !== null && t.mid !== undefined) ??
      transceivers[0] ??
      null;

    if (existingTransceiver) {
      existingTransceiver.direction = 'sendrecv';
      peer.audioTransceiver = existingTransceiver;
      peer.audioSender = existingTransceiver.sender;
      if (existingTransceiver.sender?.replaceTrack) {
        void Promise.resolve(existingTransceiver.sender.replaceTrack(track)).catch(() => {});
      }
      return;
    }

    if (peer.audioSender?.replaceTrack) {
      void Promise.resolve(peer.audioSender.replaceTrack(track)).catch(() => {});
      return;
    }

    if (pc.addTrack) {
      peer.audioSender = pc.addTrack(track, stream);
      return;
    }

    if (pc.addTransceiver) {
      peer.audioTransceiver = pc.addTransceiver(track, {
        direction: 'sendrecv',
        streams: [stream as unknown as MediaStream],
      });
      peer.audioSender = peer.audioTransceiver.sender;
    }
  }

  private readonly handleUserGestureAudioUnlock = (): void => {
    if (this.disposed) {
      this.unbindAudioUnlockListeners();
      return;
    }
    const ctx = this.audioContext;
    if (!ctx) return;
    if (ctx.state === 'running') {
      this.unbindAudioUnlockListeners();
      return;
    }
    if (typeof ctx.resume === 'function') {
      void Promise.resolve(ctx.resume())
        .then(() => {
          if (this.disposed || this.audioContext?.state === 'running') {
            this.unbindAudioUnlockListeners();
          }
        })
        .catch(() => {});
    }
  };

  private bindAudioUnlockListeners(): void {
    if (this.disposed || this.audioUnlockBound) return;
    if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') return;
    this.audioUnlockBound = true;
    window.addEventListener('pointerdown', this.handleUserGestureAudioUnlock, {
      capture: true,
      passive: true,
    });
    window.addEventListener('keydown', this.handleUserGestureAudioUnlock, {
      capture: true,
      passive: true,
    });
  }

  private unbindAudioUnlockListeners(): void {
    if (!this.audioUnlockBound) return;
    this.audioUnlockBound = false;
    if (typeof window !== 'undefined' && typeof window.removeEventListener === 'function') {
      window.removeEventListener('pointerdown', this.handleUserGestureAudioUnlock, {
        capture: true,
      });
      window.removeEventListener('keydown', this.handleUserGestureAudioUnlock, {
        capture: true,
      });
    }
  }

  private ensureAudioContext(): AudioContextLike | null {
    if (this.disposed) return null;
    if (!this.audioContext) {
      this.audioContext = this.createAudioContextFn();
    }
    if (this.audioContext && this.audioContext.state !== 'running') {
      this.bindAudioUnlockListeners();
    }
    return this.audioContext;
  }

  private createStreamAnalyser(
    stream: MediaStreamLike
  ): { analyser: AnalyserNodeLike; cleanup: () => void } | null {
    const ctx = this.ensureAudioContext();
    if (!ctx) return null;
    try {
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      return {
        analyser,
        cleanup: () => {
          try {
            source.disconnect?.();
          } catch {
            // ignore
          }
          try {
            analyser.disconnect?.();
          } catch {
            // ignore
          }
        },
      };
    } catch {
      return null;
    }
  }

  private ensureSpeakingDetectorLoop(): void {
    if (this.disposed || this.speakingPollTimer !== null) return;
    this.speakingPollTimer = setInterval(() => {
      this.sampleSpeakingLevels();
    }, this.speakingPollIntervalMs);
  }

  private stopSpeakingDetectorIfIdle(): void {
    const hasAnyAnalyser =
      this.localAnalyser !== null ||
      Array.from(this.peers.values()).some((p) => p.remoteAnalyser !== null);
    if (!hasAnyAnalyser) {
      this.stopSpeakingDetectorLoop();
    }
  }

  private stopSpeakingDetectorLoop(): void {
    if (this.speakingPollTimer !== null) {
      clearInterval(this.speakingPollTimer);
      this.speakingPollTimer = null;
    }
  }

  private sampleSpeakingLevels(): void {
    if (this.disposed) return;

    let changed = false;

    const nextLocalSpeaking =
      this.micEnabled &&
      Boolean(this.localAudioTrack?.enabled) &&
      this.localAnalyser !== null &&
      this.computeAnalyserRms(this.localAnalyser) >= this.speakingRmsThreshold;

    if (this.localSpeaking !== nextLocalSpeaking) {
      this.localSpeaking = nextLocalSpeaking;
      changed = true;
    }

    for (const peer of this.peers.values()) {
      const nextPeerSpeaking =
        !peer.disposed &&
        !peer.mutedLocally &&
        peer.remoteAnalyser !== null &&
        this.computeAnalyserRms(peer.remoteAnalyser) >= this.speakingRmsThreshold;

      if (peer.isSpeaking !== nextPeerSpeaking) {
        peer.isSpeaking = nextPeerSpeaking;
        changed = true;
      }
    }

    if (changed) {
      this.emitSnapshot();
    }
  }

  private computeAnalyserRms(analyser: AnalyserNodeLike): number {
    const size = Math.max(1, analyser.fftSize || 256);

    if (typeof analyser.getFloatTimeDomainData === 'function') {
      if (this.floatBuffer.length !== size) {
        this.floatBuffer = new Float32Array(size);
      }
      analyser.getFloatTimeDomainData(this.floatBuffer);
      let sumSquares = 0;
      for (let i = 0; i < size; i += 1) {
        const sample = this.floatBuffer[i];
        sumSquares += sample * sample;
      }
      return Math.sqrt(sumSquares / size);
    }

    if (typeof analyser.getByteTimeDomainData === 'function') {
      if (this.byteBuffer.length !== size) {
        this.byteBuffer = new Uint8Array(size);
      }
      analyser.getByteTimeDomainData(this.byteBuffer);
      let sumSquares = 0;
      for (let i = 0; i < size; i += 1) {
        const sample = (this.byteBuffer[i] - 128) / 128;
        sumSquares += sample * sample;
      }
      return Math.sqrt(sumSquares / size);
    }

    return 0;
  }

  private scheduleIceRestart(peer: PeerRecord): void {
    if (this.disposed || peer.disposed || peer.iceRestartTimer !== null) return;
    peer.iceRestartTimer = setTimeout(() => {
      peer.iceRestartTimer = null;
      if (this.disposed || peer.disposed || this.peers.get(peer.participantId) !== peer) return;
      const state = peer.pc.connectionState;
      if (state !== 'failed' && state !== 'disconnected') return;
      if (peer.polite) {
        peer.pc.restartIce?.();
      }
    }, this.iceRestartDelayMs);
  }

  private clearIceRestartTimer(peer: PeerRecord): void {
    if (peer.iceRestartTimer !== null) {
      clearTimeout(peer.iceRestartTimer);
      peer.iceRestartTimer = null;
    }
  }

  private teardownPeer(peer: PeerRecord): void {
    peer.disposed = true;
    this.clearIceRestartTimer(peer);
    peer.pendingIceCandidates.length = 0;
    this.cleanupRemoteMedia(peer);

    peer.pc.onicecandidate = null;
    peer.pc.onnegotiationneeded = null;
    peer.pc.ontrack = null;
    peer.pc.onconnectionstatechange = null;

    try {
      peer.pc.close();
    } catch {
      // Ignore errors closing peer connection
    }
  }
}
