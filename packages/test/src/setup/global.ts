import fs from 'fs';
import path from 'path';
import os from 'os';

let tempConfigDir: string | null = null;
let tempCacheDir: string | null = null;
let tempMediaDir: string | null = null;

export async function setup() {
  tempConfigDir = fs.mkdtempSync(path.join(os.tmpdir(), 'roomies-test-config-'));
  tempCacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'roomies-test-cache-'));
  tempMediaDir = fs.mkdtempSync(path.join(os.tmpdir(), 'roomies-test-media-'));

  const confPath = path.join(tempConfigDir, 'roomies.conf');
  const dummyConf = [
    'CORS_ORIGIN=http://localhost:3000',
    'FFMPEG_VIDEO_CODEC=libx264',
    'FFMPEG_PRESET=ultrafast',
    'HWACCEL_MODE=cpu',
  ].join('\n');


  fs.writeFileSync(confPath, dummyConf);

  process.env.ROOMIES_CONFIG_PATH = confPath;
  process.env.MEDIA_ROOT = tempMediaDir;
  process.env.CACHE_DIR = tempCacheDir;
  process.env.FFMPEG_PATH = 'echo';
  process.env.FFPROBE_PATH = 'echo';
  process.env.NODE_ENV = 'test';
}

export async function teardown() {
  if (tempConfigDir) {
    try { fs.rmSync(tempConfigDir, { recursive: true, force: true }); } catch {}
  }
  if (tempCacheDir) {
    try { fs.rmSync(tempCacheDir, { recursive: true, force: true }); } catch {}
  }
  if (tempMediaDir) {
    try { fs.rmSync(tempMediaDir, { recursive: true, force: true }); } catch {}
  }
}
