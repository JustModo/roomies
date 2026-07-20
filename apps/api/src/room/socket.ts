import { registerSocketEvent, SocketContext } from '../websocket/router';
import { RoomService } from './service';
import { IncomingSocketMessage } from '@roomies/contracts';

type RoomJoinPayload = Extract<IncomingSocketMessage, { event: 'room.join' }>['payload'];
type RoomLeavePayload = Extract<IncomingSocketMessage, { event: 'room.leave' }>['payload'];
type SetControlLockPayload = Extract<IncomingSocketMessage, { event: 'room.set_control_lock' }>['payload'];
type UpdateRoomSettingsPayload = Extract<IncomingSocketMessage, { event: 'room.update_settings' }>['payload'];

export const registerRoomSocketEvents = () => {
  registerSocketEvent('room.join', async (payload: unknown, ctx: SocketContext) => {
    await RoomService.handleJoin(payload as RoomJoinPayload, ctx);
  });

  registerSocketEvent('room.leave', async (payload: unknown, ctx: SocketContext) => {
    await RoomService.handleLeave(payload as RoomLeavePayload, ctx);
  });

  registerSocketEvent('room.set_control_lock', async (payload: unknown, ctx: SocketContext) => {
    await RoomService.handleSetControlLock(payload as SetControlLockPayload, ctx);
  });

  registerSocketEvent('room.update_settings', async (payload: unknown, ctx: SocketContext) => {
    await RoomService.handleUpdateSettings(payload as UpdateRoomSettingsPayload, ctx);
  });
};