import { SocketContext } from '../websocket/router';
import { IncomingSocketMessage } from '@roomies/contracts';
import { roomStore } from './store';
import { SocketEmitter } from '../websocket/emitter';

type RoomJoinPayload = Extract<IncomingSocketMessage, { event: 'room.join' }>['payload'];
type RoomLeavePayload = Extract<IncomingSocketMessage, { event: 'room.leave' }>['payload'];
// Removed ready/not_ready payloads

export class RoomService {
  static async handleJoin(payload: RoomJoinPayload, ctx: SocketContext) {
    roomStore.addMember({
      username: ctx.username,
      userId: ctx.userId,
      status: 'buffering',
      position: 0,
    });

    const state = roomStore.getState();
    if (state.playback.state === 'playing') {
      roomStore.updatePlayback({ state: 'buffering', anchorTime: Date.now() });
    }

    SocketEmitter.broadcastToRoom(ctx.app, {
      event: 'room.state',
      payload: { room: roomStore.getState() }
    });
  }

  static async handleLeave(payload: RoomLeavePayload, ctx: SocketContext) {
    roomStore.removeMember(ctx.userId);

    const state = roomStore.getState();
    const anyoneBuffering = state.members.some(m => m.status === 'buffering');

    // If the person who left was the only one buffering, unpause the room!
    if (!anyoneBuffering && (state.playback.state === 'waiting' || state.playback.state === 'buffering')) {
      roomStore.updatePlayback({ state: state.playback.intendedState, anchorTime: Date.now() });
      SocketEmitter.broadcastToRoom(ctx.app, {
        event: 'playback.state',
        payload: roomStore.getState().playback
      });
    }

    SocketEmitter.broadcastToRoom(ctx.app, {
      event: 'user.left',
      payload: { userId: ctx.userId }
    });
  }

  // Removed handleReady and handleNotReady
}
