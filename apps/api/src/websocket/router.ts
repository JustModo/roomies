import { FastifyInstance } from 'fastify';
import { WebSocket } from '@fastify/websocket';



export interface SocketContext {
  app: FastifyInstance;
  socket: WebSocket;
  userId: string;
  username: string;
  socketId: string;
}

export type SocketEventHandler = (payload: any, ctx: SocketContext) => Promise<void> | void;

const socketRegistry = new Map<string, SocketEventHandler>();

export const registerSocketEvent = (event: string, handler: SocketEventHandler) => {
  socketRegistry.set(event, handler);
};

export const dispatchSocketEvent = async (
  event: string,
  payload: any,
  ctx: SocketContext
) => {
  try {
    const handler = socketRegistry.get(event);
    if (handler) {
      await handler(payload, ctx);
    } else {
      ctx.app.log.warn({ event }, 'No handler implemented for socket event');
    }
  } catch (err) {
    ctx.app.log.error({ err, event }, 'Error handling socket event');
  }
};
