import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, ReactNode } from 'react';
import { OutgoingSocketMessage } from '@roomies/contracts';
import { useServices } from '../../app/ServicesProvider';
import { KEYS } from '../../services/storage';
import { formatClock, formatTime } from '../../lib/time';
import { useAuth } from '../auth/AuthContext';
import { useMe, useRoomConnection, useRoomInfo } from '../room/RoomProvider';
import { useSidebar } from '../room/SidebarContext';
import { usePrefs } from '../settings/PrefsContext';
import { isUserPinged } from './mentionUtils';
import { playNotificationSound, showBrowserNotification } from './notify';

export interface Message {
  id: string;
  username?: string;
  timestamp: string;
  body: string;
  isSystem: boolean;
  eventType?: 'chat' | 'join' | 'leave' | 'play' | 'pause' | 'seek' | 'rate';
  isExiting?: boolean;
  isMine?: boolean;
}

type EventType = NonNullable<Message['eventType']>;

interface ChatMember {
  userId: string;
  username: string;
}

interface Chat {
  messages: Message[];
  send: (body: string) => void;
  members: ChatMember[];
  knownUsernames: string[];
  currentUsername?: string;
}

interface ChatAlerts {
  unreadCount: number;
  toasts: Message[];
}

const MAX_HISTORY = 150;
const MAX_TOASTS = 10;
const TOAST_LIFETIME_MS = 5000;
const TOAST_EXIT_MS = 300;
const SOUND_COOLDOWN_MS = 1000;
const NO_MEMBERS: ChatMember[] = [];

const ChatContext = createContext<Chat | null>(null);
const ChatAlertsContext = createContext<ChatAlerts | null>(null);

let messageSeq = 0;
const messageId = (kind: string) => `${kind}-${Date.now()}-${(messageSeq += 1)}`;

const playbackActionText = (msg: Extract<OutgoingSocketMessage, { event: 'playback.state' }>['payload']): [string, EventType] | null => {
  switch (msg.action) {
    case 'play':
      return ['resumed', 'play'];
    case 'pause':
      return ['paused', 'pause'];
    case 'seek':
      return [`seeked ${formatTime(msg.anchorPosition)}`, 'seek'];
    case 'rate':
      return [`playback: ${msg.playbackRate}x`, 'rate'];
    default:
      return null;
  }
};

export function ChatProvider({ children }: { children: ReactNode }) {
  const { send: sendSocket, subscribe } = useRoomConnection();
  const { session } = useServices();
  const { chatVisible } = useSidebar();
  const { soundEnabled, browserNotificationsEnabled } = usePrefs();
  const { user } = useAuth();
  const room = useRoomInfo();
  const me = useMe();
  const members = room?.members ?? NO_MEMBERS;

  const [messages, setMessages] = useState<Message[]>(() => session.getJson(KEYS.chatHistory, [], Array.isArray));
  const [knownUsernames, setKnownUsernames] = useState<string[]>(() => session.getJson(KEYS.chatKnownUsernames, [], Array.isArray));
  const [toasts, setToasts] = useState<Message[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  const latest = useRef({ chatVisible, soundEnabled, browserNotificationsEnabled, myUserId: user?.id, myUsername: me?.username, members });
  useEffect(() => {
    latest.current = { chatVisible, soundEnabled, browserNotificationsEnabled, myUserId: user?.id, myUsername: me?.username, members };
  });

  const toastsRef = useRef<Message[]>([]);
  const timersRef = useRef(new Set<ReturnType<typeof setTimeout>>());
  const lastSoundRef = useRef(0);
  const asyncUsersRef = useRef(new Set<string>());
  const mediaIdRef = useRef<string | null>(null);

  useEffect(() => {
    const timers = timersRef.current;
    return () => timers.forEach(clearTimeout);
  }, []);

  useEffect(() => {
    session.setJson(KEYS.chatHistory, messages);
  }, [session, messages]);

  useEffect(() => {
    const missing = members.filter((m) => !knownUsernames.includes(m.username));
    if (missing.length === 0) return;
    const next = [...knownUsernames, ...missing.map((m) => m.username)];
    session.setJson(KEYS.chatKnownUsernames, next);
    setKnownUsernames(next);
  }, [session, members, knownUsernames]);

  const schedule = useCallback((fn: () => void, ms: number) => {
    const timer = setTimeout(() => {
      timersRef.current.delete(timer);
      fn();
    }, ms);
    timersRef.current.add(timer);
  }, []);

  const updateToasts = useCallback((update: (current: Message[]) => Message[]) => {
    toastsRef.current = update(toastsRef.current);
    setToasts(toastsRef.current);
  }, []);

  const expireToast = useCallback(
    (id: string) => {
      updateToasts((current) => current.map((t) => (t.id === id ? { ...t, isExiting: true } : t)));
      schedule(() => updateToasts((current) => current.filter((t) => t.id !== id)), TOAST_EXIT_MS);
    },
    [updateToasts, schedule],
  );

  const addToast = useCallback(
    (msg: Message) => {
      updateToasts((current) => [...current, msg]);
      if (toastsRef.current.length > MAX_TOASTS) {
        const oldest = toastsRef.current.find((t) => !t.isExiting);
        if (oldest) expireToast(oldest.id);
      }
      schedule(() => {
        if (toastsRef.current.some((t) => t.id === msg.id && !t.isExiting)) expireToast(msg.id);
      }, TOAST_LIFETIME_MS);
    },
    [updateToasts, expireToast, schedule],
  );

  useEffect(() => {
    if (!chatVisible) return;
    setUnreadCount(0);
    updateToasts(() => []);
  }, [chatVisible, updateToasts]);

  const appendMessage = useCallback(
    (msg: Message) => {
      setMessages((prev) => [...prev, msg].slice(-MAX_HISTORY));
      const { chatVisible: visible, soundEnabled: sound, browserNotificationsEnabled: notifications, myUsername } = latest.current;
      const fromOther = msg.eventType === 'chat' && !msg.isSystem && !msg.isMine;

      if (fromOther && sound && (document.hidden || isUserPinged(msg.body, myUsername))) {
        const now = Date.now();
        if (now - lastSoundRef.current >= SOUND_COOLDOWN_MS) {
          lastSoundRef.current = now;
          playNotificationSound();
        }
      }
      if (visible) return;
      if (fromOther) {
        setUnreadCount((n) => n + 1);
        if (notifications) showBrowserNotification(msg.username || 'New Message', msg.body);
      }
      addToast(msg);
    },
    [addToast],
  );

  const addSystemMessage = useCallback(
    (body: string, eventType: EventType = 'chat', username?: string) =>
      appendMessage({ id: messageId('system'), username, timestamp: formatClock(), body, isSystem: true, eventType }),
    [appendMessage],
  );

  useEffect(() => {
    const noteMedia = (mediaId: string | null, title?: string) => {
      if (mediaId === mediaIdRef.current) return;
      if (mediaId) addSystemMessage(`Now playing: ${title ?? ''}`, 'play');
      else if (mediaIdRef.current) addSystemMessage('Playback ended', 'pause');
      mediaIdRef.current = mediaId;
    };

    return subscribe((msg) => {
      switch (msg.event) {
        case 'chat.message': {
          const { userId, username, message, timestamp } = msg.payload;
          appendMessage({
            id: messageId(`chat-${userId}`),
            username: username || userId,
            timestamp: formatClock(new Date(timestamp)),
            body: message,
            isSystem: false,
            eventType: 'chat',
            isMine: userId === latest.current.myUserId,
          });
          return;
        }
        case 'user.status_changed': {
          const { userId, status } = msg.payload;
          const isAsync = status === 'async';
          if (isAsync === asyncUsersRef.current.has(userId)) return;
          if (isAsync) asyncUsersRef.current.add(userId);
          else asyncUsersRef.current.delete(userId);
          const actor = latest.current.members.find((m) => m.userId === userId)?.username || userId;
          addSystemMessage(isAsync ? 'went Async' : 'synced with room', 'play', actor);
          return;
        }
        case 'user.joined':
          addSystemMessage('joined', 'join', msg.payload.username);
          return;
        case 'user.left':
          addSystemMessage('left', 'leave', msg.payload.username || msg.payload.userId);
          return;
        case 'playback.state': {
          const text = playbackActionText(msg.payload);
          if (text) addSystemMessage(text[0], text[1], msg.payload.username || 'Someone');
          return;
        }
        case 'room.state':
          noteMedia(msg.payload.room.mediaId || null, msg.payload.room.mediaTitle);
          return;
        case 'media.changed':
          noteMedia(msg.payload.mediaFileId || null, msg.payload.title);
          return;
      }
    });
  }, [subscribe, appendMessage, addSystemMessage]);

  const send = useCallback((body: string) => sendSocket({ event: 'chat.send', payload: { message: body } }), [sendSocket]);

  const chat = useMemo(
    () => ({ messages, send, members, knownUsernames, currentUsername: me?.username }),
    [messages, send, members, knownUsernames, me?.username],
  );
  const alerts = useMemo(() => ({ unreadCount, toasts }), [unreadCount, toasts]);

  return (
    <ChatContext.Provider value={chat}>
      <ChatAlertsContext.Provider value={alerts}>{children}</ChatAlertsContext.Provider>
    </ChatContext.Provider>
  );
}

export function useChat() {
  const value = useContext(ChatContext);
  if (!value) throw new Error('useChat must be used within a ChatProvider');
  return value;
}

export function useChatAlerts() {
  const value = useContext(ChatAlertsContext);
  if (!value) throw new Error('useChatAlerts must be used within a ChatProvider');
  return value;
}
