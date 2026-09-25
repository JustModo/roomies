export { TranscodeSessionManager } from './core/manager';
export { TranscodeSession, getAlignedPosition } from './core/session';
export type { SessionSpec } from './core/session';
export { TranscodeWorker } from './core/worker';
export type { WorkerSpec, WorkerInput } from './core/worker';
export { WorkerSlots } from './core/deps';
export type { TranscodeDeps } from './core/deps';
export { EncoderBackend } from './ffmpeg/hwaccel';
export { transcodeOptionsFrom } from './config/options';
export type { TranscodeOptions } from './config/options';
export { ensureDirectory, removeDirectory, emptyDirectory, readSegmentStats } from './fs/cache';
export type {
  Resolution,
  ResolutionConfig,
  TranscodeErrorCallback,
  HardwareEncoder,
  AudioTrackDescriptor,
  FfmpegPreset,
  HwAccelMode,
} from './types';
export {
  RESOLUTION_PRESETS,
  SUPPORTED_RESOLUTIONS,
  isResolution,
  SEGMENT_DURATION,
  HLS_LIST_SIZE,
  READY_TIMEOUT_MS,
  HLS_BASE_URL,
  AUDIO_BITRATE,
} from './config/constants';
export { SyncPolicy, AsyncPolicy, policyForSessionId, variantsForSource, scaledResolution } from './config/policy';
export type { PlaybackPolicy } from './config/policy';
export {
  buildHlsMuxArgs,
  buildSeparateAudioEncodeArgs,
  appendAudioTrackHlsOutput,
  audioBitrateFor,
  AUDIO_TIMESTAMP_FIX,
} from './ffmpeg/hlsArgs';
export { startSegmentReadyWatcher } from './fs/readyWatcher';
export type { SegmentReadyTarget, SegmentReadyWatcherOptions } from './fs/readyWatcher';
