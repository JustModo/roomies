import React, { useState, useEffect } from 'react';
import { X, Send } from 'lucide-react';
import { IconButton } from '../ui/IconButton';
// Removed Input

interface Message {
  id: string;
  username: string;
  timestamp: string;
  body: string;
}

interface ChatSidebarProps {
  isOpen: boolean;
  onClose: () => void;
  viewersCount: number;
  partyId: string;
  sendMessage: (message: any) => void;
  addMessageHandler: (handler: (message: any) => void) => () => void;
}

export const ChatSidebar: React.FC<ChatSidebarProps> = ({ isOpen, onClose, viewersCount, partyId, sendMessage, addMessageHandler }) => {
  const [messages, setMessages] = useState<Message[]>([
    { id: '1', username: 'alice', timestamp: '12:41', body: 'that shot is incredible' },
    { id: '2', username: 'bram', timestamp: '12:42', body: 'wait rewind that' },
  ]);
  const [newMessage, setNewMessage] = useState('');

  // Handle toasts when closed
  const [toasts, setToasts] = useState<Message[]>([]);

  useEffect(() => {
    // Listen for incoming chat messages
    const removeHandler = addMessageHandler((msg) => {
      if (msg.event === 'server.chat') {
        const newMsg = {
          id: Date.now().toString() + Math.random(),
          username: msg.payload.userId, // Mocking username with userId for now
          timestamp: new Date(msg.payload.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          body: msg.payload.message
        };
        
        setMessages((prev) => [...prev, newMsg]);
        
        // Add to toasts if closed
        if (!isOpen) {
          setToasts((prev) => [...prev, newMsg]);
          // Auto remove toast after 5s
          setTimeout(() => {
            setToasts((prev) => prev.filter(t => t.id !== newMsg.id));
          }, 5000);
        }
      }
    });

    return () => removeHandler();
  }, [addMessageHandler, isOpen]);

  useEffect(() => {
    // Fetch initial chat history
    fetch(`/api/chat/history`, {
      headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
    })
    .then(res => res.json())
    .then(data => {
      if (Array.isArray(data)) {
        setMessages(data.map(m => ({
          id: m.id || Date.now().toString() + Math.random(),
          username: m.userId,
          timestamp: new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          body: m.message
        })));
      }
    })
    .catch(err => console.error('Failed to fetch chat history', err));
  }, [partyId]);

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim()) return;
    
    sendMessage({
      event: 'client.chat',
      payload: {
        message: newMessage
      }
    });
    
    setNewMessage('');
  };

  if (!isOpen) {
    // Render toasts
    return (
      <div className="fixed bottom-24 right-0 w-[360px] flex flex-col justify-end gap-2 p-4 pointer-events-none z-40">
        {toasts.map(toast => (
          <div key={toast.id} className="bg-void/85 border-t border-ash p-3 pointer-events-auto cursor-pointer" onClick={() => {
            // Open chat
          }}>
            <div className="flex justify-between items-baseline mb-1">
              <span className="text-12 font-medium uppercase tracking-[0.08em] text-paper">{toast.username}</span>
            </div>
            <p className="text-14 text-paper">{toast.body}</p>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="fixed top-0 right-0 w-[360px] h-screen bg-void border-l border-ash flex flex-col z-40">
      <div className="flex justify-between items-center p-4 border-b border-ash">
        <p className="text-14 font-medium uppercase tracking-[0.08em] text-paper flex items-center gap-2">
          CHAT · <span className="font-mono text-14">{viewersCount}</span>
        </p>
        <IconButton icon={<X size={20} strokeWidth={1.5} />} onClick={onClose} />
      </div>
      
      <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-6">
        {messages.map(msg => (
          <div key={msg.id} className="flex flex-col gap-1">
            <div className="flex justify-between items-baseline">
              <span className="text-12 font-medium uppercase tracking-[0.08em] text-paper">{msg.username}</span>
              <span className="text-12 font-mono text-fog">{msg.timestamp}</span>
            </div>
            <p className="text-14 text-paper leading-relaxed">{msg.body}</p>
          </div>
        ))}
      </div>
      
      <div className="p-4 border-t border-ash">
        <form onSubmit={handleSend} className="flex items-center gap-2">
          <input 
            type="text"
            placeholder="message…"
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            className="flex-1 bg-transparent border-b border-ash text-16 text-paper py-1 focus:outline-none focus:border-paper placeholder:text-ash transition-colors duration-150"
          />
          <button type="submit" className="p-2 text-fog hover:text-paper transition-colors duration-150">
            <Send size={20} strokeWidth={1.5} />
          </button>
        </form>
      </div>
    </div>
  );
};
