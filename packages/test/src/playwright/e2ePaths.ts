import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** packages/test */
export const testPkgRoot = path.resolve(__dirname, '../..');
/** packages/test/.e2e — gitignored runtime sandbox (generated media lives here) */
export const e2eRoot = path.join(testPkgRoot, '.e2e');
export const e2eMediaDir = path.join(e2eRoot, 'media');
export const e2eCacheDir = path.join(e2eRoot, 'cache');
export const e2eConfigDir = path.join(e2eRoot, 'config');
export const e2eConfPath = path.join(e2eConfigDir, 'roomies.conf');
export const e2eDbPath = path.join(e2eConfigDir, 'roomies.db');
export const e2eEnvPath = path.join(e2eRoot, 'env.json');

export function e2eDatabaseUrl() {
  return `file://${e2eDbPath}`;
}

export interface E2eEnv {
  MEDIA_ROOT: string;
  CACHE_DIR: string;
  ROOMIES_CONFIG_PATH: string;
  DATABASE_URL: string;
  ROOMIES_MEDIA_DIR: string;
  ROOMIES_CACHE_DIR: string;
}

export function buildE2eEnv(): E2eEnv {
  return {
    MEDIA_ROOT: e2eMediaDir,
    CACHE_DIR: e2eCacheDir,
    ROOMIES_CONFIG_PATH: e2eConfPath,
    DATABASE_URL: e2eDatabaseUrl(),
    ROOMIES_MEDIA_DIR: e2eMediaDir,
    ROOMIES_CACHE_DIR: e2eCacheDir,
  };
}

export function writeE2eEnvFile(env: E2eEnv = buildE2eEnv()) {
  fs.mkdirSync(e2eRoot, { recursive: true });
  fs.writeFileSync(e2eEnvPath, JSON.stringify(env, null, 2));
  return env;
}

export function readE2eEnvFile(): E2eEnv {
  if (!fs.existsSync(e2eEnvPath)) {
    throw new Error(`Missing ${e2eEnvPath} — run Playwright globalSetup first`);
  }
  return JSON.parse(fs.readFileSync(e2eEnvPath, 'utf8')) as E2eEnv;
}

export function ensureE2eDirs() {
  fs.mkdirSync(e2eMediaDir, { recursive: true });
  fs.mkdirSync(e2eCacheDir, { recursive: true });
  fs.mkdirSync(e2eConfigDir, { recursive: true });
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
