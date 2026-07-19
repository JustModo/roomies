import React, { createContext, useContext, useEffect, useRef, useCallback, useState } from 'react';
import { AudioRelay } from '@roomies/voice';
import { useAuth } from './AuthContext';
import { LocalMemberState } from '../components/Party/PartySection';

interface VoiceContextValue {
  joinVoice: () => Promise<void>;
  setVolume: (userId: string, volume: number) => void;
  setPeerMuted: (userId: string, muted: boolean) => void;
  removePeer: (userId: string) => void;
  localStates: Record<string, LocalMemberState>;
  updateLocalState: (userId: string, updates: Partial<LocalMemberState>) => void;
}

const VoiceContext = createContext<VoiceContextValue | null>(null);

interface VoiceProviderProps {
  children: React.ReactNode;
  isJoined: boolean;
  isMicMuted: boolean;
}

type VoiceControlMessage =
  | { event: 'session_map'; payload: Record<string, number> }
  | { event: 'peer_joined'; payload: { userId: string; sessionId: number } }
  | { event: 'peer_left'; payload: { userId: string } }
  | { event: 'ping' }
  | { event: 'joined' }
  | { event: 'error'; payload: string };

const VOICE_CONTROL = {
  join: 'join',
  leave: 'leave',
  pong: 'pong',
} as const;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const isSessionMap = (payload: unknown): payload is Record<string, number> => {
  if (!isRecord(payload)) return false;
  return Object.values(payload).every((value) => typeof value === 'number');
};

const parseVoiceControlMessage = (raw: string): VoiceControlMessage | null => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }

  if (!isRecord(parsed) || typeof parsed.event !== 'string') return null;

  switch (parsed.event) {
    case 'session_map':
      return isSessionMap(parsed.payload)
        ? { event: parsed.event, payload: parsed.payload }
        : null;
    case 'peer_joined':
      return isRecord(parsed.payload) &&
        typeof parsed.payload.userId === 'string' &&
        typeof parsed.payload.sessionId === 'number'
        ? {
          event: parsed.event,
          payload: {
            userId: parsed.payload.userId,
            sessionId: parsed.payload.sessionId,
          },
        }
        : null;
    case 'peer_left':
      return isRecord(parsed.payload) && typeof parsed.payload.userId === 'string'
        ? { event: parsed.event, payload: { userId: parsed.payload.userId } }
        : null;
    case 'ping':
    case 'joined':
      return { event: parsed.event };
    case 'error':
      return typeof parsed.payload === 'string'
        ? { event: parsed.event, payload: parsed.payload }
        : null;
    default:
      return null;
  }
};

export function VoiceProvider({ children, isJoined, isMicMuted }: VoiceProviderProps) {
  const { token } = useAuth();
  const relayRef = useRef<AudioRelay | null>(null);
  const voiceWsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isComponentMounted = useRef<boolean>(true);

  // Map sessionId (16-bit integer) to userId (UUID string) and vice versa
  const userToSessionRef = useRef<Map<string, number>>(new Map());
  const sessionToUserRef = useRef<Map<number, string>>(new Map());

  // Keep state refs so callbacks can access the latest values
  const stateRef = useRef({ isJoined, isMicMuted });
  useEffect(() => {
    stateRef.current = { isJoined, isMicMuted };
  }, [isJoined, isMicMuted]);

  // Local state for peers (volume, mute)
  const [localStates, setLocalStates] = useState<Record<string, LocalMemberState>>({});

  const updateLocalState = useCallback((userId: string, updates: Partial<LocalMemberState>) => {
    setLocalStates(prev => {
      const current = prev[userId] || { audioMuted: false, volume: 100 };
      const next = { ...current, ...updates };

      if (updates.volume !== undefined) {
        relayRef.current?.setVolume(userId, updates.volume);
      }
      if (updates.audioMuted !== undefined) {
        relayRef.current?.setPeerMuted(userId, updates.audioMuted);
      }

      return { ...prev, [userId]: next };
    });
  }, []);

  // Create the AudioRelay once on mount
  useEffect(() => {
    relayRef.current = new AudioRelay();
    isComponentMounted.current = true;
    return () => {
      isComponentMounted.current = false;
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      relayRef.current?.leave();
      relayRef.current = null;
    };
  }, []);

  const connect = useCallback(() => {
    if (!token || !isJoined || !isComponentMounted.current) return;

    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    if (voiceWsRef.current) {
      voiceWsRef.current.onclose = null;
      voiceWsRef.current.close();
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = `${protocol}//${window.location.host}/ws/voice?token=${token}`;
    const ws = new WebSocket(url);
    ws.binaryType = 'arraybuffer';
    voiceWsRef.current = ws;

    ws.onopen = () => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ event: VOICE_CONTROL.join }));
      }
    };

    const handleMessage = (event: MessageEvent) => {
      // Audio Channel is binary
      if (event.data instanceof ArrayBuffer) {
        const buffer = event.data;
        if (buffer.byteLength <= 2) return;

        const view = new DataView(buffer);
        const sessionId = view.getUint16(0);
        const chunk = new Uint8Array(buffer, 2);

        const userId = sessionToUserRef.current.get(sessionId);
        if (userId) {
          relayRef.current?.scheduleChunk(userId, chunk);
        }
        return;
      }

      // Control Channel is text JSON
      if (typeof event.data === 'string') {
        const msg = parseVoiceControlMessage(event.data);
        if (!msg) return;


        switch (msg.event) {
          case 'session_map':
            userToSessionRef.current.clear();
            sessionToUserRef.current.clear();
            for (const [uid, sessionId] of Object.entries(msg.payload)) {
              userToSessionRef.current.set(uid, sessionId);
              sessionToUserRef.current.set(sessionId, uid);
            }
            break;
          case 'peer_joined':
            userToSessionRef.current.set(msg.payload.userId, msg.payload.sessionId);
            sessionToUserRef.current.set(msg.payload.sessionId, msg.payload.userId);
            break;
          case 'peer_left': {
            const sessionId = userToSessionRef.current.get(msg.payload.userId);
            if (sessionId !== undefined) {
              relayRef.current?.removePeer(msg.payload.userId);
              userToSessionRef.current.delete(msg.payload.userId);
              sessionToUserRef.current.delete(sessionId);
            }
            break;
          }
          case 'ping':
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ event: VOICE_CONTROL.pong }));
            }
            break;
          case 'joined':
            break;
          case 'error':
            break;
        }
      }
    };

    ws.addEventListener('message', handleMessage);

    ws.onclose = () => {
      if (!isComponentMounted.current) return;
      voiceWsRef.current = null;
      reconnectTimeoutRef.current = setTimeout(() => {
        connect();
      }, 2000);
    };

    ws.onerror = (e) => {
    };
  }, [token, isJoined]);

  // Start connection and handle cleanups on token change, isJoined change, or unmount
  useEffect(() => {
    if (isJoined) {
      connect();
    }
    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      if (voiceWsRef.current) {
        if (voiceWsRef.current.readyState === WebSocket.OPEN) {
          try {
            voiceWsRef.current.send(JSON.stringify({ event: VOICE_CONTROL.leave }));
          } catch { /* ignore */ }
        }
        voiceWsRef.current.onclose = null;
        voiceWsRef.current.close();
        voiceWsRef.current = null;
      }
    };
  }, [connect, isJoined]);

  // Sync mute state into the relay whenever it changes
  useEffect(() => {
    relayRef.current?.setMuted(isMicMuted);
  }, [isMicMuted]);

  // On leave: tear down the encoder and release the mic
  useEffect(() => {
    if (!isJoined) {
      relayRef.current?.leave();
      userToSessionRef.current.clear();
      sessionToUserRef.current.clear();
    }
  }, [isJoined]);

  /** Acquires mic and starts encoding. Called when the user clicks "Join Party". */
  const joinVoice = useCallback(async () => {
    const relay = relayRef.current;
    if (!relay) return;

    relay.onChunk = (chunk: Uint8Array) => {
      const ws = voiceWsRef.current;
      if (ws?.readyState === WebSocket.OPEN) {
        ws.send(chunk);
      }
    };

    await relay.join();
    relay.setMuted(stateRef.current.isMicMuted);
  }, []);

  /** Sets playback volume (0–100) for a specific peer. */
  const setVolume = useCallback((userId: string, volume: number) => {
    relayRef.current?.setVolume(userId, volume);
  }, []);

  /** Locally mutes or unmutes a specific peer. */
  const setPeerMuted = useCallback((userId: string, muted: boolean) => {
    relayRef.current?.setPeerMuted(userId, muted);
  }, []);

  /** Removes a peer's audio player when they leave the voice channel. */
  const removePeer = useCallback((userId: string) => {
    relayRef.current?.removePeer(userId);
    const sessionId = userToSessionRef.current.get(userId);
    if (sessionId !== undefined) {
      userToSessionRef.current.delete(userId);
      sessionToUserRef.current.delete(sessionId);
    }
  }, []);

  const value = {
    joinVoice,
    setVolume,
    setPeerMuted,
    removePeer,
    localStates,
    updateLocalState
  };

  return <VoiceContext.Provider value={value}>{children}</VoiceContext.Provider>;
}

export function useVoice() {
  const context = useContext(VoiceContext);
  if (!context) {
    throw new Error('useVoice must be used within a VoiceProvider');
  }
  return context;
}
