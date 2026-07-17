import { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from 'react';
import { IncomingSocketMessage, OutgoingSocketMessage } from '@roomies/contracts';

export interface Message {
  id: string;
  username?: string;
  timestamp: string;
  body: string;
  isSystem: boolean;
  eventType?: 'chat' | 'join' | 'leave' | 'play' | 'pause' | 'seek' | 'rate';
  isExiting?: boolean;
  /** True when this message was sent by the currently logged-in user. */
  isMine?: boolean;
}

interface ChatContextType {
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
  messages: Message[];
  sendMessage: (body: string) => void;
  toasts: Message[];
  addLocalSystemMessage: (body: string, type?: 'chat' | 'join' | 'leave' | 'play' | 'pause' | 'seek' | 'rate') => void;
}

const ChatContext = createContext<ChatContextType | undefined>(undefined);

function formatTime(seconds: number) {
  if (isNaN(seconds) || seconds === null || seconds === undefined) return '0:00';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function ChatProvider({
  children,
  sendMessage: sendSocketMessage,
  addMessageHandler,
  currentUserId,
}: {
  children: ReactNode;
  sendMessage: (msg: IncomingSocketMessage) => void;
  addMessageHandler: (handler: (msg: OutgoingSocketMessage) => void) => () => void;
  currentUserId?: string | null;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [toasts, setToasts] = useState<Message[]>([]);

  const storageKey = `chat_history:${window.location.pathname}`;
  const isOpenRef = useRef(isOpen);

  // Sync isOpen ref
  useEffect(() => {
    isOpenRef.current = isOpen;
    if (isOpen) {
      setToasts([]); // Clear toasts if user opens chat
    }
  }, [isOpen]);

  // Initialize from sessionStorage on mount
  useEffect(() => {
    const saved = sessionStorage.getItem(storageKey);
    if (saved) {
      try {
        setMessages(JSON.parse(saved));
      } catch (e) {
        console.error('[chat] Failed to parse saved chat messages:', e);
      }
    } else {
      setMessages([]);
    }
  }, [storageKey]);

  const appendMessage = useCallback((msg: Message) => {
    setMessages((prev) => {
      const next = [...prev, msg].slice(-150);
      sessionStorage.setItem(storageKey, JSON.stringify(next));
      return next;
    });

    if (!isOpenRef.current) {
      setToasts((prev) => {
        let next = [...prev, msg];
        if (next.length > 10) {
          const oldestIndex = next.findIndex(t => !t.isExiting);
          if (oldestIndex !== -1) {
            next[oldestIndex] = { ...next[oldestIndex], isExiting: true };
            setTimeout(() => {
              setToasts((p) => p.filter((t) => t.id !== next[oldestIndex].id));
            }, 300);
          }
        }
        return next;
      });

      setTimeout(() => {
        setToasts((prev) => {
          const index = prev.findIndex((t) => t.id === msg.id);
          if (index !== -1 && !prev[index].isExiting) {
            const newToasts = [...prev];
            newToasts[index] = { ...newToasts[index], isExiting: true };
            setTimeout(() => {
              setToasts((p) => p.filter((t) => t.id !== msg.id));
            }, 300);
            return newToasts;
          }
          return prev;
        });
      }, 5000);
    }
  }, [storageKey]);

  // Listen to WebSocket events
  useEffect(() => {
    const unsubscribe = addMessageHandler((msg) => {
      const timestampStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

      switch (msg.event) {
        case 'chat.message': {
          const newMsg: Message = {
            id: `chat-${msg.payload.userId}-${Date.now()}-${Math.random()}`,
            username: msg.payload.username || msg.payload.userId,
            timestamp: new Date(msg.payload.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            body: msg.payload.message,
            isSystem: false,
            eventType: 'chat',
            isMine: currentUserId != null && msg.payload.userId === currentUserId,
          };
          appendMessage(newMsg);
          break;
        }

        case 'user.joined': {
          const newMsg: Message = {
            id: `system-join-${msg.payload.userId}-${Date.now()}`,
            username: msg.payload.username,
            timestamp: timestampStr,
            body: `joined`,
            isSystem: true,
            eventType: 'join',
          };
          appendMessage(newMsg);
          break;
        }

        case 'user.left': {
          const newMsg: Message = {
            id: `system-leave-${msg.payload.userId}-${Date.now()}`,
            username: msg.payload.username || msg.payload.userId,
            timestamp: timestampStr,
            body: `left`,
            isSystem: true,
            eventType: 'leave',
          };
          appendMessage(newMsg);
          break;
        }

        case 'playback.state': {
          const { action, username, playbackRate, anchorPosition } = msg.payload;
          let body = '';
          const actor = username || 'Someone';
          let evtType: Message['eventType'] = undefined;

          if (action === 'play') {
            body = `resumed`;
            evtType = 'play';
          } else if (action === 'pause') {
            body = `paused`;
            evtType = 'pause';
          } else if (action === 'seek') {
            body = `seeked ${formatTime(anchorPosition)}`;
            evtType = 'seek';
          } else if (action === 'rate') {
            body = `playback: ${playbackRate}x`;
            evtType = 'rate';
          }

          if (body) {
            const newMsg: Message = {
              id: `system-playback-${Date.now()}-${Math.random()}`,
              username: actor,
              timestamp: timestampStr,
              body,
              isSystem: true,
              eventType: evtType,
            };
            appendMessage(newMsg);
          }
          break;
        }

        default:
          break;
      }
    });

    return () => unsubscribe();
  }, [addMessageHandler, appendMessage]);

  const sendMessage = useCallback((body: string) => {
    sendSocketMessage({
      event: 'chat.send',
      payload: { message: body },
    });
  }, [sendSocketMessage]);

  const addLocalSystemMessage = useCallback((body: string, type: 'chat' | 'join' | 'leave' | 'play' | 'pause' | 'seek' | 'rate' = 'chat') => {
    const timestampStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    appendMessage({
      id: `system-local-${Date.now()}-${Math.random()}`,
      timestamp: timestampStr,
      body,
      isSystem: true,
      eventType: type,
    });
  }, [appendMessage]);

  return (
    <ChatContext.Provider value={{ isOpen, setIsOpen, messages, sendMessage, toasts, addLocalSystemMessage }}>
      {children}
    </ChatContext.Provider>
  );
}

export function useChat() {
  const context = useContext(ChatContext);
  if (context === undefined) {
    throw new Error('useChat must be used within a ChatProvider');
  }
  return context;
}
