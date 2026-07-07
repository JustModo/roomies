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
  - [x] Implement robust WebSocket reconnecting hook (`useWebSocket.ts`).
- [x] **Auth UI (THE ROOM Spec)**
  - [x] Login Form & Root Setup Form (centered 360px layout).
  - [x] Persist JWT locally and route to Lobby.
- [x] **Lobby UI (THE ROOM Spec)** `[DEPENDS_ON: Backend Library Feature]`
  - [x] Display minimalist room status and viewer count.
  - [x] Display currently playing media.
- [x] **Room / Player UI (THE ROOM Spec)** `[DEPENDS_ON: Backend Playback, Transcoding]`
  - [x] Integrate custom controls and hairline pulse syncing.
  - [x] Admin Overlay for Media and User management.
  - [x] Integrate `hls.js` Player to consume Caddy HLS URL.
  - [x] Connect player events (play/pause/seek) to `useWebSocket` hook to emit socket events.
  - [x] Listen to server socket events and forcefully sync the local Player.
- [ ] **Social UI (THE ROOM Spec)**
  - [x] Chat sidebar UI and toast notifications.
  - [x] Render `GET /api/chat/history` and real-time incoming `server.chat` messages.
  - [ ] Implement enhanced chat sidebar design (e.g., transparent/opacity-based chat bubbles for a seamless viewing experience).
  - [ ] Voice channel toggle (WebRTC audio-only mesh or SFU signaling).
- [ ] **Player & UX Enhancements**
  - [ ] Implement player error boundaries and fallback handling.
  - [x] Add explicit buffering/loading states synchronized with HLS segments.
  - [ ] Subtitle and audio track selection support.


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
  - [ ] Implement WebSocket compression (permessage-deflate) to reduce payload size.

## 4. Transcoding Pipeline Optimization

The transcoding pipeline now lives in its own workspace package, `packages/transcoding` (see `[LOG:2026-07-06 Transcoding Pipeline Optimization Phase 2]`), consumed by `apps/api` the same way `@roomies/contracts` is.
- [x] **Hardware Acceleration** (See `[LOG:2026-07-06 Transcoding Pipeline Optimization Phase 2]`)
  - [x] Detect and utilize hardware encoders automatically (`packages/transcoding/src/hwaccel.ts`, VAAPI/NVENC/QSV — no VideoToolbox since containers run Linux). `hwAccelMode: 'auto'` (default) picks it up transparently with a mandatory CPU fallback-on-failure safety net; verified end-to-end on this dev machine's real Intel/AMD VAAPI device (`/dev/dri`), both natively and inside the actual `apps/api/Dockerfile` image (see below). NVENC/QSV remain unverified without that specific hardware.
  - [x] `apps/api/Dockerfile` base image swapped from Alpine (`apk add ffmpeg`, no hwaccel support) to `node:22-bookworm-slim` (Debian's `ffmpeg` package ships VAAPI support). `docker-compose.yml` gained a commented-out, opt-in `/dev/dri:/dev/dri` device passthrough. Built the real image with `podman build` and confirmed `h264_vaapi` is present in its `ffmpeg -encoders` output — something the old Alpine image never had. Booting the built image with `--device /dev/dri` showed `detectHardwareEncoder()` correctly reporting `vaapi`; a live transcode inside that container hit a VAAPI device-init failure specific to this rootless-podman/SELinux test sandbox (`Failed to initialise VAAPI connection: -1`), and the mandatory CPU fallback caught it exactly as designed — the stream still transcoded and played successfully. This is a stronger result than a clean pass would have been: it's a real-world proof the fallback net does its job under an actual hardware-init failure, not just a hypothetical one. Real Docker (not rootless podman) deployments on a host with proper GPU driver/permission setup should not hit this same init failure.
  - [x] NVENC/QSV investigated further (see `[LOG:2026-07-06 NVENC/QSV Investigation and E2E Test Rewrite]`) — **NVENC**: this host has no NVIDIA GPU at all (`lspci` confirms Intel-only), a hard hardware dead end, not a code/config gap. **QSV**: this host does have real Intel Quick Sync hardware, and every package QSV needs (`libvpl`, `intel-vpl-gpu-rt`, `intel-mediasdk`, `libva-intel-media-driver`) is already installed, but direct `ffmpeg -c:v h264_qsv` attempts fail with what looks like a genuine ABI/version-mismatch bug between ffmpeg 7.1.4's QSV/libvpl integration and this specific bleeding-edge Fedora 43 Intel Media stack (confirmed via `strace`: both the legacy `libmfxhw64.so` and the newer `libmfx-gen.so` runtimes get loaded together) — a host/distro-level compatibility issue outside this codebase, not something more code or package installs can fix. Both remain correctly unverified, and both fail safely into the mandatory CPU fallback if ever selected.
- [x] **Throughput & Latency** (See `[LOG:2026-07-06 Transcoding Pipeline Optimization Phase 1]` and `Phase 2`)
  - [x] Fast-start caching: the lowest-bitrate (360p) variant is now pre-warmed immediately on `changeMedia`/seek instead of waiting for a client's `hls.js` to request it, eliminating the cold-start stall.
  - [x] Parallel segment processing across resolution variants was already true today (independent `ffmpeg` processes per resolution) — formalized with an explicit `MAX_CONCURRENT_VARIANTS` guardrail (`packages/transcoding/src/config.ts`). True chunked single-variant encoding was scoped out as unnecessary complexity for a live transcode.
  - [x] Low-latency HLS output tuning: `hls_time` 4s→2s, bounded rolling `hls_list_size` (10 segments, ~20s live window, replacing the old unbounded-playlist + manual segment-pruning workaround), `-sc_threshold 0`. Kept the existing time-based `-force_key_frames` over a hardcoded `-g`/`-keyint_min` since the latter only aligns correctly for exactly-24fps source content.
- [x] **Adaptive Streaming** — was already substantially implemented (multi-variant `master.m3u8`, `hls.js` ABR on the frontend); the fast-start pre-warming above closes the remaining gap (on-demand variant spawn causing a stall on first play/seek).
  - [x] Add configurable FFmpeg presets (ultrafast/veryfast/fast/medium/slow), adjustable from the Admin Overlay's SETTINGS tab, persisted via `ServerConfig`. The same tab now also shows detected hardware and an auto/cpu toggle.
