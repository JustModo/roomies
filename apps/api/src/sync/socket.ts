import { registerSocketEvent, SocketContext } from '../websocket/router';
import { SyncService } from './service';

export const registerSyncSocketEvents = () => {
  registerSocketEvent('sync.heartbeat', async (payload: any, ctx: SocketContext) => {
    await SyncService.handleHeartbeat(payload, ctx);
  });

  registerSocketEvent('sync.status', async (payload: any, ctx: SocketContext) => {
    await SyncService.handleStatus(payload, ctx);
  });
};
