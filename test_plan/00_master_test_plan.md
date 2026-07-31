# Master Test Plan Specification

## Executive Summary
This document serves as the master architecture and index for the End-to-End (E2E) and Regression Testing Framework for the `@roomies` monorepo workspace. The suite defines **220 exhaustive test cases** covering every core control system, synchronization algorithm, video transcoding pipeline, file scanning engine, subtitle tag parser, real-time WebSocket gateway, and security boundary.

---

## Suite Architecture & Test Matrix Overview

| Module ID | Module Title | Primary Domain / Component | Total Test Cases | Test Document File |
| :--- | :--- | :--- | :---: | :--- |
| **SEC-01** | Playback & Room Sync (Sync Mode) | State Machine, Drift Engine, Buffering | **35** | [01_playback_sync_test_plan.md](file:///home/modo/CodeProjects/roomies/test_plan/01_playback_sync_test_plan.md) |
| **SEC-02** | Playback & Room Sync (Async Mode) | Async Playhead, Transcode Isolation, Reset | **30** | [02_playback_async_test_plan.md](file:///home/modo/CodeProjects/roomies/test_plan/02_playback_async_test_plan.md) |
| **SEC-03** | Transcoding & FFmpeg Pipeline | HLS Segmenter, HWACCEL, Offsets, Cache | **35** | [03_transcoding_pipeline_test_plan.md](file:///home/modo/CodeProjects/roomies/test_plan/03_transcoding_pipeline_test_plan.md) |
| **SEC-04** | Library Scanner & File Detection | Movie/Show Detector, Subtitle Matcher | **35** | [04_library_scanner_test_plan.md](file:///home/modo/CodeProjects/roomies/test_plan/04_library_scanner_test_plan.md) |
| **SEC-05** | Custom Subtitle Tag Engine | ASS/SSA Tokenizer, \an1-\an9, BGR Colors | **30** | [05_subtitle_engine_test_plan.md](file:///home/modo/CodeProjects/roomies/test_plan/05_subtitle_engine_test_plan.md) |
| **SEC-06** | Authentication, JWT & RBAC | Bootstrap, Token Rotation, Guest/Root | **25** | [06_auth_rbac_test_plan.md](file:///home/modo/CodeProjects/roomies/test_plan/06_auth_rbac_test_plan.md) |
| **SEC-07** | WebSocket Realtime Gateway | WebSockets, Multi-User Chat, Rate Limiting | **30** | [07_websocket_gateway_test_plan.md](file:///home/modo/CodeProjects/roomies/test_plan/07_websocket_gateway_test_plan.md) |
| **TOTAL** | **Full Application Coverage** | **All Packages & Services** | **220** | **Master Specification** |

---

## Quality Gates & Execution Policies

1. **Monorepo Tightly-Coupled Requirement**:
   All tests execute within the `@roomies/test` workspace package (`packages/test/`), directly consuming package logic from `@roomies/server`, `@roomies/library`, `@roomies/contracts`, `@roomies/transcoding`, `@roomies/config`, `@roomies/chat`, and `@roomies/voice`.

2. **Isolated Ephemeral Database**:
   Each test file runs against a dynamically created, isolated SQLite database (`file:///tmp/roomies-test-db-.../test.db`) initialized via `npx prisma db push`. No test run modifies production or local development database state (`config/roomies.db`).

3. **Dynamic Dynamic Port Allocation**:
   Fastify test server instances launch on dynamic ephemeral ports (`127.0.0.1:0`) to eliminate port collision errors across parallel/sequential test runs.

4. **Zero Flakiness Policy**:
   All asynchronous operations, WebSocket frame broadcasts, and file operations use deterministic event waiters (`waitForEvent`) with explicit timeouts.

---

## Execution Command Reference

```bash
# Run entire 220 test case suite across monorepo
pnpm test:all

# Run Turborepo root pipeline
pnpm test

# Run workspace typechecking across all 9 packages
pnpm typecheck
```
