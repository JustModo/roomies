import { FastifyInstance } from 'fastify';
import fastifyCors from '@fastify/cors';
import fastifyWebsocket from '@fastify/websocket';
import { prisma } from '../database/sqlite';
import { setupWebsocketGateway } from '../websocket/gateway';
import { authRoutes } from '../auth';
import { userRoutes } from '../users';
import { libraryRoutes } from '../library';
import { playbackRoutes } from '../playback/controller';
import { transcodingRoutes } from '../transcoding/controller';
import { chatRoutes } from '../chat';
import { createTranscodeWorker } from '../transcoding/worker';
import { setTranscodeStatus } from '../transcoding/status';
import { initializeConfig } from '../config';

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

  // 3. Start the in-process transcode worker (single Node process, no external queue)
  const transcodeWorker = createTranscodeWorker();
  transcodeWorker.on('completed', (job) => {
    app.log.info({ jobId: job.id, partyId: job.data.partyId }, 'Transcode job completed');
  });
  transcodeWorker.on('failed', (job, err) => {
    // All retries are exhausted by the time this fires — safe to mark the
    // job's final status as failed (see transcoding/worker.ts for why this
    // isn't set on every attempt).
    if (job?.data?.partyId) {
      setTranscodeStatus(job.data.partyId, 'failed');
    }
    app.log.error({ jobId: job?.id, partyId: job?.data?.partyId, err }, 'Transcode job failed');
  });

  // 4. Register Global Hooks & Gateway
  setupWebsocketGateway(app);

  // 5. Register Routes
  await app.register(authRoutes, { prefix: '/api/auth' });
  await app.register(userRoutes, { prefix: '/api/users' });
  await app.register(libraryRoutes, { prefix: '/api/library' });
  await app.register(playbackRoutes, { prefix: '/api/playback' });
  await app.register(transcodingRoutes, { prefix: '/api/transcoding' });
  await app.register(chatRoutes, { prefix: '/api/chat' });
};
