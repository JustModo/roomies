import { FastifyInstance } from 'fastify';
import { WebSocket } from '@fastify/websocket';
import { IncomingSocketMessage } from '@roomies/contracts/src/socket';
import { handleClientChat } from '../chat/socket';
import {
  handleClientJoin,
  handleClientPlay,
  handleClientPause,
  handleClientSeek,
  handleClientHeartbeat,
} from '../playback/socket';

export interface SocketContext {
  app: FastifyInstance;
  socket: WebSocket;
  userId: string;
  socketId: string;
}

export const dispatchSocketEvent = async (
  message: IncomingSocketMessage,
  ctx: SocketContext
) => {
  try {
    switch (message.event) {
      case 'client.join':
        await handleClientJoin(message.payload, ctx);
        break;
      case 'client.play':
        await handleClientPlay(message.payload, ctx);
        break;
      case 'client.pause':
        await handleClientPause(message.payload, ctx);
        break;
      case 'client.seek':
        await handleClientSeek(message.payload, ctx);
        break;
      case 'client.heartbeat':
        await handleClientHeartbeat(message.payload, ctx);
        break;
      case 'client.chat':
        await handleClientChat(message.payload, ctx);
        break;
      default:
        ctx.app.log.warn({ event: (message as any).event }, 'No handler implemented for socket event');
    }
  } catch (err) {
    ctx.app.log.error({ err, event: message.event }, 'Error handling socket event');
  }
};
