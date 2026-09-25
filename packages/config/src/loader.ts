import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { z } from 'zod';
import { Config, ConfigSchema } from './schema';
import { defaultConf } from './templates';

const DEV_DEFAULTS = (projectRoot: string) => ({
  MEDIA_ROOT: path.resolve(projectRoot, 'media'),
  CACHE_DIR: path.resolve(projectRoot, 'cache'),
  FFMPEG_PATH: 'ffmpeg',
  FFPROBE_PATH: 'ffprobe',
});

const PROD_DEFAULTS = {
  MEDIA_ROOT: '/media',
  CACHE_DIR: '/cache',
  FFMPEG_PATH: '/usr/lib/jellyfin-ffmpeg/ffmpeg',
  FFPROBE_PATH: '/usr/lib/jellyfin-ffmpeg/ffprobe',
};

// NOTE: Searches upwards from startDir for the monorepo root.
function findProjectRoot(startDir: string): string {
  for (let dir = startDir; dir !== path.parse(dir).root; dir = path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, 'pnpm-workspace.yaml')) || fs.existsSync(path.join(dir, 'turbo.json'))) return dir;
  }
  return startDir;
}

/**
 * Reads roomies.conf (creating it from the template if missing) merged with environment
 * overrides. Call once at startup and pass the result down; nothing reads config on import.
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const nodeEnv = env.NODE_ENV || 'development';
  const isDev = nodeEnv !== 'production';
  const projectRoot = isDev ? findProjectRoot(process.cwd()) : process.cwd();

  // NOTE: Single source of truth for config location.
  const configPath = env.ROOMIES_CONFIG_PATH || path.resolve(projectRoot, 'config', 'roomies.conf');
  const configDir = path.dirname(configPath);
  if (!fs.existsSync(configPath)) {
    fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(configPath, defaultConf);
  }

  // NOTE: Centralized, persistent store for extracted/uploaded subtitles (unlike
  // CACHE_DIR, which gets wiped on every startup by the transcode cache cleaner).
  const subtitleDataDir = path.resolve(configDir, 'subtitles');
  fs.mkdirSync(subtitleDataDir, { recursive: true });

  const conf = dotenv.parse(fs.readFileSync(configPath, 'utf8'));
  const defaults = isDev ? DEV_DEFAULTS(projectRoot) : PROD_DEFAULTS;

  const parsed = ConfigSchema.safeParse({
    FFMPEG_VIDEO_CODEC: conf.FFMPEG_VIDEO_CODEC,
    FFMPEG_PRESET: conf.FFMPEG_PRESET,
    HWACCEL_MODE: conf.HWACCEL_MODE,
    MAX_CONCURRENT_VARIANTS: conf.MAX_CONCURRENT_VARIANTS,
    TZ: conf.TZ,
    CORS_ORIGIN: env.CORS_ORIGIN || conf.CORS_ORIGIN || 'http://localhost',

    NODE_ENV: nodeEnv,
    PORT: env.PORT,
    MEDIA_ROOT: env.MEDIA_ROOT || defaults.MEDIA_ROOT,
    CACHE_DIR: env.CACHE_DIR || defaults.CACHE_DIR,
    SUBTITLE_DATA_DIR: env.SUBTITLE_DATA_DIR || subtitleDataDir,
    DATABASE_URL: env.DATABASE_URL || `file:${path.resolve(configDir, 'roomies.db')}`,
    FFMPEG_PATH: env.FFMPEG_PATH || defaults.FFMPEG_PATH,
    FFPROBE_PATH: env.FFPROBE_PATH || defaults.FFPROBE_PATH,
  });
  if (!parsed.success) throw new Error(`Invalid server configuration:\n${z.prettifyError(parsed.error)}`);

  env.TZ ??= parsed.data.TZ;
  return Object.freeze(parsed.data);
}
