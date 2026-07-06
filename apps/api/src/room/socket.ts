import { registerSocketEvent, SocketContext } from '../websocket/router';
import { RoomService } from './service';

export const registerRoomSocketEvents = () => {
  registerSocketEvent('room.join', async (payload: any, ctx: SocketContext) => {
    await RoomService.handleJoin(payload, ctx);
  });

  registerSocketEvent('room.leave', async (payload: any, ctx: SocketContext) => {
    await RoomService.handleLeave(payload, ctx);
  });

  registerSocketEvent('room.ready', async (payload: any, ctx: SocketContext) => {
    await RoomService.handleReady(payload, ctx);
  });

  registerSocketEvent('room.not_ready', async (payload: any, ctx: SocketContext) => {
    await RoomService.handleNotReady(payload, ctx);
  });

  // Handle internal disconnect event
  registerSocketEvent('system.disconnect', async (_payload: any, ctx: SocketContext) => {
    // Treat an abrupt disconnect as a room leave
    await RoomService.handleLeave({}, ctx);
  });
};