import { test, expect } from '../fixtures/roomFixture';
import {
  getVideoState,
  waitForNoMediaOverlay,
  waitForPaused,
  waitForPlaying,
  waitForTimeWithin,
} from '../helpers/syncAssert';

test.describe('Player Controls & Basic Scrubbing', () => {
  test('01. play via UI starts video', async ({ room }) => {
    const { adminPlayer } = room;
    await adminPlayer.playViaButton();
    await adminPlayer.expectPlaying();
    await adminPlayer.expectPauseButtonVisible();
  });

  test('02. pause via UI pauses video and shows PAUSED', async ({ room }) => {
    const { adminPlayer } = room;
    await adminPlayer.playViaButton();
    await adminPlayer.pauseViaButton();
    await adminPlayer.expectPaused();
    await adminPlayer.expectPlayButtonVisible();
  });

  test('03. Space toggles play/pause', async ({ room }) => {
    const { adminPage, adminPlayer } = room;
    await adminPlayer.toggleViaSpace();
    await waitForPlaying(adminPage);
    await adminPlayer.toggleViaSpace();
    await waitForPaused(adminPage);
  });

  test('04. K toggles play/pause', async ({ room }) => {
    const { adminPage, adminPlayer } = room;
    await adminPlayer.toggleViaK();
    await waitForPlaying(adminPage);
    await adminPlayer.toggleViaK();
    await waitForPaused(adminPage);
  });

  test('05. ArrowRight seeks about +10s', async ({ room }) => {
    const { adminPlayer } = room;
    const before = await adminPlayer.getCurrentTime();
    await adminPlayer.seekForward10();
    await expect
      .poll(async () => (await adminPlayer.getCurrentTime()) - before, { timeout: 15000 })
      .toBeGreaterThanOrEqual(8);
  });

  test('06. ArrowLeft seeks about -10s', async ({ room }) => {
    const { adminPlayer } = room;
    await adminPlayer.seekForward10();
    await adminPlayer.seekForward10();
    const before = await adminPlayer.getCurrentTime();
    await adminPlayer.seekBackward10();
    await expect
      .poll(async () => before - (await adminPlayer.getCurrentTime()), { timeout: 15000 })
      .toBeGreaterThanOrEqual(8);
  });

  test('07. Back/Forward 10s control buttons seek', async ({ room }) => {
    const { adminPlayer } = room;
    const before = await adminPlayer.getCurrentTime();
    await adminPlayer.seekForwardViaButton();
    await expect
      .poll(async () => (await adminPlayer.getCurrentTime()) - before, { timeout: 15000 })
      .toBeGreaterThanOrEqual(8);
    const mid = await adminPlayer.getCurrentTime();
    await adminPlayer.seekBackwardViaButton();
    await expect
      .poll(async () => mid - (await adminPlayer.getCurrentTime()), { timeout: 15000 })
      .toBeGreaterThanOrEqual(8);
  });

  test('08. Mute / Unmute via title buttons', async ({ room }) => {
    const { adminPage, adminPlayer } = room;
    await adminPlayer.mute();
    await expect.poll(async () => (await getVideoState(adminPage)).muted).toBe(true);
    await adminPlayer.unmute();
    await expect.poll(async () => (await getVideoState(adminPage)).muted).toBe(false);
  });

  test('09. volume slider sets distinct level', async ({ room }) => {
    const { adminPage, adminPlayer } = room;
    await adminPlayer.unmute();
    await adminPlayer.setVolume(0.4);
    await expect
      .poll(async () => Math.abs((await getVideoState(adminPage)).volume - 0.4))
      .toBeLessThan(0.05);
  });

  test('10. playback rate cycles through speed labels', async ({ room }) => {
    const { adminPlayer } = room;
    const initial = await adminPlayer.getRateLabel();
    expect(initial).toMatch(/1x|1\.0x/);
    await adminPlayer.cyclePlaybackRate();
    await expect.poll(async () => adminPlayer.getRateLabel()).toMatch(/1\.25x/);
    await adminPlayer.cyclePlaybackRate();
    await expect.poll(async () => adminPlayer.getRateLabel()).toMatch(/1\.5x/);
  });

  test('11. seek near start reaches low currentTime', async ({ room }) => {
    const { adminPage, adminPlayer } = room;
    for (let i = 0; i < 3; i++) {
      await adminPlayer.seekForward10();
    }
    for (let i = 0; i < 6; i++) {
      await adminPlayer.seekBackward10();
    }
    await waitForTimeWithin(adminPage, 0, 5);
  });

  test('12. no media shows party-will-start overlay', async ({ roomNoMedia }) => {
    const { adminPage } = roomNoMedia;
    await waitForNoMediaOverlay(adminPage);
  });
});
