# Development Log

This is the append-only log of the Watch Party project. 
All agents must append their progress, decisions, and skipped items here after completing a work session.

---

## [2026-07-05] Initial Architecture & Scaffolding
**Agent**: Antigravity
**Summary of Work Done**:
- Scaffolded the pnpm + Turborepo monorepo with strict feature separation across `apps/api`, `apps/web`, and `packages/`.
- Bootstrapped Fastify backend with plugins (`@fastify/cors`, `@fastify/websocket`).
- Configured Prisma 7 ORM connecting to Postgres. Built schemas for `User`, `Library`, `MediaFile`, `PlaybackSession`, `Settings`, and `RefreshToken`.
- Configured Redis OM connecting to Redis. Built transient schemas for `presence`, `chat`, `playbackState`, and `socketSession`.
- Implemented `AuthService` and `AuthController` for JWT-based Login/Register flows.
- Built the WebSocket Gateway (`apps/api/src/websocket/gateway.ts`).
- Created Zod discriminated unions in `packages/contracts/src/socket/index.ts` to strictly type and validate incoming/outgoing WS payloads (e.g. `client.play`, `server.chat`).
- Documented API integration flow for the frontend in `api-integration.md`.

**Decisions / Considerations**:
- Relocated `docker-compose.yml` to the root directory for easier local startup of DBs.
- Zod is strictly utilized to automatically narrow payload types inside the socket gateway, preventing rogue or malformed WS messages.
- We opted to validate Fastify HTTP routes explicitly inside the route handler using Zod `.safeParse()` rather than installing heavy Fastify-Zod provider plugins to keep dependencies lean and understandable.

**What is Left to do Next**:
- Check the `CHECKLIST.md`. The most immediate next step should be implementing the **Users** and **Library** backend features so that we actually have media to test the playback orchestration against.

---

## [2026-07-05] Users & Library Backend Features
**Agent**: Antigravity
**Summary of Work Done**:
- Designed Zod API response schemas for `UserSettings`, `UserProfile`, `MediaFile`, and `Library` in `packages/contracts/src/api/index.ts`.
- Installed `fluent-ffmpeg` and `ffprobe-static` into `apps/api` to parse local media duration securely.
- Built a JWT verification middleware hook `verifyJwt` inside `apps/api/src/common/authMiddleware.ts`.
- Fully implemented the `UsersService` & `UsersController` protecting endpoints to fetch and update `Settings` directly in Postgres.
- Engineered a recursive folder scanner inside `LibraryService` using native `fs` and `fluent-ffmpeg` to populate the `MediaFile` Postgres tables dynamically, completely offline.
- Integrated `userRoutes` and `libraryRoutes` into the Fastify bootstrap cycle.

**Decisions / Considerations**:
- We execute `ffprobe` locally on the Fastify instance rather than leaning on the containerized FFmpeg worker just to parse metadata. This keeps the library syncing synchronous and extremely fast, avoiding message broker overhead for simple file probing.

**What is Left to do Next**:
- Check the `CHECKLIST.md`. The next task is the **Playback Orchestration**. We have a Library, so we can finally implement starting a party.

---

## [2026-07-05] Infrastructure Fixes, Scalable Sockets & Frontend Scaffold
**Agent**: Antigravity
**Summary of Work Done**:
- Scaffolded the React + Vite frontend (`apps/web`) with TypeScript, React dependencies, and proper monorepo integration.
- Stripped hacky TS `paths` configurations and adopted standard Turborepo `"workspace:*"` dependency linking, achieving a 100% clean cross-monorepo build.
- Refactored the `apps/api` WebSocket Gateway to use a highly scalable, Feature-Oriented router pattern (`apps/api/src/websocket/router.ts`), breaking apart the massive `switch` statement into isolated feature handlers (`chat/socket.ts`, `playback/socket.ts`).
- Replaced the deprecated `fluent-ffmpeg` package entirely with a lightweight native Node `child_process.execFile` implementation invoking `ffprobe-static` directly.

**Decisions / Considerations**:
- `apps/web` is strictly built on top of standard Vite tooling. It relies on Turborepo's dependency linking to resolve types and schemas from `@roomies/contracts` natively.
- The Socket Router isolates the Gateway from business logic. As new features (e.g. Sync, Voice) are added, their handlers simply register with the dispatcher.

**What is Left to do Next**:
- Check the `CHECKLIST.md`. Now that the infrastructure is pristine and the WebSocket router is perfectly scalable, we can move forward with **Playback Orchestration**.
