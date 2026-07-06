import { registerSocketEvent, SocketContext } from '../websocket/router';
import { PlaybackService } from './service';

export const registerPlaybackSocketEvents = () => {
  registerSocketEvent('playback.play', async (payload: any, ctx: SocketContext) => {
    await PlaybackService.handlePlay(payload, ctx);
  });

  registerSocketEvent('playback.pause', async (payload: any, ctx: SocketContext) => {
    await PlaybackService.handlePause(payload, ctx);
  });

  registerSocketEvent('playback.seek', async (payload: any, ctx: SocketContext) => {
    await PlaybackService.handleSeek(payload, ctx);
  });

  registerSocketEvent('playback.set_rate', async (payload: any, ctx: SocketContext) => {
    await PlaybackService.handleSetRate(payload, ctx);
  });
};
