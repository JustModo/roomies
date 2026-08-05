import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setupTestEnvironment, TestEnvironmentContext } from '../helpers/testFixtures';
import { createTestWsClient } from '../helpers/wsClient';

describe('WebSocket Real-Time Gateway & Event Synchronizer', () => {
  let env: TestEnvironmentContext;

  beforeAll(async () => {
    env = await setupTestEnvironment();
  });

  afterAll(async () => {
    await env.cleanup();
  });

  it('connects a WebSocket client and receives initial room state upon room.join', async () => {
    const wsClient = await createTestWsClient(`${env.server.wsUrl}/ws`, env.admin.token);

    wsClient.send('room.join', {});
    const roomStateMsg = await wsClient.waitForEvent('room.state');

    expect(roomStateMsg).toBeDefined();
    expect(roomStateMsg.payload).toBeDefined();
    expect(roomStateMsg.payload.room).toBeDefined();

    await wsClient.close();
  });

  it('broadcasts chat messages between two connected WebSocket clients', async () => {
    const client1 = await createTestWsClient(`${env.server.wsUrl}/ws`, env.admin.token);
    const client2 = await createTestWsClient(`${env.server.wsUrl}/ws`, env.guest.token);

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

  it('sends auth.unauthorized and closes the connection for an invalid token', async () => {
    const wsClient = await createTestWsClient(`${env.server.wsUrl}/ws`, 'not-a-valid-jwt');

    const unauthorizedMsg = await wsClient.waitForEvent('auth.unauthorized');
    expect(unauthorizedMsg.payload.reason).toBe('invalid_or_expired_token');

    await wsClient.close();
  });

  it('broadcasts emoji reaction events across room members', async () => {
    const client1 = await createTestWsClient(`${env.server.wsUrl}/ws`, env.admin.token);
    const client2 = await createTestWsClient(`${env.server.wsUrl}/ws`, env.guest.token);

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
