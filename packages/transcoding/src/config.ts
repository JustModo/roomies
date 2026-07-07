import path from 'path';
import { Resolution, ResolutionConfig } from './types';

/**
 * Encoding presets for each supported resolution.
 * Bitrates are tuned for a good quality/size trade-off with libx264 veryfast.
 */
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

/**
 * Duration of each HLS segment in seconds. 4s is the Jellyfin-recommended
 * sweet spot for VOD: long enough that the player always has a few segments
 * buffered without needing sub-second HTTP round-trips, short enough that
 * seeking lands within 4s of the requested position.
 */
export const SEGMENT_DURATION = 4;

/**
 * 0 = unlimited — all produced segments are kept for the lifetime of the
 * session (VOD mode). This lets the player buffer far ahead and seek
 * backwards into already-transcoded regions instantly without a cold restart.
 * Segments are only cleaned up when the session ends (stop() / clearVariants()).
 */
export const HLS_LIST_SIZE = 0;

/**
 * Number of segments that must exist on disk before the variant is considered
 * "ready" and the player is signalled to start. 3 × 4s = 12s of buffer — long
 * enough that the first few HTTP round-trips don't stall playback immediately.
 */
export const LOOK_AHEAD_SEGMENTS = 3;

/**
 * Upper bound on concurrent FFmpeg variant processes per session. Matches the
 * fixed 3-resolution preset set today — a guardrail so a future expansion of
 * `RESOLUTION_PRESETS` can't silently spawn an unbounded number of processes.
 */
export const MAX_CONCURRENT_VARIANTS = 3;

import { FFMPEG_PATH as CONFIG_FFMPEG_PATH, CACHE_DIR as CONFIG_CACHE_DIR, VIDEO_CODEC as CONFIG_VIDEO_CODEC } from '@roomies/config';

/** Path to the ffmpeg binary (overridable via env). */
export const FFMPEG_PATH = CONFIG_FFMPEG_PATH;

/** Root directory for HLS output (segments + playlists). */
export const CACHE_DIR = CONFIG_CACHE_DIR;

/** Base URL prefix for HLS URLs served by Caddy. */
export const HLS_BASE_URL = '/hls';

/** Video codec (overridable for systems without libx264). */
export const VIDEO_CODEC = CONFIG_VIDEO_CODEC;
