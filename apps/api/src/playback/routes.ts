import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { PlaybackController } from './controller';
import { ChangeMediaRequestSchema } from '@roomies/contracts';
import { isResolution, Resolution } from '@roomies/transcoding';
import { verifyJwt, verifyMediaAccess, requireRole } from '../auth/middleware';
import { roomStore } from '../room/store';

const HlsParamsSchema = z.object({
  mediaId: z.string(),
  sessionId: z.enum(['sync', 'async']),
  resolution: z.custom<Resolution>((value) => typeof value === 'string' && isResolution(value)).optional(),
  trackId: z.string().optional(),
});

const HlsQuerySchema = z.object({
  offset: z.coerce.number().nonnegative().optional(),
});

export type HlsParams = z.infer<typeof HlsParamsSchema>;
export type HlsQuery = z.infer<typeof HlsQuerySchema>;

const validateHlsRequest = async (req: FastifyRequest, reply: FastifyReply) => {
  const params = HlsParamsSchema.safeParse(req.params);
  const query = HlsQuerySchema.safeParse(req.query);
  if (!params.success || !query.success) {
    return reply.status(400).send({ error: 'Invalid HLS request' });
  }

  const room = roomStore.getState();
  const { mediaId, trackId } = params.data;
  if (mediaId !== room.mediaId) {
    return reply.status(404).send({ error: 'Media is not playing' });
  }
  if (trackId !== undefined && !room.audioTracks.some((track) => track.id === trackId)) {
    return reply.status(404).send({ error: 'Audio track not found' });
  }

  req.params = params.data;
  req.query = query.data;
};

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

  type HlsRoute = { Params: HlsParams; Querystring: HlsQuery };
  const hlsGuard = { preHandler: [verifyMediaAccess, validateHlsRequest] };

  app.get<HlsRoute>('/hls/:mediaId/:sessionId/master.m3u8', hlsGuard, PlaybackController.getMasterPlaylist);

  // NOTE: Ensure FFmpeg is running before redirecting variant requests to Caddy.
  app.get<HlsRoute>('/hls/:mediaId/:sessionId/:resolution/stream.m3u8', hlsGuard, PlaybackController.getVariantStream);

  // Alternate-audio-track rendition route for multi-audio media files.
  app.get<HlsRoute>('/hls/:mediaId/:sessionId/audio/:trackId/stream.m3u8', hlsGuard, PlaybackController.getAudioStream);
};
