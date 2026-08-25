import { FastifyInstance } from 'fastify';
import { AuthController } from './controller';
import { loginRateLimit } from './middleware';

export const authRoutes = async (app: FastifyInstance) => {
  app.get('/status', AuthController.status);
  app.post('/setup', AuthController.setupRoot);
  app.post('/login', { preHandler: loginRateLimit }, AuthController.login);
};
