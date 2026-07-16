export { TranscodeSessionManager } from './manager';
export { TranscodeSession } from './session';
export { TranscodeVariant } from './variant';
export { TranscodeCache } from './cache';
export { getAlignedPosition } from './utils';
export { detectHardwareEncoder, getDetectedHardwareEncoder } from './hwaccel';
export { initTranscodeSettings, getTranscodeSettings } from './settings';
export type { TranscodeSettings, FfmpegPreset, HwAccelMode } from './settings';
export type { Resolution, ResolutionConfig, TranscodeErrorCallback, HardwareEncoder } from './types';
export {
  RESOLUTION_PRESETS,
  SEGMENT_DURATION,
  HLS_LIST_SIZE,
  MAX_CONCURRENT_VARIANTS,
  CACHE_DIR,
  HLS_BASE_URL,
} from './config';
