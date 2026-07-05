import { FastifyInstance, FastifyRequest } from 'fastify';
import { SocketStream } from '@fastify/websocket';
import { authenticateWebSocket } from './auth';
import { socketSessionRepository } from '../database/redis';
import { IncomingSocketMessageSchema } from '@roomies/contracts/src/socket';

export const setupWebsocketGateway = (app: FastifyInstance) => {
  app.get('/ws', { websocket: true }, async (connection: SocketStream, req: FastifyRequest) => {
    // 1. Authenticate WS connection
    const userPayload = authenticateWebSocket(req);
    
    if (!userPayload) {
      connection.socket.send(JSON.stringify({ error: 'Unauthorized' }));
      connection.socket.close();
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
    connection.socket.on('message', (message: string) => {
      try {
        const rawData = JSON.parse(message.toString());
        
        // Zod safely parses the discriminated union, giving us full type safety
        const parsedData = IncomingSocketMessageSchema.safeParse(rawData);
        
        if (!parsedData.success) {
          app.log.warn({ errors: parsedData.error }, 'Invalid WS message format');
          return;
        }

        const validMessage = parsedData.data;

        // TypeScript now perfectly infers the payload based on the event!
        switch (validMessage.event) {
          case 'client.play':
            // validMessage.payload.position is inferred as number
            app.log.info({ position: validMessage.payload.position }, 'Play event received');
            break;
          case 'client.pause':
            app.log.info({ position: validMessage.payload.position }, 'Pause event received');
            break;
          case 'client.chat':
            app.log.info({ message: validMessage.payload.message }, 'Chat event received');
            break;
          default:
            app.log.info({ event: validMessage }, 'Unhandled event');
        }
      } catch (e) {
        app.log.error(e, 'Failed to parse WS message JSON');
      }
    });

    // 4. Handle disconnect
    connection.socket.on('close', async () => {
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
