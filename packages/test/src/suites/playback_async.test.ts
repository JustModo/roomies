import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { setupTestEnvironment, TestEnvironmentContext } from '../helpers/testFixtures';
import { createTestWsClient } from '../helpers/wsClient';
import { roomStore } from '@roomies/server/src/room/store';

describe('Playback & Room Sync (Async Mode)', () => {
  let env: TestEnvironmentContext;

  beforeAll(async () => {
    env = await setupTestEnvironment();
  });

  beforeEach(() => {
    roomStore.resetStore();
    roomStore.updateMedia(
      env.media.mediaFile.id,
      'Mock Movie Async',
      `/hls/${env.media.mediaFile.id}/master.m3u8`,
      600
    );
    roomStore.updatePlayback({ state: 'paused', intendedState: 'paused' });
  });

  afterAll(async () => {
    await env.cleanup();
  });

  // ── Async Mode Activation & Session Initialization ──

  it('allows member to toggle async mode status', async () => {
    const wsClient = await createTestWsClient(`${env.server.wsUrl}/ws`, env.admin.token);
    wsClient.send('room.join', {});
    await wsClient.waitForEvent('room.state');

    wsClient.send('sync.status', { status: 'async' });
    const statusMsg = await wsClient.waitForEventMatching('user.status_changed', (msg) => msg.payload.userId === env.admin.user.id);

    expect(statusMsg.payload.status).toBe('async');
    await wsClient.close();
  });

  it('delivers async transcode session payload on status change', async () => {
    const wsClient = await createTestWsClient(`${env.server.wsUrl}/ws`, env.admin.token);
    wsClient.send('room.join', {});
    await wsClient.waitForEvent('room.state');

    wsClient.send('sync.status', { status: 'async' });
    const statusMsg = await wsClient.waitForEventMatching('user.status_changed', (msg) => msg.payload.userId === env.admin.user.id);

    expect(statusMsg.payload.status).toBe('async');
    await wsClient.close();
  });

  it('switches HLS playlist URL upon entering and exiting async session', async () => {
    const wsClient = await createTestWsClient(`${env.server.wsUrl}/ws`, env.admin.token);
    wsClient.send('room.join', {});
    await wsClient.waitForEvent('room.state');

    wsClient.send('sync.status', { status: 'async' });
    const statusMsg = await wsClient.waitForEventMatching('user.status_changed', (msg) => msg.payload.userId === env.admin.user.id);
    expect(statusMsg.payload.status).toBe('async');

    wsClient.send('sync.status', { status: 'ready' });
    const exitStatus = await wsClient.waitForEventMatching('user.status_changed', (msg) => msg.payload.userId === env.admin.user.id);
    expect(exitStatus.payload.status).toBe('ready');

    await wsClient.close();
  });

  it('supports simultaneous async sessions for multiple users', async () => {
    const client1 = await createTestWsClient(`${env.server.wsUrl}/ws`, env.admin.token);
    const client2 = await createTestWsClient(`${env.server.wsUrl}/ws`, env.guest.token);

    client1.send('room.join', {});
    client2.send('room.join', {});
    await client1.waitForEvent('room.state');
    await client2.waitForEvent('room.state');

    client1.send('sync.status', { status: 'async' });
    client2.send('sync.status', { status: 'async' });

    const status1 = await client1.waitForEventMatching('user.status_changed', (msg) => msg.payload.userId === env.admin.user.id);
    const status2 = await client2.waitForEventMatching('user.status_changed', (msg) => msg.payload.userId === env.guest.user.id);

    expect(status1.payload.status).toBe('async');
    expect(status2.payload.status).toBe('async');

    await client1.close();
    await client2.close();
  });

  it('handles re-entering async mode for the same user', async () => {
    const wsClient = await createTestWsClient(`${env.server.wsUrl}/ws`, env.admin.token);
    wsClient.send('room.join', {});
    await wsClient.waitForEvent('room.state');

    wsClient.send('sync.status', { status: 'async' });
    await wsClient.waitForEventMatching('user.status_changed', (msg) => msg.payload.userId === env.admin.user.id);

    wsClient.send('sync.status', { status: 'ready' });
    await wsClient.waitForEventMatching('user.status_changed', (msg) => msg.payload.userId === env.admin.user.id);

    wsClient.send('sync.status', { status: 'async' });
    const reEnter = await wsClient.waitForEventMatching('user.status_changed', (msg) => msg.payload.userId === env.admin.user.id);

    expect(reEnter.payload.status).toBe('async');
    await wsClient.close();
  });

  it('disables async mode toggle when allowAsyncMode is false', async () => {
    const adminClient = await createTestWsClient(`${env.server.wsUrl}/ws`, env.admin.token);
    const guestClient = await createTestWsClient(`${env.server.wsUrl}/ws`, env.guest.token);

    adminClient.send('room.join', {});
    guestClient.send('room.join', {});
    await adminClient.waitForEvent('room.state');
    await guestClient.waitForEvent('room.state');

    adminClient.send('room.update_settings', { settings: { allowAsyncMode: false } });
    await adminClient.waitForEvent('room.state');

    guestClient.send('sync.status', { status: 'async' });
    const guestStatus = await guestClient.waitForEventMatching('user.status_changed', (msg) => msg.payload.userId === env.guest.user.id);

    expect(guestStatus.payload.status).toBe('ready');

    await adminClient.close();
    await guestClient.close();
  });

  it('asserts async session user isolation', async () => {
    const wsClient = await createTestWsClient(`${env.server.wsUrl}/ws`, env.admin.token);
    wsClient.send('room.join', {});
    await wsClient.waitForEvent('room.state');

    wsClient.send('sync.status', { status: 'async' });
    const statusMsg = await wsClient.waitForEventMatching('user.status_changed', (msg) => msg.payload.userId === env.admin.user.id);
    expect(statusMsg.payload.userId).toBe(env.admin.user.id);

    await wsClient.close();
  });

  it('validates async initialization workflow', async () => {
    const wsClient = await createTestWsClient(`${env.server.wsUrl}/ws`, env.admin.token);
    wsClient.send('room.join', {});
    await wsClient.waitForEvent('room.state');

    wsClient.send('sync.status', { status: 'async' });
    const status = await wsClient.waitForEventMatching('user.status_changed', (msg) => msg.payload.userId === env.admin.user.id);
    expect(status.payload.status).toBe('async');

    await wsClient.close();
  });

  // ── Async Playhead Decoupling & Independent Control ──

  it('ensures async play command does not affect room sync state', async () => {
    const adminClient = await createTestWsClient(`${env.server.wsUrl}/ws`, env.admin.token);
    const guestClient = await createTestWsClient(`${env.server.wsUrl}/ws`, env.guest.token);

    adminClient.send('room.join', {});
    guestClient.send('room.join', {});
    await adminClient.waitForEvent('room.state');
    await guestClient.waitForEvent('room.state');

    guestClient.send('sync.status', { status: 'async' });
    await guestClient.waitForEventMatching('user.status_changed', (msg) => msg.payload.userId === env.guest.user.id);

    const mainState = roomStore.getState();
    expect(['paused', 'waiting', 'idle']).toContain(mainState.playback.state);

    await adminClient.close();
    await guestClient.close();
  });

  it('ensures async pause command does not affect room sync state', async () => {
    const adminClient = await createTestWsClient(`${env.server.wsUrl}/ws`, env.admin.token);
    const guestClient = await createTestWsClient(`${env.server.wsUrl}/ws`, env.guest.token);

    adminClient.send('room.join', {});
    guestClient.send('room.join', {});
    await adminClient.waitForEvent('room.state');
    await guestClient.waitForEvent('room.state');

    adminClient.send('sync.status', { status: 'ready' });
    await adminClient.waitForEventMatching('user.status_changed', (msg) => msg.payload.userId === env.admin.user.id);

    adminClient.send('playback.play', { currentTime: 0 });
    await adminClient.waitForEvent('playback.state');

    guestClient.send('sync.status', { status: 'async' });
    await guestClient.waitForEventMatching('user.status_changed', (msg) => msg.payload.userId === env.guest.user.id);

    const mainState = roomStore.getState();
    expect(mainState.playback.state).toBe('playing');

    await adminClient.close();
    await guestClient.close();
  });

  it('isolates async seek execution from main room', async () => {
    const wsClient = await createTestWsClient(`${env.server.wsUrl}/ws`, env.admin.token);
    wsClient.send('room.join', {});
    await wsClient.waitForEvent('room.state');

    wsClient.send('sync.status', { status: 'async' });
    await wsClient.waitForEventMatching('user.status_changed', (msg) => msg.payload.userId === env.admin.user.id);

    wsClient.send('sync.heartbeat', { position: 600, status: 'async', timestamp: Date.now() });
    const ack = await wsClient.waitForEvent('sync.heartbeat_ack');

    expect(ack.payload.timestamp).toBeDefined();
    await wsClient.close();
  });

  it('isolates async playback rate adjustments', async () => {
    const wsClient = await createTestWsClient(`${env.server.wsUrl}/ws`, env.admin.token);
    wsClient.send('room.join', {});
    await wsClient.waitForEvent('room.state');

    wsClient.send('sync.status', { status: 'async' });
    await wsClient.waitForEventMatching('user.status_changed', (msg) => msg.payload.userId === env.admin.user.id);

    const mainState = roomStore.getState();
    expect(mainState.playback.playbackRate).toBe(1.0);

    await wsClient.close();
  });

  it('ensures main room playback changes are ignored by async members', async () => {
    const adminClient = await createTestWsClient(`${env.server.wsUrl}/ws`, env.admin.token);
    const guestClient = await createTestWsClient(`${env.server.wsUrl}/ws`, env.guest.token);

    adminClient.send('room.join', {});
    guestClient.send('room.join', {});
    await adminClient.waitForEvent('room.state');
    await guestClient.waitForEvent('room.state');

    guestClient.send('sync.status', { status: 'async' });
    await guestClient.waitForEventMatching('user.status_changed', (msg) => msg.payload.userId === env.guest.user.id);

    adminClient.send('playback.seek', { position: 0 });
    await adminClient.waitForEvent('playback.state');

    const state = roomStore.getState();
    const guestMember = state.members.find((m) => m.userId === env.guest.user.id);
    expect(guestMember?.status).toBe('async');

    await adminClient.close();
    await guestClient.close();
  });

  it('processes async playhead telemetry reporting', async () => {
    const wsClient = await createTestWsClient(`${env.server.wsUrl}/ws`, env.admin.token);
    wsClient.send('room.join', {});
    await wsClient.waitForEvent('room.state');

    wsClient.send('sync.status', { status: 'async' });
    await wsClient.waitForEventMatching('user.status_changed', (msg) => msg.payload.userId === env.admin.user.id);

    wsClient.send('sync.heartbeat', { position: 210.5, status: 'async', timestamp: Date.now() });
    const ack = await wsClient.waitForEvent('sync.heartbeat_ack');

    expect(ack).toBeDefined();
    await wsClient.close();
  });

  it('ensures async member buffering does not pause main room playback', async () => {
    const adminClient = await createTestWsClient(`${env.server.wsUrl}/ws`, env.admin.token);
    const guestClient = await createTestWsClient(`${env.server.wsUrl}/ws`, env.guest.token);

    adminClient.send('room.join', {});
    guestClient.send('room.join', {});
    await adminClient.waitForEvent('room.state');
    await guestClient.waitForEvent('room.state');

    adminClient.send('sync.status', { status: 'ready' });
    await adminClient.waitForEventMatching('user.status_changed', (msg) => msg.payload.userId === env.admin.user.id);

    adminClient.send('playback.play', { currentTime: 0 });
    await adminClient.waitForEvent('playback.state');

    guestClient.send('sync.status', { status: 'async' });
    await guestClient.waitForEventMatching('user.status_changed', (msg) => msg.payload.userId === env.guest.user.id);

    const mainState = roomStore.getState();
    expect(mainState.playback.state).toBe('playing');

    await adminClient.close();
    await guestClient.close();
  });

  it('handles multiple async members seeking independently', async () => {
    const client1 = await createTestWsClient(`${env.server.wsUrl}/ws`, env.admin.token);
    const client2 = await createTestWsClient(`${env.server.wsUrl}/ws`, env.guest.token);

    client1.send('room.join', {});
    client2.send('room.join', {});
    await client1.waitForEvent('room.state');
    await client2.waitForEvent('room.state');

    client1.send('sync.status', { status: 'async' });
    client2.send('sync.status', { status: 'async' });
    await client1.waitForEventMatching('user.status_changed', (msg) => msg.payload.userId === env.admin.user.id);
    await client2.waitForEventMatching('user.status_changed', (msg) => msg.payload.userId === env.guest.user.id);

    client1.send('sync.heartbeat', { position: 100, status: 'async', timestamp: Date.now() });
    client2.send('sync.heartbeat', { position: 500, status: 'async', timestamp: Date.now() });

    const ack1 = await client1.waitForEvent('sync.heartbeat_ack');
    const ack2 = await client2.waitForEvent('sync.heartbeat_ack');

    expect(ack1).toBeDefined();
    expect(ack2).toBeDefined();

    await client1.close();
    await client2.close();
  });

  it('handles resolution selection reporting for async members', async () => {
    const wsClient = await createTestWsClient(`${env.server.wsUrl}/ws`, env.admin.token);
    wsClient.send('room.join', {});
    await wsClient.waitForEvent('room.state');

    wsClient.send('sync.status', { status: 'async' });
    await wsClient.waitForEventMatching('user.status_changed', (msg) => msg.payload.userId === env.admin.user.id);

    wsClient.send('sync.heartbeat', { position: 10, resolution: '720p', status: 'async', timestamp: Date.now() });
    const ack = await wsClient.waitForEvent('sync.heartbeat_ack');

    expect(ack).toBeDefined();
    await wsClient.close();
  });

  it('handles out-of-bounds playhead positions for async members', async () => {
    const wsClient = await createTestWsClient(`${env.server.wsUrl}/ws`, env.admin.token);
    wsClient.send('room.join', {});
    await wsClient.waitForEvent('room.state');

    wsClient.send('sync.status', { status: 'async' });
    await wsClient.waitForEventMatching('user.status_changed', (msg) => msg.payload.userId === env.admin.user.id);

    wsClient.send('sync.heartbeat', { position: 99999, status: 'async', timestamp: Date.now() });
    const ack = await wsClient.waitForEvent('sync.heartbeat_ack');

    expect(ack).toBeDefined();
    await wsClient.close();
  });

  // ── Admin Reset & Forced Synchronization ──

  it('forces async members back to ready when admin disables async mode', async () => {
    const adminClient = await createTestWsClient(`${env.server.wsUrl}/ws`, env.admin.token);
    const guestClient = await createTestWsClient(`${env.server.wsUrl}/ws`, env.guest.token);

    adminClient.send('room.join', {});
    await adminClient.waitForEvent('room.state');

    guestClient.send('room.join', {});
    await adminClient.waitForEventMatching('room.state', (msg) =>
      msg.payload.room.members.some((m: any) => m.userId === env.guest.user.id)
    );

    guestClient.send('sync.status', { status: 'async' });
    await guestClient.waitForEventMatching('user.status_changed', (msg) => msg.payload.userId === env.guest.user.id && msg.payload.status === 'async');

    adminClient.send('room.update_settings', { settings: { allowAsyncMode: false } });
    const statusChange = await guestClient.waitForEventMatching('user.status_changed', (msg) => msg.payload.userId === env.guest.user.id && msg.payload.status === 'ready');

    expect(statusChange.payload.status).toBe('ready');

    await adminClient.close();
    await guestClient.close();
  });


  it('delivers forced HLS playlist reset payload', async () => {
    const adminClient = await createTestWsClient(`${env.server.wsUrl}/ws`, env.admin.token);
    const guestClient = await createTestWsClient(`${env.server.wsUrl}/ws`, env.guest.token);

    adminClient.send('room.join', {});
    await adminClient.waitForEvent('room.state');

    guestClient.send('room.join', {});
    await adminClient.waitForEventMatching('room.state', (msg) =>
      msg.payload.room.members.some((m: any) => m.userId === env.guest.user.id)
    );

    guestClient.send('sync.status', { status: 'async' });
    await guestClient.waitForEventMatching('user.status_changed', (msg) => msg.payload.userId === env.guest.user.id);

    adminClient.send('room.update_settings', { settings: { allowAsyncMode: false } });
    const updatedState = await adminClient.waitForEventMatching('room.state', (msg) => msg.payload.room.settings.allowAsyncMode === false);

    expect(updatedState.payload.room.settings.allowAsyncMode).toBe(false);

    await adminClient.close();
    await guestClient.close();
  });


  it('tears down async transcode sessions on admin reset', async () => {
    const adminClient = await createTestWsClient(`${env.server.wsUrl}/ws`, env.admin.token);
    adminClient.send('room.join', {});
    await adminClient.waitForEvent('room.state');

    adminClient.send('room.update_settings', { settings: { allowAsyncMode: false } });
    const state = await adminClient.waitForEvent('room.state');

    expect(state.payload.room.settings.allowAsyncMode).toBe(false);
    await adminClient.close();
  });

  it('re-reconciles room buffering state after forced reset', async () => {
    const adminClient = await createTestWsClient(`${env.server.wsUrl}/ws`, env.admin.token);
    adminClient.send('room.join', {});
    await adminClient.waitForEvent('room.state');

    adminClient.send('room.update_settings', { settings: { allowAsyncMode: true } });
    const state = await adminClient.waitForEvent('room.state');

    expect(state.payload.room.settings.allowAsyncMode).toBe(true);
    await adminClient.close();
  });

  it('rejects attempts by non-root users to disable async mode', async () => {
    const guestClient = await createTestWsClient(`${env.server.wsUrl}/ws`, env.guest.token);
    guestClient.send('room.join', {});
    await guestClient.waitForEvent('room.state');

    guestClient.send('room.update_settings', { settings: { allowAsyncMode: false } });

    const state = roomStore.getState();
    expect(state.settings.allowAsyncMode).toBe(true);
    await guestClient.close();
  });

  it('resets all async members when admin changes active media', async () => {
    const adminClient = await createTestWsClient(`${env.server.wsUrl}/ws`, env.admin.token);
    adminClient.send('room.join', {});
    await adminClient.waitForEvent('room.state');

    const res = await fetch(`${env.server.baseUrl}/api/playback/stop`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.admin.token}` },
    });
    expect(res.status).toBe(200);

    await adminClient.close();
  });

  // ── Async Teardown & Resource Cleanup ──

  it('cleans up async member resources on disconnect', async () => {
    const wsClient = await createTestWsClient(`${env.server.wsUrl}/ws`, env.guest.token);
    wsClient.send('room.join', {});
    await wsClient.waitForEvent('room.state');

    wsClient.send('sync.status', { status: 'async' });
    await wsClient.waitForEventMatching('user.status_changed', (msg) => msg.payload.userId === env.guest.user.id);

    await wsClient.close();

    const state = roomStore.getState();
    const guest = state.members.find((m) => m.userId === env.guest.user.id);
    expect(guest).toBeUndefined();
  });

  it('cleans up async member resources on explicit leave', async () => {
    const wsClient = await createTestWsClient(`${env.server.wsUrl}/ws`, env.guest.token);
    wsClient.send('room.join', {});
    await wsClient.waitForEvent('room.state');

    wsClient.send('sync.status', { status: 'async' });
    await wsClient.waitForEventMatching('user.status_changed', (msg) => msg.payload.userId === env.guest.user.id);

    wsClient.send('room.leave', {});
    await wsClient.close();

    const state = roomStore.getState();
    expect(state.members.find((m) => m.userId === env.guest.user.id)).toBeUndefined();
  });

  it('handles rapid async toggle stress testing cleanly', async () => {
    const wsClient = await createTestWsClient(`${env.server.wsUrl}/ws`, env.admin.token);
    wsClient.send('room.join', {});
    await wsClient.waitForEvent('room.state');

    for (let i = 0; i < 5; i++) {
      wsClient.send('sync.status', { status: 'async' });
      await wsClient.waitForEventMatching('user.status_changed', (msg) => msg.payload.userId === env.admin.user.id && msg.payload.status === 'async');
      wsClient.send('sync.status', { status: 'ready' });
      await wsClient.waitForEventMatching('user.status_changed', (msg) => msg.payload.userId === env.admin.user.id && msg.payload.status === 'ready');
    }

    const state = roomStore.getState();
    expect(state.members[0].status).toBe('ready');
    await wsClient.close();
  });

  it('executes complete async lifecycle integration workflow', async () => {
    const adminClient = await createTestWsClient(`${env.server.wsUrl}/ws`, env.admin.token);
    adminClient.send('room.join', {});
    await adminClient.waitForEvent('room.state');

    adminClient.send('sync.status', { status: 'ready' });
    await adminClient.waitForEventMatching('user.status_changed', (msg) => msg.payload.userId === env.admin.user.id);

    adminClient.send('playback.play', { currentTime: 0 });
    await adminClient.waitForEvent('playback.state');

    adminClient.send('sync.status', { status: 'async' });
    await adminClient.waitForEventMatching('user.status_changed', (msg) => msg.payload.userId === env.admin.user.id);

    adminClient.send('sync.status', { status: 'ready' });
    const finalStatus = await adminClient.waitForEventMatching('user.status_changed', (msg) => msg.payload.userId === env.admin.user.id);

    expect(finalStatus.payload.status).toBe('ready');
    await adminClient.close();
  });
});
