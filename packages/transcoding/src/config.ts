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
 * Duration of each HLS segment in seconds. Kept short (2s) for low-latency
 * live transcoding — everyone in a party watches at the same live position,
 * so there's no benefit to longer segments the way there is for VOD.
 */
export const SEGMENT_DURATION = 2;

/**
 * Number of segments kept in the HLS playlist at once (rolling live window).
 * Combined with `hls_flags delete_segments`, ffmpeg natively rotates the
 * playlist and deletes old segment files itself — no manual pruning needed.
 */
export const HLS_LIST_SIZE = 10;

/**
 * Upper bound on concurrent FFmpeg variant processes per session. Matches the
 * fixed 3-resolution preset set today — a guardrail so a future expansion of
 * `RESOLUTION_PRESETS` can't silently spawn an unbounded number of processes.
 */
export const MAX_CONCURRENT_VARIANTS = 3;

/** Path to the ffmpeg binary (overridable via env). */
export const FFMPEG_PATH = process.env.FFMPEG_PATH || 'ffmpeg';

/** Root directory for HLS output (segments + playlists). */
export const CACHE_DIR = path.resolve(process.env.CACHE_DIR || '/cache');

/** Base URL prefix for HLS URLs served by Caddy. */
export const HLS_BASE_URL = process.env.HLS_BASE_URL || '/hls';

/** Video codec (overridable for systems without libx264). */
export const VIDEO_CODEC = process.env.FFMPEG_VIDEO_CODEC || 'libx264';
