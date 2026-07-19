import { useEffect, useRef, useCallback } from 'react';
import { AudioRelay } from '@roomies/voice';
import { useAuth } from '../contexts/AuthContext';

interface UseVoicePartyParams {
  addMessageHandler: (handler: (msg: any) => void) => () => void;
  isJoined: boolean;
  isMicMuted: boolean;
}

/**
 * useVoiceParty — manages the voice relay lifecycle.
 *
 * - Opens a dedicated WebSocket to /ws/voice for audio data
 * - Sends JSON "join" on connect, maps UUIDs <-> 16-bit session IDs
 * - On join: acquires mic, starts Opus encoding, sends raw binary chunks
 * - On receive: decodes incoming binary chunks and plays them back
 * - On mute change: pauses encoding (no chunks sent = no bandwidth used)
 * - On leave: mic released, all peer players destroyed, close socket
 */
export function useVoiceParty({
  isJoined,
  isMicMuted,
}: UseVoicePartyParams) {
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
        ws.send(JSON.stringify({ event: 'join' }));
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
        try {
          const msg = JSON.parse(event.data);
          if (msg.event === 'session_map') {
            userToSessionRef.current.clear();
            sessionToUserRef.current.clear();
            for (const [uid, sid] of Object.entries(msg.payload || {})) {
              const sessionId = sid as number;
              userToSessionRef.current.set(uid, sessionId);
              sessionToUserRef.current.set(sessionId, uid);
            }
          } else if (msg.event === 'peer_joined') {
            const { userId, sessionId } = msg.payload;
            userToSessionRef.current.set(userId, sessionId);
            sessionToUserRef.current.set(sessionId, userId);
          } else if (msg.event === 'peer_left') {
            const { userId } = msg.payload;
            const sessionId = userToSessionRef.current.get(userId);
            if (sessionId !== undefined) {
              relayRef.current?.removePeer(userId);
              userToSessionRef.current.delete(userId);
              sessionToUserRef.current.delete(sessionId);
            }
          } else if (msg.event === 'ping') {
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ event: 'pong' }));
            }
          }
        } catch { /* ignore parse errors */ }
      }
    };

    ws.addEventListener('message', handleMessage);

    ws.onclose = () => {
      if (!isComponentMounted.current) return;
      voiceWsRef.current = null;
      console.log('[voice] WS closed, scheduling reconnect...');
      reconnectTimeoutRef.current = setTimeout(() => {
        connect();
      }, 2000);
    };

    ws.onerror = (e) => {
      console.warn('[voice] WebSocket error:', e);
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
            voiceWsRef.current.send(JSON.stringify({ event: 'leave' }));
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

  return { joinVoice, setVolume, setPeerMuted, removePeer };
}
