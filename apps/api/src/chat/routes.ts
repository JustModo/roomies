import { FastifyInstance } from 'fastify';
import { ChatController } from './controller';
import { verifyJwt } from '../auth/middleware';

export const chatRoutes = async (app: FastifyInstance) => {
  app.addHook('preHandler', verifyJwt);

  // GET /api/chat/history — last 500 messages
  app.get('/history', ChatController.getHistory);
};
