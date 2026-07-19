import { FastifyInstance, FastifyRequest } from 'fastify';
import { WebSocket } from '@fastify/websocket';
import { IncomingSocketMessageSchema } from '@roomies/contracts';
import { authenticateWebSocket } from '../auth';
import { dispatchSocketEvent, SocketContext } from './router';
import { createRateLimiter } from './middleware';
import { socketSessionStore } from './store';

const MESSAGE_WINDOW_MS = 1000;
const MAX_MESSAGES_PER_WINDOW = 20;

/** Decorates the Fastify instance with a room registry and sets up the /ws route. */
export const setupWebsocketGateway = (app: FastifyInstance) => {
  app.decorate('room', new Set<WebSocket>());

  app.route({
    method: 'GET',
    url: '/ws',
    handler: (req, reply) => {
      console.warn('[sync] Received HTTP GET on /ws instead of WebSocket Upgrade');
      reply.status(400).send({ error: 'WebSocket upgrade required' });
    },
    wsHandler: async (connection, req) => {
      const userPayload = authenticateWebSocket(req);

      if (!userPayload) {
        console.warn('[sync] WS Unauthorized');
        connection.send(JSON.stringify({ error: 'Unauthorized' }));
        connection.close();
        return;
      }

      const { userId, username } = userPayload;
      const socketId = req.id;

      const ctx: SocketContext = { app, socket: connection, userId, username, socketId };

      console.log(`[sync] User connected via WebSocket: ${userId}`);

      (connection as any).userId = userId;
      (connection as any).socketId = socketId;
      app.room.add(connection);

      await dispatchSocketEvent('system.connect', null, ctx);

      const handleMessage = async (message: string) => {
        try {
          const rawData = JSON.parse(message);
          const parsedData = IncomingSocketMessageSchema.safeParse(rawData);

          if (!parsedData.success) {
            console.warn('[sync] Invalid WS message format');
            return;
          }

          await dispatchSocketEvent(parsedData.data.event, parsedData.data.payload, ctx);
        } catch (e) {
          console.error('[sync] Failed to parse WS message JSON:', e);
        }
      };

      const rateLimiter = createRateLimiter(MESSAGE_WINDOW_MS, MAX_MESSAGES_PER_WINDOW);
      connection.on('message', rateLimiter(handleMessage));

      connection.on('close', async () => {
        console.log(`[sync] User disconnected from WebSocket: ${userId}`);

        app.room.delete(connection);
        
        socketSessionStore.remove(socketId);

        await dispatchSocketEvent('room.leave', {}, ctx);
      });
    }
  });
};
