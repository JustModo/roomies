import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

// Single Source of Truth for Config Location
const configPath = process.env.ROOMIES_CONFIG_PATH || path.resolve(process.cwd(), 'config', 'roomies.conf');
const configDir = path.dirname(configPath);

const defaultConf = `
# Roomies Configuration File

# CORS Origin for the web frontend
CORS_ORIGIN=http://localhost

# FFmpeg video codec for transcoding
FFMPEG_VIDEO_CODEC=libx264
`.trim() + '\n';

// Automatically create the default conf if it doesn't exist
if (!fs.existsSync(configPath)) {
  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
  }
  fs.writeFileSync(configPath, defaultConf);
}

// Parse the conf file
const parsedConf = dotenv.parse(fs.readFileSync(configPath, 'utf8'));

// Final exported configuration
// User configurable:
export const CORS_ORIGIN = parsedConf.CORS_ORIGIN || 'http://localhost';
export const VIDEO_CODEC = parsedConf.FFMPEG_VIDEO_CODEC || 'libx264';

// These depend purely on the Node environment context and host binaries
export const NODE_ENV = process.env.NODE_ENV || 'development';
const isDev = NODE_ENV !== 'production';

// Hardcoded Docker topology paths and ports:
export const PORT = 3000;
export const MEDIA_ROOT = process.env.MEDIA_ROOT || (isDev ? path.resolve(process.cwd(), '../../media') : '/media');
export const CACHE_DIR = process.env.CACHE_DIR || (isDev ? path.resolve(process.cwd(), '../../cache') : '/cache');
export const DATABASE_URL = process.env.DATABASE_URL || (isDev ? 'file:./dev.db' : 'file:/config/roomies.db');
export const FFMPEG_PATH = process.env.FFMPEG_PATH || (isDev ? 'ffmpeg' : '/usr/lib/jellyfin-ffmpeg/ffmpeg');

