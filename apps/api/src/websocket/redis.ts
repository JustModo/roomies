import { Repository, Schema } from 'redis-om';
import { redis } from '../database/redis';

export const socketSessionSchema = new Schema('socketSession', {
  userId: { type: 'string' },
  socketId: { type: 'string' },
  connectedAt: { type: 'date' },
});

export const socketSessionRepository = new Repository(socketSessionSchema, redis as any);
