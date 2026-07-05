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
