import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import WebSocket from 'ws';
import { setupTestEnvironment, createGuestAccount, TestEnvironmentContext } from '../helpers/testFixtures';
import { createTestWsClient } from '../helpers/wsClient';

describe('Users routes', () => {
  let env: TestEnvironmentContext;

  const api = (path: string, token: string, init: RequestInit = {}) =>
    fetch(`${env.server.baseUrl}/api/users${path}`, {
      ...init,
      headers: { ...(init.body ? { 'Content-Type': 'application/json' } : {}), Authorization: `Bearer ${token}` },
    });

  beforeAll(async () => {
    env = await setupTestEnvironment();
  });

  afterAll(async () => {
    await env.cleanup();
  });

  it('lists users for root and forbids guests', async () => {
    const res = await api('/', env.admin.token);
    expect(res.status).toBe(200);
    const users = await res.json();
    expect(users.map((u: any) => u.username).sort()).toEqual(['admin', 'guestuser']);
    expect(users[0]).not.toHaveProperty('password');

    expect((await api('/', env.guest.token)).status).toBe(403);
  });

  it('returns 409 when creating a guest with a taken username', async () => {
    const res = await api('/guest', env.admin.token, {
      method: 'POST',
      body: JSON.stringify({ username: 'guestuser', password: 'anotherpassword' }),
    });
    expect(res.status).toBe(409);
  });

  it('forbids guests from creating guests', async () => {
    const res = await api('/guest', env.guest.token, {
      method: 'POST',
      body: JSON.stringify({ username: 'sneaky', password: 'sneakypassword' }),
    });
    expect(res.status).toBe(403);
  });

  it('refuses to delete the root user and 404s an unknown id', async () => {
    expect((await api(`/${env.admin.user.id}`, env.admin.token, { method: 'DELETE' })).status).toBe(400);
    expect((await api('/does-not-exist', env.admin.token, { method: 'DELETE' })).status).toBe(404);
  });

  it('deletes a user and kicks their room and voice sockets with account_deleted', async () => {
    const doomed = await createGuestAccount(env.server.baseUrl, env.admin.token, 'doomed', 'doomedpassword');

    const room = await createTestWsClient(`${env.server.wsUrl}/ws`, doomed.token);
    room.send('room.join', {});
    await room.waitForEvent('room.state');
    const roomClosed = new Promise<void>((resolve) => room.ws.once('close', () => resolve()));

    const voice = new WebSocket(`${env.server.wsUrl}/ws/voice`, [`bearer.${doomed.token}`]);
    const voiceMessages: any[] = [];
    voice.on('message', (d, isBinary) => {
      if (!isBinary) voiceMessages.push(JSON.parse(d.toString()));
    });
    await new Promise((resolve) => voice.once('open', resolve));
    voice.send(JSON.stringify({ event: 'join' }));
    await vi.waitFor(() => expect(voiceMessages.some((m) => m.event === 'joined')).toBe(true));
    const voiceClosed = new Promise<void>((resolve) => voice.once('close', () => resolve()));

    const res = await api(`/${doomed.user.id}`, env.admin.token, { method: 'DELETE' });
    expect(res.status).toBe(204);

    const kicked = await room.waitForEvent('auth.kicked');
    expect(kicked.payload.reason).toBe('account_deleted');
    await roomClosed;

    await voiceClosed;
    expect(voiceMessages).toContainEqual({ event: 'error', payload: 'Unauthorized' });

    const me = await fetch(`${env.server.baseUrl}/api/users/me`, { headers: { Authorization: `Bearer ${doomed.token}` } });
    expect(me.status).toBe(401);
  });
});
