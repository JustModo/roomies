import { FastifyReply, FastifyRequest } from 'fastify';
import { ChatHistoryResponse } from '@roomies/contracts';
import { ChatService } from './service';

interface HistoryQuery {
}

export const ChatController = {
  async getHistory(req: FastifyRequest<{ Querystring: HistoryQuery }>, reply: FastifyReply) {
    const messages = ChatService.getHistory();

    const response: ChatHistoryResponse = messages.map((m) => ({
      userId: m.userId,
      username: m.username,
      message: m.message,
      timestamp: m.timestamp.toISOString(),
    }));

    return reply.send(response);
  },
};
