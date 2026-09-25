import { SocketContext } from '../websocket/router';
import { IncomingSocketMessage } from '@roomies/contracts';
import { SocketEmitter } from '../websocket/emitter';
import { checkRateLimit } from '../websocket/middleware';

type ChatPayload = Extract<IncomingSocketMessage, { event: 'chat.send' }>['payload'];
type EmojiPayload = Extract<IncomingSocketMessage, { event: 'emoji.send' }>['payload'];

// Emoji rate limit: 1 per 500ms per user (simple time-window check)
const EMOJI_RATE_LIMIT_WINDOW_MS = 500;

export class ChatService {
  static async handleSend(payload: ChatPayload, ctx: SocketContext) {
    SocketEmitter.broadcastToRoom(ctx.app, {
      event: 'chat.message',
      payload: {
        userId: ctx.userId,
        username: ctx.username,
        message: payload.message,
        timestamp: new Date().toISOString(),
      },
    });
  }

  static async handleEmoji(payload: EmojiPayload, ctx: SocketContext) {
    // Rate limit: 1 emoji per 500ms per user
    if (!checkRateLimit(ctx.userId, EMOJI_RATE_LIMIT_WINDOW_MS)) {
      console.log(`[chat] Emoji rate limited for ${ctx.userId}`);
      return; // Silently drop
    }

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
}
