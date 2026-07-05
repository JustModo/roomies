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

- [ ] **Users Feature**
  - [ ] Implement `GET /api/users/me` to fetch current user profile.
  - [ ] Implement user settings update (theme, etc) via Prisma `Settings` table.
- [ ] **Library Feature**
  - [ ] Implement file scanner service (recursive folder scan).
  - [ ] Read basic metadata (name, duration) without TMDB/Internet calls.
  - [ ] Store scanned paths into `Library` and `MediaFile` Postgres tables.
  - [ ] Expose `GET /api/library` to fetch available media.
- [ ] **Playback Orchestration** `[DEPENDS_ON: Library Feature]`
  - [ ] Implement HTTP route to start a party/session.
  - [ ] Seed Redis `playbackState` with initial movie, leader, and 0 position.
  - [ ] Map incoming socket `client.play`/`client.pause`/`client.seek` events to Redis updates and broadcast to room.
- [ ] **Sync Engine** `[DEPENDS_ON: Playback Orchestration]`
  - [ ] Implement drift computation (compare user's reported position against server expected position).
  - [ ] Dispatch `server.seek` or `server.pause` to out-of-sync clients.
- [ ] **Chat Feature**
  - [ ] Map `client.chat` socket event.
  - [ ] Save to Redis OM `chat` schema or Redis List.
  - [ ] Broadcast `server.chat` to all room members.
  - [ ] Expose `GET /api/chat/history` to return last 500 messages from Redis.
- [ ] **Voice Signaling (WebRTC)**
  - [ ] Map WebRTC socket events (`client.voice.offer`, `answer`, `ice`).
  - [ ] Relay signaling events strictly to the target peers. No media processing!
- [ ] **Transcoding & Media Delivery**
  - [ ] Implement manager to spawn FFmpeg child processes based on requested media.
  - [ ] Ensure one worker per media/resolution (prevent redundant transcode streams).
  - [ ] Generate standard HLS `.m3u8` and `.ts` files into `cache/` directory.
  - [ ] Create API route to return signed HLS Caddy URLs to the frontend.

## 2. Frontend Application (React + Vite)

- [ ] **Core Setup**
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

## 3. Infrastructure & DevOps

- [ ] **Caddy Tuning**
  - [ ] Verify Caddy successfully serves static HLS from `cache/` with correct CORS headers.
- [ ] **FFmpeg Worker Image**
  - [ ] Validate the `infra/ffmpeg/Dockerfile` successfully mounts `media/` and `cache/` to run transcode commands.
