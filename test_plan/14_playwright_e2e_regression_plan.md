# Playwright Client-Side E2E Regression Testing Strategy — Roomies

## Executive Summary

To guarantee system stability, prevent sync loops, and verify player behavior under real browser conditions, we will establish an automated **Playwright E2E Regression Suite** inside a dedicated subfolder within `@roomies/test` (`packages/test/e2e/`).

This structure keeps Playwright tests **distinct from Vitest (`packages/test/src/suites/`)** while keeping all test suites inside the `@roomies/test` package.

---

## 1. Directory Structure (`packages/test/e2e/`)

```text
packages/test/
├── package.json                       # @roomies/test (scripts: "test": "vitest run", "test:e2e": "playwright test --config=e2e/playwright.config.ts")
├── vitest.config.ts                   # Vitest config targeting src/suites/*.test.ts
├── src/
│   ├── helpers/                       # Database, Server, and Fixture helpers
│   └── suites/                        # Vitest Unit & Integration Suites (*.test.ts)
└── e2e/                               # Playwright Client-Side E2E Subfolder (*.spec.ts)
    ├── playwright.config.ts           # Playwright parallel configuration
    ├── fixtures/                      # Multi-user browser context fixtures
    │   ├── authFixture.ts             # Pre-authenticated session helpers
    │   └── roomFixture.ts             # Multi-window (admin + guest) fixture
    ├── pom/                           # Page Object Models
    │   ├── PlayerPOM.ts
    │   ├── RoomPOM.ts
    │   ├── LobbyPOM.ts
    │   └── LoginPOM.ts
    └── specs/                         # Grouped & Dedicated Specs (*.spec.ts)
        ├── 01_player_controls_basic.spec.ts       [Grouped Small Tests]
        ├── 02_room_settings_permissions.spec.ts   [Grouped Small Tests]
        ├── 03_subtitles_formatting.spec.ts        [Grouped Small Tests]
        ├── 04_multiuser_sync_lifecycle.spec.ts    [Dedicated Complex Spec]
        ├── 05_async_mode_isolation.spec.ts        [Dedicated Complex Spec]
        ├── 06_transcode_offset_merging.spec.ts    [Dedicated Complex Spec]
        └── 07_sync_loops_stress_resiliency.spec.ts [Dedicated Complex Spec]
```

---

## 2. Playwright Configuration (`packages/test/e2e/playwright.config.ts`)

```ts
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './specs',
  fullyParallel: true,
  workers: process.env.CI ? 4 : '50%',
  retries: process.env.CI ? 2 : 0,
  timeout: 30000,
  expect: { timeout: 5000 },
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
    video: 'on-first-retry',
    headless: true,
    launchOptions: {
      args: ['--no-sandbox', '--disable-gpu', '--use-fake-ui-for-media-stream'],
    },
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: [
    {
      command: 'pnpm --filter @roomies/server dev',
      url: 'http://localhost:3000/api/auth/setup',
      reuseExistingServer: !process.env.CI,
      timeout: 30000,
    },
    {
      command: 'pnpm --filter @roomies/web dev',
      url: 'http://localhost:5173',
      reuseExistingServer: !process.env.CI,
      timeout: 30000,
    },
  ],
});
```

---

## 3. Spec Organization: Grouped vs. Dedicated Workflow Specs

### 3.1 — Grouped Specs (Small, Fast Browser Tests)

1. **`01_player_controls_basic.spec.ts`**:
   - Single-user play/pause toggles.
   - Forward/backward scrubbing (10s, 30s, 60s).
   - Volume/mute controls.
   - Keyboard shortcuts (`Space`, `K`, `J`, `L`, `ArrowRight`, `ArrowLeft`).
   - Double-clicking seek bar & boundary seeks (0s, end-of-file).

2. **`02_room_settings_permissions.spec.ts`**:
   - Root admin lock toggles.
   - Rejection of locked guest controls.
   - Room settings updates (`allowAsyncMode`).
   - Guest UI indicator updates.

3. **`03_subtitles_formatting.spec.ts`**:
   - ASS subtitle rendering over HTML5 video element.
   - Alignment tag parsing (`\an1` - `\an9`).
   - Hex color styling parsing (`\c&H...&`).
   - Subtitle track switching (English / Japanese / Off).

---

### 3.2 — Dedicated Specs (Large Multi-User Integration Workflows)

4. **`04_multiuser_sync_lifecycle.spec.ts` (Dedicated Workflow)**:
   - Spawns multi-window `adminContext` and `guestContext`.
   - Real-time play/pause broadcast synchronization across pages.
   - Soft drift rate adjustment (1.10x playback speedup).
   - Hard seek correction on >4000ms drift gap.
   - Mid-playback guest joining & playhead reconciliation.

5. **`05_async_mode_isolation.spec.ts` (Dedicated Workflow)**:
   - Guest entering async mode & receiving user-scoped master playlist.
   - Play/pause/seek isolation between async guest and room admin.
   - Admin disabling `allowAsyncMode` forcing guest back to room stream URL.
   - Admin media change resetting async members cleanly.

6. **`06_transcode_offset_merging.spec.ts` (Dedicated Workflow)**:
   - Multi-user seeking to same offset coalescing into single FFmpeg run.
   - Seeking past transcode window spawning new offset.
   - Playhead shifting & empty offset variant teardown.
   - Resolution switching (360p -> 1080p -> 720p) retaining exact timestamp.

7. **`07_sync_loops_stress_resiliency.spec.ts` (Dedicated Workflow)**:
   - Seek storm stress testing (10 seeks in 2 seconds).
   - Ping-pong hard seek loop cooldown prevention.
   - Network throttling & HLS buffer stall handling.
   - WebSocket connection drop & auto-reconnection synchronization.

---

## 4. Package Script Commands

In `packages/test/package.json`:
- `pnpm test` (or `pnpm --filter @roomies/test test`) → Runs Vitest (`vitest run`).
- `pnpm test:e2e` (or `pnpm --filter @roomies/test test:e2e`) → Runs Playwright (`playwright test --config=e2e/playwright.config.ts`).
