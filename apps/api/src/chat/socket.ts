import { SocketContext } from '../websocket/router';
import { IncomingSocketMessage } from '@roomies/contracts';
import { chatStore } from './store';

type ChatPayload = Extract<IncomingSocketMessage, { event: 'client.chat' }>['payload'];

export const handleClientChat = async (payload: ChatPayload, ctx: SocketContext) => {
  ctx.app.log.info({ userId: ctx.userId, message: payload.message }, 'Feature: Chat event received');

  const timestamp = new Date();

  // 1. Persist to the in-memory chat store
  chatStore.append({
    partyId: payload.partyId,
    userId: ctx.userId,
    message: payload.message,
    timestamp,
  });

  // 2. Broadcast to the party room
  const rooms = (ctx.app as any).rooms as Map<string, Set<any>>;
  const room = rooms.get(payload.partyId);
  if (room) {
    const serverMessage = JSON.stringify({
      event: 'server.chat',
      payload: {
        userId: ctx.userId,
        message: payload.message,
        timestamp: timestamp.toISOString(),
      },
    });

    for (const client of room) {
      client.send(serverMessage);
    }
  }
};
