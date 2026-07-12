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
import { LibraryService } from '@roomies/library';
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
  // NOTE: Clean up cache directory to prevent disk leaks from past crashes.
  try {
    if (fs.existsSync(CACHE_DIR)) {
      const files = fs.readdirSync(CACHE_DIR);
      for (const file of files) {
        fs.rmSync(require('path').join(CACHE_DIR, file), { recursive: true, force: true });
      }
    } else {
      fs.mkdirSync(CACHE_DIR, { recursive: true });
    }
    console.log('[transcode] Cleaned up global transcode cache directory.');
  } catch (err) {
    console.error('[transcode] Failed to clean global cache directory:', err);
  }

  // NOTE: JWT authorization uses headers, so credentialed CORS is not required.
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

  try {
    await prisma.$connect();
    console.log('[system] Connected to SQLite via Prisma.');

    await initializeConfig();

    try {
      console.log('[system] Initiating automatic startup library rescan...');
      await LibraryService.scanLibrary(prisma);
      console.log('[system] Startup library rescan completed.');
    } catch (scanErr) {
      console.error('[system] Failed to execute startup library rescan:', scanErr);
    }
  } catch (err) {
    console.error('[system] Database connection failed:', err);
    process.exit(1);
  }

  // NOTE: Broadcast transcoding failures to all clients.
  TranscodeSessionManager.onError((resolution, error) => {
    console.error('[transcode] Transcoding variant error:', { resolution, error: error.message });
    SocketEmitter.broadcastToRoom(app, {
      event: 'error',
      payload: {
        message: `Transcoding error for ${resolution}: ${error.message}`,
        code: 'TRANSCODE_ERROR',
      },
    });
  });

  // NOTE: Periodically trigger transcoding cache management based on playhead position.
  const cacheInterval = setInterval(() => {
    TranscodeSessionManager.manageActiveCaches(roomStore.getCurrentPosition());
  }, 1000);
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

  // 7. Graceful shutdown — kill any running FFmpeg processes
  app.addHook('onClose', async () => {
    clearInterval(cacheInterval);
    TranscodeSessionManager.stopSession();
    await prisma.$disconnect();
    console.log('[system] Graceful shutdown complete.');
  });
};
