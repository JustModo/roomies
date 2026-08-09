import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestServer, TestServerContext } from '../helpers/testServer';
import { createTestDatabase, TestDbContext } from '../helpers/testDatabase';

// NOTE: Kept out of auth.test.ts because the limiter keys on IP and every test
// shares 127.0.0.1 — exhausting it there would break unrelated login tests.
describe('Login rate limiting', () => {
  let server: TestServerContext;
  let db: TestDbContext;

  const login = (password: string) =>
    fetch(`${server.baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password }),
    });

  beforeAll(async () => {
    db = await createTestDatabase();
    server = await createTestServer();

    await fetch(`${server.baseUrl}/api/auth/setup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'password123' }),
    });
  });

  afterAll(async () => {
    await server.close();
    await db.cleanup();
  });

  it('blocks further attempts once the failure limit is reached', async () => {
    // A success first, both as a baseline and to clear any earlier attempts.
    expect((await login('password123')).status).toBe(200);

    for (let i = 0; i < 5; i += 1) {
      expect((await login('wrong-password')).status).toBe(401);
    }

    expect((await login('wrong-password')).status).toBe(429);

    // Correct credentials are refused too, otherwise the limit is trivially bypassed.
    expect((await login('password123')).status).toBe(429);
  });
});
