import { Repository, Schema } from 'redis-om';
import { redis } from '../database/redis';

export const playbackStateSchema = new Schema('playbackState', {
  partyId: { type: 'string' },
  currentMovieId: { type: 'string' },
  leaderId: { type: 'string' },
  position: { type: 'number' }, // in seconds
  speed: { type: 'number' },
  isPaused: { type: 'boolean' },
  subtitleTrack: { type: 'string' },
  audioTrack: { type: 'string' },
  updatedAt: { type: 'number' },
});

export const playbackStateRepository = new Repository(playbackStateSchema, redis as any);
