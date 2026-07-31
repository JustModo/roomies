# Test Plan: WebSocket Real-Time Gateway & Store

## Module Overview
This module covers WebSocket connection handshake, token authentication via query parameter (`?token=`) and protocol header (`bearer.xxx`), room state broadcasting on `room.join`, multi-client real-time synchronization, chat message broadcasting (`chat.send` -> `chat.message`), emoji reaction broadcasting (`emoji.send` -> `emoji.reaction`), rate limiting middleware (`createRateLimiter`), socket store lifecycle, and user connection eviction (`kickUserConnections`).

**Total Test Cases**: 30 (TC-WS-001 to TC-WS-030)

---

## Detailed Test Case Specifications

### Category 1: Connection Handshake & Authentication (TC-WS-001 to TC-WS-008)

#### TC-WS-001: WebSocket Connection via Protocol Header (`Sec-WebSocket-Protocol: bearer.<token>`)
- **Objective**: Verify client can authenticate WebSocket connection using `bearer.<token>` in `Sec-WebSocket-Protocol` header.
- **Preconditions**: Test server running, valid JWT token obtained.
- **Input**: WS connection to `ws://127.0.0.1:PORT/ws` with `Sec-WebSocket-Protocol: bearer.validToken`.
- **Expected Outcome**: Connection accepted, socket open.

#### TC-WS-002: WebSocket Connection via Query Parameter (`?token=<token>`)
- **Objective**: Verify client can authenticate WebSocket connection using `?token=validToken` query parameter.
- **Input**: WS connection to `ws://127.0.0.1:PORT/ws?token=validToken`.
- **Expected Outcome**: Connection accepted, socket open.

#### TC-WS-003: Unauthenticated Connection Rejection (Missing Token)
- **Objective**: Verify WebSocket connection with no token is closed/rejected.
- **Input**: WS connection to `ws://127.0.0.1:PORT/ws` without token.
- **Expected Outcome**: Socket closed immediately by server.

#### TC-WS-004: Invalid Token Connection Rejection
- **Objective**: Verify WebSocket connection with invalid/malformed token is closed.
- **Input**: WS connection with token `"invalid-token-string"`.
- **Expected Outcome**: Socket closed immediately by server.

#### TC-WS-005: Superseded Session Token WS Connection Rejection
- **Objective**: Verify connecting with an old JWT token whose session was invalidated by a newer login is rejected.
- **Input**: User logs in twice; attempt WS connection with first token.
- **Expected Outcome**: Socket connection closed.

#### TC-WS-006: Protocol Header Handshake Echo Response
- **Objective**: Verify server includes `bearer.<token>` in `Sec-WebSocket-Protocol` handshake response header.
- **Input**: WS connection with `bearer.<token>` protocol header.
- **Expected Outcome**: Handshake response header `Sec-WebSocket-Protocol: bearer.<token>`.

#### TC-WS-007: Multiple Simultaneous Connections for Same User
- **Objective**: Verify a user opening 2 browser tabs creates 2 active socket connections registered in `socketStore`.
- **Input**: User opens 2 WS connections with valid token.
- **Expected Outcome**: `socketStore.getConnectionsForUser(userId)` returns array of length 2.

#### TC-WS-008: WS Ping/Pong Keep-Alive Heartbeat
- **Objective**: Verify server sends WS ping frames periodically and maintains active connection when client responds with pong.
- **Input**: Connection idle for ping interval.
- **Expected Outcome**: Connection remains healthy; no unexpected disconnection.

---

### Category 2: Room Join & State Broadcast (TC-WS-009 to TC-WS-014)

#### TC-WS-009: Initial Room Join (`room.join`) State Broadcast
- **Objective**: Verify client sending `room.join` receives immediate `room.state` broadcast containing room playback and member list.
- **Input**: Client sends `{ event: "room.join", payload: {} }`.
- **Expected Outcome**: Client receives `{ event: "room.state", payload: { room: { ... } } }`.

#### TC-WS-010: User Joined Event Broadcast (`user.joined`)
- **Objective**: Verify when Client 2 joins the room, existing Client 1 receives `user.joined` broadcast containing Client 2 details.
- **Input**: Client 2 sends `room.join`.
- **Expected Outcome**: Client 1 receives `{ event: "user.joined", payload: { userId: "c2-id", username: "user2" } }`.

#### TC-WS-011: User Left Event Broadcast (`user.left`)
- **Objective**: Verify when Client 2 disconnects or leaves, Client 1 receives `user.left` broadcast.
- **Input**: Client 2 closes WS connection or sends `room.leave`.
- **Expected Outcome**: Client 1 receives `{ event: "user.left", payload: { userId: "c2-id", username: "user2" } }`.

#### TC-WS-012: Room State Member List Ordering
- **Objective**: Verify `room.state` member list remains consistently ordered by join order or username.
- **Input**: 3 clients join sequentially.
- **Expected Outcome**: Members array in room state contains all 3 clients.

#### TC-WS-013: Member Status Changed Broadcast (`user.status_changed`)
- **Objective**: Verify when a member changes status (`ready`, `buffering`, `async`), `user.status_changed` is broadcasted.
- **Input**: Client sends `user.status` `{ status: "ready" }`.
- **Expected Outcome**: Broadcast sent with `{ userId, status: "ready" }`.

#### TC-WS-014: Duplicate `room.join` Idempotency
- **Objective**: Verify sending `room.join` multiple times from same connection does not create duplicate entries in member list.
- **Input**: Single client sends `room.join` 3 times.
- **Expected Outcome**: Room state contains exactly 1 member entry for that user ID.

---

### Category 3: Real-Time Chat & Emoji Broadcasting (TC-WS-015 to TC-WS-022)

#### TC-WS-015: Chat Message Broadcast (`chat.send` -> `chat.message`)
- **Objective**: Verify sending `chat.send` broadcasts `chat.message` with `userId`, `username`, `message`, and `timestamp` to all room members.
- **Input**: Client 1 sends `{ event: "chat.send", payload: { message: "Hello room!" } }`.
- **Expected Outcome**: Client 2 receives `{ event: "chat.message", payload: { userId: "c1-id", username: "admin", message: "Hello room!", timestamp: "..." } }`.

#### TC-WS-016: Chat History Persistence in Memory (`chatStore`)
- **Objective**: Verify sent chat messages are saved in `chatStore` in-memory buffer.
- **Input**: Send 3 chat messages.
- **Expected Outcome**: `ChatService.getHistory()` returns array of 3 message objects.

#### TC-WS-017: Chat Message HTML / Script Tag Sanitization
- **Objective**: Verify chat messages containing HTML/XSS scripts (`<script>alert(1)</script>`) are handled safely without breaking protocol formatting.
- **Input**: Send message `"<script>alert(1)</script>"`.
- **Expected Outcome**: Text delivered as raw string payload without HTML injection risk.

#### TC-WS-018: Emoji Reaction Broadcast (`emoji.send` -> `emoji.reaction`)
- **Objective**: Verify sending `emoji.send` broadcasts `emoji.reaction` event to all room members including sender.
- **Input**: Client 2 sends `{ event: "emoji.send", payload: { emoji: "🔥" } }`.
- **Expected Outcome**: Client 1 receives `{ event: "emoji.reaction", payload: { userId: "c2-id", username: "user2", emoji: "🔥", timestamp: 123456789 } }`.

#### TC-WS-019: Rate Limiting Emoji Reactions (1 per 500ms)
- **Objective**: Verify sending 5 emoji reactions within 100ms triggers rate limiter and drops extra reactions.
- **Input**: Send 5 emoji events rapidly.
- **Expected Outcome**: Only 1 `emoji.reaction` broadcasted; remaining 4 dropped silently.

#### TC-WS-020: Rate Limiting Chat Messages (5 per 2000ms)
- **Objective**: Verify sending 10 chat messages rapidly triggers rate limiter and drops messages past threshold.
- **Input**: Send 10 chat messages rapidly.
- **Expected Outcome**: First 5 delivered; remaining dropped with rate limit warning.

#### TC-WS-021: Empty Chat Message Payload Rejection
- **Objective**: Verify sending empty or whitespace-only chat message (`{ message: "   " }`) is ignored.
- **Input**: Send empty chat payload.
- **Expected Outcome**: No broadcast sent, no storage append.

#### TC-WS-022: Multi-Room Chat Isolation (Future Scalability)
- **Objective**: Verify chat messages sent in Room A are not broadcasted to clients connected to Room B.
- **Input**: Client 1 in Room A, Client 2 in Room B.
- **Expected Outcome**: Messages isolated per room context.

---

### Category 4: Connection Management & Eviction (TC-WS-023 to TC-WS-030)

#### TC-WS-023: Socket Store Registration (`socketStore.add`)
- **Objective**: Verify establishing WebSocket connection adds socket metadata to `socketStore`.
- **Input**: Connect WS client.
- **Expected Outcome**: `socketStore.has(socketId)` returns true.

#### TC-WS-024: Socket Store Clean Removal (`socketStore.remove`)
- **Objective**: Verify closing WebSocket connection removes socket metadata from `socketStore`.
- **Input**: Close WS client connection.
- **Expected Outcome**: `socketStore.has(socketId)` returns false.

#### TC-WS-025: Evicting User Connections (`kickUserConnections`)
- **Objective**: Verify calling `kickUserConnections(userId)` forcefully closes all open sockets for specified user.
- **Input**: User has 2 active sockets; invoke `kickUserConnections(userId)`.
- **Expected Outcome**: Both sockets closed by server with close code 4001.

#### TC-WS-026: Malformed Frame / Unparseable JSON Resilience
- **Objective**: Verify sending non-JSON text frame (e.g. `"not-json"`) does not crash WebSocket server.
- **Input**: Send raw invalid string frame.
- **Expected Outcome**: Error logged, server remains running and responsive.

#### TC-WS-027: Unknown Event Name Handling
- **Objective**: Verify sending message with unknown event name (`{ event: "unknown.event" }`) is ignored cleanly.
- **Input**: Send unknown event.
- **Expected Outcome**: Warning logged, server remains stable.

#### TC-WS-028: High Concurrency Multi-Client Broadcast Performance (10 Clients)
- **Objective**: Verify 10 connected clients receive broadcast events within < 50ms latency.
- **Input**: 10 clients connected; Client 1 emits `chat.send`.
- **Expected Outcome**: All 9 other clients receive `chat.message` almost instantaneously.

#### TC-WS-029: Graceful Server Shutdown Socket Closure
- **Objective**: Verify server graceful shutdown closes all active WebSocket connections with clean close frame.
- **Input**: Server close hook invoked.
- **Expected Outcome**: All connected clients receive close event.

#### TC-WS-030: Comprehensive WebSocket Gateway End-to-End Test
- **Objective**: Full end-to-end verification of connection, header auth, room join, room state broadcast, chat broadcast, emoji broadcast, rate limiting, and disconnection cleanup.
- **Input**: Complete sequential test execution.
- **Expected Outcome**: 100% assertions pass across all real-time gateway operations.
