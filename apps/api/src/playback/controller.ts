import { FastifyReply, FastifyRequest } from 'fastify';
import { ChangeMediaRequest } from '@roomies/contracts';
import { PlaybackService } from './service';
import type { HlsParams, HlsQuery } from './routes';

type HlsRequest = FastifyRequest<{ Params: HlsParams; Querystring: HlsQuery }>;

const NOT_FOUND_ERRORS = ['Media file not found', 'Session media mismatch'];

const sendPlaylist = (reply: FastifyReply, playlist: string) =>
  reply
    .header('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate')
    .type('application/vnd.apple.mpegurl')
    .send(playlist);

const sendPlaylistError = (reply: FastifyReply, error: any, failure: string) => {
  if (NOT_FOUND_ERRORS.includes(error?.message)) {
    return reply.status(404).send({ error: error.message });
  }
  console.error(`[playback] ${failure}:`, error);
  return reply.status(500).send({ error: failure });
};

export const PlaybackController = {
  async changeMedia(req: FastifyRequest<{ Body: ChangeMediaRequest }>, reply: FastifyReply) {
    try {
      const result = await PlaybackService.changeMedia(req.body.mediaFileId, req.server);
      console.log(`[playback] Media changed to ${result.mediaFileId} (${result.title})`);
      return reply.send(result);
    } catch (error: any) {
      if (error.message === 'Media file not found') {
        return reply.status(404).send({ error: error.message });
      }
      console.error('[playback] Failed to change media:', error);
      return reply.status(500).send({ error: 'Internal server error' });
    }
  },

  async stopMedia(req: FastifyRequest, reply: FastifyReply) {
    try {
      await PlaybackService.stopMedia(req.server);
      console.log('[playback] Media playback stopped');
      return reply.send({ success: true });
    } catch (error: any) {
      console.error('[playback] Failed to stop media:', error);
      return reply.status(500).send({ error: 'Internal server error' });
    }
  },

  async getActive(req: FastifyRequest, reply: FastifyReply) {
    const active = PlaybackService.getActivePlayback();
    return reply.send(active);
  },

  async getMasterPlaylist(req: HlsRequest, reply: FastifyReply) {
    const { mediaId, sessionId } = req.params;
    try {
      const playlist = await PlaybackService.generateMasterPlaylist(mediaId, req.query.offset, sessionId);
      return sendPlaylist(reply, playlist);
    } catch (error: any) {
      return sendPlaylistError(reply, error, 'Failed to generate master playlist');
    }
  },

  async getVariantStream(req: HlsRequest, reply: FastifyReply) {
    const { mediaId, sessionId, resolution } = req.params;
    try {
      const playlistContent = await PlaybackService.getVariantPlaylist(mediaId, sessionId, resolution!, req.query.offset);
      return sendPlaylist(reply, playlistContent);
    } catch (error: any) {
      return sendPlaylistError(reply, error, 'Failed to start transcoding variant');
    }
  },

  async getAudioStream(req: HlsRequest, reply: FastifyReply) {
    const { mediaId, sessionId, trackId } = req.params;
    try {
      const playlistContent = await PlaybackService.getAudioPlaylist(mediaId, sessionId, trackId!, req.query.offset);
      return sendPlaylist(reply, playlistContent);
    } catch (error: any) {
      return sendPlaylistError(reply, error, 'Failed to start transcoding audio track');
    }
  }
};
