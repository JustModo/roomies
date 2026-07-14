import React, { useState, useEffect, useLayoutEffect, useRef } from 'react';
import { X, Send } from 'lucide-react';
import { IconButton } from '../ui/IconButton';
import { useChat } from '../../contexts/ChatContext';
import { ChatMessage } from './ChatMessage';

/**
 * ChatSidebar — the full chat panel.
 *
 * - On desktop: fixed right panel (360px), toggled via isOpen.
 * - On mobile:  stacks below the video, takes remaining flex space.
 *              Visibility is controlled by isOpen (toggled via the player controls).
 */
export const ChatSidebar: React.FC = () => {
  const { isOpen, setIsOpen, messages, sendMessage } = useChat();
  const [newMessage, setNewMessage] = useState('');
  const [isInputFocused, setIsInputFocused] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const prevIsOpen = useRef(isOpen);
  const initialScrollDoneRef = useRef(false);

  // Snap to bottom instantly before the first paint — avoids the visible
  // top-to-bottom scroll animation when messages are loaded from sessionStorage.
  useLayoutEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, []); // mount only

  // Auto-scroll to bottom only when:
  //   1. The last message was sent by the current user (isMine), OR
  //   2. The panel was just opened
  useEffect(() => {
    if (!containerRef.current) return;
    const isJustOpened = isOpen && !prevIsOpen.current;
    const lastMsg = messages[messages.length - 1];
    const justSentByMe = lastMsg?.isMine === true;
    
    // Check if user is near the bottom (within ~200px)
    const isAtBottom = containerRef.current.scrollHeight - containerRef.current.scrollTop - containerRef.current.clientHeight <= 200;

    if (!justSentByMe && !isJustOpened && !isAtBottom) {
      prevIsOpen.current = isOpen;
      if (messages.length > 0) initialScrollDoneRef.current = true;
      return;
    }

    // Avoid visible top-to-bottom scroll on initial load by using 'auto'
    const behavior = (!initialScrollDoneRef.current || isJustOpened) ? 'auto' : 'smooth';

    containerRef.current.scrollTo({
      top: containerRef.current.scrollHeight,
      behavior,
    });

    if (messages.length > 0) {
      initialScrollDoneRef.current = true;
    }
    prevIsOpen.current = isOpen;
  }, [messages, isOpen]);

  // Lock document/viewport scroll on mobile portrait when the input is focused
  useEffect(() => {
    if (!isInputFocused) return;

    const isMobilePortrait = window.matchMedia('(orientation: portrait) and (max-width: 1023px)').matches;
    if (!isMobilePortrait) return;

    const handleTouchMove = (e: TouchEvent) => {
      const container = containerRef.current;
      if (!container) return;

      let target = e.target as HTMLElement | null;
      let isInsideContainer = false;
      while (target) {
        if (target === container) {
          isInsideContainer = true;
          break;
        }
        target = target.parentElement;
      }

      if (!isInsideContainer) {
        // Block vertical scrolling on the rest of the layout (video, buttons, wrapper)
        e.preventDefault();
        return;
      }

      // Check if container is actually scrollable
      const { scrollTop, scrollHeight, clientHeight } = container;
      const isScrollable = scrollHeight > clientHeight;
      if (!isScrollable) {
        e.preventDefault();
        return;
      }

      // Prevent iOS rubber-band bleed at boundaries
      const touch = e.touches[0];
      const currentY = touch.clientY;
      const lastY = (container as any)._lastY || currentY;
      (container as any)._lastY = currentY;

      const direction = currentY - lastY;

      if (scrollTop <= 0 && direction > 0) {
        e.preventDefault();
      } else if (scrollTop + clientHeight >= scrollHeight && direction < 0) {
        e.preventDefault();
      }
    };

    const handleTouchStart = (e: TouchEvent) => {
      const container = containerRef.current;
      if (container && e.touches.length > 0) {
        (container as any)._lastY = e.touches[0].clientY;
      }
    };

    document.addEventListener('touchmove', handleTouchMove, { passive: false });
    document.addEventListener('touchstart', handleTouchStart, { passive: true });

    return () => {
      document.removeEventListener('touchmove', handleTouchMove);
      document.removeEventListener('touchstart', handleTouchStart);
    };
  }, [isInputFocused]);

  const doSend = () => {
    if (!newMessage.trim()) return;
    sendMessage(newMessage);
    setNewMessage('');
    // Re-focus immediately so the keyboard stays open on mobile.
    // requestAnimationFrame waits for React to flush the state update first.
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    doSend();
  };

  return (
    <div
      className={`
        relative flex-1 min-h-0
        lg:fixed lg:top-0 lg:right-0 lg:w-[360px] lg:h-screen
        bg-void border-t border-ash/10
        lg:border-t-0 lg:border-l lg:border-ash/10
        z-45 shadow-2xl w-full flex flex-col
        ${!isOpen ? 'flex lg:hidden' : 'flex'}
      `}
    >
      {/* Header */}
      <div className="shrink-0 flex justify-between items-center px-4 py-3 border-b border-ash/10">
        <p className="text-12 font-semibold uppercase tracking-widest text-paper/80">CHAT BAR</p>
        {/* Close button — desktop only (mobile has no explicit close, use the player toggle) */}
        <div className="hidden lg:block">
          <IconButton icon={<X size={16} strokeWidth={1.5} />} onClick={() => setIsOpen(false)} />
        </div>
      </div>

      {/* Messages — touch-action:pan-y lets iOS route vertical swipes into
          this element even when body is overflow:hidden. overscroll-behavior
          contains the rubber-band so it doesn't bleed to the parent. */}
      <div
        ref={containerRef}
        className="flex-1 min-h-0 overflow-y-auto px-4 pt-2 pb-0 flex flex-col"
        style={{ touchAction: 'pan-y', overscrollBehavior: 'contain' }}
      >
        {messages.map((msg, index) => {
          const isGrouped = index > 0 && messages[index - 1].username === msg.username && !messages[index - 1].isSystem;
          const isNextGrouped = index < messages.length - 1 && messages[index + 1].username === msg.username && !messages[index + 1].isSystem;
          return (
            <ChatMessage
              key={msg.id}
              msg={msg}
              isGrouped={isGrouped}
              isNextGrouped={isNextGrouped}
            />
          );
        })}
      </div>

      {/* Input — always pinned to bottom */}
      <div className="shrink-0 px-4 py-3 pt-2 border-t border-ash/20 bg-void">
        <form 
          onSubmit={handleSend} 
          className="flex items-center gap-2 bg-ink border border-ash/45 px-3 py-2 focus-within:border-paper/70 transition-all duration-150"
        >
          <input
            ref={inputRef}
            type="text"
            placeholder="Message"
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); doSend(); } }}
            onFocus={() => setIsInputFocused(true)}
            onBlur={() => setIsInputFocused(false)}
            className="flex-1 bg-transparent text-13 text-paper focus:outline-none placeholder:text-fog/70 transition-colors duration-150"
            style={{ outline: 'none' }}
          />
          {/* type="button" prevents form submit blur; we call doSend() directly.
              onTouchEnd fires before onBlur on mobile, keeping keyboard open. */}
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={doSend}
            className="p-1 text-fog hover:text-paper transition-colors duration-150"
          >
            <Send size={15} strokeWidth={1.5} />
          </button>
        </form>
      </div>
    </div>
  );
};
