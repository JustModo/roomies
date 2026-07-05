import { createClient } from 'redis';
import { Repository, Schema } from 'redis-om';

export const redis = createClient({
  url: process.env.REDIS_URL || 'redis://localhost:6379'
});

redis.on('error', (err: any) => console.error('Redis Client Error', err));

export const connectRedis = async () => {
  if (!redis.isOpen) {
    await redis.connect();
  }
};

// --- Schemas ---

const presenceSchema = new Schema('presence', {
  userId: { type: 'string' },
  status: { type: 'string' }, // e.g., 'watching', 'typing', 'buffering', 'speaking', 'muted'
  lastSeen: { type: 'date' },
});

const chatSchema = new Schema('chat', {
  partyId: { type: 'string' },
  userId: { type: 'string' },
  message: { type: 'string' },
  timestamp: { type: 'date', sortable: true },
});

const playbackStateSchema = new Schema('playbackState', {
  partyId: { type: 'string' },
  currentMovieId: { type: 'string' },
  leaderId: { type: 'string' },
  position: { type: 'number' }, // in seconds
  speed: { type: 'number' },
  isPaused: { type: 'boolean' },
  subtitleTrack: { type: 'string' },
  audioTrack: { type: 'string' },
});

const socketSessionSchema = new Schema('socketSession', {
  userId: { type: 'string' },
  socketId: { type: 'string' },
  connectedAt: { type: 'date' },
});

// --- Repositories ---

export const presenceRepository = new Repository(presenceSchema, redis as any);
export const chatRepository = new Repository(chatSchema, redis as any);
export const playbackStateRepository = new Repository(playbackStateSchema, redis as any);
export const socketSessionRepository = new Repository(socketSessionSchema, redis as any);

export const initializeRedisIndices = async () => {
  await presenceRepository.createIndex();
  await chatRepository.createIndex();
  await playbackStateRepository.createIndex();
  await socketSessionRepository.createIndex();
};
