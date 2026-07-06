import { SocketContext, registerSocketEvent } from '../websocket/router';
import { IncomingSocketMessage } from '@roomies/contracts';
import { chatStore } from './store';

type ChatPayload = Extract<IncomingSocketMessage, { event: 'client.chat' }>['payload'];

export const handleClientChat = async (payload: ChatPayload, ctx: SocketContext) => {
  ctx.app.log.info({ userId: ctx.userId, message: payload.message }, 'Feature: Chat event received');

  const timestamp = new Date();

  // 1. Persist to the in-memory chat store
  chatStore.append({
    userId: ctx.userId,
    message: payload.message,
    timestamp,
  });

  // 2. Broadcast to the party room
  const room = ctx.app.room;
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
      if (client.readyState === 1) client.send(serverMessage);
    }
  }
};

export const registerChatSocketEvents = () => {
  registerSocketEvent('client.chat', handleClientChat);
};
