import { SocketRouter } from '../websocket/router';
import { SyncService } from './service';

export const registerSyncSocketEvents = (router: SocketRouter, sync: SyncService) => {
  router.on('sync.heartbeat', (payload, ctx) => sync.handleHeartbeat(payload, ctx));
  router.on('sync.status', (payload, ctx) => sync.handleStatus(payload, ctx));
};
