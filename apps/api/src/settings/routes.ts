import { FastifyInstance } from 'fastify';
import { UpdateTranscodeSettingsRequestSchema } from '@roomies/contracts';
import { SettingsController } from './controller';
import { verifyJwt, requireRole } from '../auth/middleware';

export const settingsRoutes = async (app: FastifyInstance) => {
  app.addHook('preHandler', verifyJwt);
  app.addHook('preHandler', requireRole('root'));

  // GET /api/settings/transcode
  app.get('/transcode', SettingsController.getTranscode);

  // PATCH /api/settings/transcode
  app.patch('/transcode', async (req, reply) => {
    const parsed = UpdateTranscodeSettingsRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: 'Invalid request data',
        details: parsed.error.format(),
      });
    }

    req.body = parsed.data;
    return SettingsController.updateTranscode(req as any, reply);
  });
};
