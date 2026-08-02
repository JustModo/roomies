# Monorepo Audit: Un-typed `any` Usages & Loose Optional Schemas

## Executive Summary

This document presents a comprehensive monorepo audit (`apps/api`, `apps/web`, `packages/*`) identifying:
1. All occurrences of **un-typed `any` casts, untyped parameters, and `as any` overrides**.
2. All **overly permissive optional fields (`?`, `nullable()`)** in contracts, contexts, and components that can be made concrete.

---

## 1. Audit of Un-typed `any` Usages Across Workspace Packages

### 1.1 — Backend Application (`apps/api`)

| File Path | Line / Symbol | Issue Description | Proposed Concrete Type Fix |
|---|---|---|---|
| `apps/api/src/users/controller.ts` | Lines 10, 23, 36, 50 | `(req as any).user as JWTPayload` | Augment `FastifyRequest`: `interface FastifyRequest { user?: JWTPayload }` |
| `apps/api/src/auth/middleware.ts` | Lines 23, 32 | `(req as any).user = decoded` | Use augmented `req.user` directly |
| `apps/api/src/auth/websocket.ts` | Line 21 | `(req.query as any)?.token` | Type request query interface: `{ token?: string }` |
| `apps/api/src/sync/service.ts` | Lines 60, 62 | `payload as any` | Use typed message schemas (`SyncStatusPayload`, `StatusChangedPayload`) |
| `apps/api/src/playback/routes.ts` | Lines 21, 25 | `req as any` in controller call | Type controller methods to take `FastifyRequest` |
| `apps/api/src/library/routes.ts` | Line 20 | `req as any` in controller call | Type controller methods to take `FastifyRequest` |
| `apps/api/src/types.d.ts` | Line 8 | `voiceRoom: Set<any>` | Type `voiceRoom: Set<VoiceSocket>` |
| `apps/api/src/database/sqlite.ts` | Line 37 | `(client as any)[prop]` | Use `keyof PrismaClient` type constraint |

---

### 1.2 — Frontend Web Application (`apps/web`)

| File Path | Line / Symbol | Issue Description | Proposed Concrete Type Fix |
|---|---|---|---|
| `apps/web/src/pages/Lobby.tsx` | Line 13 | `useState<any>(null)` | `useState<ActivePlaybackResponse \| null>(null)` |
| `apps/web/src/components/AdminOverlay.tsx` | Line 104 | `useState<any[]>([])` | `useState<UserProfile[]>([]);` |
| `apps/web/src/hooks/useLibrary.ts` | Lines 16, 269 | `(lib: any) => lib.movies` | `(lib: Library) => lib.movies` |
| `apps/web/src/hooks/useRoomSync.ts` | Lines 175, 324, 372, 396 | `(msg.payload as any).sessionScope`, `as any` casts on resolution & status | Use typed `OutgoingSocketMessage` & `Resolution` types |
| `apps/web/src/hooks/useAsyncPlayback.ts` | Lines 7, 46, 62, 71, 134 | `sendMessage: (msg: any) => void`, `status: 'async' as any` | Use `OutgoingSocketMessage` & `SyncStatus` types |
| `apps/web/src/pages/Room.tsx` | Lines 99, 173, 174 | `(msg: any) => void` & `sendMessage: (msg: any)` | Use `OutgoingSocketMessage` & `IncomingSocketMessage` |
| `apps/web/src/components/Sidebar.tsx` | Lines 15, 16 | `(msg: any) => void` & `sendMessage: (msg: any)` | Use `OutgoingSocketMessage` & `IncomingSocketMessage` |
| `apps/web/src/components/Party/PartySection.tsx` | Lines 13, 14 | `(msg: any) => void` & `sendMessage: (msg: any)` | Use `OutgoingSocketMessage` & `IncomingSocketMessage` |
| `apps/web/src/components/Chat/ChatSection.tsx` | Lines 91, 92, 106 | `(container as any)._lastY` | Extend `HTMLDivElement` type or useRef for touch position |
| `apps/web/src/contexts/ChatContext.tsx` | Line 66 | `(window as any).webkitAudioContext` | Type window audio context augmentation |

---

### 1.3 — Test Package (`packages/test`)

| File Path | Line / Symbol | Issue Description | Proposed Concrete Type Fix |
|---|---|---|---|
| `packages/test/src/helpers/testFixtures.ts` | Lines 18-20 | `library: any`, `movie: any`, `mediaFile: any` | `library: Library`, `movie: Movie`, `mediaFile: MediaFile` |
| `packages/test/src/helpers/wsClient.ts` | Lines 5-8, 17-28 | `send(event, payload?: any)`, `waitForEventMatching<T = any>(..., (msg: any) => boolean)` | Type default `T = OutgoingSocketMessage` & `(msg: OutgoingSocketMessage) => boolean` |
| `packages/test/src/suites/*.test.ts` | Various lines | `(m: any) => ...` inside array filters | Use typed `MemberState` from `@roomies/contracts` |

---

## 2. Loose Optional Fields That Can Be Concrete

### 2.1 — Contract Schemas (`packages/contracts/src/api/index.ts`)

1. **`ActivePlaybackResponseSchema`**:
   - **Current**:
     ```ts
     export const ActivePlaybackResponseSchema = z.object({
       mediaFileId: z.string().optional(),
       mediaTitle: z.string().optional(),
       viewersCount: z.number().optional(),
       state: z.string().optional(),
       hlsUrl: z.string().optional(),
       subtitles: z.array(SubtitleTrackSchema).optional(),
     });
     ```
   - **Issue**: When an active playback session is returned, `mediaFileId`, `mediaTitle`, `viewersCount`, `state`, and `hlsUrl` are always non-empty strings/numbers.
   - **Concrete Fix**:
     ```ts
     export const ActivePlaybackResponseSchema = z.object({
       active: z.boolean(),
       mediaFileId: z.string(),
       mediaTitle: z.string(),
       viewersCount: z.number(),
       state: z.string(),
       hlsUrl: z.string(),
       subtitles: z.array(SubtitleTrackSchema),
     });
     ```

2. **`ChatMessageResponseSchema`**:
   - **Current**: `username: z.string().optional()`
   - **Issue**: Every chat message sent in the room has an associated sender `username`.
   - **Concrete Fix**: Make `username: z.string()` concrete.

3. **`MediaFileSchema`**:
   - **Current**: `number: z.number().nullable()`
   - **Issue**: Can be typed as `number?: number` or concrete integer.

---

## 3. Implementation Plan

1. **Fastify & Web Context Type Augmentation**: Add global module augmentations for `FastifyRequest.user` and `Window.webkitAudioContext`.
2. **Contracts Schema Concrete Types**: Make `ActivePlaybackResponseSchema` and `ChatMessageResponseSchema` fields concrete.
3. **Web Hooks & Components Refactoring**: Replace all `any` usages in `useRoomSync`, `useAsyncPlayback`, `useLibrary`, `Lobby`, `Room`, `AdminOverlay`, `Sidebar`, `PartySection` with strict `@roomies/contracts` types.
4. **Test Helpers Strict Typing**: Strongly type `testFixtures.ts` and `wsClient.ts`.
