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

    SocketEmitter.broadcastToRoom(ctx.app, {
      event: 'room.state',
      payload: { room: roomStore.getState() }
    });
  }

  static async handleLeave(payload: RoomLeavePayload, ctx: SocketContext) {
    roomStore.removeMember(ctx.userId);

    SocketEmitter.broadcastToRoom(ctx.app, {
      event: 'user.left',
      payload: { userId: ctx.userId }
    });
  }

  // Removed handleReady and handleNotReady
}
