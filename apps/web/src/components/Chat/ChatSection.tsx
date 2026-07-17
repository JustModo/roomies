import React, { useState, useEffect, useLayoutEffect, useRef } from 'react';
import { Send } from 'lucide-react';
import { useChat } from '../../contexts/ChatContext';
import { ChatMessage } from './ChatMessage';

export const ChatSection: React.FC = () => {
  const { isOpen, messages, sendMessage } = useChat();
  const [newMessage, setNewMessage] = useState('');
  const [isInputFocused, setIsInputFocused] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const prevIsOpen = useRef(isOpen);
  const initialScrollDoneRef = useRef(false);

  useLayoutEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
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
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
    }
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    doSend();
  };

  return (
    <>
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
              setNewMessage(e.target.value);
              e.target.style.height = 'auto';
              e.target.style.height = `${e.target.scrollHeight}px`;
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                doSend();
              }
            }}
            onFocus={() => setIsInputFocused(true)}
            onBlur={() => setIsInputFocused(false)}
            className="flex-1 bg-transparent text-13 text-paper/60 focus:outline-none placeholder:text-fog/70 transition-colors duration-150 resize-none overflow-y-auto max-h-[120px] py-1"
            style={{ outline: 'none' }}
          />
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
    </>
  );
};
