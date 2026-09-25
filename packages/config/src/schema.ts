import { z } from 'zod';

export const ConfigSchema = z.object({
  // Config-backed user configurable properties
  FFMPEG_VIDEO_CODEC: z.string().default('libx264'),
  FFMPEG_PRESET: z.enum(['ultrafast', 'veryfast', 'fast', 'medium', 'slow']).default('veryfast'),
  HWACCEL_MODE: z.enum(['auto', 'cpu']).default('auto'),
  MAX_CONCURRENT_VARIANTS: z.coerce.number().int().positive().optional(),
  TZ: z.string().default('UTC'),
  CORS_ORIGIN: z
    .string()
    .transform((value) => value.split(',').map((origin) => origin.trim()).filter(Boolean))
    .pipe(z.array(z.url()).min(1)),

  // Internal / hardcoded settings (not exposed in roomies.conf)
  PORT: z.coerce.number().int().positive().default(3000),
  MEDIA_ROOT: z.string(),
  CACHE_DIR: z.string(),
  SUBTITLE_DATA_DIR: z.string(),
  DATABASE_URL: z.string(),
  FFMPEG_PATH: z.string(),
  FFPROBE_PATH: z.string(),
});

export type Config = z.infer<typeof ConfigSchema>;
