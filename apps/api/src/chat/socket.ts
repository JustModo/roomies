import { SocketContext, registerSocketEvent } from '../websocket/router';
import { IncomingSocketMessage } from '@roomies/contracts';
import { ChatService } from './service';

type ChatPayload = Extract<IncomingSocketMessage, { event: 'chat.send' }>['payload'];
type EmojiPayload = Extract<IncomingSocketMessage, { event: 'emoji.send' }>['payload'];

export const registerChatSocketEvents = () => {
  registerSocketEvent('chat.send', async (payload: unknown, ctx: SocketContext) => {
    await ChatService.handleSend(payload as ChatPayload, ctx);
  });

  registerSocketEvent('emoji.send', async (payload: unknown, ctx: SocketContext) => {
    await ChatService.handleEmoji(payload as EmojiPayload, ctx);
  });
};
