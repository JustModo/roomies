import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestServer, TestServerContext } from '../helpers/testServer';
import { createTestDatabase, TestDbContext } from '../helpers/testDatabase';
import { createAdminAccount } from '../helpers/testFixtures';

const cookieValue = (res: Response, name: string): string | undefined => {
  const header = res.headers.getSetCookie().find((c) => c.startsWith(`${name}=`));
  return header?.slice(name.length + 1).split(';')[0];
};

describe('Auth sessions: refresh, logout and media cookies', () => {
  let server: TestServerContext;
  let db: TestDbContext;

  const login = () =>
    fetch(`${server.baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'password123' }),
    });

  const refresh = (refreshToken: string) =>
    fetch(`${server.baseUrl}/api/auth/refresh`, {
      method: 'POST',
      headers: { Cookie: `roomies_refresh=${refreshToken}` },
    });

  beforeAll(async () => {
    db = await createTestDatabase();
    server = await createTestServer();
    await createAdminAccount(server.baseUrl);
  });

  afterAll(async () => {
    await server.close();
    await db.cleanup();
  });

  it('sets an httpOnly refresh cookie scoped to /api/auth and a media cookie holding the access token', async () => {
    const res = await login();
    expect(res.status).toBe(200);
    const body = await res.json();

    const cookies = res.headers.getSetCookie();
    const refreshCookie = cookies.find((c) => c.startsWith('roomies_refresh='))!;
    const mediaCookie = cookies.find((c) => c.startsWith('roomies_media='))!;

    expect(refreshCookie).toMatch(/Path=\/api\/auth/);
    expect(refreshCookie).toMatch(/HttpOnly/);
    expect(mediaCookie).toMatch(/Path=\/(;|$)/);
    expect(cookieValue(res, 'roomies_media')).toBe(body.token);
  });

  it('rotates the refresh token and issues a working access token', async () => {
    const first = cookieValue(await login(), 'roomies_refresh')!;

    const res = await refresh(first);
    expect(res.status).toBe(200);
    const body = await res.json();
    const second = cookieValue(res, 'roomies_refresh')!;

    expect(second).toBeDefined();
    expect(second).not.toBe(first);
    expect(body.user.username).toBe('admin');

    const me = await fetch(`${server.baseUrl}/api/users/me`, { headers: { Authorization: `Bearer ${body.token}` } });
    expect(me.status).toBe(200);

    expect((await refresh(first)).status).toBe(401);
    expect((await refresh(second)).status).toBe(200);
  });

  it('rejects refresh without a cookie', async () => {
    const res = await fetch(`${server.baseUrl}/api/auth/refresh`, { method: 'POST' });
    expect(res.status).toBe(401);
  });

  it('rejects a refresh token whose session row has expired', async () => {
    const token = cookieValue(await login(), 'roomies_refresh')!;
    await db.prisma.refreshToken.updateMany({ where: { token }, data: { expiresAt: new Date(Date.now() - 1000) } });

    expect((await refresh(token)).status).toBe(401);
  });

  it('lets only one of two concurrent refreshes with the same token succeed', async () => {
    const token = cookieValue(await login(), 'roomies_refresh')!;

    const statuses = (await Promise.all([refresh(token), refresh(token)])).map((r) => r.status).sort();
    expect(statuses).toEqual([200, 401]);
  });

  it('logs out: clears cookies, revokes the refresh token and the access token session', async () => {
    const res = await login();
    const { token } = await res.json();
    const refreshToken = cookieValue(res, 'roomies_refresh')!;

    const out = await fetch(`${server.baseUrl}/api/auth/logout`, {
      method: 'POST',
      headers: { Cookie: `roomies_refresh=${refreshToken}` },
    });
    expect(out.status).toBe(204);
    expect(cookieValue(out, 'roomies_refresh')).toBe('');
    expect(cookieValue(out, 'roomies_media')).toBe('');

    expect((await refresh(refreshToken)).status).toBe(401);
    const me = await fetch(`${server.baseUrl}/api/users/me`, { headers: { Authorization: `Bearer ${token}` } });
    expect(me.status).toBe(401);
  });

  it('answers the media check with 200 for a valid media cookie and 401 otherwise', async () => {
    const res = await login();
    const media = cookieValue(res, 'roomies_media')!;

    const ok = await fetch(`${server.baseUrl}/api/auth/media`, { headers: { Cookie: `roomies_media=${media}` } });
    expect(ok.status).toBe(200);

    const missing = await fetch(`${server.baseUrl}/api/auth/media`);
    expect(missing.status).toBe(401);

    const bogus = await fetch(`${server.baseUrl}/api/auth/media`, { headers: { Cookie: 'roomies_media=not-a-jwt' } });
    expect(bogus.status).toBe(401);
  });
});
