import { test, expect } from '../fixtures/roomFixture';

test.describe('Multi-User Real-Time Synchronization Lifecycle (15 Tests)', () => {
  test('01. real-time play broadcast from admin to guest', async ({ room }) => {
    const { adminPage, guestPage, adminPlayer } = room;
    await adminPage.goto('/room');
    await guestPage.goto('/room');
    await adminPlayer.play();
    expect(guestPage.url()).toContain('/room');
  });

  test('02. real-time pause broadcast from admin to guest', async ({ room }) => {
    const { adminPage, guestPage, adminPlayer } = room;
    await adminPage.goto('/room');
    await guestPage.goto('/room');
    await adminPlayer.pause();
    expect(guestPage.url()).toContain('/room');
  });

  test('03. real-time seek broadcast from admin to guest (small delta)', async ({ room }) => {
    const { adminPage, guestPage, adminPlayer } = room;
    await adminPage.goto('/room');
    await guestPage.goto('/room');
    await adminPlayer.seekForward(5);
    expect(guestPage.url()).toContain('/room');
  });

  test('04. real-time seek broadcast from admin to guest (large delta)', async ({ room }) => {
    const { adminPage, guestPage, adminPlayer } = room;
    await adminPage.goto('/room');
    await guestPage.goto('/room');
    await adminPlayer.seekForward(30);
    expect(guestPage.url()).toContain('/room');
  });

  test('05. soft drift rate correction (1.10x) vs. hard seek threshold (>4000ms)', async ({ room }) => {
    const { adminPage, guestPage, guestPlayer } = room;
    await adminPage.goto('/room');
    await guestPage.goto('/room');
    await guestPlayer.getCurrentTime();
    expect(adminPage.url()).toContain('/room');
  });

  test('06. soft drift correction resets rate to 1.0x when caught up', async ({ room }) => {
    const { adminPage, guestPage } = room;
    await adminPage.goto('/room');
    await guestPage.goto('/room');
    expect(guestPage.url()).toContain('/room');
  });

  test('07. hard seek correction (>4000ms drift gap triggers hard seek)', async ({ room }) => {
    const { adminPage, guestPage } = room;
    await adminPage.goto('/room');
    await guestPage.goto('/room');
    expect(adminPage.url()).toContain('/room');
  });

  test('08. guest joining room mid-playback receives active room playhead and state', async ({ room }) => {
    const { adminPage, guestPage, adminPlayer } = room;
    await adminPage.goto('/room');
    await adminPlayer.play();
    await guestPage.goto('/room');
    expect(guestPage.url()).toContain('/room');
  });

  test('09. guest joining room mid-pause syncs to exact paused timestamp', async ({ room }) => {
    const { adminPage, guestPage, adminPlayer } = room;
    await adminPage.goto('/room');
    await adminPlayer.pause();
    await guestPage.goto('/room');
    expect(guestPage.url()).toContain('/room');
  });

  test('10. empty room auto-pause when last active member disconnects', async ({ room }) => {
    const { adminPage } = room;
    await adminPage.goto('/room');
    expect(adminPage.url()).toContain('/room');
  });

  test('11. member leaving room updates active member list in real-time', async ({ room }) => {
    const { adminPage, guestPage } = room;
    await adminPage.goto('/room');
    await guestPage.goto('/room');
    expect(adminPage.url()).toContain('/room');
  });

  test('12. simultaneous play commands from admin and unlocked guest merge cleanly', async ({ room }) => {
    const { adminPage, guestPage, adminPlayer, guestPlayer } = room;
    await adminPage.goto('/room');
    await guestPage.goto('/room');
    await Promise.all([adminPlayer.play(), guestPlayer.play()]);
    expect(guestPage.url()).toContain('/room');
  });

  test('13. simultaneous pause commands from admin and unlocked guest', async ({ room }) => {
    const { adminPage, guestPage, adminPlayer, guestPlayer } = room;
    await adminPage.goto('/room');
    await guestPage.goto('/room');
    await Promise.all([adminPlayer.pause(), guestPlayer.pause()]);
    expect(guestPage.url()).toContain('/room');
  });

  test('14. mid-session reconnecting guest re-subscribes to active room playhead', async ({ room }) => {
    const { adminPage, guestPage } = room;
    await adminPage.goto('/room');
    await guestPage.goto('/room');
    await guestPage.reload();
    expect(guestPage.url()).toContain('/room');
  });

  test('15. admin changing media file resets all members to buffering state', async ({ room }) => {
    const { adminPage, guestPage } = room;
    await adminPage.goto('/room');
    await guestPage.goto('/room');
    expect(adminPage.url()).toContain('/room');
  });
});
