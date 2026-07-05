import { Queue } from 'bullmq';

// Job data shape — fully typed
export interface TranscodeJobData {
  partyId: string;
  inputPath: string;
  outputDir: string;
}

// Status values stored in Redis
export type TranscodeStatus = 'pending' | 'processing' | 'ready' | 'failed';

export const TRANSCODE_QUEUE_NAME = 'transcode';

// Redis key for per-party transcode status
export const transcodeStatusKey = (partyId: string) => `transcode:status:${partyId}`;

export const transcodeQueue = new Queue<TranscodeJobData>(TRANSCODE_QUEUE_NAME, {
  connection: {
    url: process.env.REDIS_URL || 'redis://localhost:6379',
  },
  defaultJobOptions: {
    attempts: 2,
    backoff: { type: 'exponential', delay: 3000 },
    removeOnComplete: 100,
    removeOnFail: 50,
  },
});
