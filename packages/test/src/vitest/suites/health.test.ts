import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestServer, TestServerContext } from '../helpers/testServer';
import { createTestDatabase, TestDbContext } from '../helpers/testDatabase';

describe('Health endpoint', () => {
  let server: TestServerContext;
  let db: TestDbContext;

  beforeAll(async () => {
    db = await createTestDatabase();
    server = await createTestServer();
  });

  afterAll(async () => {
    await server.close();
    await db.cleanup();
  });

  it('reports ok without a token, so the docker healthcheck can reach it', async () => {
    const res = await fetch(`${server.baseUrl}/api/health`);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: 'ok' });
  });
});
