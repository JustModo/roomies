import { registerSocketEvent, SocketContext } from '../websocket/router';
import { SyncService } from './service';
import { IncomingSocketMessage } from '@roomies/contracts';

type HeartbeatPayload = Extract<IncomingSocketMessage, { event: 'sync.heartbeat' }>['payload'];
type StatusPayload = Extract<IncomingSocketMessage, { event: 'sync.status' }>['payload'];

export const registerSyncSocketEvents = () => {
  registerSocketEvent('sync.heartbeat', async (payload: unknown, ctx: SocketContext) => {
    await SyncService.handleHeartbeat(payload as HeartbeatPayload, ctx);
  });

  registerSocketEvent('sync.status', async (payload: unknown, ctx: SocketContext) => {
    await SyncService.handleStatus(payload as StatusPayload, ctx);
  });
};
