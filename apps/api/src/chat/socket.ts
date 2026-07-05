import { SocketContext } from '../websocket/router';
import { IncomingSocketMessage } from '@roomies/contracts';
import { chatRepository } from './redis';

type ChatPayload = Extract<IncomingSocketMessage, { event: 'client.chat' }>['payload'];

export const handleClientChat = async (payload: ChatPayload, ctx: SocketContext) => {
  ctx.app.log.info({ userId: ctx.userId, message: payload.message }, 'Feature: Chat event received');
  
  // 1. Persist to Redis OM
  await chatRepository.save({
    partyId: payload.partyId,
    userId: ctx.userId,
    message: payload.message,
    timestamp: new Date(),
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
        timestamp: new Date().toISOString()
      }
    });

    for (const client of room) {
      client.send(serverMessage);
    }
  }
};
