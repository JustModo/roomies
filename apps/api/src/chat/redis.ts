import { Repository, Schema } from 'redis-om';
import { redis } from '../database/redis';

export const chatSchema = new Schema('chat', {
  partyId: { type: 'string' },
  userId: { type: 'string' },
  message: { type: 'string' },
  timestamp: { type: 'date', sortable: true },
});

export const chatRepository = new Repository(chatSchema, redis as any);
