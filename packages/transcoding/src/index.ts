export { TranscodeSessionManager, TranscodeSessionManagerClass, createTranscodeSessionManager } from './manager';
export type { TranscodeManagerOptions } from './manager';
export { TranscodeSession } from './session';

export { TranscodeVariant } from './variant';
export { TranscodeVariantGroup, GroupedVariantLeg, GroupedAudioLeg } from './variantGroup';
export { TranscodeCache } from './cache';
export { getAlignedPosition } from './utils';
export { detectHardwareEncoder, getDetectedHardwareEncoder } from './hwaccel';
export { initTranscodeSettings, getTranscodeSettings } from './settings';
export type { TranscodeSettings, FfmpegPreset, HwAccelMode } from './settings';
export type { Resolution, ResolutionConfig, TranscodeErrorCallback, HardwareEncoder, AudioTrackDescriptor } from './types';
export {
  RESOLUTION_PRESETS,
  SEGMENT_DURATION,
  HLS_LIST_SIZE,
  MAX_CONCURRENT_VARIANTS,
  CACHE_DIR,
  HLS_BASE_URL,
  AUDIO_BITRATE,
} from './config';
export { SyncPolicy, AsyncPolicy, policyForSessionId } from './modePolicy';
export type { PlaybackModePolicy, EncodeStrategy, SeekNotifyPolicy } from './modePolicy';
export { buildHlsMuxArgs, buildSeparateAudioEncodeArgs, appendAudioTrackHlsOutput } from './hlsArgs';
export { startSegmentReadyWatcher } from './readyWatcher';
export type { SegmentReadyTarget, SegmentReadyWatcherOptions } from './readyWatcher';
export { AsyncOffsetResolutionLockedError } from './errors';
