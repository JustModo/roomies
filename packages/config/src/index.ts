import { NODE_ENV } from './dev';
import { loadConfig } from './loader';

export { NODE_ENV };

export const config = loadConfig();

export const {
  CORS_ORIGIN,
  FFMPEG_PRESET,
  HWACCEL_MODE,
  PORT,
  MEDIA_ROOT,
  CACHE_DIR,
  DATABASE_URL,
  FFMPEG_PATH,
} = config;

export const VIDEO_CODEC = config.FFMPEG_VIDEO_CODEC;
