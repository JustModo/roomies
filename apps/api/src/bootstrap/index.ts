import { FastifyInstance } from 'fastify';
import fastifyCors from '@fastify/cors';
import fastifyWebsocket from '@fastify/websocket';
import { prisma } from '../database/sqlite';
import { setupWebsocketGateway } from '../websocket/gateway';
import { authRoutes } from '../auth';
import { userRoutes } from '../users';
import { libraryRoutes } from '../library';
import { chatRoutes } from '../chat';
import { initializeConfig } from '../config';
import { registerChatSocketEvents } from '../chat/socket';
import { registerPlaybackSocketEvents } from '../playback/socket';
import { registerRoomSocketEvents } from '../room/socket';
import { registerSyncSocketEvents } from '../sync/socket';
import { registerStoreSocketEvents } from '../websocket/store';

export const bootstrap = async (app: FastifyInstance) => {
  // 1. Register Plugins
  // The JWT is sent via the `Authorization` header (not cookies), so credentialed
  // CORS is not required. Origin is restricted to an explicit allow-list — a
  // literal '*' combined with `credentials: true` causes @fastify/cors to reflect
  // the caller's Origin, which would let any website make authenticated requests
  // on a logged-in user's behalf.
  const allowedOrigins = (process.env.CORS_ORIGIN || 'http://localhost')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  await app.register(fastifyCors, {
    origin: allowedOrigins,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    credentials: false,
  });

  await app.register(fastifyWebsocket, {
    options: {
      maxPayload: 1048576,
    },
  });

  // 2. Connect Database & Config
  try {
    await prisma.$connect();
    app.log.info('Connected to SQLite via Prisma');

    await initializeConfig(app.log);
  } catch (err) {
    app.log.error(err, 'Database connection failed');
    process.exit(1);
  }

  // 3. Wire up live transcoding error callback
  // When an FFmpeg variant process crashes during a live session, broadcast
  // the error to all connected clients in the room so the player UI
  // can react (e.g. fall back to another quality, show an error message).
  // TODO

  // 4. Register Global Hooks & Gateway
  registerChatSocketEvents();
  registerPlaybackSocketEvents();
  registerRoomSocketEvents();
  registerSyncSocketEvents();
  registerStoreSocketEvents();

  setupWebsocketGateway(app);

  // 5. Register Routes
  // Note: /api/transcoding routes are removed — transcoding is now an
  // internal service triggered by the playback module, not an HTTP API.
  await app.register(authRoutes, { prefix: '/api/auth' });
  await app.register(userRoutes, { prefix: '/api/users' });
  await app.register(libraryRoutes, { prefix: '/api/library' });
  await app.register(chatRoutes, { prefix: '/api/chat' });

  // 6. Graceful shutdown — kill any running FFmpeg processes
  app.addHook('onClose', async () => {
    // await TranscodeSessionManager.stopSession();
  });
};
