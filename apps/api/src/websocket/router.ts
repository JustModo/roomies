import { FastifyInstance } from 'fastify';
import { WebSocket } from '@fastify/websocket';
import { IncomingSocketMessage } from '@roomies/contracts';


export interface SocketContext {
  app: FastifyInstance;
  socket: WebSocket;
  userId: string;
  socketId: string;
}

export type SocketEventHandler = (payload: any, ctx: SocketContext) => Promise<void> | void;

const socketRegistry = new Map<string, SocketEventHandler>();

export const registerSocketEvent = (event: string, handler: SocketEventHandler) => {
  socketRegistry.set(event, handler);
};

export const dispatchSocketEvent = async (
  message: IncomingSocketMessage,
  ctx: SocketContext
) => {
  try {
    const handler = socketRegistry.get(message.event);
    if (handler) {
      await handler(message.payload, ctx);
    } else {
      ctx.app.log.warn({ event: (message as any).event }, 'No handler implemented for socket event');
    }
  } catch (err) {
    ctx.app.log.error({ err, event: message.event }, 'Error handling socket event');
  }
};
