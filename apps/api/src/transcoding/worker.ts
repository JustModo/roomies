import path from 'path';
import fs from 'fs/promises';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { transcodeQueue, TranscodeJob } from './queue';
import { setTranscodeStatus } from './status';

const execFileAsync = promisify(execFile);

/**
 * Resolves the ffmpeg binary path.
 * - In Docker: installed via apk (system-level)
 * - Locally: relies on system PATH
 */
const FFMPEG_BIN = process.env.FFMPEG_PATH || 'ffmpeg';

const processTranscodeJob = async (job: TranscodeJob): Promise<void> => {
  const { partyId, inputPath, outputDir } = job.data;

  setTranscodeStatus(partyId, 'processing');

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

    setTranscodeStatus(partyId, 'ready');
  } catch (err) {
    // Don't mark 'failed' here — this attempt may still be retried by the
    // queue. The queue's 'failed' listener (bootstrap/index.ts) sets the
    // final status only once all retries are exhausted, so a client polling
    // status during the backoff window doesn't see a premature failure.
    throw err;
  }
};

// The queue instance itself is the "worker" (it runs jobs in-process and
// emits completed/failed), matching the shape bootstrap/index.ts expects.
export const createTranscodeWorker = () => {
  transcodeQueue.setProcessor(processTranscodeJob);
  return transcodeQueue;
};
