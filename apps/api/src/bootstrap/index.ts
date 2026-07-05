import { FastifyInstance } from 'fastify';
import fastifyCors from '@fastify/cors';
import fastifyWebsocket from '@fastify/websocket';
import { prisma } from '../database/sqlite';
import { setupWebsocketGateway } from '../websocket/gateway';
import { authRoutes } from '../auth';
import { userRoutes } from '../users';
import { libraryRoutes } from '../library';
import { playbackRoutes } from '../playback/controller';
import { chatRoutes } from '../chat';
import { TranscodeSessionManager } from '../transcoding/manager';
import { initializeConfig } from '../config';
import { OutgoingSocketMessage } from '@roomies/contracts';
import { WebSocket } from '@fastify/websocket';
import { playbackStateStore } from '../playback/store';
import { registerChatSocketEvents } from '../chat/socket';
import { registerPlaybackSocketEvents } from '../playback/socket';

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

  // Seed the empty playback session
  playbackStateStore.initEmptySession();

  // 3. Wire up live transcoding error callback
  // When an FFmpeg variant process crashes during a live session, broadcast
  // the error to all connected clients in the party room so the player UI
  // can react (e.g. fall back to another quality, show an error message).
  TranscodeSessionManager.onError((profileName, error) => {
    app.log.error({ profileName, error }, 'Transcode variant failed');

    const room = (app as any).room as Set<WebSocket>;
    if (!room) return;

    const msg: OutgoingSocketMessage = {
      event: 'server.transcode.error',
      payload: { profileName, error },
    };
    const serialized = JSON.stringify(msg);
    for (const socket of room) {
      if (socket.readyState === 1) socket.send(serialized);
    }
  });

  // 4. Register Global Hooks & Gateway
  registerChatSocketEvents();
  registerPlaybackSocketEvents();
  setupWebsocketGateway(app);

  // 5. Register Routes
  // Note: /api/transcoding routes are removed — transcoding is now an
  // internal service triggered by the playback module, not an HTTP API.
  await app.register(authRoutes, { prefix: '/api/auth' });
  await app.register(userRoutes, { prefix: '/api/users' });
  await app.register(libraryRoutes, { prefix: '/api/library' });
  await app.register(playbackRoutes, { prefix: '/api/playback' });
  await app.register(chatRoutes, { prefix: '/api/chat' });

  // 6. Graceful shutdown — kill any running FFmpeg processes
  app.addHook('onClose', async () => {
    await TranscodeSessionManager.stopSession();
  });
};
