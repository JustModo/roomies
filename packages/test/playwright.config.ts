import path from 'path';
import { fileURLToPath } from 'url';
import { defineConfig, devices } from '@playwright/test';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '../..');
const testPkg = __dirname;
const startStack = path.resolve(testPkg, 'src/playwright/start-stack.mjs');

export default defineConfig({
  testDir: './src/playwright/specs',
  globalSetup: './src/playwright/global-setup.ts',
  globalTeardown: './src/playwright/global-teardown.ts',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 2 : 0,
  timeout: 60000,
  expect: { timeout: 15000 },
  outputDir: './test-results',
  use: {
    baseURL: 'http://127.0.0.1:5173',
    trace: 'on-first-retry',
    video: 'on-first-retry',
    headless: true,
    launchOptions: {
      args: [
        '--no-sandbox',
        '--disable-gpu',
        '--use-fake-ui-for-media-stream',
        '--autoplay-policy=no-user-gesture-required',
      ],
    },
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      // Caddy + API against packages/test/.e2e (start-stack prepares sandbox first).
      command: `node ${startStack}`,
      cwd: testPkg,
      url: 'http://127.0.0.1:3000/api/auth/status',
      reuseExistingServer: false,
      timeout: 180000,
    },
    {
      command: 'pnpm --filter @roomies/web dev',
      cwd: repoRoot,
      url: 'http://127.0.0.1:5173',
      reuseExistingServer: false,
      timeout: 120000,
    },
  ],
});
