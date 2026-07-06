import { FastifyInstance, FastifyRequest } from 'fastify';
import { WebSocket } from '@fastify/websocket';
import { IncomingSocketMessageSchema } from '@roomies/contracts';
import { authenticateWebSocket } from '../auth';
import { dispatchSocketEvent, SocketContext } from './router';
import { createRateLimiter } from './middleware';

const MESSAGE_WINDOW_MS = 1000;
const MAX_MESSAGES_PER_WINDOW = 20;

/**
 * Decorates the Fastify instance with a rooms Map and sets up the /ws route.
 * rooms: Map<partyId, Set<WebSocket>> — lightweight in-memory room registry.
 */
export const setupWebsocketGateway = (app: FastifyInstance) => {
  // Register the global room as a Fastify decoration
  app.decorate('room', new Set<WebSocket>());

  app.route({
    method: 'GET',
    url: '/ws',
    handler: (req, reply) => {
      app.log.warn({ headers: req.headers, query: req.query }, 'Received HTTP GET on /ws instead of WebSocket Upgrade');
      reply.status(400).send({ error: 'WebSocket upgrade required' });
    },
    wsHandler: async (connection, req) => {
      // 1. Authenticate WS connection
      const userPayload = authenticateWebSocket(req);

      if (!userPayload) {
        app.log.warn({ query: req.query, headers: req.headers }, 'WS Unauthorized');
        connection.send(JSON.stringify({ error: 'Unauthorized' }));
        connection.close();
        return;
      }

      const { userId, username } = userPayload;
      const socketId = req.id;

      const ctx: SocketContext = { app, socket: connection, userId, username, socketId };

      app.log.info({ userId, socketId }, 'User connected via WebSocket');

      // Add socket to the global room
      app.room.add(connection);

      // 2. Dispatch connect event
      await dispatchSocketEvent('system.connect', null, ctx);

      // 3. Handle incoming messages
      const handleMessage = async (message: string) => {
        try {
          const rawData = JSON.parse(message);
          const parsedData = IncomingSocketMessageSchema.safeParse(rawData);

          if (!parsedData.success) {
            app.log.warn({ errors: parsedData.error }, 'Invalid WS message format');
            return;
          }

          await dispatchSocketEvent(parsedData.data.event, parsedData.data.payload, ctx);
        } catch (e) {
          app.log.error(e, 'Failed to parse WS message JSON');
        }
      };

      const rateLimiter = createRateLimiter(MESSAGE_WINDOW_MS, MAX_MESSAGES_PER_WINDOW);
      connection.on('message', rateLimiter(handleMessage));

      // 4. Handle disconnect
      connection.on('close', async () => {
        app.log.info({ userId, socketId }, 'User disconnected from WebSocket');

        // Remove socket from the global room
        app.room.delete(connection);

        await dispatchSocketEvent('system.disconnect', null, ctx);
      });
    }
  });
};
