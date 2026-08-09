import { useState, useCallback, useRef, useEffect } from 'react';
import { OutgoingSocketMessage, IncomingSocketMessage } from '@roomies/contracts';
import { useAuth } from '../contexts/AuthContext';

type MessageHandler = (message: OutgoingSocketMessage) => void;

/** Why the socket stopped trying to stay connected — session is dead, not just a network blip. */
export type AuthErrorReason = 'kicked' | 'unauthorized' | 'unreachable';

const BASE_RECONNECT_DELAY_MS = 1000;
const MAX_RECONNECT_DELAY_MS = 30000;
const RECONNECT_JITTER_MS = 300;
const MAX_RECONNECT_ATTEMPTS = 6;

export function useWebSocket() {
  const { token } = useAuth();
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [authError, setAuthError] = useState<AuthErrorReason | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const handlersRef = useRef<Set<MessageHandler>>(new Set());
  const attemptRef = useRef(0);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout>>();

  const connect = useCallback(() => {
    if (!token) return;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws?token=${token}`;
    
    const ws = new WebSocket(wsUrl);
    
    ws.onopen = () => {
      attemptRef.current = 0;
      setIsConnected(true);
      setError(null);
      
      const joinMsg: IncomingSocketMessage = { event: 'room.join', payload: {} };
      ws.send(JSON.stringify(joinMsg));
    };

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data) as OutgoingSocketMessage;
        if (message.event === 'auth.kicked' || message.event === 'auth.unauthorized') {
          // Session is dead (kicked elsewhere or token rejected) — don't auto-reconnect with it.
          setAuthError(message.event === 'auth.kicked' ? 'kicked' : 'unauthorized');
          ws.onclose = null;
          ws.close();
        }
        handlersRef.current.forEach(handler => handler(message));
      } catch (err) {
        console.error('[sync] Failed to parse websocket message:', err);
      }
    };

    ws.onclose = () => {
      setIsConnected(false);

      if (attemptRef.current >= MAX_RECONNECT_ATTEMPTS) {
        // Treat max retry exhaustion as an unreachable dead session.
        setAuthError('unreachable');
        return;
      }

      const delay = Math.min(BASE_RECONNECT_DELAY_MS * 2 ** attemptRef.current, MAX_RECONNECT_DELAY_MS)
        + Math.random() * RECONNECT_JITTER_MS;
      attemptRef.current += 1;
      reconnectTimeoutRef.current = setTimeout(connect, delay);
    };

    ws.onerror = (err) => {
      console.error('[sync] WebSocket error:', err);
      setError(new Error('WebSocket connection error'));
    };

    wsRef.current = ws;

    return () => {
      clearTimeout(reconnectTimeoutRef.current);
      ws.onclose = null;
      ws.close();
      wsRef.current = null;
    };
  }, [token]);

  useEffect(() => {
    const cleanup = connect();
    return () => {
      if (cleanup) cleanup();
    };
  }, [connect]);

  const sendMessage = useCallback((message: IncomingSocketMessage) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
    } else {
      console.warn('[sync] Cannot send message, WebSocket is not open');
    }
  }, []);

  const addMessageHandler = useCallback((handler: MessageHandler) => {
    handlersRef.current.add(handler);
    return () => {
      handlersRef.current.delete(handler);
    };
  }, []);

  return {
    isConnected,
    error,
    authError,
    sendMessage,
    addMessageHandler
  };
}
