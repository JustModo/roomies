# `@roomies/test` — Test Infrastructure Package

This package contains the test suites, environment sandboxing setup, and testing helpers for the Roomies monorepo.

## Structure

- `src/setup/global.ts`: Vitest `globalSetup` hook. Runs once per test process run to provision temp directories (`media/`, `cache/`, `config/`, SQLite `test.db`) and set process environment variables (`ROOMIES_CONFIG_PATH`, `NODE_ENV=test`) before any application module is evaluated.
- `src/setup/env.ts`: Vitest `setupFiles` hook. Runs before each test suite file to reset global registries, configurations, and Prisma connections.
- `src/helpers/testFixtures.ts`: Reusable test environment builder (`setupTestEnvironment()`) provisioning database, test server, root admin user, guest user, and mock media.
- `src/helpers/testDatabase.ts`: Provisions isolated SQLite database file per context and exports connected Prisma client.
- `src/helpers/testServer.ts`: Starts Fastify test server with `BootstrapOptions` configured to bypass hardware probing and disk scans.
- `src/helpers/wsClient.ts`: WebSocket test client with generic payload support, predicate-matching event listeners (`waitForEventMatching`), and race-free queue handling.

## Running Tests

```bash
# Run all test suites
pnpm --filter @roomies/test test

# Run type check across test package
pnpm --filter @roomies/test typecheck

# Run a specific suite in isolation
npx vitest run packages/test/src/suites/auth.test.ts
```

## Best Practices

1. **Avoid Hardcoded File Paths & Singletons**: Use `setupTestEnvironment()` or `createTestDatabase()` to get scoped Prisma clients and server URLs.
2. **Use Event Matching**: When testing multi-client WebSocket flows, use `client.waitForEventMatching('user.status_changed', (msg) => msg.payload.userId === targetUserId)` to avoid event broadcast cross-talk.
3. **Clean Teardown**: Always call `await env.cleanup()` in your suite's `afterAll` hook.
