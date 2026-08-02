# Relocation Strategy: Restructuring `packages/test/src/`

## Executive Summary

To provide clear, intuitive organization inside `@roomies/test`, we are relocating all test folders into `packages/test/src/`:
- Move `packages/test/src/suites/` (Vitest suites) → `packages/test/src/vitest/`
- Move `packages/test/e2e/` (Playwright E2E) → `packages/test/src/playwright/`

---

## New Directory Layout (`packages/test/src/`)

```text
packages/test/
├── package.json
├── vitest.config.ts                       # include: ['src/vitest/**/*.test.ts']
├── tsconfig.json                          # include: ['src/**/*']
└── src/
    ├── helpers/                           # Database, Server, Fixture, WS helpers
    ├── setup/                             # Global & env Vitest setups
    ├── vitest/                            # [NEW LOCATION] Vitest Unit & Integration Suites
    │   ├── auth.test.ts
    │   ├── contracts.test.ts
    │   ├── library.test.ts
    │   ├── playback_async.test.ts
    │   ├── playback_sync.test.ts
    │   ├── subtitles.test.ts
    │   ├── transcoding.test.ts
    │   └── websocket.test.ts
    └── playwright/                        # [NEW LOCATION] Playwright Client-Side E2E Suite
        ├── playwright.config.ts           # Config targeting ./specs
        ├── fixtures/                      # Multi-user browser context fixtures
        ├── pom/                           # Page Object Models
        └── specs/                         # 105 Playwright E2E Specs (*.spec.ts)
            ├── 01_player_controls_basic.spec.ts
            ├── 02_room_settings_permissions.spec.ts
            ├── 03_subtitles_formatting.spec.ts
            ├── 04_multiuser_sync_lifecycle.spec.ts
            ├── 05_async_mode_isolation.spec.ts
            ├── 06_transcode_offset_merging.spec.ts
            └── 07_sync_loops_stress_resiliency.spec.ts
```

---

## Configuration Updates Required

1. **`packages/test/vitest.config.ts`**:
   - Update `include: ['src/vitest/**/*.test.ts']`.
2. **`packages/test/package.json`**:
   - `"test:e2e": "playwright test --config=src/playwright/playwright.config.ts"`.
3. **`packages/test/tsconfig.json`**:
   - `include: ["src/**/*", "../../apps/api/src/types.d.ts"]`.
