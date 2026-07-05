import { createClient } from 'redis';

export const redis = createClient({
  url: process.env.REDIS_URL || 'redis://localhost:6379'
});

redis.on('error', (err: any) => console.error('Redis Client Error', err));

export const connectRedis = async () => {
  if (!redis.isOpen) {
    await redis.connect();
  }
};

export const initializeRedisIndices = async () => {
  // Dynamic imports to avoid circular dependency since the repos depend on the redis client
  const { presenceRepository } = await import('../presence/redis');
  const { chatRepository } = await import('../chat/redis');
  const { playbackStateRepository } = await import('../playback/redis');
  const { socketSessionRepository } = await import('../websocket/redis');

  await presenceRepository.createIndex();
  await chatRepository.createIndex();
  await playbackStateRepository.createIndex();
  await socketSessionRepository.createIndex();
};
