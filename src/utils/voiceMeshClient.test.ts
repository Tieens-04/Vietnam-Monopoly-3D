import assert from 'node:assert/strict';
import test from 'node:test';
import type { RtcSignalPayload } from '../game/onlineTypes';
import {
  isPolitePeer,
  VoiceMeshClient,
  type AudioTrackLike,
  type MediaStreamLike,
  type VoiceMeshSnapshot,
} from './voiceMeshClient';

interface MockAudioTrack {
  id: string;
  kind: string;
  enabled: boolean;
  stopped: boolean;
  stop: () => void;
}

function createMockTrack(id = 'track-1', kind = 'audio'): MockAudioTrack {
  return {
    id,
    kind,
    enabled: true,
    stopped: false,
    stop() {
      this.stopped = true;
    },
  };
}

interface MockMediaStream {
  id: string;
  tracks: MockAudioTrack[];
  getAudioTracks: () => MockAudioTrack[];
  getTracks: () => MockAudioTrack[];
}

function createMockStream(tracks: MockAudioTrack[], id = 'stream-1'): MockMediaStream {
  return {
    id,
    tracks,
    getAudioTracks: () => tracks.filter((t) => t.kind === 'audio'),
    getTracks: () => tracks,
  };
}

interface MockSender {
  track: AudioTrackLike | null;
  replacedTracks: Array<AudioTrackLike | null>;
  replaceTrack: (next: AudioTrackLike | null) => Promise<void>;
}

interface MockTransceiver {
  direction: RTCRtpTransceiverDirection;
  mid: string | null;
  sender: MockSender;
  receiver: { track: AudioTrackLike | null };
}

class MockRTCPeerConnection {
  readonly rtcConfig: RTCConfiguration;
  signalingState: RTCSignalingState = 'stable';
  connectionState: RTCPeerConnectionState = 'new';
  localDescription: RTCSessionDescriptionInit | null = null;
  remoteDescription: RTCSessionDescriptionInit | null = null;

  onnegotiationneeded: ((ev?: unknown) => unknown) | null = null;
  onicecandidate: ((ev: { candidate: RTCIceCandidate | RTCIceCandidateInit | null }) => unknown) | null = null;
  ontrack: ((ev: { track?: AudioTrackLike; streams?: readonly MediaStreamLike[] }) => unknown) | null =
    null;
  onconnectionstatechange: ((ev?: unknown) => unknown) | null = null;

  transceivers: MockTransceiver[] = [];
  addedTracks: AudioTrackLike[] = [];
  iceCandidatesAdded: RTCIceCandidateInit[] = [];
  setLocalCalls: RTCSessionDescriptionInit[] = [];
  setRemoteCalls: RTCSessionDescriptionInit[] = [];
  restartIceCalls = 0;
  closed = false;

  createOfferHook: (() => Promise<RTCSessionDescriptionInit>) | null = null;
  createAnswerHook: (() => Promise<RTCSessionDescriptionInit>) | null = null;
  offerCounter = 0;
  answerCounter = 0;

  constructor(rtcConfig: RTCConfiguration) {
    this.rtcConfig = rtcConfig;
  }

  addTransceiver(
    trackOrKind: string | AudioTrackLike,
    init?: RTCRtpTransceiverInit
  ): MockTransceiver {
    const track = typeof trackOrKind === 'string' ? null : trackOrKind;
    const sender: MockSender = {
      track,
      replacedTracks: [],
      replaceTrack: async (next: AudioTrackLike | null) => {
        sender.track = next;
        sender.replacedTracks.push(next);
      },
    };
    const transceiver: MockTransceiver = {
      direction: init?.direction ?? 'sendrecv',
      mid: null,
      sender,
      receiver: { track: null },
    };
    this.transceivers.push(transceiver);
    return transceiver;
  }

  getTransceivers(): MockTransceiver[] {
    return this.transceivers;
  }

  getSenders(): MockSender[] {
    return this.transceivers.map((t) => t.sender);
  }

  addTrack(track: AudioTrackLike): MockSender {
    this.addedTracks.push(track);
    const transceiver = this.addTransceiver(track, { direction: 'sendrecv' });
    return transceiver.sender;
  }

  async createOffer(): Promise<RTCSessionDescriptionInit> {
    if (this.createOfferHook) {
      return this.createOfferHook();
    }
    this.offerCounter += 1;
    return { type: 'offer', sdp: `mock-offer-${this.offerCounter}` };
  }

  async createAnswer(): Promise<RTCSessionDescriptionInit> {
    if (this.createAnswerHook) {
      return this.createAnswerHook();
    }
    this.answerCounter += 1;
    return { type: 'answer', sdp: `mock-answer-${this.answerCounter}` };
  }

  async setLocalDescription(desc?: RTCSessionDescriptionInit): Promise<void> {
    if (!desc) return;
    this.setLocalCalls.push(desc);
    if (desc.type === 'rollback') {
      this.localDescription = null;
      this.signalingState = 'stable';
      return;
    }
    this.localDescription = desc;
    if (desc.type === 'offer') {
      this.signalingState = 'have-local-offer';
    } else if (desc.type === 'answer') {
      this.signalingState = 'stable';
    }
  }

  async setRemoteDescription(desc: RTCSessionDescriptionInit): Promise<void> {
    this.setRemoteCalls.push(desc);
    this.remoteDescription = desc;
    if (desc.type === 'offer') {
      this.signalingState = 'have-remote-offer';
    } else if (desc.type === 'answer') {
      this.signalingState = 'stable';
    }
  }

  async addIceCandidate(candidate: RTCIceCandidateInit): Promise<void> {
    if (!this.remoteDescription) {
      throw new Error('InvalidStateError: remoteDescription is not set');
    }
    this.iceCandidatesAdded.push(candidate);
  }

  setConfiguration(config: RTCConfiguration): void {
    Object.assign(this.rtcConfig, config);
  }

  restartIce(): void {
    this.restartIceCalls += 1;
  }

  close(): void {
    this.closed = true;
    this.connectionState = 'closed';
  }

  emitConnectionState(state: RTCPeerConnectionState): void {
    this.connectionState = state;
    this.onconnectionstatechange?.({});
  }

  emitIceCandidate(candidate: RTCIceCandidateInit | null): void {
    this.onicecandidate?.({ candidate });
  }

  emitTrack(stream: MockMediaStream, track = stream.tracks[0]): void {
    this.ontrack?.({ track, streams: [stream] });
  }
}

interface MockAnalyser {
  fftSize: number;
  rmsValue: number;
  disconnected: boolean;
  getFloatTimeDomainData: (arr: Float32Array) => void;
  disconnect: () => void;
}

class MockAudioContext {
  state: AudioContextState = 'running';
  closed = false;
  analysersByStream = new Map<unknown, MockAnalyser>();
  sourcesDisconnected = 0;

  async resume(): Promise<void> {
    this.state = 'running';
  }

  async close(): Promise<void> {
    this.closed = true;
    this.state = 'closed';
  }

  createMediaStreamSource(stream: unknown) {
    return {
      stream,
      connect: (_dest: unknown) => {},
      disconnect: () => {
        this.sourcesDisconnected += 1;
      },
    };
  }

  createAnalyser(): MockAnalyser {
    const analyser: MockAnalyser = {
      fftSize: 2048,
      rmsValue: 0,
      disconnected: false,
      getFloatTimeDomainData: (arr: Float32Array) => {
        arr.fill(analyser.rmsValue);
      },
      disconnect: () => {
        analyser.disconnected = true;
      },
    };
    return analyser;
  }
}

function createDeferred<T>() {
  let resolve!: (val: T) => void;
  let reject!: (err: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

test('isPolitePeer uses deterministic lexicographic comparison on participantId', () => {
  assert.equal(isPolitePeer('p_0001', 'p_0002'), true);
  assert.equal(isPolitePeer('p_0002', 'p_0001'), false);
  assert.equal(isPolitePeer('p_0001', 'p_0001'), false);
});

test('starts with micEnabled=false and syncPeers sets up recvonly RTCPeerConnection without calling getUserMedia', () => {
  const pcs: MockRTCPeerConnection[] = [];
  let getUserMediaCalls = 0;

  const client = new VoiceMeshClient({
    myParticipantId: 'p_0001',
    sendSignal: () => {},
    isSecureContext: true,
    createPeerConnection: (cfg) => {
      const pc = new MockRTCPeerConnection(cfg);
      pcs.push(pc);
      return pc;
    },
    getUserMedia: async () => {
      getUserMediaCalls += 1;
      return createMockStream([createMockTrack()]);
    },
  });

  try {
    const initial = client.getSnapshot();
    assert.equal(initial.micEnabled, false);
    assert.equal(initial.inputMode, 'open_mic');
    assert.equal(initial.pttPressed, false);
    assert.equal(initial.permissionStatus, 'idle');
    assert.equal(initial.localSpeaking, false);
    assert.deepEqual(initial.peers, {});

    // Passing self ID alongside remote ID ignores self
    client.syncPeers(['p_0001', 'p_remote']);

    assert.equal(getUserMediaCalls, 0);
    assert.equal(pcs.length, 1);
    assert.equal(pcs[0].transceivers.length, 1);
    assert.equal(pcs[0].transceivers[0].direction, 'recvonly');
    assert.equal(pcs[0].transceivers[0].sender.track, null);
    assert.deepEqual(client.getSnapshot().peers['p_remote'], {
      participantId: 'p_remote',
      connectionState: 'new',
      mutedLocally: false,
      volume: 1,
      isSpeaking: false,
    });
  } finally {
    client.dispose();
  }
});

test('toggleMic in insecure context sets permissionStatus=insecure_context without throwing', async () => {
  let getUserMediaCalls = 0;
  const client = new VoiceMeshClient({
    myParticipantId: 'p_0001',
    sendSignal: () => {},
    isSecureContext: false,
    createPeerConnection: (cfg) => new MockRTCPeerConnection(cfg),
    getUserMedia: async () => {
      getUserMediaCalls += 1;
      return createMockStream([createMockTrack()]);
    },
  });

  try {
    await client.toggleMic();
    const snap = client.getSnapshot();
    assert.equal(snap.permissionStatus, 'insecure_context');
    assert.equal(snap.micEnabled, false);
    assert.equal(getUserMediaCalls, 0);

    client.setInputMode('push_to_talk');
    await client.setPushToTalkPressed(true);
    assert.equal(client.getSnapshot().permissionStatus, 'insecure_context');
    assert.equal(client.getSnapshot().pttPressed, false);
    assert.equal(client.getSnapshot().micEnabled, false);
  } finally {
    client.dispose();
  }
});

test('toggleMic sets permissionStatus=unsupported when getUserMedia API is missing', async () => {
  const client = new VoiceMeshClient({
    myParticipantId: 'p_0001',
    sendSignal: () => {},
    isSecureContext: true,
    createPeerConnection: (cfg) => new MockRTCPeerConnection(cfg),
  });

  try {
    await client.toggleMic();
    assert.equal(client.getSnapshot().permissionStatus, 'unsupported');
    assert.equal(client.getSnapshot().micEnabled, false);
  } finally {
    client.dispose();
  }
});

test('toggleMic handles NotAllowedError by setting permissionStatus=denied and keeping micEnabled=false', async () => {
  const client = new VoiceMeshClient({
    myParticipantId: 'p_0001',
    sendSignal: () => {},
    isSecureContext: true,
    createPeerConnection: (cfg) => new MockRTCPeerConnection(cfg),
    getUserMedia: async () => {
      const err = new Error('Permission denied');
      err.name = 'NotAllowedError';
      throw err;
    },
  });

  try {
    await client.toggleMic();
    const snap = client.getSnapshot();
    assert.equal(snap.permissionStatus, 'denied');
    assert.equal(snap.micEnabled, false);
  } finally {
    client.dispose();
  }
});

test('lazy mic acquisition upgrades recvonly peer transceivers and supports Open Mic & Push-to-Talk', async () => {
  const pcs: MockRTCPeerConnection[] = [];
  const localTrack = createMockTrack('mic-1');
  let getUserMediaCalls = 0;
  let capturedConstraints: MediaStreamConstraints | undefined;

  const client = new VoiceMeshClient({
    myParticipantId: 'p_0001',
    sendSignal: () => {},
    isSecureContext: true,
    createPeerConnection: (cfg) => {
      const pc = new MockRTCPeerConnection(cfg);
      pcs.push(pc);
      return pc;
    },
    getUserMedia: async (constraints) => {
      getUserMediaCalls += 1;
      capturedConstraints = constraints;
      return createMockStream([localTrack]);
    },
  });

  try {
    client.syncPeers(['p_remote']);
    assert.equal(pcs[0].transceivers[0].direction, 'recvonly');

    // Enable mic for the first time -> requests getUserMedia and attaches track to existing peer
    await client.toggleMic();
    assert.equal(getUserMediaCalls, 1);
    assert.deepEqual(capturedConstraints, {
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });
    assert.equal(client.getSnapshot().permissionStatus, 'granted');
    assert.equal(client.getSnapshot().micEnabled, true);
    assert.equal(localTrack.enabled, true);
    assert.equal(pcs[0].transceivers[0].direction, 'sendrecv');
    assert.equal(pcs[0].transceivers[0].sender.track, localTrack);

    // Toggle mic off -> disables track without re-requesting getUserMedia
    await client.toggleMic();
    assert.equal(getUserMediaCalls, 1);
    assert.equal(client.getSnapshot().micEnabled, false);
    assert.equal(localTrack.enabled, false);

    // Toggle mic back on, then switch to push_to_talk -> disables track immediately
    await client.toggleMic();
    assert.equal(localTrack.enabled, true);

    client.setInputMode('push_to_talk');
    assert.equal(client.getSnapshot().inputMode, 'push_to_talk');
    assert.equal(client.getSnapshot().micEnabled, false);
    assert.equal(client.getSnapshot().pttPressed, false);
    assert.equal(localTrack.enabled, false);

    // Hold and release PTT
    await client.setPushToTalkPressed(true);
    assert.equal(client.getSnapshot().pttPressed, true);
    assert.equal(client.getSnapshot().micEnabled, true);
    assert.equal(localTrack.enabled, true);

    await client.setPushToTalkPressed(false);
    assert.equal(client.getSnapshot().pttPressed, false);
    assert.equal(client.getSnapshot().micEnabled, false);
    assert.equal(localTrack.enabled, false);
  } finally {
    client.dispose();
  }
});

test('setPushToTalkPressed(true) lazily requests mic permission if not yet granted', async () => {
  const localTrack = createMockTrack('mic-ptt');
  let getUserMediaCalls = 0;

  const client = new VoiceMeshClient({
    myParticipantId: 'p_0001',
    sendSignal: () => {},
    isSecureContext: true,
    createPeerConnection: (cfg) => new MockRTCPeerConnection(cfg),
    getUserMedia: async () => {
      getUserMediaCalls += 1;
      return createMockStream([localTrack]);
    },
  });

  try {
    client.setInputMode('push_to_talk');
    assert.equal(getUserMediaCalls, 0);

    await client.setPushToTalkPressed(true);
    assert.equal(getUserMediaCalls, 1);
    assert.equal(client.getSnapshot().permissionStatus, 'granted');
    assert.equal(client.getSnapshot().pttPressed, true);
    assert.equal(client.getSnapshot().micEnabled, true);
    assert.equal(localTrack.enabled, true);

    await client.setPushToTalkPressed(false);
    assert.equal(client.getSnapshot().pttPressed, false);
    assert.equal(client.getSnapshot().micEnabled, false);
    assert.equal(localTrack.enabled, false);
  } finally {
    client.dispose();
  }
});

test('Perfect Negotiation glare: polite peer rolls back and answers while impolite peer ignores colliding offer', async () => {
  // 1. Polite peer ('p_0001' < 'p_0002')
  const politeSent: Array<{ target: string; signal: RtcSignalPayload }> = [];
  const politePcs: MockRTCPeerConnection[] = [];
  const politeClient = new VoiceMeshClient({
    myParticipantId: 'p_0001',
    sendSignal: (target, signal) => politeSent.push({ target, signal }),
    isSecureContext: true,
    createPeerConnection: (cfg) => {
      const pc = new MockRTCPeerConnection(cfg);
      politePcs.push(pc);
      return pc;
    },
  });

  // 2. Impolite peer ('p_0002' > 'p_0001')
  const impoliteSent: Array<{ target: string; signal: RtcSignalPayload }> = [];
  const impolitePcs: MockRTCPeerConnection[] = [];
  const impoliteClient = new VoiceMeshClient({
    myParticipantId: 'p_0002',
    sendSignal: (target, signal) => impoliteSent.push({ target, signal }),
    isSecureContext: true,
    createPeerConnection: (cfg) => {
      const pc = new MockRTCPeerConnection(cfg);
      impolitePcs.push(pc);
      return pc;
    },
  });

  try {
    // Polite peer already sent local offer -> signalingState === 'have-local-offer'
    politeClient.syncPeers(['p_0002']);
    await politePcs[0].onnegotiationneeded?.();
    assert.equal(politePcs[0].signalingState, 'have-local-offer');
    assert.equal(politeSent.length, 1);
    assert.equal(politeSent[0].signal.kind, 'offer');

    // Colliding offer arrives at polite peer -> must rollback, set remote offer, and send answer
    await politeClient.handleSignal('p_0002', {
      kind: 'offer',
      sdp: 'remote-glare-offer',
    });
    assert.ok(politePcs[0].setLocalCalls.some((d) => d.type === 'rollback'));
    assert.equal(politePcs[0].remoteDescription?.sdp, 'remote-glare-offer');
    assert.equal(politeSent.length, 2);
    assert.deepEqual(politeSent[1].signal, { kind: 'answer', sdp: 'mock-answer-1' });
    assert.equal(politePcs[0].signalingState, 'stable');

    // Impolite peer is actively makingOffer (deferred createOffer) -> colliding offer MUST be ignored
    impoliteClient.syncPeers(['p_0001']);
    const offerDeferred = createDeferred<RTCSessionDescriptionInit>();
    impolitePcs[0].createOfferHook = () => offerDeferred.promise;

    const negotiationPromise = impolitePcs[0].onnegotiationneeded?.();
    await impoliteClient.handleSignal('p_0001', {
      kind: 'offer',
      sdp: 'colliding-offer-from-polite',
    });
    // Also ICE candidate during ignored offer should be safely ignored
    await impoliteClient.handleSignal('p_0001', {
      kind: 'ice',
      candidate: { candidate: 'candidate:ignored 1 udp 1 127.0.0.1 9999 typ host' },
    });

    assert.equal(impolitePcs[0].setRemoteCalls.length, 0);
    assert.equal(impoliteSent.length, 0);

    offerDeferred.resolve({ type: 'offer', sdp: 'impolite-local-offer' });
    await negotiationPromise;
    assert.equal(impoliteSent.length, 1);
    assert.deepEqual(impoliteSent[0].signal, { kind: 'offer', sdp: 'impolite-local-offer' });
  } finally {
    politeClient.dispose();
    impoliteClient.dispose();
  }
});

test('buffers trickle ICE candidates until remoteDescription is set and ignores null onicecandidate', async () => {
  const sent: Array<{ target: string; signal: RtcSignalPayload }> = [];
  const pcs: MockRTCPeerConnection[] = [];

  const client = new VoiceMeshClient({
    myParticipantId: 'p_0001',
    sendSignal: (target, signal) => sent.push({ target, signal }),
    isSecureContext: true,
    createPeerConnection: (cfg) => {
      const pc = new MockRTCPeerConnection(cfg);
      pcs.push(pc);
      return pc;
    },
  });

  try {
    client.syncPeers(['p_0002']);

    // Null end-of-candidates event does not emit signal; valid candidate does
    pcs[0].emitIceCandidate(null);
    pcs[0].emitIceCandidate({ candidate: 'candidate:local 1 udp 1 127.0.0.1 5000 typ host' });
    assert.equal(sent.length, 1);
    assert.equal(sent[0].signal.kind, 'ice');

    // Remote ICE arrives before remote offer -> buffered without throwing InvalidStateError
    await client.handleSignal('p_0002', {
      kind: 'ice',
      candidate: { candidate: 'candidate:early 1 udp 1 127.0.0.1 5001 typ host' },
    });
    assert.equal(pcs[0].iceCandidatesAdded.length, 0);

    // Remote offer arrives -> sets remoteDescription and flushes buffered ICE candidate
    await client.handleSignal('p_0002', {
      kind: 'offer',
      sdp: 'remote-offer-with-early-ice',
    });
    assert.equal(pcs[0].iceCandidatesAdded.length, 1);
    assert.equal(
      pcs[0].iceCandidatesAdded[0].candidate,
      'candidate:early 1 udp 1 127.0.0.1 5001 typ host'
    );
  } finally {
    client.dispose();
  }
});

test('applies local peer mute/volume to remote audio element and cleans up on peer removal', async () => {
  const pcs: MockRTCPeerConnection[] = [];
  const attachedElements = new Map<
    string,
    { muted: boolean; volume: number; removed: boolean; paused: boolean }
  >();

  const client = new VoiceMeshClient({
    myParticipantId: 'p_0001',
    sendSignal: () => {},
    isSecureContext: true,
    createPeerConnection: (cfg) => {
      const pc = new MockRTCPeerConnection(cfg);
      pcs.push(pc);
      return pc;
    },
    attachRemoteAudioElement: (participantId) => {
      const el = {
        muted: false,
        volume: 1,
        removed: false,
        paused: false,
        pause() {
          this.paused = true;
        },
        remove() {
          this.removed = true;
        },
      };
      attachedElements.set(participantId, el);
      return el;
    },
  });

  try {
    client.syncPeers(['p_remote']);
    const remoteStream = createMockStream([createMockTrack('remote-audio')], 'remote-stream');
    pcs[0].emitTrack(remoteStream);

    const el = attachedElements.get('p_remote');
    assert.ok(el);
    assert.equal(el.muted, false);
    assert.equal(el.volume, 1);

    client.setPeerMuted('p_remote', true);
    client.setPeerVolume('p_remote', 0.4);
    assert.equal(el.muted, true);
    assert.equal(el.volume, 0.4);
    assert.equal(client.getSnapshot().peers['p_remote'].mutedLocally, true);
    assert.equal(client.getSnapshot().peers['p_remote'].volume, 0.4);

    // Clamp volume bounds
    client.setPeerVolume('p_remote', 2.5);
    assert.equal(el.volume, 1);
    client.setPeerVolume('p_remote', -0.5);
    assert.equal(el.volume, 0);

    // Removing peer cleans up PC and remote audio element
    client.syncPeers([]);
    assert.equal(pcs[0].closed, true);
    assert.equal(el.paused, true);
    assert.equal(el.removed, true);
    assert.equal(client.getSnapshot().peers['p_remote'], undefined);
  } finally {
    client.dispose();
  }
});

test('speaking detector samples RMS at 120ms against 0.025 threshold and respects mutes', async (t) => {
  t.mock.timers.enable({ apis: ['setInterval', 'setTimeout'] });

  const pcs: MockRTCPeerConnection[] = [];
  const createdAnalysers: MockAnalyser[] = [];
  const audioContexts: MockAudioContext[] = [];
  const localTrack = createMockTrack('mic-speak');

  const client = new VoiceMeshClient({
    myParticipantId: 'p_0001',
    sendSignal: () => {},
    isSecureContext: true,
    createPeerConnection: (cfg) => {
      const pc = new MockRTCPeerConnection(cfg);
      pcs.push(pc);
      return pc;
    },
    getUserMedia: async () => createMockStream([localTrack], 'local-stream'),
    createAudioContext: () => {
      const ctx = new MockAudioContext();
      const origCreateAnalyser = ctx.createAnalyser.bind(ctx);
      ctx.createAnalyser = () => {
        const analyser = origCreateAnalyser();
        createdAnalysers.push(analyser);
        return analyser;
      };
      audioContexts.push(ctx);
      return ctx;
    },
    attachRemoteAudioElement: () => ({ muted: false, volume: 1 }),
  });

  try {
    client.syncPeers(['p_remote']);
    pcs[0].emitTrack(createMockStream([createMockTrack('remote-speak')], 'remote-stream'));
    await client.toggleMic();

    assert.equal(createdAnalysers.length, 2);
    const [remoteAnalyser, localAnalyser] = createdAnalysers;

    // Below 0.025 noise threshold -> not speaking
    remoteAnalyser.rmsValue = 0.01;
    localAnalyser.rmsValue = 0.02;
    t.mock.timers.tick(120);
    assert.equal(client.getSnapshot().localSpeaking, false);
    assert.equal(client.getSnapshot().peers['p_remote'].isSpeaking, false);

    // Above 0.025 -> speaking
    remoteAnalyser.rmsValue = 0.08;
    localAnalyser.rmsValue = 0.06;
    t.mock.timers.tick(120);
    assert.equal(client.getSnapshot().localSpeaking, true);
    assert.equal(client.getSnapshot().peers['p_remote'].isSpeaking, true);

    // Muting peer locally clears peer isSpeaking; muting local mic clears localSpeaking
    client.setPeerMuted('p_remote', true);
    await client.toggleMic();
    assert.equal(client.getSnapshot().localSpeaking, false);
    assert.equal(client.getSnapshot().peers['p_remote'].isSpeaking, false);
  } finally {
    client.dispose();
    assert.equal(audioContexts[0].closed, true);
    assert.equal(localTrack.stopped, true);
  }
});

test('auto ICE restart: polite peer calls restartIce after 4000ms in failed/disconnected, impolite does not, recovery cancels timer', async (t) => {
  t.mock.timers.enable({ apis: ['setInterval', 'setTimeout'] });

  const politePcs: MockRTCPeerConnection[] = [];
  const politeClient = new VoiceMeshClient({
    myParticipantId: 'p_0001',
    sendSignal: () => {},
    isSecureContext: true,
    createPeerConnection: (cfg) => {
      const pc = new MockRTCPeerConnection(cfg);
      politePcs.push(pc);
      return pc;
    },
  });

  const impolitePcs: MockRTCPeerConnection[] = [];
  const impoliteClient = new VoiceMeshClient({
    myParticipantId: 'p_0002',
    sendSignal: () => {},
    isSecureContext: true,
    createPeerConnection: (cfg) => {
      const pc = new MockRTCPeerConnection(cfg);
      impolitePcs.push(pc);
      return pc;
    },
  });

  try {
    politeClient.syncPeers(['p_0002']);
    impoliteClient.syncPeers(['p_0001']);

    // Polite enters failed -> restartIce only after 4000ms
    politePcs[0].emitConnectionState('failed');
    impolitePcs[0].emitConnectionState('failed');

    t.mock.timers.tick(3999);
    assert.equal(politePcs[0].restartIceCalls, 0);
    assert.equal(impolitePcs[0].restartIceCalls, 0);

    t.mock.timers.tick(1);
    assert.equal(politePcs[0].restartIceCalls, 1);
    assert.equal(impolitePcs[0].restartIceCalls, 0);

    // Recover to connected, then test disconnected -> connected before 4000ms cancels restartIce
    politePcs[0].emitConnectionState('connected');
    politePcs[0].emitConnectionState('disconnected');
    t.mock.timers.tick(2500);
    politePcs[0].emitConnectionState('connected');
    t.mock.timers.tick(2000);
    assert.equal(politePcs[0].restartIceCalls, 1);
  } finally {
    politeClient.dispose();
    impoliteClient.dispose();
  }
});

test('fetches ICE servers and falls back to default STUN servers on error, and notifies subscribers', async () => {
  const pcs: MockRTCPeerConnection[] = [];
  const snapshots: VoiceMeshSnapshot[] = [];

  const client = new VoiceMeshClient({
    myParticipantId: 'p_0001',
    sendSignal: () => {},
    isSecureContext: true,
    fetchIceServers: async () => {
      throw new Error('Network unavailable');
    },
    createPeerConnection: (cfg) => {
      const pc = new MockRTCPeerConnection(cfg);
      pcs.push(pc);
      return pc;
    },
  });

  const unsubscribe = client.subscribe((snap) => snapshots.push(snap));

  try {
    client.syncPeers(['p_0002']);
    assert.equal(snapshots.length, 1);
    assert.deepEqual(pcs[0].rtcConfig.iceServers, [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun.cloudflare.com:3478' },
    ]);

    // Negotiation still succeeds using fallback STUN servers
    await pcs[0].onnegotiationneeded?.();
    assert.equal(pcs[0].signalingState, 'have-local-offer');

    unsubscribe();
    client.setInputMode('push_to_talk');
    assert.equal(snapshots.length, 1);
  } finally {
    client.dispose();
  }
});

test('deduplicates concurrent getUserMedia calls, handles PTT release and dispose during permission prompt, and preserves pre-track peer mute/volume', async () => {
  const deferredMic = createDeferred<MockMediaStream>();
  const track = createMockTrack('delayed-mic');
  let getUserMediaCalls = 0;

  const client = new VoiceMeshClient({
    myParticipantId: 'p_0001',
    sendSignal: () => {},
    isSecureContext: true,
    createPeerConnection: (cfg) => new MockRTCPeerConnection(cfg),
    getUserMedia: () => {
      getUserMediaCalls += 1;
      return deferredMic.promise;
    },
  });

  client.setInputMode('push_to_talk');
  const p1 = client.setPushToTalkPressed(true);
  const p2 = client.setPushToTalkPressed(true);
  assert.equal(getUserMediaCalls, 1);

  // User releases PTT before permission prompt resolves
  await client.setPushToTalkPressed(false);
  deferredMic.resolve(createMockStream([track]));
  await Promise.all([p1, p2]);

  assert.equal(track.enabled, false);
  assert.equal(client.getSnapshot().pttPressed, false);
  assert.equal(client.getSnapshot().micEnabled, false);
  client.dispose();
  assert.equal(track.stopped, true);

  // Disposing while getUserMedia is pending stops the newly acquired track immediately
  const disposedDeferred = createDeferred<MockMediaStream>();
  const lateTrack = createMockTrack('late-mic');
  const client2 = new VoiceMeshClient({
    myParticipantId: 'p_0001',
    sendSignal: () => {},
    isSecureContext: true,
    createPeerConnection: (cfg) => new MockRTCPeerConnection(cfg),
    getUserMedia: () => disposedDeferred.promise,
  });
  const togglePromise = client2.toggleMic();
  client2.dispose();
  disposedDeferred.resolve(createMockStream([lateTrack]));
  await togglePromise;
  assert.equal(lateTrack.stopped, true);

  // Pre-track peer mute/volume + TURN ICE server config via fetchIceServers
  const pcs: MockRTCPeerConnection[] = [];
  const audioTargets: Array<{ muted: boolean; volume: number }> = [];
  const client3 = new VoiceMeshClient({
    myParticipantId: 'p_0001',
    sendSignal: () => {},
    isSecureContext: true,
    fetchIceServers: async () => [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'turn:turn.example.com:3478', username: 'u', credential: 'p' },
    ],
    createPeerConnection: (cfg) => {
      const pc = new MockRTCPeerConnection(cfg);
      pcs.push(pc);
      return pc;
    },
    attachRemoteAudioElement: () => {
      const target = { muted: false, volume: 1 };
      audioTargets.push(target);
      return target;
    },
  });

  try {
    client3.syncPeers(['p_remote']);
    client3.setPeerMuted('p_remote', true);
    client3.setPeerVolume('p_remote', 0.25);

    // Wait for fetchIceServers to resolve and apply setConfiguration before offer
    await pcs[0].onnegotiationneeded?.();
    assert.ok(
      pcs[0].rtcConfig.iceServers?.some((s) => s.urls === 'turn:turn.example.com:3478')
    );

    pcs[0].emitTrack(createMockStream([createMockTrack('remote-premuted')]));
    assert.equal(audioTargets.length, 1);
    assert.equal(audioTargets[0].muted, true);
    assert.equal(audioTargets[0].volume, 0.25);
  } finally {
    client3.dispose();
  }
});

