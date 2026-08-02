# Type Grouping, Modularization & Reusability Strategy

## Executive Summary

Currently, TypeScript types across the Roomies monorepo are scattered across individual source files, inline component definitions, and local helpers. This leads to:
1. **Duplicated Types**: `RoomState` and member properties are re-declared inline in web components (`Room.tsx`, `PartySection.tsx`, `AdminOverlay.tsx`).
2. **Inconsistent Exports**: API server context types (`AppContext`, `SocketContext`, `RoomSocket`) are split across `context.ts`, `router.ts`, and `app.ts`.
3. **Unclear Boundaries**: Shared domain models (`RoomSettings`, `VoicePeerState`, `MediaInfo`) are mixed with HTTP REST Zod schemas.

This document outlines a **3-Layer Type Hierarchy** to cleanly group, reuse, and centralize all project types.

---

## 1. Inventory of Littered & Duplicated Types

### 1.1 — Duplicated Domain Types Across `apps/web` and `@roomies/contracts`
- **`apps/web/src/pages/Room.tsx`**: Defines local inline state for members, media info, and playback status instead of importing `RoomState` and `MemberState` from `@roomies/contracts`.
- **`apps/web/src/components/Party/PartySection.tsx`**: Defines inline audio peer interfaces (`PeerAudioState`) that mirror server voice socket states.
- **`apps/web/src/components/AdminOverlay.tsx`**: Defines local interfaces for `AdminOverlayProps` and `Tab`.

### 1.2 — Fragmented Server Infrastructure Types (`apps/api`)
- **`apps/api/src/websocket/router.ts`**: Defines `SocketContext`, `RoomSocket`, `SocketEventHandler`.
- **`apps/api/src/context.ts`**: Defines `AppContext`, `AppContextOptions`.
- **`apps/api/src/app.ts`**: Defines `BootstrapOptions`, `CreateAppOptions`.
- **`apps/api/src/voice/gateway.ts`**: Defines `VoiceSocket` inline.

### 1.3 — Scattered Transcoding & Package Options (`packages/transcoding`)
- `Resolution`, `ResolutionConfig`, `HardwareEncoder` in `packages/transcoding/src/types.ts`.
- `TranscodeSettings`, `FfmpegPreset`, `HwAccelMode` in `packages/transcoding/src/settings.ts`.
- `TranscodeManagerOptions` in `packages/transcoding/src/manager.ts`.

---

## 2. The 3-Layer Type Grouping Strategy

```
┌─────────────────────────────────────────────────────────────┐
│ Layer 1: Global Domain Contracts (@roomies/contracts)      │
│  - HTTP API (contracts/api)                                 │
│  - WebSocket Protocol (contracts/socket)                    │
│  - Domain Models (contracts/domain: Room, Member, Media)     │
│  - Auth & Permissions (contracts/auth)                      │
└──────────────────────────────┬──────────────────────────────┘
                               │
      ┌────────────────────────┴────────────────────────┐
      ▼                                                 ▼
┌──────────────────────────────────┐  ┌──────────────────────────────────┐
│ Layer 2: Package Types           │  │ Layer 3: Application Types       │
│  - @roomies/transcoding/types    │  │  - apps/api/src/types/           │
│  - @roomies/library/types        │  │  - apps/web/src/types/           │
│  - @roomies/voice/types          │  │  - packages/test/src/types/      │
└──────────────────────────────────┘  └──────────────────────────────────┘
```

---

### Layer 1: Global Shared Domain Contracts (`@roomies/contracts`)

We re-structure `@roomies/contracts/src` into clean domain barrels:

```text
packages/contracts/src/
├── api/          # HTTP REST Schemas & Types (Auth, Library, Movies, Playback)
├── socket/       # WebSocket Protocol Schemas & Discriminated Unions
├── domain/       # Shared Domain Models (RoomState, MemberState, MediaInfo, VoicePeerState)
├── auth/         # JWTPayload, UserProfile, Role Definitions
└── index.ts      # Top-level unified barrel export
```

#### Shared Domain Models (`contracts/domain`)
Centralizes state models consumed by both API server state stores and React frontend hooks:
- `RoomState`, `MemberState`, `RoomSettings`, `PlaybackState`
- `MediaInfo`, `SubtitleTrack`
- `VoicePeerState`, `PartyState`

---

### Layer 2: Package-Internal Barrel Types

Each workspace package exports its internal configuration and option interfaces through a single `types.ts` barrel file:

#### `@roomies/transcoding/src/types.ts`
Centralizes:
- `TranscodeManagerOptions`
- `TranscodeSettings`, `FfmpegPreset`, `HwAccelMode`
- `Resolution`, `ResolutionConfig`, `HardwareEncoder`

#### `@roomies/voice/src/types.ts`
Centralizes:
- `VoiceServerConfig`, `VoicePeerConfig`
- `AudioRelayEvents`

---

### Layer 3: Application-Specific Type Grouping

#### `apps/api/src/types/` (Server Infrastructure Types)
```text
apps/api/src/types/
├── context.ts    # AppContext, AppContextOptions, ServiceContainer
├── socket.ts     # RoomSocket, SocketContext, SocketEventHandler
├── server.ts     # CreateAppOptions, BootstrapOptions
└── index.ts      # Barrel export
```

#### `apps/web/src/types/` (UI & Hook State Types)
```text
apps/web/src/types/
├── player.ts     # Video player gesture, quality, subtitle state types
├── hooks.ts      # Hook options (UseRoomSyncOptions, UseAsyncPlaybackOptions)
├── ui.ts         # Overlay props, modal types, tab enums
└── index.ts      # Barrel export
```

---

## 3. Action Plan & Roadmap

1. **Re-organize `@roomies/contracts`**:
   - Create `packages/contracts/src/domain/` for `RoomState`, `MemberState`, `RoomSettings`, `PlaybackState`, `MediaInfo`, `VoicePeer`.
   - Export all domain types cleanly from `@roomies/contracts`.
2. **Group Server Types (`apps/api`)**:
   - Consolidate `AppContext`, `SocketContext`, `RoomSocket`, `CreateAppOptions` in `apps/api/src/types/`.
3. **Group Web UI Types (`apps/web`)**:
   - Consolidate component props, hook options, and player states in `apps/web/src/types/`.
4. **Clean Barrel Exports**:
   - Update all imports across `apps/api`, `apps/web`, and `packages/test` to import from unified barrel files.
