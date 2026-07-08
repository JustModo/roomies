import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { isDev, projectRoot } from './dev';
import { ConfigSchema, Config } from './schema';
import { defaultConf } from './templates';

export function loadConfig(): Config {
  // Single Source of Truth for Config Location
  const configPath = process.env.ROOMIES_CONFIG_PATH || path.resolve(projectRoot, 'config', 'roomies.conf');
  const configDir = path.dirname(configPath);

  // Automatically create the default conf if it doesn't exist
  if (!fs.existsSync(configPath)) {
    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }
    fs.writeFileSync(configPath, defaultConf);
  }

  // Parse the conf file
  const parsedConf = dotenv.parse(fs.readFileSync(configPath, 'utf8'));

  // Environment-specific default configurations
  const devDefaults = {
    MEDIA_ROOT: path.resolve(projectRoot, 'media'),
    CACHE_DIR: path.resolve(projectRoot, 'cache'),
    FFMPEG_PATH: 'ffmpeg',
  };

  const prodDefaults = {
    MEDIA_ROOT: '/media',
    CACHE_DIR: '/cache',
    FFMPEG_PATH: '/usr/lib/jellyfin-ffmpeg/ffmpeg',
  };

  const defaults = isDev ? devDefaults : prodDefaults;

  // Merge everything into a raw configuration object
  const rawConfig = {
    // Properties from config file:
    CORS_ORIGIN: parsedConf.CORS_ORIGIN,
    FFMPEG_VIDEO_CODEC: parsedConf.FFMPEG_VIDEO_CODEC,
    FFMPEG_PRESET: parsedConf.FFMPEG_PRESET,
    HWACCEL_MODE: parsedConf.HWACCEL_MODE,

    // Properties from environment or defaults:
    PORT: process.env.PORT,
    MEDIA_ROOT: process.env.MEDIA_ROOT || defaults.MEDIA_ROOT,
    CACHE_DIR: process.env.CACHE_DIR || defaults.CACHE_DIR,
    DATABASE_URL: process.env.DATABASE_URL || `file:${path.resolve(configDir, 'roomies.db')}`,
    FFMPEG_PATH: process.env.FFMPEG_PATH || defaults.FFMPEG_PATH,
  };

  // Validate using Zod schema
  const parsed = ConfigSchema.safeParse(rawConfig);

  if (!parsed.success) {
    console.error(parsed.error.format());
    throw new Error('Invalid server configuration.');
  }

  return parsed.data;
}
