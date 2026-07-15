import { FastifyReply, FastifyRequest } from 'fastify';
import { ChangeMediaRequest } from '@roomies/contracts';
import { PlaybackService } from './service';
import { Resolution } from '@roomies/transcoding';

export const PlaybackController = {
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

  async stopMedia(req: FastifyRequest, reply: FastifyReply) {
    try {
      await PlaybackService.stopMedia(req.server);
      req.log.info('Media playback stopped');
      return reply.send({ success: true });
    } catch (error: any) {
      req.log.error(error, 'Failed to stop media');
      return reply.status(500).send({ error: 'Internal server error' });
    }
  },

  async getActive(req: FastifyRequest, reply: FastifyReply) {
    const active = PlaybackService.getActivePlayback();
    return reply.send(active);
  },

  async getMasterPlaylist(req: FastifyRequest, reply: FastifyReply) {
    const { offset } = req.query as { offset?: string };
    const offsetNum = offset ? parseInt(offset, 10) : undefined;
    const playlist = PlaybackService.generateMasterPlaylist(offsetNum);
    return reply
      .header('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate')
      .type('application/vnd.apple.mpegurl')
      .send(playlist);
  },

  async getVariantStream(req: FastifyRequest, reply: FastifyReply) {
    const { mediaId, sessionId, resolution } = req.params as { mediaId: string; sessionId: string; resolution: Resolution };
    const { offset } = req.query as { offset?: string };
    const offsetNum = offset ? parseInt(offset, 10) : undefined;
    try {
      const playlistContent = await PlaybackService.getVariantPlaylist(mediaId, sessionId, resolution, offsetNum);
      return reply
        .header('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate')
        .type('application/vnd.apple.mpegurl')
        .send(playlistContent);
    } catch (error: any) {
      if (error.message === 'Session not found') {
        return reply.status(404).send({ error: error.message });
      }
      req.log.error(error, 'Failed to start transcoding variant');
      return reply.status(500).send({ error: 'Failed to start transcoding variant' });
    }
  }
};
