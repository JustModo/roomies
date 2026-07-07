import { registerSocketEvent, SocketContext } from '../websocket/router';
import { RoomService } from './service';
import { IncomingSocketMessage } from '@roomies/contracts';

type RoomJoinPayload = Extract<IncomingSocketMessage, { event: 'room.join' }>['payload'];
type RoomLeavePayload = Extract<IncomingSocketMessage, { event: 'room.leave' }>['payload'];

export const registerRoomSocketEvents = () => {
  registerSocketEvent('room.join', async (payload: unknown, ctx: SocketContext) => {
    await RoomService.handleJoin(payload as RoomJoinPayload, ctx);
  });

  registerSocketEvent('room.leave', async (payload: unknown, ctx: SocketContext) => {
    await RoomService.handleLeave(payload as RoomLeavePayload, ctx);
  });

  // Removed room.ready and room.not_ready
};