import { FastifyInstance } from 'fastify';
import { ChatController } from './controller';
import { verifyJwt } from '../common/authMiddleware';

export const chatRoutes = async (app: FastifyInstance) => {
  app.addHook('preHandler', verifyJwt);

  // GET /api/chat/history?partyId=... — last 500 messages for the party.
  app.get('/history', ChatController.getHistory);
};
