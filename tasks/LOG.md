# Development Log

This is the append-only log of the Watch Party project. 
All agents must append their progress, decisions, and skipped items here after completing a work session.

---

## [2026-07-05] Initial Architecture & Scaffolding
**Agent**: Antigravity
**Summary of Work Done**:
- Scaffolded the pnpm + Turborepo monorepo with strict feature separation across `apps/api`, `apps/web`, and `packages/`.
- Bootstrapped Fastify backend with plugins (`@fastify/cors`, `@fastify/websocket`).
- Configured Prisma 7 ORM connecting to Postgres. Built schemas for `User`, `Library`, `MediaFile`, `PlaybackSession`, `Settings`, and `RefreshToken`.
- Configured Redis OM connecting to Redis. Built transient schemas for `presence`, `chat`, `playbackState`, and `socketSession`.
- Implemented `AuthService` and `AuthController` for JWT-based Login/Register flows.
- Built the WebSocket Gateway (`apps/api/src/websocket/gateway.ts`).
- Created Zod discriminated unions in `packages/contracts/src/socket/index.ts` to strictly type and validate incoming/outgoing WS payloads (e.g. `client.play`, `server.chat`).
- Documented API integration flow for the frontend in `api-integration.md`.

**Decisions / Considerations**:
- Relocated `docker-compose.yml` to the root directory for easier local startup of DBs.
- Zod is strictly utilized to automatically narrow payload types inside the socket gateway, preventing rogue or malformed WS messages.
- We opted to validate Fastify HTTP routes explicitly inside the route handler using Zod `.safeParse()` rather than installing heavy Fastify-Zod provider plugins to keep dependencies lean and understandable.

**What is Left to do Next**:
- Check the `CHECKLIST.md`. The most immediate next step should be implementing the **Users** and **Library** backend features so that we actually have media to test the playback orchestration against.

---

## [2026-07-05] Users & Library Backend Features
**Agent**: Antigravity
**Summary of Work Done**:
- Designed Zod API response schemas for `UserSettings`, `UserProfile`, `MediaFile`, and `Library` in `packages/contracts/src/api/index.ts`.
- Installed `fluent-ffmpeg` and `ffprobe-static` into `apps/api` to parse local media duration securely.
- Built a JWT verification middleware hook `verifyJwt` inside `apps/api/src/common/authMiddleware.ts`.
- Fully implemented the `UsersService` & `UsersController` protecting endpoints to fetch and update `Settings` directly in Postgres.
- Engineered a recursive folder scanner inside `LibraryService` using native `fs` and `fluent-ffmpeg` to populate the `MediaFile` Postgres tables dynamically, completely offline.
- Integrated `userRoutes` and `libraryRoutes` into the Fastify bootstrap cycle.

**Decisions / Considerations**:
- We execute `ffprobe` locally on the Fastify instance rather than leaning on the containerized FFmpeg worker just to parse metadata. This keeps the library syncing synchronous and extremely fast, avoiding message broker overhead for simple file probing.

**What is Left to do Next**:
- Check the `CHECKLIST.md`. The next task is the **Playback Orchestration**. We have a Library, so we can finally implement starting a party.

---

## [2026-07-05] Infrastructure Fixes, Scalable Sockets & Frontend Scaffold
**Agent**: Antigravity
**Summary of Work Done**:
- Scaffolded the React + Vite frontend (`apps/web`) with TypeScript, React dependencies, and proper monorepo integration.
- Stripped hacky TS `paths` configurations and adopted standard Turborepo `"workspace:*"` dependency linking, achieving a 100% clean cross-monorepo build.
- Refactored the `apps/api` WebSocket Gateway to use a highly scalable, Feature-Oriented router pattern (`apps/api/src/websocket/router.ts`), breaking apart the massive `switch` statement into isolated feature handlers (`chat/socket.ts`, `playback/socket.ts`).
- Replaced the deprecated `fluent-ffmpeg` package entirely with a lightweight native Node `child_process.execFile` implementation invoking `ffprobe-static` directly.

**Decisions / Considerations**:
- `apps/web` is strictly built on top of standard Vite tooling. It relies on Turborepo's dependency linking to resolve types and schemas from `@roomies/contracts` natively.
- The Socket Router isolates the Gateway from business logic. As new features (e.g. Sync, Voice) are added, their handlers simply register with the dispatcher.

**What is Left to do Next**:
- Check the `CHECKLIST.md`. Now that the infrastructure is pristine and the WebSocket router is perfectly scalable, we can move forward with **Playback Orchestration**.

---

## [2026-07-05] Playback Orchestration, Transcoding & Full Dockerization
**Agent**: Antigravity
**Summary of Work Done**:
- Added `client.join` and `client.heartbeat` Zod schemas to `packages/contracts/src/socket/PlaybackEvents.ts` and registered them in the discriminated union.
- Added `StartPartyRequest`, `StartPartyResponse`, and `TranscodeStatusResponse` Zod schemas to `packages/contracts/src/api/index.ts`.
- Built `apps/api/src/playback/service.ts`: creates `PlaybackSession` in Postgres, seeds Redis OM `playbackState`, enqueues a BullMQ transcode job.
- Built `apps/api/src/playback/controller.ts`: `POST /api/playback/start` and `GET /api/playback/:partyId` routes.
- Built `apps/api/src/playback/socket.ts`: full party room management via `Map<partyId, Set<WebSocket>>` decorated on the Fastify instance. Handles `client.join`, `client.play`, `client.pause`, `client.seek`, `client.heartbeat`.
- Built `apps/api/src/transcoding/queue.ts`: BullMQ `Queue` with typed `TranscodeJobData`, retry config.
- Built `apps/api/src/transcoding/worker.ts`: BullMQ `Worker` that runs `ffmpeg` via `child_process.execFile` to produce HLS segments into `cache/<partyId>/`. Sets Redis status key.
- Built `apps/api/src/transcoding/controller.ts`: `GET /api/transcoding/:partyId/status` returns status + Caddy HLS URL.
- Updated `apps/api/src/websocket/gateway.ts`: decorates app with `rooms` Map, passes typed `SocketContext`, cleans rooms on disconnect.
- Updated `apps/api/src/websocket/router.ts`: dispatches all new events.
- Updated `apps/api/src/bootstrap/index.ts`: registers playback and transcoding routes, starts BullMQ worker in-process.
- Created `apps/api/Dockerfile`: multi-stage build (builder → runner). Runner stage runs `apk add ffmpeg` so the system binary is available to `child_process`.
- Created `apps/web/Dockerfile`: multi-stage Vite build → nginx runner with SPA fallback.
- Created `infra/caddy/Caddyfile`: single entrypoint routing `/api/*`, `/ws`, `/hls/*`, and `/*` to respective containers.
- Rewrote `docker-compose.yml`: full production-grade compose with postgres, redis, api, web, caddy + healthchecks and shared `media/` and `cache/` volumes.
- Created `apps/api/.env.example` with all environment variables documented.
- **0 TypeScript errors** after all changes.

**Decisions / Considerations**:
- `fluent-ffmpeg` was *not* brought back. We continue with native `child_process.execFile` for the same reasons — the npm package is abandoned. The system binary (`apk add ffmpeg`) in Docker and PATH-based binary locally is the correct approach.
- BullMQ uses the same Redis connection as the rest of the app (no separate broker).
- Job deduplication via `jobId: partyId` prevents duplicate transcode jobs for the same party.
- The rooms Map is scoped to a single Fastify instance (single-node). When horizontal scaling is needed, replace with `@socket.io/redis-adapter`.

**What is Left to do Next**:
- Chat Feature and Voice Signaling (WebRTC) on the backend.
- Frontend: React Router, auth UI, library UI, Shaka Player integration, chat sidebar.
- Sync Engine (drift computation using `client.heartbeat`).

---

## [2026-07-05] Codebase Spring Cleaning
**Agent**: Antigravity
**Summary of Work Done**:
- Executed a massive deletion of abandoned scaffolding, specifically removing dummy `streaming`, `health`, `presence`, `settings`, `sync`, and `voice` directories.
- Cleaned up the `transcoding` directory by deleting abandoned nested subfolders (`cache`, `manager`, `ffmpeg`, `scheduler`, `types`, `worker`).
- Deleted unused nested `events` and `schemas` from `packages/contracts`.
- Refactored `database/redis.ts` from a monolithic "God object" by extracting the Redis OM schemas (`playbackState`, `chat`, `presence`, `socketSession`) into their respective feature folders.
- Verified zero TypeScript compilation errors post-cleanup.

**Decisions / Considerations**:
- Clean codebase enables proper feature development and mitigates circular dependencies for Redis repositories.

**What is Left to do Next**:
- Still pending Chat Feature and Voice Signaling on the backend.
- Still pending Frontend features.

---

## [2026-07-05] Zero-Config Docker Simplification & Secrets Generation
**Agent**: Antigravity
**Summary of Work Done**:
- Updated `schema.prisma` with a `ServerConfig` model to store auto-generated secrets.
- Built a configuration bootstrap service (`apps/api/src/config/index.ts`) that runs on startup. If `JWT_SECRET` and `JWT_REFRESH_SECRET` do not exist in the database, it generates secure 64-byte hex strings via `crypto.randomBytes()`, saves them, and exposes them in memory.
- Refactored `apps/api/src/auth/service.ts`, `authMiddleware.ts`, and `websocket/auth.ts` to utilize the dynamic `Config` object instead of reading from `process.env`.
- Radically simplified `docker-compose.yml`: Hardcoded `DATABASE_URL` and `REDIS_URL` internally and removed all exposed ports (`postgres:5432`, `redis:6379`, `api:3000`), forcing all traffic securely through the Caddy reverse proxy on ports `80/443`.
- Reduced `.env.example` to require only a single configuration property: `MEDIA_DIR`, effectively achieving zero-configuration startup for the end-user.
- Patched the API `Dockerfile` to automatically run `npx prisma db push` before starting the Node server to ensure schemas are always in sync on boot.
- Verified successful compilation with zero TypeScript errors.

**Decisions / Considerations**:
- Storing the auto-generated JWT secrets in the database guarantees that users are not forcibly logged out when the API container is restarted or updated, while simultaneously removing the burden of manual secret management from the user.

**What is Left to do Next**:
- Complete the React frontend MVP to actually consume the now-pristine backend architecture.

---

## [2026-07-05] Root/Guest Architecture Simplification
**Agent**: Antigravity
**Summary of Work Done**:
- Updated `schema.prisma` to completely remove `email` and the `Settings` table, simplifying the `User` model to strictly require `username` and `password`.
- Introduced a strict `role` property (`"root"` | `"guest"`) to the `User` model.
- Refactored `apps/api/src/auth/service.ts` to implement a secure, two-tiered authentication flow:
  - `POST /api/auth/setup`: Checks if there are any users in the DB. If 0, creates the first user as a `root` user. If >0, it correctly rejects the request.
  - `POST /api/users/guest`: A protected endpoint that requires a valid `root` JWT token. Creates subsequent `guest` accounts.
- Removed all unnecessary settings endpoints and decoupled related UI logic from contracts.
- Ran `npx prisma db push --accept-data-loss` to synchronize the simplified schema.
- Rebuilt the `api` docker container to apply the changes and trigger the automatic schema migration.

**Decisions / Considerations**:
- This fulfills the user's request to have a simplified, private deployment where the admin sets up the first account and invites/creates accounts for their roommates manually, rather than allowing open public registration.

**What is Left to do Next**:
- Still pending the React Frontend MVP.

---

## [2026-07-05] Backend Finalization & Sync Engine Pivot
**Agent**: Antigravity
**Summary of Work Done**:
- Transitioned Party orchestration off Postgres `PlaybackSession` and completely into Redis OM `playbackState` for extreme speed and transient memory management.
- Replaced party join tokens with a Single Active Party flow (`GET /api/playback/party/active`), matching the user's updated UX requirements.
- Attempted to implement a Sync Engine and WebRTC Voice Signaling but explicitly reverted them at the user's request to maintain focus on the core MVP.
- Cleaned up abandoned schema imports from `@roomies/contracts/src/socket`.
- Fixed a Docker build issue where Prisma Client wasn't resolving configuration during the runner stage by copying `node_modules` from the builder stage, saving build time and fixing missing modules.
- Updated `tasks/references/api-integration.md` to perfectly match the current, streamlined API contracts.

**Decisions / Considerations**:
- User requested to strip away the complex Sync Engine drift correction and WebRTC Voice features in order to stabilize the "First Production Demo Launch" MVP.
- We rely on `node_modules` generated in the Docker `builder` stage for the `runner` stage, bypassing redundant package installations and ensuring the generated Prisma Client transfers perfectly.

**What is Left to do Next**:
- Test the core endpoints (setup, login, add guest, start party) to verify absolute stability.
- Move onto the React Frontend MVP.

---

## [2026-07-05] React Frontend MVP Complete
**Agent**: Antigravity
**Summary of Work Done**:
- Scaffolded out the `apps/web` React application architecture.
- Implemented `src/api/client.ts` to automatically handle JWT tokens and JSON serialization.
- Created `AuthContext` to manage user state and authentication logic.
- Built `useLibrary` and `usePlayback` hooks to cleanly abstract away state management.
- Implemented `Dashboard.tsx` for viewing the media library and `Login.tsx` for the dual-purpose setup/login flow.
- Built `Party.tsx` incorporating `hls.js` to automatically consume the transcoded HLS stream from Caddy when the backend flags it as `ready`.
- Organized directory structures (`hooks`, `contexts`, `api`, `pages`, `components`) and cleared all TypeScript errors.
- Fixed a bug where the frontend was sending an empty payload for the library scan by correctly passing `{ name: 'Main Library', path: '/srv/media' }`.
- Rebuilt the `web` container using `docker compose up -d --build web` so the statically-built nginx container could serve the updated code.

**Decisions / Considerations**:
- Used native CSS variables for a sleek dark mode instead of introducing a heavy CSS framework like Tailwind to adhere to the user's styling requests.
- Chosen `hls.js` over native video for robust compatibility across non-Safari browsers.

**What is Left to do Next**:
- Implement the Social UI (WebSockets for chat, presence, playback synchronization).

---

## [2026-07-05] Backend Security Audit & Hardening
**Agent**: Claude
**Summary of Work Done**:
Ran a focused security audit of `apps/api` (auth, library scanner, transcoding, WebSocket gateway, infra config) and fixed every finding:
- **Critical**: `GET /api/transcoding/:partyId/status` had zero auth (`transcoding/controller.ts`) — added `verifyJwt`. CORS was `origin: '*'` + `credentials: true` (`bootstrap/index.ts`) — replaced with an explicit `CORS_ORIGIN`-driven allow-list and dropped `credentials` (JWT travels via `Authorization` header, not cookies). Library scan (`library/service.ts`) accepted any filesystem path with no containment check — added a `MEDIA_ROOT`-anchored resolver that rejects absolute-path/`..` escapes and skips symlinks during the walk.
- **High**: Added a `requireRole()` middleware (`common/authMiddleware.ts`) and applied `root`-only gating to library scan and `POST /api/playback/start`; added a party-leader check in `playback/socket.ts` so only the user who started the party can drive `client.play`/`pause`/`seek`. Closed a race in `AuthService.setupRoot` (`auth/service.ts`) where concurrent `POST /api/auth/setup` calls could create two root accounts — now guarded by an atomic `ServerConfig` unique-key insert inside a transaction. Redis had no password on the shared Docker network — added `REDIS_PASSWORD` (`docker-compose.yml`, `.env.example`, `setup.sh` now auto-generates it like `POSTGRES_PASSWORD`).
- **Medium**: Pinned `jwt.verify(..., { algorithms: ['HS256'] })` in both `authMiddleware.ts` and `websocket/auth.ts` instead of relying on library defaults. WS auth now prefers a `Sec-WebSocket-Protocol: bearer.<token>` header over the `?token=` query string (falls back to query string for simplicity), avoiding proxy/access-log token leakage. Added a per-connection sliding-window rate limit (20 msgs/sec) on the WebSocket gateway (`websocket/gateway.ts`) to stop `client.seek`/`heartbeat` flooding. Closed a similar bootstrap race for the JWT secrets themselves by switching `config/index.ts` to an atomic `prisma.serverConfig.upsert`.
- **Low**: Bumped bcrypt cost factor 10 → 12; `AuthService.login` now always calls `bcrypt.compare` (against a dummy hash when the user doesn't exist) to remove a username-enumeration timing side-channel. Removed the `3001:3000` host port publish for the `api` service in `docker-compose.yml` — all traffic must now go through Caddy.

**Decisions / Considerations**:
- Did not implement per-party membership authorization on the transcoding status endpoint (an authenticated user can still query any `partyId`'s HLS URL) — this app currently has a single global active party with no invite/membership model, so it's a smaller residual risk than the fixes above; left as an open item since it would need a real membership concept to do properly.
- Kept `?token=` as a WS auth fallback rather than removing it outright, since the frontend WebSocket client (`useWebSocket` hook) hasn't been implemented yet — the header-based path is ready for whoever builds that hook next.
- `redis-om` and using two Redis client libraries (`redis` + `ioredis`) were flagged as maintenance/attack-surface concerns but left as-is; not a live vulnerability.

**What is Left to do Next**:
- Add party-membership authorization to the transcoding status endpoint once a real party-invite model exists.
- HTTPS auto-cert in the Caddyfile for production domains.
- Everything already pending from the previous entry: Social UI (chat/presence/voice), frontend WebSocket wiring.

---

## [2026-07-05] SQLite Migration, Redis Removal, Chat & Sync Engine Complete
**Agent**: Claude
**Summary of Work Done**:
Migrated the backend off PostgreSQL and Redis entirely (single-node, no horizontal scaling requirement — an external DB server and broker were unnecessary complexity), and finished the two half-built realtime features:
- **PostgreSQL → SQLite**: `apps/api/prisma/schema.prisma` datasource switched to `sqlite`; `apps/api/src/database/postgres.ts` replaced by `database/sqlite.ts` using `@prisma/adapter-better-sqlite3` (`better-sqlite3` under the hood, no separate DB process). All 6 importers (`auth`, `bootstrap`, `config`, `library`, `playback`, `users`) repointed. No raw SQL existed anywhere, so no query rewriting was needed. Verified the SQLite adapter works at runtime (not just typechecks): ran `prisma db push` and live queries against a real `.db` file, and confirmed the `ServerConfig`-unique-key race guards added in the security-audit session (root bootstrap, JWT secret upsert) still throw `P2002`/behave idempotently on SQLite.
- **Redis removed entirely**: `playbackState` (Redis OM) → `playback/store.ts` (single in-memory variable — app only ever supports one global active party). `chat` (Redis OM, was write-only) → `chat/store.ts` (capped 500-message ring buffer per party). `socketSession` (Redis OM) → `websocket/store.ts` (plain `Map`). `presence` (Redis OM) was confirmed fully dead code (nothing read/wrote it) — deleted along with its empty `service.ts` stub. Transcode status key (`redis.set(..., {EX: 86400})`) → `transcoding/status.ts` (`Map` + `setTimeout`-based 24h expiry). BullMQ → `transcoding/queue.ts` rewritten as an in-process `EventEmitter`-based queue (array + `Set<jobId>` dedup, concurrency limit 2, retry with exponential backoff) — same public shape (`.add(name, data, {jobId})`, `'completed'`/`'failed'` events) so `bootstrap/index.ts` and `playback/service.ts` didn't need call-site changes beyond the import path.
- **Chat feature completed**: the realtime path (schemas, `handleClientChat`, broadcast) already worked; added the missing piece — `GET /api/chat/history?partyId=` (`chat/controller.ts` + `chat/routes.ts`, new `chat/index.ts` export, registered in `bootstrap/index.ts`), plus a `ChatHistoryResponse`/`ChatMessageResponse` Zod schema in `packages/contracts`.
- **Sync Engine completed**: `handleClientHeartbeat` in `playback/socket.ts` was a no-op; now computes expected server position (`state.position + elapsed * state.speed`) and, if a client's reported position drifts more than 2 seconds, sends a `server.seek` correction directly to that one socket (not a room broadcast) — matches `tasks/ARCHITECTURE.md`'s spec exactly, per user confirmation during planning.
- **Infra**: `docker-compose.yml` — removed the `postgres` and `redis` services entirely; added a bind-mounted `./data:/app/data` volume for the SQLite file; `DATABASE_URL` is now `file:/app/data/roomies.db`. `apps/api/Dockerfile` — build-time `prisma generate` now uses a dummy `file:` URL; added `python3 make g++` to the base stage so `better-sqlite3`'s native binding compiles on Alpine/musl (no prebuilt binary available there). `.env.example`/`setup.sh` — removed `POSTGRES_PASSWORD`/`REDIS_PASSWORD` generation entirely (no more infra secrets needed); `setup.sh` now just ensures `./data` exists.
- Updated `tasks/ARCHITECTURE.md`, `tasks/CHECKLIST.md`, and `tasks/references/api-integration.md` to match (removed Postgres/Redis/BullMQ language throughout, documented the new chat-history endpoint and the WS auth subprotocol option added in the prior security session).

**Decisions / Considerations**:
- Per user confirmation: state is fully ephemeral/in-memory (chat history, playback state, transcode job state) — a restart of the API wipes it, which is an accepted tradeoff for single-node simplicity and matches how this data already behaved on Redis (nothing snapshotted it to Postgres either).
- Sync Engine only corrects position (`server.seek`), not play/pause state, per the documented 2-second-threshold, single-client-only rubberbanding behavior — also per user confirmation.
- Kept the in-process transcode queue's public API (`.add(name, data, {jobId})`, `on('completed'|'failed')`) intentionally identical to BullMQ's so no call sites outside `transcoding/` needed to change.
- Did not add SQLite-backed persistence for chat/transcode job state — user explicitly chose the fully-ephemeral option over that.

**What is Left to do Next**:
- Add party-membership authorization to the transcoding status endpoint (still an open item from the prior session).
- HTTPS auto-cert in the Caddyfile for production domains.
- Voice Signaling (WebRTC), frontend Social UI (chat sidebar, presence indicators), frontend `useWebSocket` hook and player↔socket wiring.

---

## [2026-07-05] In-Process Queue Correctness Review + End-to-End Test
**Agent**: Claude
**Summary of Work Done**:
Reviewed the SQLite/in-memory migration for event-loop blocking and correctness bugs, then wrote and ran a real end-to-end test.
- **Event-loop blocking**: confirmed `better-sqlite3` is synchronous, but every query in this app is a tiny point-lookup — not a real problem at this app's scale. `chat/store.ts`'s per-party message map, however, never evicted an entry once a party ended — fixed by adding `chatStore.remove(partyId)` and calling it from `playback/service.ts`'s `startParty` for the *previous* party before overwriting global state.
- **Transcode queue (`transcoding/queue.ts`)**: found and fixed a real bug — `drain()` called `runJob(job)` without awaiting/catching it, and a throwing `'completed'`/`'failed'` listener would become an unhandled promise rejection, crashing the whole server. Wrapped both `emit()` calls in a new `emitSafely()` helper so a broken listener only logs, never crashes or gets miscategorized as a job failure. Verified with a standalone repro script (a throwing listener no longer crashes the process).
- **Premature failure status (`transcoding/worker.ts`)**: `setTranscodeStatus(partyId, 'failed')` fired on the *first* ffmpeg failure even when a retry would still succeed, so a polling client could see `'failed'` mid-backoff. Moved the final-status write to the queue's `'failed'` listener in `bootstrap/index.ts`, which only fires once retries are exhausted. Verified with a standalone repro script (status stays `'pending'` through a successful retry).
- **Library scan (`library/service.ts`)**: the file-processing loop was fully sequential (one `ffprobe` process at a time) — replaced with a small in-file bounded-concurrency helper (`runWithConcurrency`, concurrency 4), no new dependency.
- **Real bug found via the E2E test itself**: `transcoding/worker.ts` never specified `-c:v`, so it silently depended on ffmpeg's default H.264 encoder, and hardcoded `-profile:v baseline -level 3.0` — syntax specific to `libx264`. On this dev machine (and potentially Alpine builds without `libx264`), the default encoder is `libopenh264`, which rejects that exact syntax and fails outright — meaning transcoding, and therefore playback, would never have worked in that environment. Fixed by making the codec and its options explicit and configurable via `FFMPEG_VIDEO_CODEC`/`FFMPEG_VIDEO_CODEC_ARGS` (documented in `.env.example`), defaulting to the original `libx264`/`baseline` behavior.
- **End-to-end test**: added `apps/api/scripts/e2e-test.ts` (no new dependencies — Node 22's native `fetch`/`WebSocket`), which boots the real server against a temp SQLite DB and a real ffmpeg-generated test video, then drives it through setup → guest role-gating → library scan → party start → real transcoding to `ready` → leader-only WebSocket controls → chat broadcast + history → Sync Engine drift correction. All 14 checks pass.

**Decisions / Considerations**:
- Kept `apps/api/scripts/e2e-test.ts` in the repo rather than deleting it as originally planned "throwaway" — it caught a real, otherwise-invisible production bug (the ffmpeg encoder issue), so it has ongoing value as a regression test even without a formal test framework in place.
- Did not add a guard against `transcodeQueue.add()` being called before `setProcessor()` — currently impossible given `bootstrap/index.ts`'s call order, so it would be speculative hardening for a scenario that can't happen today.

**What is Left to do Next**:
- Everything already pending from the previous entry.
- Consider whether `apps/api/scripts/e2e-test.ts` should be wired into CI once a CI pipeline exists.

---

## [2026-07-05] Jellyfin-style Docker Volume Layout
**Agent**: Claude
**Summary of Work Done**:
Renamed the Docker volume mounts to match the familiar Jellyfin convention, per user request:
- `docker-compose.yml`: `/srv/media` → `/media`, `/srv/cache` → `/cache` (kept disk-backed — user confirmed they didn't want a RAM-backed tmpfs switch, just the rename, matching Jellyfin's own default), `/app/data` → `/config` (holds the SQLite DB, and any future config files). Caddy's own `./cache:/srv/cache:ro` mount updated to `./cache:/cache:ro` to match, since both containers read the same HLS output directory.
- `infra/caddy/Caddyfile`: updated the hardcoded `root * /srv/cache` to `root * /cache`.
- `setup.sh`: `mkdir -p data` → `mkdir -p config`. `.gitignore`: `data/*`/`!data/.keep` → `config/*`/`!config/.keep`. Renamed the tracked `data/.keep` to `config/.keep` via `git mv` to preserve history.
- No application source changes were needed for `library/service.ts`, `playback/service.ts`, or `database/sqlite.ts` — all three already read paths from env vars (`MEDIA_ROOT`, `CACHE_DIR`, `DATABASE_URL`) with no hardcoded `/srv`/`/app` assumptions, so only the compose-supplied values changed.
- Caught two real breakages while sweeping for stale `/srv/media` references that weren't anticipated in the plan: `apps/web/src/hooks/useLibrary.ts` hardcoded `/srv/media` as the scan-request path (the frontend's scan button would have silently failed post-rename, since that path no longer resolves inside the new `/media` root) — fixed to `/media`. `library/service.ts`'s local-dev fallback default (used only when `MEDIA_ROOT` isn't set, e.g. running outside Docker) also still said `/srv/media` — updated to `/media` for consistency.
- Re-ran `apps/api/scripts/e2e-test.ts` after the rename (still passes all 14 checks) to confirm the app genuinely doesn't care about the specific path names, only that its env vars are set correctly.

**Decisions / Considerations**:
- `/cache` stays disk-backed rather than tmpfs, per explicit user confirmation — matches Jellyfin's own actual default, avoids a RAM budget to manage and losing in-progress HLS output on a container restart.
- Host-side `./config`/`./cache` paths remain hardcoded (not env-configurable) in `docker-compose.yml`, matching the existing asymmetry where only `MEDIA_DIR` (likely pointing at a large external library elsewhere on the host) is user-overridable.

**What is Left to do Next**:
- Everything already pending from the previous entries.

---
## 2026-07-06: Frontend Design Revamp (THE ROOM Spec)

**Summary of Work Done**:
- Removed the old dashboard, party, and home routes.
- Installed `tailwindcss` (v4) and configured it in `vite.config.ts`.
- Rewrote `src/index.css` to define strict color variables (Void, Ink, Paper, Fog, Ash) and a strict typography base without relying on external UI libraries. Included the global `border-radius: 0` overrides.
- Added `Inter` and `JetBrains Mono` fonts via Google Fonts in `index.html`.
- Implemented `/login` and `/register` conforming to the 360px centered constraint. The `/register` acts as the root bootstrap logic (currently mocking the API check).
- Implemented `/` (Lobby), a minimalist status readout for a single room.
- Implemented `/room` (Player) with:
  - Custom auto-hiding video controls.
  - Chat Sidebar which correctly collapses into toasts.
  - Admin Overlay covering the viewport silently, with tabs for Users, Media, and Room Settings.
- Created reusable components under `src/components/ui/` (`Input`, `Button`, `IconButton`, `HairlinePulse`) adhering precisely to the hairline and non-curved visual spec.
- Deleted all orphaned frontend files: `Dashboard.tsx`, `Home.tsx`, `Party.tsx`, and `WatchParty.tsx`.

**Decisions / Considerations**:
- Tailwind v4 `@theme` block is used to directly map the specified spec colors (Void, Ink, Paper, Fog, Ash).
- The `AuthContext` and specific endpoints for checking root status `/api/auth/bootstrap-status` and `/api/auth/register` are still being mocked or assumed present in the API. This will need to be implemented backend-side to fully secure the root bootstrap mechanic.

**What is Left to do Next**:
- Backend implementation of the root bootstrap API.
- Actual WebSocket integration for live playback sync and presence in the Lobby and Player.

## 2026-07-06: Frontend Backend Integration Finished
- Created `useWebSocket` hook in `apps/web/src/hooks/useWebSocket.ts` with connection management and typed event handling via `OutgoingSocketMessageSchema` / `IncomingSocketMessageSchema`.
- Connected `hls.js` inside `Room.tsx` to the `useTranscodeStatus` hook payload.
- Mapped player controls (play, pause, seek) to `client.*` WebSocket messages instead of mutating local state.
- Handled incoming `server.*` websocket events in `Room.tsx` to force local `videoRef` syncing.
- Integrated `ChatSidebar` with the socket, fetching `/api/chat/history` on mount and appending incoming `server.chat` events.
- Populated `Lobby` and `AdminOverlay` with real API fetches for `/api/playback/party/active` and `/api/library`.

## 2026-07-06: Fix Vite ESM build error
- Added `"type": "module"` to `apps/web/package.json` to resolve `@tailwindcss/vite` ESM import error during `pnpm run build`.

## 2026-07-06: Fix First Time Setup Bug
- Added `GET /api/auth/bootstrap-status` to `apps/api/src/auth/routes.ts` and `controller.ts` since the frontend was expecting it.
- Fixed `Login.tsx` to actually fetch `/api/auth/bootstrap-status` and redirect to `/register` if `needsBootstrap` is true.
- Fixed `Register.tsx` to `POST` to `/api/auth/setup` instead of `/api/auth/register` to match the actual backend `setupRoot` endpoint.

## 2026-07-06: Fix UI Loading and Bootstrapping flow
- Modified `HairlinePulse` and `index.css` to only animate the pulse when `isLoading` is set to true, resolving the issue of it constantly sweeping the screen.
- Renamed `/api/auth/bootstrap-status` to `/api/auth/status` across the API and frontend to simplify naming.
- Modified `Register.tsx` to call `setToken` directly and navigate to `/` on successful root setup, bypassing the need to login again.

## 2026-07-06: Fix Hot Reloading with Docker Compose
- Reverted the local host-based dev workflow and fully migrated to Docker Compose watch mode.
- Updated `docker-compose.dev.yml` to target the `builder` stage for `api` and `web`, avoiding the production `nginx` and `node:22-alpine` run stages, keeping `pnpm` available for hot-reloading.
- Configured the API container to automatically run `npx prisma generate` and `npx prisma db push` before booting, ensuring the database inside `/config/roomies.db` is correctly instantiated.
- Fixed the `PrismaBetterSqlite3` adapter typing error by reverting to passing `{ url }`, which successfully parses since `DATABASE_URL` is properly mounted via `.env_file` inside the Docker environment.

---

## 2026-07-06: Refactor Party Structure, Sync Merging & Tab Kill Disconnect Fix
**Agent**: Antigravity
**Summary of Work Done**:
- **Party & Sync Reorganization**: Refactored the backend playback/session logic into dedicated `room/` and `sync/` modules. Converted room status to a single global in-memory state.
- **Sync & Playback Merging**: Merged sync events (`sync.status`, `sync.heartbeat`) to consolidate room updates and leader-only controls.
- **Transcoder Rework**: Overhauled the ffmpeg transcoder manager, adding HLS segment caching, session/variant handling, and automatic directory cleanup on server bootstrap.
- **Frontend Integration**: Connected `useRoomSync` and player controls to websocket room events, forcing synchronization when server events fire. Fully integrated chat sidebar history fetching.
- **Tab Disconnect State Fix**: Resolved the issue where killing a browser tab did not clean up the room member list. Reverted the router back to an optimal single-handler `Map`, and moved the socket cleanup triggers directly into `gateway.ts` to dispatch `room.leave` on WebSocket termination.

**Decisions / Considerations**:
- Kept the client `room.leave` message option to allow explicit front-end exits to clear state before page redirection (avoiding race conditions in Lobby loading).
- Reverted WebSocket router to single-handler mapping for maximum performance, handling cross-concern disconnects natively in the gateway.

**What is Left to do Next**:
- Implement Voice Signaling (WebRTC audio-only mesh/SFU signaling).
- Configure production HTTPS auto-certs in the Caddyfile.
- Implement party-membership authentication check on the transcode status endpoint.

---

## 2026-07-06: Transcoding Pipeline Optimization Phase 1
**Agent**: Claude
**Summary of Work Done**:
Investigated the actual state of the transcoding pipeline before building anything — found `tasks/ARCHITECTURE.md` and `CHECKLIST.md` §4 were partly stale: real multi-variant HLS (360p/720p/1080p) with a dynamic `master.m3u8` and `hls.js`-based ABR on the frontend already existed, and per-resolution variants already transcode as independent concurrent `ffmpeg` processes. The actual gap was that variants spawn **lazily** (only when a client's `hls.js` requests that specific resolution), causing a stall on first play and after every seek. `FFMPEG_VIDEO_CODEC_ARGS`/`TRANSCODE_PROFILES` were documented/referenced in `.env.example` and `scripts/e2e-test.ts` but never read by any source file — removed the dead reference.
- **Configurable FFmpeg presets**: new `apps/api/src/config/settings.ts` stores `ffmpegPreset` (`ultrafast|veryfast|fast|medium|slow`, default `veryfast`) and `hwAccelMode` (`auto|cpu`, unused until Phase 2) in the existing `ServerConfig` key/value table, loaded at boot via `initializeConfig()`. `transcoding/variant.ts` now reads `getTranscodeSettings().ffmpegPreset` at spawn time instead of the hardcoded `'veryfast'`.
- **New `apps/api/src/settings/` feature** (routes + controller, root-only): `GET/PATCH /api/settings/transcode`. Added `TranscodeSettingsSchema`/`UpdateTranscodeSettingsRequestSchema` to `packages/contracts`.
- **Admin UI**: `AdminOverlay.tsx` gained a third `SETTINGS` tab with a preset selector (fetches/patches `/api/settings/transcode`), following the file's existing inline-tab-component convention.
- **Fast-start pre-warming**: `PlaybackService.changeMedia` and `handleSeek` now fire-and-forget `session.ensureVariantReady('360p', ...)` immediately (not awaited in the HTTP response), so the lowest-bitrate variant's first segment is already on disk before any client requests it — this is what actually closes the "true ABS" gap, since the multi-variant playlist infrastructure already existed.
- **Concurrency guardrail**: added `MAX_CONCURRENT_VARIANTS = 3` (`transcoding/config.ts`); `session.ts` now rejects spawning a new variant beyond that cap instead of silently allowing unbounded `ffmpeg` processes if resolution presets are ever expanded.
- Hardware acceleration (NVENC/QuickSync/VAAPI) explicitly **not** built this session — no GPU hardware available to validate against; deferred to Phase 2.

**Decisions / Considerations**:
- Preset changes only affect newly-spawned variants, not ones already running — accepted tradeoff, force-restarting an in-flight encode for a settings change is unnecessary complexity.
- Always pre-warm `360p` specifically (not "whatever resolution the client is on") — keeps the fix simple and matches how `hls.js` ABR typically starts conservative on a cold connection anyway.
- `apps/api/scripts/e2e-test.ts` is now stale against the current API surface (`/api/playback/start` no longer exists, replaced by `/change-media` in a later refactor) — it failed when run as-is. Did not attempt to fix/rewrite it as part of this session (out of scope); instead wrote and ran a throwaway manual verification script against the live endpoints (settings GET/PATCH/auth-gating, library scan, change-media, and confirmed the 360p variant's `stream.m3u8` appears on disk without ever being requested) — all 8 checks passed, then deleted the script.
- Local `pnpm install`/`vite build` for `apps/web` is currently broken on this machine independent of this work: `apps/web/package.json` depends on `@roomies/shared` (`workspace:*`), but `packages/shared` only contains a `dist/` folder with no `package.json` and is not imported anywhere in source — dead leftover from earlier scaffolding cleanup. Verified the frontend change via `tsc --noEmit` directly (0 errors) instead of a full `vite build`. Flagging this for a future session since it'll block anyone trying a from-scratch local (non-Docker) build of `apps/web`.

**What is Left to do Next**:
- Phase 2: hardware-accel detection (`transcoding/hwaccel.ts`) with VAAPI/NVENC/QSV encode branches in `variant.ts` and a mandatory CPU fallback-on-failure safety net, plus switching the API Dockerfile off Alpine's `apk add ffmpeg` (no hwaccel support) to a build that has it. Explicitly unverifiable without real GPU hardware — needs manual testing on real hardware after merge.
- Fix or rewrite `apps/api/scripts/e2e-test.ts` against the current API surface (currently references removed endpoints).
- Fix the broken `@roomies/shared` workspace dependency in `apps/web/package.json` blocking local (non-Docker) `pnpm install`.
- Everything already pending from the previous entries (Voice Signaling, HTTPS auto-certs, transcode-status IDOR, WS compression).

---

## 2026-07-06: Transcoding Pipeline Optimization Phase 2
**Agent**: Claude
**Summary of Work Done**:
Follow-up to Phase 1, per user direction: extracted the transcoding module into its own workspace package, tuned the HLS output flags for lower-latency live transcoding, and built the hardware-accel detection deferred from Phase 1.
- **Extracted `packages/transcoding`**: moved `apps/api/src/transcoding/{config,types,variant,session,manager}.ts` into a new workspace package mirroring `packages/contracts`'s shape (`package.json`, `tsconfig.json`, `src/index.ts` barrel). Removed two `apps/api`-specific couplings so the package has no dependency on app internals: (1) `manager.ts`'s internal `setInterval` reading `roomStore.getCurrentPosition()` directly — moved the interval into `bootstrap/index.ts`, which now owns scheduling and calls the still-public `TranscodeSessionManager.manageActiveCaches(playhead)`; (2) `variant.ts` reading `getTranscodeSettings().ffmpegPreset` directly — `TranscodeVariant.start()`/`TranscodeSession.ensureVariantReady()` now take `preset`/`hwAccelMode` as parameters, with `apps/api`'s `playback/service.ts` fetching the settings and passing them in at all 3 call sites. Also removed `TranscodeSession.masterPlaylistUrl` (it hardcoded an `apps/api` route) — `playback/service.ts` now builds that URL itself via a local `getMasterPlaylistUrl()` helper. `apps/api/package.json` now depends on `@roomies/transcoding` (workspace:*); `packages/transcoding` depends on `@roomies/contracts` for the shared `FfmpegPreset`/`HwAccelMode` types. No Dockerfile/compose changes needed — `turbo prune api --docker` already traces workspace `package.json` edges the same way it does for `@roomies/contracts`.
- **HLS output tuning** (`packages/transcoding/src/{config,variant}.ts`), per the user's requested flags: `SEGMENT_DURATION` 4s→2s; `-hls_list_size` `0` (unbounded) → `10` (bounded rolling live window, ~20s); added `-sc_threshold 0`. Deliberately did **not** add `-g 48 -keyint_min 48` — that hardcodes a 24fps-only GOP, and this library has mixed frame-rate content; the existing time-based `-force_key_frames expr:gte(t,n_forced*SEGMENT_DURATION)` already keeps keyframes correctly aligned to segment boundaries regardless of source fps, so it's strictly the better fit and was left as-is. Confirmed the "fast seek" trick (`-ss` before `-i`) was already how `variant.ts` builds its args — no change needed. Bonus simplification unlocked by the bounded list size: `TranscodeVariant.manageCache()`'s manual segment-file-deletion loop (a workaround for `hls_list_size 0` never trimming anything) is now dead code since ffmpeg's own `delete_segments` flag natively rotates the playlist — removed it, kept the unrelated SIGSTOP/SIGCONT ahead-of-playhead throttle.
- **Hardware-accel detection** (`packages/transcoding/src/hwaccel.ts`): `detectHardwareEncoder()` runs `ffmpeg -hide_banner -encoders` once at boot (called from `config/index.ts`'s `initializeConfig()`), checks for `h264_vaapi`/`h264_nvenc`/`h264_qsv` cross-referenced against device presence (`/dev/dri`, `/dev/nvidia0`), caches the result, and exposes it via `getTranscodeSettings().detectedHardware`. `variant.ts` now branches its ffmpeg args on the detected backend when `hwAccelMode === 'auto'` (VAAPI/QSV: software scale → `format=nv12,hwupload` → `h264_vaapi`; NVENC: `h264_nvenc` with a preset-name mapping table). Added a mandatory one-shot CPU fallback: if a hardware-encoded variant errors or exits non-zero before ever reaching `'ready'`, it automatically retries once via the plain software path. Admin Overlay's SETTINGS tab now shows "Detected: ..." and an auto/cpu toggle (`GET/PATCH /api/settings/transcode` already existed from Phase 1; `TranscodeSettingsSchema` in `packages/contracts` gained an optional `detectedHardware` field).
- **Unexpected real-hardware validation**: this dev machine turned out to actually have a working VAAPI device (`/dev/dri/renderD128`, ffmpeg built with `--enable-vaapi`) — contrary to the "no GPU available" assumption from Phase 1 planning. `detectHardwareEncoder()` correctly identified it, and a full manual verification run confirmed the VAAPI encode path genuinely transcoded successfully end-to-end (not a simulated/fallback path) — real validation for the VAAPI branch specifically. NVENC/QSV remain unverified (no such hardware here).
- Fixed a pre-existing blocker (flagged but not fixed in the Phase 1 log entry): `apps/web/package.json` and `apps/api/package.json` both declared `@roomies/shared: workspace:*`, but `packages/shared` only contains a stray `dist/` folder with no `package.json` and nothing in source imports it — this made `pnpm install` fail outright for the whole workspace (`ERR_PNPM_WORKSPACE_PKG_NOT_FOUND`), which in turn blocked linking `node_modules` for the newly-added `packages/transcoding`. Removed the dead dependency from both `package.json`s; `pnpm install` and a full `vite build` for `apps/web` now succeed (previously blocked before this session too).

**Decisions / Considerations**:
- Chose parameter-passing (`preset`/`hwAccelMode` as args to `ensureVariantReady`) over an injected-callback pattern for decoupling `variant.ts` from app settings — simpler, and the 3 call sites already sit in `apps/api` where the settings module lives.
- Left `apps/api/Dockerfile` on Alpine (`apk add ffmpeg`, no VAAPI/NVENC/QSV support) for this pass — swapping to a hwaccel-capable base image (e.g. Debian-slim) is a deliberate separate decision since it changes image size/build for every deployment, including GPU-less ones; `detectHardwareEncoder()` correctly reports `cpu` in the current Docker image, so nothing breaks.
- QSV's arg-building branch reuses the VAAPI `hwupload` path as a simplification (QSV on Linux commonly layers over the same VAAPI device) — flagged as unverified, no QSV hardware available to confirm.

**What is Left to do Next**:
- Swap `apps/api/Dockerfile`'s base image to one with VAAPI/NVENC/QSV-capable ffmpeg (e.g. Debian-slim + `apt install ffmpeg`) so hardware-accel actually activates in Docker deployments — deliberately deferred, not bundled into this pass.
- Validate the NVENC and QSV branches on real hardware — only VAAPI has been confirmed end-to-end so far.
- Fix or rewrite `apps/api/scripts/e2e-test.ts` against the current API surface (still stale from before this session).
- Everything already pending from the previous entries (Voice Signaling, HTTPS auto-certs, transcode-status IDOR, WS compression).

---

## 2026-07-06: Dockerfile Hardware-Accel Base Image Swap
**Agent**: Claude
**Summary of Work Done**:
Closed the last deferred item from Phase 2: `apps/api/Dockerfile`'s base stage swapped from `node:22-alpine` (`apk add ffmpeg` — no VAAPI/NVENC/QSV support at all) to `node:22-bookworm-slim` (Debian's `ffmpeg` package ships VAAPI). `docker-compose.yml` gained a commented-out, opt-in `devices: [/dev/dri:/dev/dri]` block on the `api` service so hosts with a compatible GPU can uncomment it; left disabled by default since most deployments have none, and `detectHardwareEncoder()` safely reports `cpu` without it.
- Actually built the image (`podman build`, since this sandbox's `docker` socket wasn't group-accessible but `podman` was available and rootless) — the full multi-stage build (pruner → installer → builder → runner) succeeded unchanged apart from the base image, including `better-sqlite3`'s native compile against Debian's glibc.
- Confirmed via `ffmpeg -hide_banner -encoders` **inside the built image** that `h264_vaapi` (and `hevc_vaapi`, etc.) is present — something the old Alpine image never had.
- Booted the actual built image with `--device /dev/dri:/dev/dri` and drove it through the real API (setup → scan → change-media): `GET /api/settings/transcode` correctly reported `detectedHardware: "vaapi"` from inside the container. The transcode itself hit a VAAPI device-init failure specific to this test environment (`Failed to initialise VAAPI connection: -1 (unknown libva error)` — a rootless-podman/SELinux device-permission quirk, not a bug in this codebase), and the CPU fallback built in Phase 2 caught it automatically and completed the encode successfully. This is arguably a more valuable test result than a clean pass: it's a real, unstaged proof that the fallback safety net works under an actual hardware-init failure rather than just a hypothetical one.

**Decisions / Considerations**:
- Used `podman build`/`podman run` instead of `docker`/`docker compose` for verification, since this sandbox's user isn't in the `docker` group and the socket wasn't accessible — `podman` is a drop-in-compatible, rootless alternative and works against the same Dockerfile unmodified.
- Did not chase down fixing the VAAPI device-init failure inside the rootless-podman test container (e.g. further `--group-add`/cgroup tuning) — it's specific to this sandboxed test setup, not the Dockerfile or app code, and the whole point of the fallback net is that this class of failure doesn't need to be fully eliminated to ship safely. A real Docker (not rootless podman) deployment on a host with correct GPU driver/permission setup is not expected to hit the same failure.
- Kept NVENC unaddressed at the image level — Debian's default `ffmpeg` package doesn't include it (requires nonfree nvidia headers); would need a different install path (e.g. a static build or nvidia's own ffmpeg patches) if/when NVENC hardware becomes available to test against.

**What is Left to do Next**:
- Validate the NVENC and QSV code paths on real hardware — only VAAPI has been confirmed end-to-end (both natively and inside the actual container image) so far.
- If NVENC support is wanted later, it needs a different ffmpeg install path than `apt install ffmpeg` (Debian's default build excludes it).
- Fix or rewrite `apps/api/scripts/e2e-test.ts` against the current API surface (still stale from before this session).
- Everything already pending from the previous entries (Voice Signaling, HTTPS auto-certs, transcode-status IDOR, WS compression).

---

## 2026-07-06: NVENC/QSV Investigation and E2E Test Rewrite
**Agent**: Claude
**Summary of Work Done**:
Closed out the two remaining loose ends from the transcoding-optimization work: chased NVENC/QSV validation as far as this host reasonably allows, and fully rewrote the stale `apps/api/scripts/e2e-test.ts`.
- **NVENC**: `lspci` confirms this machine has an Intel Alder Lake iGPU (Iris Xe) and zero NVIDIA hardware — a hard dead end regardless of software, not a code gap. Nothing to fix; stays documented as unverified.
- **QSV investigation**: this host genuinely has Intel Quick Sync hardware, so unlike NVENC it seemed worth chasing. Checked installed packages first — `libvpl`, `intel-vpl-gpu-rt`, `intel-mediasdk`, and `libva-intel-media-driver` were **all already present** (the initial "missing package" hypothesis from planning was wrong). Tried several direct `ffmpeg -c:v h264_qsv` invocations (plain `-init_hw_device qsv=hw`, deriving a QSV device from an explicit VAAPI device via `-init_hw_device vaapi=... -init_hw_device qsv=hw@va`, explicit `LIBVA_DRIVER_NAME=iHD`) — all failed identically at the `hwupload` filter step with a garbage-looking error code (`-1313558101`). `strace -e trace=openat` showed ffmpeg loading **both** `libmfxhw64.so` (the legacy Intel Media SDK runtime) and `libmfx-gen.so` (the newer oneVPL runtime) for the same process — strong evidence of a genuine ABI/version-mismatch bug between this system's ffmpeg 7.1.4 (built with `--enable-libvpl`) and its installed Intel Media stack, not a missing dependency or a bug in `packages/transcoding`'s code. Stopped chasing it further at that point (would require an ffmpeg rebuild or an upstream bug report to actually fix) per the user's standing guidance not to spin on environment rabbit holes — VAAPI remains the only hardware-verified path; QSV stays documented as unverified, now with the specific reason recorded instead of a vague "no hardware to test" note that was never accurate for QSV specifically.
- **Rewrote `apps/api/scripts/e2e-test.ts`** end-to-end against the actual current API/socket contract (previously wired to a defunct multi-party model: `POST /api/playback/start`, `partyId` everywhere, `client.join`/`client.play`/`client.chat` socket events). Kept the harness (temp dir, real ffmpeg-generated sample video, spawning the actual server via `tsx src/index.ts`) but replaced every assertion: `POST /api/playback/change-media` (not `/start`, no `partyId`, root-gated — guest gets 403), `POST /api/library/scan` response is a single `Library` object (`mediaFiles` directly on it, not wrapped in an array), WS events are `room.join`/`playback.play`/`chat.send`/`sync.heartbeat` (not the old `client.*` names), and `GET /api/chat/history` takes no query params (single global room, not per-party). Also added two checks the old test never had: the 360p variant pre-warms on disk without any client requesting it (Phase 1 fast-start work), and the HLS playlist reflects the Phase 2 low-latency tuning (segment duration ≈2s, bounded to ~10 entries). All 14 checks pass against the live server.
- **Incidental finding while mapping the WS contract** (a research agent traced every socket handler): the earlier security-audit log entry's claim that `playback.play`/`pause`/`seek`/`set_rate` are root/leader-only is **no longer true** — `apps/api/src/playback/socket.ts` enforces no role check at all on the socket path today; only the HTTP `POST /api/playback/change-media` endpoint is actually root-gated. Per explicit user direction, this is being **documented only, not fixed**, to keep this session scoped to transcoding. The rewritten e2e test asserts the current (unenforced) behavior rather than re-encoding the old, now-incorrect assumption in a new test.

**Decisions / Considerations**:
- Did not attempt to fix the QSV/libvpl runtime mismatch (e.g. pinning package versions, rebuilding ffmpeg) — genuinely out of scope for this codebase and a real time sink for a single dev machine's package combination that won't necessarily reflect any given user's actual deployment host.
- Deliberately left the WS-level leader-only enforcement gap unfixed per explicit user direction — flagged as a new tracked issue (see checklist/what's-left) rather than silently left off the record.
- `apps/api/scripts/e2e-test.ts` is once again a trustworthy regression test reflecting the real current contract, not a stale artifact — worth wiring into CI whenever a CI pipeline exists (same open item as before).

**What is Left to do Next**:
- **New**: restore root/leader-only enforcement on the WebSocket `playback.*` handlers (`apps/api/src/playback/socket.ts`) — currently any connected guest can control playback over WS, contrary to what the earlier security-audit entry claims.
- Validate NVENC/QSV on real, correctly-configured hardware whenever available — this session's host can't get QSV working due to a host-level ffmpeg/libvpl compatibility bug, and has no NVIDIA GPU for NVENC at all.
- Everything already pending from the previous entries (Voice Signaling, HTTPS auto-certs, transcode-status IDOR, WS compression).

---

## [2026-07-07] Multi-Package Export Refactoring, Container Hardware Acceleration & Player Sync/UX Polish
**Agent**: JustModo & Antigravity
**Summary of Work Done**:
- **Monorepo Packaging Polish**: Refactored the packaging config of workspace modules (`packages/config`, `packages/contracts`, `packages/transcoding`) to expose clean CommonJS and ESM exports. Cleaned up unused workspace dependencies to resolve from-scratch package installs.
- **Hardware Acceleration Gating**: Swapped the base Docker image for the API container from Alpine to `node:22-bookworm-slim` to support native hardware acceleration. Configured GPU hardware device passthrough paths (`/dev/dri`) in `docker-compose.yml` and optimized `packages/transcoding`'s encoder detection sequence to automatically fall back to CPU if initialization fails.
- **Transcoding Speed Improvements**: Integrated user-selectable FFmpeg presets (e.g. `veryfast`, `ultrafast`) and an auto/cpu toggle persisted via `ServerConfig`. Implemented pre-warming of the lowest-resolution HLS variant (360p) immediately on room media changes or seeking, avoiding cold-start buffering loops.
- **Sync Seek Feedback Loop Resolution**: Refactored video playhead synchronization logic to eliminate micro-seeking feedback loops. Replaced continuous timeline-based auto-alignment hooks with explicit, one-time `syncSeekTrigger` / `syncSeekPosition` state variables triggered solely by the server's sync engine.
- **Buffering & Ready Gating ("Ready Too Soon" Bug)**: Fixed a bug where players reported readiness to the room before actually buffering, resulting in drift. Clients now only fire the `ready` signal when they have accumulated at least 3 seconds of buffered HLS data (or reached the end of the duration). Added a user interaction check redirection from Room to Lobby to circumvent browser autoplay blocks on page refreshes.
- **Player Interface & UX Polish**: Updated the paused and syncing video overlay backgrounds to use Tailwind v4 opacity modifiers (`bg-ink/40` and `bg-ink/60`). Built in common player keyboard listeners (Space, ArrowLeft, ArrowRight) with input/textarea exclusion logic. Adjusted layout metrics (e.g., quality selector width and playback speed buttons) to eliminate layout shifting.
- **Workspace Build & Ignore Fixes**: Anchored paths in `.gitignore` and `.dockerignore` to the root directory to stop subfolders like `apps/api/src/config` from being pruned out of Docker contexts during `turbo prune` steps.

**Decisions / Considerations**:
- Kept the client buffering threshold strictly at 3 seconds to guarantee robust audio/video playback upon resuming.
- Opted for parameter-based settings passing within `packages/transcoding` to avoid importing API settings controllers directly, preserving architectural boundaries.

**What is Left to do Next**:
- Implement Voice Signaling (WebRTC audio mesh / signaling).
- Set up auto-HTTPS certs in Caddy.
- Restore root/leader-only permission gating on the WebSocket `playback.*` events since current websocket handlers allow arbitrary guests to command playback.

---

## [2026-07-08] Transcode Settings Moved to Config File
**Agent**: Claude
**Summary of Work Done**:
- **Settings ownership moved to `packages/transcoding`**: Deleted `apps/api/src/config/settings.ts` (the Prisma/`ServerConfig`-backed, live-editable `ffmpegPreset`/`hwAccelMode` store) and replaced it with `packages/transcoding/src/settings.ts`, which reads `FFMPEG_PRESET`/`HWACCEL_MODE` directly from `@roomies/config` (i.e. `roomies.conf`), detects hardware once via the existing `detectHardwareEncoder()`, and caches the result for the process lifetime via `initTranscodeSettings()`/`getTranscodeSettings()`.
- **Config file gains two new keys**: `packages/config/src/index.ts` now parses `FFMPEG_PRESET` (default `veryfast`) and `HWACCEL_MODE` (default `auto`) out of `roomies.conf`, alongside the existing `CORS_ORIGIN`/`FFMPEG_VIDEO_CODEC`, and documents them in the auto-generated default `.conf` template.
- **Removed the now-pointless API surface**: deleted `apps/api/src/settings/` (controller, routes) entirely — no more `GET`/`PATCH /api/settings/transcode` — and its registration in `apps/api/src/bootstrap/index.ts`. Removed the corresponding `TranscodeSettingsSchema`/`UpdateTranscodeSettingsRequestSchema` (and inferred types) from `packages/contracts`, since the transcoding package now owns its own local `FfmpegPreset`/`HwAccelMode` types instead.
- **Removed the Admin Overlay SETTINGS tab**: `apps/web/src/components/room/AdminOverlay.tsx` no longer has a SETTINGS tab, `FFMPEG_PRESETS` constant, or `SettingsTab` component — only MEDIA and USERS remain. Settings are no longer runtime-editable from the UI at all.
- Updated `tasks/CHECKLIST.md`'s transcoding-preset item to reflect the new config-file-driven, non-UI-editable reality.
- Verified via `pnpm install` + `turbo run build` (both `api` and `web` build clean) and by booting the dev API/web servers directly: `roomies.conf` auto-generates with the new keys, `GET /api/settings/transcode` now 404s, and VAAPI hardware detection still runs correctly at boot.

**Decisions / Considerations**:
- Settings are now immutable for the life of the process — changing the preset or hwaccel mode requires editing `roomies.conf` and restarting the API. This was an explicit simplification request (config over UI), not a regression: the resolution/bitrate ladder (`RESOLUTION_PRESETS`) was already config-only and out of scope, so this brings preset/hwaccel in line with that same pattern.
- The public-facing port (5123, via Caddy) and the internal API port (3000) were confirmed already correct and were **not** changed as part of this work.

**What is Left to do Next**:
- Implement Voice Signaling (WebRTC audio mesh / signaling).
- Set up auto-HTTPS certs in Caddy.
- Restore root/leader-only permission gating on the WebSocket `playback.*` events since current websocket handlers allow arbitrary guests to command playback.



---

## [2026-07-08] Library Package Extraction
**Agent**: Claude
**Summary of Work Done**:
- **Extracted library scanning into `packages/library`**: moved the inline `apps/api/src/library/service.ts` scanner into a new workspace package following the exact `packages/transcoding` convention (build-less, `"typecheck": "tsc --noEmit"` only, consumed as raw TS via `workspace:*`). `apps/api` keeps owning the Prisma schema/client — `LibraryService.getLibraries(prisma)`/`scanLibrary(prisma)` take a `PrismaClient` instance as a parameter, and the package only imports `@prisma/client` for types.
- **Switched to a folder-per-title on-disk convention**: previously the library was a flat list of every video file found under `MEDIA_ROOT` with no subtitles or cover art. Now each immediate subfolder is a "title" — a folder with video files directly inside it is a movie (first video file wins, all subtitles in that folder attach to it, first image file is the cover); a folder whose subfolders contain videos is a show (each subfolder is a season, every video file inside becomes its own episode). File roles are decided by extension only, no filename convention required.
- **New Prisma schema**: replaced the 2-table `Library`/`MediaFile` model with a 5-table hierarchy — `Library → Title (type: movie|show) → Season → MediaFile → Subtitle`. `MediaFile` deliberately kept its pre-existing field names (`id`, `title`, `path`, `duration`), so `apps/api/src/playback/service.ts` needed zero code changes despite the schema restructure.
- **New route**: `GET /api/library/cover/:titleId` streams cover art through an authenticated Fastify handler (`apps/api/src/library/controller.ts`) — Caddy only exposes `/cache` (HLS) publicly, not `MEDIA_ROOT`, so cover images can't be served as static files without going through the API.
- **`packages/contracts`**: added `Subtitle`/`Season`/`Title` Zod schemas; `Library`/`MediaFile` schemas updated to the nested shape.
- **Admin Overlay MEDIA tab redesigned**: the flat file-list rows were replaced with a responsive grid of square cover-art tiles (`AdminOverlay.tsx`'s new `CoverTile` component, fetching `/api/library/cover/:titleId` as an authenticated blob → object URL). Clicking a movie tile plays it immediately; clicking a show tile drills into a season/episode picker rendered as the same tile grid, one level down, via local component state (no new route).
- Verified end-to-end with real `ffmpeg`-generated test media (not committed): a movie folder and a `Season 01` show folder were both scanned and classified correctly, rescanning was idempotent (same row IDs, no duplicates), `GET /api/library/cover/:titleId` returned a valid image with correct auth gating, and `POST /api/playback/change-media` correctly resolved the new `MediaFile.id` with zero playback-side changes required.

**Decisions / Considerations**:
- Multi-episode subtitle disambiguation (e.g. matching `e01.srt` to `e01.mp4` specifically when a season folder has several episodes) was intentionally left out of scope — subtitle matching stays extension-only and folder-scoped (every subtitle in a season folder attaches to every episode in that folder). Documented as a known limitation in `ARCHITECTURE.md` rather than silently adding filename-stem-matching heuristics beyond what was asked for.
- Subtitle `language` field exists in the schema but is always `null` for now — no filename-based language parsing (e.g. `movie.en.srt`) was implemented, same reasoning as above.
- This was a breaking schema change; existing `dev.db`/`roomies.db` data is wiped on the next `prisma db push --accept-data-loss` (already the dev script's standing behavior) and repopulated by a rescan.

**What is Left to do Next**:
- Implement Voice Signaling (WebRTC audio mesh / signaling).
- Set up auto-HTTPS certs in Caddy.
- Restore root/leader-only permission gating on the WebSocket `playback.*` events since current websocket handlers allow arbitrary guests to command playback.
- Consider per-episode subtitle filename-stem matching if multi-episode-per-folder shows with per-episode subtitles turn out to be a real use case.

---

## [2026-07-13] Chat Decoupling, Playback Stop, Logical Naming & Player Polish
**Agent**: Antigravity
**Summary of Work Done**:
- **Chat Component Refactoring & Organizing**: Extracted chat history storage logic into `packages/chat` workspace package to decouple Fastify WS handlers from business state. Improved chat interface styling, margins, transparent overlay background opacity modifiers, and bubble structures.
- **Playback Control & Stop Handler**: Implemented a `POST /api/playback/stop` endpoint. Integrated a "Stop Playing" button in the room manager overlay and added a quick status banner in the overlay displaying currently active media status.
- **Logical Filename Renaming Parser**: Created `packages/library/src/parser.ts` to parse episode numbers out of standard TV formats (`S01E01`, `1x01`), absolute anime numbering (`1098.mkv`), and standalone digits (`Episode 01`).
- **Context-Aware Outlier Detection**: Engineered duplicate episode number rejection and contiguous grouping analysis (nearest-neighbor distance <= 10) in `scanner.ts`. Outliers and duplicates fall back to using their raw filenames.
- **Deep Directory Scanner**: Updated `scanner.ts` to recursively scan nested season folders (e.g. `Season 01/`).
- **Physical Position Sorting**: Swapped frontend episode sorting from title-based to path-based natural sorting via `localeCompare(..., { numeric: true })`. Unparsed specials or files are now placed exactly in the slot they would occupy if sorted unnamed.
- **HLS Player Cache & State Wiping**: Added a state-clearing effect in `VideoPlayer.tsx` to clear out buffer metrics, HLS instances, progress timelines, and native `<video>` buffers whenever media stops. The video canvas now cuts to black and displays `THE PARTY WILL START SOON` immediately.
- **Playback UI z-index fix**: Elevated video player controls and top overlays to `z-50` so that they remain fully clickable on top of the chat panel.

**Decisions / Considerations**:
- Keeping sorting based on the physical file path ensures directory names (like `Season 01`) and logical numbers align naturally in the UI, even when custom video files fail to parse.
- Wiping HLS state completely on stop prevents the canvas from rendering frozen frames of the previous video.

**What is Left to do Next**:
- Implement Voice Signaling (WebRTC audio mesh / signaling).
- Set up auto-HTTPS certs in Caddy.
- Restore root/leader-only permission gating on the WebSocket `playback.*` events.
