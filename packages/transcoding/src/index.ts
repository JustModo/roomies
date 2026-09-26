export { TranscodeSessionManager } from './core/manager';
export { TranscodeSession, GroupStoppedError, getAlignedPosition } from './core/session';
export type { SessionSpec } from './core/session';
export { TranscodeWorker } from './core/worker';
export type { WorkerSpec, WorkerInput } from './core/worker';
export { WorkerSlots } from './core/deps';
export type { TranscodeDeps } from './core/deps';
export { EncoderBackend } from './ffmpeg/hwaccel';
export { transcodeOptionsFrom } from './config/options';
export type { TranscodeOptions } from './config/options';
export { ensureDirectory, removeDirectory, emptyDirectory, countSegments } from './fs/cache';
export type {
  Resolution,
  ResolutionConfig,
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
