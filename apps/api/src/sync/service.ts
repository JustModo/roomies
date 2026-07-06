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
    if (driftMs > 2000) {
      // Hard correction: Seek
      SocketEmitter.sendToClient(ctx.socket, {
        event: 'sync.correct',
        payload: {
          position: expectedPosition,
          seek: true
        }
      });
    } else if (driftMs > 500) {
      // Soft correction: Speed up or slow down
      const isBehind = payload.position < expectedPosition;
      const correctionRate = isBehind ? 1.1 : 0.9;
      
      // Calculate how long (in ms) to hold this rate to catch up exactly
      // Speed Delta = 0.1
      // Time = Distance / Speed = driftMs / 0.1
      const correctionDurationMs = Math.round(driftMs / 0.1);

      SocketEmitter.sendToClient(ctx.socket, {
        event: 'sync.correct',
        payload: {
          position: expectedPosition,
          playbackRate: correctionRate,
          correctionDurationMs
        }
      });
    } else {
      // In sync: Reset correction rate
      SocketEmitter.sendToClient(ctx.socket, {
        event: 'sync.correct',
        payload: {
          position: expectedPosition,
          playbackRate: 1.0
        }
      });
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
