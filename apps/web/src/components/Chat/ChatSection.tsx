import React, { useState, useEffect, useLayoutEffect, useRef, useMemo } from 'react';
import { Send } from 'lucide-react';
import { useChat } from '../../contexts/ChatContext';
import { useMobileView } from '../../hooks/useMobileView';
import { ChatMessage } from './ChatMessage';
import { FloatingReactionButton } from './FloatingReactionButton';
import { MentionMenu, MentionMember } from './MentionMenu';
import { RichChatInput, RichChatInputHandle } from './RichChatInput';

export const ChatSection: React.FC = () => {
  const { isOpen, messages, sendMessage, roomMembers = [], registerChatInputRef } = useChat();
  const { isMobilePortrait } = useMobileView();
  const [newMessage, setNewMessage] = useState('');
  const [isInputFocused, setIsInputFocused] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const richInputRef = useRef<RichChatInputHandle>(null);
  const prevIsOpen = useRef(isOpen);

  // Hand the input to the context so the 't' shortcut can focus it.
  useEffect(() => {
    registerChatInputRef(richInputRef.current);
    return () => registerChatInputRef(null);
  }, [registerChatInputRef]);

  const initialScrollDoneRef = useRef(false);

  // Mention autocomplete state
  const [isMentionOpen, setIsMentionOpen] = useState(false);
  const [mentionQuery, setMentionQuery] = useState('');
  const [mentionMatchIndex, setMentionMatchIndex] = useState(0);
  const [mentionStartIndex, setMentionStartIndex] = useState(-1);

  const filteredMembers = useMemo(() => {
    if (!isMentionOpen) return [];
    const q = mentionQuery.toLowerCase();
    return roomMembers.filter((m) => m.username.toLowerCase().includes(q));
  }, [isMentionOpen, mentionQuery, roomMembers]);

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

  const checkMentionTrigger = (val: string, selectionStart: number) => {
    const textBeforeCursor = val.slice(0, selectionStart);
    const lastAtPos = textBeforeCursor.lastIndexOf('@');

    if (lastAtPos !== -1) {
      const charBeforeAt = lastAtPos > 0 ? val[lastAtPos - 1] : ' ';
      const queryCandidate = textBeforeCursor.slice(lastAtPos + 1);

      if (/\s/.test(charBeforeAt) && !/\s/.test(queryCandidate)) {
        setMentionStartIndex(lastAtPos);
        setMentionQuery(queryCandidate);
        setIsMentionOpen(true);
        setMentionMatchIndex(0);
        return;
      }
    }

    setIsMentionOpen(false);
  };

  const handleSelectMember = (member: MentionMember) => {
    if (mentionStartIndex >= 0) {
      richInputRef.current?.insertMention(member.username, mentionStartIndex, mentionQuery.length);
    }
    setIsMentionOpen(false);
  };

  const doSend = () => {
    if (!newMessage.trim()) return;
    sendMessage(newMessage.replace(/^\n+|\n+$/g, ''));
    setNewMessage('');
    setIsMentionOpen(false);
    richInputRef.current?.clear();
    requestAnimationFrame(() => richInputRef.current?.focus());
  };

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    doSend();
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

      <div
        className="shrink-0 border-t border-ash/20 bg-ink relative"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        {isMentionOpen && filteredMembers.length > 0 && (
          <MentionMenu
            members={filteredMembers}
            selectedIndex={mentionMatchIndex}
            onSelectMember={handleSelectMember}
          />
        )}
        <form 
          onSubmit={handleSend} 
          className="flex items-end gap-2 px-4 py-2 transition-all duration-150"
        >
          <RichChatInput
            ref={richInputRef}
            value={newMessage}
            onChange={(val, cursorOffset) => {
              const container = containerRef.current;
              const wasAtBottom = container 
                ? container.scrollHeight - container.scrollTop - container.clientHeight <= 20
                : false;

              setNewMessage(val);
              checkMentionTrigger(val, cursorOffset);

              if (wasAtBottom && container) {
                container.scrollTo({ top: container.scrollHeight, behavior: 'auto' });
              }
            }}
            onSend={doSend}
            onKeyDown={(e) => {
              if (isMentionOpen && filteredMembers.length > 0) {
                if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  setMentionMatchIndex((prev) => (prev + 1) % filteredMembers.length);
                  return;
                }
                if (e.key === 'ArrowUp') {
                  e.preventDefault();
                  setMentionMatchIndex((prev) => (prev - 1 + filteredMembers.length) % filteredMembers.length);
                  return;
                }
                if (e.key === 'Enter' || e.key === 'Tab') {
                  e.preventDefault();
                  handleSelectMember(filteredMembers[mentionMatchIndex]);
                  return;
                }
                if (e.key === 'Escape') {
                  e.preventDefault();
                  setIsMentionOpen(false);
                  return;
                }
              }
            }}
            onFocus={() => setIsInputFocused(true)}
            onBlur={() => {
              setIsInputFocused(false);
              setTimeout(() => setIsMentionOpen(false), 150);
            }}
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

      {/* Floating reaction button — mobile portrait only */}
      {isMobilePortrait && <FloatingReactionButton />}
    </div>
  );
};

