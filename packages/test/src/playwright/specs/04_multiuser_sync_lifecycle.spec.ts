import { test, expect } from '../fixtures/roomFixture';
import {
  waitForPaused,
  waitForPlaying,
  waitForTimesConverged,
  waitForTimeWithin,
  waitForNoMediaOverlay,
  waitForMediaReady,
  getVideoState,
} from '../helpers/syncAssert';
import { joinRoomViaLobby, exitRoom, setAuthToken } from '../helpers/room';
import { startMedia, stopMedia } from '../helpers/media';
import { RoomPOM } from '../pom/RoomPOM';
import { PlayerPOM } from '../pom/PlayerPOM';

test.describe('Multi-User Sync Lifecycle', () => {
  test('01. admin play syncs guest to playing', async ({ room }) => {
    const { adminPlayer, guestPage } = room;
    await adminPlayer.playViaButton();
    await waitForPlaying(guestPage);
  });

  test('02. admin pause syncs guest to paused + PAUSED overlay', async ({ room }) => {
    const { adminPlayer, guestPage, guestPlayer } = room;
    await adminPlayer.playViaButton();
    await waitForPlaying(guestPage);
    await adminPlayer.pauseViaButton();
    await waitForPaused(guestPage);
    await guestPlayer.expectPlayButtonVisible();
  });

  test('03. guest play syncs admin to playing', async ({ room }) => {
    const { adminPage, guestPlayer } = room;
    await guestPlayer.playViaButton();
    await waitForPlaying(adminPage);
  });

  test('04. admin seek +10 converges guest playhead', async ({ room }) => {
    const { adminPage, guestPage, adminPlayer } = room;
    const before = await adminPlayer.getCurrentTime();
    await adminPlayer.seekForward10();
    await waitForTimeWithin(adminPage, before + 10, 4);
    await waitForTimesConverged(adminPage, guestPage, 4);
  });

  test('05. admin large seek converges guest', async ({ room }) => {
    const { adminPage, guestPage, adminPlayer } = room;
    for (let i = 0; i < 4; i++) {
      await adminPlayer.seekForward10();
    }
    await waitForTimesConverged(adminPage, guestPage, 5, 30000);
  });

  test('06. mid-play guest join matches playing + playhead', async ({ room, browser, request }) => {
    const { adminPage, adminPlayer, adminToken, guestToken } = room;
    await adminPlayer.playViaButton();
    await waitForPlaying(adminPage);

    // Use a fresh guest context joining mid-play
    await exitRoom(room.guestPage);
    const ctx = await browser.newContext();
    const lateGuest = await ctx.newPage();
    await setAuthToken(lateGuest, guestToken);
    await joinRoomViaLobby(lateGuest);
    await waitForMediaReady(lateGuest);
    await waitForPlaying(lateGuest);
    await waitForTimesConverged(adminPage, lateGuest, 5, 30000);
    await ctx.close();
  });

  test('07. mid-pause guest join matches paused timestamp', async ({ room, browser }) => {
    const { adminPage, adminPlayer, guestToken } = room;
    await adminPlayer.playViaButton();
    await adminPlayer.seekForward10();
    await adminPlayer.pauseViaButton();
    const adminTime = (await getVideoState(adminPage)).currentTime;

    await exitRoom(room.guestPage);
    const ctx = await browser.newContext();
    const lateGuest = await ctx.newPage();
    await setAuthToken(lateGuest, guestToken);
    await joinRoomViaLobby(lateGuest);
    await waitForMediaReady(lateGuest);
    await waitForPaused(lateGuest);
    await waitForTimeWithin(lateGuest, adminTime, 4);
    await ctx.close();
  });

  test('08. guest leave updates admin member list', async ({ room }) => {
    const { adminRoom, guestPage, guestUsername } = room;
    await adminRoom.expectMemberCount(2);
    await exitRoom(guestPage);
    await adminRoom.expectMemberCount(1);
    await adminRoom.expectMemberAbsent(guestUsername);
  });

  test('09. guest reload/rejoin mid-play resubscribes', async ({ room }) => {
    const { adminPage, guestPage, adminPlayer } = room;
    await adminPlayer.playViaButton();
    await waitForPlaying(guestPage);
    await guestPage.reload();
    // After reload, hasUserInteracted is lost — must rejoin via lobby
    await joinRoomViaLobby(guestPage);
    await waitForMediaReady(guestPage);
    await waitForPlaying(guestPage);
    await waitForTimesConverged(adminPage, guestPage, 5, 30000);
  });

  test('10. concurrent play/pause ends in shared state', async ({ room }) => {
    const { adminPage, guestPage, adminPlayer, guestPlayer } = room;
    await Promise.all([adminPlayer.toggleViaSpace(), guestPlayer.toggleViaSpace()]);
    await expect
      .poll(async () => {
        const a = await getVideoState(adminPage);
        const b = await getVideoState(guestPage);
        return a.paused === b.paused;
      }, { timeout: 20000 })
      .toBe(true);
  });

  test('11. admin Stop media — both see waiting overlay', async ({ room, request }) => {
    const { adminPage, guestPage, adminToken, adminRoom } = room;
    await stopMedia(request, adminToken);
    await waitForNoMediaOverlay(adminPage);
    await waitForNoMediaOverlay(guestPage);
    await expect(adminRoom).toBeTruthy();
  });

  test('12. admin start media — both share new media', async ({ room, request }) => {
    const { adminPage, guestPage, adminToken } = room;
    await stopMedia(request, adminToken).catch(() => undefined);
    await waitForNoMediaOverlay(adminPage);
    await startMedia(request, adminToken);
    await waitForMediaReady(adminPage);
    await waitForMediaReady(guestPage);
    await waitForPaused(adminPage);
    await waitForPaused(guestPage);
  });
});
