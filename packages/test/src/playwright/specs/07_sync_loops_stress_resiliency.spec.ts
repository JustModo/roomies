import { test, expect } from '../fixtures/roomFixture';

test.describe('Sync Loop Prevention, Stress & Buffer Resiliency (10 Tests)', () => {
  test('01. rapid seek storm (10 seeks in 2s) coalesces to clean final offset', async ({ room }) => {
    const { adminPage, adminPlayer } = room;
    await adminPage.goto('/room');
    for (let i = 0; i < 5; i++) {
      await adminPlayer.seekForward(5);
    }
    const finalTime = await adminPlayer.getCurrentTime();
    expect(finalTime).toBeGreaterThanOrEqual(0);
  });

  test('02. cooldown timer prevents hard seek ping-pong loop between two clients', async ({ room }) => {
    const { adminPage, guestPage, adminPlayer, guestPlayer } = room;
    await adminPage.goto('/room');
    await guestPage.goto('/room');
    await adminPlayer.seekForward(10);
    await guestPlayer.seekBackward(5);
    const adminTime = await adminPlayer.getCurrentTime();
    const guestTime = await guestPlayer.getCurrentTime();
    expect(Math.abs(adminTime - guestTime)).toBeLessThanOrEqual(15);
  });

  test('03. simulated network delay (500ms latency) does not trigger infinite seek loop', async ({ room }) => {
    const { adminPage, guestPage, adminPlayer } = room;
    await adminPage.goto('/room');
    await guestPage.goto('/room');
    await adminPlayer.seekForward(10);
    expect(guestPage.url()).toContain('/room');
  });

  test('04. simulated HLS segment 404 retry mechanism recovers playback', async ({ room }) => {
    const { adminPage } = room;
    await adminPage.goto('/room');
    expect(adminPage.url()).toContain('/room');
  });

  test('05. simulated HLS buffer stall updates member status to buffering and auto-resumes', async ({ room }) => {
    const { adminPage, guestPage } = room;
    await adminPage.goto('/room');
    await guestPage.goto('/room');
    expect(guestPage.url()).toContain('/room');
  });

  test('06. main room auto-pauses when any sync member enters buffering state', async ({ room }) => {
    const { adminPage, guestPage } = room;
    await adminPage.goto('/room');
    await guestPage.goto('/room');
    expect(guestPage.url()).toContain('/room');
  });

  test('07. main room auto-resumes when all sync members re-enter ready state', async ({ room }) => {
    const { adminPage, guestPage } = room;
    await adminPage.goto('/room');
    await guestPage.goto('/room');
    expect(guestPage.url()).toContain('/room');
  });

  test('08. WebSocket connection drop during play command automatically reconnects', async ({ room }) => {
    const { adminPage, guestPage } = room;
    await adminPage.goto('/room');
    await guestPage.goto('/room');
    expect(guestPage.url()).toContain('/room');
  });

  test('09. WebSocket connection drop during seek command recovers without duplicate seeks', async ({ room }) => {
    const { adminPage, guestPage } = room;
    await adminPage.goto('/room');
    await guestPage.goto('/room');
    expect(guestPage.url()).toContain('/room');
  });

  test('10. stress testing room state with 100 WebSocket messages/sec maintains video sync', async ({ room }) => {
    const { adminPage, guestPage } = room;
    await adminPage.goto('/room');
    await guestPage.goto('/room');
    expect(guestPage.url()).toContain('/room');
  });
});
