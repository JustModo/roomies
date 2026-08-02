#!/usr/bin/env node
/**
 * Prepares packages/test/.e2e/{media,cache,config} for a Playwright run.
 * Invoked by start-stack.mjs (Playwright starts webServer before globalSetup).
 * Generates a 5-minute black movie + dummy SRT into .e2e/media (no committed assets).
 */
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const testPkgRoot = path.resolve(__dirname, '../..');
const e2eRoot = path.join(testPkgRoot, '.e2e');
const e2eMediaDir = path.join(e2eRoot, 'media');
const e2eCacheDir = path.join(e2eRoot, 'cache');
const e2eConfigDir = path.join(e2eRoot, 'config');
const e2eConfPath = path.join(e2eConfigDir, 'roomies.conf');
const e2eDbPath = path.join(e2eConfigDir, 'roomies.db');
const e2eEnvPath = path.join(e2eRoot, 'env.json');

const MEDIA_DURATION_SEC = 300;
const SUBTITLE_INTERVAL_SEC = 10;

function findRepoRoot() {
  let rootDir = testPkgRoot;
  while (rootDir !== '/' && !fs.existsSync(path.join(rootDir, 'pnpm-workspace.yaml'))) {
    rootDir = path.dirname(rootDir);
  }
  return rootDir;
}

function requireFfmpeg() {
  try {
    execSync('ffmpeg -version', { stdio: 'pipe' });
  } catch {
    throw new Error(
      'ffmpeg is required to generate E2E media. Install ffmpeg and ensure it is on PATH.',
    );
  }
}

function formatSrtTime(totalSeconds) {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = Math.floor(totalSeconds % 60);
  const ms = Math.round((totalSeconds - Math.floor(totalSeconds)) * 1000);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
}

function writeDummySrt(srtPath) {
  const cues = [];
  let index = 1;
  for (let start = 0; start < MEDIA_DURATION_SEC; start += SUBTITLE_INTERVAL_SEC) {
    const end = Math.min(start + SUBTITLE_INTERVAL_SEC - 0.5, MEDIA_DURATION_SEC);
    cues.push(
      `${index}`,
      `${formatSrtTime(start)} --> ${formatSrtTime(end)}`,
      `E2E subtitle ${index}`,
      '',
    );
    index += 1;
  }
  fs.writeFileSync(srtPath, cues.join('\n') + '\n');
}

function generateBlackMovie(mp4Path) {
  requireFfmpeg();
  console.log(`[e2e] generating ${MEDIA_DURATION_SEC}s black video at ${mp4Path}`);
  execSync(
    [
      'ffmpeg',
      '-y',
      '-f',
      'lavfi',
      '-i',
      'color=c=black:s=1280x720:r=30',
      '-f',
      'lavfi',
      '-i',
      'anullsrc=r=44100:cl=stereo',
      '-t',
      String(MEDIA_DURATION_SEC),
      '-c:v',
      'libx264',
      '-preset',
      'ultrafast',
      '-pix_fmt',
      'yuv420p',
      '-c:a',
      'aac',
      '-shortest',
      `"${mp4Path}"`,
    ].join(' '),
    { stdio: 'inherit' },
  );
}

function pushPrismaSchema(databaseUrl) {
  const repoRoot = findRepoRoot();
  const apiDir = path.join(repoRoot, 'apps/api');
  const localPrismaJs = path.join(apiDir, 'node_modules', 'prisma', 'build', 'index.js');
  const rootPrismaJs = path.join(repoRoot, 'node_modules', 'prisma', 'build', 'index.js');

  let prismaCmd = '';
  if (fs.existsSync(localPrismaJs)) {
    prismaCmd = `"${process.execPath}" "${localPrismaJs}"`;
  } else if (fs.existsSync(rootPrismaJs)) {
    prismaCmd = `"${process.execPath}" "${rootPrismaJs}"`;
  } else {
    prismaCmd = 'pnpm exec prisma';
  }

  for (const f of [e2eDbPath, `${e2eDbPath}-journal`]) {
    if (fs.existsSync(f)) fs.rmSync(f, { force: true });
  }

  execSync(`${prismaCmd} db push --accept-data-loss`, {
    cwd: apiDir,
    env: {
      ...process.env,
      DATABASE_URL: databaseUrl,
    },
    stdio: 'inherit',
  });
}

function seedGeneratedMedia() {
  const destMovie = path.join(e2eMediaDir, 'Movie');
  if (fs.existsSync(destMovie)) {
    fs.rmSync(destMovie, { recursive: true, force: true });
  }
  fs.mkdirSync(destMovie, { recursive: true });

  const mp4Path = path.join(destMovie, 'movie.mp4');
  const srtPath = path.join(destMovie, 'movie.srt');
  writeDummySrt(srtPath);
  generateBlackMovie(mp4Path);
  console.log('[e2e] generated media:', { mp4Path, srtPath });
}

export function prepareSandbox() {
  fs.mkdirSync(e2eMediaDir, { recursive: true });
  fs.mkdirSync(e2eCacheDir, { recursive: true });
  fs.mkdirSync(e2eConfigDir, { recursive: true });

  seedGeneratedMedia();

  fs.writeFileSync(
    e2eConfPath,
    [
      'CORS_ORIGIN=http://127.0.0.1:5173',
      'FFMPEG_VIDEO_CODEC=libx264',
      'FFMPEG_PRESET=ultrafast',
      'HWACCEL_MODE=cpu',
    ].join('\n') + '\n',
  );

  const databaseUrl = `file://${e2eDbPath}`;
  pushPrismaSchema(databaseUrl);

  const env = {
    MEDIA_ROOT: e2eMediaDir,
    CACHE_DIR: e2eCacheDir,
    ROOMIES_CONFIG_PATH: e2eConfPath,
    DATABASE_URL: databaseUrl,
    ROOMIES_MEDIA_DIR: e2eMediaDir,
    ROOMIES_CACHE_DIR: e2eCacheDir,
  };
  fs.writeFileSync(e2eEnvPath, JSON.stringify(env, null, 2));

  console.log('[e2e] sandbox ready:', {
    media: env.MEDIA_ROOT,
    cache: env.CACHE_DIR,
    config: e2eConfigDir,
    db: e2eDbPath,
  });

  return env;
}

const isDirectRun =
  process.argv[1] &&
  (process.argv[1].endsWith('prepare-sandbox.mjs') || process.argv[1].endsWith('prepare-sandbox.js'));
if (isDirectRun) {
  try {
    prepareSandbox();
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}
