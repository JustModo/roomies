import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, ReactNode } from 'react';
import { useRoomConnection } from '../room/RoomProvider';

export interface Reaction {
  id: string;
  userId: string;
  username: string;
  emoji: string;
}

interface Reactions {
  reactions: Reaction[];
  send: (emoji: string) => void;
}

const REACTION_LIFETIME_MS = 4000;

const ReactionsContext = createContext<Reactions | null>(null);

export function ReactionsProvider({ children }: { children: ReactNode }) {
  const { send: sendSocket, subscribe } = useRoomConnection();
  const [reactions, setReactions] = useState<Reaction[]>([]);
  const timersRef = useRef(new Set<ReturnType<typeof setTimeout>>());

  useEffect(() => {
    const timers = timersRef.current;
    let seq = 0;
    const unsubscribe = subscribe((msg) => {
      if (msg.event !== 'emoji.reaction') return;
      const { userId, username, emoji, timestamp } = msg.payload;
      const id = `${userId}-${timestamp}-${(seq += 1)}`;
      setReactions((prev) => [...prev, { id, userId, username, emoji }]);
      const timer = setTimeout(() => {
        timers.delete(timer);
        setReactions((prev) => prev.filter((r) => r.id !== id));
      }, REACTION_LIFETIME_MS);
      timers.add(timer);
    });
    return () => {
      unsubscribe();
      timers.forEach(clearTimeout);
    };
  }, [subscribe]);

  const send = useCallback((emoji: string) => sendSocket({ event: 'emoji.send', payload: { emoji } }), [sendSocket]);
  const value = useMemo(() => ({ reactions, send }), [reactions, send]);

  return <ReactionsContext.Provider value={value}>{children}</ReactionsContext.Provider>;
}

export function useReactions() {
  const value = useContext(ReactionsContext);
  if (!value) throw new Error('useReactions must be used within a ReactionsProvider');
  return value;
}
