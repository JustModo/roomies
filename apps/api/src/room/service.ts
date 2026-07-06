import { SocketContext } from '../websocket/router';
import { IncomingSocketMessage } from '@roomies/contracts';

type RoomJoinPayload = Extract<IncomingSocketMessage, { event: 'room.join' }>['payload'];
type RoomLeavePayload = Extract<IncomingSocketMessage, { event: 'room.leave' }>['payload'];
type RoomReadyPayload = Extract<IncomingSocketMessage, { event: 'room.ready' }>['payload'];
type RoomNotReadyPayload = Extract<IncomingSocketMessage, { event: 'room.not_ready' }>['payload'];

export class RoomService {
  static async handleJoin(payload: RoomJoinPayload, ctx: SocketContext) {
    // TODO: Handle room join logic
  }

  static async handleLeave(payload: RoomLeavePayload, ctx: SocketContext) {
    // TODO: Handle room leave logic
  }

  static async handleReady(payload: RoomReadyPayload, ctx: SocketContext) {
    // TODO: Handle user ready logic
  }

  static async handleNotReady(payload: RoomNotReadyPayload, ctx: SocketContext) {
    // TODO: Handle user not ready logic
  }
}
