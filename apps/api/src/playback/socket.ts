import { FastifyBaseLogger } from 'fastify';
import { TranscodeSessionManager } from '@roomies/transcoding';
import { SocketHub } from '../websocket/hub';
import { SocketRouter } from '../websocket/router';
import { PlaybackService } from './service';

export const registerPlaybackSocketEvents = (router: SocketRouter, playback: PlaybackService) => {
  const guards = [playback.controlsUnlocked, playback.acceptsCommand];

  router.on('playback.play', (payload, ctx) => playback.handlePlay(payload, ctx), ...guards);
  router.on('playback.pause', (payload, ctx) => playback.handlePause(payload, ctx), ...guards);
  router.on('playback.seek', (payload, ctx) => playback.handleSeek(payload, ctx), ...guards);
  router.on('playback.set_rate', (payload, ctx) => playback.handleSetRate(payload, ctx), ...guards);
};

/** NOTE: Broadcast transcoding failures to all clients. */
export const registerTranscodeEvents = (transcoder: TranscodeSessionManager, hub: SocketHub, log: FastifyBaseLogger) => {
  transcoder.onError((resolution, error) => {
    log.error({ resolution, err: error }, 'Transcoding variant error');
    hub.broadcast({
      event: 'error',
      payload: { message: `Transcoding error for ${resolution}: ${error.message}`, code: 'TRANSCODE_ERROR' },
    });
  });
};
