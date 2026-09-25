import os from 'os';
import type { Config } from '@roomies/config';
import type { FfmpegPreset, HwAccelMode } from '../types';

/** The slice of server config the transcoding pipeline runs on. */
export interface TranscodeOptions {
  readonly ffmpegPath: string;
  readonly ffprobePath: string;
  readonly cacheDir: string;
  readonly videoCodec: string;
  readonly preset: FfmpegPreset;
  readonly hwAccelMode: HwAccelMode;
  /** Upper bound on concurrent FFmpeg processes across all sessions. */
  readonly maxConcurrentWorkers: number;
}

export const transcodeOptionsFrom = (config: Config): TranscodeOptions => ({
  ffmpegPath: config.FFMPEG_PATH,
  ffprobePath: config.FFPROBE_PATH,
  cacheDir: config.CACHE_DIR,
  videoCodec: config.FFMPEG_VIDEO_CODEC,
  preset: config.FFMPEG_PRESET,
  hwAccelMode: config.HWACCEL_MODE,
  maxConcurrentWorkers: config.MAX_CONCURRENT_VARIANTS ?? Math.max(4, os.cpus().length * 2),
});
