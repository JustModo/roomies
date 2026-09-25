import { FastifyPluginAsync } from 'fastify';
import { AuthGuard } from '../auth/middleware';
import { HlsRoute, PlaybackController } from './controller';

export const playbackRoutes =
  (controller: PlaybackController, guard: AuthGuard): FastifyPluginAsync =>
  async (app) => {
    // NOTE: Only root users can change or stop the playing media.
    const rootOnly = { preHandler: [guard.verifyJwt, guard.requireRole('root')] };
    const hlsGuard = { preHandler: [guard.verifyMediaAccess, controller.validateHls] };

    app.get('/active', { preHandler: guard.verifyJwt }, controller.getActive);
    app.post('/change-media', rootOnly, controller.changeMedia);
    app.post('/stop', rootOnly, controller.stopMedia);

    app.get<HlsRoute>('/hls/:mediaId/:sessionId/master.m3u8', hlsGuard, controller.getMasterPlaylist);
    // NOTE: Ensure FFmpeg is running before redirecting variant requests to Caddy.
    app.get<HlsRoute>('/hls/:mediaId/:sessionId/:resolution/stream.m3u8', hlsGuard, controller.getVariantStream);
    // Alternate-audio-track rendition route for multi-audio media files.
    app.get<HlsRoute>('/hls/:mediaId/:sessionId/audio/:trackId/stream.m3u8', hlsGuard, controller.getAudioStream);
  };
