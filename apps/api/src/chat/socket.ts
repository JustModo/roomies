import { SocketRouter } from '../websocket/router';
import { ChatService } from './service';

export const registerChatSocketEvents = (router: SocketRouter, chat: ChatService) => {
  router.on('chat.send', (payload, ctx) => chat.handleSend(payload, ctx));
  router.on('emoji.send', (payload, ctx) => chat.handleEmoji(payload, ctx));
};
