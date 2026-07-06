import { registerSocketEvent, SocketContext } from '../websocket/router';
import { RoomService } from './service';

export const registerRoomSocketEvents = () => {
  registerSocketEvent('room.join', async (payload: any, ctx: SocketContext) => {
    await RoomService.handleJoin(payload, ctx);
  });

  registerSocketEvent('room.leave', async (payload: any, ctx: SocketContext) => {
    await RoomService.handleLeave(payload, ctx);
  });

  // Removed room.ready and room.not_ready
};