import { FastifyInstance, FastifyRequest } from 'fastify';
import { WebSocket } from '@fastify/websocket';
import { authenticateWebSocket } from './auth';
import { socketSessionRepository } from '../database/redis';
import { IncomingSocketMessageSchema } from '@roomies/contracts/src/socket';
import { dispatchSocketEvent } from './router';

export const setupWebsocketGateway = (app: FastifyInstance) => {
  app.get('/ws', { websocket: true }, async (connection: WebSocket, req: FastifyRequest) => {
    // 1. Authenticate WS connection
    const userPayload = authenticateWebSocket(req);
    
    if (!userPayload) {
      connection.send(JSON.stringify({ error: 'Unauthorized' }));
      connection.close();
      return;
    }

    const { userId } = userPayload;

    // 2. Track presence in Redis OM
    const socketId = req.id;
    await socketSessionRepository.save({
      userId,
      socketId,
      connectedAt: new Date(),
    });

    app.log.info({ userId, socketId }, 'User connected via WebSocket');

    // 3. Handle incoming messages
    connection.on('message', async (message: string) => {
      try {
        const rawData = JSON.parse(message.toString());
        
        // Zod safely parses the discriminated union, giving us full type safety
        const parsedData = IncomingSocketMessageSchema.safeParse(rawData);
        
        if (!parsedData.success) {
          app.log.warn({ errors: parsedData.error }, 'Invalid WS message format');
          return;
        }

        const validMessage = parsedData.data;

        // Dispatch to the feature-oriented socket router
        await dispatchSocketEvent(validMessage, {
          app,
          socket: connection,
          userId,
          socketId,
        });
      } catch (e) {
        app.log.error(e, 'Failed to parse WS message JSON');
      }
    });

    // 4. Handle disconnect
    connection.on('close', async () => {
      app.log.info({ userId, socketId }, 'User disconnected from WebSocket');
      // Remove from Redis OM
      // Note: We'd need to search and delete by socketId
      const sessions = await socketSessionRepository.search().where('socketId').equals(socketId).return.all();
      if (sessions.length > 0) {
        await socketSessionRepository.remove(sessions[0].entityId);
      }
    });
  });
};
