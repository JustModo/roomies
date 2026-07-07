import { FfmpegPreset, HwAccelMode } from '@roomies/contracts';
import { detectHardwareEncoder } from '@roomies/transcoding';
import { prisma } from '../database/sqlite';

export type { FfmpegPreset, HwAccelMode };

export interface TranscodeSettings {
  ffmpegPreset: FfmpegPreset;
  hwAccelMode: HwAccelMode;
  detectedHardware?: string;
}

const FFMPEG_PRESET_KEY = 'FFMPEG_PRESET';
const HWACCEL_MODE_KEY = 'HWACCEL_MODE';

const DEFAULT_SETTINGS: TranscodeSettings = {
  ffmpegPreset: 'veryfast',
  hwAccelMode: 'auto',
};

let cache: TranscodeSettings = { ...DEFAULT_SETTINGS };

const isFfmpegPreset = (value: string): value is FfmpegPreset =>
  (['ultrafast', 'veryfast', 'fast', 'medium', 'slow'] as const).includes(value as FfmpegPreset);

const isHwAccelMode = (value: string): value is HwAccelMode =>
  (['auto', 'cpu'] as const).includes(value as HwAccelMode);

/**
 * Loads persisted transcode settings from the `ServerConfig` table (creating
 * the defaults on first boot), and caches them in memory. Called once at
 * startup from `initializeConfig()`.
 */
export const loadTranscodeSettings = async (): Promise<TranscodeSettings> => {
  const presetRow = await prisma.serverConfig.upsert({
    where: { key: FFMPEG_PRESET_KEY },
    update: {},
    create: { key: FFMPEG_PRESET_KEY, value: DEFAULT_SETTINGS.ffmpegPreset },
  });

  const hwAccelRow = await prisma.serverConfig.upsert({
    where: { key: HWACCEL_MODE_KEY },
    update: {},
    create: { key: HWACCEL_MODE_KEY, value: DEFAULT_SETTINGS.hwAccelMode },
  });

  const detectedHardware = await detectHardwareEncoder();

  cache = {
    ffmpegPreset: isFfmpegPreset(presetRow.value) ? presetRow.value : DEFAULT_SETTINGS.ffmpegPreset,
    hwAccelMode: isHwAccelMode(hwAccelRow.value) ? hwAccelRow.value : DEFAULT_SETTINGS.hwAccelMode,
    detectedHardware,
  };

  return cache;
};

/** Returns the current in-memory transcode settings. */
export const getTranscodeSettings = (): TranscodeSettings => cache;

/**
 * Persists a partial update to transcode settings and refreshes the in-memory
 * cache immediately — no server restart required for the change to take effect
 * on the next spawned FFmpeg variant.
 */
export const updateTranscodeSettings = async (
  patch: Partial<TranscodeSettings>
): Promise<TranscodeSettings> => {
  if (patch.ffmpegPreset) {
    await prisma.serverConfig.upsert({
      where: { key: FFMPEG_PRESET_KEY },
      update: { value: patch.ffmpegPreset },
      create: { key: FFMPEG_PRESET_KEY, value: patch.ffmpegPreset },
    });
  }

  if (patch.hwAccelMode) {
    await prisma.serverConfig.upsert({
      where: { key: HWACCEL_MODE_KEY },
      update: { value: patch.hwAccelMode },
      create: { key: HWACCEL_MODE_KEY, value: patch.hwAccelMode },
    });
  }

  cache = { ...cache, ...patch };
  return cache;
};
