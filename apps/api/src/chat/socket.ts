import { SocketContext, registerSocketEvent } from '../websocket/router';
import { IncomingSocketMessage } from '@roomies/contracts';
import { ChatService } from './service';

type ChatPayload = Extract<IncomingSocketMessage, { event: 'chat.send' }>['payload'];

export const registerChatSocketEvents = () => {
  registerSocketEvent('chat.send', async (payload: unknown, ctx: SocketContext) => {
    await ChatService.handleSend(payload as ChatPayload, ctx);
  });
};
