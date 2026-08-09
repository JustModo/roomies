import path from 'path';
import os from 'os';
import { Resolution, ResolutionConfig } from '../types';
import {
  FFMPEG_PATH as CONFIG_FFMPEG_PATH,
  CACHE_DIR as CONFIG_CACHE_DIR,
  VIDEO_CODEC as CONFIG_VIDEO_CODEC,
  MAX_CONCURRENT_VARIANTS as CONFIG_MAX_CONCURRENT_VARIANTS,
} from '@roomies/config';

/** Encoding presets for each supported resolution. */
export const RESOLUTION_PRESETS: Record<Resolution, ResolutionConfig> = {
  '360p': {
    width: 640,
    height: 360,
    videoBitrate: '800k',
    audioBitrate: '96k',
    maxRate: '856k',
    bufSize: '1200k',
  },
  '720p': {
    width: 1280,
    height: 720,
    videoBitrate: '2500k',
    audioBitrate: '128k',
    maxRate: '2675k',
    bufSize: '3750k',
  },
  '1080p': {
    width: 1920,
    height: 1080,
    videoBitrate: '5000k',
    audioBitrate: '192k',
    maxRate: '5350k',
    bufSize: '7500k',
  },
};

/** Canonical, scalable list of every resolution supported by the pipeline. */
export const SUPPORTED_RESOLUTIONS: Resolution[] = Object.keys(RESOLUTION_PRESETS) as Resolution[];

export function isResolution(value: string | undefined): value is Resolution {
  return value !== undefined && (SUPPORTED_RESOLUTIONS as string[]).includes(value);
}

/** Duration of each HLS segment in seconds. */
export const SEGMENT_DURATION = 2;

/** Number of segments in HLS playlist. 0 represents unlimited (VOD mode). */
export const HLS_LIST_SIZE = 0;

/** Number of segments that must exist on disk before the variant is ready. */
export const LOOK_AHEAD_SEGMENTS = 4;

/** Probe timeout in milliseconds to prevent hung ffprobe processes. */
export const PROBE_TIMEOUT_MS = 10000;

/** Timeout threshold to sweep inactive playheads after dropped socket connections. */
export const PLAYHEAD_STALE_MS = 30000;

/** Distance in seconds worker output may run ahead before pausing or resuming. */
export const CACHE_SUSPEND_AHEAD_SECONDS = 300;
export const CACHE_RESUME_AHEAD_SECONDS = 60;

/** Flat audio bitrate for demuxed alternate-audio-track renditions. */
export const AUDIO_BITRATE = '160k';

/** Upper bound on concurrent FFmpeg variant processes per session. */
export const MAX_CONCURRENT_VARIANTS = CONFIG_MAX_CONCURRENT_VARIANTS ?? Math.max(4, os.cpus().length * 2);

export const FFMPEG_PATH = CONFIG_FFMPEG_PATH;

export const CACHE_DIR = CONFIG_CACHE_DIR;

export const HLS_BASE_URL = '/hls';

export const VIDEO_CODEC = CONFIG_VIDEO_CODEC;
