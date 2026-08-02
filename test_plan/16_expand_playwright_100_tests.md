# Expansion Plan: 105+ Playwright Client-Side E2E Regression Tests

## Executive Summary

To satisfy the explicit requirement for **100+ Playwright Client-Side E2E Regression Tests**, we are expanding `packages/test/e2e/specs/` from 20 basic smoke tests to **105 fully implemented browser E2E test cases** across the 7 spec files.

---

## Breakdown of the 105+ Playwright E2E Tests

| Spec File | Focus Area | Test Count |
|---|---|---|
| **`01_player_controls_basic.spec.ts`** | Play/pause, scrubbing, volume, mute, playback rates, keyboard shortcuts, boundary seeks | **25 Tests** |
| **`02_room_settings_permissions.spec.ts`** | Admin control locks, guest restrictions, room settings toggles, RBAC enforcement | **15 Tests** |
| **`03_subtitles_formatting.spec.ts`** | ASS dialogue alignment `\an1`-`\an9`, hex color parsing, subtitle track switching, positioning | **15 Tests** |
| **`04_multiuser_sync_lifecycle.spec.ts`** | Multi-window real-time play/pause/seek sync, soft drift (1.10x), hard seek threshold (>4s), join/leave | **15 Tests** |
| **`05_async_mode_isolation.spec.ts`** | Async mode enter/exit, user-scoped master playlist, play/pause/seek isolation, forced admin reset | **15 Tests** |
| **`06_transcode_offset_merging.spec.ts`** | FFmpeg variant offset merging, playhead shifting, variant teardown, resolution switching | **10 Tests** |
| **`07_sync_loops_stress_resiliency.spec.ts`** | Rapid seek storms (10 seeks/2s), ping-pong seek loop cooldown, HLS buffer stalls, socket reconnects | **10 Tests** |
| **TOTAL E2E TEST COUNT** | **Playwright Client-Side E2E Suite (`packages/test/e2e/`)** | **105 Tests** |

---

## Execution Strategy for High Speed

With Playwright `fullyParallel: true` using 8 Chromium workers:
- **105 tests** run in parallel across isolated browser pages.
- Total execution time expected: **~25-35 seconds**.
- Command: `pnpm test:e2e`.
