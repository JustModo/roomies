import { registerSocketEvent, SocketContext } from '../websocket/router';
import { SyncService } from './service';

export const registerSyncSocketEvents = () => {
  registerSocketEvent('sync.heartbeat', async (payload: any, ctx: SocketContext) => {
    await SyncService.handleHeartbeat(payload, ctx);
  });

  registerSocketEvent('sync.buffering', async (payload: any, ctx: SocketContext) => {
    await SyncService.handleBuffering(payload, ctx);
  });

  registerSocketEvent('sync.buffered', async (payload: any, ctx: SocketContext) => {
    await SyncService.handleBuffered(payload, ctx);
  });
};
