# Engineering Skills & Constraints

This document enforces strict coding standards for all agents touching the `watch-party` architecture. **Do not deviate from these rules under any circumstances.**

## 1. Feature-Oriented Architecture
- **Do not group by technical role.** (e.g., No massive `controllers/`, `services/`, or `models/` folders at the app level).
- **Group by Feature.** If you are working on the `playback` feature, the controller, service, repository, and routes MUST live inside `apps/api/src/playback/`.
- Every feature must be self-contained and expose a clean API (usually via an `index.ts` export) for other features to consume.

## 2. Strict Plane Separation
- **Control Plane (Fastify WebSockets)**: Used strictly for orchestration—sync, chat, presence, voice signaling (WebRTC), and commands.
- **Media Plane (Caddy / HTTP)**: Used strictly for delivering video segments (`.m3u8` and `.ts` files). 
- **CRITICAL**: Never pass video binary data through the WebSocket gateway.

## 3. SOLID Principles & Dependency Injection
- **Single Responsibility**: Classes/Services should do one thing. If a `PlaybackService` is handling HTTP request validation, you have failed. Move validation to the controller/route level.
- **Dependency Injection**: Services should not tightly couple to their repositories by hardcoding instantiations if they can be injected. While functional paradigms are acceptable, ensure data access (e.g. Prisma logic) is isolated into `repository.ts` files, and `service.ts` purely handles the business logic.
- **Interface Segregation**: Do not create bloated TypeScript interfaces. If a component only needs `userId` and `username`, do not pass the entire `User` object.

## 4. Single Source of Truth for Types (Contracts)
- **Do not hardcode types in the frontend (`apps/web`).**
- **Do not hardcode types in the backend (`apps/api`).**
- If an API payload or WebSocket event is exchanged, it MUST be defined as a Zod schema or TypeScript interface inside `packages/contracts/` or `packages/shared/`.
- Use Zod's `discriminatedUnion` for WebSocket event parsing to ensure Type narrowing.

## 5. State Management Rules
- **PostgreSQL (Prisma)**: Used exclusively for persistent data (Users, Libraries, Media Files, System Settings).
- **Redis (Redis OM)**: Used exclusively for transient runtime state (Who is online, who is typing, the current playback drift, last 500 chat messages). Do NOT put active room presence in Postgres.
