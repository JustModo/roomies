import { Repository, Schema } from 'redis-om';
import { redis } from '../database/redis';

export const presenceSchema = new Schema('presence', {
  userId: { type: 'string' },
  status: { type: 'string' }, // e.g., 'watching', 'typing', 'buffering', 'speaking', 'muted'
  lastSeen: { type: 'date' },
});

export const presenceRepository = new Repository(presenceSchema, redis as any);
