import { SocketContext } from '../websocket/router';
import { IncomingSocketMessage } from '@roomies/contracts';
import { roomStore } from '../room/store';
import { SocketEmitter } from '../websocket/emitter';

type HeartbeatPayload = Extract<IncomingSocketMessage, { event: 'sync.heartbeat' }>['payload'];
type StatusPayload = Extract<IncomingSocketMessage, { event: 'sync.status' }>['payload'];

const DRIFT_THRESHOLD_MS = 2000;

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
    if (driftMs > DRIFT_THRESHOLD_MS) {
      SocketEmitter.sendToClient(ctx.socket, {
        event: 'sync.correct',
        payload: {
          position: expectedPosition,
          seek: true
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
      roomStore.setPlaybackState('waiting');
      SocketEmitter.broadcastToRoom(ctx.app, {
        event: 'playback.state',
        payload: roomStore.getState().playback
      });
    }
    
    // If NO ONE is buffering, and we were waiting, we can resume playing
    if (!anyoneBuffering && state.playback.state === 'waiting') {
      roomStore.setPlaybackState('playing');
      SocketEmitter.broadcastToRoom(ctx.app, {
        event: 'playback.state',
        payload: roomStore.getState().playback
      });
    }
  }
}
