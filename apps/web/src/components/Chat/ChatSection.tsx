import React, { useState, useEffect, useLayoutEffect, useRef } from 'react';
import { Send } from 'lucide-react';
import { useChat } from '../../contexts/ChatContext';
import { useMobileView } from '../../hooks/useMobileView';
import { ChatMessage } from './ChatMessage';
import { FloatingReactionButton } from './FloatingReactionButton';
import { ChatEmojiButton } from './ChatEmojiButton';

export const ChatSection: React.FC = () => {
  const { isOpen, messages, sendMessage, registerChatInputRef } = useChat();
  const { isMobilePortrait } = useMobileView();
  const [newMessage, setNewMessage] = useState('');
  const [isInputFocused, setIsInputFocused] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const prevIsOpen = useRef(isOpen);
  const initialScrollDoneRef = useRef(false);
  const selectionRef = useRef<{ start: number; end: number } | null>(null);

  useLayoutEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, []);

  useEffect(() => {
    const el = inputRef.current;
    if (el) registerChatInputRef(el);
    return () => registerChatInputRef(null);
  }, []);

  useEffect(() => {
    if (!containerRef.current) return;
    const isJustOpened = isOpen && !prevIsOpen.current;
    const lastMsg = messages[messages.length - 1];
    const justSentByMe = lastMsg?.isMine === true;
    
    const isAtBottom = containerRef.current.scrollHeight - containerRef.current.scrollTop - containerRef.current.clientHeight <= 200;

    if (!justSentByMe && !isJustOpened && !isAtBottom) {
      prevIsOpen.current = isOpen;
      if (messages.length > 0) initialScrollDoneRef.current = true;
      return;
    }

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
        e.preventDefault();
        return;
      }

      const { scrollTop, scrollHeight, clientHeight } = container;
      const isScrollable = scrollHeight > clientHeight;
      if (!isScrollable) {
        e.preventDefault();
        return;
      }

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
    selectionRef.current = null;
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
    }
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    doSend();
  };

  const syncSelection = (el: HTMLTextAreaElement) => {
    selectionRef.current = { start: el.selectionStart, end: el.selectionEnd };
  };

  const insertEmoji = (emoji: string) => {
    const el = inputRef.current;
    let targetCursor = 0;

    setNewMessage((prev) => {
      const sel = selectionRef.current ?? { start: prev.length, end: prev.length };
      const start = Math.min(sel.start, prev.length);
      const end = Math.min(sel.end, prev.length);
      const next = prev.slice(0, start) + emoji + prev.slice(end);
      targetCursor = start + emoji.length;
      selectionRef.current = { start: targetCursor, end: targetCursor };
      return next;
    });

    requestAnimationFrame(() => {
      if (!el) return;
      // el.focus() fires onFocus, which re-syncs selectionRef from the DOM's
      // (stale) selection — use the captured cursor, not the ref, here.
      el.focus();
      el.setSelectionRange(targetCursor, targetCursor);
      selectionRef.current = { start: targetCursor, end: targetCursor };
      el.style.height = 'auto';
      el.style.height = `${el.scrollHeight}px`;
    });
  };

  return (
    <div className="relative flex flex-1 flex-col min-h-0">
      <div
        ref={containerRef}
        className="flex-1 min-h-0 overflow-y-auto px-4 py-2 flex flex-col"
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

      <div className="shrink-0 border-t border-ash/20 bg-ink">
        <form 
          onSubmit={handleSend} 
          className="flex items-end gap-2 px-4 py-2 transition-all duration-150"
        >
          <textarea
            ref={inputRef}
            placeholder="Message"
            spellCheck={false}
            value={newMessage}
            rows={1}
            onChange={(e) => {
              const container = containerRef.current;
              const wasAtBottom = container 
                ? container.scrollHeight - container.scrollTop - container.clientHeight <= 20
                : false;

              setNewMessage(e.target.value);
              syncSelection(e.target);
              e.target.style.height = 'auto';
              e.target.style.height = `${e.target.scrollHeight}px`;

              if (wasAtBottom && container) {
                container.scrollTo({ top: container.scrollHeight, behavior: 'auto' });
              }
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                if (e.nativeEvent.isComposing || e.keyCode === 229) return;
                e.preventDefault();
                doSend();
              }
            }}
            onKeyUp={(e) => syncSelection(e.currentTarget)}
            onClick={(e) => syncSelection(e.currentTarget)}
            onSelect={(e) => syncSelection(e.currentTarget)}
            onFocus={(e) => {
              setIsInputFocused(true);
              syncSelection(e.currentTarget);
            }}
            onBlur={() => setIsInputFocused(false)}
            className="flex-1 bg-transparent text-13 text-paper/60 focus:outline-none placeholder:text-fog/70 transition-colors duration-150 resize-none overflow-y-auto max-h-[120px] py-1"
            style={{ outline: 'none' }}
          />
          <ChatEmojiButton onEmojiSelect={insertEmoji} />
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={doSend}
            className="p-1 mb-0.5 text-fog hover:text-paper transition-colors duration-150"
          >
            <Send size={15} strokeWidth={1.5} />
          </button>
        </form>
      </div>

      {/* Floating reaction button — mobile portrait only */}
      {isMobilePortrait && <FloatingReactionButton />}
    </div>
  );
};
