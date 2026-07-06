import { SocketContext } from '../websocket/router';
import { IncomingSocketMessage } from '@roomies/contracts';
import { roomStore } from './store';
import { SocketEmitter } from '../websocket/emitter';

type RoomJoinPayload = Extract<IncomingSocketMessage, { event: 'room.join' }>['payload'];
type RoomLeavePayload = Extract<IncomingSocketMessage, { event: 'room.leave' }>['payload'];
type RoomReadyPayload = Extract<IncomingSocketMessage, { event: 'room.ready' }>['payload'];
type RoomNotReadyPayload = Extract<IncomingSocketMessage, { event: 'room.not_ready' }>['payload'];

export class RoomService {
  static async handleJoin(payload: RoomJoinPayload, ctx: SocketContext) {
    roomStore.addMember({
      username: ctx.username,
      userId: ctx.userId,
      ready: false,
      buffering: false,
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

  static async handleReady(payload: RoomReadyPayload, ctx: SocketContext) {
    roomStore.updateMember(ctx.userId, { ready: true });

    SocketEmitter.broadcastToRoom(ctx.app, {
      event: 'user.ready_changed',
      payload: { userId: ctx.userId, ready: true }
    });
  }

  static async handleNotReady(payload: RoomNotReadyPayload, ctx: SocketContext) {
    roomStore.updateMember(ctx.userId, { ready: false });

    SocketEmitter.broadcastToRoom(ctx.app, {
      event: 'user.ready_changed',
      payload: { userId: ctx.userId, ready: false }
    });
  }
}
