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

export const ChatSidebar: React.FC = () => {
  const { isOpen, setIsOpen, messages, sendMessage, toasts } = useChat();
  const [newMessage, setNewMessage] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom of chat
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
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
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={` py-1 px-2.5 rounded pointer-events-auto cursor-pointer transition-all duration-300 text-13 text-paper leading-normal break-words shadow-lg ${
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
              <div className="flex flex-col gap-0.5">
                <span className="font-extrabold tracking-wider text-blue-400 text-[10px] leading-none uppercase">{toast.username}</span>
                <span className="text-paper/60 text-[14px] leading-snug">{toast.body}</span>
              </div>
            )}
          </div>
        ))}
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
      <div ref={containerRef} className="flex-1 overflow-y-auto px-4 py-2 flex flex-col gap-1.5 scroll-smooth">
        {messages.map((msg) => {
          if (msg.isSystem) {
            return (
              <div key={msg.id} className="flex items-center justify-center py-1 my-0.5 text-[10px] font-medium tracking-wide text-paper/60 uppercase border-b border-ash/5 last:border-b-0 pb-1.5">
                <SystemIcon type={msg.eventType} />
                {msg.body}
              </div>
            );
          }

          return (
            <div key={msg.id} className="flex flex-col gap-0.5 py-1.5 border-b border-ash/5 last:border-b-0 wrap-break-word">
              <span className="font-extrabold tracking-wider text-blue-400 text-[10px] leading-none uppercase">{msg.username}</span>
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
