import { registerSocketEvent, SocketContext } from '../websocket/router';
import { createDebouncer } from '../websocket/middleware';
import { withPlaybackLock, withControlsCheck } from './middleware';
import { PlaybackService } from './service';
import { IncomingSocketMessage } from '@roomies/contracts';
import { TranscodeSessionManager } from '@roomies/transcoding';
import { SocketEmitter } from '../websocket/emitter';
import { FastifyInstance } from 'fastify';

type PlayPayload = Extract<IncomingSocketMessage, { event: 'playback.play' }>['payload'];
type PausePayload = Extract<IncomingSocketMessage, { event: 'playback.pause' }>['payload'];
type SeekPayload = Extract<IncomingSocketMessage, { event: 'playback.seek' }>['payload'];
type SetRatePayload = Extract<IncomingSocketMessage, { event: 'playback.set_rate' }>['payload'];

export const registerPlaybackSocketEvents = () => {
  registerSocketEvent(
    'playback.play',
    createDebouncer(500)(withControlsCheck(withPlaybackLock(async (payload: unknown, ctx: SocketContext) => {
      await PlaybackService.handlePlay(payload as PlayPayload, ctx);
    })))
  );

  registerSocketEvent(
    'playback.pause',
    createDebouncer(500)(withControlsCheck(withPlaybackLock(async (payload: unknown, ctx: SocketContext) => {
      await PlaybackService.handlePause(payload as PausePayload, ctx);
    })))
  );

  registerSocketEvent(
    'playback.seek',
    createDebouncer(150)(withControlsCheck(withPlaybackLock(async (payload: unknown, ctx: SocketContext) => {
      await PlaybackService.handleSeek(payload as SeekPayload, ctx);
    })))
  );

  registerSocketEvent(
    'playback.set_rate',
    createDebouncer(500)(withControlsCheck(withPlaybackLock(async (payload: unknown, ctx: SocketContext) => {
      await PlaybackService.handleSetRate(payload as SetRatePayload, ctx);
    })))
  );
};

export const registerTranscodeEvents = (app: FastifyInstance) => {
  // NOTE: Broadcast transcoding failures to all clients.
  TranscodeSessionManager.onError((resolution, error) => {
    console.error('[transcode] Transcoding variant error:', { resolution, error: error.message });
    SocketEmitter.broadcastToRoom(app, {
      event: 'error',
      payload: {
        message: `Transcoding error for ${resolution}: ${error.message}`,
        code: 'TRANSCODE_ERROR',
      },
    });
  });
};
