import { FastifyInstance, FastifyRequest } from 'fastify';
import { WebSocket } from '@fastify/websocket';
import { IncomingSocketMessageSchema } from '@roomies/contracts';
import { authenticateWebSocket } from '../auth';
import { dispatchSocketEvent, SocketContext } from './router';
import { createRateLimiter } from './middleware';
import { socketSessionStore } from './store';

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
      console.warn('Received HTTP GET on /ws instead of WebSocket Upgrade', { headers: req.headers, query: req.query });
      reply.status(400).send({ error: 'WebSocket upgrade required' });
    },
    wsHandler: async (connection, req) => {
      // 1. Authenticate WS connection
      const userPayload = authenticateWebSocket(req);

      if (!userPayload) {
        console.warn('WS Unauthorized', { query: req.query, headers: req.headers });
        connection.send(JSON.stringify({ error: 'Unauthorized' }));
        connection.close();
        return;
      }

      const { userId, username } = userPayload;
      const socketId = req.id;

      const ctx: SocketContext = { app, socket: connection, userId, username, socketId };

      console.log('User connected via WebSocket', { userId, socketId });

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
            console.warn('Invalid WS message format', { errors: parsedData.error });
            return;
          }

          await dispatchSocketEvent(parsedData.data.event, parsedData.data.payload, ctx);
        } catch (e) {
          console.error('Failed to parse WS message JSON', e);
        }
      };

      const rateLimiter = createRateLimiter(MESSAGE_WINDOW_MS, MAX_MESSAGES_PER_WINDOW);
      connection.on('message', rateLimiter(handleMessage));

      // 4. Handle disconnect
      connection.on('close', async () => {
        console.log('User disconnected from WebSocket', { userId, socketId });

        // Remove socket from the global room
        app.room.delete(connection);
        
        // Remove from session store directly
        socketSessionStore.remove(socketId);

        // Dispatch room.leave so the room state updates
        await dispatchSocketEvent('room.leave', {}, ctx);
      });
    }
  });
};
