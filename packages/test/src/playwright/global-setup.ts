/**
 * Playwright globalSetup runs AFTER webServer is up.
 * Sandbox prep happens in start-stack.mjs → prepare-sandbox.mjs.
 * This hook only verifies the sandbox env file exists.
 */
import fs from 'fs';
import { e2eEnvPath, readE2eEnvFile } from './e2ePaths';

export default async function globalSetup() {
  if (!fs.existsSync(e2eEnvPath)) {
    throw new Error(
      `Missing ${e2eEnvPath}. start-stack.mjs should have prepared packages/test/.e2e before the API started.`,
    );
  }
  const env = readE2eEnvFile();
  console.log('[e2e] globalSetup OK — sandbox env:', {
    MEDIA_ROOT: env.MEDIA_ROOT,
    CACHE_DIR: env.CACHE_DIR,
    DATABASE_URL: env.DATABASE_URL,
  });
}
