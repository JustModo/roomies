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
  unreadCount: number;
  clearUnreadCount: () => void;
  activeTab: 'chat' | 'party' | 'settings';
  setActiveTab: (tab: 'chat' | 'party' | 'settings') => void;
  soundEnabled: boolean;
  setSoundEnabled: (enabled: boolean) => void;
  browserNotificationsEnabled: boolean;
  setBrowserNotificationsEnabled: (enabled: boolean) => void;
  focusChatInput: () => void;
  registerChatInputRef: (el: HTMLTextAreaElement | null) => void;
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

const playNotificationSound = () => {
  try {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return;

    const audioCtx = new AudioContextClass();

    // Many browsers suspend new audio contexts until explicitly resumed
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }

    const oscillator = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);

    oscillator.type = 'sine';
    // Use a pleasant mid-range tone so it's actually audible but not sharp
    oscillator.frequency.setValueAtTime(440, audioCtx.currentTime); // A4
    oscillator.frequency.exponentialRampToValueAtTime(349.23, audioCtx.currentTime + 0.2); // F4

    // Volume at 10% (0.1) instead of 2% (0.02) so it can be heard on most speakers
    gainNode.gain.setValueAtTime(0, audioCtx.currentTime);
    gainNode.gain.linearRampToValueAtTime(0.1, audioCtx.currentTime + 0.05);
    gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.4);

    oscillator.start(audioCtx.currentTime);
    oscillator.stop(audioCtx.currentTime + 0.4);
  } catch (e) {
    console.error('[chat] Failed to play notification sound', e);
  }
};

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
  const [unreadCount, setUnreadCount] = useState(0);
  const [activeTab, setActiveTab] = useState<'chat' | 'party' | 'settings'>('chat');

  const [soundEnabled, setSoundEnabled] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('chat_sound_enabled');
      return saved !== null ? saved === 'true' : true;
    }
    return true;
  });

  const [browserNotificationsEnabled, setBrowserNotificationsEnabled] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('chat_browser_notifications_enabled');
      return saved !== null ? saved === 'true' : true;
    }
    return true;
  });

  const storageKey = `chat_history:${window.location.pathname}`;
  const isOpenRef = useRef(isOpen);
  const activeTabRef = useRef(activeTab);
  const unreadCountRef = useRef(unreadCount);
  const soundEnabledRef = useRef(soundEnabled);
  const browserNotificationsRef = useRef(browserNotificationsEnabled);
  const lastSoundTimeRef = useRef(0);
  const chatInputRef = useRef<HTMLTextAreaElement | null>(null);

  const registerChatInputRef = useCallback((el: HTMLTextAreaElement | null) => {
    chatInputRef.current = el;
  }, []);

  const focusChatInput = useCallback(() => {
    chatInputRef.current?.focus();
  }, []);

  useEffect(() => {
    activeTabRef.current = activeTab;
  }, [activeTab]);

  useEffect(() => {
    unreadCountRef.current = unreadCount;
  }, [unreadCount]);

  useEffect(() => {
    soundEnabledRef.current = soundEnabled;
    if (typeof window !== 'undefined') {
      localStorage.setItem('chat_sound_enabled', String(soundEnabled));
    }
  }, [soundEnabled]);

  useEffect(() => {
    browserNotificationsRef.current = browserNotificationsEnabled;
    if (typeof window !== 'undefined') {
      localStorage.setItem('chat_browser_notifications_enabled', String(browserNotificationsEnabled));
    }
  }, [browserNotificationsEnabled]);

  // Request notification permissions
  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      if (Notification.permission === 'default') {
        Notification.requestPermission().catch(() => { });
      }
    }
  }, []);

  // Sync isOpen ref
  useEffect(() => {
    isOpenRef.current = isOpen;
  }, [isOpen]);

  const clearUnreadCount = useCallback(() => {
    setUnreadCount(0);
    setToasts([]);
  }, []);

  // Clear when chat becomes visible
  useEffect(() => {
    const isMobile = window.innerWidth < 1024;
    const isVisibleDesktop = isOpen && activeTab === 'chat';
    const isVisibleMobile = isMobile && activeTab === 'chat';

    if (isVisibleDesktop || isVisibleMobile) {
      clearUnreadCount();
    }
  }, [isOpen, activeTab, clearUnreadCount]);

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

    const isMobile = window.innerWidth < 1024;
    const isVisible = (isOpenRef.current && activeTabRef.current === 'chat') || (isMobile && activeTabRef.current === 'chat');
    const isDocumentHidden = typeof document !== 'undefined' && document.hidden;

    if (msg.eventType === 'chat' && !msg.isSystem && !msg.isMine) {
      const now = Date.now();
      if (soundEnabledRef.current && isDocumentHidden && now - lastSoundTimeRef.current >= 3000) {
        lastSoundTimeRef.current = now;
        playNotificationSound();
      }
    }

    if (!isVisible) {
      if (msg.eventType === 'chat' && !msg.isSystem && !msg.isMine) {
        setUnreadCount((prev) => prev + 1);

        if (browserNotificationsRef.current && typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted' && document.hidden) {
          try {
            new Notification(msg.username || 'New Message', {
              body: msg.body,
            });
          } catch (e) {
            console.error('[chat] Failed to show browser notification', e);
          }
        }
      }
    }

    const isFullscreen = typeof document !== 'undefined' && !!document.fullscreenElement;
    const showToast = isFullscreen || (isMobile ? activeTabRef.current !== 'chat' : (!isOpenRef.current || activeTabRef.current !== 'chat'));

    if (showToast) {
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
    <ChatContext.Provider value={{
      isOpen, setIsOpen, messages, sendMessage, toasts, addLocalSystemMessage, unreadCount, clearUnreadCount, activeTab, setActiveTab,
      soundEnabled, setSoundEnabled, browserNotificationsEnabled, setBrowserNotificationsEnabled,
      focusChatInput, registerChatInputRef,
    }}>
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
