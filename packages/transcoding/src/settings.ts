import { FFMPEG_PRESET, HWACCEL_MODE } from '@roomies/config';
import { detectHardwareEncoder } from './hwaccel';

export type FfmpegPreset = 'ultrafast' | 'veryfast' | 'fast' | 'medium' | 'slow';
export type HwAccelMode = 'auto' | 'cpu';

export interface TranscodeSettings {
  ffmpegPreset: FfmpegPreset;
  hwAccelMode: HwAccelMode;
  detectedHardware?: string;
}

const DEFAULT_SETTINGS: TranscodeSettings = {
  ffmpegPreset: 'veryfast',
  hwAccelMode: 'auto',
};

let cache: TranscodeSettings = { ...DEFAULT_SETTINGS };

const isFfmpegPreset = (value: string): value is FfmpegPreset =>
  (['ultrafast', 'veryfast', 'fast', 'medium', 'slow'] as const).includes(value as FfmpegPreset);

const isHwAccelMode = (value: string): value is HwAccelMode =>
  (['auto', 'cpu'] as const).includes(value as HwAccelMode);

/** Initializes and caches transcode settings from config and hardware detection. */
export const initTranscodeSettings = async (): Promise<TranscodeSettings> => {
  const detectedHardware = await detectHardwareEncoder();

  cache = {
    ffmpegPreset: isFfmpegPreset(FFMPEG_PRESET) ? FFMPEG_PRESET : DEFAULT_SETTINGS.ffmpegPreset,
    hwAccelMode: isHwAccelMode(HWACCEL_MODE) ? HWACCEL_MODE : DEFAULT_SETTINGS.hwAccelMode,
    detectedHardware,
  };

  return cache;
};

export const getTranscodeSettings = (): TranscodeSettings => cache;
