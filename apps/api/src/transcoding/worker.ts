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

// The H.264 encoder to use, and any encoder-specific options, are both
// configurable: ffmpeg builds vary in which H.264 encoder is available (the
// bundled software `libx264` isn't present in every distro/ffmpeg build —
// e.g. Fedora ships none by default, only hardware encoders + `libopenh264`),
// and `-profile:v`/`-level` option *values* are encoder-specific syntax
// (libx264 accepts "baseline"; libopenh264 requires "constrained_baseline").
// Explicitly selecting the codec instead of relying on ffmpeg's default
// avoids silently depending on whichever encoder a given build happens to
// pick, and lets a deployment override it to match its actual ffmpeg build.
const FFMPEG_VIDEO_CODEC = process.env.FFMPEG_VIDEO_CODEC || 'libx264';
const FFMPEG_VIDEO_CODEC_ARGS = process.env.FFMPEG_VIDEO_CODEC_ARGS
  ? process.env.FFMPEG_VIDEO_CODEC_ARGS.split(' ').filter(Boolean)
  : ['-profile:v', 'baseline', '-level', '3.0'];

const processTranscodeJob = async (job: TranscodeJob): Promise<void> => {
  const { partyId, inputPath, outputDir } = job.data;

  setTranscodeStatus(partyId, 'processing');

  // Ensure the output directory exists
  await fs.mkdir(outputDir, { recursive: true });

  const outputPlaylist = path.join(outputDir, 'index.m3u8');

  try {
    /**
     * HLS transcoding args:
     *  - Explicit H.264 encoder + baseline-equivalent profile for maximum device compatibility
     *  - 10-second segments, no playlist size limit
     *  - Segment filename pattern inside the outputDir
     */
    await execFileAsync(FFMPEG_BIN, [
      '-i', inputPath,
      '-c:v', FFMPEG_VIDEO_CODEC,
      ...FFMPEG_VIDEO_CODEC_ARGS,
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
