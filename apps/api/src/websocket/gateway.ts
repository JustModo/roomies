import { FastifyInstance } from 'fastify';
import { IncomingSocketMessageSchema, OutgoingSocketMessage } from '@roomies/contracts';
import { authenticateWebSocket } from '../auth/websocket';
import { dispatchSocketEvent, SocketContext, RoomSocket } from './router';
import { createRateLimiter } from './middleware';
import { voiceManager } from '../voice/manager';

const MESSAGE_WINDOW_MS = 1000;
const MAX_MESSAGES_PER_WINDOW = 20;

type KickReason = Extract<OutgoingSocketMessage, { event: 'auth.kicked' }>['payload']['reason'];

/** Force-closes every room and voice WebSocket of a user, e.g. after a new login elsewhere or account deletion. */
export const kickUserConnections = (app: FastifyInstance, userId: string, reason: KickReason = 'logged_in_elsewhere'): void => {
  const message: OutgoingSocketMessage = { event: 'auth.kicked', payload: { reason } };
  for (const connection of app.room) {
    if ((connection as RoomSocket).userId !== userId) continue;
    try {
      connection.send(JSON.stringify(message));
    } catch (e) {
      console.error('[sync] Failed to notify kicked connection:', e);
    }
    connection.close();
  }

  voiceManager.kickUser(userId);
};

/** Decorates the Fastify instance with a room registry and sets up the /ws route. */
export const setupWebsocketGateway = (app: FastifyInstance) => {
  app.decorate('room', new Set<RoomSocket>());

  app.route({
    method: 'GET',
    url: '/ws',
    handler: (req, reply) => {
      console.warn('[sync] Received HTTP GET on /ws instead of WebSocket Upgrade');
      reply.status(400).send({ error: 'WebSocket upgrade required' });
    },
    wsHandler: async (connection, req) => {
      const roomSocket = connection as RoomSocket;
      const userPayload = await authenticateWebSocket(req);

      if (!userPayload) {
        console.warn('[sync] WS Unauthorized');
        const unauthorizedMsg: OutgoingSocketMessage = { event: 'auth.unauthorized', payload: { reason: 'invalid_or_expired_token' } };
        connection.send(JSON.stringify(unauthorizedMsg));
        connection.close();
        return;
      }

      const { userId, username, role } = userPayload;
      const socketId = req.id;

      const ctx: SocketContext = { app, socket: roomSocket, userId, username, role, socketId };

      console.log(`[sync] User connected via WebSocket: ${userId}`);

      roomSocket.userId = userId;
      roomSocket.socketId = socketId;
      app.room.add(roomSocket);

      const withinRateLimit = createRateLimiter(MESSAGE_WINDOW_MS, MAX_MESSAGES_PER_WINDOW);

      const handleMessage = async (message: string) => {
        try {
          const rawData = JSON.parse(message);
          const parsedData = IncomingSocketMessageSchema.safeParse(rawData);

          if (!parsedData.success) {
            console.warn('[sync] Invalid WS message format');
            return;
          }

          if (parsedData.data.event !== 'sync.status' && !withinRateLimit()) return;

          await dispatchSocketEvent(parsedData.data.event, parsedData.data.payload, ctx);
        } catch (e) {
          console.error('[sync] Failed to parse WS message JSON:', e);
        }
      };

      connection.on('message', handleMessage);

      connection.on('close', async () => {
        console.log(`[sync] User disconnected from WebSocket: ${userId}`);

        app.room.delete(connection);

        await dispatchSocketEvent('room.leave', {}, ctx);
      });
    }
  });
};
