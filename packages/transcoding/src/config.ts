import path from 'path';
import { Resolution, ResolutionConfig } from './types';

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

/** Duration of each HLS segment in seconds. */
export const SEGMENT_DURATION = 2;

/** Number of segments in HLS playlist. 0 represents unlimited (VOD mode). */
export const HLS_LIST_SIZE = 0;

/** Number of segments that must exist on disk before the variant is ready. */
export const LOOK_AHEAD_SEGMENTS = 4;

/** Upper bound on concurrent FFmpeg variant processes per session. */
export const MAX_CONCURRENT_VARIANTS = 6;

import { FFMPEG_PATH as CONFIG_FFMPEG_PATH, CACHE_DIR as CONFIG_CACHE_DIR, VIDEO_CODEC as CONFIG_VIDEO_CODEC } from '@roomies/config';

export const FFMPEG_PATH = CONFIG_FFMPEG_PATH;

export const CACHE_DIR = CONFIG_CACHE_DIR;

export const HLS_BASE_URL = '/hls';

export const VIDEO_CODEC = CONFIG_VIDEO_CODEC;
