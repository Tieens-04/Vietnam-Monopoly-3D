import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { MessageCircle, Send, Users, X } from 'lucide-react';
import type { ChatChannel, RoomChatMessage } from '../game/onlineTypes';

export interface OnlineChatDrawerProps {
  variant: 'drawer' | 'embedded';
  open?: boolean;
  onClose?: () => void;
  messages: RoomChatMessage[];
  myParticipantId: string | null;
  canUseTeamChannel: boolean;
  onSendMessage: (channel: ChatChannel, text: string) => void;
}

const MAX_CHAT_LENGTH = 160;

const QUICK_CHAT_PHRASES: readonly string[] = [
  'Đổ lớn đi bạn ơi!',
  'Đừng vào đất mình nha 😅',
  'Thương lượng đi!',
  'Chúc mừng đại gia!',
  'Cứu bồ đồng đội ơi!',
];

function formatChatTime(timestamp: number): string {
  if (!Number.isFinite(timestamp)) return '';
  const date = new Date(timestamp);
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

export const OnlineChatDrawer: React.FC<OnlineChatDrawerProps> = ({
  variant,
  open = true,
  onClose,
  messages,
  myParticipantId,
  canUseTeamChannel,
  onSendMessage,
}) => {
  const [activeChannel, setActiveChannel] = useState<ChatChannel>('ALL');
  const [draft, setDraft] = useState<string>('');

  const panelRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const stickToBottomRef = useRef<boolean>(true);
  const prevVisibleCountRef = useRef<number>(0);
  const prevLastMessageIdRef = useRef<number | null>(null);

  const isDrawer = variant === 'drawer';
  const isOpen = !isDrawer || open !== false;

  // Reset active tab back to ALL immediately if team channel access is lost (e.g., mode changed to FFA)
  useEffect(() => {
    if (!canUseTeamChannel && activeChannel !== 'ALL') {
      setActiveChannel('ALL');
    }
  }, [canUseTeamChannel, activeChannel]);

  const effectiveChannel: ChatChannel = canUseTeamChannel ? activeChannel : 'ALL';

  const visibleMessages = useMemo(() => {
    const safeMessages = canUseTeamChannel
      ? messages
      : messages.filter((msg) => msg.channel !== 'TEAM');
    if (effectiveChannel === 'TEAM') {
      return safeMessages.filter((msg) => msg.channel === 'TEAM');
    }
    return safeMessages;
  }, [messages, effectiveChannel, canUseTeamChannel]);

  // Close drawer on Escape (document capture runs before App.tsx window bubble Pause shortcut)
  useEffect(() => {
    if (!isDrawer || !isOpen || !onClose) return;

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' && event.code !== 'Escape') return;
      const hasExternalModal = Array.from(document.querySelectorAll('[aria-modal="true"]')).some(
        (modalEl) =>
          panelRef.current &&
          !panelRef.current.contains(modalEl) &&
          !modalEl.contains(panelRef.current)
      );
      if (hasExternalModal) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      onClose();
    };

    document.addEventListener('keydown', handleEscape, { capture: true });
    return () => {
      document.removeEventListener('keydown', handleEscape, { capture: true });
    };
  }, [isDrawer, isOpen, onClose]);

  // Reset scroll stickiness when opening or switching channels
  useLayoutEffect(() => {
    if (!isOpen) return;
    stickToBottomRef.current = true;
    const list = listRef.current;
    if (list) {
      list.scrollTop = list.scrollHeight;
    }
    prevVisibleCountRef.current = visibleMessages.length;
    prevLastMessageIdRef.current = visibleMessages[visibleMessages.length - 1]?.id ?? null;
  }, [isOpen, effectiveChannel]);

  // Auto-scroll to newest message when messages arrive (including when capped at 60/30 history limit)
  useLayoutEffect(() => {
    if (!isOpen) return;
    const list = listRef.current;
    if (!list) return;

    const newest = visibleMessages[visibleMessages.length - 1];
    const lastMessageId = newest ? newest.id : null;
    const isOwnNewest =
      Boolean(newest) && myParticipantId !== null && newest.participantId === myParticipantId;
    const hasNewMessage =
      visibleMessages.length !== prevVisibleCountRef.current ||
      lastMessageId !== prevLastMessageIdRef.current;
    prevVisibleCountRef.current = visibleMessages.length;
    prevLastMessageIdRef.current = lastMessageId;

    if (hasNewMessage && (stickToBottomRef.current || isOwnNewest)) {
      list.scrollTop = list.scrollHeight;
    }
  }, [visibleMessages, isOpen, myParticipantId]);

  if (!isOpen) {
    return null;
  }

  const handleListScroll = () => {
    const list = listRef.current;
    if (!list) return;
    const distanceFromBottom = list.scrollHeight - list.scrollTop - list.clientHeight;
    stickToBottomRef.current = distanceFromBottom <= 80;
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = draft.trim().slice(0, MAX_CHAT_LENGTH);
    if (!trimmed) return;
    stickToBottomRef.current = true;
    onSendMessage(effectiveChannel, trimmed);
    setDraft('');
  };

  const handleQuickPhrase = (phrase: string) => {
    const clean = phrase.trim().slice(0, MAX_CHAT_LENGTH);
    if (!clean) return;
    stickToBottomRef.current = true;
    onSendMessage(effectiveChannel, clean);
  };

  const containerClass = isDrawer
    ? 'fixed right-16 sm:right-20 top-1/2 -translate-y-1/2 z-30 w-[min(360px,calc(100vw-5.25rem))] h-[min(460px,calc(100dvh-1.5rem))] flex flex-col bt-casual-modal rounded-2xl overflow-hidden animate-pop-in pointer-events-auto'
    : 'w-full h-full min-h-[240px] max-h-[320px] flex flex-col rounded-2xl bg-sky-50/90 border-2 border-sky-200 overflow-hidden shadow-xs';

  const headerClass = isDrawer
    ? 'shrink-0 bt-header-sky px-3.5 py-2 flex items-center justify-between gap-2'
    : 'shrink-0 bg-sky-100/95 border-b border-sky-200 px-3 py-1.5 flex items-center justify-between gap-2 text-sky-900';

  const emptyMessageText =
    effectiveChannel === 'TEAM'
      ? 'Chưa có tin nhắn riêng của đội. Nhắn cho đồng đội ngay!'
      : 'Chưa có tin nhắn nào. Hãy gửi lời chào hoặc câu thoại nhanh!';

  return (
    <div
      ref={panelRef}
      data-testid="bt-online-chat-panel"
      role={isDrawer ? 'dialog' : 'region'}
      aria-modal={isDrawer ? false : undefined}
      aria-label="Trò chuyện phòng đấu"
      className={containerClass}
    >
      {/* Header */}
      <div className={headerClass}>
        <div className="flex items-center gap-1.5 min-w-0">
          <MessageCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span className="font-display text-xs font-black uppercase tracking-wide truncate">
            Trò Chuyện Phòng
          </span>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {/* Channel Tabs */}
          <div
            role="tablist"
            aria-label="Kênh trò chuyện"
            className={`inline-flex items-center gap-1 p-0.5 rounded-full border ${
              isDrawer
                ? 'bg-sky-900/30 border-white/30'
                : 'bg-white border-sky-200'
            }`}
          >
            <button
              type="button"
              role="tab"
              data-testid="bt-chat-tab-all"
              aria-selected={effectiveChannel === 'ALL'}
              onClick={() => setActiveChannel('ALL')}
              className={`px-2.5 py-0.5 rounded-full text-[11px] font-black transition-colors cursor-pointer whitespace-nowrap ${
                effectiveChannel === 'ALL'
                  ? isDrawer
                    ? 'bg-white text-sky-900 shadow-xs'
                    : 'bt-btn-cyan'
                  : isDrawer
                    ? 'text-white/90 hover:bg-white/15'
                    : 'text-sky-900 hover:bg-sky-50'
              }`}
            >
              Cả phòng
            </button>

            {canUseTeamChannel && (
              <button
                type="button"
                role="tab"
                data-testid="bt-chat-tab-team"
                aria-selected={effectiveChannel === 'TEAM'}
                onClick={() => setActiveChannel('TEAM')}
                className={`px-2.5 py-0.5 rounded-full text-[11px] font-black flex items-center gap-1 transition-colors cursor-pointer whitespace-nowrap ${
                  effectiveChannel === 'TEAM'
                    ? 'bg-[#0284C7] text-white shadow-xs border border-white/80'
                    : isDrawer
                      ? 'text-white/90 hover:bg-white/15'
                      : 'text-sky-900 hover:bg-sky-50'
                }`}
              >
                <Users className="h-3 w-3 shrink-0" aria-hidden="true" />
                <span>Đội</span>
              </button>
            )}
          </div>

          {isDrawer && onClose && (
            <button
              type="button"
              data-testid="bt-chat-close-btn"
              onClick={onClose}
              aria-label="Đóng khung trò chuyện"
              className="icon-hit-target h-6 w-6 rounded-full bg-white/25 hover:bg-white/40 text-white text-xs font-bold flex items-center justify-center cursor-pointer shrink-0"
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          )}
        </div>
      </div>

      {/* Messages List */}
      <div
        ref={listRef}
        onScroll={handleListScroll}
        data-testid="bt-chat-messages-list"
        className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden slim-scroll p-2.5 space-y-1.5 bg-sky-50/50"
      >
        {visibleMessages.length === 0 ? (
          <div className="h-full min-h-[76px] flex items-center justify-center text-center px-3">
            <p className="text-[11px] font-semibold text-slate-500 leading-relaxed">
              {emptyMessageText}
            </p>
          </div>
        ) : (
          visibleMessages.map((msg) => {
            const isMine = myParticipantId !== null && msg.participantId === myParticipantId;
            const isTeam = msg.channel === 'TEAM';
            const isSpectator = msg.role === 'spectator';

            return (
              <div
                key={msg.id}
                data-testid={`bt-chat-msg-${msg.id}`}
                data-channel={msg.channel}
                className={`rounded-xl px-2.5 py-1.5 border text-xs leading-snug shadow-2xs ${
                  isTeam
                    ? 'bg-sky-50 border-sky-300'
                    : isMine
                      ? 'bg-amber-50/80 border-amber-200'
                      : 'bg-white border-sky-100'
                }`}
              >
                <div className="flex items-center justify-between gap-1.5 mb-0.5">
                  <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
                    <span
                      aria-hidden="true"
                      className="h-2.5 w-2.5 rounded-full shrink-0 border border-white shadow-2xs"
                      style={{ backgroundColor: msg.senderColor || '#0284C7' }}
                    />
                    <span className="font-extrabold text-slate-900 truncate max-w-[140px]">
                      {msg.senderName}
                    </span>
                    {isMine && (
                      <span className="text-[10px] font-extrabold text-amber-700">(Bạn)</span>
                    )}
                    {isTeam && (
                      <span className="px-1.5 py-[1px] rounded-md bg-sky-600 text-white text-[10px] font-black leading-tight shrink-0">
                        [Đội]
                      </span>
                    )}
                    {isSpectator && (
                      <span className="px-1.5 py-[1px] rounded-md bg-slate-200 text-slate-700 text-[9px] font-black uppercase leading-tight shrink-0">
                        Khán giả
                      </span>
                    )}
                  </div>
                  <span className="font-mono-num text-[10px] font-semibold text-slate-400 shrink-0">
                    {formatChatTime(msg.createdAt)}
                  </span>
                </div>

                <p className="text-slate-800 font-medium break-words [overflow-wrap:anywhere] whitespace-pre-wrap pl-4">
                  {msg.text}
                </p>
              </div>
            );
          })
        )}
      </div>

      {/* Quick Vietnamese Phrase Chips */}
      <div className="shrink-0 px-2.5 py-1.5 bg-sky-50/90 border-t border-sky-200/80 flex flex-wrap gap-1">
        {QUICK_CHAT_PHRASES.map((phrase, index) => (
          <button
            key={phrase}
            type="button"
            data-testid={`bt-chat-quick-chip-${index}`}
            onClick={() => handleQuickPhrase(phrase)}
            className="px-2 py-0.5 rounded-full bg-white hover:bg-sky-100 border border-sky-200 text-[11px] font-bold text-sky-900 transition-colors cursor-pointer active:scale-97"
          >
            {phrase}
          </button>
        ))}
      </div>

      {/* Composer */}
      <form
        onSubmit={handleSubmit}
        className="shrink-0 px-2.5 py-2 bg-white border-t border-sky-200 space-y-1"
      >
        <div className="flex items-center gap-1.5">
          <label htmlFor={`bt-chat-input-${variant}`} className="sr-only">
            Nội dung tin nhắn
          </label>
          <input
            id={`bt-chat-input-${variant}`}
            data-testid="bt-chat-input"
            type="text"
            maxLength={MAX_CHAT_LENGTH}
            value={draft}
            onChange={(e) => setDraft(e.target.value.slice(0, MAX_CHAT_LENGTH))}
            placeholder={
              effectiveChannel === 'TEAM'
                ? 'Nhắn riêng cho đồng đội...'
                : 'Nhắn tin tới cả phòng...'
            }
            className="flex-1 min-w-0 px-2.5 py-1.5 text-xs font-bold text-slate-900 bg-sky-50/70 border border-sky-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#29B6F6] focus:bg-white"
          />
          <button
            type="submit"
            data-testid="bt-chat-send-btn"
            disabled={draft.trim().length === 0}
            aria-label="Gửi tin nhắn"
            className={`px-3 py-1.5 rounded-xl text-xs font-black flex items-center gap-1 shrink-0 transition-all cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed ${
              effectiveChannel === 'TEAM' ? 'bt-btn-green' : 'bt-btn-cyan'
            }`}
          >
            <Send className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            <span>Gửi</span>
          </button>
        </div>

        <div className="flex items-center justify-between px-0.5 text-[10px] font-bold">
          <span className={effectiveChannel === 'TEAM' ? 'text-sky-700 font-extrabold' : 'text-slate-500'}>
            {effectiveChannel === 'TEAM'
              ? 'Kênh Đội: chỉ đồng đội cùng phe nhìn thấy'
              : 'Kênh Cả phòng: mọi người đều thấy'}
          </span>
          <span
            data-testid="bt-chat-char-count"
            className={`font-mono-num ${
              draft.length >= 140 ? 'text-amber-600 font-black' : 'text-slate-400'
            }`}
          >
            {draft.length}/{MAX_CHAT_LENGTH}
          </span>
        </div>
      </form>
    </div>
  );
};
