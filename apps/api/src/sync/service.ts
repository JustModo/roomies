import { SocketContext } from '../websocket/router';
import { IncomingSocketMessage } from '@roomies/contracts';
import { roomStore } from '../room/store';
import { SocketEmitter } from '../websocket/emitter';
import { TranscodeSessionManager } from '@roomies/transcoding';
import { coordinator } from '../playback/coordinator';
import { getMasterPlaylistUrl } from '../playback/service';

type HeartbeatPayload = Extract<IncomingSocketMessage, { event: 'sync.heartbeat' }>['payload'];
type StatusPayload = Extract<IncomingSocketMessage, { event: 'sync.status' }>['payload'];

export class SyncService {
  static async handleHeartbeat(payload: HeartbeatPayload, ctx: SocketContext) {
    const state = roomStore.getState();
    const member = state.members.find(m => m.userId === ctx.userId);
    if (member && member.status === 'async') {
      roomStore.updateMember(ctx.userId, { position: payload.position });
      return;
    }

    const { playback } = state;
    const expectedPosition = this.calculateExpectedPosition(playback);
    const driftMs = Math.abs(expectedPosition - payload.position) * 1000;

    const SOFT_THRESHOLD_MS = 500;
    const HARD_THRESHOLD_MS = 4000;

    // NOTE: Cooldown check for hard seeks to prevent feedback loops.
    const lastSeekTime = (ctx.socket as any).lastSeekTime || 0;
    const now = Date.now();
    const isSeekingCooldown = (now - lastSeekTime) < 8000;

    if (driftMs > HARD_THRESHOLD_MS && !isSeekingCooldown) {
      this.applyHardCorrection(ctx, expectedPosition, driftMs, now);
    } else if (driftMs > SOFT_THRESHOLD_MS) {
      this.applySoftCorrection(ctx, payload, playback, expectedPosition, driftMs);
    } else {
      this.clearSoftCorrection(ctx, payload, playback, expectedPosition);
    }

    roomStore.updateMember(ctx.userId, { position: payload.position });
  }

  private static calculateExpectedPosition(playback: ReturnType<typeof roomStore.getState>['playback']): number {
    let expectedPosition = playback.anchorPosition;
    if (playback.state === 'playing') {
      const elapsedSeconds = (Date.now() - playback.anchorTime) / 1000;
      expectedPosition += elapsedSeconds * playback.playbackRate;
    }
    return expectedPosition;
  }

  private static applyHardCorrection(ctx: SocketContext, expectedPosition: number, driftMs: number, now: number) {
    (ctx.socket as any).lastSeekTime = now;
    console.warn(`[sync] Hard seek correction for user ${ctx.userId}: drift of ${driftMs.toFixed(0)}ms. Seeking to ${expectedPosition.toFixed(2)}s`);
    SocketEmitter.sendToClient(ctx.socket, {
      event: 'sync.correct',
      payload: {
        position: expectedPosition,
        seek: true
      }
    });
  }

  private static applySoftCorrection(ctx: SocketContext, payload: HeartbeatPayload, playback: ReturnType<typeof roomStore.getState>['playback'], expectedPosition: number, driftMs: number) {
    const isCorrecting = payload.playbackRate !== playback.playbackRate;
    if (!isCorrecting) {
      const isBehind = payload.position < expectedPosition;
      const correctionRate = isBehind ? 1.1 : 0.9;
      
      const speedDelta = Math.abs(correctionRate - playback.playbackRate);
      const correctionDurationMs = Math.round(driftMs / speedDelta);

      console.warn(`[sync] Soft rate correction for user ${ctx.userId}: drift of ${driftMs.toFixed(0)}ms. Applying ${correctionRate}x rate for ${correctionDurationMs}ms`);
      SocketEmitter.sendToClient(ctx.socket, {
        event: 'sync.correct',
        payload: {
          position: expectedPosition,
          playbackRate: correctionRate,
          correctionDurationMs
        }
      });
    }
  }

  private static clearSoftCorrection(ctx: SocketContext, payload: HeartbeatPayload, playback: ReturnType<typeof roomStore.getState>['playback'], expectedPosition: number) {
    if (payload.playbackRate !== playback.playbackRate) {
      console.log(`[sync] User ${ctx.userId} is in sync. Resetting playbackRate to ${playback.playbackRate}x`);
      SocketEmitter.sendToClient(ctx.socket, {
        event: 'sync.correct',
        payload: {
          position: expectedPosition,
          playbackRate: playback.playbackRate
        }
      });
    }
  }

  static async handleStatus(payload: StatusPayload, ctx: SocketContext) {
    const state = roomStore.getState();
    const member = state.members.find(m => m.userId === ctx.userId);
    const wasAsync = member?.status === 'async';
    const isNowAsync = payload.status === 'async';

    if (isNowAsync && !wasAsync) {
      await this.handleEnterAsyncMode(ctx, payload, state, member);
    } else if (!isNowAsync && wasAsync) {
      this.handleExitAsyncMode(ctx, payload, state);
    } else {
      roomStore.updateMember(ctx.userId, { status: payload.status });
    }

    SocketEmitter.broadcastToRoom(ctx.app, {
      event: 'user.status_changed',
      payload: { userId: ctx.userId, status: payload.status }
    });
    
    this.reconcileRoomBufferingState(ctx);
  }

  private static async handleEnterAsyncMode(
    ctx: SocketContext, 
    payload: StatusPayload, 
    state: ReturnType<typeof roomStore.getState>, 
    member: ReturnType<typeof roomStore.getState>['members'][0] | undefined
  ) {
    // ENTERING ASYNC: Compute offset based on actual current playhead
    const position = member?.position || state.playback.anchorPosition;
    
    const { effectiveOffset } = await coordinator.resolveSeek(
      { type: 'user', userId: ctx.userId },
      position,
      state.mediaId!
    );

    roomStore.updateMember(ctx.userId, {
      status: payload.status,
      asyncSession: { transcodeOffset: effectiveOffset },
    });

    // Send the user-scoped media info back to start their HLS player
    SocketEmitter.sendToClient(ctx.socket, {
      event: 'media.changed',
      payload: {
        mediaFileId: state.mediaId!,
        title: state.mediaTitle || 'Unknown Media',
        hlsUrl: getMasterPlaylistUrl(state.mediaId!, ctx.userId),
        duration: state.duration,
        transcodeOffset: effectiveOffset,
        sessionScope: 'user',
        subtitles: state.subtitles,
      }
    });
  }

  private static handleExitAsyncMode(
    ctx: SocketContext, 
    payload: StatusPayload, 
    state: ReturnType<typeof roomStore.getState>
  ) {
    // EXITING ASYNC: Clean up async transcode session
    TranscodeSessionManager.stopSession(ctx.userId);
    roomStore.updateMember(ctx.userId, {
      status: payload.status,
      asyncSession: undefined,
    });

    // Send the room-scoped media info back to reset their HLS player
    SocketEmitter.sendToClient(ctx.socket, {
      event: 'media.changed',
      payload: {
        mediaFileId: state.mediaId!,
        title: state.mediaTitle || 'Unknown Media',
        hlsUrl: getMasterPlaylistUrl(state.mediaId!, 'sync'),
        duration: state.duration,
        transcodeOffset: state.transcodeOffset,
        sessionScope: 'room',
        subtitles: state.subtitles,
      }
    });
  }

  private static reconcileRoomBufferingState(ctx: SocketContext) {
    const state = roomStore.getState();
    const anyoneBuffering = state.members.some(m => m.status === 'buffering');
    
    if (anyoneBuffering && state.playback.state === 'playing') {
      // Pause room if someone starts buffering
      roomStore.updatePlayback({ state: 'buffering', anchorTime: Date.now() });
      SocketEmitter.broadcastToRoom(ctx.app, {
        event: 'playback.state',
        payload: roomStore.getState().playback
      });
    }
    
    if (!anyoneBuffering && (state.playback.state === 'waiting' || state.playback.state === 'buffering')) {
      // Resume playback if no members are buffering
      roomStore.updatePlayback({ state: state.playback.intendedState, anchorTime: Date.now() });
      SocketEmitter.broadcastToRoom(ctx.app, {
        event: 'playback.state',
        payload: roomStore.getState().playback
      });
    }
  }
}

