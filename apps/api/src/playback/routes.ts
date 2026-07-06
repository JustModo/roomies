import { FastifyInstance } from 'fastify';
import { PlaybackController } from './controller';
import { ChangeMediaRequestSchema } from '@roomies/contracts';
import { verifyJwt, requireRole } from '../auth/middleware';

export const playbackRoutes = async (app: FastifyInstance) => {
  // GET /api/playback/active — current playback state (any authenticated user)
  app.get('/active', { preHandler: [verifyJwt] }, PlaybackController.getActive);

  // POST /api/playback/change-media — root-only: change the playing media
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

  // --- HLS Interceptor Routes (Unauthenticated, hit by hls.js) ---

  // 1. Serve dynamic master.m3u8 listing all 3 resolutions
  app.get('/hls/:mediaId/master.m3u8', PlaybackController.getMasterPlaylist);

  // 2. Intercept variant playlist request, ensure FFmpeg is running, then redirect to Caddy
  app.get('/hls/:mediaId/:resolution/stream.m3u8', PlaybackController.getVariantStream);
};
