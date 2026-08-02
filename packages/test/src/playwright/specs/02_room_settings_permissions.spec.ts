import { test, expect } from '../fixtures/roomFixture';
import {
  getAllowAsyncMode,
  lockGuestControls,
  setAllowAsyncMode,
  unlockGuestControls,
  joinRoomViaLobby,
  exitRoom,
  setAuthToken,
} from '../helpers/room';
import { waitForPaused, waitForPlaying, getVideoState, waitForMediaReady } from '../helpers/syncAssert';
import { createGuest } from '../helpers/auth';
import { startMedia } from '../helpers/media';

test.describe('Room Settings & Control Locks', () => {
  test('01. root locks guest — controls disabled + locked by admin', async ({ room }) => {
    const { adminPage, guestPage, guestPlayer, guestRoom, guestUsername } = room;
    await lockGuestControls(adminPage, guestUsername);
    await guestRoom.expectControlsLockedByAdmin();
    await guestPlayer.expectControlsDisabled();
    await expect(guestPage).toBeTruthy();
  });

  test('02. locked guest Space does not change play state', async ({ room }) => {
    const { adminPage, guestPage, adminPlayer, guestPlayer, guestUsername } = room;
    await adminPlayer.pauseViaButton().catch(async () => {
      if (!(await adminPlayer.isPaused())) {
        await adminPlayer.toggleViaSpace();
        await waitForPaused(adminPage);
      }
    });
    await lockGuestControls(adminPage, guestUsername);
    await waitForPaused(adminPage);
    await waitForPaused(guestPage);
    await guestPlayer.toggleViaSpace();
    await pageWait(500);
    await waitForPaused(adminPage);
    await waitForPaused(guestPage);
  });

  test('03. locked guest seek does not move room playhead', async ({ room }) => {
    const { adminPage, guestPage, guestPlayer, guestUsername } = room;
    await lockGuestControls(adminPage, guestUsername);
    const adminBefore = (await getVideoState(adminPage)).currentTime;
    const guestBefore = (await getVideoState(guestPage)).currentTime;
    await guestPlayer.seekForward10();
    await pageWait(1000);
    const adminAfter = (await getVideoState(adminPage)).currentTime;
    const guestAfter = (await getVideoState(guestPage)).currentTime;
    expect(Math.abs(adminAfter - adminBefore)).toBeLessThan(3);
    expect(Math.abs(guestAfter - guestBefore)).toBeLessThan(3);
  });

  test('04. unlock restores guest controls', async ({ room }) => {
    const { adminPage, guestPlayer, guestRoom, guestUsername } = room;
    await lockGuestControls(adminPage, guestUsername);
    await guestRoom.expectControlsLockedByAdmin();
    await unlockGuestControls(adminPage, guestUsername);
    await guestRoom.expectControlsUnlocked();
    await guestPlayer.expectControlsEnabled();
  });

  test('05. guest cannot see Allow Async room setting', async ({ room }) => {
    const { guestRoom, guestPage } = room;
    await guestRoom.openSettings();
    await expect(guestPage.getByText('Allow Async Mode', { exact: true })).toHaveCount(0);
    await expect(guestPage.getByText('Room Settings', { exact: true })).toHaveCount(0);
  });

  test('06. root enables Allow Async — guest can enter async', async ({ room }) => {
    const { adminPage, guestRoom } = room;
    await setAllowAsyncMode(adminPage, true);
    await guestRoom.enterAsyncMode();
    await expect(guestRoom.syncButton()).toHaveAttribute('title', /Resync with Room/i);
  });

  test('07. root disables Allow Async — guest SYNC disabled and kicked from async', async ({ room }) => {
    const { adminPage, guestRoom } = room;
    await setAllowAsyncMode(adminPage, true);
    await guestRoom.enterAsyncMode();
    await setAllowAsyncMode(adminPage, false);
    await guestRoom.expectAsyncDisabled();
  });

  test('08. guest cannot lock other members', async ({ room }) => {
    const { guestRoom, guestPage, adminUsername } = room;
    await guestRoom.openParty();
    await guestPage.getByRole('button', { name: new RegExp(adminUsername, 'i') }).click();
    await expect(guestPage.getByRole('button', { name: /^Lock controls$/i })).toHaveCount(0);
  });

  test('09. Allow Async persists across guest rejoin', async ({ room }) => {
    const { adminPage, guestPage, guestRoom } = room;
    await setAllowAsyncMode(adminPage, false);
    expect(await getAllowAsyncMode(adminPage)).toBe(false);
    await exitRoom(guestPage);
    await joinRoomViaLobby(guestPage);
    await guestRoom.expectAsyncDisabled();
  });

  test('10. self-lock disables own controls', async ({ room }) => {
    const { adminRoom, adminPlayer } = room;
    await adminRoom.selfLock();
    await adminPlayer.expectControlsDisabled();
    await adminRoom.selfUnlock();
    await adminPlayer.expectControlsEnabled();
  });

  test('11. lock visible on second guest session', async ({ room, browser, request }) => {
    const { adminPage, adminToken, guestUsername } = room;
    await lockGuestControls(adminPage, guestUsername);

    const guest2 = await createGuest(adminToken);
    const ctx = await browser.newContext();
    const page2 = await ctx.newPage();
    await setAuthToken(page2, guest2.token);
    await joinRoomViaLobby(page2);
    await startMedia(request, adminToken).catch(() => undefined);
    await waitForMediaReady(page2).catch(() => undefined);

    // Original guest still locked — re-check via admin party UI
    await room.adminRoom.openParty();
    await adminPage.getByRole('button', { name: new RegExp(guestUsername, 'i') }).click();
    await expect(adminPage.getByRole('button', { name: /^Unlock controls$/i })).toBeVisible();

    await ctx.close();
  });

  test('12. locked guest leave clears lock on rejoin', async ({ room }) => {
    const { adminPage, guestPage, guestRoom, guestPlayer, guestUsername } = room;
    await lockGuestControls(adminPage, guestUsername);
    await guestRoom.expectControlsLockedByAdmin();
    await exitRoom(guestPage);
    await joinRoomViaLobby(guestPage);
    await guestRoom.expectControlsUnlocked();
    await guestPlayer.expectControlsEnabled();
  });
});

async function pageWait(ms: number) {
  await new Promise((r) => setTimeout(r, ms));
}
