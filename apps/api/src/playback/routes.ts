import { FastifyInstance } from 'fastify';
import { PlaybackController } from './controller';
import { ChangeMediaRequestSchema } from '@roomies/contracts';
import { verifyJwt, requireRole } from '../auth/middleware';

export const playbackRoutes = async (app: FastifyInstance) => {
  // NOTE: Retrieve active playback state for any authenticated user.
  app.get('/active', { preHandler: [verifyJwt] }, PlaybackController.getActive);

  // NOTE: Only root users can change the playing media.
  app.post('/change-media', { preHandler: [verifyJwt, requireRole('root')] }, async (req, reply) => {
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

  app.post('/stop', { preHandler: [verifyJwt, requireRole('root')] }, async (req, reply) => {
    return PlaybackController.stopMedia(req as any, reply);
  });

  app.get('/hls/:mediaId/master.m3u8', PlaybackController.getMasterPlaylist);

  // NOTE: Ensure FFmpeg is running before redirecting variant requests to Caddy.
  app.get('/hls/:mediaId/:resolution/stream.m3u8', PlaybackController.getVariantStream);
};
