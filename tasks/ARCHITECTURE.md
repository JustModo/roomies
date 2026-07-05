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
 PostgreSQL   Redis PubSub   FFmpeg Manager
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
- **Redis** is the authoritative store for transient state (playback, chat, presence, pub/sub).
- **PostgreSQL** stores only persistent configuration and user data.
- **FFmpeg** is an external worker managed by the backend; it never knows about users or parties.
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
**PostgreSQL Tables**: `Users`, `Libraries`, `MediaFiles`, `PlaybackSessions`, `Settings`, `RefreshTokens`.
**Redis Schemas**: `Playback State`, `Connected Users`, `Chat History`, `Presence`, `Socket Sessions`, `Transcode Locks`, `Pub/Sub`.

There is no chat table or presence table in Postgres. Those belong strictly in Redis.

## Transcoding & Caching
One FFmpeg process per `[Movie + Resolution + Audio + Subtitle]`, **NOT** per user. 
Everyone watching a 720p English stream consumes the exact same HLS playlist served from `cache/` by Caddy.

## Authentication
Users authenticate over HTTP to receive a JWT. That JWT is then passed to the Socket upgrade request to authenticate the realtime gateway. Every REST request and every WebSocket is fully authenticated.

## Future Feature Implementations

### 1. Playback Orchestration & Sync Engine
The **Playback Orchestration** module manages the shared state of a party. When a room is created, Redis holds the `PlaybackState` (current `movieId`, `leaderId`, `position`, `status: playing|paused`).
When a client (leader) scrubs or pauses, they emit `client.seek` or `client.pause` to the WebSocket Router. The router relays this to the Playback handler, which updates Redis and broadcasts the state delta to all peers in the room. 

The **Sync Engine** is a background tick (or reactive listener) that compares incoming `client.heartbeat` positions against the mathematically expected server position. If a viewer drifts beyond an acceptable threshold (e.g., >2 seconds), the server forcefully emits a `server.seek` command to rubberband the drifting client back in sync with the leader.

### 2. Scalable WebSocket Gateway
The WebSocket layer operates entirely on a Feature-Oriented router pattern (`apps/api/src/websocket/router.ts`). The gateway purely handles JSON parsing (via strict Zod discriminated unions) and passes the strongly-typed payload to feature-specific handlers (e.g., `chat/socket.ts`, `playback/socket.ts`). This ensures the gateway never becomes a monolithic switch statement and makes adding new modules seamless.

### 3. Media Transcoding Manager (FFmpeg)
To handle broad device compatibility, an offline FFmpeg Manager runs as a distinct sub-process. 
When a user requests a media file, the API checks if a Transcoded HLS `.m3u8` playlist exists in the `cache/` directory. If not, it spawns an FFmpeg worker to transcode the raw `.mp4/.mkv` into HLS segments in real-time. 
Crucially, **media never flows through Node.js**. Once the `.m3u8` playlist is available on disk, the backend simply signs a URL pointing to the Caddy reverse-proxy. Caddy statically serves the chunks at high speed directly to the frontend's Shaka Player.

### 4. Ephemeral Chat & Presence
PostgreSQL is strictly avoided for high-throughput ephemeral data.
When a user joins, the Gateway writes their connection to Redis OM (`socketSessionRepository`). Chat messages (`client.chat`) are validated, persisted temporarily in a Redis Time Series or capped List, and immediately broadcasted (`server.chat`) via Redis Pub/Sub to other instances/users. This ensures the database is never bottlenecked by casual conversation or user presence flapping.
