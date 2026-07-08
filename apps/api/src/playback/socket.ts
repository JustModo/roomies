import { registerSocketEvent, SocketContext } from '../websocket/router';
import { withPlaybackLock } from './middleware';
import { PlaybackService } from './service';
import { IncomingSocketMessage } from '@roomies/contracts';

type PlayPayload = Extract<IncomingSocketMessage, { event: 'playback.play' }>['payload'];
type PausePayload = Extract<IncomingSocketMessage, { event: 'playback.pause' }>['payload'];
type SeekPayload = Extract<IncomingSocketMessage, { event: 'playback.seek' }>['payload'];
type SetRatePayload = Extract<IncomingSocketMessage, { event: 'playback.set_rate' }>['payload'];

export const registerPlaybackSocketEvents = () => {
  registerSocketEvent(
    'playback.play',
    withPlaybackLock(async (payload: unknown, ctx: SocketContext) => {
      await PlaybackService.handlePlay(payload as PlayPayload, ctx);
    })
  );

  registerSocketEvent(
    'playback.pause',
    withPlaybackLock(async (payload: unknown, ctx: SocketContext) => {
      await PlaybackService.handlePause(payload as PausePayload, ctx);
    })
  );

  registerSocketEvent(
    'playback.seek',
    withPlaybackLock(async (payload: unknown, ctx: SocketContext) => {
      await PlaybackService.handleSeek(payload as SeekPayload, ctx);
    })
  );

  registerSocketEvent(
    'playback.set_rate',
    withPlaybackLock(async (payload: unknown, ctx: SocketContext) => {
      await PlaybackService.handleSetRate(payload as SetRatePayload, ctx);
    })
  );
};
