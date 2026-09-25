import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest';
import type { RoomStore } from '@roomies/server';
import { setupTestEnvironment, TestEnvironmentContext } from '../helpers/testFixtures';
import { createTestWsClient } from '../helpers/wsClient';

describe('Room events: party, emoji limit and member socket ownership', () => {
  let env: TestEnvironmentContext;
  let roomStore: RoomStore;

  const connectedSockets = () => env.server.app.ctx.hub.size;

  const joined = async (token: string) => {
    const client = await createTestWsClient(`${env.server.wsUrl}/ws`, token);
    client.send('room.join', {});
    await client.waitForEvent('room.state');
    return client;
  };

  beforeAll(async () => {
    env = await setupTestEnvironment();
    roomStore = env.server.app.ctx.roomStore;
  });

  beforeEach(() => {
    roomStore.resetStore();
  });

  afterAll(async () => {
    await env.cleanup();
  });

  it("broadcasts party updates merged with the member's previous party state", async () => {
    const admin = await joined(env.admin.token);
    const guest = await joined(env.guest.token);

    guest.send('party.update', { isJoined: true, micMuted: false });
    const updated = await admin.waitForEvent('party.updated');

    expect(updated.payload).toEqual({
      userId: env.guest.user.id,
      party: { isJoined: true, micMuted: false, videoMuted: true },
    });
    expect(roomStore.getState().members.find((m) => m.userId === env.guest.user.id)!.party.isJoined).toBe(true);

    await admin.close();
    await guest.close();
  });

  it('ignores party updates from a socket that never joined the room', async () => {
    const admin = await joined(env.admin.token);
    const outsider = await createTestWsClient(`${env.server.wsUrl}/ws`, env.guest.token);

    outsider.send('party.update', { isJoined: true });
    await outsider.flush();

    expect(outsider.getAllReceived().some((m) => m.event === 'party.updated')).toBe(false);
    expect(admin.getAllReceived().some((m) => m.event === 'party.updated')).toBe(false);

    await admin.close();
    await outsider.close();
  });

  it('drops emoji reactions sent faster than one per 500ms per user', async () => {
    const admin = await joined(env.admin.token);
    const reactions = () => admin.getAllReceived().filter((m) => m.event === 'emoji.reaction');

    admin.send('emoji.send', { emoji: '🔥' });
    admin.send('emoji.send', { emoji: '🎉' });
    admin.send('emoji.send', { emoji: '👍' });
    await admin.flush();

    expect(reactions()).toHaveLength(1);
    expect(reactions()[0].payload).toMatchObject({ emoji: '🔥' });

    await new Promise((resolve) => setTimeout(resolve, 550));
    admin.send('emoji.send', { emoji: '👍' });
    const later = await admin.waitForEventMatching('emoji.reaction', (msg) => msg.payload.emoji === '👍');
    expect(later.payload.userId).toBe(env.admin.user.id);

    await admin.close();
  });

  it('keeps a member in the room when an older tab of the same user disconnects', async () => {
    const baseline = connectedSockets();
    const firstTab = await joined(env.admin.token);
    const secondTab = await joined(env.admin.token);

    expect(roomStore.getState().members.filter((m) => m.userId === env.admin.user.id)).toHaveLength(1);

    await firstTab.close();
    await vi.waitFor(() => expect(connectedSockets()).toBe(baseline + 1));

    expect(roomStore.getState().members.some((m) => m.userId === env.admin.user.id)).toBe(true);
    expect(secondTab.getAllReceived().some((m) => m.event === 'user.left')).toBe(false);

    await secondTab.close();
    await vi.waitFor(() => expect(roomStore.getState().members.some((m) => m.userId === env.admin.user.id)).toBe(false));
  });
});
