import { SocketContext } from '../websocket/router';
import { IncomingSocketMessage } from '@roomies/contracts';
import { roomStore } from '../room/store';
import { SocketEmitter } from '../websocket/emitter';

type HeartbeatPayload = Extract<IncomingSocketMessage, { event: 'sync.heartbeat' }>['payload'];
type StatusPayload = Extract<IncomingSocketMessage, { event: 'sync.status' }>['payload'];

export class SyncService {
  static async handleHeartbeat(payload: HeartbeatPayload, ctx: SocketContext) {
    const { playback } = roomStore.getState();
    
    // Calculate expected position
    let expectedPosition = playback.anchorPosition;
    if (playback.state === 'playing') {
      const elapsedSeconds = (Date.now() - playback.anchorTime) / 1000;
      expectedPosition += elapsedSeconds * playback.playbackRate;
    }

    // Check drift
    const driftMs = Math.abs(expectedPosition - payload.position) * 1000;

    const SOFT_THRESHOLD_MS = 500;
    const HARD_THRESHOLD_MS = 4000;

    // Cooldown check for hard seeks to prevent feedback loops due to network/receiver latency.
    const lastSeekTime = (ctx.socket as any).lastSeekTime || 0;
    const now = Date.now();
    const isSeekingCooldown = (now - lastSeekTime) < 8000; // 8 seconds cooldown

    if (driftMs > HARD_THRESHOLD_MS && !isSeekingCooldown) {
      // Record the seek time to trigger the cooldown
      (ctx.socket as any).lastSeekTime = now;

      console.warn(`[SYNC] Hard seek correction for user ${ctx.userId}: drift of ${driftMs.toFixed(0)}ms. Seeking to ${expectedPosition.toFixed(2)}s`);
      SocketEmitter.sendToClient(ctx.socket, {
        event: 'sync.correct',
        payload: {
          position: expectedPosition,
          seek: true
        }
      });
    } else if (driftMs > SOFT_THRESHOLD_MS) {
      // If a playrate correction is already applied on the client, let it sync in its own time.
      const isCorrecting = payload.playbackRate !== playback.playbackRate;
      if (!isCorrecting) {
        // Soft correction: Speed up or slow down
        const isBehind = payload.position < expectedPosition;
        const correctionRate = isBehind ? 1.1 : 0.9;
        
        // Calculate how long (in ms) to hold this rate to catch up exactly
        // Speed Delta = Math.abs(correctionRate - playback.playbackRate)
        const speedDelta = Math.abs(correctionRate - playback.playbackRate);
        const correctionDurationMs = Math.round(driftMs / speedDelta);

        console.warn(`[SYNC] Soft rate correction for user ${ctx.userId}: drift of ${driftMs.toFixed(0)}ms. Applying ${correctionRate}x rate for ${correctionDurationMs}ms`);
        SocketEmitter.sendToClient(ctx.socket, {
          event: 'sync.correct',
          payload: {
            position: expectedPosition,
            playbackRate: correctionRate,
            correctionDurationMs
          }
        });
      }
    } else {
      // In sync: If the client is still correcting, tell them to reset to normal rate
      if (payload.playbackRate !== playback.playbackRate) {
        console.log(`[SYNC] User ${ctx.userId} is in sync. Resetting playbackRate to ${playback.playbackRate}x`);
        SocketEmitter.sendToClient(ctx.socket, {
          event: 'sync.correct',
          payload: {
            position: expectedPosition,
            playbackRate: playback.playbackRate
          }
        });
      }
    }

    // Update member's known position
    roomStore.updateMember(ctx.userId, { position: payload.position });
  }

  static async handleStatus(payload: StatusPayload, ctx: SocketContext) {
    roomStore.updateMember(ctx.userId, { status: payload.status });

    SocketEmitter.broadcastToRoom(ctx.app, {
      event: 'user.status_changed',
      payload: { userId: ctx.userId, status: payload.status }
    });
    
    const state = roomStore.getState();
    const anyoneBuffering = state.members.some(m => m.status === 'buffering');
    
    // If anyone is buffering, we MUST wait
    if (anyoneBuffering && state.playback.state === 'playing') {
      roomStore.updatePlayback({ state: 'buffering', anchorTime: Date.now() });
      SocketEmitter.broadcastToRoom(ctx.app, {
        event: 'playback.state',
        payload: roomStore.getState().playback
      });
    }
    
    // If NO ONE is buffering, and we were waiting/buffering, we can transition to the intended state
    if (!anyoneBuffering && (state.playback.state === 'waiting' || state.playback.state === 'buffering')) {
      roomStore.updatePlayback({ state: state.playback.intendedState, anchorTime: Date.now() });
      SocketEmitter.broadcastToRoom(ctx.app, {
        event: 'playback.state',
        payload: roomStore.getState().playback
      });
    }
  }
}
