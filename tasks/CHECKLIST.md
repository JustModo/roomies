# Active Development Checklist

This checklist tracks the remaining work for the Watch Party architecture. Keep tasks independent where possible.

## 0. Completed Work (Phase 1 Setup)

- [x] **Monorepo Setup** (See `[LOG:L11]`)
  - [x] Turborepo + pnpm configurations.
- [x] **Database & State Initialization** (See `[LOG:L13-14]`, migrated to SQLite/in-memory `[LOG:L220]`)
  - [x] Prisma 7 SQLite schema (`User`, `Library`, `MediaFile`, `RefreshToken`, `ServerConfig`) via `@prisma/adapter-better-sqlite3`.
  - [x] In-memory state stores replacing Redis OM (playback state, chat ring buffer, socket sessions, transcode status).
- [x] **Backend Core Infrastructure** (See `[LOG:L12]`)
  - [x] Fastify bootstrap logic (CORS, WS).
- [x] **Auth & Gateway** (See `[LOG:L15-17]`)
  - [x] JWT Registration and Login routes.
  - [x] WebSocket Gateway with Discriminated Zod Union parsing.
- [x] **API Contracts** (See `[LOG:L17]`)
  - [x] `packages/contracts` and `packages/shared` types exported cleanly.

## 1. Backend Modules (Fastify API)

- [x] **Users Feature** (See `[LOG:L32-34]`)
  - [x] Implement `GET /api/users/me` to fetch current user profile.
  - [x] Implement user settings update (theme, etc) via Prisma `Settings` table.
- [x] **Library Feature** (See `[LOG:L35-37]`)
  - [x] Implement file scanner service (recursive folder scan).
  - [x] Read basic metadata (name, duration) without TMDB/Internet calls.
  - [x] Store scanned paths into `Library` and `MediaFile` Postgres tables.
  - [x] Expose `GET /api/library` to fetch available media.
- [x] **Playback Orchestration** `[DEPENDS_ON: Library Feature]` (See `[LOG:L54]`)
  - [x] Implement HTTP route to start a party/session (`POST /api/playback/start`).
  - [x] Implement Single Active Party endpoint (`GET /api/playback/party/active`).
  - [x] Seed in-memory `playbackState` with initial movie, leader, and position 0.
  - [x] `client.join` event registers socket into in-memory party room.
  - [x] `client.play`/`client.pause`/`client.seek` update in-memory state and broadcast `server.*` to all room members (leader-only, per the security audit).
  - [x] `client.heartbeat` drives the Sync Engine (see below).
- [x] **Sync Engine** `[DEPENDS_ON: Playback Orchestration]` (See `[LOG:L220]`)
  - [x] Implement drift computation (compare `client.heartbeat` position against server expected position).
  - [x] Dispatch a direct `server.seek` to the single drifting client (2s threshold, not a room broadcast).
- [x] **Chat Feature** (See `[LOG:L220]`)
  - [x] Map `client.chat` socket event.
  - [x] Save to an in-memory capped ring buffer per party (`chat/store.ts`, last 500 messages).
  - [x] Broadcast `server.chat` to all room members.
  - [x] Expose `GET /api/chat/history?partyId=` to return the last 500 messages.
- [ ] **Voice Signaling (WebRTC)**
  - [ ] Map WebRTC socket events (`client.voice.offer`, `answer`, `ice`).
  - [ ] Relay signaling events strictly to the target peers. No media processing!
- [x] **Transcoding & Media Delivery** (See `[LOG:L54]`, rewritten in-process `[LOG:L220]`)
  - [x] In-process job queue (`transcodeQueue`, no external broker) with typed job data, `jobId`-based dedup, concurrency limit 2, retry with backoff.
  - [x] Worker spawns `ffmpeg` via `child_process.execFile` to produce HLS segments.
  - [x] In-memory transcode status map tracks `pending → processing → ready | failed`, self-expiring after 24h.
  - [x] `GET /api/transcoding/:partyId/status` returns status + Caddy HLS URL when ready.
  - [x] One job per `partyId` (idempotent `jobId`).

## 2. Frontend Application (React + Vite)

- [x] **Core Setup** (See `[LOG:L48-51]`)
  - [x] Scaffold Vite + React Monorepo environment and fix build toolchain.
  - [x] Configure React Router and global state (Context API).
  - [x] Setup Axios/Fetch wrapper to inject JWT auth headers (`api/client.ts`).
  - [ ] Implement robust WebSocket reconnecting hook (`useWebSocket.ts`).
- [x] **Auth UI**
  - [x] Login Form & Root Setup Form.
  - [x] Persist JWT locally and route to app dashboard.
- [x] **Library UI** `[DEPENDS_ON: Backend Library Feature]`
  - [x] Display grid of available `MediaFiles`.
  - [x] "Start Party" button for a given movie.
- [x] **Watch Party UI** `[DEPENDS_ON: Backend Playback, Transcoding]`
  - [x] Integrate `hls.js` Player to consume Caddy HLS URL.
  - [ ] Connect player events (play/pause/seek) to `useWebSocket` hook to emit `client.*` events.
  - [ ] Listen to `server.*` events and forcefully sync the local Player.
- [ ] **Social UI**
  - [ ] Chat sidebar rendering `GET /api/chat/history` and real-time incoming `server.chat` messages.
  - [ ] Presence indicators (who is in the room, buffering states).
  - [ ] Voice channel toggle (WebRTC audio-only mesh or SFU signaling).

## 3. Infrastructure & DevOps (See `[LOG:L54]`)

- [x] **Dockerization**
  - [x] `apps/api/Dockerfile` — multi-stage build with `ffmpeg` installed via `apk`.
  - [x] `apps/web/Dockerfile` — multi-stage Vite build served by nginx with SPA fallback.
  - [x] `docker-compose.yml` — API (with embedded SQLite + in-memory state), Web, Caddy + healthchecks and shared volumes. Postgres and Redis services removed `[LOG:L220]`.
  - [x] Jellyfin-style volume layout: `/media` (read-only source library), `/config` (SQLite DB + app config), `/cache` (disk-backed transcoder output, shared read-only with Caddy) `[LOG:L264]`.
- [x] **Caddy Reverse Proxy**
  - [x] `infra/caddy/Caddyfile` routes `/api/*`, `/ws`, `/hls/*`, and `/*` (React SPA).
  - [x] HLS served with correct CORS headers and `Cache-Control: no-cache`.
- [x] **Environment**
  - [x] `apps/api/.env.example` documents all required environment variables.
- [ ] **Production Hardening** (See `[LOG:L195]` — security audit + fixes; two items remain)
  - [x] Set `origin` in CORS to an explicit allow-list (`CORS_ORIGIN` env var), drop `credentials: true` (JWT travels via `Authorization` header, not cookies).
  - [x] Require `verifyJwt` on the transcoding status endpoint (was fully unauthenticated).
  - [x] Constrain library scans to `MEDIA_ROOT`, reject path traversal / absolute-path escapes, skip symlinks during the walk.
  - [x] Add `requireRole('root')` to library scan and playback start; enforce party-leader check on socket `client.play`/`pause`/`seek`.
  - [x] Close root-account bootstrap race condition (atomic guard via `ServerConfig` unique key inside a transaction).
  - [x] Require a Redis password (`REDIS_PASSWORD`) — previously unauthenticated on the shared Docker network.
  - [x] Pin `jwt.verify` to `algorithms: ['HS256']` explicitly (was relying on library defaults).
  - [x] Prefer passing the WS auth token via `Sec-WebSocket-Protocol` over the query string, to avoid proxy/log leakage.
  - [x] Add a per-connection rate limit on inbound WebSocket messages.
  - [x] Close `ServerConfig` (JWT secret) bootstrap race with an atomic upsert.
  - [x] Bump bcrypt cost factor to 12; remove login timing side-channel (always run `bcrypt.compare`).
  - [x] Stop publishing the API port directly on the host — all traffic must route through Caddy.
  - [ ] Add HTTPS auto-cert to Caddyfile for production domain.
  - [ ] Add "is this user a member of this party" authorization check to `GET /api/transcoding/:partyId/status` (currently any authenticated user can query any partyId — reduced from fully unauthenticated but still an IDOR against other users' parties).
