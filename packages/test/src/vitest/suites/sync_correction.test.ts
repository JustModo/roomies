import { describe, it, expect, beforeAll, beforeEach, afterAll, afterEach } from 'vitest';
import { SYNC_CONFIG, type RoomStore } from '@roomies/server';
import { setupTestEnvironment, TestEnvironmentContext } from '../helpers/testFixtures';
import { createTestWsClient, TestWsClient } from '../helpers/wsClient';

describe('Sync drift correction & heartbeat status', () => {
  let env: TestEnvironmentContext;
  let roomStore: RoomStore;
  let client: TestWsClient;

  const setPlayback = (state: 'playing' | 'paused') =>
    roomStore.updatePlayback({ state, intendedState: state, anchorPosition: 100, anchorTime: Date.now(), playbackRate: 1 });

  const corrections = () => client.getAllReceived().filter((m) => m.event === 'sync.correct');

  beforeAll(async () => {
    env = await setupTestEnvironment();
    roomStore = env.server.app.ctx.roomStore;
  });

  beforeEach(async () => {
    roomStore.resetStore();
    roomStore.updateMedia(env.media.mediaFile.id, 'Mock Movie', '', 600);
    roomStore.updatePlayback({ state: 'paused', intendedState: 'paused' });

    client = await createTestWsClient(`${env.server.wsUrl}/ws`, env.admin.token);
    client.send('room.join', {});
    await client.waitForEvent('room.state');
    client.send('sync.status', { status: 'ready' });
    await client.waitForEventMatching('user.status_changed', (msg) => msg.payload.status === 'ready');
  });

  afterEach(async () => {
    await client.close();
  });

  afterAll(async () => {
    await env.cleanup();
  });

  it('sends a soft rate correction that slows a client running ahead', async () => {
    setPlayback('playing');
    client.send('sync.heartbeat', { position: 101, playbackRate: 1 });

    const { payload } = await client.waitForEvent('sync.correct');
    expect(payload.seek).toBeUndefined();
    expect(payload.playbackRate).toBeCloseTo(1 - SYNC_CONFIG.SOFT_CORRECTION_RATE_DELTA);
    expect(payload.position).toBeCloseTo(100, 0);
    expect(payload.correctionDurationMs).toBeGreaterThan(9000);
    expect(payload.correctionDurationMs).toBeLessThan(11000);
  });

  it('sends a soft rate correction that speeds up a client falling behind', async () => {
    setPlayback('playing');
    client.send('sync.heartbeat', { position: 99, playbackRate: 1 });

    const { payload } = await client.waitForEvent('sync.correct');
    expect(payload.playbackRate).toBeCloseTo(1 + SYNC_CONFIG.SOFT_CORRECTION_RATE_DELTA);
  });

  it('does not stack a soft correction on a client already running at a corrected rate', async () => {
    setPlayback('playing');
    client.send('sync.heartbeat', { position: 101, playbackRate: 0.9 });
    await client.flush();

    expect(corrections()).toHaveLength(0);
  });

  it('hard seeks past the hard threshold, then falls back to soft correction during the cooldown', async () => {
    setPlayback('playing');
    client.send('sync.heartbeat', { position: 110, playbackRate: 1 });

    const hard = await client.waitForEvent('sync.correct');
    expect(hard.payload.seek).toBe(true);
    expect(hard.payload.position).toBeCloseTo(100, 0);
    expect(hard.payload.playbackRate).toBeUndefined();

    client.send('sync.heartbeat', { position: 110, playbackRate: 1 });
    const soft = await client.waitForEvent('sync.correct');
    expect(soft.payload.seek).toBeUndefined();
    expect(soft.payload.playbackRate).toBeCloseTo(0.9);
  });

  it('never corrects a paused room, however far the client drifted', async () => {
    setPlayback('paused');
    client.send('sync.heartbeat', { position: 110, playbackRate: 1 });
    client.send('sync.heartbeat', { position: 100.8, playbackRate: 1 });
    await client.flush();

    expect(corrections()).toHaveLength(0);
  });

  it('resets a lingering corrected rate once the client is back in sync', async () => {
    setPlayback('playing');
    client.send('sync.heartbeat', { position: 100, playbackRate: 0.9 });

    const { payload } = await client.waitForEvent('sync.correct');
    expect(payload.playbackRate).toBe(1);
    expect(payload.seek).toBeUndefined();
  });

  it('routes a heartbeat status change to async through status handling', async () => {
    client.send('sync.heartbeat', { status: 'async' });

    const status = await client.waitForEventMatching('user.status_changed', (msg) => msg.payload.status === 'async');
    expect(status.payload.userId).toBe(env.admin.user.id);
    const changed = await client.waitForEvent('media.changed');
    expect(changed.payload.sessionScope).toBe('user');
    expect(roomStore.getState().members[0].status).toBe('async');
  });

  it('refuses a heartbeat status change to async while allowAsyncMode is off', async () => {
    roomStore.updateSettings({ allowAsyncMode: false });
    client.send('sync.heartbeat', { status: 'async' });
    await client.waitForEventMatching('user.status_changed', (msg) => msg.payload.status === 'ready');
    await client.flush();

    expect(roomStore.getState().members[0].status).toBe('ready');
    expect(client.getAllReceived().some((m) => m.event === 'media.changed')).toBe(false);
    expect(client.getAllReceived().some((m) => m.event === 'user.status_changed' && m.payload.status === 'async')).toBe(false);
  });
});
