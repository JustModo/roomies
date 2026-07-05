import { FastifyInstance } from 'fastify';
import { AuthController } from './controller';

export const authRoutes = async (app: FastifyInstance) => {
  app.post('/setup', AuthController.setupRoot);
  app.post('/login', AuthController.login);
};
