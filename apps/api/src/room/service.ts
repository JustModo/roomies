import { SocketContext } from '../websocket/router';
import { IncomingSocketMessage } from '@roomies/contracts';
import { roomStore } from './store';
import { SocketEmitter } from '../websocket/emitter';
import { coordinator } from '../playback/coordinator';

type RoomJoinPayload = Extract<IncomingSocketMessage, { event: 'room.join' }>['payload'];
type RoomLeavePayload = Extract<IncomingSocketMessage, { event: 'room.leave' }>['payload'];

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

    SocketEmitter.broadcastToRoom(ctx.app, {
      event: 'user.joined',
      payload: {
        userId: ctx.userId,
        username: ctx.username,
      }
    });
  }

  static async handleLeave(payload: RoomLeavePayload, ctx: SocketContext) {
    let state = roomStore.getState();
    const member = state.members.find(m => m.userId === ctx.userId);
    const wasAsync = member?.status === 'async';

    const wasRemoved = roomStore.removeMember(ctx.userId);
    if (!wasRemoved) return;

    if (wasAsync) {
      coordinator.removeAsyncPlayhead(ctx.userId);
    }

    state = roomStore.getState();
    const anyoneBuffering = state.members.some(m => m.status === 'buffering');

    // NOTE: Pause playback if the room is now empty.
    if (state.members.length === 0 && (state.playback.state === 'playing' || state.playback.intendedState === 'playing')) {
      roomStore.updatePlayback({ state: 'paused', intendedState: 'paused', anchorTime: Date.now() });
      SocketEmitter.broadcastToRoom(ctx.app, {
        event: 'playback.state',
        payload: roomStore.getState().playback
      });
    } else if (!anyoneBuffering && (state.playback.state === 'waiting' || state.playback.state === 'buffering')) {
      // NOTE: Resume playback if the departing member was the only one buffering.
      roomStore.updatePlayback({ state: state.playback.intendedState, anchorTime: Date.now() });
      SocketEmitter.broadcastToRoom(ctx.app, {
        event: 'playback.state',
        payload: roomStore.getState().playback
      });
    }

    SocketEmitter.broadcastToRoom(ctx.app, {
      event: 'user.left',
      payload: {
        userId: ctx.userId,
        username: ctx.username,
      }
    });
  }
}
