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
