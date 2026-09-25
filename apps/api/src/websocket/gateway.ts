import { WebSocket } from '@fastify/websocket';
import { FastifyBaseLogger, FastifyInstance, FastifyRequest } from 'fastify';
import { IncomingSocketMessageSchema } from '@roomies/contracts';
import { AuthGuard } from '../auth/middleware';
import { RateLimiter } from '../common/rateLimiter';
import { SocketHub } from './hub';
import { RoomSocket, SocketContext, SocketRouter } from './router';

const MESSAGE_WINDOW_MS = 1000;
const MAX_MESSAGES_PER_WINDOW = 20;

/** Authenticates /ws connections and feeds their messages into the socket router. */
export class WebsocketGateway {
  constructor(
    private readonly guard: AuthGuard,
    private readonly hub: SocketHub,
    private readonly router: SocketRouter,
    private readonly log: FastifyBaseLogger,
  ) {}

  register(app: FastifyInstance): void {
    app.route({
      method: 'GET',
      url: '/ws',
      handler: (_req, reply) => {
        this.log.warn('Received HTTP GET on /ws instead of WebSocket upgrade');
        reply.status(400).send({ error: 'WebSocket upgrade required' });
      },
      wsHandler: (socket, req) => this.handleConnection(socket, req),
    });
  }

  private async handleConnection(connection: WebSocket, req: FastifyRequest): Promise<void> {
    const user = await this.guard.authenticateWebSocket(req);
    if (!user) {
      this.log.warn('WebSocket unauthorized');
      this.hub.sendTo(connection, { event: 'auth.unauthorized', payload: { reason: 'invalid_or_expired_token' } });
      connection.close();
      return;
    }

    const socket = connection as RoomSocket;
    socket.userId = user.userId;
    socket.socketId = req.id;
    this.hub.add(socket);

    const ctx: SocketContext = { socket, userId: user.userId, username: user.username, role: user.role, socketId: req.id };
    const limiter = new RateLimiter(MESSAGE_WINDOW_MS, MAX_MESSAGES_PER_WINDOW);
    this.log.info({ userId: user.userId }, 'User connected');

    socket.on('message', async (raw: Buffer) => {
      let json: unknown;
      try {
        json = JSON.parse(raw.toString());
      } catch {
        this.log.warn({ userId: user.userId }, 'Received non-JSON WebSocket message');
        return;
      }

      const parsed = IncomingSocketMessageSchema.safeParse(json);
      if (!parsed.success) {
        this.log.warn({ userId: user.userId }, 'Invalid WebSocket message format');
        return;
      }

      // NOTE: sync.status is exempt so a throttled client can still report buffering.
      if (parsed.data.event !== 'sync.status' && !limiter.allow()) return;

      await this.router.dispatch(parsed.data.event, parsed.data.payload, ctx);
    });

    socket.on('close', async () => {
      this.log.info({ userId: user.userId }, 'User disconnected');
      this.hub.remove(socket);
      await this.router.dispatch('room.leave', {}, ctx);
    });
  }
}
