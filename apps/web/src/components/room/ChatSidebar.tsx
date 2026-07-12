import React, { useState, useEffect, useRef } from 'react';
import { X, Send, UserPlus, UserMinus, Play, Pause, FastForward, Gauge } from 'lucide-react';
import { IconButton } from '../ui/IconButton';
import { useChat, Message } from '../../contexts/ChatContext';

const SystemIcon = ({ type }: { type?: Message['eventType'] }) => {
  const props = { size: 12, className: "mr-1.5 opacity-70 inline-block align-middle" };
  switch (type) {
    case 'join': return <UserPlus {...props} />;
    case 'leave': return <UserMinus {...props} />;
    case 'play': return <Play {...props} />;
    case 'pause': return <Pause {...props} />;
    case 'seek': return <FastForward {...props} />;
    case 'rate': return <Gauge {...props} />;
    default: return null;
  }
};

const getUsernameColor = (username: string) => {
  let hash = 0;
  for (let i = 0; i < username.length; i++) {
    hash = username.charCodeAt(i) + ((hash << 5) - hash);
  }
  // Hue 0-360, Saturation 65-85%, Lightness 60-80% for dark mode readability
  const h = Math.abs(hash) % 360;
  const s = 65 + (Math.abs(hash) % 20);
  const l = 60 + (Math.abs(hash) % 20);
  return `hsl(${h}, ${s}%, ${l}%)`;
};


export const ChatSidebar: React.FC = () => {
  const { isOpen, setIsOpen, messages, sendMessage, toasts } = useChat();
  const [newMessage, setNewMessage] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const prevIsOpen = useRef(isOpen);

  // Auto-scroll to bottom of chat
  useEffect(() => {
    if (containerRef.current) {
      const isJustOpened = isOpen && !prevIsOpen.current;
      containerRef.current.scrollTo({
        top: containerRef.current.scrollHeight,
        behavior: isJustOpened ? 'auto' : 'smooth'
      });
    }
    prevIsOpen.current = isOpen;
  }, [messages.length, isOpen]);

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim()) return;
    
    sendMessage(newMessage);
    setNewMessage('');
  };

  if (!isOpen) {
    return (
      <div className="fixed bottom-14 right-6 w-[300px] flex flex-col justify-end gap-0 p-2 pointer-events-none z-45">
        {toasts.map((toast, index) => {
          const isGrouped = index > 0 && toasts[index - 1].username === toast.username && !toasts[index - 1].isSystem && !toast.isSystem;
          const isNextGrouped = index < toasts.length - 1 && toasts[index + 1].username === toast.username && !toasts[index + 1].isSystem && !toast.isSystem;
          
          let pyClass = 'py-1.5';
          if (isGrouped || isNextGrouped) {
            pyClass = 'py-0.5';
          }

          return (
            <div
              key={toast.id}
              className={` ${pyClass} px-2.5 rounded pointer-events-auto cursor-pointer transition-all duration-300 text-13 text-paper leading-normal break-words shadow-lg ${
                toast.isExiting ? 'opacity-0 scale-95' : 'opacity-100 scale-100'
              }`}
              onClick={() => setIsOpen(true)}
            >
              {toast.isSystem ? (
                <span className="text-paper/60 font-medium text-[10px] tracking-wide uppercase flex items-center">
                  <SystemIcon type={toast.eventType} />
                  {toast.body}
                </span>
              ) : (
                <div className="flex flex-col gap-1">
                  {!isGrouped && (
                    <span 
                      className="font-extrabold tracking-wider text-[10px] leading-none uppercase"
                      style={{ color: getUsernameColor(toast.username || 'unknown') }}
                    >
                      {toast.username}
                    </span>
                  )}
                  <span className="text-paper/60 text-[14px] leading-snug">{toast.body}</span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className="fixed top-0 right-0 w-[360px] h-screen bg-void border-l border-ash/10 flex flex-col z-45 shadow-2xl">
      {/* Header */}
      <div className="flex justify-between items-center px-4 py-3 border-b border-ash/10">
        <p className="text-12 font-semibold uppercase tracking-[0.1em] text-paper/80">
          CHAT BAR
        </p>
        <IconButton icon={<X size={16} strokeWidth={1.5} />} onClick={() => setIsOpen(false)} />
      </div>
      
      {/* Messages */}
      <div ref={containerRef} className="flex-1 overflow-y-auto px-4 py-2 flex flex-col">
        {messages.map((msg, index) => {
          if (msg.isSystem) {
            return (
              <div key={msg.id} className="flex items-center justify-center py-2 my-1 text-[10px] font-medium tracking-wide text-paper/60 uppercase border-b border-ash/5 last:border-b-0 pb-2">
                <SystemIcon type={msg.eventType} />
                {msg.body}
              </div>
            );
          }

          const isGrouped = index > 0 && messages[index - 1].username === msg.username && !messages[index - 1].isSystem;
          const isNextGrouped = index < messages.length - 1 && messages[index + 1].username === msg.username && !messages[index + 1].isSystem;

          let paddingClass = '';
          if (!isGrouped && !isNextGrouped) {
            paddingClass = 'pt-2 pb-3'; // Standalone
          } else if (!isGrouped && isNextGrouped) {
            paddingClass = 'pt-2 pb-0.5'; // First in group
          } else if (isGrouped && isNextGrouped) {
            paddingClass = 'pt-0.5 pb-0.5'; // Middle of group
          } else if (isGrouped && !isNextGrouped) {
            paddingClass = 'pt-0.5 pb-3'; // Last in group
          }

          return (
            <div 
              key={msg.id} 
              className={`flex flex-col gap-1 ${paddingClass} ${!isNextGrouped ? 'border-b border-ash/5 last:border-b-0' : ''} wrap-break-word`}
            >
              {!isGrouped && (
                <span 
                  className="font-extrabold tracking-wider text-[10px] leading-none uppercase mt-1"
                  style={{ color: getUsernameColor(msg.username || 'unknown') }}
                >
                  {msg.username}
                </span>
              )}
              <span className="text-paper/60 text-[14px] leading-snug">{msg.body}</span>
            </div>
          );
        })}
      </div>
      
      {/* Input Form */}
      <div className="p-4 border-t border-ash/10 bg-void/50">
        <form onSubmit={handleSend} className="flex items-center gap-2">
          <input 
            type="text"
            placeholder="message…"
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            className="flex-1 bg-transparent border-b border-ash/10 text-13 text-paper py-1 focus:outline-none focus:border-paper/60 placeholder:text-ash/30 transition-colors duration-150"
          />
          <button type="submit" className="p-1.5 text-fog hover:text-paper transition-colors duration-150">
            <Send size={16} strokeWidth={1.5} />
          </button>
        </form>
      </div>
    </div>
  );
};
