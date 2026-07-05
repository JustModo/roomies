import { Worker, Job } from 'bullmq';
import path from 'path';
import fs from 'fs/promises';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { TranscodeJobData, TranscodeStatus, TRANSCODE_QUEUE_NAME, transcodeStatusKey } from './queue';
import { redis } from '../database/redis';

const execFileAsync = promisify(execFile);

/**
 * Resolves the ffmpeg binary path.
 * - In Docker: installed via apk (system-level)
 * - Locally: relies on system PATH
 */
const FFMPEG_BIN = process.env.FFMPEG_PATH || 'ffmpeg';

const setTranscodeStatus = async (partyId: string, status: TranscodeStatus) => {
  await redis.set(transcodeStatusKey(partyId), status, { EX: 86400 }); // 24h TTL
};

const processTranscodeJob = async (job: Job<TranscodeJobData>): Promise<void> => {
  const { partyId, inputPath, outputDir } = job.data;

  await setTranscodeStatus(partyId, 'processing');
  await job.updateProgress(5);

  // Ensure the output directory exists
  await fs.mkdir(outputDir, { recursive: true });

  const outputPlaylist = path.join(outputDir, 'index.m3u8');

  try {
    /**
     * HLS transcoding args:
     *  - Baseline H.264 profile for maximum device compatibility
     *  - 10-second segments, no playlist size limit
     *  - Segment filename pattern inside the outputDir
     */
    await execFileAsync(FFMPEG_BIN, [
      '-i', inputPath,
      '-profile:v', 'baseline',
      '-level', '3.0',
      '-start_number', '0',
      '-hls_time', '10',
      '-hls_list_size', '0',
      '-hls_segment_filename', path.join(outputDir, 'seg%03d.ts'),
      '-f', 'hls',
      outputPlaylist,
    ]);

    await setTranscodeStatus(partyId, 'ready');
    await job.updateProgress(100);
  } catch (err) {
    await setTranscodeStatus(partyId, 'failed');
    throw err; // let BullMQ handle retry
  }
};

export const createTranscodeWorker = () =>
  new Worker<TranscodeJobData>(
    TRANSCODE_QUEUE_NAME,
    processTranscodeJob,
    {
      connection: {
        url: process.env.REDIS_URL || 'redis://localhost:6379',
      },
      concurrency: 2, // max 2 simultaneous transcode jobs
    }
  );
