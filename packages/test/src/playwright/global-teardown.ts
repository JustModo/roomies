import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { wipeE2eRuntimeDirs, testPkgRoot } from './e2ePaths';

function findRepoRoot(): string {
  let rootDir = testPkgRoot;
  while (rootDir !== '/' && !fs.existsSync(path.join(rootDir, 'pnpm-workspace.yaml'))) {
    rootDir = path.dirname(rootDir);
  }
  return rootDir;
}

export default async function globalTeardown() {
  const repoRoot = findRepoRoot();
  try {
    execSync('docker compose -f docker-compose.dev.yml down', {
      cwd: repoRoot,
      stdio: 'inherit',
    });
  } catch (err) {
    console.warn('[e2e] docker compose down failed (may already be stopped):', err);
  }

  wipeE2eRuntimeDirs();
  console.log('[e2e] wiped .e2e/config, .e2e/cache, .e2e/media');
}

const isDirectRun =
  process.argv[1] &&
  (process.argv[1].endsWith('global-teardown.ts') || process.argv[1].endsWith('global-teardown.js'));
if (isDirectRun) {
  globalTeardown().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
