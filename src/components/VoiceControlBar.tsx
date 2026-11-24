import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ChevronDown,
  Mic,
  MicOff,
  Radio,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import type { RoomParticipantSummary } from '../game/onlineTypes';
import type { VoiceInputMode, VoiceMeshSnapshot } from '../utils/voiceMeshClient';

export interface VoiceControlBarProps {
  voiceState: VoiceMeshSnapshot;
  participants: RoomParticipantSummary[];
  myParticipantId: string | null;
  compact?: boolean;
  onToggleMic: () => void;
  onSetInputMode: (mode: VoiceInputMode) => void;
  onSetPushToTalkPressed: (pressed: boolean) => void;
  onSetPeerMuted: (participantId: string, muted: boolean) => void;
  onSetPeerVolume: (participantId: string, volume: number) => void;
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!target || typeof target !== 'object') return false;
  const el = target as Partial<HTMLElement>;
  const tag = typeof el.tagName === 'string' ? el.tagName.toUpperCase() : '';
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
    return true;
  }
  if (el.isContentEditable === true) {
    return true;
  }
  if (typeof el.closest === 'function') {
    return Boolean(
      el.closest('[contenteditable=""], [contenteditable="true"], [contenteditable="plaintext-only"]')
    );
  }
  return false;
}

function isKeyVEvent(event: KeyboardEvent): boolean {
  if (event.code === 'KeyV') return true;
  return !event.code && typeof event.key === 'string' && event.key.toLowerCase() === 'v';
}

function clampVolume01(volume: number): number {
  if (!Number.isFinite(volume)) return 1;
  return Math.min(1, Math.max(0, volume));
}

function formatRtcStateLabel(state: RTCPeerConnectionState | 'new' | undefined): string {
  switch (state) {
    case 'connected':
      return 'Đã kết nối';
    case 'connecting':
      return 'Đang nối...';
    case 'disconnected':
    case 'failed':
      return 'Chập chờn';
    case 'closed':
      return 'Đã đóng';
    default:
      return 'Sẵn sàng';
  }
}

export const VoiceControlBar: React.FC<VoiceControlBarProps> = ({
  voiceState,
  participants,
  myParticipantId,
  compact = false,
  onToggleMic,
  onSetInputMode,
  onSetPushToTalkPressed,
  onSetPeerMuted,
  onSetPeerVolume,
}) => {
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [popoverPositionClass, setPopoverPositionClass] = useState<string>(
    compact ? 'right-full mr-2.5 top-1/2 -translate-y-1/2' : 'top-full mt-2 right-0'
  );

  const containerRef = useRef<HTMLDivElement>(null);
  const popoverBtnRef = useRef<HTMLButtonElement>(null);
  const keyboardPttActiveRef = useRef(false);
  const pointerPttActiveRef = useRef(false);
  const prevPermissionStatusRef = useRef(voiceState.permissionStatus);

  const onSetPushToTalkPressedRef = useRef(onSetPushToTalkPressed);
  onSetPushToTalkPressedRef.current = onSetPushToTalkPressed;
  const pttPressedPropRef = useRef(voiceState.pttPressed);
  pttPressedPropRef.current = voiceState.pttPressed;

  const releaseAllPtt = useCallback(() => {
    const hadActive =
      keyboardPttActiveRef.current || pointerPttActiveRef.current || pttPressedPropRef.current;
    keyboardPttActiveRef.current = false;
    pointerPttActiveRef.current = false;
    if (hadActive) {
      onSetPushToTalkPressedRef.current(false);
    }
  }, []);

  // Auto-open popover if a mic permission/environment issue just occurred after user interaction
  useEffect(() => {
    const prev = prevPermissionStatusRef.current;
    const next = voiceState.permissionStatus;
    prevPermissionStatusRef.current = next;
    if (
      prev !== next &&
      (next === 'denied' || next === 'insecure_context' || next === 'unsupported')
    ) {
      setPopoverOpen(true);
    }
  }, [voiceState.permissionStatus]);

  // Keyboard Push-to-Talk (KeyV) + safe release on mode change, blur, visibility loss, or unmount
  useEffect(() => {
    if (voiceState.inputMode !== 'push_to_talk') {
      releaseAllPtt();
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (!isKeyVEvent(event)) return;
      if (event.repeat) return;
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      const activeElement = typeof document !== 'undefined' ? document.activeElement : null;
      if (isEditableTarget(event.target) || isEditableTarget(activeElement)) {
        return;
      }
      if (keyboardPttActiveRef.current) return;

      keyboardPttActiveRef.current = true;
      if (!pointerPttActiveRef.current) {
        onSetPushToTalkPressedRef.current(true);
      }
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      if (!isKeyVEvent(event)) return;
      if (!keyboardPttActiveRef.current) return;

      keyboardPttActiveRef.current = false;
      if (!pointerPttActiveRef.current) {
        onSetPushToTalkPressedRef.current(false);
      }
    };

    const handleWindowBlur = () => {
      releaseAllPtt();
    };

    const handleWindowPointerRelease = () => {
      if (!pointerPttActiveRef.current) return;
      pointerPttActiveRef.current = false;
      if (!keyboardPttActiveRef.current) {
        onSetPushToTalkPressedRef.current(false);
      }
    };

    const handleVisibilityChange = () => {
      if (typeof document !== 'undefined' && document.hidden) {
        releaseAllPtt();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', handleWindowBlur);
    window.addEventListener('pointerup', handleWindowPointerRelease);
    window.addEventListener('pointercancel', handleWindowPointerRelease);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', handleWindowBlur);
      window.removeEventListener('pointerup', handleWindowPointerRelease);
      window.removeEventListener('pointercancel', handleWindowPointerRelease);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      releaseAllPtt();
    };
  }, [voiceState.inputMode, releaseAllPtt]);

  // Outside pointerdown & Escape close handler for the popover
  useEffect(() => {
    if (!popoverOpen) return;

    const handleOutsidePointerDown = (event: PointerEvent) => {
      const container = containerRef.current;
      if (!container) return;
      if (event.target instanceof Node && !container.contains(event.target)) {
        setPopoverOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' && event.code !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      setPopoverOpen(false);
      popoverBtnRef.current?.focus();
    };

    document.addEventListener('pointerdown', handleOutsidePointerDown);
    window.addEventListener('keydown', handleEscape, { capture: true });

    return () => {
      document.removeEventListener('pointerdown', handleOutsidePointerDown);
      window.removeEventListener('keydown', handleEscape, { capture: true });
    };
  }, [popoverOpen]);

  // Smart quadrant placement so the popover stays inside viewport in both ActionDock & Lobby
  useLayoutEffect(() => {
    if (!popoverOpen) return;

    const updatePlacement = () => {
      const container = containerRef.current;
      if (!container || typeof window === 'undefined') return;
      const rect = container.getBoundingClientRect();

      if (compact) {
        const horiz =
          rect.left >= window.innerWidth - rect.right
            ? 'right-full mr-2.5'
            : 'left-full ml-2.5';
        const vert =
          rect.top < 150
            ? 'top-0'
            : window.innerHeight - rect.bottom < 150
              ? 'bottom-0'
              : 'top-1/2 -translate-y-1/2';
        setPopoverPositionClass(`${horiz} ${vert}`);
        return;
      }

      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;
      const vert = spaceBelow >= 270 || spaceBelow >= spaceAbove ? 'top-full mt-2' : 'bottom-full mb-2';
      const horiz =
        rect.right >= 300 && (rect.left > window.innerWidth / 2 || window.innerWidth - rect.left < 300)
          ? 'right-0'
          : 'left-0';
      setPopoverPositionClass(`${vert} ${horiz}`);
    };

    updatePlacement();
    window.addEventListener('resize', updatePlacement);
    return () => {
      window.removeEventListener('resize', updatePlacement);
    };
  }, [popoverOpen, compact]);

  const remoteParticipants = useMemo(
    () => participants.filter((p) => p.participantId !== myParticipantId),
    [participants, myParticipantId]
  );

  const isPttMode = voiceState.inputMode === 'push_to_talk';
  const isMicActive = voiceState.micEnabled || (isPttMode && voiceState.pttPressed);
  const hasPermissionWarning =
    voiceState.permissionStatus === 'insecure_context' ||
    voiceState.permissionStatus === 'denied' ||
    voiceState.permissionStatus === 'unsupported';

  const handleMicClick = (event: React.MouseEvent<HTMLButtonElement>) => {
    if (event.detail > 0) {
      event.currentTarget.blur();
    }
    if (voiceState.inputMode === 'open_mic') {
      onToggleMic();
      if (hasPermissionWarning) {
        setPopoverOpen(true);
      }
    }
  };

  const handleMicPointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
    if (voiceState.inputMode !== 'push_to_talk') return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    pointerPttActiveRef.current = true;
    if (!keyboardPttActiveRef.current) {
      onSetPushToTalkPressedRef.current(true);
    }
    if (hasPermissionWarning) {
      setPopoverOpen(true);
    }
  };

  const handleMicPointerRelease = () => {
    if (!pointerPttActiveRef.current) return;
    pointerPttActiveRef.current = false;
    if (!keyboardPttActiveRef.current) {
      onSetPushToTalkPressedRef.current(false);
    }
  };

  const micButtonAriaLabel = isPttMode
    ? isMicActive
      ? 'Đang truyền giọng nói (Nhả để tắt)'
      : 'Giữ để nói hoặc nhấn giữ phím V'
    : voiceState.micEnabled
      ? 'Tắt Micro'
      : 'Bật Micro';

  const micButtonTitle = isPttMode
    ? 'Giữ để nói [Phím V]'
    : voiceState.micEnabled
      ? 'Nhấn để tắt Micro'
      : 'Nhấn để bật Micro';

  const permissionWarningBanner = (() => {
    if (voiceState.permissionStatus === 'insecure_context') {
      return {
        toneClass: 'bg-amber-50 border-amber-300 text-amber-900',
        iconClass: 'text-amber-600',
        title: 'Cần HTTPS hoặc localhost để bật Micro',
        detail: 'Bạn vẫn có thể nghe âm thanh từ mọi người trong phòng.',
      };
    }
    if (voiceState.permissionStatus === 'denied') {
      return {
        toneClass: 'bg-rose-50 border-rose-300 text-rose-800',
        iconClass: 'text-rose-600',
        title: 'Trình duyệt đang chặn quyền Micro',
        detail: 'Hãy cấp lại quyền Micro trên thanh địa chỉ rồi thử bật lại.',
      };
    }
    if (voiceState.permissionStatus === 'unsupported') {
      return {
        toneClass: 'bg-amber-50 border-amber-300 text-amber-900',
        iconClass: 'text-amber-600',
        title: 'Thiết bị hoặc trình duyệt không hỗ trợ Micro',
        detail: 'Bạn vẫn có thể nghe cả phòng ở chế độ chỉ nghe.',
      };
    }
    return null;
  })();

  const speakingRingClass = voiceState.localSpeaking
    ? 'ring-4 ring-emerald-300/90 shadow-[0_0_16px_rgba(52,211,153,0.85)]'
    : '';

  return (
    <div
      ref={containerRef}
      className={`relative pointer-events-auto ${
        compact ? 'inline-flex flex-col items-center gap-1' : 'inline-flex items-center'
      }`}
    >
      {compact ? (
        <>
          <button
            type="button"
            data-testid="bt-voice-mic-btn"
            data-voice-mode={voiceState.inputMode}
            data-mic-enabled={String(voiceState.micEnabled)}
            aria-pressed={isMicActive}
            aria-label={micButtonAriaLabel}
            title={micButtonTitle}
            onClick={handleMicClick}
            onPointerDown={handleMicPointerDown}
            onPointerUp={handleMicPointerRelease}
            onPointerCancel={handleMicPointerRelease}
            onPointerLeave={handleMicPointerRelease}
            className={`bt-utility-rail-btn relative z-10 h-11 w-11 sm:h-13 sm:w-13 rounded-full flex items-center justify-center cursor-pointer select-none touch-none transition-all ${
              isMicActive ? 'bt-btn-green' : 'bt-btn-white text-slate-700'
            } ${speakingRingClass}`}
          >
            {isMicActive ? (
              <Mic className="h-5 w-5 sm:h-6 sm:w-6 stroke-[2.3]" aria-hidden="true" />
            ) : (
              <MicOff className="h-5 w-5 sm:h-6 sm:w-6 stroke-[2.3]" aria-hidden="true" />
            )}
            {isPttMode && (
              <span className="pointer-events-none absolute -bottom-1 -right-1 px-1 py-[0.5px] rounded-full bg-sky-600 border border-white text-[8px] font-black text-white leading-tight">
                V
              </span>
            )}
            {hasPermissionWarning && (
              <span
                aria-hidden="true"
                className="pointer-events-none absolute -top-0.5 -right-0.5 h-3 w-3 rounded-full bg-amber-400 border-2 border-white"
              />
            )}
          </button>

          <button
            ref={popoverBtnRef}
            type="button"
            data-testid="bt-voice-popover-btn"
            aria-expanded={popoverOpen}
            aria-haspopup="dialog"
            aria-label="Cài đặt thoại nhóm và âm lượng thành viên"
            title="Cài đặt thoại & Thành viên"
            onClick={(e) => {
              if (e.detail > 0) e.currentTarget.blur();
              setPopoverOpen((prev) => !prev);
            }}
            className={`min-h-[28px] min-w-[44px] px-2 py-0.5 rounded-full text-[10px] font-black flex items-center justify-center gap-0.5 cursor-pointer transition-colors ${
              popoverOpen ? 'bt-btn-cyan' : 'bt-btn-white text-sky-900'
            }`}
          >
            <ChevronDown
              className={`h-3 w-3 transition-transform ${popoverOpen ? 'rotate-180' : ''}`}
              aria-hidden="true"
            />
            <span className="font-mono-num">{remoteParticipants.length}</span>
          </button>
        </>
      ) : (
        <div className="inline-flex items-center gap-1 p-1 rounded-full bg-white/95 border-2 border-sky-200 shadow-xs">
          <button
            type="button"
            data-testid="bt-voice-mic-btn"
            data-voice-mode={voiceState.inputMode}
            data-mic-enabled={String(voiceState.micEnabled)}
            aria-pressed={isMicActive}
            aria-label={micButtonAriaLabel}
            title={micButtonTitle}
            onClick={handleMicClick}
            onPointerDown={handleMicPointerDown}
            onPointerUp={handleMicPointerRelease}
            onPointerCancel={handleMicPointerRelease}
            onPointerLeave={handleMicPointerRelease}
            className={`relative px-3 py-1.5 rounded-full text-xs font-black flex items-center gap-1.5 cursor-pointer select-none touch-none whitespace-nowrap transition-all ${
              isMicActive ? 'bt-btn-green' : 'bt-btn-white text-slate-700'
            } ${speakingRingClass}`}
          >
            {isMicActive ? (
              <Mic className="h-3.5 w-3.5 shrink-0 stroke-[2.4]" aria-hidden="true" />
            ) : (
              <MicOff className="h-3.5 w-3.5 shrink-0 stroke-[2.4]" aria-hidden="true" />
            )}
            <span>
              {isPttMode
                ? isMicActive
                  ? 'Đang nói (V)'
                  : 'Giữ V để nói'
                : voiceState.micEnabled
                  ? 'Mic Đang Bật'
                  : 'Mic Đang Tắt'}
            </span>
            {hasPermissionWarning && (
              <span
                aria-hidden="true"
                className="h-2.5 w-2.5 rounded-full bg-amber-400 border border-white shrink-0"
              />
            )}
          </button>

          <button
            ref={popoverBtnRef}
            type="button"
            data-testid="bt-voice-popover-btn"
            aria-expanded={popoverOpen}
            aria-haspopup="dialog"
            aria-label="Cài đặt thoại nhóm và âm lượng thành viên"
            title="Cài đặt thoại & Thành viên"
            onClick={(e) => {
              if (e.detail > 0) e.currentTarget.blur();
              setPopoverOpen((prev) => !prev);
            }}
            className={`h-8 px-2.5 rounded-full text-xs font-black flex items-center gap-1 cursor-pointer transition-colors ${
              popoverOpen ? 'bt-btn-cyan' : 'bg-sky-50 hover:bg-sky-100 border border-sky-200 text-sky-900'
            }`}
          >
            <Radio className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span className="font-mono-num text-[11px]">{remoteParticipants.length}</span>
            <ChevronDown
              className={`h-3.5 w-3.5 shrink-0 transition-transform ${popoverOpen ? 'rotate-180' : ''}`}
              aria-hidden="true"
            />
          </button>
        </div>
      )}

      {popoverOpen && (
        <div
          data-testid="bt-voice-popover"
          role="dialog"
          aria-label="Cài đặt Thoại Nhóm"
          className={`absolute ${popoverPositionClass} z-50 w-72 sm:w-76 ${
            compact ? 'max-w-[calc(100vw-5.25rem)]' : 'max-w-[calc(100vw-1.75rem)]'
          } max-h-[min(23rem,calc(100dvh-5rem))] flex flex-col bt-casual-modal rounded-2xl overflow-hidden animate-pop-in pointer-events-auto`}
        >
          <div className="shrink-0 bt-header-sky px-3.5 py-2 flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 min-w-0">
              <Mic className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span className="font-display text-xs font-black uppercase tracking-wide truncate">
                Thoại Nhóm (Voice)
              </span>
            </div>
            <button
              type="button"
              onClick={() => {
                setPopoverOpen(false);
                popoverBtnRef.current?.focus();
              }}
              aria-label="Đóng bảng thoại nhóm"
              className="icon-hit-target h-6 w-6 rounded-full bg-white/25 hover:bg-white/40 text-white text-xs font-bold flex items-center justify-center cursor-pointer shrink-0"
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto slim-scroll p-3 space-y-2.5 text-xs">
            {permissionWarningBanner && (
              <div
                role="alert"
                data-testid="bt-voice-permission-warning"
                className={`p-2.5 rounded-xl border-2 flex items-start gap-2 ${permissionWarningBanner.toneClass}`}
              >
                <AlertTriangle
                  className={`h-4 w-4 shrink-0 mt-0.5 ${permissionWarningBanner.iconClass}`}
                  aria-hidden="true"
                />
                <div className="min-w-0 space-y-0.5">
                  <div className="font-black leading-snug">{permissionWarningBanner.title}</div>
                  <div className="text-[11px] font-semibold leading-snug opacity-90">
                    {permissionWarningBanner.detail}
                  </div>
                </div>
              </div>
            )}

            {/* Input Mode Switcher */}
            <div className="space-y-1">
              <div className="flex items-center justify-between px-0.5">
                <span className="font-extrabold text-slate-700">Chế độ Micro</span>
                <span
                  className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full ${
                    isMicActive
                      ? 'bg-emerald-100 text-emerald-700'
                      : 'bg-slate-200 text-slate-600'
                  }`}
                >
                  {isMicActive ? 'Đang phát' : 'Đang tắt'}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-1.5 p-1 rounded-2xl bg-sky-100 border border-sky-200">
                <button
                  type="button"
                  data-testid="bt-voice-mode-open"
                  aria-pressed={voiceState.inputMode === 'open_mic'}
                  onClick={() => onSetInputMode('open_mic')}
                  className={`py-1.5 px-2 rounded-xl text-[11px] font-black uppercase transition-all cursor-pointer text-center leading-tight ${
                    voiceState.inputMode === 'open_mic'
                      ? 'bt-btn-cyan'
                      : 'text-sky-900 hover:bg-white/60'
                  }`}
                >
                  Mở Mic (Open)
                </button>
                <button
                  type="button"
                  data-testid="bt-voice-mode-ptt"
                  aria-pressed={voiceState.inputMode === 'push_to_talk'}
                  onClick={() => onSetInputMode('push_to_talk')}
                  className={`py-1.5 px-2 rounded-xl text-[11px] font-black uppercase transition-all cursor-pointer text-center leading-tight ${
                    voiceState.inputMode === 'push_to_talk'
                      ? 'bt-btn-green'
                      : 'text-sky-900 hover:bg-white/60'
                  }`}
                >
                  Giữ Phím V
                </button>
              </div>
              <p className="text-[11px] font-semibold text-slate-500 px-0.5 leading-snug">
                {voiceState.inputMode === 'push_to_talk'
                  ? 'Nhấn giữ nút Mic hoặc giữ phím V khi không gõ chữ để nói.'
                  : 'Nhấn 1 lần nút Mic để bật hoặc tắt Micro. Mặc định tắt khi vào phòng.'}
              </p>
            </div>

            {/* Remote Participants Audio Controls */}
            <div className="pt-1 border-t border-sky-200 space-y-1.5">
              <div className="flex items-center justify-between px-0.5">
                <span className="font-extrabold text-slate-700">
                  Thành viên khác ({remoteParticipants.length})
                </span>
                <span className="text-[10px] font-bold text-sky-700">Âm lượng cục bộ</span>
              </div>

              {remoteParticipants.length === 0 ? (
                <div className="p-2.5 rounded-xl bg-sky-50 border border-sky-200 text-[11px] font-semibold text-slate-600 text-center">
                  Chưa có bạn bè khác trong phòng để điều chỉnh âm thanh.
                </div>
              ) : (
                <div className="space-y-1.5">
                  {remoteParticipants.map((participant) => {
                    const peer = voiceState.peers[participant.participantId];
                    const mutedLocally = peer?.mutedLocally ?? false;
                    const isSpeaking = Boolean(peer?.isSpeaking && !mutedLocally);
                    const volumePercent = Math.round(clampVolume01(peer?.volume ?? 1) * 100);

                    return (
                      <div
                        key={participant.participantId}
                        data-testid={`bt-voice-peer-row-${participant.participantId}`}
                        className={`p-2 rounded-xl border transition-colors space-y-1.5 ${
                          isSpeaking
                            ? 'bg-emerald-50/90 border-emerald-300'
                            : 'bg-sky-50/90 border-sky-200'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span
                              aria-hidden="true"
                              className={`h-2.5 w-2.5 rounded-full shrink-0 ${
                                isSpeaking
                                  ? 'bg-emerald-500 ring-2 ring-emerald-300'
                                  : !participant.connected
                                    ? 'bg-rose-400'
                                    : participant.micEnabled
                                      ? 'bg-sky-500'
                                      : 'bg-slate-300'
                              }`}
                            />
                            <span className="font-extrabold text-slate-900 truncate">
                              {participant.playerName}
                            </span>
                            {participant.role === 'spectator' && (
                              <span className="px-1.5 py-0.5 rounded-full bg-slate-200 text-slate-700 text-[9px] font-black uppercase shrink-0">
                                Khán giả
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            <span
                              className={`text-[10px] font-extrabold ${
                                !participant.connected
                                  ? 'text-rose-600'
                                  : participant.micEnabled
                                    ? 'text-emerald-700'
                                    : 'text-slate-500'
                              }`}
                            >
                              {!participant.connected
                                ? 'Mất mạng'
                                : participant.micEnabled
                                  ? 'Mic bật'
                                  : 'Mic tắt'}
                            </span>
                            {peer && (
                              <span className="text-[9px] font-bold text-slate-400 hidden sm:inline">
                                · {formatRtcStateLabel(peer.connectionState)}
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            data-testid={`bt-voice-peer-mute-${participant.participantId}`}
                            aria-pressed={mutedLocally}
                            aria-label={
                              mutedLocally
                                ? `Bỏ tắt tiếng ${participant.playerName}`
                                : `Tắt tiếng ${participant.playerName}`
                            }
                            onClick={() =>
                              onSetPeerMuted(participant.participantId, !mutedLocally)
                            }
                            className={`h-7 px-2 rounded-lg border text-[10px] font-black flex items-center gap-1 shrink-0 cursor-pointer transition-colors ${
                              mutedLocally
                                ? 'bg-rose-100 border-rose-300 text-rose-700'
                                : 'bg-white border-sky-200 text-sky-900 hover:bg-sky-100'
                            }`}
                          >
                            {mutedLocally ? (
                              <VolumeX className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                            ) : (
                              <Volume2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                            )}
                            <span>{mutedLocally ? 'Đã tắt' : 'Nghe'}</span>
                          </button>

                          <input
                            type="range"
                            min={0}
                            max={100}
                            step={1}
                            value={volumePercent}
                            data-testid={`bt-voice-peer-volume-${participant.participantId}`}
                            aria-label={`Âm lượng của ${participant.playerName}`}
                            onChange={(e) =>
                              onSetPeerVolume(
                                participant.participantId,
                                clampVolume01(Number(e.target.value) / 100)
                              )
                            }
                            className={`flex-1 min-w-0 h-1.5 rounded-full cursor-pointer ${
                              mutedLocally ? 'accent-slate-400 opacity-60' : 'accent-[#0284C7]'
                            }`}
                          />

                          <span className="font-mono-num text-[10px] font-black text-slate-700 w-8 text-right shrink-0">
                            {volumePercent}%
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
