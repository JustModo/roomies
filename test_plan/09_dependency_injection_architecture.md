# Modular Dependency Injection & Architecture Analysis — Roomies

## Executive Summary

The primary cause of test fragility, slow execution, hardcoded overrides, and complex helper machinery in `@roomies/test` is **the reliance on global module-level singletons and static import-time configuration** across `apps/api`, `@roomies/config`, and `@roomies/transcoding`.

To test the application today, tests must resort to:
- Mutating global `process.env` before module imports.
- Re-clearing global in-memory maps (`clearSocketRegistry()`, `resetConfig()`).
- Re-connecting and resetting proxy singletons (`resetPrismaClient()`, `roomStore.resetStore()`).
- Creating elaborate multi-layer helper factories (`testDatabase.ts`, `testServer.ts`, `testFixtures.ts`) to wire up test servers safely.

By refactoring `apps/api` and core packages to follow **Clean Architecture and Dependency Injection (DI)**, we eliminate global singleton pollution, make application instances 100% self-contained, and render most test helper abstractions completely redundant.

---

## 1. Comprehensive Audit of Global Singletons & Anti-Patterns

### 1.1 — Static Configuration Binding (`@roomies/config`)

**Current State**:
```ts
// packages/config/src/index.ts
export const config = loadConfig(); // Executed statically on module import!
export const { DATABASE_URL, CACHE_DIR, MEDIA_ROOT } = config;
```

**Problem**: Any package or API file importing `DATABASE_URL` or `CACHE_DIR` captures the value determined at the exact millisecond the Node process evaluated the file. Overriding environment variables or switching databases later requires clearing Node's module cache or creating custom reset functions.

---

### 1.2 — In-Memory Global Singletons (`apps/api` & `@roomies/transcoding`)

**Current State**:
```ts
// apps/api/src/room/store.ts
export const roomStore = new RoomStore(); // Global singleton!

// apps/api/src/websocket/router.ts
const socketRegistry = new Map<string, SocketEventHandler>(); // Global file-level Map!

// packages/transcoding/src/manager.ts
export const TranscodeSessionManager = new TranscodeSessionManagerImpl(); // Global singleton!

// apps/api/src/database/sqlite.ts
export const prisma = new Proxy(...); // Global Prisma Client proxy!
```

**Problem**:
1. Multiple server instances running in the same process (or sequentially in test files) share the **exact same `roomStore`**, **`socketRegistry`**, and **`TranscodeSessionManager`**.
2. Calling `roomStore.resetStore()` in a test resets state that a running server instance might be actively referencing.
3. Multiple calls to `bootstrap()` double-register socket handlers in the static `socketRegistry` map.
4. `TranscodeSessionManager` uses hardcoded `CACHE_DIR` imported from `@roomies/config`, preventing tests from isolating transcode output directories per app instance.

---

### 1.3 — Deep Application Imports & Path Aliasing

**Current State**:
Tests reach inside application source files using Vitest path aliases:
```ts
import { prisma } from '@roomies/server/src/database/sqlite';
import { roomStore } from '@roomies/server/src/room/store';
```

**Problem**: `@roomies/server` has no formal public API surface or package `exports`. Tests are directly coupled to internal file paths inside `apps/api/src/`, making refactoring brittle.

---

### 1.4 — Redundant Test Helper Complexity (`packages/test`)

Because the application code cannot be instantiated cleanly with custom configuration:
- `testDatabase.ts` spawns CLI subprocesses to run `prisma db push` and manages file paths manually.
- `testServer.ts` requires special `BootstrapOptions` (`skipLibraryScan`, `skipTranscodeClean`, `skipHardwareDetection`) to suppress side effects.
- `testFixtures.ts` creates 100+ lines of wrapper code to handle database creation, server creation, root admin setup, guest setup, and media seeding.

---

## 2. Scalable Modular Architecture & Dependency Injection Design

We will replace static singletons with an **Application Context (`AppContext`)** and **instantiable services**.

### 2.1 — The `AppContext` Interface

```ts
// apps/api/src/context.ts
import { PrismaClient } from '@prisma/client';
import { Config } from '@roomies/config';
import { RoomStore } from './room/store';
import { SocketRouter } from './websocket/router';
import { TranscodeSessionManager } from '@roomies/transcoding';

export interface AppContext {
  config: Config;
  prisma: PrismaClient;
  roomStore: RoomStore;
  socketRouter: SocketRouter;
  transcodeManager: TranscodeSessionManager;
}
```

### 2.2 — Fastify Application Factory (`createApp`)

Instead of a procedural `bootstrap(app)` function that mutates global state, `createApp` creates an isolated Fastify server bound to a specific `AppContext`:

```ts
// apps/api/src/app.ts
import fastify, { FastifyInstance } from 'fastify';
import { AppContext } from './context';
import { createDefaultContext } from './contextFactory';

export interface CreateAppOptions {
  context?: Partial<AppContext>;
  configOverrides?: Partial<Config>;
}

export async function createApp(options: CreateAppOptions = {}): Promise<FastifyInstance> {
  const context = await createDefaultContext(options);

  const app = fastify({ logger: false });

  // Decorate Fastify instance with its scoped AppContext
  app.decorate('ctx', context);

  // Register gateways, socket handlers, and HTTP routes passing `context`
  await registerRoutesAndGateways(app, context);

  app.addHook('onClose', async () => {
    context.transcodeManager.stopAll();
    await context.prisma.$disconnect();
  });

  return app;
}
```

---

### 2.3 — Service Class Refactoring with DI

Every service receives its dependencies through constructor or method parameters:

#### `RoomService`
```ts
export class RoomService {
  constructor(private ctx: AppContext) {}

  async handleJoin(payload: RoomJoinPayload, socketCtx: SocketContext) {
    this.ctx.roomStore.addMember({ ... });
    // ...
  }
}
```

#### `TranscodeSessionManager` (`packages/transcoding`)
```ts
export interface TranscodeManagerConfig {
  cacheDir: string;
  ffmpegPath: string;
  ffprobePath: string;
  videoCodec: string;
}

export class TranscodeSessionManager {
  constructor(private config: TranscodeManagerConfig) {}

  startSession(sessionId: string, mediaFileId: string, inputPath: string): TranscodeSession {
    const outputDir = path.join(this.config.cacheDir, sessionId, mediaFileId, uniqueRunId);
    // ...
  }
}
```

#### `@roomies/config` Configuration Loader
```ts
export class ConfigManager {
  static load(overrides: Partial<Config> = {}): Config {
    // Reads environment & config file, merges overrides cleanly
    return parsedConfig;
  }
}
```

---

## 3. Impact on Testing Infrastructure

### 3.1 — Elimination of Redundant Helpers

With `createApp({ configOverrides: { DATABASE_URL: testDbUrl, CACHE_DIR: tempCache } })`:

| Old Helper / Hack | Status after DI Refactoring |
|---|---|
| `clearSocketRegistry()` | ❌ **Removed** (Registry is per `SocketRouter` instance) |
| `resetConfig()` | ❌ **Removed** (Config is immutable per `AppContext` instance) |
| `resetPrismaClient()` | ❌ **Removed** (Prisma client is owned by `AppContext` instance) |
| `globalThis.testMediaFileId` | ❌ **Removed** (Scans and queries use instance context) |
| `testFixtures.ts` complex wiring | 🧹 **Simplified** to a 10-line helper `createTestApp()` |

### 3.2 — Ultra-Clean Test Suite Pattern

Tests become readable, self-contained, and **100% parallelizable**:

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createApp } from '@roomies/server';
import { createTestDb } from './helpers';

describe('Playback & Room Sync', () => {
  let app: FastifyInstance;
  let db: TestDb;

  beforeAll(async () => {
    db = await createTestDb();
    app = await createApp({
      configOverrides: {
        DATABASE_URL: db.url,
        CACHE_DIR: db.tempCacheDir,
      },
    });
    await app.listen({ port: 0 });
  });

  afterAll(async () => {
    await app.close();
    await db.cleanup();
  });

  it('handles room join', async () => {
    const client = await createTestWsClient(app);
    client.send('room.join');
    const state = await client.waitForEvent('room.state');
    expect(state.payload.room).toBeDefined();
  });
});
```

---

## 4. Phased Implementation Roadmap

1. **Phase 1: Config & Transcoding Decoupling** (`packages/config`, `packages/transcoding`)
   - Remove static hardcoded `CACHE_DIR` imports from `packages/transcoding`.
   - Make `TranscodeSessionManager` instantiable accepting `TranscodeManagerConfig`.

2. **Phase 2: Core Service Dependency Injection** (`apps/api`)
   - Implement `AppContext` and `createApp(options)`.
   - Convert `RoomStore`, `SocketRouter`, `SyncService`, `RoomService` to instantiable classes receiving `AppContext`.
   - Export `@roomies/server` public API from `apps/api/src/index.ts`.

3. **Phase 3: Test Infrastructure Simplification** (`packages/test`)
   - Simplify `testServer.ts` and `testDatabase.ts` to use `createApp()`.
   - Remove redundant teardown hacks (`clearSocketRegistry`, `resetConfig`, `resetPrismaClient`).
   - Enable full parallel test execution (`fileParallelism: true`).
