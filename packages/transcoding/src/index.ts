export { TranscodeSessionManager, TranscodeSessionManagerClass, createTranscodeSessionManager } from './core/manager';
export type { TranscodeManagerOptions } from './core/manager';
export { TranscodeSession } from './core/session';

export { TranscodeWorker } from './core/worker';
export { TranscodeCache } from './fs/cache';
export { getAlignedPosition } from './core/session';
export { detectHardwareEncoder, getDetectedHardwareEncoder } from './ffmpeg/hwaccel';
export { initTranscodeSettings, getTranscodeSettings } from './config/settings';
export type { TranscodeSettings, FfmpegPreset, HwAccelMode } from './config/settings';
export type { Resolution, ResolutionConfig, TranscodeErrorCallback, HardwareEncoder, AudioTrackDescriptor } from './types';
export {
  RESOLUTION_PRESETS,
  SUPPORTED_RESOLUTIONS,
  isResolution,
  SEGMENT_DURATION,
  HLS_LIST_SIZE,
  MAX_CONCURRENT_VARIANTS,
  CACHE_DIR,
  HLS_BASE_URL,
  AUDIO_BITRATE,
} from './config/config';
export { SyncPolicy, AsyncPolicy, policyForSessionId } from './config/policy';
export type { PlaybackPolicy, SeekNotifyPolicy } from './config/policy';
export { buildHlsMuxArgs, buildSeparateAudioEncodeArgs, appendAudioTrackHlsOutput } from './ffmpeg/hlsArgs';
export { startSegmentReadyWatcher } from './fs/readyWatcher';
export type { SegmentReadyTarget, SegmentReadyWatcherOptions } from './fs/readyWatcher';
