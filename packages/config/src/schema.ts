import { z } from 'zod';

export const ConfigSchema = z.object({
  // Config-backed user configurable properties
  CORS_ORIGIN: z.string().url().default('http://localhost'),
  FFMPEG_VIDEO_CODEC: z.string().default('libx264'),
  FFMPEG_PRESET: z.enum([
    'ultrafast',
    'superfast',
    'veryfast',
    'faster',
    'fast',
    'medium',
    'slow',
    'slower',
    'veryslow'
  ]).default('veryfast'),
  HWACCEL_MODE: z.enum(['auto', 'cpu']).default('auto'),

  // Environment-backed / hardcoded settings
  PORT: z.coerce.number().default(3000),
  MEDIA_ROOT: z.string(),
  CACHE_DIR: z.string(),
  DATABASE_URL: z.string(),
  FFMPEG_PATH: z.string(),
});

export type Config = z.infer<typeof ConfigSchema>;
