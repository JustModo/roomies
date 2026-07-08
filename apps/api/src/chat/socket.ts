import { SocketContext, registerSocketEvent } from '../websocket/router';
import { IncomingSocketMessage } from '@roomies/contracts';
import { chatStore } from './store';

type ChatPayload = Extract<IncomingSocketMessage, { event: 'chat.send' }>['payload'];

export const handleClientChat = async (payload: unknown, ctx: SocketContext) => {
  const chatPayload = payload as ChatPayload;
  console.log(`[chat] Chat event received from ${ctx.userId}: ${chatPayload.message}`);

  const timestamp = new Date();

  // 1. Persist to the in-memory chat store
  chatStore.append({
    userId: ctx.userId,
    message: chatPayload.message,
    timestamp,
  });

  // 2. Broadcast to the party room
  const room = ctx.app.room;
  if (room) {
    const serverMessage = JSON.stringify({
      event: 'chat.message',
      payload: {
        userId: ctx.userId,
        message: chatPayload.message,
        timestamp: timestamp.toISOString(),
      },
    });

    for (const client of room) {
      if (client.readyState === 1) client.send(serverMessage);
    }
  }
};

export const registerChatSocketEvents = () => {
  registerSocketEvent('chat.send', handleClientChat);
};
