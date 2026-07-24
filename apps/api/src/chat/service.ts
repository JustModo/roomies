import { SocketContext } from '../websocket/router';
import { IncomingSocketMessage } from '@roomies/contracts';
import { chatStore, ChatMessage } from '@roomies/chat';
import { SocketEmitter } from '../websocket/emitter';
import { checkRateLimit } from '../utils/rateLimiter';

type ChatPayload = Extract<IncomingSocketMessage, { event: 'chat.send' }>['payload'];
type EmojiPayload = Extract<IncomingSocketMessage, { event: 'emoji.send' }>['payload'];

// Emoji rate limit: burst of 2, then 1 per 500ms (max ~2/sec sustained)
const EMOJI_RATE_LIMIT = { maxTokens: 2, refillRatePerMs: 1 / 500 };

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

  static async handleEmoji(payload: EmojiPayload, ctx: SocketContext) {
    // Rate limit: max 2 emojis burst, then 1 per 500ms
    if (!checkRateLimit(ctx.userId, EMOJI_RATE_LIMIT)) {
      console.log(`[chat] Emoji rate limited for ${ctx.userId}`);
      return; // Silently drop
    }

    console.log(`[chat] Emoji event received from ${ctx.userId}: ${payload.emoji}`);

    // Broadcast to the party room (including sender for confirmation)
    SocketEmitter.broadcastToRoom(ctx.app, {
      event: 'emoji.reaction',
      payload: {
        userId: ctx.userId,
        username: ctx.username,
        emoji: payload.emoji,
        timestamp: Date.now(),
      },
    });
  }

  static getHistory(): ChatMessage[] {
    return chatStore.getHistory();
  }
}
