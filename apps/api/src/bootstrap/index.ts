import { FastifyInstance } from 'fastify';
import fastifyCors from '@fastify/cors';
import fastifyWebsocket from '@fastify/websocket';
import { connectRedis, initializeRedisIndices } from '../database/redis';
import { prisma } from '../database/postgres';
import { setupWebsocketGateway } from '../websocket/gateway';
import { authRoutes } from '../auth';
import { userRoutes } from '../users';
import { libraryRoutes } from '../library';
import { playbackRoutes } from '../playback/controller';
import { transcodingRoutes } from '../transcoding/controller';
import { createTranscodeWorker } from '../transcoding/worker';

export const bootstrap = async (app: FastifyInstance) => {
  // 1. Register Plugins
  await app.register(fastifyCors, {
    origin: '*', // Customize in production
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    credentials: true,
  });

  await app.register(fastifyWebsocket, {
    options: {
      maxPayload: 1048576,
    },
  });

  // 2. Connect Databases
  try {
    await prisma.$connect();
    app.log.info('Connected to PostgreSQL via Prisma');

    await connectRedis();
    await initializeRedisIndices();
    app.log.info('Connected to Redis and initialized OM indices');
  } catch (err) {
    app.log.error(err, 'Database connection failed');
    process.exit(1);
  }

  // 3. Start the BullMQ transcode worker (runs in-process, non-blocking)
  const transcodeWorker = createTranscodeWorker();
  transcodeWorker.on('completed', (job) => {
    app.log.info({ jobId: job.id, partyId: job.data.partyId }, 'Transcode job completed');
  });
  transcodeWorker.on('failed', (job, err) => {
    app.log.error({ jobId: job?.id, partyId: job?.data.partyId, err }, 'Transcode job failed');
  });

  // 4. Register Global Hooks & Gateway
  setupWebsocketGateway(app);

  // 5. Register Routes
  await app.register(authRoutes, { prefix: '/api/auth' });
  await app.register(userRoutes, { prefix: '/api/users' });
  await app.register(libraryRoutes, { prefix: '/api/library' });
  await app.register(playbackRoutes, { prefix: '/api/playback' });
  await app.register(transcodingRoutes, { prefix: '/api/transcoding' });
};
