import { FastifyInstance } from 'fastify';
import { WebSocket } from '@fastify/websocket';
import { IncomingSocketMessage } from '@roomies/contracts/src/socket';
import { handleClientChat } from '../chat/socket';
import { handleClientPlay, handleClientPause } from '../playback/socket';

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
      case 'client.chat':
        await handleClientChat(message.payload, ctx);
        break;
      case 'client.play':
        await handleClientPlay(message.payload, ctx);
        break;
      case 'client.pause':
        await handleClientPause(message.payload, ctx);
        break;
      // 'client.seek' goes here etc.
      default:
        ctx.app.log.warn({ event: message.event }, 'No handler implemented for socket event');
    }
  } catch (err) {
    ctx.app.log.error({ err, event: message.event }, 'Error handling socket event');
  }
};
