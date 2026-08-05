import fastify, { FastifyInstance } from 'fastify';
import fastifyCors from '@fastify/cors';
import fastifyMultipart from '@fastify/multipart';
import fastifyWebsocket from '@fastify/websocket';
import { createAppContext, AppContext, AppContextOptions } from './context';
import { setupWebsocketGateway } from './websocket/gateway';
import { setupVoiceGateway } from './voice/gateway';
import { authRoutes } from './auth';
import { userRoutes } from './users';
import { libraryRoutes } from './library';
import { chatRoutes } from './chat';
import { playbackRoutes } from './playback/routes';
import { LibraryService } from '@roomies/library';
import { TranscodeCache } from '@roomies/transcoding';
import { initializeConfig } from './config';
import { registerChatSocketEvents } from './chat/socket';
import { registerPlaybackSocketEvents, registerTranscodeEvents } from './playback/socket';
import { registerRoomSocketEvents } from './room/socket';
import { registerPartySocketEvents } from './party/socket';
import { registerSyncSocketEvents } from './sync/socket';
import { registerStoreSocketEvents } from './websocket/store';
import { getCorsOptions } from './config/cors';
export interface BootstrapOptions {
  /** Skip wiping the transcode cache directory on startup. Useful in tests. */
  skipTranscodeClean?: boolean;
  /** Skip the startup library disk scan. Useful in tests. */
  skipLibraryScan?: boolean;
  /** Skip hardware encoder detection (avoids spawning a subprocess). Useful in tests. */
  skipHardwareDetection?: boolean;
}

export interface CreateAppOptions extends AppContextOptions, BootstrapOptions { }

declare module 'fastify' {
  interface FastifyInstance {
    ctx: AppContext;
  }
}



export async function createApp(options: CreateAppOptions = {}): Promise<FastifyInstance> {
  const ctx = createAppContext(options);
  const app = fastify({ logger: false });

  app.decorate('ctx', ctx);

  if (!options.skipTranscodeClean) {
    ctx.transcodeManager.stopAll();
    TranscodeCache.cleanGlobalCache();
  }

  await app.register(fastifyCors, getCorsOptions());

  await app.register(fastifyMultipart, {
    limits: { fileSize: 5 * 1024 * 1024 }, // subtitle files are tiny; 5MB is generous
  });

  await app.register(fastifyWebsocket, {
    options: {
      maxPayload: 1048576,
    },
  });

  try {
    await ctx.prisma.$connect();

    await initializeConfig({ skipHardwareDetection: options.skipHardwareDetection });

    if (!options.skipLibraryScan) {
      try {
        const movieCount = await ctx.prisma.movie.count();
        if (movieCount === 0) {
          await LibraryService.scanLibrary(ctx.prisma);
        }
      } catch (scanErr) {
        console.error('[system] Failed to execute startup library scan:', scanErr);
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

  await app.register(authRoutes, { prefix: '/api/auth' });
  await app.register(userRoutes, { prefix: '/api/users' });
  await app.register(libraryRoutes, { prefix: '/api/library' });
  await app.register(chatRoutes, { prefix: '/api/chat' });
  await app.register(playbackRoutes, { prefix: '/api/playback' });

  app.addHook('onClose', async () => {
    ctx.transcodeManager.stopAll();
    await ctx.prisma.$disconnect();
  });

  return app;
}
