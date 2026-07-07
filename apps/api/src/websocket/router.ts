import { FastifyInstance } from 'fastify';
import { WebSocket } from '@fastify/websocket';



export interface SocketContext {
  app: FastifyInstance;
  socket: WebSocket;
  userId: string;
  username: string;
  socketId: string;
}

export type SocketEventHandler = (payload: unknown, ctx: SocketContext) => Promise<void> | void;

const socketRegistry = new Map<string, SocketEventHandler>();

export const registerSocketEvent = (event: string, handler: SocketEventHandler) => {
  socketRegistry.set(event, handler);
};

export const dispatchSocketEvent = async (
  event: string,
  payload: unknown,
  ctx: SocketContext
) => {
  try {
    const handler = socketRegistry.get(event);
    if (handler) {
      await handler(payload, ctx);
    } else {
      console.warn('No handler implemented for socket event', { event });
    }
  } catch (err) {
    console.error('Error handling socket event', { err, event });
  }
};
