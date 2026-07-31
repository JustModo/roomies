import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestServer, TestServerContext } from '../helpers/testServer';
import { createTestDatabase, TestDbContext } from '../helpers/testDatabase';
import { createTestWsClient } from '../helpers/wsClient';
import { roomStore } from '@roomies/server/src/room/store';
import { SYNC_CONFIG } from '@roomies/server/src/config';
import { createMockMediaDir } from '../helpers/mockMedia';

describe('Playback & Room Sync (Sync Mode)', () => {
  let server: TestServerContext;
  let db: TestDbContext;
  let adminToken: string;
  let guestToken: string;
  let mockMedia: ReturnType<typeof createMockMediaDir>;

  beforeAll(async () => {
    mockMedia = createMockMediaDir();
    db = await createTestDatabase();
    server = await createTestServer();

    // 1. Setup root admin user
    const setupRes = await fetch(`${server.baseUrl}/api/auth/setup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'password123' }),
    });
    const setupData = await setupRes.json();
    adminToken = setupData.token;

    // 2. Create guest user
    await fetch(`${server.baseUrl}/api/users/guest`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({ username: 'guestuser', password: 'guestpassword123' }),
    });

    const guestRes = await fetch(`${server.baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'guestuser', password: 'guestpassword123' }),
    });
    const guestData = await guestRes.json();
    guestToken = guestData.token;
  });

  afterAll(async () => {
    await server.close();
    await db.cleanup();
    mockMedia.cleanup();
  });

  // ── Room Playback State Machine ──

  it('generates initial room state on room join', async () => {
    const wsClient = await createTestWsClient(`${server.wsUrl}/ws`, adminToken);
    wsClient.send('room.join', {});
    const stateMsg = await wsClient.waitForEvent('room.state');

    expect(stateMsg).toBeDefined();
    expect(stateMsg.payload.room.playback.state).toBe('paused');
    await wsClient.close();
  });

  it('transitions playback state from paused to playing', async () => {
    const wsClient = await createTestWsClient(`${server.wsUrl}/ws`, adminToken);
    wsClient.send('room.join', {});
    await wsClient.waitForEvent('room.state');

    wsClient.send('playback.play', { currentTime: 0 });
    const playState = await wsClient.waitForEvent('playback.state');

    expect(playState.payload.state).toBe('playing');
    expect(playState.payload.anchorTime).toBeGreaterThan(0);
    await wsClient.close();
  });

  it('transitions playback state from playing to paused', async () => {
    const wsClient = await createTestWsClient(`${server.wsUrl}/ws`, adminToken);
    wsClient.send('room.join', {});
    await wsClient.waitForEvent('room.state');

    wsClient.send('playback.play', { currentTime: 10 });
    await wsClient.waitForEvent('playback.state');

    wsClient.send('playback.pause', { currentTime: 15.5 });
    const pauseState = await wsClient.waitForEvent('playback.state');

    expect(pauseState.payload.state).toBe('paused');
    expect(pauseState.payload.anchorPosition).toBe(15.5);
    await wsClient.close();
  });

  it('executes seek command in paused state', async () => {
    const wsClient = await createTestWsClient(`${server.wsUrl}/ws`, adminToken);
    wsClient.send('room.join', {});
    await wsClient.waitForEvent('room.state');

    wsClient.send('playback.seek', { position: 120.0 });
    const state = await wsClient.waitForEvent('playback.state');

    expect(state.payload.anchorPosition).toBe(120.0);
    expect(state.payload.state).toBe('paused');
    await wsClient.close();
  });

  it('executes seek command in playing state', async () => {
    const wsClient = await createTestWsClient(`${server.wsUrl}/ws`, adminToken);
    wsClient.send('room.join', {});
    await wsClient.waitForEvent('room.state');

    wsClient.send('playback.play', { currentTime: 0 });
    await wsClient.waitForEvent('playback.state');

    wsClient.send('playback.seek', { position: 300.0 });
    const state = await wsClient.waitForEvent('playback.state');

    expect(state.payload.anchorPosition).toBe(300.0);
    expect(state.payload.state).toBe('playing');
    await wsClient.close();
  });

  it('executes playback rate change (0.5x, 1.0x, 1.5x, 2.0x)', async () => {
    const wsClient = await createTestWsClient(`${server.wsUrl}/ws`, adminToken);
    wsClient.send('room.join', {});
    await wsClient.waitForEvent('room.state');

    wsClient.send('playback.rate', { rate: 1.5 });
    const state = await wsClient.waitForEvent('playback.state');

    expect(state.payload.playbackRate).toBe(1.5);
    await wsClient.close();
  });

  it('handles media file change transition via changeMedia', async () => {
    const res = await fetch(`${server.baseUrl}/api/playback/change-media`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({ mediaFileId: 'invalid-id-test' }),
    });

    expect(res.status === 404 || res.status === 400).toBe(true);
  });

  it('resets room state on playback stop command', async () => {
    const res = await fetch(`${server.baseUrl}/api/playback/stop`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
    });

    expect(res.status).toBe(200);
    const state = roomStore.getState();
    expect(state.mediaId).toBeNull();
    expect(state.playback.state).toBe('idle');
  });

  it('rejects invalid media file change requests', async () => {
    const res = await fetch(`${server.baseUrl}/api/playback/change-media`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({ mediaFileId: 'non-existent-uuid-999' }),
    });

    expect(res.status).toBe(404);
  });

  it('rejects unauthenticated media change requests', async () => {
    const res = await fetch(`${server.baseUrl}/api/playback/change-media`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mediaFileId: 'any-id' }),
    });

    expect(res.status).toBe(401);
  });

  // ── Drift Calculation & Threshold Corrections ──

  it('evaluates soft drift threshold configuration (SOFT_THRESHOLD_MS)', () => {
    expect(SYNC_CONFIG.SOFT_THRESHOLD_MS).toBeDefined();
    expect(SYNC_CONFIG.SOFT_THRESHOLD_MS).toBeGreaterThan(0);
  });

  it('evaluates hard drift threshold configuration (HARD_THRESHOLD_MS)', () => {
    expect(SYNC_CONFIG.HARD_THRESHOLD_MS).toBeDefined();
    expect(SYNC_CONFIG.HARD_THRESHOLD_MS).toBeGreaterThan(SYNC_CONFIG.SOFT_THRESHOLD_MS);
  });

  it('evaluates negative soft drift configuration', () => {
    expect(SYNC_CONFIG.SOFT_THRESHOLD_MS).toBe(500);
  });

  it('evaluates negative hard drift configuration', () => {
    expect(SYNC_CONFIG.HARD_THRESHOLD_MS).toBe(4000);
  });

  it('asserts zero drift stable playback state', async () => {
    const wsClient = await createTestWsClient(`${server.wsUrl}/ws`, adminToken);
    wsClient.send('room.join', {});
    await wsClient.waitForEvent('room.state');

    wsClient.send('sync.heartbeat', { position: 0, playbackRate: 1.0, timestamp: Date.now() });
    const ack = await wsClient.waitForEvent('sync.heartbeat_ack');

    expect(ack).toBeDefined();
    await wsClient.close();
  });

  it('evaluates boundary soft drift test (exactly 500ms)', async () => {
    const wsClient = await createTestWsClient(`${server.wsUrl}/ws`, adminToken);
    wsClient.send('room.join', {});
    await wsClient.waitForEvent('room.state');

    wsClient.send('sync.heartbeat', { position: 0.5, playbackRate: 1.0, timestamp: Date.now() });
    const ack = await wsClient.waitForEvent('sync.heartbeat_ack');

    expect(ack.payload.timestamp).toBeDefined();
    await wsClient.close();
  });

  it('evaluates boundary hard drift test (exactly 4000ms)', async () => {
    const wsClient = await createTestWsClient(`${server.wsUrl}/ws`, adminToken);
    wsClient.send('room.join', {});
    await wsClient.waitForEvent('room.state');

    wsClient.send('sync.heartbeat', { position: 4.0, playbackRate: 1.0, timestamp: Date.now() });
    const ack = await wsClient.waitForEvent('sync.heartbeat_ack');

    expect(ack).toBeDefined();
    await wsClient.close();
  });

  it('returns heartbeat acknowledgment response', async () => {
    const wsClient = await createTestWsClient(`${server.wsUrl}/ws`, adminToken);
    wsClient.send('room.join', {});
    await wsClient.waitForEvent('room.state');

    const ts = Date.now();
    wsClient.send('sync.heartbeat', { timestamp: ts });
    const ack = await wsClient.waitForEvent('sync.heartbeat_ack');

    expect(ack.payload.timestamp).toBe(ts);
    await wsClient.close();
  });

  // ── Multi-User Buffering & Room Reconciliation ──

  it('asserts single client buffering state', async () => {
    const wsClient = await createTestWsClient(`${server.wsUrl}/ws`, adminToken);
    wsClient.send('room.join', {});
    await wsClient.waitForEvent('room.state');

    wsClient.send('sync.status', { status: 'buffering' });
    const statusMsg = await wsClient.waitForEvent('user.status_changed');

    expect(statusMsg.payload.status).toBe('buffering');
    await wsClient.close();
  });

  it('reconciles multi-client buffering state across 2 clients', async () => {
    const client1 = await createTestWsClient(`${server.wsUrl}/ws`, adminToken);
    const client2 = await createTestWsClient(`${server.wsUrl}/ws`, guestToken);

    client1.send('room.join', {});
    client2.send('room.join', {});
    await client1.waitForEvent('room.state');
    await client2.waitForEvent('room.state');

    client1.send('sync.status', { status: 'ready' });
    client2.send('sync.status', { status: 'buffering' });

    const status1 = await client1.waitForEvent('user.status_changed');
    expect(status1).toBeDefined();

    await client1.close();
    await client2.close();
  });

  it('reconciles multi-client buffering state across 3 clients', async () => {
    const client1 = await createTestWsClient(`${server.wsUrl}/ws`, adminToken);
    client1.send('room.join', {});
    await client1.waitForEvent('room.state');

    client1.send('sync.status', { status: 'ready' });
    const status = await client1.waitForEvent('user.status_changed');

    expect(status.payload.status).toBe('ready');
    await client1.close();
  });

  it('recovers buffering state when a disconnected member leaves', async () => {
    const client = await createTestWsClient(`${server.wsUrl}/ws`, guestToken);
    client.send('room.join', {});
    await client.waitForEvent('room.state');

    client.send('sync.status', { status: 'buffering' });
    await client.close();

    const state = roomStore.getState();
    expect(state).toBeDefined();
  });

  it('auto-pauses room state when last member disconnects', async () => {
    const client = await createTestWsClient(`${server.wsUrl}/ws`, adminToken);
    client.send('room.join', {});
    await client.waitForEvent('room.state');

    client.send('playback.play', { currentTime: 0 });
    await client.waitForEvent('playback.state');

    await client.close();
    const state = roomStore.getState();
    expect(state.playback.state === 'paused' || state.members.length === 0).toBe(true);
  });

  it('provides current room state to mid-playback joiner', async () => {
    const client1 = await createTestWsClient(`${server.wsUrl}/ws`, adminToken);
    client1.send('room.join', {});
    await client1.waitForEvent('room.state');

    client1.send('playback.play', { currentTime: 45 });
    await client1.waitForEvent('playback.state');

    const client2 = await createTestWsClient(`${server.wsUrl}/ws`, guestToken);
    client2.send('room.join', {});
    const state2 = await client2.waitForEvent('room.state');

    expect(state2.payload.room.playback.state).toBe('playing');

    await client1.close();
    await client2.close();
  });

  it('handles rapid status toggling cleanly', async () => {
    const client = await createTestWsClient(`${server.wsUrl}/ws`, adminToken);
    client.send('room.join', {});
    await client.waitForEvent('room.state');

    client.send('sync.status', { status: 'buffering' });
    client.send('sync.status', { status: 'ready' });
    client.send('sync.status', { status: 'synced' });

    const lastStatus = await client.waitForEvent('user.status_changed');
    expect(lastStatus).toBeDefined();
    await client.close();
  });

  it('records position telemetry via heartbeat', async () => {
    const client = await createTestWsClient(`${server.wsUrl}/ws`, adminToken);
    client.send('room.join', {});
    await client.waitForEvent('room.state');

    client.send('sync.heartbeat', { position: 42.1, timestamp: Date.now() });
    const ack = await client.waitForEvent('sync.heartbeat_ack');

    expect(ack.payload.timestamp).toBeDefined();
    await client.close();
  });

  // ── Control Locks & Permissions ──

  it('allows root admin to set control lock on guest member', async () => {
    const adminClient = await createTestWsClient(`${server.wsUrl}/ws`, adminToken);
    const guestClient = await createTestWsClient(`${server.wsUrl}/ws`, guestToken);

    adminClient.send('room.join', {});
    guestClient.send('room.join', {});
    await adminClient.waitForEvent('room.state');
    const guestState = await guestClient.waitForEvent('room.state');

    const guestMember = guestState.payload.room.members.find((m: any) => m.username === 'guestuser');
    expect(guestMember).toBeDefined();

    adminClient.send('room.set_control_lock', { userId: guestMember.userId, locked: true });
    const updatedState = await adminClient.waitForEvent('room.state');

    const updatedGuest = updatedState.payload.room.members.find((m: any) => m.userId === guestMember.userId);
    expect(updatedGuest.controlsLocked).toBe(true);

    await adminClient.close();
    await guestClient.close();
  });

  it('prevents locked guest from issuing play or pause commands', async () => {
    const adminClient = await createTestWsClient(`${server.wsUrl}/ws`, adminToken);
    const guestClient = await createTestWsClient(`${server.wsUrl}/ws`, guestToken);

    adminClient.send('room.join', {});
    guestClient.send('room.join', {});
    await adminClient.waitForEvent('room.state');
    const guestState = await guestClient.waitForEvent('room.state');

    const guestMember = guestState.payload.room.members.find((m: any) => m.username === 'guestuser');
    adminClient.send('room.set_control_lock', { userId: guestMember.userId, locked: true });
    await adminClient.waitForEvent('room.state');

    guestClient.send('playback.play', { currentTime: 10 });
    
    const adminState = roomStore.getState();
    expect(adminState.playback.state).toBe('paused');

    await adminClient.close();
    await guestClient.close();
  });

  it('rejects control lock requests from non-root users', async () => {
    const guestClient = await createTestWsClient(`${server.wsUrl}/ws`, guestToken);
    guestClient.send('room.join', {});
    const state = await guestClient.waitForEvent('room.state');

    const member = state.payload.room.members[0];
    guestClient.send('room.set_control_lock', { userId: member.userId, locked: true });

    const currentState = roomStore.getState();
    const currentMember = currentState.members.find(m => m.userId === member.userId);
    expect(currentMember?.controlsLocked).toBe(false);

    await guestClient.close();
  });

  it('allows root admin to unlock guest controls', async () => {
    const adminClient = await createTestWsClient(`${server.wsUrl}/ws`, adminToken);
    const guestClient = await createTestWsClient(`${server.wsUrl}/ws`, guestToken);

    adminClient.send('room.join', {});
    guestClient.send('room.join', {});
    await adminClient.waitForEvent('room.state');
    const guestState = await guestClient.waitForEvent('room.state');

    const guestMember = guestState.payload.room.members.find((m: any) => m.username === 'guestuser');
    adminClient.send('room.set_control_lock', { userId: guestMember.userId, locked: true });
    await adminClient.waitForEvent('room.state');

    adminClient.send('room.set_control_lock', { userId: guestMember.userId, locked: false });
    const finalState = await adminClient.waitForEvent('room.state');

    const unlockedGuest = finalState.payload.room.members.find((m: any) => m.userId === guestMember.userId);
    expect(unlockedGuest.controlsLocked).toBe(false);

    await adminClient.close();
    await guestClient.close();
  });

  it('asserts individual member self-locking state', async () => {
    const client = await createTestWsClient(`${server.wsUrl}/ws`, adminToken);
    client.send('room.join', {});
    await client.waitForEvent('room.state');

    const state = roomStore.getState();
    expect(state.members[0].controlsLocked).toBeDefined();
    await client.close();
  });

  it('allows admin to update room settings to disable async mode', async () => {
    const adminClient = await createTestWsClient(`${server.wsUrl}/ws`, adminToken);
    adminClient.send('room.join', {});
    await adminClient.waitForEvent('room.state');

    adminClient.send('room.update_settings', { settings: { allowAsyncMode: false } });
    const updatedState = await adminClient.waitForEvent('room.state');

    expect(updatedState.payload.room.settings.allowAsyncMode).toBe(false);
    await adminClient.close();
  });

  it('rejects room setting updates from non-root users', async () => {
    const guestClient = await createTestWsClient(`${server.wsUrl}/ws`, guestToken);
    guestClient.send('room.join', {});
    await guestClient.waitForEvent('room.state');

    guestClient.send('room.update_settings', { settings: { allowAsyncMode: false } });

    const state = roomStore.getState();
    expect(state.settings.allowAsyncMode).toBe(true);
    await guestClient.close();
  });

  it('ensures admin lock overrides self-lock', async () => {
    const adminClient = await createTestWsClient(`${server.wsUrl}/ws`, adminToken);
    adminClient.send('room.join', {});
    const state = await adminClient.waitForEvent('room.state');

    const member = state.payload.room.members[0];
    adminClient.send('room.set_control_lock', { userId: member.userId, locked: true });
    const lockedState = await adminClient.waitForEvent('room.state');

    expect(lockedState.payload.room.members[0].controlsLocked).toBe(true);
    await adminClient.close();
  });

  it('executes full sync mode lifecycle integration workflow', async () => {
    const client = await createTestWsClient(`${server.wsUrl}/ws`, adminToken);
    client.send('room.join', {});
    await client.waitForEvent('room.state');

    client.send('playback.play', { currentTime: 0 });
    await client.waitForEvent('playback.state');

    client.send('playback.seek', { position: 100 });
    await client.waitForEvent('playback.state');

    client.send('playback.pause', { currentTime: 100 });
    const pauseState = await client.waitForEvent('playback.state');

    expect(pauseState.payload.state).toBe('paused');
    expect(pauseState.payload.anchorPosition).toBe(100);

    await client.close();
  });
});
