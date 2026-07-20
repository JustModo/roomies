import { useState, useCallback, useRef, useEffect } from 'react';
import { OutgoingSocketMessage, IncomingSocketMessage } from '@roomies/contracts';
import { useAuth } from '../contexts/AuthContext';

type MessageHandler = (message: OutgoingSocketMessage) => void;

export function useWebSocket() {
  const { token } = useAuth();
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  
  const wsRef = useRef<WebSocket | null>(null);
  const handlersRef = useRef<Set<MessageHandler>>(new Set());

  const connect = useCallback(() => {
    if (!token) return;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws?token=${token}`;
    
    const ws = new WebSocket(wsUrl);
    
    ws.onopen = () => {
      setIsConnected(true);
      setError(null);
      
      const joinMsg: IncomingSocketMessage = { event: 'room.join', payload: {} };
      ws.send(JSON.stringify(joinMsg));
    };

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data) as OutgoingSocketMessage;
        if ((message as any).event === 'auth.kicked') {
          // Signed in elsewhere — don't auto-reconnect with the now-invalid session.
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
      setTimeout(connect, 2000);
    };

    ws.onerror = (err) => {
      console.error('[sync] WebSocket error:', err);
      setError(new Error('WebSocket connection error'));
    };

    wsRef.current = ws;

    return () => {
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
    sendMessage,
    addMessageHandler
  };
}
