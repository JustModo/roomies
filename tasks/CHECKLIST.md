# Active Development Checklist

This checklist tracks the remaining work for the Watch Party architecture. Keep tasks independent where possible.

## 0. Completed Work (Phase 1 Setup)

- [x] **Monorepo Setup** (See `[LOG:L11]`)
  - [x] Turborepo + pnpm configurations.
- [x] **Database & State Initialization** (See `[LOG:L13-14]`)
  - [x] Prisma 7 Postgres Schema (User, Library, PlaybackSession, etc.).
  - [x] Redis OM Schemas (Presence, SocketSession, Chat).
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
  - [x] Seed Redis `playbackState` with initial movie, leader, and position 0.
  - [x] `client.join` event registers socket into in-memory party room.
  - [x] `client.play`/`client.pause`/`client.seek` update Redis state and broadcast `server.*` to all room members.
  - [x] `client.heartbeat` stub added (Sync Engine hook).
- [ ] **Sync Engine** `[DEPENDS_ON: Playback Orchestration]`
  - [ ] Implement drift computation (compare `client.heartbeat` position against server expected position).
  - [ ] Dispatch `server.seek` or `server.pause` to out-of-sync clients.
- [ ] **Chat Feature**
  - [ ] Map `client.chat` socket event.
  - [ ] Save to Redis OM `chat` schema or Redis List.
  - [ ] Broadcast `server.chat` to all room members.
  - [ ] Expose `GET /api/chat/history` to return last 500 messages from Redis.
- [ ] **Voice Signaling (WebRTC)**
  - [ ] Map WebRTC socket events (`client.voice.offer`, `answer`, `ice`).
  - [ ] Relay signaling events strictly to the target peers. No media processing!
- [x] **Transcoding & Media Delivery** (See `[LOG:L54]`)
  - [x] BullMQ queue (`transcodeQueue`) with typed job data.
  - [x] BullMQ worker spawns `ffmpeg` via `child_process.execFile` to produce HLS segments.
  - [x] Redis transcode status key tracks `pending → processing → ready | failed`.
  - [x] `GET /api/transcoding/:partyId/status` returns status + Caddy HLS URL when ready.
  - [x] One job per `partyId` (idempotent BullMQ `jobId`).

## 2. Frontend Application (React + Vite)

- [ ] **Core Setup** (See `[LOG:L48-51]`)
  - [x] Scaffold Vite + React Monorepo environment and fix build toolchain.
  - [ ] Configure React Router and global state (Zustand).
  - [ ] Setup Axios/Fetch wrapper to inject JWT auth headers.
  - [ ] Implement robust WebSocket reconnecting hook (`useWebSocket.ts`).
- [ ] **Auth UI**
  - [ ] Login Form & Register Form.
  - [ ] Persist JWT locally and route to app dashboard.
- [ ] **Library UI** `[DEPENDS_ON: Backend Library Feature]`
  - [ ] Display grid of available `MediaFiles`.
  - [ ] "Start Party" button for a given movie.
- [ ] **Watch Party UI** `[DEPENDS_ON: Backend Playback, Transcoding]`
  - [ ] Integrate Shaka Player (or similar) to consume Caddy HLS URL.
  - [ ] Connect player events (play/pause/seek) to `useWebSocket` hook to emit `client.*` events.
  - [ ] Listen to `server.*` events and forcefully sync the local Shaka Player.
- [ ] **Social UI**
  - [ ] Chat sidebar rendering Redis message history and real-time incoming messages.
  - [ ] Presence indicators (who is in the room, buffering states).
  - [ ] Voice channel toggle (WebRTC audio-only mesh or SFU signaling).

## 3. Infrastructure & DevOps (See `[LOG:L54]`)

- [x] **Dockerization**
  - [x] `apps/api/Dockerfile` — multi-stage build with `ffmpeg` installed via `apk`.
  - [x] `apps/web/Dockerfile` — multi-stage Vite build served by nginx with SPA fallback.
  - [x] `docker-compose.yml` — full stack with Postgres, Redis, API, Web, Caddy + healthchecks and shared volumes.
- [x] **Caddy Reverse Proxy**
  - [x] `infra/caddy/Caddyfile` routes `/api/*`, `/ws`, `/hls/*`, and `/*` (React SPA).
  - [x] HLS served with correct CORS headers and `Cache-Control: no-cache`.
- [x] **Environment**
  - [x] `apps/api/.env.example` documents all required environment variables.
- [ ] **Production Hardening**
  - [ ] Set `origin` in CORS to actual production domain.
  - [ ] Rotate JWT secrets via environment variables.
  - [ ] Add HTTPS auto-cert to Caddyfile for production domain.
