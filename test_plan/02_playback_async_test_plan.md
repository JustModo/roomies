# Test Plan: Playback & Room Sync (Async Mode)

## Module Overview
This module covers async mode playback, isolated async transcode session initialization, async playhead decoupling, admin disabling async mode, master playlist URL switching (`sync` vs `async`), and async session teardown.

**Total Test Cases**: 30 (TC-ASYNC-001 to TC-ASYNC-030)

---

## Detailed Test Case Specifications

### Category 1: Async Mode Activation & Session Initialization (TC-ASYNC-001 to TC-ASYNC-008)

#### TC-ASYNC-001: Member Toggles Async Mode (`status: "async"`)
- **Objective**: Verify that when a member toggles async mode, member status in room store updates to `async`.
- **Preconditions**: User joined room, media playing in room sync.
- **Input**: Client emits status update `{ status: "async" }`.
- **Expected Outcome**: Member status set to `async`, broadcasted via `user.status_changed`.

#### TC-ASYNC-002: Async Transcode Session Instantiation
- **Objective**: Verify toggling async mode creates an isolated transcode session for the user and media file.
- **Input**: Member enters async mode for mediaFileId `"mf-test-1"`.
- **Expected Outcome**: New TranscodeSession created with unique output directory path `CACHE_DIR/{sessionId}/{mediaFileId}/{uniqueRunId}`.

#### TC-ASYNC-003: HLS Playlist URL Switching for Async Session
- **Objective**: Verify that upon entering async mode, client receives `media.changed` payload containing the async-scoped HLS URL.
- **Input**: Member enters async mode.
- **Expected Outcome**: Client receives `media.changed` with `hlsUrl = "/hls/mf-test-1/master.m3u8?session=async-user-id"` and `sessionScope = "async"`.

#### TC-ASYNC-004: Simultaneous Async Sessions for Multiple Users
- **Objective**: Verify 3 users entering async mode simultaneously spawn 3 separate, isolated async transcode sessions.
- **Input**: User 1, User 2, and User 3 toggle async mode.
- **Expected Outcome**: 3 independent transcode sessions created without file directory collisions.

#### TC-ASYNC-005: Re-entering Async Mode for Same User
- **Objective**: Verify re-entering async mode cleans up the previous async session before starting a new one.
- **Input**: User toggles async -> sync -> async.
- **Expected Outcome**: Previous async transcode session stopped; new isolated session initialized.

#### TC-ASYNC-006: Async Mode Toggle Disabled When `allowAsyncMode = false`
- **Objective**: Verify client cannot enter async mode if room settings have `allowAsyncMode: false`.
- **Input**: Admin sets `allowAsyncMode = false`, guest attempts to enter async mode.
- **Expected Outcome**: Async toggle rejected, member status remains `ready` or `sync`.

#### TC-ASYNC-007: Async Session Directory Security Isolation
- **Objective**: Verify async session directories are isolated per user to prevent cross-user segment access.
- **Input**: User A and User B start async sessions for the same media file.
- **Expected Outcome**: Output paths differ: `.../userA/...` vs `.../userB/...`.

#### TC-ASYNC-008: Async Initialization for Show Episode
- **Objective**: Verify async mode works correctly when active media is a TV show episode.
- **Input**: Async mode toggled during TV show episode playback.
- **Expected Outcome**: Episode file input path correctly resolved and passed to async transcode worker.

---

### Category 2: Async Playhead Decoupling & Independent Control (TC-ASYNC-009 to TC-ASYNC-018)

#### TC-ASYNC-009: Async Play Command Does Not Affect Room Sync State
- **Objective**: Verify sending play while in async mode updates only async playhead and does not alter room sync state.
- **Input**: Async member sends `playback.play` at timestamp 50s.
- **Expected Outcome**: Main room playback state remains unchanged for sync members.

#### TC-ASYNC-010: Async Pause Command Does Not Affect Room Sync State
- **Objective**: Verify pausing while in async mode leaves main room playing for sync members.
- **Input**: Async member sends `playback.pause` at 120s.
- **Expected Outcome**: Async playhead paused; main room playback state remains `playing`.

#### TC-ASYNC-011: Async Seek Command Execution
- **Objective**: Verify seeking in async mode recalculates transcode offset for the async session without seeking main room.
- **Input**: Async member seeks to 600.0s.
- **Expected Outcome**: Async transcode worker seeks input stream to 600.0s; room playhead untouched.

#### TC-ASYNC-012: Async Playback Rate Adjustment
- **Objective**: Verify changing playback rate in async mode updates async player rate without broadcasting to room.
- **Input**: Async member changes rate to 2.0x.
- **Expected Outcome**: Async session speed updated; room rate remains 1.0x.

#### TC-ASYNC-013: Main Room Playback Changes Do Not Interrupt Async Member
- **Objective**: Verify main room seek/pause/play commands are ignored by async members.
- **Input**: Room admin seeks main room to 0s while async member is watching at 450s.
- **Expected Outcome**: Async member continues uninterrupted at 450s.

#### TC-ASYNC-014: Async Playhead Position Telemetry
- **Objective**: Verify async member time reports update async playhead coordinator (`coordinator.updateAsyncPlayhead`).
- **Input**: Async member reports time 210.5s.
- **Expected Outcome**: Async coordinator updates position to 210.5s.

#### TC-ASYNC-015: Async Member Buffering Assertion
- **Objective**: Verify an async member entering `buffering` state DOES NOT pause or delay main room playback.
- **Input**: Async member sends status `buffering`.
- **Expected Outcome**: Main room playback continues playing smoothly; `SyncService.reconcileRoomBufferingState` ignores async members.

#### TC-ASYNC-016: Multiple Async Members Independent Seeking
- **Objective**: Verify User A seeking to 100s in async mode does not affect User B watching at 500s in async mode.
- **Input**: User A seeks to 100s, User B seeks to 500s.
- **Expected Outcome**: Both async sessions transcode independent time ranges.

#### TC-ASYNC-017: Async Member Reporting Custom Resolution
- **Objective**: Verify async member selecting 480p resolution updates async transcode variant without affecting room default.
- **Input**: Async member requests 480p variant.
- **Expected Outcome**: Async transcode session spawns 480p variant worker.

#### TC-ASYNC-018: Async Playhead Out-of-Bounds Seek
- **Objective**: Verify seeking past media duration in async mode clamps to media duration.
- **Input**: Seek to 99999s on a 600s video.
- **Expected Outcome**: Position clamped to 600s.

---

### Category 3: Admin Reset & Forced Synchronization (TC-ASYNC-019 to TC-ASYNC-024)

#### TC-ASYNC-019: Admin Disables Async Mode (`allowAsyncMode: false`)
- **Objective**: Verify that when admin sets `allowAsyncMode = false`, ALL active async members are forcibly returned to `ready`/`sync` status.
- **Input**: Admin updates room settings `{ allowAsyncMode: false }`.
- **Expected Outcome**: All async member statuses updated to `ready`, async playheads removed from coordinator.

#### TC-ASYNC-020: Forced HLS Playlist URL Reset on Admin Reset
- **Objective**: Verify forced members receive `media.changed` payload containing the room-scoped HLS URL (`sessionScope = "room"`).
- **Input**: Admin sets `allowAsyncMode = false`.
- **Expected Outcome**: Forced members receive `media.changed` with master room HLS URL (`/hls/mf-id/master.m3u8?session=sync`).

#### TC-ASYNC-021: Teardown of Async Transcode Sessions on Admin Reset
- **Objective**: Verify all active async FFmpeg transcode sessions are stopped when admin disables async mode.
- **Input**: Admin sets `allowAsyncMode = false`.
- **Expected Outcome**: `TranscodeSessionManager.stopSession()` executed for all async session IDs.

#### TC-ASYNC-022: Re-reconciling Room Buffering State After Forced Reset
- **Objective**: Verify that after forced reset, room buffering state is re-evaluated to include the newly returned members.
- **Input**: Admin disables async mode while room is playing.
- **Expected Outcome**: `SyncService.reconcileRoomBufferingState` called to sync newly returned members.

#### TC-ASYNC-023: Non-Root Attempt to Disable Async Mode Rejection
- **Objective**: Verify non-root guest attempting to set `allowAsyncMode: false` is rejected.
- **Input**: Guest user emits `room.update_settings` `{ allowAsyncMode: false }`.
- **Expected Outcome**: Settings update rejected; async members remain in async mode.

#### TC-ASYNC-024: Admin Changing Media Resets All Async Members
- **Objective**: Verify admin changing active media in room resets all async members back to room sync on the new media.
- **Input**: Admin calls `/api/playback/change-media`.
- **Expected Outcome**: Async sessions closed; all members updated with new room media HLS URL.

---

### Category 4: Async Teardown & Resource Cleanup (TC-ASYNC-025 to TC-ASYNC-030)

#### TC-ASYNC-025: Async Member Disconnect Cleanup
- **Objective**: Verify that when an async member closes WebSocket connection, their async transcode session is immediately stopped.
- **Input**: Async member disconnects.
- **Expected Outcome**: WS close handler removes async playhead and calls `stopSession()`.

#### TC-ASYNC-026: Async Member Explicit Leave Cleanup
- **Objective**: Verify emitting `room.leave` in async mode cleans up async transcode resources.
- **Input**: Async member sends `room.leave`.
- **Expected Outcome**: `coordinator.removeAsyncPlayhead()` executed, transcode cache directory cleaned.

#### TC-ASYNC-027: Garbage Collection of Stale Async Directories
- **Objective**: Verify idle async sessions exceeding `IDLE_SESSION_TIMEOUT_MS` (30s) are garbage collected.
- **Input**: Async session idle without time reports for 35s.
- **Expected Outcome**: Session automatically destroyed and cache purged.

#### TC-ASYNC-028: Async Session Cleanup Under Server Shutdown
- **Objective**: Verify server graceful shutdown stops all running async FFmpeg processes.
- **Input**: Server close hook invoked.
- **Expected Outcome**: `TranscodeSessionManager.stopAll()` kills all FFmpeg child processes.

#### TC-ASYNC-029: Rapid Async Toggle Stress Cleanup
- **Objective**: Verify rapid toggling between sync and async mode (20 times) leaves zero orphaned FFmpeg processes.
- **Input**: Fast toggle stress loop.
- **Expected Outcome**: Active session count = 1 or 0; zero leaked processes.

#### TC-ASYNC-030: Complete Async Lifecycle Full Integration
- **Objective**: Verify complete flow: join -> play -> enter async -> seek in async -> pause in async -> admin resets async -> forced back to sync.
- **Input**: Full integrated sequence.
- **Expected Outcome**: 100% assertions pass across all state transitions.
