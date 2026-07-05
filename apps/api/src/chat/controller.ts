import { FastifyReply, FastifyRequest } from 'fastify';
import { ChatHistoryResponse } from '@roomies/contracts';
import { chatStore } from './store';

interface HistoryQuery {
  partyId: string;
}

export const ChatController = {
  async getHistory(req: FastifyRequest<{ Querystring: HistoryQuery }>, reply: FastifyReply) {
    const { partyId } = req.query;
    if (!partyId) {
      return reply.status(400).send({ error: 'partyId query parameter is required' });
    }

    const messages = chatStore.getHistory(partyId);

    const response: ChatHistoryResponse = messages.map((m) => ({
      userId: m.userId,
      message: m.message,
      timestamp: m.timestamp.toISOString(),
    }));

    return reply.send(response);
  },
};
