# Playwright E2E Auth Fixture & Test Failure Analysis

## Executive Summary

During execution of `pnpm test:e2e`:
- **15 out of 20 tests PASSED**.
- **5 tests failed** with error: `Received string: "http://localhost:5173/login"` when expecting `/room`.

---

## 1. Root Cause Analysis

### The Failure Mechanism:
1. `roomFixture.ts` creates fresh, unauthenticated Playwright browser contexts (`adminContext` and `guestContext`).
2. Fresh browser contexts have empty `localStorage`.
3. When test specs call `adminPage.goto('/room')` or `guestPage.goto('/room')`, the frontend `ProtectedRoute` in `AppRouter.tsx` checks `localStorage.getItem('token')`.
4. Because `token` is `null`, `ProtectedRoute` immediately executes `<Navigate to="/login" replace />`, redirecting the page to `http://localhost:5173/login`.

---

## 2. Proposed Resolution Strategy

Enhance `packages/test/e2e/fixtures/roomFixture.ts` with automated JWT authentication seeding:

1. **Server Setup Check**:
   - Query `GET http://localhost:3000/api/auth/status`. If `isSetup === false`, issue `POST /api/auth/setup` to register initial root account (`username: 'admin'`, `password: 'Password123!'`).
2. **Token Generation via API**:
   - Issue `POST /api/auth/login` for `admin` to receive `adminToken`.
   - Issue `POST /api/users` (authorized by `adminToken`) to create a test guest account, then issue `POST /api/auth/login` for `guest` to receive `guestToken`.
3. **Session Injection into Browser Contexts**:
   - Navigate pages to `baseURL` (`/`) and inject tokens into `localStorage.setItem('token', token)`.
4. **Clean `/room` Navigation**:
   - Navigate `adminPage` and `guestPage` to `/room` with pre-validated sessions, bypassing `/login` redirects.

---

## 3. Verification Plan

1. Re-run `pnpm test:e2e` across all 7 spec files.
2. Confirm 100% of 20 Playwright E2E tests pass cleanly.
