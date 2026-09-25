import fastifyCookie from '@fastify/cookie';
import fastifyCors from '@fastify/cors';
import fastifyMultipart from '@fastify/multipart';
import fastifyWebsocket from '@fastify/websocket';
import { PrismaClient } from '@prisma/client';
import fastify, { FastifyInstance } from 'fastify';
import { Config, loadConfig } from '@roomies/config';
import { authRoutes } from './auth/routes';
import { loadSecrets } from './config';
import { errorHandler } from './config/errors';
import { AppContext, createAppContext } from './context';
import { createPrismaClient } from './database/sqlite';
import { healthRoutes } from './health/routes';
import { libraryRoutes } from './library/routes';
import { playbackRoutes } from './playback/routes';
import { userRoutes } from './users/routes';

export interface CreateAppOptions {
  /** Server config; defaults to loadConfig(). */
  config?: Config;
  /** Database client to use; defaults to one built from the config's DATABASE_URL. */
  prisma?: PrismaClient;
  /** Pino log level; defaults to LOG_LEVEL or 'info'. */
  logLevel?: string;
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
  // NOTE: trustProxy so req.ip is the real client behind Caddy, not loopback —
  // the login rate limiter keys on it. Only Caddy's port is published.
  const app = fastify({ logger: { level: options.logLevel ?? process.env.LOG_LEVEL ?? 'info' }, trustProxy: true });
  const config = options.config ?? loadConfig();
  const prisma = options.prisma ?? createPrismaClient(config.DATABASE_URL, config.NODE_ENV === 'development');

  await prisma.$connect();
  const secrets = await loadSecrets(prisma, app.log.child({ module: 'config' }));
  const ctx = createAppContext(config, prisma, secrets, app.log);

  if (!options.skipTranscodeClean) ctx.transcoder.clearCache();
  if (!options.skipHardwareDetection) await ctx.transcoder.encoder.detect();
  app.decorate('ctx', ctx);
  app.setErrorHandler(errorHandler);

  await app.register(fastifyCookie);
  // NOTE: The web app and API share one origin behind Caddy, so the auth cookies never need credentialed CORS.
  await app.register(fastifyCors, { origin: config.CORS_ORIGIN, methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'], credentials: false });
  await app.register(fastifyMultipart, { limits: { fileSize: 5 * 1024 * 1024 } }); // subtitle files are tiny; 5MB is generous
  await app.register(fastifyWebsocket, { options: { maxPayload: 1048576 } });

  ctx.gateways.websocket.register(app);
  ctx.gateways.voice.register(app);

  const { controllers, guard } = ctx;
  await app.register(healthRoutes(controllers.health), { prefix: '/api/health' });
  await app.register(authRoutes(controllers.auth, guard), { prefix: '/api/auth' });
  await app.register(userRoutes(controllers.users, guard), { prefix: '/api/users' });
  await app.register(libraryRoutes(controllers.library, guard), { prefix: '/api/library' });
  await app.register(playbackRoutes(controllers.playback, guard), { prefix: '/api/playback' });

  app.addHook('onClose', async () => {
    await ctx.transcoder.stopAll();
    await prisma.$disconnect();
  });

  if (!options.skipLibraryScan && (await prisma.movie.count()) === 0) {
    await ctx.library.scan().catch((err) => app.log.error({ err }, 'Startup library scan failed'));
  }

  return app;
}
