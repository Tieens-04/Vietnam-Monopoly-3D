import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ChevronDown,
  Mic,
  MicOff,
  Radio,
  RefreshCw,
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
  popoverOpen?: boolean;
  onPopoverOpenChange?: (open: boolean) => void;
  onToggleMic: () => void;
  onSetInputMode: (mode: VoiceInputMode) => void;
  onSetPushToTalkPressed: (pressed: boolean) => void;
  onSetPeerMuted: (participantId: string, muted: boolean) => void;
  onSetPeerVolume: (participantId: string, volume: number) => void;
  onReconnectVoice?: () => void;
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
  popoverOpen: controlledPopoverOpen,
  onPopoverOpenChange,
  onToggleMic,
  onSetInputMode,
  onSetPushToTalkPressed,
  onSetPeerMuted,
  onSetPeerVolume,
  onReconnectVoice,
}) => {
  const [localPopoverOpen, setLocalPopoverOpen] = useState(false);
  const [stalledConnectionWarning, setStalledConnectionWarning] = useState(false);
  const isControlledPopover = controlledPopoverOpen !== undefined;
  const popoverOpen = isControlledPopover ? controlledPopoverOpen : localPopoverOpen;
  const popoverOpenRef = useRef(popoverOpen);
  popoverOpenRef.current = popoverOpen;
  const onPopoverOpenChangeRef = useRef(onPopoverOpenChange);
  onPopoverOpenChangeRef.current = onPopoverOpenChange;

  const setPopoverOpen = useCallback(
    (updater: boolean | ((prev: boolean) => boolean)) => {
      const next =
        typeof updater === 'function' ? updater(popoverOpenRef.current) : updater;
      if (!isControlledPopover) {
        setLocalPopoverOpen(next);
      }
      onPopoverOpenChangeRef.current?.(next);
    },
    [isControlledPopover]
  );

  const [popoverStyle, setPopoverStyle] = useState<React.CSSProperties>({});

  const containerRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
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
  }, [voiceState.permissionStatus, setPopoverOpen]);

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
      const hasExternalModal = Array.from(document.querySelectorAll('[aria-modal="true"]')).some(
        (modalEl) =>
          containerRef.current &&
          !containerRef.current.contains(modalEl) &&
          !modalEl.contains(containerRef.current)
      );
      if (hasExternalModal) return;
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
  }, [popoverOpen, setPopoverOpen]);

  useLayoutEffect(() => {
    if (!popoverOpen) return;

    const updatePlacement = () => {
      const container = containerRef.current;
      if (!container || typeof window === 'undefined') return;
      const rect = container.getBoundingClientRect();
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const margin = 8;

      if (compact) {
        const popoverWidth = Math.min(304, Math.max(220, vw - 84));
        const maxH = Math.max(140, Math.min(368, vh - margin * 2));
        const measuredH = Math.min(maxH, popoverRef.current?.scrollHeight || maxH);
        const hasMoreLeft = rect.left >= vw - rect.right;
        const rawLeft = hasMoreLeft ? rect.left - popoverWidth - 10 : rect.right + 10;
        const clampedLeft = Math.max(margin, Math.min(rawLeft, vw - popoverWidth - margin));
        const desiredTop = rect.top + rect.height / 2 - measuredH / 2;
        const clampedTop = Math.max(margin, Math.min(desiredTop, vh - measuredH - margin));

        setPopoverStyle({
          left: `${Math.round(clampedLeft - rect.left)}px`,
          top: `${Math.round(clampedTop - rect.top)}px`,
          width: `${Math.round(popoverWidth)}px`,
          maxHeight: `${Math.round(maxH)}px`,
        });
        return;
      }

      const popoverWidth = Math.min(304, Math.max(220, vw - margin * 2));
      const spaceBelow = vh - rect.bottom - margin - 8;
      const spaceAbove = rect.top - margin - 8;
      const openBelow = spaceBelow >= 220 || spaceBelow >= spaceAbove;
      const preferRightAlign = rect.left > vw / 2 || vw - rect.left < popoverWidth + margin;
      const rawLeft = preferRightAlign ? rect.right - popoverWidth : rect.left;
      const clampedLeft = Math.max(margin, Math.min(rawLeft, vw - popoverWidth - margin));

      if (openBelow) {
        const topViewport = rect.bottom + 8;
        const maxH = Math.max(140, Math.min(368, vh - topViewport - margin));
        setPopoverStyle({
          left: `${Math.round(clampedLeft - rect.left)}px`,
          top: `${Math.round(topViewport - rect.top)}px`,
          width: `${Math.round(popoverWidth)}px`,
          maxHeight: `${Math.round(maxH)}px`,
        });
      } else {
        const maxH = Math.max(140, Math.min(368, rect.top - margin - 8));
        setPopoverStyle({
          left: `${Math.round(clampedLeft - rect.left)}px`,
          bottom: `${Math.round(rect.height + 8)}px`,
          width: `${Math.round(popoverWidth)}px`,
          maxHeight: `${Math.round(maxH)}px`,
        });
      }
    };

    updatePlacement();
    window.addEventListener('resize', updatePlacement);
    return () => {
      window.removeEventListener('resize', updatePlacement);
    };
  }, [popoverOpen, compact, participants.length, voiceState.permissionStatus]);

  const remoteParticipants = useMemo(
    () => participants.filter((p) => p.participantId !== myParticipantId),
    [participants, myParticipantId]
  );

  const connectedRemotePeers = useMemo(
    () =>
      remoteParticipants
        .filter((p) => p.connected)
        .map((p) => voiceState.peers[p.participantId])
        .filter(Boolean),
    [remoteParticipants, voiceState.peers]
  );

  const hasFailedOrDisconnectedPeer = connectedRemotePeers.some(
    (peer) => peer.connectionState === 'failed' || peer.connectionState === 'disconnected'
  );
  const hasPendingPeer = connectedRemotePeers.some(
    (peer) => peer.connectionState === 'new' || peer.connectionState === 'connecting'
  );

  useEffect(() => {
    if (!hasPendingPeer || hasFailedOrDisconnectedPeer) {
      setStalledConnectionWarning(false);
      return;
    }
    const timer = window.setTimeout(() => {
      setStalledConnectionWarning(true);
    }, 7000);
    return () => {
      window.clearTimeout(timer);
    };
  }, [hasPendingPeer, hasFailedOrDisconnectedPeer]);

  const hasRtcConnectionIssue = hasFailedOrDisconnectedPeer || stalledConnectionWarning;

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
    ? 'ring-3 ring-emerald-400 shadow-[0_0_14px_rgba(16,185,129,0.75)]'
    : '';

  return (
    <div
      ref={containerRef}
      className={`relative pointer-events-auto ${
        compact ? 'inline-flex flex-col items-center' : 'inline-flex items-center'
      }`}
    >
      {compact ? (
        /* Unified Split Capsule Matching .bt-dock-shell */
        <div className="bt-dock-shell rounded-2xl p-1.5 flex flex-col items-center gap-1">
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
            className={`bt-utility-rail-btn relative z-10 h-11 w-11 rounded-xl flex items-center justify-center cursor-pointer select-none touch-none transition-all ${
              isMicActive ? 'bt-btn-green' : 'bt-float-circle-cyan'
            } ${speakingRingClass}`}
          >
            {isMicActive ? (
              <Mic className="h-5 w-5 stroke-[2.2]" aria-hidden="true" />
            ) : (
              <MicOff className="h-5 w-5 stroke-[2.2] text-[#525e73]" aria-hidden="true" />
            )}
            {isPttMode && (
              <span className="pointer-events-none absolute -bottom-1 -right-1 px-1 py-[0.5px] rounded-md bg-[#182232] border border-white text-[8px] font-black text-white leading-tight">
                V
              </span>
            )}
            {hasPermissionWarning && (
              <span
                aria-hidden="true"
                className="pointer-events-none absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-amber-400 border border-white"
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
            className={`relative h-7 w-11 px-1.5 rounded-lg text-[10px] font-extrabold flex items-center justify-center gap-0.5 cursor-pointer transition-colors ${
              popoverOpen ? 'bt-float-circle-active' : 'bg-[#efece4] hover:bg-[#e5e0d4] border border-[#d5cec0] text-[#141c2b]'
            }`}
          >
            <ChevronDown
              className={`h-3 w-3 transition-transform ${popoverOpen ? 'rotate-180' : ''}`}
              aria-hidden="true"
            />
            <span className="font-mono-num">{remoteParticipants.length}</span>
            {hasRtcConnectionIssue && (
              <span
                aria-hidden="true"
                className="pointer-events-none absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-rose-500 border border-white"
              />
            )}
          </button>
        </div>
      ) : (
        <div className="bt-segment-well inline-flex items-center gap-1 p-1 rounded-xl">
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
            className={`relative px-2.5 py-1.5 rounded-lg text-xs font-extrabold flex items-center gap-1.5 cursor-pointer select-none touch-none whitespace-nowrap transition-all ${
              isMicActive ? 'bt-btn-green' : 'bg-white border border-[#d5cec0] text-[#141c2b] hover:bg-[#faf8f3]'
            } ${speakingRingClass}`}
          >
            {isMicActive ? (
              <Mic className="h-3.5 w-3.5 shrink-0 stroke-[2.3]" aria-hidden="true" />
            ) : (
              <MicOff className="h-3.5 w-3.5 shrink-0 stroke-[2.3] text-[#525e73]" aria-hidden="true" />
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
            className={`relative h-8 px-2.5 rounded-lg text-xs font-extrabold flex items-center gap-1 cursor-pointer transition-colors ${
              popoverOpen
                ? 'bg-[#182232] text-white'
                : 'bg-white hover:bg-[#faf8f3] border border-[#d5cec0] text-[#141c2b]'
            }`}
          >
            <Radio className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span className="font-mono-num text-[11px]">{remoteParticipants.length}</span>
            <ChevronDown
              className={`h-3.5 w-3.5 shrink-0 transition-transform ${popoverOpen ? 'rotate-180' : ''}`}
              aria-hidden="true"
            />
            {hasRtcConnectionIssue && (
              <span
                aria-hidden="true"
                className="pointer-events-none absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-rose-500 border border-white"
              />
            )}
          </button>
        </div>
      )}

      {popoverOpen && (
        <div
          ref={popoverRef}
          data-testid="bt-voice-popover"
          role="dialog"
          aria-label="Cài đặt Thoại Nhóm"
          style={popoverStyle}
          className="absolute z-50 flex flex-col bt-casual-modal rounded-2xl overflow-hidden animate-pop-in pointer-events-auto"
        >
          <div className="shrink-0 bt-header-sky px-3.5 py-2 flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 min-w-0">
              <Mic className="h-4 w-4 text-amber-300 shrink-0" aria-hidden="true" />
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
              className="icon-hit-target h-6 w-6 rounded-full bg-white/15 hover:bg-white/25 text-white flex items-center justify-center cursor-pointer shrink-0"
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto slim-scroll p-3 space-y-2.5 text-xs">
            {permissionWarningBanner && (
              <div
                role="alert"
                data-testid="bt-voice-permission-warning"
                className={`p-2.5 rounded-xl border flex items-start gap-2 ${permissionWarningBanner.toneClass}`}
              >
                <AlertTriangle
                  className={`h-4 w-4 shrink-0 mt-0.5 ${permissionWarningBanner.iconClass}`}
                  aria-hidden="true"
                />
                <div className="min-w-0 space-y-0.5">
                  <div className="font-extrabold leading-snug">{permissionWarningBanner.title}</div>
                  <div className="text-[11px] font-medium leading-snug opacity-90">
                    {permissionWarningBanner.detail}
                  </div>
                </div>
              </div>
            )}

            {hasRtcConnectionIssue && (
              <div
                role="status"
                data-testid="bt-voice-connection-warning"
                className="p-2.5 rounded-xl border bg-amber-50 border-amber-300 text-amber-900 space-y-2"
              >
                <div className="flex items-start gap-2">
                  <AlertTriangle
                    className="h-4 w-4 shrink-0 mt-0.5 text-amber-600"
                    aria-hidden="true"
                  />
                  <div className="min-w-0 space-y-0.5">
                    <div className="font-extrabold leading-snug">
                      {voiceState.hasTurnServer
                        ? 'Kết nối thoại P2P đang bị chập chờn'
                        : 'Chưa nối được thoại qua mạng khác / 4G'}
                    </div>
                    <div className="text-[11px] font-medium leading-snug opacity-90">
                      {voiceState.hasTurnServer
                        ? 'Mạng hiện tại có thể đang chặn UDP hoặc đổi IP. Hãy thử nối lại thoại.'
                        : 'Máy chủ chưa cấu hình TURN relay (TURN_URLS / METERED_* / CF_TURN_*). Nếu khác Wi-Fi hoặc dùng 4G, người khác sẽ không nghe được.'}
                    </div>
                  </div>
                </div>
                {onReconnectVoice && (
                  <button
                    type="button"
                    data-testid="bt-voice-reconnect-btn"
                    onClick={onReconnectVoice}
                    className="w-full py-1.5 px-2.5 rounded-lg bg-white hover:bg-amber-100/70 border border-amber-300 text-[11px] font-extrabold text-amber-900 flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
                  >
                    <RefreshCw className="h-3 w-3 shrink-0" aria-hidden="true" />
                    <span>Thử nối lại thoại</span>
                  </button>
                )}
              </div>
            )}

            {/* Input Mode Switcher */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between px-0.5">
                <span className="font-extrabold text-[#141c2b]">Chế độ Micro</span>
                <span
                  className={`text-[10px] font-extrabold uppercase px-2 py-0.5 rounded-md ${
                    isMicActive
                      ? 'bg-emerald-50 border border-emerald-200 text-emerald-700'
                      : 'bg-[#eae4d6] text-[#525e73]'
                  }`}
                >
                  {isMicActive ? 'Đang phát' : 'Đang tắt'}
                </span>
              </div>
              <div className="bt-segment-well grid grid-cols-2 gap-1 p-1 rounded-xl">
                <button
                  type="button"
                  data-testid="bt-voice-mode-open"
                  aria-pressed={voiceState.inputMode === 'open_mic'}
                  onClick={() => onSetInputMode('open_mic')}
                  className={`py-1.5 px-2 rounded-lg text-[11px] font-extrabold uppercase transition-all cursor-pointer text-center leading-tight ${
                    voiceState.inputMode === 'open_mic'
                      ? 'bt-segment-active-light'
                      : 'text-[#4b566a] hover:bg-white/60'
                  }`}
                >
                  Mở Mic (Open)
                </button>
                <button
                  type="button"
                  data-testid="bt-voice-mode-ptt"
                  aria-pressed={voiceState.inputMode === 'push_to_talk'}
                  onClick={() => onSetInputMode('push_to_talk')}
                  className={`py-1.5 px-2 rounded-lg text-[11px] font-extrabold uppercase transition-all cursor-pointer text-center leading-tight ${
                    voiceState.inputMode === 'push_to_talk'
                      ? 'bt-segment-active-light ring-1 ring-emerald-500/60 text-emerald-800'
                      : 'text-[#4b566a] hover:bg-white/60'
                  }`}
                >
                  Giữ Phím V
                </button>
              </div>
              <p className="text-[10.5px] font-medium text-[#64748b] px-0.5 leading-snug">
                {voiceState.inputMode === 'push_to_talk'
                  ? 'Nhấn giữ nút Mic hoặc giữ phím V để nói.'
                  : 'Nhấn nút Mic để bật hoặc tắt nhanh.'}
              </p>
            </div>

            {/* Remote Participants Audio Controls */}
            <div className="pt-2 border-t border-[#e2dcd0] space-y-1.5">
              <div className="flex items-center justify-between px-0.5">
                <span className="font-extrabold text-[#141c2b]">
                  Thành viên ({remoteParticipants.length})
                </span>
                <span className="text-[10px] font-semibold text-[#64748b]">Âm lượng</span>
              </div>

              {remoteParticipants.length === 0 ? (
                <div className="p-2.5 rounded-xl bg-white border border-[#ded8ca] text-[11px] font-medium text-[#64748b] text-center">
                  Chưa có bạn bè khác trong phòng.
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
                            : 'bg-white border-[#ded8ca]'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <span
                              aria-hidden="true"
                              className={`h-2 w-2 rounded-full shrink-0 ${
                                isSpeaking
                                  ? 'bg-emerald-500 ring-2 ring-emerald-200'
                                  : !participant.connected
                                    ? 'bg-rose-400'
                                    : participant.micEnabled
                                      ? 'bg-emerald-500'
                                      : 'bg-slate-300'
                              }`}
                            />
                            <span className="font-extrabold text-[#141c2b] truncate">
                              {participant.playerName}
                            </span>
                            {participant.role === 'spectator' && (
                              <span className="px-1.5 py-0.5 rounded-md bg-[#eae4d6] text-[#475569] text-[9px] font-bold uppercase shrink-0">
                                Khán giả
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-1.5 shrink-0">
                            <span
                              className={`text-[10px] font-bold ${
                                !participant.connected
                                  ? 'text-rose-600'
                                  : participant.micEnabled
                                    ? 'text-emerald-700'
                                    : 'text-[#788497]'
                              }`}
                            >
                              {!participant.connected
                                ? 'Mất mạng'
                                : participant.micEnabled
                                  ? 'Mic bật'
                                  : 'Mic tắt'}
                            </span>
                            {peer && (
                              <span className="text-[9px] font-medium text-[#788497]">
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
                            className={`h-7 px-2 rounded-lg border text-[10px] font-extrabold flex items-center gap-1 shrink-0 cursor-pointer transition-colors ${
                              mutedLocally
                                ? 'bg-rose-50 border-rose-200 text-rose-700'
                                : 'bg-[#faf8f3] border-[#d5cec0] text-[#141c2b] hover:bg-[#efece4]'
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
                              mutedLocally ? 'accent-slate-400 opacity-60' : 'accent-[#182232]'
                            }`}
                          />

                          <span className="font-mono-num text-[10px] font-bold text-[#334155] w-8 text-right shrink-0">
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
