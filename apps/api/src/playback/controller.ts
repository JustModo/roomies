import { FastifyReply, FastifyRequest } from 'fastify';
import { ChangeMediaRequest } from '@roomies/contracts';
import { PlaybackService } from './service';
import { Resolution } from '../transcoding';

export const PlaybackController = {
  /**
   * POST /api/playback/change-media
   */
  async changeMedia(req: FastifyRequest<{ Body: ChangeMediaRequest }>, reply: FastifyReply) {
    try {
      const result = await PlaybackService.changeMedia(req.body.mediaFileId, req.server);
      req.log.info({ mediaFileId: result.mediaFileId, title: result.title }, 'Media changed');
      return reply.send(result);
    } catch (error: any) {
      if (error.message === 'Media file not found') {
        return reply.status(404).send({ error: error.message });
      }
      req.log.error(error, 'Failed to change media');
      return reply.status(500).send({ error: 'Internal server error' });
    }
  },

  /**
   * GET /api/playback/active
   */
  async getActive(req: FastifyRequest, reply: FastifyReply) {
    const active = PlaybackService.getActivePlayback();
    return reply.send(active);
  },

  /**
   * GET /api/playback/hls/:mediaId/master.m3u8
   */
  async getMasterPlaylist(req: FastifyRequest, reply: FastifyReply) {
    const playlist = PlaybackService.generateMasterPlaylist();
    return reply.type('application/vnd.apple.mpegurl').send(playlist);
  },

  /**
   * GET /api/playback/hls/:mediaId/:resolution/stream.m3u8
   */
  async getVariantStream(req: FastifyRequest, reply: FastifyReply) {
    const { mediaId, resolution } = req.params as { mediaId: string; resolution: Resolution };
    try {
      const redirectUrl = await PlaybackService.ensureVariant(mediaId, resolution);
      return reply.redirect(redirectUrl);
    } catch (error: any) {
      if (error.message === 'Session not found') {
        return reply.status(404).send({ error: error.message });
      }
      req.log.error(error, 'Failed to start transcoding variant');
      return reply.status(500).send({ error: 'Failed to start transcoding variant' });
    }
  }
};
