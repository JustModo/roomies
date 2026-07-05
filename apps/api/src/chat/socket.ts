import { SocketContext } from '../websocket/router';
import { IncomingSocketMessage } from '@roomies/contracts/src/socket';

type ChatPayload = Extract<IncomingSocketMessage, { event: 'client.chat' }>['payload'];

export const handleClientChat = async (payload: ChatPayload, ctx: SocketContext) => {
  ctx.app.log.info({ userId: ctx.userId, message: payload.message }, 'Feature: Chat event received');
  // TODO: Add Redis chat persistence logic here
  // TODO: Broadcast to room via Redis PubSub here
};
