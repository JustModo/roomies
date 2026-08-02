import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** packages/test */
export const testPkgRoot = path.resolve(__dirname, '../../..');
/** packages/test/.e2e — gitignored runtime sandbox */
export const e2eRoot = path.join(testPkgRoot, '.e2e');
export const e2eMediaDir = path.join(e2eRoot, 'media');
export const e2eCacheDir = path.join(e2eRoot, 'cache');
export const e2eConfigDir = path.join(e2eRoot, 'config');
export const e2eEnvPath = path.join(e2eRoot, 'env.json');

export interface E2eEnv {
  MEDIA_ROOT: string;
  CACHE_DIR: string;
  ROOMIES_CONFIG_PATH: string;
  DATABASE_URL: string;
  ROOMIES_MEDIA_DIR: string;
  ROOMIES_CACHE_DIR: string;
}

export function readE2eEnvFile(): E2eEnv {
  if (!fs.existsSync(e2eEnvPath)) {
    throw new Error(
      `Missing ${e2eEnvPath} — start-stack.mjs / prepare-sandbox.mjs must run first`,
    );
  }
  return JSON.parse(fs.readFileSync(e2eEnvPath, 'utf8')) as E2eEnv;
}

export function wipeE2eRuntimeDirs() {
  for (const dir of [e2eConfigDir, e2eCacheDir, e2eMediaDir]) {
    if (fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
  if (fs.existsSync(e2eEnvPath)) {
    fs.rmSync(e2eEnvPath, { force: true });
  }
}
