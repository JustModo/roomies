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
   SQLite    In-Memory State  FFmpeg (in-process job runner)
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
      logger/ (Pino)
  infra/
      docker/
      caddy/
      ffmpeg/
  media/
  cache/
```

## Database Philosophy
**SQLite Tables**: `User`, `Library`, `MediaFile`, `RefreshToken`, `ServerConfig`.
**In-Memory State** (module-level `Map`s/variables, one per feature): `playbackState` (`apps/api/src/playback/store.ts`), `chat history` (`apps/api/src/chat/store.ts`, capped ring buffer per party), `socket sessions` (`apps/api/src/websocket/store.ts`), `transcode status` (`apps/api/src/transcoding/status.ts`, self-expiring after 24h).

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
To handle broad device compatibility, an in-process job runner (`apps/api/src/transcoding/queue.ts`, `worker.ts` — a concurrency-limited queue with retry/backoff, no external broker) manages FFmpeg jobs.
When a user requests a media file, the API checks if a Transcoded HLS `.m3u8` playlist exists in the `cache/` directory. If not, it spawns an FFmpeg process to transcode the raw `.mp4/.mkv` into HLS segments in real-time. 
Crucially, **media never flows through Node.js**. Once the `.m3u8` playlist is available on disk, the backend simply signs a URL pointing to the Caddy reverse-proxy. Caddy statically serves the chunks at high speed directly to the frontend's Shaka Player.

### 4. Ephemeral Chat
SQLite is strictly avoided for high-throughput ephemeral data.
When a user joins, the Gateway tracks their connection in an in-memory session map (`apps/api/src/websocket/store.ts`). Chat messages (`client.chat`) are validated, appended to a capped in-memory ring buffer per party (`apps/api/src/chat/store.ts`, last 500 messages), and immediately broadcast (`server.chat`) to other room members. `GET /api/chat/history?partyId=` returns that same buffer for clients joining mid-conversation. This ensures the database is never bottlenecked by casual conversation, at the cost of history not surviving an API restart (an accepted tradeoff for this single-node deployment).
