import { FastifyInstance } from 'fastify';
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
import { registerPlaybackSocketEvents, registerTranscodeEvents } from '../playback/socket';
import { registerRoomSocketEvents } from '../room/socket';
import { registerSyncSocketEvents } from '../sync/socket';
import { registerStoreSocketEvents } from '../websocket/store';
import { TranscodeSessionManager, TranscodeCache } from '@roomies/transcoding';
import { getCorsOptions } from '../config/cors';

export const bootstrap = async (app: FastifyInstance) => {
  TranscodeCache.cleanGlobalCache();

  await app.register(fastifyCors, getCorsOptions());

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

  registerTranscodeEvents(app);

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
    TranscodeSessionManager.stopAll();
    await prisma.$disconnect();
    console.log('[system] Graceful shutdown complete.');
  });
};
