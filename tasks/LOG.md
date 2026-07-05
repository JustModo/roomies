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
