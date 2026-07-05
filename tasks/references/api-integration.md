# Watch Party API Integration Guide

This document outlines how the React frontend should integrate with the Fastify backend and the overarching infrastructure. The core principle of this architecture is the strict separation of the **Control Plane** (WebSockets) and the **Media Plane** (Static HLS).

## 1. Authentication Flow (HTTP)
All interactions begin with HTTP REST authentication. We use a strict root/guest model.

- **POST /api/auth/setup**: (First time only) Send `username` and `password`. Creates the initial `root` account.
- **POST /api/auth/login**: Send `username` and `password`. Receives a JWT `token`.
- **POST /api/users/guest**: (Root only) Send `username` and `password`. Creates a `guest` account.

*Note: You must store this JWT in local storage or a secure cookie.*

## 2. Active Party (HTTP)
Before establishing a websocket, guests should check if there is an active party.
- **GET /api/playback/party/active**: Returns `{ partyId, mediaFileId }` (or `partyId: null` if none).
- **POST /api/playback/start**: (Root only) Send `{ mediaFileId }`. Starts a new active party in Redis and returns `{ partyId }`.

## 3. Realtime Control Plane (WebSocket)
Once authenticated, the frontend should immediately establish a WebSocket connection to the backend. This socket handles **everything** except media playback (e.g., chat, presence, sync).

### Connecting
Connect to `ws://localhost:3000/ws?token=YOUR_JWT_TOKEN`.

### Event Architecture
All socket events should map to the shared types defined in `packages/contracts`.

**Example Incoming Events:**
- `client.join`: Sent when a user joins the party room (`{ partyId }`).
- `client.play`: Sent when a user presses play.
- `client.pause`: Sent when a user presses pause.
- `client.seek`: Sent when a user scrubs the timeline.
- `client.chat`: Sent to broadcast a message.
- `client.heartbeat`: Sent periodically to report playback position.

**Example Outgoing Events:**
- `server.party.state`: Initial state received upon joining.
- `server.play`: Commands the client to start playback.
- `server.pause`: Commands the client to pause playback.
- `server.seek`: Commands the client to seek to a specific position.
- `server.chat`: Receives a new chat message broadcast.

## 4. Media Plane (HLS via Caddy)
**Video never travels through WebSockets or Fastify.** 

1. The Fastify backend generates HLS playlists and segments via BullMQ + FFmpeg.
2. The React player (e.g., hls.js or Shaka Player) requests the HLS URL: `http://localhost:8080/hls/<partyId>/master.m3u8`
3. Caddy directly serves the static `.m3u8` playlists and `.ts` chunks straight from the `cache/` directory.

## 5. Shared Types
Always import your types and schemas from `@roomies/contracts` and `@roomies/shared/src/types`. Do not redefine TypeScript interfaces in the frontend if they already exist in the packages.

Example:
```typescript
import { AuthResponse } from '@roomies/contracts/src/api';
import { JWTPayload } from '@roomies/shared/src/types';
```
