import { FastifyInstance } from 'fastify';
import { UsersController } from './controller';
import { UserSettingsSchema } from '@roomies/contracts';
import { verifyJwt } from '../common/authMiddleware';

export const userRoutes = async (app: FastifyInstance) => {
  // Apply JWT verification middleware to all routes in this plugin
  app.addHook('preHandler', verifyJwt);

  app.get('/me', UsersController.getMe);

  app.put('/settings', async (req, reply) => {
    const parsedBody = UserSettingsSchema.safeParse(req.body);
    if (!parsedBody.success) {
      return reply.status(400).send({ error: 'Invalid settings data', details: parsedBody.error.format() });
    }
    
    req.body = parsedBody.data;
    return UsersController.updateSettings(req as any, reply);
  });
};
