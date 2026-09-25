import { RateLimiter } from '../common/rateLimiter';
import { SocketHub } from '../websocket/hub';
import { SocketContext, SocketPayload } from '../websocket/router';

// Emoji rate limit: 1 per 500ms per user.
const EMOJI_RATE_LIMIT_WINDOW_MS = 500;

export class ChatService {
  private emojiLimiter = new RateLimiter(EMOJI_RATE_LIMIT_WINDOW_MS, 1);

  constructor(private readonly hub: SocketHub) {}

  async handleSend(payload: SocketPayload<'chat.send'>, ctx: SocketContext) {
    this.hub.broadcast({
      event: 'chat.message',
      payload: { userId: ctx.userId, username: ctx.username, message: payload.message, timestamp: new Date().toISOString() },
    });
  }

  /** Broadcasts to the whole room, sender included as confirmation; excess reactions are silently dropped. */
  async handleEmoji(payload: SocketPayload<'emoji.send'>, ctx: SocketContext) {
    if (!this.emojiLimiter.allow(ctx.userId)) return;

    this.hub.broadcast({
      event: 'emoji.reaction',
      payload: { userId: ctx.userId, username: ctx.username, emoji: payload.emoji, timestamp: Date.now() },
    });
  }
}
