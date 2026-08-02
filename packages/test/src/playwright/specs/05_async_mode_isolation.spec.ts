import { test, expect } from '../fixtures/roomFixture';
import { setAllowAsyncMode } from '../helpers/room';
import {
  getVideoState,
  waitForPaused,
  waitForPlaying,
  waitForTimesConverged,
} from '../helpers/syncAssert';
import { exitRoom, joinRoomViaLobby } from '../helpers/room';

test.describe('Async Mode Isolation', () => {
  test.beforeEach(async ({ room }) => {
    await setAllowAsyncMode(room.adminPage, true);
  });

  test('01. guest enters async mode when allowed', async ({ room }) => {
    const { guestRoom } = room;
    await guestRoom.enterAsyncMode();
    await expect(guestRoom.syncButton()).toHaveAttribute('title', /Resync with Room/i);
  });

  test('02. async guest pause does not pause admin', async ({ room }) => {
    const { adminPage, guestPage, adminPlayer, guestPlayer, guestRoom } = room;
    await adminPlayer.playViaButton();
    await waitForPlaying(guestPage);
    await guestRoom.enterAsyncMode();
    await guestPlayer.pauseViaButton();
    await waitForPaused(guestPage);
    await waitForPlaying(adminPage);
  });

  test('03. async guest seek does not move admin playhead', async ({ room }) => {
    const { adminPage, guestPage, guestPlayer, guestRoom } = room;
    await guestRoom.enterAsyncMode();
    const adminBefore = (await getVideoState(adminPage)).currentTime;
    await guestPlayer.seekForward10();
    await guestPlayer.seekForward10();
    await pageWait(1500);
    const adminAfter = (await getVideoState(adminPage)).currentTime;
    const guestAfter = (await getVideoState(guestPage)).currentTime;
    expect(Math.abs(adminAfter - adminBefore)).toBeLessThan(4);
    expect(guestAfter).toBeGreaterThan(adminAfter + 5);
  });

  test('04. admin play/pause does not force async guest paused state', async ({ room }) => {
    const { adminPage, guestPage, adminPlayer, guestPlayer, guestRoom } = room;
    await adminPlayer.playViaButton();
    await waitForPlaying(guestPage);
    await guestRoom.enterAsyncMode();
    await guestPlayer.pauseViaButton();
    await waitForPaused(guestPage);
    await adminPlayer.pauseViaButton();
    await waitForPaused(adminPage);
    await adminPlayer.playViaButton();
    await waitForPlaying(adminPage);
    // Guest should remain paused in async
    await waitForPaused(guestPage);
  });

  test('05. guest resync returns to room state', async ({ room }) => {
    const { adminPage, guestPage, adminPlayer, guestPlayer, guestRoom } = room;
    await adminPlayer.playViaButton();
    await waitForPlaying(guestPage);
    await guestRoom.enterAsyncMode();
    await guestPlayer.pauseViaButton();
    await guestPlayer.seekForward10();
    await guestRoom.resyncWithRoom();
    await waitForPlaying(guestPage);
    await waitForTimesConverged(adminPage, guestPage, 5, 30000);
  });

  test('06. disabling Allow Async forces guest back to sync', async ({ room }) => {
    const { adminPage, guestPage, adminPlayer, guestRoom } = room;
    await adminPlayer.playViaButton();
    await waitForPlaying(guestPage);
    await guestRoom.enterAsyncMode();
    await setAllowAsyncMode(adminPage, false);
    await guestRoom.expectAsyncDisabled();
    await waitForPlaying(guestPage);
    await waitForTimesConverged(adminPage, guestPage, 5, 30000);
  });

  test('07. async guest leave does not break admin playback', async ({ room }) => {
    const { adminPage, guestPage, adminPlayer, guestRoom } = room;
    await adminPlayer.playViaButton();
    await waitForPlaying(adminPage);
    await guestRoom.enterAsyncMode();
    await exitRoom(guestPage);
    await waitForPlaying(adminPage);
    await joinRoomViaLobby(guestPage);
    await waitForPlaying(guestPage);
  });
});

async function pageWait(ms: number) {
  await new Promise((r) => setTimeout(r, ms));
}
