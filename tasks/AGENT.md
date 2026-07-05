# Agent Developer Guide

Welcome. This `tasks/` directory is the central nervous system for coordinating agentic development on the `watch-party` monorepo. It ensures multiple agents can work asynchronously without losing context, duplicating work, or getting stuck in context drift.

## System Overview

1. **`CHECKLIST.md`**: The active blueprint of what needs to be built.
   - Broken down into independent feature chunks.
   - If a chunk is dependent on another, it will explicitly state `[DEPENDS_ON: TaskName]`.
   - **How to use**: When you start a task, you may optionally mark it as in-progress. When you complete a task, mark it as done `[x]`. Add new tasks if you discover missing requirements.

2. **`LOG.md`**: The append-only history of the project.
   - Every time an agent finishes a work session (or hits a major milestone), they MUST append an entry to the top or bottom of this file.
   - **How to use**: Append a new section with a timestamp. Summarize what you actually built, what edge cases you skipped, any architectural decisions you made, and what the next agent should focus on. **DO NOT DELETE previous entries.**

3. **`SKILLS.md`**: Core engineering principles and design patterns.
   - Strictly defines the project's adherence to SOLID, Dependency Injection, and feature-oriented directory structure.
   - **How to use**: Consult this file continuously to ensure you are not writing spaghetti code or breaking the separation of Control (WS) vs. Media (HTTP) planes.

## Rules for Agents

- **Read Before Acting**: Always read the `LOG.md` (latest entries) and `CHECKLIST.md` to understand the current state of the repo.
- **Maintain Context Efficiency**: Keep your `LOG.md` entries concise. Do not paste massive blocks of code; reference file paths instead (e.g., "Updated `apps/api/src/auth/service.ts` to use bcrypt").
- **Append, Never Overwrite**: The `LOG.md` is append-only. If you fix a mistake from a previous agent, log it as a new entry.
- **Stay Feature-Oriented**: The architecture relies on strict feature encapsulation. Do not mix logic. Adhere strictly to the boundaries defined in the root plan.
