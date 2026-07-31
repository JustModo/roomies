# Test Plan: Playback & Room Sync (Sync Mode)

## Module Overview
This module covers room state synchronization, room-wide playhead calculations, soft and hard drift correction thresholds, buffering state reconciliation across multiple clients, control locking mechanisms, and room playback event handling.

**Total Test Cases**: 35 (TC-SYNC-001 to TC-SYNC-035)

---

## Detailed Test Case Specifications

### Category 1: Room Playback State Machine (TC-SYNC-001 to TC-SYNC-010)

#### TC-SYNC-001: Initial Room State Generation on Room Join
- **Objective**: Verify that when a user joins the room (`room.join`), the initial room state contains empty members array or single member with status `buffering` and default playback state (`paused`).
- **Preconditions**: Test server running, user authenticated with JWT.
- **Input**: WS event `room.join` with payload `{}`.
- **Expected Outcome**: WS receives `room.state` with payload `{ room: { members: [...], playback: { state: "paused", ... } } }`.

#### TC-SYNC-002: Transition Playback State from Paused to Playing
- **Objective**: Verify that when a client emits `playback.play`, room state transitions to `playing` and broadcasts `playback.state`.
- **Input**: WS event `playback.play` with payload `{ currentTime: 0 }`.
- **Expected Outcome**: State updates to `playing`, anchorTime updated to `Date.now()`, broadcast to all room members.

#### TC-SYNC-003: Transition Playback State from Playing to Paused
- **Objective**: Verify that when a client emits `playback.pause`, room state transitions to `paused` and anchorTime freezes.
- **Input**: WS event `playback.pause` with payload `{ currentTime: 45.5 }`.
- **Expected Outcome**: State updates to `paused`, position frozen at `45.5`.

#### TC-SYNC-004: Seek Command Execution in Paused State
- **Objective**: Verify seeking to timestamp 120.0s while paused updates position without initiating playback.
- **Input**: WS event `playback.seek` with payload `{ position: 120.0 }`.
- **Expected Outcome**: Position updated to `120.0`, state remains `paused`.

#### TC-SYNC-005: Seek Command Execution in Playing State
- **Objective**: Verify seeking to 300.0s while playing updates position and recalculates anchorTime to current timestamp.
- **Input**: WS event `playback.seek` with payload `{ position: 300.0 }`.
- **Expected Outcome**: Position updated to `300.0`, state remains `playing`, anchorTime reset to current server clock.

#### TC-SYNC-006: Playback Rate Change Execution (0.5x, 1.0x, 1.25x, 1.5x, 2.0x)
- **Objective**: Verify updating playback rate updates `playbackRate` in room state and notifies room members.
- **Input**: WS event `playback.rate` with payload `{ rate: 1.5 }`.
- **Expected Outcome**: `playbackRate` set to `1.5`, state broadcast sent to all clients.

#### TC-SYNC-007: Media File Change Transition (`changeMedia`)
- **Objective**: Verify changing active media file resets room position to 0, stops previous transcode, and notifies clients via `media.changed`.
- **Input**: `POST /api/playback/change-media` with `{ mediaFileId: "valid-id" }`.
- **Expected Outcome**: HTTP 200 returned, `media.changed` event broadcast with HLS playlist URL and subtitle tracks.

#### TC-SYNC-008: Playback Stop Command (`stop`)
- **Objective**: Verify stopping playback resets media title to null, clears media file ID, and sets playback state to `idle`.
- **Input**: `POST /api/playback/stop`.
- **Expected Outcome**: HTTP 200 returned, room state cleared.

#### TC-SYNC-009: Invalid Media File Change Rejection
- **Objective**: Verify requesting media change with non-existent mediaFileId returns 404.
- **Input**: `POST /api/playback/change-media` with `{ mediaFileId: "non-existent-uuid" }`.
- **Expected Outcome**: HTTP 404 Not Found returned with error message.

#### TC-SYNC-010: Media Change Rejection for Unauthenticated Client
- **Objective**: Verify unauthenticated HTTP request to `/api/playback/change-media` is rejected.
- **Input**: `POST /api/playback/change-media` without Authorization header.
- **Expected Outcome**: HTTP 401 Unauthorized returned.

---

### Category 2: Drift Calculation & Threshold Corrections (TC-SYNC-011 to TC-SYNC-018)

#### TC-SYNC-011: Soft Drift Threshold Evaluation (`SOFT_THRESHOLD_MS = 500ms`)
- **Objective**: Verify that if a client's playhead is behind by less than 500ms, no hard seek is issued, but slight rate adjustment (`1.10x`) is recommended.
- **Input**: Local time delta = 300ms.
- **Expected Outcome**: `localCorrectionRate` set to `1.10`, seek command is `null`.

#### TC-SYNC-012: Hard Drift Threshold Evaluation (`HARD_THRESHOLD_MS = 4000ms`)
- **Objective**: Verify that if a client's playhead is behind by more than 4000ms, a hard seek command is dispatched to snap client to room position.
- **Input**: Local time delta = 5500ms.
- **Expected Outcome**: Seek command dispatched to snap client to current server playhead.

#### TC-SYNC-013: Negative Soft Drift Evaluation
- **Objective**: Verify that if a client's playhead is ahead of room playhead by 350ms, correction rate decreases (`0.90x`).
- **Input**: Local time delta = -350ms.
- **Expected Outcome**: `localCorrectionRate` set to `0.90`.

#### TC-SYNC-014: Negative Hard Drift Evaluation
- **Objective**: Verify that if a client's playhead is ahead by 6000ms, a hard seek command snaps client back.
- **Input**: Local time delta = -6000ms.
- **Expected Outcome**: Seek command dispatched with position set to room target.

#### TC-SYNC-015: Zero Drift Stable Playback
- **Objective**: Verify zero drift delta results in `localCorrectionRate` set to `1.0` and no seek command.
- **Input**: Local time delta = 0ms.
- **Expected Outcome**: `localCorrectionRate` = 1.0, seekCommand = null.

#### TC-SYNC-016: Boundary Soft Drift Test (Exactly 500ms)
- **Objective**: Test exact boundary condition at 500ms soft threshold.
- **Input**: Local time delta = 500ms.
- **Expected Outcome**: Handled gracefully without integer overflow or NaN.

#### TC-SYNC-017: Boundary Hard Drift Test (Exactly 4000ms)
- **Objective**: Test exact boundary condition at 4000ms hard threshold.
- **Input**: Local time delta = 4000ms.
- **Expected Outcome**: Hard seek triggered cleanly.

#### TC-SYNC-018: Drift Logging Threshold (`DRIFT_LOG_THRESHOLD_MS = 200ms`)
- **Objective**: Verify drift logging suppresses minor noise below 200ms.
- **Input**: Local time delta = 50ms.
- **Expected Outcome**: No warning logs generated.

---

### Category 3: Multi-User Buffering & Room Reconciliation (TC-SYNC-019 to TC-SYNC-026)

#### TC-SYNC-019: Single Client Buffering State Assertion
- **Objective**: Verify room playback pauses or enters waiting state when the single connected client reports `buffering`.
- **Input**: Client emits `user.status` `{ status: "buffering" }`.
- **Expected Outcome**: Room playback status set to `buffering` or `waiting`.

#### TC-SYNC-020: Multi-Client Buffering Reconciliation (2 Clients)
- **Objective**: Verify room remains paused while Client 1 is `ready` and Client 2 is `buffering`, and resumes when Client 2 becomes `ready`.
- **Input**: Client 1 sends `ready`, Client 2 sends `buffering`, then Client 2 sends `ready`.
- **Expected Outcome**: Room resumes `playing` state only after Client 2 emits `ready`.

#### TC-SYNC-021: Multi-Client Buffering Reconciliation (5 Clients)
- **Objective**: Verify room playback waits for all 5 clients to report `ready`.
- **Input**: 4 clients `ready`, 1 client `buffering`.
- **Expected Outcome**: Room status stays `buffering` until 5th client sends `ready`.

#### TC-SYNC-022: Buffering Timeout Fallback
- **Objective**: Verify that if a buffering client fails to respond within timeout, room does not lock up indefinitely.
- **Input**: Client enters `buffering` and disconnects.
- **Expected Outcome**: Disconnected member is removed, room reconciles buffering state and resumes.

#### TC-SYNC-023: Last Member Disconnect Room Cleanup
- **Objective**: Verify that when all members leave the room, room playback automatically pauses.
- **Input**: All connected clients emit `room.leave` or close WebSocket connection.
- **Expected Outcome**: Room playback state set to `paused`.

#### TC-SYNC-024: Mid-Playback Joiner Buffering Isolation
- **Objective**: Verify a new client joining mid-stream receives current playhead position and buffers without disrupting playing state for existing members.
- **Input**: New client connects and sends `room.join` while room is playing at 150s.
- **Expected Outcome**: New client receives 150s playhead target; existing clients continue playing smoothly.

#### TC-SYNC-025: Rapid Status Toggling (`buffering` -> `ready` -> `buffering`)
- **Objective**: Verify fast consecutive status updates do not cause race conditions in room store.
- **Input**: Client emits 10 rapid status toggles within 100ms.
- **Expected Outcome**: Final state matches last emitted status cleanly.

#### TC-SYNC-026: Position Reporting Telemetry (`user.report_time`)
- **Objective**: Verify clients reporting current time updates member store position without triggering room-wide broadcasts.
- **Input**: Client sends `user.report_time` `{ time: 42.1 }`.
- **Expected Outcome**: Member position updated in store to 42.1s.

---

### Category 4: Control Locks & Permissions (TC-SYNC-027 to TC-SYNC-035)

#### TC-SYNC-027: Root Admin Sets Control Lock on Guest Member
- **Objective**: Verify root admin can lock controls for a guest member (`room.set_control_lock`).
- **Input**: Admin sends `room.set_control_lock` `{ userId: "guest-id", locked: true }`.
- **Expected Outcome**: Guest member's `controlsLocked` property set to `true` in room state, state broadcasted.

#### TC-SYNC-028: Locked Guest Cannot Issue Play/Pause Commands
- **Objective**: Verify guest with `controlsLocked = true` attempting to send `playback.play` is ignored/rejected.
- **Input**: Locked guest sends `playback.play`.
- **Expected Outcome**: Room playback state unchanged, warning logged.

#### TC-SYNC-029: Non-Root User Setting Control Lock Rejection
- **Objective**: Verify a non-root guest attempting to lock another user is rejected with warning.
- **Input**: Guest user sends `room.set_control_lock`.
- **Expected Outcome**: Lock command ignored, warning logged.

#### TC-SYNC-030: Root Admin Unlocks Guest Controls
- **Objective**: Verify root admin unlocking guest (`locked: false`) restores guest control permissions.
- **Input**: Admin sends `room.set_control_lock` `{ userId: "guest-id", locked: false }`.
- **Expected Outcome**: `controlsLocked` set to `false`, guest can control playback.

#### TC-SYNC-031: Individual Member Self-Locking
- **Objective**: Verify a member can self-lock their own playback controls.
- **Input**: Client toggles local self-lock.
- **Expected Outcome**: Local controls locked on client UI, server room state updated.

#### TC-SYNC-032: Admin Updating Room Settings (`allowAsyncMode = false`)
- **Objective**: Verify root admin updating `allowAsyncMode = false` updates room settings.
- **Input**: Admin sends `room.update_settings` `{ settings: { allowAsyncMode: false } }`.
- **Expected Outcome**: Room settings updated, broadcasted to room.

#### TC-SYNC-033: Non-Root Updating Room Settings Rejection
- **Objective**: Verify non-root user attempting to update room settings is rejected.
- **Input**: Guest user sends `room.update_settings`.
- **Expected Outcome**: Settings update rejected, room settings unchanged.

#### TC-SYNC-034: Self-Locking Does Not Block Admin Unlock
- **Objective**: Verify admin lock overrides self-lock settings.
- **Input**: Member self-locks, then admin locks member.
- **Expected Outcome**: Member remains locked; admin release required to unlock.

#### TC-SYNC-035: Sync Mode Complete Edge Case Re-sync
- **Objective**: Verify full sequence: join, play, seek, pause, rate change, status toggle, leave.
- **Input**: Complete sequential workflow execution.
- **Expected Outcome**: All state machine transitions execute cleanly with 100% assertions passing.
