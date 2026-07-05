import { FastifyInstance, FastifyRequest } from 'fastify';
import { WebSocket } from '@fastify/websocket';
import { authenticateWebSocket } from './auth';
import { socketSessionStore } from './store';
import { IncomingSocketMessageSchema } from '@roomies/contracts';
import { dispatchSocketEvent, SocketContext } from './router';
import { removeFromRoom } from '../playback/socket';

// Simple per-connection sliding-window rate limit for inbound socket
// messages, guarding against a client flooding client.seek/heartbeat to
// spam other room members.
const MESSAGE_WINDOW_MS = 1000;
const MAX_MESSAGES_PER_WINDOW = 20;

/**
 * Decorates the Fastify instance with a rooms Map and sets up the /ws route.
 * rooms: Map<partyId, Set<WebSocket>> — lightweight in-memory room registry.
 */
export const setupWebsocketGateway = (app: FastifyInstance) => {
  // Register the rooms map as a Fastify decoration
  app.decorate('rooms', new Map<string, Set<WebSocket>>());

  app.get('/ws', { websocket: true }, async (connection: WebSocket, req: FastifyRequest) => {
    // 1. Authenticate WS connection
    const userPayload = authenticateWebSocket(req);

    if (!userPayload) {
      connection.send(JSON.stringify({ error: 'Unauthorized' }));
      connection.close();
      return;
    }

    const { userId } = userPayload;
    const socketId = req.id;

    // 2. Track session in memory
    socketSessionStore.add({
      userId,
      socketId,
      connectedAt: new Date(),
    });

    (connection as any).__userId = userId;

    app.log.info({ userId, socketId }, 'User connected via WebSocket');

    const ctx: SocketContext = { app, socket: connection, userId, socketId };

    // 3. Handle incoming messages
    let windowStart = Date.now();
    let messagesInWindow = 0;

    connection.on('message', async (message: string) => {
      const now = Date.now();
      if (now - windowStart > MESSAGE_WINDOW_MS) {
        windowStart = now;
        messagesInWindow = 0;
      }
      messagesInWindow += 1;
      if (messagesInWindow > MAX_MESSAGES_PER_WINDOW) {
        return;
      }

      try {
        const rawData = JSON.parse(message.toString());

        const parsedData = IncomingSocketMessageSchema.safeParse(rawData);

        if (!parsedData.success) {
          app.log.warn({ errors: parsedData.error }, 'Invalid WS message format');
          return;
        }

        await dispatchSocketEvent(parsedData.data, ctx);
      } catch (e) {
        app.log.error(e, 'Failed to parse WS message JSON');
      }
    });

    // 4. Handle disconnect
    connection.on('close', async () => {
      app.log.info({ userId, socketId }, 'User disconnected from WebSocket');

      // Remove from party room
      removeFromRoom(ctx);

      // Remove session from memory
      socketSessionStore.remove(socketId);
    });
  });
};
