# Test Plan: Authentication, JWT & RBAC

## Module Overview
This module covers initial system root user setup (`/api/auth/setup`), JWT access and refresh token signing, single-session token rotation (`rotateSession`), token validation middleware (`verifyJwt`), guest user creation (`/api/users/guest`), role-based access control (`root` vs `guest` permissions), and security boundary enforcement.

**Total Test Cases**: 25 (TC-AUTH-001 to TC-AUTH-025)

---

## Detailed Test Case Specifications

### Category 1: System Bootstrap & Root User Creation (TC-AUTH-001 to TC-AUTH-006)

#### TC-AUTH-001: First-Time Setup Root User Creation (`POST /api/auth/setup`)
- **Objective**: Verify that when database is empty (zero users), calling `/api/auth/setup` creates the initial `root` admin account.
- **Preconditions**: Database newly initialized, 0 users present.
- **Input**: `POST /api/auth/setup` with `{ username: "admin", password: "password123" }`.
- **Expected Outcome**: Returns HTTP 200, JWT access token, and user object with `role = "root"`.

#### TC-AUTH-002: Duplicate Setup Attempt Rejection (Root Already Exists)
- **Objective**: Verify that after root user is created, subsequent calls to `/api/auth/setup` are rejected.
- **Preconditions**: Root user already exists in database.
- **Input**: `POST /api/auth/setup` with `{ username: "admin2", password: "password123" }`.
- **Expected Outcome**: Returns HTTP 400 Bad Request with message `"Root user already configured"`.

#### TC-AUTH-003: Password Hashing Enforcement (Bcrypt / Argon2)
- **Objective**: Verify user passwords are stored as secure hashes and never in plaintext in SQLite database.
- **Input**: User creation with password `"password123"`.
- **Expected Outcome**: `prisma.user.findUnique()` shows `password` starting with `$2a$` or `$2b$` bcrypt salt prefix.

#### TC-AUTH-004: Setup Request Payload Validation (Short Password)
- **Objective**: Verify setup request with password under 6 characters is rejected by Zod schema validation.
- **Input**: `POST /api/auth/setup` with `{ username: "admin", password: "123" }`.
- **Expected Outcome**: Returns HTTP 400 Bad Request with validation error details.

#### TC-AUTH-005: Setup Request Payload Validation (Missing Username)
- **Objective**: Verify setup request missing `username` field returns 400.
- **Input**: `POST /api/auth/setup` with `{ password: "password123" }`.
- **Expected Outcome**: Returns HTTP 400 Bad Request.

#### TC-AUTH-006: Server Secret Generation (`JWT_SECRET`, `JWT_REFRESH_SECRET`)
- **Objective**: Verify server initializes and persists cryptographically secure JWT secrets in `ServerConfig` DB table.
- **Input**: Server startup bootstrap.
- **Expected Outcome**: `ServerConfig` table contains non-empty `JWT_SECRET` and `JWT_REFRESH_SECRET`.

---

### Category 2: Authentication & Token Rotation (TC-AUTH-007 to TC-AUTH-013)

#### TC-AUTH-007: Successful User Login (`POST /api/auth/login`)
- **Objective**: Verify valid credentials return HTTP 200, access token, refresh token, and user profile.
- **Input**: `POST /api/auth/login` with `{ username: "admin", password: "password123" }`.
- **Expected Outcome**: HTTP 200 returned, valid JWT token returned.

#### TC-AUTH-008: Invalid Password Login Rejection
- **Objective**: Verify incorrect password returns 401 Unauthorized.
- **Input**: `POST /api/auth/login` with `{ username: "admin", password: "wrongpassword" }`.
- **Expected Outcome**: HTTP 401 Unauthorized returned.

#### TC-AUTH-009: Non-Existent Username Login Rejection
- **Objective**: Verify logging in with non-existent username returns 401 Unauthorized.
- **Input**: `POST /api/auth/login` with `{ username: "nobody", password: "password123" }`.
- **Expected Outcome**: HTTP 401 Unauthorized returned.

#### TC-AUTH-010: Single-Session Enforcement & Token Rotation (`rotateSession`)
- **Objective**: Verify logging in from a new device invalidates all previous session tokens for that user.
- **Input**: Log in Device A (Token 1), then log in Device B (Token 2). Attempt API call with Token 1.
- **Expected Outcome**: Token 1 returns HTTP 401 Unauthorized; Token 2 succeeds with HTTP 200.

#### TC-AUTH-011: Token Refresh Execution (`POST /api/auth/refresh`)
- **Objective**: Verify valid refresh token generates a new access token and updates session ID.
- **Input**: `POST /api/auth/refresh` with valid refresh token.
- **Expected Outcome**: HTTP 200 returned with new access token.

#### TC-AUTH-012: Expired Refresh Token Rejection
- **Objective**: Verify expired refresh token returns 401 Unauthorized.
- **Input**: `POST /api/auth/refresh` with expired token.
- **Expected Outcome**: HTTP 401 Unauthorized.

#### TC-AUTH-013: User Logout Session Purge (`POST /api/auth/logout`)
- **Objective**: Verify logout invalidates the active session record in `RefreshToken` table.
- **Input**: `POST /api/auth/logout` with Bearer token.
- **Expected Outcome**: Session record deleted from DB; subsequent token use returns 401.

---

### Category 3: Guest Account Creation & User Management (TC-AUTH-014 to TC-AUTH-018)

#### TC-AUTH-014: Root Admin Creates Guest Account (`POST /api/users/guest`)
- **Objective**: Verify root user can create a guest account with specified username and password.
- **Input**: `POST /api/users/guest` with `{ username: "testguest", password: "guestpassword123" }`.
- **Expected Outcome**: Returns HTTP 201 Created with `{ username: "testguest", role: "guest" }`.

#### TC-AUTH-015: Duplicate Guest Username Creation Rejection
- **Objective**: Verify creating a guest account with an existing username returns 400/409 error.
- **Input**: `POST /api/users/guest` with existing username `"testguest"`.
- **Expected Outcome**: Returns HTTP 400/409 error.

#### TC-AUTH-016: Non-Root Attempt to Create Guest Account Rejection
- **Objective**: Verify a guest user attempting to call `POST /api/users/guest` is rejected with 403 Forbidden.
- **Input**: `POST /api/users/guest` with Guest user Bearer token.
- **Expected Outcome**: Returns HTTP 403 Forbidden.

#### TC-AUTH-017: Get User List Endpoint (`GET /api/users`)
- **Objective**: Verify fetching user list returns all registered users without exposing hashed passwords.
- **Input**: `GET /api/users` with Root user Bearer token.
- **Expected Outcome**: Returns HTTP 200 and list of user objects with `id`, `username`, `role`. No `password` fields included.

#### TC-AUTH-018: Root Admin Deletes User Account (`DELETE /api/users/:id`)
- **Objective**: Verify root admin can delete a guest user account.
- **Input**: `DELETE /api/users/{guest-user-id}` with Root Bearer token.
- **Expected Outcome**: Returns HTTP 200; guest user deleted from database.

---

### Category 4: Role-Based Access Control & Route Security (TC-AUTH-019 to TC-AUTH-025)

#### TC-AUTH-019: Unauthenticated Access to Protected Library Routes Rejection
- **Objective**: Verify `GET /api/library` without Authorization header returns 401 Unauthorized.
- **Input**: `GET /api/library` with no auth header.
- **Expected Outcome**: HTTP 401 Unauthorized.

#### TC-AUTH-020: Guest Access to Standard Library Routes
- **Objective**: Verify guest user with valid token can access `GET /api/library`.
- **Input**: `GET /api/library` with Guest Bearer token.
- **Expected Outcome**: HTTP 200 OK.

#### TC-AUTH-021: Guest Access to Admin Library Scan Endpoint Rejection
- **Objective**: Verify guest user attempting `POST /api/library/scan` is rejected with 403 Forbidden.
- **Input**: `POST /api/library/scan` with Guest Bearer token.
- **Expected Outcome**: HTTP 403 Forbidden.

#### TC-AUTH-022: Guest Attempt to Delete User Account Rejection
- **Objective**: Verify guest user attempting `DELETE /api/users/:id` returns 403 Forbidden.
- **Input**: `DELETE /api/users/{some-id}` with Guest token.
- **Expected Outcome**: HTTP 403 Forbidden.

#### TC-AUTH-023: Malformed Authorization Header Format Handling
- **Objective**: Verify headers like `Authorization: Basic xxx` or `Authorization: Bearer` (missing token string) return 401.
- **Input**: `Authorization: InvalidFormat`.
- **Expected Outcome**: HTTP 401 Unauthorized.

#### TC-AUTH-024: Tampered JWT Signature Rejection
- **Objective**: Verify modifying payload or signature of a valid JWT token is rejected by `verifyJwt`.
- **Input**: Modified JWT token string.
- **Expected Outcome**: HTTP 401 Unauthorized.

#### TC-AUTH-025: Complete Authentication & RBAC Lifecycle Test
- **Objective**: Full end-to-end test of root setup, root login, guest creation, guest login, guest access, guest 403 rejection, and session rotation.
- **Input**: Complete sequential test execution.
- **Expected Outcome**: 100% assertions pass across all security boundaries.
