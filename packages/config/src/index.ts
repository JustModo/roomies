import { NODE_ENV } from './dev';
import { loadConfig } from './loader';

export { NODE_ENV };

// Instantiate and validate the configuration singleton
export const config = loadConfig();

// Maintain backward compatibility exports
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

// Export VIDEO_CODEC as alias to FFMPEG_VIDEO_CODEC
export const VIDEO_CODEC = config.FFMPEG_VIDEO_CODEC;




