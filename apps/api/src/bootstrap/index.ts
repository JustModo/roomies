import { FastifyInstance } from 'fastify';
import fastifyCors from '@fastify/cors';
import fastifyWebsocket from '@fastify/websocket';
import { connectRedis, initializeRedisIndices } from '../database/redis';
import { prisma } from '../database/postgres';
import { setupWebsocketGateway } from '../websocket/gateway';
import { authRoutes } from '../auth';

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
    }
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

  // 3. Register Global Hooks & Gateway
  setupWebsocketGateway(app);

  // 4. Register Routes
  await app.register(authRoutes, { prefix: '/api/auth' });
  // TODO: Add app.register(userRoutes, { prefix: '/api/users' })
};
