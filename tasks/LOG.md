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
