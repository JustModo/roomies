# `@roomies/test` — Test Infrastructure Package

Vitest unit/integration suites and Playwright client E2E against the live stack.

## Structure

```
packages/test/
├── .e2e/                   # Gitignored runtime sandbox (created per run)
│   ├── media/              # ffmpeg-generated Movie/movie.mp4 + movie.srt
│   ├── cache/              # HLS segments → CACHE_DIR / Caddy
│   └── config/             # roomies.conf + roomies.db
├── playwright.config.ts
├── vitest.config.ts
└── src/
    ├── playwright/
    └── vitest/
```

## E2E sandbox lifecycle

On `pnpm test:e2e`:

1. **webServer** (`start-stack.mjs`) prepares `.e2e/{media,cache,config}`: generates a 5-minute black `movie.mp4` + dummy `movie.srt` with host **ffmpeg**, Prisma push, `env.json`; then starts Caddy (`ROOMIES_MEDIA_DIR` / `ROOMIES_CACHE_DIR`) + API (`tsx` with `.e2e` env). Vite starts separately. Prep lives in the webServer command because Playwright starts webServers before `globalSetup`.
2. Auth uses `POST /api/auth/setup` on the fresh DB (`admin` / `password123`)
3. **globalTeardown** runs `docker compose down` and wipes `.e2e/config`, `.e2e/cache`, `.e2e/media` (including generated media)

**Requirement:** `ffmpeg` must be on `PATH` for E2E runs.

## Running Tests

```bash
# Vitest (unit / protocol)
pnpm --filter @roomies/test test

# Playwright E2E
pnpm test:e2e
```

## Best Practices

1. Assert `video.paused` / `currentTime` / overlays / control titles — never URL alone.
2. Enter the room via Lobby **JOIN ROOM** (direct `/room` redirects).
3. Use `setupTestEnvironment()` for Vitest isolation; always `await env.cleanup()`.
4. E2E runs with `workers: 1` because the room is a singleton.
5. Prefer Vitest helpers for auth bootstrapping.
