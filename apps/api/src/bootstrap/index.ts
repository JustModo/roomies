import { FastifyInstance } from 'fastify';
import fs from 'fs';
import fastifyCors from '@fastify/cors';
import fastifyWebsocket from '@fastify/websocket';
import { prisma } from '../database/sqlite';
import { setupWebsocketGateway } from '../websocket/gateway';
import { authRoutes } from '../auth';
import { userRoutes } from '../users';
import { libraryRoutes } from '../library';
import { chatRoutes } from '../chat';
import { playbackRoutes } from '../playback/routes';
import { settingsRoutes } from '../settings';
import { initializeConfig } from '../config';
import { registerChatSocketEvents } from '../chat/socket';
import { registerPlaybackSocketEvents } from '../playback/socket';
import { registerRoomSocketEvents } from '../room/socket';
import { registerSyncSocketEvents } from '../sync/socket';
import { registerStoreSocketEvents } from '../websocket/store';
import { TranscodeSessionManager, CACHE_DIR } from '@roomies/transcoding';
import { CORS_ORIGIN } from '@roomies/config';
import { SocketEmitter } from '../websocket/emitter';
import { roomStore } from '../room/store';

export const bootstrap = async (app: FastifyInstance) => {
  // 0. Global Cache Cleanup
  // Ensure we start with a clean slate to prevent disk leaks from past crashes
  try {
    if (fs.existsSync(CACHE_DIR)) {
      const files = fs.readdirSync(CACHE_DIR);
      for (const file of files) {
        fs.rmSync(require('path').join(CACHE_DIR, file), { recursive: true, force: true });
      }
    } else {
      fs.mkdirSync(CACHE_DIR, { recursive: true });
    }
    console.log('Cleaned up global transcode cache directory');
  } catch (err) {
    console.error('Failed to clean global cache directory', err);
  }

  // 1. Register Plugins
  // The JWT is sent via the `Authorization` header (not cookies), so credentialed
  // CORS is not required. Origin is restricted to an explicit allow-list — a
  // literal '*' combined with `credentials: true` causes @fastify/cors to reflect
  // the caller's Origin, which would let any website make authenticated requests
  // on a logged-in user's behalf.
  const allowedOrigins = CORS_ORIGIN.split(',').map((origin) => origin.trim()).filter(Boolean);

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
    console.log('Connected to SQLite via Prisma');

    await initializeConfig();
  } catch (err) {
    console.error('Database connection failed', err);
    process.exit(1);
  }

  // 3. Wire up live transcoding error callback
  // When an FFmpeg variant process crashes during a live session, broadcast
  // the error to all connected clients in the room so the player UI
  // can react (e.g. fall back to another quality, show an error message).
  TranscodeSessionManager.onError((resolution, error) => {
    console.error('Transcoding variant error', { resolution, error: error.message });
    SocketEmitter.broadcastToRoom(app, {
      event: 'error',
      payload: {
        message: `Transcoding error for ${resolution}: ${error.message}`,
        code: 'TRANSCODE_ERROR',
      },
    });
  });

  // 4. Drive the transcoding cache/throttle loop
  // The package itself has no notion of "the room" or "the current playhead" —
  // this app owns both, so it's responsible for the scheduling.
  // Poll every 1 second (down from 5s) so a SIGSTOP'd FFmpeg process is
  // resumed within 1s of the player catching up to the transcoded window,
  // preventing unnecessary buffering stalls when FFmpeg was suspended.
  setInterval(() => {
    TranscodeSessionManager.manageActiveCaches(roomStore.getCurrentPosition());
  }, 1000);

  // 5. Register Global Hooks & Gateway
  registerChatSocketEvents();
  registerPlaybackSocketEvents();
  registerRoomSocketEvents();
  registerSyncSocketEvents();
  registerStoreSocketEvents();

  setupWebsocketGateway(app);

  // 6. Register Routes
  await app.register(authRoutes, { prefix: '/api/auth' });
  await app.register(userRoutes, { prefix: '/api/users' });
  await app.register(libraryRoutes, { prefix: '/api/library' });
  await app.register(chatRoutes, { prefix: '/api/chat' });
  await app.register(playbackRoutes, { prefix: '/api/playback' });
  await app.register(settingsRoutes, { prefix: '/api/settings' });

  // 7. Graceful shutdown — kill any running FFmpeg processes
  app.addHook('onClose', async () => {
    TranscodeSessionManager.stopSession();
  });
};
