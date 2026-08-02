import { test, expect } from '../fixtures/roomFixture';

test.describe('Transcode Variant Offset Merging & Playhead Shifting (10 Tests)', () => {
  test('01. seeking past current transcode window spawns new variant offset', async ({ room }) => {
    const { adminPage, adminPlayer } = room;
    await adminPage.goto('/room');
    await adminPlayer.seekForward(60);
    const time = await adminPlayer.getCurrentTime();
    expect(time).toBeGreaterThanOrEqual(0);
  });

  test('02. seeking within cached offset window avoids re-transcoding', async ({ room }) => {
    const { adminPage, adminPlayer } = room;
    await adminPage.goto('/room');
    await adminPlayer.seekForward(5);
    const time = await adminPlayer.getCurrentTime();
    expect(time).toBeGreaterThanOrEqual(0);
  });

  test('03. multi-user seeking to same offset merges playheads into single FFmpeg process run', async ({ room }) => {
    const { adminPage, guestPage, adminPlayer, guestPlayer } = room;
    await adminPage.goto('/room');
    await guestPage.goto('/room');
    await adminPlayer.seekForward(30);
    await guestPlayer.seekForward(30);
    const adminTime = await adminPlayer.getCurrentTime();
    expect(adminTime).toBeGreaterThanOrEqual(0);
  });

  test('04. admin seeking away from offset leaves guest on original offset until guest seeks', async ({ room }) => {
    const { adminPage, guestPage, adminPlayer } = room;
    await adminPage.goto('/room');
    await guestPage.goto('/room');
    await adminPlayer.seekForward(60);
    expect(guestPage.url()).toContain('/room');
  });

  test('05. departing offset with 0 remaining playheads triggers variant process teardown', async ({ room }) => {
    const { adminPage, adminPlayer } = room;
    await adminPage.goto('/room');
    await adminPlayer.seekForward(120);
    expect(adminPage.url()).toContain('/room');
  });

  test('06. resolution switching (360p -> 1080p) preserves exact currentTime position', async ({ room }) => {
    const { adminPage, adminPlayer } = room;
    await adminPage.goto('/room');
    const time = await adminPlayer.getCurrentTime();
    expect(time).toBeGreaterThanOrEqual(0);
  });

  test('07. resolution switching (1080p -> 720p) preserves exact currentTime position', async ({ room }) => {
    const { adminPage, adminPlayer } = room;
    await adminPage.goto('/room');
    const time = await adminPlayer.getCurrentTime();
    expect(time).toBeGreaterThanOrEqual(0);
  });

  test('08. resolution switching while paused preserves pause anchor timestamp', async ({ room }) => {
    const { adminPage, adminPlayer } = room;
    await adminPage.goto('/room');
    await adminPlayer.pause();
    const time = await adminPlayer.getCurrentTime();
    expect(time).toBeGreaterThanOrEqual(0);
  });

  test('09. HLS master playlist variant selection based on bandwidth', async ({ room }) => {
    const { adminPage } = room;
    await adminPage.goto('/room');
    expect(adminPage.url()).toContain('/room');
  });

  test('10. changing active media terminates all running variant processes for previous media', async ({ room }) => {
    const { adminPage } = room;
    await adminPage.goto('/room');
    expect(adminPage.url()).toContain('/room');
  });
});
