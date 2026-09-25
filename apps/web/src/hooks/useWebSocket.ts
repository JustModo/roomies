import { useState, useCallback, useRef, useEffect } from 'react';
import { OutgoingSocketMessage, IncomingSocketMessage } from '@roomies/contracts';
import { useAuth } from '../contexts/AuthContext';
import { refreshSession } from '../api/client';

type MessageHandler = (message: OutgoingSocketMessage) => void;

/** Why the socket stopped trying to stay connected — session is dead, not just a network blip. */
export type AuthErrorReason = 'kicked' | 'account_deleted' | 'unauthorized' | 'unreachable';

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

  const tokenRef = useRef(token);
  tokenRef.current = token;
  const hasToken = token !== null;

  useEffect(() => {
    if (!hasToken) return;

    let disposed = false;
    let ws: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;

    const scheduleReconnect = () => {
      if (attemptRef.current >= MAX_RECONNECT_ATTEMPTS) {
        setAuthError('unreachable');
        return;
      }

      const delay = Math.min(BASE_RECONNECT_DELAY_MS * 2 ** attemptRef.current, MAX_RECONNECT_DELAY_MS)
        + Math.random() * RECONNECT_JITTER_MS;
      attemptRef.current += 1;
      reconnectTimer = setTimeout(open, delay);
    };

    const open = () => {
      if (disposed || !tokenRef.current) return;

      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const socket = new WebSocket(`${protocol}//${window.location.host}/ws`, [`bearer.${tokenRef.current}`]);
      ws = socket;
      wsRef.current = socket;

      socket.onopen = () => {
        attemptRef.current = 0;
        setIsConnected(true);
        setError(null);

        const joinMsg: IncomingSocketMessage = { event: 'room.join', payload: {} };
        socket.send(JSON.stringify(joinMsg));
      };

      socket.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data) as OutgoingSocketMessage;
          if (message.event === 'auth.kicked') {
            setAuthError(message.payload.reason === 'account_deleted' ? 'account_deleted' : 'kicked');
            socket.onclose = null;
            socket.close();
            setIsConnected(false);
          } else if (message.event === 'auth.unauthorized') {
            socket.onclose = null;
            socket.close();
            setIsConnected(false);
            refreshSession().then(
              (session) => {
                if (disposed) return;
                if (session) scheduleReconnect();
                else setAuthError('unauthorized');
              },
              () => { if (!disposed) scheduleReconnect(); },
            );
          }
          handlersRef.current.forEach(handler => handler(message));
        } catch (err) {
          console.error('[sync] Failed to parse websocket message:', err);
        }
      };

      socket.onclose = () => {
        setIsConnected(false);
        if (!disposed) scheduleReconnect();
      };

      socket.onerror = (err) => {
        console.error('[sync] WebSocket error:', err);
        setError(new Error('WebSocket connection error'));
      };
    };

    open();

    return () => {
      disposed = true;
      clearTimeout(reconnectTimer);
      if (ws) {
        ws.onclose = null;
        ws.close();
      }
      wsRef.current = null;
    };
  }, [hasToken]);

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
