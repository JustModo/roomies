import { SocketRouter, requireSocketRole } from '../websocket/router';
import { RoomService } from './service';

export const registerRoomSocketEvents = (router: SocketRouter, room: RoomService) => {
  router.on('room.join', (payload, ctx) => room.handleJoin(payload, ctx));
  router.on('room.leave', (payload, ctx) => room.handleLeave(payload, ctx));
  router.on('room.set_control_lock', (payload) => room.handleSetControlLock(payload), requireSocketRole('root'));
  router.on('room.update_settings', (payload) => room.handleUpdateSettings(payload), requireSocketRole('root'));
};
