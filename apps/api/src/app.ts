import fastify, { FastifyInstance } from 'fastify';
import fastifyCookie from '@fastify/cookie';
import fastifyCors from '@fastify/cors';
import fastifyMultipart from '@fastify/multipart';
import fastifyWebsocket from '@fastify/websocket';
import { createAppContext, AppContext } from './context';
import { setupWebsocketGateway } from './websocket/gateway';
import { setupVoiceGateway } from './voice/gateway';
import { authRoutes } from './auth';
import { userRoutes } from './users';
import { libraryRoutes } from './library';
import { playbackRoutes } from './playback/routes';
import { LibraryService } from '@roomies/library';
import { TranscodeCache, TranscodeSessionManager } from '@roomies/transcoding';
import { initializeConfig } from './config';
import { registerChatSocketEvents } from './chat/socket';
import { registerPlaybackSocketEvents, registerTranscodeEvents } from './playback/socket';
import { registerRoomSocketEvents } from './room/socket';
import { registerPartySocketEvents } from './party/socket';
import { registerSyncSocketEvents } from './sync/socket';
import { getCorsOptions } from './config/cors';
import { errorHandler } from './config/errors';
import { healthRoutes } from './health';

export interface CreateAppOptions {
  /** Skip wiping the transcode cache directory on startup. Useful in tests. */
  skipTranscodeClean?: boolean;
  /** Skip the startup library disk scan. Useful in tests. */
  skipLibraryScan?: boolean;
  /** Skip hardware encoder detection (avoids spawning a subprocess). Useful in tests. */
  skipHardwareDetection?: boolean;
}

declare module 'fastify' {
  interface FastifyInstance {
    ctx: AppContext;
  }
}



export async function createApp(options: CreateAppOptions = {}): Promise<FastifyInstance> {
  const ctx = createAppContext();
  // NOTE: trustProxy so req.ip is the real client behind Caddy, not loopback —
  // the login rate limiter keys on it. Only Caddy's port is published.
  const app = fastify({ logger: false, trustProxy: true });

  app.decorate('ctx', ctx);
  app.setErrorHandler(errorHandler);

  if (!options.skipTranscodeClean) {
    await TranscodeSessionManager.stopAll();
    TranscodeCache.cleanGlobalCache();
  }

  await app.register(fastifyCookie);
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
  } catch (err) {
    console.error('[system] Database connection failed:', err);
    throw err;
  }

  try {
    await initializeConfig({ skipHardwareDetection: options.skipHardwareDetection });
  } catch (err) {
    console.error('[system] Server configuration failed:', err);
    throw err;
  }

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

  registerTranscodeEvents(app);

  registerChatSocketEvents();
  registerPlaybackSocketEvents();
  registerRoomSocketEvents();
  registerPartySocketEvents();
  registerSyncSocketEvents();

  setupWebsocketGateway(app);
  setupVoiceGateway(app);

  await app.register(healthRoutes, { prefix: '/api/health' });
  await app.register(authRoutes, { prefix: '/api/auth' });
  await app.register(userRoutes, { prefix: '/api/users' });
  await app.register(libraryRoutes, { prefix: '/api/library' });
  await app.register(playbackRoutes, { prefix: '/api/playback' });

  app.addHook('onClose', async () => {
    await TranscodeSessionManager.stopAll();
    await ctx.prisma.$disconnect();
  });

  return app;
}
