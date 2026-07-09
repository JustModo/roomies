# Architecture Plan

This is a living document of the entire architecture plan for the Watch Party monorepo. It serves to keep the system feature-oriented, avoid premature microservices, and ensure high scalability.

---

## Overall Architecture

```text
                        Browser
                           │
                    React + Shaka
                           │
             HTTPS + WebSocket (JWT)
                           │
                     Caddy Reverse Proxy
                           │
                 ┌─────────┴─────────┐
                 │                   │
              API Routes        Static HLS
                 │                   │
            Fastify Backend      Caddy File Server
                 │
      ┌──────────┼─────────────┐
      │          │             │
    SQLite    In-Memory State  TranscodeSessionManager (live FFmpeg)
      │          │
      └──────────┼─────────────┘
                 │
            Socket Gateway
                 │
      Playback / Chat / Sync / Presence
```

**Notice:** Video never travels through WebSockets or the application logic.

## The Separation of Planes
- **Fastify** handles authentication, APIs, WebSocket connections, and orchestration. (Control Plane)
- **In-memory state** (plain JS `Map`s/module-level variables) is the authoritative store for transient state (playback, chat, socket sessions). This app runs as a single Node process — no horizontal scaling — so there is no external broker/cache; this state does not survive an API restart, by design.
- **SQLite** (via an embedded, file-backed Prisma driver adapter) stores only persistent configuration and user data. No separate database server — the whole app is a single deployable unit plus Caddy.
- **FFmpeg** is invoked via an in-process job runner (concurrency-limited queue + retry/backoff) managed by the backend; it never knows about users or parties.
- **Caddy** serves HLS playlists and segments directly, keeping media delivery completely off the application server. (Media Plane)

## Monorepo Layout (pnpm workspaces + Turborepo)
```
watch-party/
  apps/
      api/ (Fastify)
      web/ (React + Vite)
  packages/
      shared/ (Enums, Interfaces)
      contracts/ (Zod Schemas, Socket Events)
      config/ (ESLint/Prettier)
      transcoding/ (FFmpeg job runner, hwaccel detection)
      library/ (Media folder scanner + sync, Prisma-agnostic)
  infra/
      docker/
      caddy/
      ffmpeg/
  media/
  cache/
```

## Database Philosophy
**SQLite Tables**: `User`, `Library`, `Title`, `Season`, `MediaFile`, `Subtitle`, `RefreshToken`, `ServerConfig`.
**In-Memory State** (module-level `Map`s/variables, one per feature): `playbackState` (`apps/api/src/playback/store.ts`), `chat history` (`apps/api/src/chat/store.ts`, capped ring buffer per party), `socket sessions` (`apps/api/src/websocket/store.ts`), `active transcode session` (`apps/api/src/transcoding/manager.ts`, tracks live FFmpeg child processes).

There is no chat table or presence table in SQLite. Those are intentionally ephemeral and live only in memory — none of it is expected to survive an API process restart, matching how this data behaved even when it was Redis-backed.

## Transcoding & Caching
One FFmpeg process per `[Movie + Resolution + Audio + Subtitle]`, **NOT** per user. 
Everyone watching a 720p English stream consumes the exact same HLS playlist served from `cache/` by Caddy.

## Authentication
Users authenticate over HTTP to receive a JWT. That JWT is then passed to the Socket upgrade request to authenticate the realtime gateway. Every REST request and every WebSocket is fully authenticated.

## Feature Implementations

### 1. Playback Orchestration & Sync Engine
The **Playback Orchestration** module manages the shared state of a party. When a room is created, an in-memory store (`apps/api/src/playback/store.ts`) holds the `PlaybackState` (current `movieId`, `leaderId`, `position`, `isPaused`, `speed`, `updatedAt`).
When the leader scrubs or pauses, they emit `client.seek` or `client.pause` to the WebSocket Router. The router relays this to the Playback handler, which updates the in-memory state and broadcasts the state delta to all peers in the room. Only the party leader's `client.play`/`client.pause`/`client.seek` are honored (`apps/api/src/playback/socket.ts`, `isLeader` check).

The **Sync Engine** (`handleClientHeartbeat` in `apps/api/src/playback/socket.ts`) compares each incoming `client.heartbeat` position against the server-expected position (`state.position + elapsed * state.speed`, `elapsed` derived from `state.updatedAt`). If a viewer drifts beyond 2 seconds, the server forcefully emits a `server.seek` directly to that one socket (not a room broadcast) to rubberband it back in sync — everyone else is left untouched.

### 2. Scalable WebSocket Gateway
The WebSocket layer operates entirely on a Feature-Oriented router pattern (`apps/api/src/websocket/router.ts`). The gateway purely handles JSON parsing (via strict Zod discriminated unions) and passes the strongly-typed payload to feature-specific handlers (e.g., `chat/socket.ts`, `playback/socket.ts`). This ensures the gateway never becomes a monolithic switch statement and makes adding new modules seamless.

### 3. Media Transcoding Manager (FFmpeg)
To handle broad device compatibility and adaptive quality, a **TranscodeSessionManager** (`apps/api/src/transcoding/manager.ts`) manages live FFmpeg child processes — one per quality variant (360p/720p/1080p by default, configurable via `TRANSCODE_PROFILES`).

When a user starts a party, the API:
1. Kills any existing FFmpeg processes and cleans the cache directory (solving EBUSY/lock errors by ensuring FFmpeg is dead before touching its files)
2. Spawns one FFmpeg process per quality variant, each writing HLS segments to disk in **real-time** (`-hls_flags append_list+independent_segments`)
3. Writes a static HLS master playlist (`master.m3u8`) listing all variant streams
4. Returns the HLS URL immediately — no waiting for transcoding to complete

The client (Shaka Player / hls.js) loads `master.m3u8`, picks a variant based on bandwidth, and starts playing as soon as the first few segments appear on disk (~5-10 seconds). Adaptive bitrate switching happens automatically as network conditions change.

Quality profiles (`apps/api/src/transcoding/profiles.ts`) define resolution, bitrate, and buffer sizes for each variant. Crucially, **media never flows through Node.js** — Caddy statically serves the segments at high speed directly to the frontend player.

If an FFmpeg variant process crashes during a session, the `TranscodeSessionManager` fires an error callback that broadcasts a `server.transcode.error` WebSocket event to all connected clients in the party room.

### 4. Media Library Scanning (`packages/library`)
The library scanner lives in its own workspace package, `packages/library`, consumed by `apps/api` the same way `@roomies/transcoding` is: it is Prisma-agnostic (only imports `@prisma/client` for types) and every exported function takes a `PrismaClient` instance as a parameter — `apps/api` remains the single source of truth for the Prisma schema and client (`apps/api/src/database/sqlite.ts`).

The on-disk convention is **folder-per-title**, scanned non-recursively one level at a time by `scanLibraryFolder()` (`packages/library/src/scanner.ts`), with file roles decided purely by extension (no filename convention required):
- A folder with video files directly inside it is a **movie** — the first video file (alphabetically) becomes its single episode, every subtitle file in that folder is attached to it, and the first image file becomes its cover.
- A folder whose subfolders contain video files is a **show** — each such subfolder is a season, every video file inside becomes its own episode, and every subtitle file in that season folder is attached to all episodes in it (extension-only matching; no per-episode filename-stem disambiguation is implemented).

This maps onto a 5-model Prisma hierarchy: `Library → Title (movie|show) → Season → MediaFile → Subtitle`. A movie is simply a `Title` with one implicit `Season` (`name: ""`). `MediaFile` deliberately kept its original field names (`title`, `path`, `duration`, `id`) from the pre-extraction flat schema, so `apps/api/src/playback/service.ts` (which resolves a stream purely by `MediaFile.id`) needed zero changes across the migration.

`LibraryService.scanLibrary(prisma)` (`packages/library/src/service.ts`) is incremental and idempotent: it diffs each level (titles, seasons, media files, subtitles) against disk by path, prunes rows whose file disappeared, and only re-runs `ffprobe` (duration extraction) for newly-discovered video files. Cover art is not served statically by Caddy (which only exposes `/cache` for HLS) — it goes through an authenticated Fastify route, `GET /api/library/cover/:titleId` (`apps/api/src/library/controller.ts`), which streams the file after verifying it still resolves inside `MEDIA_ROOT`.

### 5. Ephemeral Chat
SQLite is strictly avoided for high-throughput ephemeral data.
When a user joins, the Gateway tracks their connection in an in-memory session map (`apps/api/src/websocket/store.ts`). Chat messages (`client.chat`) are validated, appended to a capped in-memory ring buffer per party (`apps/api/src/chat/store.ts`, last 500 messages), and immediately broadcast (`server.chat`) to other room members. `GET /api/chat/history?partyId=` returns that same buffer for clients joining mid-conversation. This ensures the database is never bottlenecked by casual conversation, at the cost of history not surviving an API restart (an accepted tradeoff for this single-node deployment).
