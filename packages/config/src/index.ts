import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

// Single Source of Truth for Config Location
const configPath = process.env.ROOMIES_CONFIG_PATH || path.resolve(process.cwd(), 'config', 'roomies.conf');
const configDir = path.dirname(configPath);

const defaultConf = `
# Roomies Configuration File
# --------------------------
# All configuration properties strictly controlled here. 
# Do not rely on environment variables for overrides.

# Internal Server Port
PORT=3000

# CORS Origin for the web frontend
CORS_ORIGIN=http://localhost

# FFmpeg video codec for transcoding
FFMPEG_VIDEO_CODEC=libx264

# Media and Cache Paths
MEDIA_ROOT=${path.join(process.cwd(), 'media')}
CACHE_DIR=${path.join(process.cwd(), 'cache')}
DATABASE_URL=file:${path.join(configDir, 'roomies.db')}
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

// Final exported configuration (Strictly from the file)
export const PORT = parseInt(parsedConf.PORT || '3000', 10);
export const CORS_ORIGIN = parsedConf.CORS_ORIGIN || 'http://localhost';
export const VIDEO_CODEC = parsedConf.FFMPEG_VIDEO_CODEC || 'libx264';
export const MEDIA_ROOT = parsedConf.MEDIA_ROOT || path.join(process.cwd(), 'media');
export const CACHE_DIR = parsedConf.CACHE_DIR || path.join(process.cwd(), 'cache');
export const DATABASE_URL = parsedConf.DATABASE_URL || `file:${path.join(configDir, 'roomies.db')}`;

// These depend purely on the Node environment context and host binaries
export const NODE_ENV = process.env.NODE_ENV || 'development';
export const FFMPEG_PATH = 'ffmpeg';
