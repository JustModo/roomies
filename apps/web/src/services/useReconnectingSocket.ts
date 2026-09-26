import { useEffect, useLayoutEffect, useRef, useState, useCallback } from 'react';
import { backoffDelay } from '../lib/clock';
import { useServices } from '../app/ServicesProvider';

export interface SocketControl {
  halt(): void;
  retry(): void;
}

interface ReconnectingSocketOptions {
  path: string;
  token: string | null;
  enabled?: boolean;
  binaryType?: BinaryType;
  maxAttempts?: number;
  onOpen?(socket: WebSocket): void;
  onMessage(event: MessageEvent, control: SocketControl): void;
  onGiveUp?(): void;
  onDispose?(socket: WebSocket): void;
}

export function useReconnectingSocket({ path, token, enabled = true, binaryType, maxAttempts = Infinity, ...handlers }: ReconnectingSocketOptions) {
  const { openSocket } = useServices();
  const [isConnected, setIsConnected] = useState(false);
  const socketRef = useRef<WebSocket | null>(null);
  const tokenRef = useRef(token);
  const handlersRef = useRef(handlers);

  useLayoutEffect(() => {
    tokenRef.current = token;
    handlersRef.current = handlers;
  });

  const active = enabled && token !== null;

  useEffect(() => {
    if (!active) return;
    let disposed = false;
    let attempt = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const detach = () => {
      const socket = socketRef.current;
      if (socket) {
        socket.onclose = null;
        socket.close();
      }
      socketRef.current = null;
      setIsConnected(false);
    };

    const schedule = () => {
      if (disposed) return;
      if (attempt >= maxAttempts) {
        handlersRef.current.onGiveUp?.();
        return;
      }
      timer = setTimeout(open, backoffDelay(attempt++));
    };

    const control: SocketControl = {
      halt: detach,
      retry: () => {
        detach();
        schedule();
      },
    };

    const open = () => {
      const currentToken = tokenRef.current;
      if (disposed || !currentToken) return;
      const socket = openSocket(path, currentToken);
      if (binaryType) socket.binaryType = binaryType;
      socketRef.current = socket;
      socket.onopen = () => {
        attempt = 0;
        setIsConnected(true);
        handlersRef.current.onOpen?.(socket);
      };
      socket.onmessage = (event) => handlersRef.current.onMessage(event, control);
      socket.onclose = () => {
        socketRef.current = null;
        setIsConnected(false);
        schedule();
      };
    };

    open();

    return () => {
      disposed = true;
      clearTimeout(timer);
      if (socketRef.current?.readyState === WebSocket.OPEN) handlersRef.current.onDispose?.(socketRef.current);
      detach();
    };
  }, [active, path, binaryType, maxAttempts, openSocket]);

  const send = useCallback((data: string | ArrayBufferLike | ArrayBufferView) => {
    const socket = socketRef.current;
    if (socket?.readyState !== WebSocket.OPEN) return false;
    socket.send(data);
    return true;
  }, []);

  return { isConnected, send, socketRef };
}
