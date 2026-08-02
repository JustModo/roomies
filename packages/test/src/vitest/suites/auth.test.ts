import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestServer, TestServerContext } from '../helpers/testServer';
import { createTestDatabase, TestDbContext } from '../helpers/testDatabase';

describe('Authentication & Authorization (RBAC)', () => {
  let server: TestServerContext;
  let db: TestDbContext;
  let authToken: string;
  let rootToken: string;

  beforeAll(async () => {
    db = await createTestDatabase();
    server = await createTestServer();
  });

  afterAll(async () => {
    await server.close();
    await db.cleanup();
  });

  it('rejects unauthorized access to protected routes with 401', async () => {
    const res = await fetch(`${server.baseUrl}/api/library`);
    expect(res.status).toBe(401);
  });

  it('allows setting up the initial root account', async () => {
    const res = await fetch(`${server.baseUrl}/api/auth/setup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'password123' }),
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.token).toBeDefined();
    expect(data.user.role).toBe('root');
    rootToken = data.token;
  });

  it('allows logging in with root account credentials', async () => {
    const res = await fetch(`${server.baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'password123' }),
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.token).toBeDefined();
    expect(data.user.role).toBe('root');
    rootToken = data.token;
  });

  it('allows root user to create a guest account', async () => {
    const res = await fetch(`${server.baseUrl}/api/users/guest`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${rootToken}`,
      },
      body: JSON.stringify({ username: 'testguest', password: 'guestpassword123' }),
    });

    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.username).toBe('testguest');
    expect(data.role).toBe('guest');
  });

  it('allows guest account to log in and access protected routes', async () => {
    const res = await fetch(`${server.baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'testguest', password: 'guestpassword123' }),
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.token).toBeDefined();
    authToken = data.token;

    const libRes = await fetch(`${server.baseUrl}/api/library`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    expect(libRes.status).toBe(200);
  });

  it('prevents non-root guest accounts from accessing root-only scan endpoints', async () => {
    const scanRes = await fetch(`${server.baseUrl}/api/library/scan`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${authToken}` },
    });
    expect(scanRes.status).toBe(403);
  });
});
