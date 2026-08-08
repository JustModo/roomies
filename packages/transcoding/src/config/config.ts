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

/** Canonical, scalable list of every resolution the pipeline supports — derived from
 *  RESOLUTION_PRESETS so adding a new tier (e.g. '480p') only requires editing that one map. */
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

/** Kills a stuck ffprobe call after this long, so a corrupted/unreadable source can't hang
 *  variant readiness before ffmpeg is even spawned. */
export const PROBE_TIMEOUT_MS = 10000;

/** Safety net for playheads whose owner never called removePlayhead (e.g. an ungraceful
 *  socket drop) — a playhead not updated within this window is swept and its offset group
 *  released for GC like a normal disconnect. Comfortably above the 5s sync heartbeat cadence. */
export const PLAYHEAD_STALE_MS = 30000;

/** manageCache() SIGSTOP/SIGCONT hysteresis: how far (in seconds) the worker's
 *  encoded output may run ahead of the playhead before it's paused, and how
 *  far it must shrink back before resuming. */
export const CACHE_SUSPEND_AHEAD_SECONDS = 300;
export const CACHE_RESUME_AHEAD_SECONDS = 60;

/** Flat audio bitrate for demuxed alternate-audio-track renditions (multi-audio media only) —
 *  audio is now encoded once and shared across all resolutions, so it no longer needs to vary
 *  per resolution like RESOLUTION_PRESETS[res].audioBitrate does for the single-track case. */
export const AUDIO_BITRATE = '160k';

/** Upper bound on concurrent FFmpeg variant processes per session.
 *  Defaults to 2x logical CPU count (floor 4, so small/CI hosts can still
 *  fit the 3-resolutions-per-offset prewarm); override via
 *  MAX_CONCURRENT_VARIANTS in roomies.conf. */
export const MAX_CONCURRENT_VARIANTS = CONFIG_MAX_CONCURRENT_VARIANTS ?? Math.max(4, os.cpus().length * 2);

export const FFMPEG_PATH = CONFIG_FFMPEG_PATH;

export const CACHE_DIR = CONFIG_CACHE_DIR;

export const HLS_BASE_URL = '/hls';

export const VIDEO_CODEC = CONFIG_VIDEO_CODEC;
