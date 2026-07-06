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

    // Use wss:// or ws:// depending on the current protocol
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    // Connect to the proxy URL and pass the token as a query param
    const wsUrl = `${protocol}//${window.location.host}/ws?token=${token}`;
    
    const ws = new WebSocket(wsUrl);
    
    ws.onopen = () => {
      setIsConnected(true);
      setError(null);
      
      // Automatically join the room once connected
      const joinMsg: IncomingSocketMessage = { event: 'room.join', payload: {} };
      ws.send(JSON.stringify(joinMsg));
    };

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data) as OutgoingSocketMessage;
        handlersRef.current.forEach(handler => handler(message));
      } catch (err) {
        console.error('Failed to parse websocket message', err);
      }
    };

    ws.onclose = () => {
      setIsConnected(false);
      // Simple reconnect logic
      setTimeout(connect, 2000);
    };

    ws.onerror = (err) => {
      console.error('WebSocket error:', err);
      setError(new Error('WebSocket connection error'));
    };

    wsRef.current = ws;

    return () => {
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
      console.warn('Cannot send message, WebSocket is not open');
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
