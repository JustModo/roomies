import { SocketContext } from '../websocket/router';
import { IncomingSocketMessage } from '@roomies/contracts';
import { roomStore } from '../room/store';
import { SocketEmitter } from '../websocket/emitter';

type HeartbeatPayload = Extract<IncomingSocketMessage, { event: 'sync.heartbeat' }>['payload'];
type BufferingPayload = Extract<IncomingSocketMessage, { event: 'sync.buffering' }>['payload'];
type BufferedPayload = Extract<IncomingSocketMessage, { event: 'sync.buffered' }>['payload'];

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

  static async handleBuffering(payload: BufferingPayload, ctx: SocketContext) {
    roomStore.updateMember(ctx.userId, { buffering: true });
    roomStore.setPlaybackState('buffering');
    
    SocketEmitter.broadcastToRoom(ctx.app, {
      event: 'sync.wait',
      payload: {}
    });
  }

  static async handleBuffered(payload: BufferedPayload, ctx: SocketContext) {
    roomStore.updateMember(ctx.userId, { buffering: false });
    
    const state = roomStore.getState();
    const anyoneBuffering = state.members.some(m => m.buffering);
    
    // Only resume to playing if the current state is buffering.
    // If the state is paused (user paused during buffering), stay paused.
    if (!anyoneBuffering && state.playback.state === 'buffering') {
      roomStore.setPlaybackState('playing');
      SocketEmitter.broadcastToRoom(ctx.app, {
        event: 'sync.resume',
        payload: {}
      });
    }
  }
}
