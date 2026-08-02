import { FastifyInstance } from 'fastify';
import { WebSocket } from '@fastify/websocket';

export interface RoomSocket extends WebSocket {
  lastSeekTime?: number;
  userId?: string;
  socketId?: string;
}


export interface SocketContext {
  app: FastifyInstance;
  socket: RoomSocket;
  userId: string;
  username: string;
  role: string;
  socketId: string;
}


export type SocketEventHandler = (payload: unknown, ctx: SocketContext) => Promise<void> | void;

export class SocketRouter {
  private registry = new Map<string, SocketEventHandler>();

  register(event: string, handler: SocketEventHandler): void {
    this.registry.set(event, handler);
  }

  async dispatch(event: string, payload: unknown, ctx: SocketContext): Promise<void> {
    try {
      const handler = this.registry.get(event);
      if (handler) {
        await handler(payload, ctx);
      } else {
        console.warn('[sync] No handler implemented for socket event:', { event });
      }
    } catch (err) {
      console.error('[sync] Error handling socket event:', { err, event });
    }
  }

  clear(): void {
    this.registry.clear();
  }
}

export const defaultSocketRouter = new SocketRouter();


export const registerSocketEvent = (event: string, handler: SocketEventHandler) => {
  defaultSocketRouter.register(event, handler);
};

export const dispatchSocketEvent = async (event: string, payload: unknown, ctx: SocketContext) => {
  await defaultSocketRouter.dispatch(event, payload, ctx);
};
