import { FastifyInstance } from 'fastify';
import { PlaybackController } from './controller';
import { ChangeMediaRequestSchema } from '@roomies/contracts';
import { verifyJwt, requireRole } from '../auth/middleware';

export const playbackRoutes = async (app: FastifyInstance) => {
  // All playback routes require authentication
  app.addHook('preHandler', verifyJwt);

  // GET /api/playback/active — current playback state (any authenticated user)
  app.get('/active', PlaybackController.getActive);

  // POST /api/playback/change-media — root-only: change the playing media
  app.post('/change-media', { preHandler: requireRole('root') }, async (req, reply) => {
    const parsed = ChangeMediaRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: 'Invalid request data',
        details: parsed.error.format(),
      });
    }

    req.body = parsed.data;
    return PlaybackController.changeMedia(req as any, reply);
  });
};
