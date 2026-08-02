# High-Level Project Review: Type Errors & Architectural Simplifications

## Executive Summary

This document presents a comprehensive review of the Roomies codebase (`apps/api`, `apps/web`, `packages/*`). It identifies all **TypeScript type errors ("red underlines")** and pinpoints **unnecessary code rerouting / over-complications** that can be simplified.

---

## 1. Complete List of TypeScript Type Errors ("Red Underlines")

### 1.1 — `apps/api/src/index.ts` (TS2459 Error)
- **Error Code**: `TS2459`
- **Location**: `apps/api/src/index.ts:5:21`
- **Description**: `Module '"./app"' declares 'createAppContext' locally, but it is not exported.`
- **Cause**: `apps/api/src/index.ts` attempts to `export { createApp, createAppContext } from './app'`, but `createAppContext` is declared in `./context`, not `./app`.
- **Fix**: Re-export `createAppContext` from `./context` or re-export it cleanly from `./app`.

---

### 1.2 — Untyped Property Augmentations (`(socket as any)`, `(req as any)`)

While not strictly breaking `tsc` due to explicit `any` casting, these trigger IDE red underlines and type safety gaps:

#### `apps/api/src/sync/service.ts` (Lines 110 & 140)
- **Code**: `(ctx.socket as any).lastSeekTime`
- **Cause**: Attaching custom `lastSeekTime` property to `@fastify/websocket` `WebSocket` object without typing.
- **Fix**: Extend `SocketContext` or `WebSocket` interface:
  ```ts
  export interface RoomSocket extends WebSocket {
    lastSeekTime?: number;
  }
  ```

#### `apps/api/src/websocket/gateway.ts` (Lines 21 & 35)
- **Code**: `(req as any).query?.token` and `(ws as any).userId`
- **Cause**: Accessing query string and socket properties via unsafe `as any`.
- **Fix**: Define typed request query interface and typed WebSocket instance.

#### `packages/test/src/suites/playback_sync.test.ts` & `playback_async.test.ts`
- **Code**: `(m: any)` and `(msg: any)` inside event predicates and `map`/`find` callbacks.
- **Fix**: Use typed payload interfaces from `@roomies/contracts` (`RoomState`, `MemberState`, `SocketEventPayload`).

---

## 2. Unnecessary Code Rerouting & Simplification Opportunities

### 2.1 — Duplicate Server Bootstrap Entrypoints (`bootstrap/index.ts` vs `app.ts`)

**Current Rerouting**:
- `apps/api/src/app.ts` implements `createApp(options)`.
- `apps/api/src/bootstrap/index.ts` duplicates Fastify server creation, CORS setup, WebSocket plugin registration, DB connection, library scanning, socket event registration, and HTTP route registration.
- `apps/api/src/index.ts` exports both `bootstrap` and `createApp`.

**Simpler Design**:
- Consolidate all server creation logic into `createApp(options)`.
- Make `bootstrap(app, options)` simply wrap `createApp(options)` or deprecate `bootstrap()` entirely so there is **one single canonical entrypoint** (`createApp`).

---

### 2.2 — WebSocket Event Handler Registration Rerouting

**Current Rerouting**:
- `apps/api/src/index.ts` → calls `createApp()`
- `createApp()` → calls procedural functions:
  - `registerChatSocketEvents()`
  - `registerPlaybackSocketEvents()`
  - `registerRoomSocketEvents()`
  - `registerPartySocketEvents()`
  - `registerSyncSocketEvents()`
  - `registerStoreSocketEvents()`
- Each function imports the global `defaultSocketRouter` singleton and registers event strings manually.

**Simpler Design**:
- Create a clean `registerSocketGateway(app: FastifyInstance)` plugin.
- Pass `app.ctx.socketRouter` directly into a unified registration function, removing 6 procedural import functions and eliminating singletons.

---

### 2.3 — Redundant Database Round-Trips on Every WebSocket Event

**Current Rerouting**:
On **every single WebSocket control message** (`room.set_control_lock`, `room.update_settings`, `playback.change-media`, `playback.stop`), the handler executes:
```ts
const user = await prisma.user.findUnique({ where: { id: ctx.userId } });
if (user?.role !== 'root') return reply/broadcast Error;
```

**Simpler Design**:
- Include `role` (`'root' | 'guest'`) directly inside the signed `JWTPayload`:
  ```ts
  export interface JWTPayload {
    userId: string;
    username: string;
    role: string;
    sessionId: string;
  }
  ```
- Store `ctx.role` on `SocketContext` during WebSocket connection authentication.
- Check `if (ctx.role !== 'root')` synchronously without making a database query on every WebSocket message.
- Decreases WS message processing latency and eliminates redundant DB queries.

---

### 2.4 — Duplicate `calculateExpectedPosition` & Playhead Logic

**Current Rerouting**:
- `PlaybackService` calculates current position for seek/pause/play.
- `SyncService` calculates expected position for drift detection using `calculateExpectedPosition()`.
- `RoomStore` calculates current position in `getCurrentPosition()`.

**Simpler Design**:
- Consolidate position calculation into `RoomStore.getCurrentPosition()`.
- Both `SyncService` and `PlaybackService` call `ctx.roomStore.getCurrentPosition()` directly.

---

## 3. Action Plan

1. **Fix `apps/api/src/index.ts` TS2459 Error**: Re-export `createAppContext` from `./context`.
2. **Type Property Augmentations**: Add `RoomSocket` type definition to eliminate `(socket as any)` and `(req as any)` casts.
3. **Consolidate `bootstrap` into `createApp`**: Unify server startup in `apps/api/src/app.ts`.
4. **Cache `role` on `SocketContext`**: Include `role` in JWT payload and `SocketContext` to remove redundant DB calls during WebSocket events.
