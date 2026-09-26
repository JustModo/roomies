import { useState, useCallback, useRef, useEffect } from 'react';
import { OutgoingSocketMessage, OutgoingSocketMessageSchema, IncomingSocketMessage } from '@roomies/contracts';
import { useAuth } from '../auth/AuthContext';
import { useServices } from '../../app/ServicesProvider';
import { useReconnectingSocket, SocketControl } from '../../services/useReconnectingSocket';

type MessageHandler = (message: OutgoingSocketMessage) => void;

type AuthErrorReason = 'kicked' | 'account_deleted' | 'unauthorized' | 'unreachable';

const MAX_RECONNECT_ATTEMPTS = 6;
const JOIN_MESSAGE = JSON.stringify({ event: 'room.join', payload: {} } satisfies IncomingSocketMessage);

export function useWebSocket() {
  const { token } = useAuth();
  const { api } = useServices();
  const [authError, setAuthError] = useState<AuthErrorReason | null>(null);
  const handlersRef = useRef<Set<MessageHandler>>(new Set());

  useEffect(() => {
    if (token) setAuthError(null);
  }, [token]);

  const onMessage = useCallback(
    (event: MessageEvent, control: SocketControl) => {
      let raw: unknown;
      try {
        raw = JSON.parse(event.data);
      } catch {
        console.error('[sync] Received a non-JSON websocket message');
        return;
      }
      const parsed = OutgoingSocketMessageSchema.safeParse(raw);
      if (!parsed.success) {
        console.error('[sync] Dropped an invalid websocket message:', parsed.error.issues);
        return;
      }
      const message = parsed.data;
      if (message.event === 'auth.kicked') {
        control.halt();
        setAuthError(message.payload.reason === 'account_deleted' ? 'account_deleted' : 'kicked');
      } else if (message.event === 'auth.unauthorized') {
        control.halt();
        api.refresh().then(
          (session) => (session ? control.retry() : setAuthError('unauthorized')),
          () => control.retry(),
        );
      }
      handlersRef.current.forEach((handler) => handler(message));
    },
    [api],
  );

  const { isConnected, send } = useReconnectingSocket({
    path: '/ws',
    token,
    maxAttempts: MAX_RECONNECT_ATTEMPTS,
    onOpen: (socket) => socket.send(JOIN_MESSAGE),
    onMessage,
    onGiveUp: () => setAuthError('unreachable'),
  });

  const sendMessage = useCallback(
    (message: IncomingSocketMessage) => {
      if (!send(JSON.stringify(message))) console.warn('[sync] Cannot send message, WebSocket is not open');
    },
    [send],
  );

  const addMessageHandler = useCallback((handler: MessageHandler) => {
    handlersRef.current.add(handler);
    return () => {
      handlersRef.current.delete(handler);
    };
  }, []);

  return { isConnected, authError, sendMessage, addMessageHandler };
}
