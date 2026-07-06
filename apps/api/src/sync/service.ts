import { SocketContext } from '../websocket/router';
import { IncomingSocketMessage } from '@roomies/contracts';

type HeartbeatPayload = Extract<IncomingSocketMessage, { event: 'sync.heartbeat' }>['payload'];
type BufferingPayload = Extract<IncomingSocketMessage, { event: 'sync.buffering' }>['payload'];
type BufferedPayload = Extract<IncomingSocketMessage, { event: 'sync.buffered' }>['payload'];

export class SyncService {
  static async handleHeartbeat(payload: HeartbeatPayload, ctx: SocketContext) {
    // TODO: Handle sync heartbeat logic
  }

  static async handleBuffering(payload: BufferingPayload, ctx: SocketContext) {
    // TODO: Handle user buffering logic
  }

  static async handleBuffered(payload: BufferedPayload, ctx: SocketContext) {
    // TODO: Handle user buffered logic
  }
}
