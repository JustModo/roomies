# Test Infrastructure Analysis — Roomies

> **Scope**: Full audit of `packages/test`, every helper, every test suite, and the production code they couple against.  
> **Intent**: Document-only. No code changes. This file is the single source of truth for what needs to be fixed before testing is reliable.

---

## Table of Contents

1. [Critical Architectural Violations](#1-critical-architectural-violations)
2. [Import Leakage & Coupling](#2-import-leakage--coupling)
3. [Test vs. Real Environment Discrepancies](#3-test-vs-real-environment-discrepancies)
4. [Test Quality & Design Problems](#4-test-quality--design-problems)
5. [Infrastructure & Configuration](#5-infrastructure--configuration)
6. [Proposed Remediation — What to Build](#6-proposed-remediation--what-to-build)
7. [Priority Table](#7-priority-table)

---

## 1. Critical Architectural Violations

### 1.1 — Global Singleton State Shared Between Tests and the Running Server

**Files:** `packages/test/src/suites/playback_sync.test.ts`, `playback_async.test.ts`  
**Production file:** `apps/api/src/room/store.ts`

```ts
// store.ts — exported singleton, shared by the live server and every test
export const roomStore = new RoomStore();
```

```ts
// playback_sync.test.ts — tests import and reset it directly
import { roomStore } from '@roomies/server/src/room/store';

beforeEach(() => {
  roomStore.resetStore();   // ← resets state the live test server is actively using
});
```

**Why this is dangerous:**
- `roomStore.resetStore()` wipes members, playback state, settings — while the test server's WebSocket gateway may be mid-operation reading the same object.
- If any test crashes before `afterAll`, the store leaks contaminated state into the *next* test file. Because `fileParallelism: false`, all suites run in the **same process** sequentially.
- The `socketRegistry` in `apps/api/src/websocket/router.ts` is the same pattern — a module-level `Map` that accumulates handlers. Each `bootstrap()` call re-registers handlers onto it. A second suite calling `bootstrap()` **does not clear old handlers** — they double-register (effectively overwriting since it's a Map, but the intent is fragile).
- `TranscodeSessionManager` (also a module-level singleton in `@roomies/transcoding`) retains active FFmpeg sessions across suites.

**Root cause:** Zero dependency injection. All three critical stateful objects (`roomStore`, `socketRegistry`, `TranscodeSessionManager`) are singletons with no factory or reset surface exposed for test isolation.

---

### 1.2 — `process.env.DATABASE_URL` Is Set After Config Is Already Loaded

**File:** `packages/test/src/helpers/testDatabase.ts`

```ts
// testDatabase.ts — line 17
process.env.DATABASE_URL = databaseUrl;  // set AFTER module system has already loaded
```

**The problem in detail:**

`@roomies/config` executes `loadConfig()` at **module import time**:

```ts
// packages/config/src/index.ts
export const config = loadConfig();   // runs immediately on first import
export const { DATABASE_URL } = config;  // captured as a static value
```

By the time `createTestDatabase()` sets `process.env.DATABASE_URL`, the config module has already been imported by Vitest's module cache (pulled in transitively through the test helpers), so its `DATABASE_URL` constant is already resolved to the value in `config/roomies.conf` — **not** the test temp file.

Meanwhile, `apps/api/src/database/sqlite.ts` does this:

```ts
// sqlite.ts — line 9
const currentUrl = process.env.DATABASE_URL || DATABASE_URL;
```

This is dynamic (re-reads `process.env` on every `getPrisma()` call), so it *does* pick up the test URL — but only if `getPrisma()` hasn't been called yet. If any module import triggered it before `createTestDatabase()` ran, the singleton is already bound to the wrong database.

**Additional cost:** `createTestDatabase()` calls `execSync('npx prisma db push')` synchronously. This is 2–5 seconds of cold-start time **per suite** that calls it. With 4 suites needing a DB, that's 8–20 seconds of pure overhead before any test runs.

---

### 1.3 — `testServer.ts` Reaches Deep Into Private Application Internals

**File:** `packages/test/src/helpers/testServer.ts`

```ts
// testServer.ts — line 12
const { bootstrap } = await import('@roomies/server/src/bootstrap');
```

`@roomies/server` is `apps/api` — an **application**, not a library. It has no `exports` field in its `package.json`. The Vitest config hacks around this with a path alias:

```ts
// vitest.config.ts
'@roomies/server': path.resolve(__dirname, '../../apps/api'),
```

This means `@roomies/server/src/bootstrap` resolves to `apps/api/src/bootstrap/index.ts` — a deep internal path. Consequences:

- Any internal refactor of `apps/api/src/` (e.g., renaming files, restructuring folders) silently breaks every test with a module-not-found error.
- There is no TypeScript validation that this import is valid — `tsconfig.json` for the test package has no `paths` entry for `@roomies/server`.
- The type resolution (TypeScript) and runtime resolution (Vitest/Node) are diverged.

---

### 1.4 — `bootstrap()` Is Destructive and Non-Idempotent in Tests

**File:** `apps/api/src/bootstrap/index.ts`

Every time `createTestServer()` is called (once per test suite), `bootstrap(app)` executes these side effects **unconditionally**:

| Step | What happens | Why it's bad in tests |
|---|---|---|
| `TranscodeCache.cleanGlobalCache()` | Deletes everything in `CACHE_DIR` recursively | **Deletes the real dev cache** on the developer's machine |
| `prisma.$connect()` | Connects to whatever DB is currently resolved | May connect to the wrong DB (see §1.2) |
| `initializeConfig()` → `detectHardwareEncoder()` | Spawns an FFmpeg subprocess to probe GPU caps | Slow, depends on FFmpeg binary existing, always runs even for HTTP-only tests |
| `LibraryService.scanLibrary(prisma)` if `movieCount === 0` | Scans `MEDIA_ROOT` recursively | Scans the real media directory, inserts rows into the test DB, slow, fails in CI without media |
| `registerSocketEvent(...)` × 6 | Populates the global `socketRegistry` | Accumulates if called multiple times; no clear between suites |

None of these are conditional, reversible, or injectable. A second `bootstrap()` call in the same process will re-execute all of them on top of the first.

---

## 2. Import Leakage & Coupling

### 2.1 — Tests Import Server-Internal Modules Directly

Every test file that needs a database or store access imports from private `apps/api/src/` paths:

```ts
// Used in playback_sync.test.ts, playback_async.test.ts, library.test.ts
import { prisma } from '@roomies/server/src/database/sqlite';
import { roomStore } from '@roomies/server/src/room/store';
import { SYNC_CONFIG } from '@roomies/server/src/config';
```

**What this causes:**

1. **Tests bypass the public HTTP/WS API** to seed data via the ORM. This is inconsistent — if the seeding route changes, the test DB state is correct but the API path tested diverges from how real data gets created.

2. **Tests assert on internal server state** that no real client ever observes:
   ```ts
   // playback_sync.test.ts
   const state = roomStore.getState();
   expect(state.mediaId === '' || state.mediaId === null).toBe(true);
   ```
   A real client would verify this via a WebSocket `room.state` event or an HTTP GET — not by reading in-process store memory.

3. **`SYNC_CONFIG` values are tested as literal constants**, not as behavior:
   ```ts
   it('evaluates negative soft drift configuration', () => {
     expect(SYNC_CONFIG.SOFT_THRESHOLD_MS).toBe(500);
   });
   ```
   This test fails if a developer changes the threshold from 500ms to 400ms — even if the drift correction behavior is provably correct at the new value. Constants tests are not the same as behavior tests.

---

### 2.2 — Vitest Path Aliases Diverge from TypeScript's View

```ts
// packages/test/vitest.config.ts
alias: {
  '@roomies/web': path.resolve(__dirname, '../../apps/web'),   // never used in any test
  '@roomies/server': path.resolve(__dirname, '../../apps/api'),
},
```

```json
// packages/test/tsconfig.json — has NO paths entries for these aliases
```

Runtime (Vitest) resolves `@roomies/server` → `apps/api`. TypeScript resolves it differently (or fails). The `@roomies/web` alias is dead — no test file imports from it.

---

### 2.3 — `globalThis` Used as a Cross-Test Data Store

```ts
// playback_sync.test.ts — line 66
(globalThis as any).testMediaFileId = mediaFile.id;

// playback_sync.test.ts — line 71 (inside beforeEach)
roomStore.updateMedia((globalThis as any).testMediaFileId, 'Mock Movie', ...);
```

This is an untyped global variable. It:
- Has no TypeScript type safety (uses `as any`)
- Could leak between test files when files run sequentially in the same process
- Is semantically identical to a module-level `let` — except worse, because it's invisible to TypeScript

The correct pattern is a scoped `let mediaFileId: string` in the `describe` block's closure.

---

## 3. Test vs. Real Environment Discrepancies

### 3.1 — The Config System Has No Test Mode

`@roomies/config` loads configuration at import time from `config/roomies.conf`. There is no mechanism to override this for tests. The divergence:

| Value | Production source | Test (actual) | Test (should be) |
|---|---|---|---|
| `DATABASE_URL` | `config/roomies.conf` or `process.env` | `process.env` set **after** config loads | Set in `globalSetup` before any import |
| `MEDIA_ROOT` | `config/roomies.conf` | **Real `media/` dir — never overridden** | A temp directory |
| `CACHE_DIR` | `config/roomies.conf` | **Real `cache/` dir — gets deleted** | A temp directory |
| `FFMPEG_PATH` | `config/roomies.conf` | **Real binary — subprocess spawned** | A no-op like `echo` |
| `NODE_ENV` | Set externally | Not explicitly set in tests | `test` |

The config loader does support `ROOMIES_CONFIG_PATH` env var to override the config file path — but the test package never uses it. A test-specific `roomies.conf` pointed to via `ROOMIES_CONFIG_PATH` (set in a `globalSetup` before any module loads) would solve most of these in one step.

---

### 3.2 — The Library Scanner Runs Against the Real Media Directory

When `bootstrap()` is called in a fresh test DB (`movieCount === 0`, which is always true), it calls:

```ts
// bootstrap/index.ts
await LibraryService.scanLibrary(prisma);
```

This scans `MEDIA_ROOT` (the real `/media` or dev `media/` directory) and inserts entries into the **test** SQLite database. This:

- Populates the test DB with rows that tests don't expect or control
- Makes tests implicitly depend on the state of the dev machine's media folder
- Fails in CI if `MEDIA_ROOT` doesn't exist or is empty
- Is slow (filesystem walk)

Tests that later seed their own library/movie/mediaFile via `prisma.library.create(...)` may get unexpected query results because additional rows exist from the scan.

---

### 3.3 — The Prisma Client Cannot Be Reset Cleanly Between Suites

`sqlite.ts` wraps a lazy singleton:

```ts
let clientInstance: PrismaClient | null = null;
let clientUrl: string | null = null;

export function getPrisma(): PrismaClient {
  const currentUrl = process.env.DATABASE_URL || DATABASE_URL;
  if (!clientInstance || clientUrl !== currentUrl) {
    if (clientInstance) {
      clientInstance.$disconnect().catch(() => {}); // fire-and-forget
    }
    // ...creates new client
  }
  return clientInstance;
}
```

Between test suites, when a new `createTestDatabase()` sets a new `process.env.DATABASE_URL`, `getPrisma()` will detect the URL change and create a new client — but the old client's `$disconnect()` is fire-and-forget with a swallowed error. In practice this can produce:

- Write-after-close warnings in test output
- Uncommitted transactions on the old client
- Undefined behavior with `@prisma/adapter-libsql` which may not support mid-process URL switching

---

### 3.4 — JWT Secrets Are Empty Until `bootstrap()` Fully Completes

```ts
// config/index.ts
export const Config = {
  JWT_SECRET: '',          // empty string at module load time
  JWT_REFRESH_SECRET: '',
};
```

`Config.JWT_SECRET` is only populated after `initializeConfig()` runs inside `bootstrap()`. If any code path reads `Config.JWT_SECRET` before `bootstrap()` finishes (e.g., in a test that calls an auth route before the server is fully up), it gets an empty string, and JWT signing silently produces invalid tokens.

Also: since every test suite creates a fresh database, `initializeConfig()` generates **new random secrets** per suite. This is correct behavior — but it means tokens from a previous `beforeAll` are invalid in the next suite. The suites don't share tokens, so this doesn't manifest as a bug today, but it would if tests were ever restructured to share a server instance.

---

### 3.5 — Auth Middleware Does a DB Round-Trip on Every Authenticated Request

```ts
// apps/api/src/auth/middleware.ts
const currentSession = await prisma.refreshToken.findFirst({ where: { userId: decoded.userId } });
if (!currentSession || currentSession.id !== decoded.sessionId) {
  return reply.status(401).send({ error: 'Unauthorized' });
}
```

Every authenticated HTTP request and WebSocket connection hits the database to validate the session. In tests this means:

- Every `Authorization: Bearer ...` call queries `RefreshToken` — adding latency and DB load
- If the DB is in a bad state (failed migration, locked file), all auth silently returns 401
- Tests that manipulate `RefreshToken` rows directly (for session rotation testing) will cascade-invalidate other tests' tokens if they share a server

This is correct production behavior (single-session-per-account enforcement) — but it creates tight coupling between DB state and auth correctness in tests.

---

## 4. Test Quality & Design Problems

### 4.1 — ~50-Line Setup Block Is Copy-Pasted Across 3 Suites

The `beforeAll` in `playback_sync.test.ts` (lines 17–67) is nearly identical to `playback_async.test.ts` (lines 16–65) and `websocket.test.ts` (lines 12–42).

Each one manually:
1. Creates a mock media directory
2. Creates and migrates a test database
3. Seeds a `Library` → `Movie` → `MediaFile` via direct Prisma calls
4. Starts a test server via `createTestServer()`
5. POSTs to `/api/auth/setup` to create the root admin
6. POSTs to `/api/users/guest` to create a guest user
7. POSTs to `/api/auth/login` to get the guest token

Any change to the auth flow or user creation API requires updating all 3 files. This already causes divergence — `playback_sync.test.ts` uses `guestuser`/`guestpassword123`, `playback_async.test.ts` uses `asyncguest`/`guestpassword123`, `websocket.test.ts` uses `wsuser`/`wspassword123`. All functionally identical but hard to trace.

---

### 4.2 — Many Tests Have Assertions That Can Never Fail

```ts
// playback_async.test.ts — lines 530-538
it('asserts garbage collection handling for idle sessions', async () => {
  const state = roomStore.getState();
  expect(state).toBeDefined();          // RoomStore always returns an object
});

it('verifies async session cleanup routines', async () => {
  const state = roomStore.getState();
  expect(state.members).toBeDefined();  // members is always initialized as []
});
```

```ts
// playback_sync.test.ts — line 354-356
it('recovers buffering state when a disconnected member leaves', async () => {
  // ... setup ...
  const state = roomStore.getState();
  expect(state).toBeDefined();          // Will never fail regardless of what happened
});
```

These tests provide **zero signal**. They pass even if the feature they claim to validate is completely broken. They inflate the test count without improving confidence.

---

### 4.3 — Tests Assert on Internal In-Process State Instead of Observable API Behavior

A recurring pattern across both playback suites:

```ts
// playback_sync.test.ts
const state = roomStore.getState();
expect(state.playback.state).toBe('paused');        // reads server-internal store
expect(state.settings.allowAsyncMode).toBe(true);  // reads server-internal settings
expect(state.members.length).toBe(0);               // reads server-internal members
```

Real clients observe behavior through:
- HTTP response bodies
- WebSocket events (`room.state`, `playback.state`, `user.status_changed`)

Tests that read `roomStore` directly would pass even if the WebSocket broadcast was broken — the store might be correct but the client would never receive the event. These tests don't catch a broken emitter.

---

### 4.4 — Multi-Client Tests Have Silent Race Conditions

```ts
// playback_sync.test.ts — lines 315-332
client1.send('sync.status', { status: 'ready' });
client2.send('sync.status', { status: 'buffering' });

const status1 = await client1.waitForEvent('user.status_changed');
expect(status1).toBeDefined();
```

`waitForEvent('user.status_changed')` on `client1` searches by **event name only**. When `client2` sends its `sync.status`, the server broadcasts `user.status_changed` to **all** room members — including `client1`. So `status1` may receive `client2`'s status change event, not `client1`'s own.

The test "passes" because:
1. Some `user.status_changed` event is received (even if it belongs to client2)
2. `expect(status1).toBeDefined()` is a trivially-passing assertion

A correct implementation would use `waitForEventMatching('user.status_changed', msg => msg.payload.userId === client1UserId)` — but `wsClient.ts` doesn't have that API, and tests don't filter by `userId`.

---

### 4.5 — `waitForEvent` Has a Queue/Listener Race Condition Bug

**File:** `packages/test/src/helpers/wsClient.ts`

```ts
// wsClient.ts — lines 27-31
const existingIdx = receivedMessages.findIndex((m) => m.event === eventName);
if (existingIdx !== -1) {
  const [msg] = receivedMessages.splice(existingIdx, 1);  // removes from queue
  return res(msg);                                         // resolves promise
}
```

Then, when a new message arrives:

```ts
// wsClient.ts — lines 62-72
ws.on('message', (data) => {
  const parsed = JSON.parse(data.toString());
  receivedMessages.push(parsed);           // adds to shared queue
  for (const listener of [...messageListeners]) {
    listener(parsed);                      // notifies all listeners
  }
});
```

**The bug:** `receivedMessages` is a shared array between all concurrent `waitForEvent` calls on the same client. If two `waitForEvent` calls for different event names are pending simultaneously:

1. Message arrives → `receivedMessages.push(parsed)` → listener array fires
2. Listener A (waiting for event X) sees the message doesn't match — passes
3. Listener B (waiting for event Y) also checks — passes
4. Both listeners remain registered
5. Next message arrives — it's event X
6. Listener A removes it from `receivedMessages` and resolves
7. **But the message was also dispatched to Listener B via the listener loop** — Listener B fires again on the same message

The promise re-resolution is silently swallowed by JavaScript (a Promise can only settle once), but it means a message is being consumed by the wrong waiter. The `receivedMessages` splice and the listener dispatch are not atomic, creating a window where the same message is visible to both the queue-check branch and any concurrently-registered listener.

---

### 4.6 — `subtitles.test.ts` Tests a Copy of the Logic, Not Production Code

```ts
// subtitles.test.ts — lines 6-41
function parseAssDialogueTag(text: string) {
  let alignment = 2;
  let primaryColor: string | null = null;
  // ... full implementation ...
}

describe('Custom Subtitle Tag Engine & ASS Parser', () => {
  it('parses ASS numpad alignment tags ...', () => {
    const parsed = parseAssDialogueTag(`{\\an${i}}Test Dialogue`);
    // ...
  });
});
```

The parser function being tested is **defined inside the test file**. No import of any production module. This is testing a local copy of the logic. If the real subtitle parser in the application changes, these tests will still pass — they don't catch any regression in production code. This file should import the real parser.

---

### 4.7 — `transcoding.test.ts` Deletes the Real Dev Cache as a Side Effect

```ts
// transcoding.test.ts — lines 15-19
it('cleans global transcode cache without throwing', () => {
  expect(() => {
    TranscodeCache.cleanGlobalCache();
  }).not.toThrow();
});
```

`TranscodeCache.cleanGlobalCache()` runs `fs.rmSync(CACHE_DIR, { recursive: true })` — deleting the actual `CACHE_DIR` configured in `@roomies/config`, which resolves to the `cache/` directory in the project root during development. Any developer-cached transcode segments are deleted every time the test suite runs.

Beyond this test, `bootstrap()` itself calls `cleanGlobalCache()` — so this happens regardless, but the transcoding test makes it explicit and intentional-looking.

The three actual assertions in this file are:
1. `RESOLUTION_PRESETS['1080p']` is defined and has `width === 1920`
2. `RESOLUTION_PRESETS['720p']` and `['360p']` similarly
3. `cleanGlobalCache()` does not throw
4. Bitrate values match expected strings

No transcoding behavior is tested. This is a constant-value test suite, not a behavior test suite.

---

### 4.8 — `playback_sync.test.ts` Line 576 Waits for `media.changed` Before `playback.state` in the Wrong Order

```ts
// playback_sync.test.ts — lines 574-581 (the "full lifecycle" integration test)
client.send('playback.seek', { position: 100 });
await client.waitForEvent('media.changed');      // expects seek to trigger media.changed
await client.waitForEvent('playback.state');
```

Looking at `handleRoomSeek` in `apps/api/src/playback/service.ts`, the server **does** broadcast `media.changed` before `playback.state` on a seek. However:

1. `waitForEvent` removes the message from the shared queue when found — so a `media.changed` that arrived before the `waitForEvent` call starts *will* be consumed correctly. But if `playback.state` arrives first (network jitter or async scheduling), the `playback.state` sits in the queue while we wait for `media.changed`, then the next `waitForEvent('playback.state')` picks it up correctly from the queue.

This is actually a case where the queue behavior works — but it depends on event ordering that the test implicitly assumes. The broader issue is that the queue is consuming messages globally without the caller specifying which *instance* of the event they care about.

---

### 4.9 — `contracts.test.ts` Only Covers the Absolute Minimum

```ts
describe('Contracts & Schemas', () => {
  it('validates correct login request payload', () => { ... });          // happy path
  it('rejects invalid login request payload missing password', () => { ... }); // 1 negative
  it('validates guest user creation payload', () => { ... });           // happy path
  it('validates change media request payload', () => { ... });          // happy path
});
```

No boundary value testing, no extra-field rejection, no type coercion edge cases (e.g., numeric string where number is expected), no nested validation errors. Schema tests are quick to write and provide high value — this file should be extended.

---

## 5. Infrastructure & Configuration

### 5.1 — No `setupFiles` or `globalSetup` in `vitest.config.ts`

```ts
// packages/test/vitest.config.ts — full config
export default defineConfig({
  resolve: { alias: { ... } },
  test: {
    globals: true,
    environment: 'node',
    testTimeout: 20000,
    hookTimeout: 20000,
    include: ['src/suites/**/*.test.ts'],
    fileParallelism: false,
    server: { deps: { fallbackCjs: true } },
  },
});
```

There is no `globalSetup` (runs once before any test file) and no `setupFiles` (runs before each test file). Without these, every test suite is responsible for bootstrapping its own environment — leading to the duplicated `beforeAll` blocks and the `process.env` mutation-after-import problem.

Vitest's `globalSetup` is the correct place to:
- Set `ROOMIES_CONFIG_PATH` to a test config before any module is imported
- Create shared temp directories
- Ensure CI-safe defaults

---

### 5.2 — `fileParallelism: false` Symptom, Not Fix

`fileParallelism: false` forces all test files to run sequentially in a single process. This was set because the global singletons (`roomStore`, `socketRegistry`, DB) cannot be safely isolated between parallel workers. It's a workaround for the real problem (§1.1, §1.2). With proper process isolation (`pool: 'forks'` in Vitest), each file would run in its own Node process with a fresh module cache, eliminating the singleton pollution problem entirely — but only after the test environment setup (§3.1) is fixed so each forked process gets the right DB URL before any module imports.

Current consequence: the full test suite is completely serial. Adding more tests linearly increases total runtime.

---

### 5.3 — 20-Second Timeouts Mask Regressions

```ts
testTimeout: 20000,
hookTimeout: 20000,
```

A test that should pass in 100ms is allowed to silently degrade to 19,999ms. The `hookTimeout` of 20s is driven by the `npx prisma db push` call (2–5s per suite). Once that's removed, `hookTimeout` can drop to 5s and `testTimeout` to 8s for WS-heavy tests, exposing performance regressions early.

---

### 5.4 — `server.deps.fallbackCjs: true` Is a CJS/ESM Compat Smell

```ts
server: {
  deps: {
    fallbackCjs: true,
  },
},
```

This tells Vitest to fall back to treating modules as CommonJS if they don't export ESM properly. It's a workaround for mixed module formats in the dependency tree. The `@prisma/adapter-libsql` or `@libsql/client` package is the likely culprit. This should be tracked down and fixed at the source (properly exporting ESM) rather than papered over.

---

### 5.5 — `@roomies/server` Is a `dependency`, Not a `devDependency`

```json
// packages/test/package.json
"dependencies": {
  "@roomies/server": "workspace:*",
  ...
}
```

The `@roomies/test` package is a private test-only package. Everything it depends on should be in `devDependencies`. Having production `dependencies` in a test-only package is misleading and could cause issues if the package is ever built or published.

---

### 5.6 — `@roomies/web` Alias Is Dead Code in the Vitest Config

```ts
alias: {
  '@roomies/web': path.resolve(__dirname, '../../apps/web'),  // no test imports this
  '@roomies/server': path.resolve(__dirname, '../../apps/api'),
},
```

No test file imports from `@roomies/web`. The alias is unused and should be removed to reduce confusion.

---

## 6. Proposed Remediation — What to Build

> All items are documentation-only here. No code in this file.

### Layer 1 — Fix the Test Environment (P0, highest priority)

**New file: `packages/test/src/setup/global.ts`** (Vitest `globalSetup`)
- Runs **once** before any test file, before any module is imported
- Creates a temp directory with a test-specific `roomies.conf`:
  - `DATABASE_URL` pointing to a temp SQLite file (or left blank for per-suite creation)
  - `MEDIA_ROOT` pointing to a temp directory
  - `CACHE_DIR` pointing to a temp directory
  - `FFMPEG_PATH=echo` (no-op subprocess)
- Sets `process.env.ROOMIES_CONFIG_PATH` to the test config path
- Sets `process.env.NODE_ENV=test`
- Exports `setup()` and `teardown()` for Vitest to call

**New file: `packages/test/src/setup/env.ts`** (Vitest `setupFiles`)
- Runs before each test file, after `globalSetup` but before any test imports
- Guards against any remaining unsafe env state
- Can reset module-level state that can be safely reset between files

**Modify: `packages/test/vitest.config.ts`**
- Add `globalSetup: ['src/setup/global.ts']`
- Add `setupFiles: ['src/setup/env.ts']`
- Change `pool: 'forks'` with `poolOptions.forks.isolate: true` (each file = fresh process = fresh module cache)
- Reduce `testTimeout` to `10000` and `hookTimeout` to `8000`
- Remove `server.deps.fallbackCjs` once ESM issues are fixed
- Remove the `@roomies/web` dead alias

---

### Layer 2 — Refactor Test Helpers (P1)

**Modify: `packages/test/src/helpers/testDatabase.ts`**
- Remove the `process.env.DATABASE_URL = ...` side effect — this must be done in `globalSetup` before any import
- Return the `PrismaClient` instance from `createTestDatabase()` directly (currently only returns `dbPath`, forcing callers to re-import from server internals)
- Add `options.skipPush` flag (for suites that don't need the schema, e.g., unit tests)
- Properly surface `prisma db push` errors instead of swallowing them silently with `catch {}`

**Modify: `packages/test/src/helpers/testServer.ts`**
- Accept a `BootstrapOptions`-equivalent object: `{ skipLibraryScan, skipTranscodeClean, skipHardwareDetection }`
- Pass through to `bootstrap()` (requires `bootstrap()` to accept these options too)

**New file: `packages/test/src/helpers/testFixtures.ts`**
- Centralizes all the duplicated `beforeAll` setup logic:
  - `createAdminUser(baseUrl: string): Promise<{ token: string }>` — POSTs to `/api/auth/setup`
  - `createGuestUser(baseUrl: string, adminToken: string, username: string): Promise<{ token: string }>` — creates + logs in
  - `createTestMediaFile(prisma: PrismaClient, mockMedia: MockMediaDir): Promise<{ library, movie, mediaFile }>` — seeds DB
- Eliminates the ~50-line copy-pasted block from 3+ suites

**Modify: `packages/test/src/helpers/wsClient.ts`**
- Fix the queue/listener dual-trigger bug: before notifying listeners, check if any listener resolved the promise and removed the message; use a flag or remove from `receivedMessages` before dispatching to listeners
- Add `waitForEventMatching<T>(eventName: string, predicate: (msg: T) => boolean, timeoutMs?: number): Promise<T>` — allows multi-client tests to filter by `userId` or any payload field
- Add TypeScript generics to `waitForEvent<T>` for typed return values
- Add `getAllReceived(): any[]` for test debugging

---

### Layer 3 — Fix Production Code for Testability (P1)

> These are the **only** production code changes required. They are purely additive — no existing behavior changes.

**Modify: `apps/api/src/bootstrap/index.ts`**
- Add `BootstrapOptions` interface:
  ```ts
  interface BootstrapOptions {
    skipTranscodeClean?: boolean;   // don't delete CACHE_DIR
    skipLibraryScan?: boolean;      // don't scan MEDIA_ROOT
    skipHardwareDetection?: boolean; // don't spawn FFmpeg for GPU detection
  }
  ```
- Gate each side effect behind the corresponding flag
- Default all flags to `false` so production behavior is 100% unchanged

**Modify: `apps/api/src/config/index.ts`**
- Make `initializeConfig()` accept `{ skipHardwareDetection?: boolean }` and skip `initTranscodeSettings()` when set

**Modify: `apps/api/src/websocket/router.ts`**
- Export `clearSocketRegistry(): void` that clears the handler `Map`
- Call this in test `afterAll` to prevent handler accumulation across suites

**Modify: `apps/api/src/database/sqlite.ts`**
- Export `resetPrismaClient(): Promise<void>` that disconnects and nulls `clientInstance`
- Call this in test `afterAll` for clean teardown

---

### Layer 4 — Fix Test Suites (P2)

**All suites using `globalThis`:**
- Replace `(globalThis as any).testMediaFileId` with a properly-typed `let mediaFileId: string` in the `describe` closure

**All suites using `roomStore.getState()` for assertions:**
- Remove — replace with assertions on HTTP responses or WebSocket event payloads

**All suites with weak `expect(x).toBeDefined()` on always-truthy values:**
- Replace with meaningful assertions that can actually fail (e.g., check specific field values, lengths, or state transitions)

**Multi-client tests:**
- Use `waitForEventMatching('user.status_changed', msg => msg.payload.userId === expectedId)` instead of `waitForEvent('user.status_changed')`

**`subtitles.test.ts`:**
- Find where `parseAssDialogueTag` (or its equivalent) lives in production code
- Import it instead of re-implementing it inline

**`transcoding.test.ts`:**
- Override `CACHE_DIR` to a temp directory before calling `cleanGlobalCache()`
- Or inject a temp directory into `TranscodeCache` for the duration of the test

**All suites — use `testFixtures`:**
- Replace duplicated `beforeAll` blocks with calls to `createAdminUser`, `createGuestUser`, `createTestMediaFile`

---

### Layer 5 — Documentation (P3)

**New file: `packages/test/README.md`**
- Explain that `globalSetup` must run before any module import — why the ordering matters
- List which suites require a DB, which require a server, which are pure unit tests
- Document the `waitForEventMatching` API and when to use it vs `waitForEvent`
- Document which env vars must be set and by what mechanism

---

## 7. Priority Table

| Priority | Issue | File(s) | Risk if Left | Est. Effort |
|---|---|---|---|---|
| **P0** | `process.env.DATABASE_URL` set after config loads | `testDatabase.ts`, `config/index.ts` | Tests silently hit real DB in CI | 2h |
| **P0** | Config has no test mode (`MEDIA_ROOT`, `CACHE_DIR`, `FFMPEG_PATH`) | `vitest.config.ts`, new `global.ts` | Cache deleted, real media scanned | 3h |
| **P0** | Library scanner runs on real media in `bootstrap()` | `bootstrap/index.ts`, `testServer.ts` | Slow, fails in CI, pollutes test DB | 2h |
| **P1** | Global singleton pollution (`roomStore`, `socketRegistry`) | `store.ts`, `router.ts`, test suites | Flaky, order-dependent tests | 4h |
| **P1** | ~50-line `beforeAll` duplicated across 3 suites | `playback_sync`, `playback_async`, `websocket` | Maintenance burden, drift | 2h |
| **P1** | Tests import server internals directly | All test files | Refactor silently breaks tests | 3h |
| **P1** | `testDatabase.ts` doesn't return a prisma client | `testDatabase.ts` | Re-import hack coupling | 1h |
| **P2** | `waitForEvent` has queue/listener race condition | `wsClient.ts` | Intermittent false positives | 1h |
| **P2** | Multi-client tests have silent event pollution | `playback_sync`, `playback_async`, `websocket` | False positives in multi-user tests | 2h |
| **P2** | Trivially-passing assertions | `playback_async.test.ts`, `playback_sync.test.ts` | Zero signal tests | 3h |
| **P2** | Internal state assertions (`roomStore.getState()`) | `playback_sync`, `playback_async` | Tests don't catch broken emitters | 3h |
| **P3** | `subtitles.test.ts` tests a copy, not production code | `subtitles.test.ts` | Regressions in real parser go undetected | 1h |
| **P3** | `transcoding.test.ts` deletes real cache directory | `transcoding.test.ts` | Destructive side effect on dev machine | 1h |
| **P3** | `fileParallelism: false` — serial test suite | `vitest.config.ts` | Slow CI (can only fix after P0/P1) | 1h |
| **P4** | `contracts.test.ts` has no edge case coverage | `contracts.test.ts` | Low schema validation confidence | 2h |
| **P4** | `@roomies/server` in `dependencies` not `devDependencies` | `packages/test/package.json` | Misleading, potential publish issues | 15min |
| **P4** | Dead `@roomies/web` alias in vitest config | `vitest.config.ts` | Confusion | 5min |
