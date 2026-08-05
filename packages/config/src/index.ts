import { NODE_ENV } from './dev';
import { loadConfig } from './loader';
import { Config } from './schema';

export { NODE_ENV };
export type { Config } from './schema';

export class ConfigManager {
  static load(overrides: Partial<Config> = {}): Config {
    const loaded = loadConfig();
    return { ...loaded, ...overrides };
  }
}

export let config = loadConfig();

export function reloadConfig() {
  config = loadConfig();
  return config;
}

export const CORS_ORIGIN = config.CORS_ORIGIN;
export const FFMPEG_PRESET = config.FFMPEG_PRESET;
export const HWACCEL_MODE = config.HWACCEL_MODE;
export const MAX_CONCURRENT_VARIANTS = config.MAX_CONCURRENT_VARIANTS;
export const PORT = config.PORT;
export const MEDIA_ROOT = config.MEDIA_ROOT;
export const CACHE_DIR = config.CACHE_DIR;
export const SUBTITLE_DATA_DIR = config.SUBTITLE_DATA_DIR;
export const DATABASE_URL = config.DATABASE_URL;
export const FFMPEG_PATH = config.FFMPEG_PATH;
export const FFPROBE_PATH = config.FFPROBE_PATH;

export const VIDEO_CODEC = config.FFMPEG_VIDEO_CODEC;


