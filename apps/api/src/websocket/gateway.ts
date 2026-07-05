import { FastifyInstance, FastifyRequest } from 'fastify';
import { WebSocket } from '@fastify/websocket';
import { authenticateWebSocket } from './auth';
import { socketSessionRepository } from './redis';
import { IncomingSocketMessageSchema } from '@roomies/contracts/src/socket';
import { dispatchSocketEvent, SocketContext } from './router';
import { removeFromRoom } from '../playback/socket';

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

    // 2. Track session in Redis OM
    await socketSessionRepository.save({
      userId,
      socketId,
      connectedAt: new Date(),
    });

    app.log.info({ userId, socketId }, 'User connected via WebSocket');

    const ctx: SocketContext = { app, socket: connection, userId, socketId };

    // 3. Handle incoming messages
    connection.on('message', async (message: string) => {
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

      // Remove session from Redis OM
      const sessions = await socketSessionRepository
        .search()
        .where('socketId')
        .equals(socketId)
        .return.all();

      if (sessions.length > 0) {
        await socketSessionRepository.remove(sessions[0].entityId);
      }
    });
  });
};
