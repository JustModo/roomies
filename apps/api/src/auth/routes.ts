import { FastifyInstance } from 'fastify';
import { AuthController } from './controller';
import { loginRateLimit, verifyMediaAccess } from './middleware';

export const authRoutes = async (app: FastifyInstance) => {
  app.get('/status', AuthController.status);
  app.post('/setup', AuthController.setupRoot);
  app.post('/login', { preHandler: loginRateLimit }, AuthController.login);
  app.post('/refresh', AuthController.refresh);
  app.post('/logout', AuthController.logout);
  app.get('/media', { preHandler: verifyMediaAccess }, AuthController.media);
};
