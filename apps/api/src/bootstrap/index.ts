import { FastifyInstance } from 'fastify';
import fastifyCors from '@fastify/cors';
import fastifyWebsocket from '@fastify/websocket';
import { prisma } from '../database/sqlite';
import { setupWebsocketGateway } from '../websocket/gateway';
import { setupVoiceGateway } from '../voice/gateway';
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
import { registerPartySocketEvents } from '../party/socket';
import { registerSyncSocketEvents } from '../sync/socket';
import { registerStoreSocketEvents } from '../websocket/store';
import { TranscodeSessionManager, TranscodeCache } from '@roomies/transcoding';
import { getCorsOptions } from '../config/cors';

export interface BootstrapOptions {
  /** Skip wiping the transcode cache directory on startup. Useful in tests. */
  skipTranscodeClean?: boolean;
  /** Skip the startup library disk scan. Useful in tests. */
  skipLibraryScan?: boolean;
  /** Skip hardware encoder detection (avoids spawning a subprocess). Useful in tests. */
  skipHardwareDetection?: boolean;
}

export const bootstrap = async (app: FastifyInstance, options: BootstrapOptions = {}) => {
  if (!options.skipTranscodeClean) {
    TranscodeCache.cleanGlobalCache();
  }

  await app.register(fastifyCors, getCorsOptions());

  await app.register(fastifyWebsocket, {
    options: {
      maxPayload: 1048576,
    },
  });

  try {
    await prisma.$connect();
    console.log('[system] Connected to SQLite via Prisma.');

    await initializeConfig({ skipHardwareDetection: options.skipHardwareDetection });

    if (!options.skipLibraryScan) {
      try {
        const movieCount = await prisma.movie.count();
        if (movieCount === 0) {
          console.log('[system] Database empty. Initiating initial library disk scan...');
          await LibraryService.scanLibrary(prisma);
          console.log('[system] Initial library scan completed.');
        } else {
          console.log('[system] Library loaded from database.');
        }
      } catch (scanErr) {
        console.error('[system] Failed to check/execute startup library scan:', scanErr);
      }
    }
  } catch (err) {
    console.error('[system] Database connection failed:', err);
    throw err;
  }

  registerTranscodeEvents(app);

  registerChatSocketEvents();
  registerPlaybackSocketEvents();
  registerRoomSocketEvents();
  registerPartySocketEvents();
  registerSyncSocketEvents();
  registerStoreSocketEvents();

  setupWebsocketGateway(app);
  setupVoiceGateway(app);

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
