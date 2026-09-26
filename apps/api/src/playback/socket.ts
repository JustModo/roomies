import { SocketRouter } from '../websocket/router';
import { PlaybackService } from './service';

export const registerPlaybackSocketEvents = (router: SocketRouter, playback: PlaybackService) => {
  const guards = [playback.controlsUnlocked, playback.hasMedia];

  router.on('playback.play', (payload, ctx) => playback.handlePlay(payload, ctx), ...guards);
  router.on('playback.pause', (payload, ctx) => playback.handlePause(payload, ctx), ...guards);
  router.on('playback.seek', (payload, ctx) => playback.handleSeek(payload, ctx), ...guards);
  router.on('playback.set_rate', (payload, ctx) => playback.handleSetRate(payload, ctx), ...guards);
};
