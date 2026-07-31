import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestServer, TestServerContext } from '../helpers/testServer';
import { createTestDatabase, TestDbContext } from '../helpers/testDatabase';
import { createTestWsClient } from '../helpers/wsClient';

describe('WebSocket Real-Time Gateway & Event Synchronizer', () => {
  let server: TestServerContext;
  let db: TestDbContext;
  let adminToken: string;
  let guestToken: string;

  beforeAll(async () => {
    db = await createTestDatabase();
    server = await createTestServer();

    // Setup initial root user
    const setupRes = await fetch(`${server.baseUrl}/api/auth/setup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'password123' }),
    });
    const setupData = await setupRes.json();
    adminToken = setupData.token;

    // Create guest user
    await fetch(`${server.baseUrl}/api/users/guest`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({ username: 'wsuser', password: 'wspassword123' }),
    });

    const guestRes = await fetch(`${server.baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'wsuser', password: 'wspassword123' }),
    });
    const guestData = await guestRes.json();
    guestToken = guestData.token;
  });

  afterAll(async () => {
    await server.close();
    await db.cleanup();
  });

  it('connects a WebSocket client and receives initial room state upon room.join', async () => {
    const wsClient = await createTestWsClient(`${server.wsUrl}/ws`, adminToken);

    wsClient.send('room.join', {});
    const roomStateMsg = await wsClient.waitForEvent('room.state');

    expect(roomStateMsg).toBeDefined();
    expect(roomStateMsg.payload).toBeDefined();

    await wsClient.close();
  });

  it('broadcasts chat messages between two connected WebSocket clients', async () => {
    const client1 = await createTestWsClient(`${server.wsUrl}/ws`, adminToken);
    const client2 = await createTestWsClient(`${server.wsUrl}/ws`, guestToken);

    client1.send('room.join', {});
    client2.send('room.join', {});

    await client1.waitForEvent('room.state');
    await client2.waitForEvent('room.state');

    // Client 1 sends a chat message
    client1.send('chat.send', { message: 'Hello from Admin!' });

    // Client 2 receives chat message broadcast
    const chatMsg = await client2.waitForEvent('chat.message');
    expect(chatMsg).toBeDefined();
    expect(chatMsg.payload.message).toBe('Hello from Admin!');

    await client1.close();
    await client2.close();
  });

  it('broadcasts emoji reaction events across room members', async () => {
    const client1 = await createTestWsClient(`${server.wsUrl}/ws`, adminToken);
    const client2 = await createTestWsClient(`${server.wsUrl}/ws`, guestToken);

    client1.send('room.join', {});
    client2.send('room.join', {});

    await client1.waitForEvent('room.state');
    await client2.waitForEvent('room.state');

    // Client 2 sends an emoji reaction
    client2.send('emoji.send', { emoji: '🔥' });

    // Client 1 receives reaction broadcast
    const emojiEvent = await client1.waitForEvent('emoji.reaction');
    expect(emojiEvent).toBeDefined();
    expect(emojiEvent.payload.emoji).toBe('🔥');

    await client1.close();
    await client2.close();
  });
});
