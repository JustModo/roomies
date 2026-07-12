import { SocketContext } from '../websocket/router';
import { IncomingSocketMessage } from '@roomies/contracts';
import { chatStore, ChatMessage } from '@roomies/chat';
import { SocketEmitter } from '../websocket/emitter';

type ChatPayload = Extract<IncomingSocketMessage, { event: 'chat.send' }>['payload'];

export class ChatService {
  static async handleSend(payload: ChatPayload, ctx: SocketContext) {
    console.log(`[chat] Chat event received from ${ctx.userId}: ${payload.message}`);

    const timestamp = new Date();

    // 1. Persist to the in-memory chat store
    chatStore.append({
      userId: ctx.userId,
      username: ctx.username,
      message: payload.message,
      timestamp,
    });

    // 2. Broadcast to the party room
    SocketEmitter.broadcastToRoom(ctx.app, {
      event: 'chat.message',
      payload: {
        userId: ctx.userId,
        username: ctx.username,
        message: payload.message,
        timestamp: timestamp.toISOString(),
      },
    });
  }

  static getHistory(): ChatMessage[] {
    return chatStore.getHistory();
  }
}
