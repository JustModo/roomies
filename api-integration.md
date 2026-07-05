# Watch Party API Integration Guide

This document outlines how the React frontend should integrate with the Fastify backend and the overarching infrastructure. The core principle of this architecture is the strict separation of the **Control Plane** (WebSockets) and the **Media Plane** (Static HLS).

## 1. Authentication Flow (HTTP)
All interactions begin with HTTP REST authentication.

- **POST /api/auth/login**: Send `email` and `password`. Receives a JWT `token`.
- **POST /api/auth/register**: Send `email`, `username`, and `password`. Receives a JWT `token`.

*Note: You must store this JWT in local storage or a secure cookie.*

## 2. Realtime Control Plane (WebSocket)
Once authenticated, the frontend should immediately establish a WebSocket connection to the backend. This socket handles **everything** except media playback (e.g., chat, presence, voice signaling, sync).

### Connecting
Connect to `ws://localhost:3000/ws?token=YOUR_JWT_TOKEN`.

### Event Architecture
All socket events should map to the shared types defined in `packages/contracts`.

**Example Incoming Events:**
- `client.play`: Sent when a user presses play.
- `client.pause`: Sent when a user presses pause.
- `client.chat`: Sent to broadcast a message.

**Example Outgoing Events:**
- `server.play`: Commands the client to start playback.
- `server.chat`: Receives a new chat message broadcast.

## 3. Media Plane (HLS via Caddy)
**Video never travels through WebSockets or Fastify.** 

1. The Fastify backend will eventually generate a signed URL (or standard URL) pointing to Caddy (`http://localhost:8080/hls/...`).
2. The React player (e.g., Shaka Player) requests this URL.
3. Caddy directly serves the static `.m3u8` playlists and `.ts`/`.m4s` chunks straight from the `cache/` directory.

## 4. Shared Types
Always import your types and schemas from `@roomies/contracts` and `@roomies/shared/src/types`. Do not redefine TypeScript interfaces in the frontend if they already exist in the packages.

Example:
```typescript
import { AuthResponse } from '@roomies/contracts';
import { JWTPayload } from '@roomies/shared/src/types';
```
