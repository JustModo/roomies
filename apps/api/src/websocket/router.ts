import { WebSocket } from '@fastify/websocket';
import { FastifyBaseLogger } from 'fastify';
import { IncomingSocketMessage } from '@roomies/contracts';

export interface RoomSocket extends WebSocket {
  lastSeekTime?: number;
  userId?: string;
  socketId?: string;
}

export interface SocketContext {
  socket: RoomSocket;
  userId: string;
  username: string;
  role: string;
  socketId: string;
}

export type SocketEvent = IncomingSocketMessage['event'];
export type SocketPayload<E extends SocketEvent> = Extract<IncomingSocketMessage, { event: E }>['payload'];
export type SocketHandler<E extends SocketEvent> = (payload: SocketPayload<E>, ctx: SocketContext) => Promise<void> | void;

/** Runs before a handler; returning false drops the event. */
export type SocketGuard<P = unknown> = (payload: P, ctx: SocketContext) => boolean;

export const requireSocketRole =
  (...roles: string[]): SocketGuard =>
  (_payload, ctx) =>
    roles.includes(ctx.role);

export class SocketRouter {
  private handlers = new Map<SocketEvent, (payload: unknown, ctx: SocketContext) => Promise<void>>();

  constructor(private readonly log: FastifyBaseLogger) {}

  on<E extends SocketEvent>(event: E, handler: SocketHandler<E>, ...guards: SocketGuard<SocketPayload<E>>[]): void {
    this.handlers.set(event, async (raw, ctx) => {
      const payload = raw as SocketPayload<E>;
      if (!guards.every((guard) => guard(payload, ctx))) {
        this.log.warn({ event, userId: ctx.userId }, 'Socket event blocked by guard');
        return;
      }
      await handler(payload, ctx);
    });
  }

  async dispatch(event: SocketEvent, payload: unknown, ctx: SocketContext): Promise<void> {
    const handler = this.handlers.get(event);
    if (!handler) {
      this.log.warn({ event }, 'No handler registered for socket event');
      return;
    }

    try {
      await handler(payload, ctx);
    } catch (err) {
      this.log.error({ err, event }, 'Error handling socket event');
    }
  }
}
