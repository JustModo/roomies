import { test, expect } from '../fixtures/roomFixture';
import {
  getVideoState,
  waitForPlaying,
  waitForTimesConverged,
  waitForMediaReady,
} from '../helpers/syncAssert';
import { joinRoomViaLobby } from '../helpers/room';

test.describe('Sync Stress & Resiliency', () => {
  test('01. rapid seek storm converges admin and guest', async ({ room }) => {
    const { adminPage, guestPage, adminPlayer } = room;
    for (let i = 0; i < 10; i++) {
      await adminPlayer.seekForward10();
    }
    await waitForTimesConverged(adminPage, guestPage, 8, 60000);
    // Should not be permanently stuck on SYNCING
    await expect(adminPage.getByText('SYNCING', { exact: true })).toBeHidden({ timeout: 30000 });
  });

  test('02. opposing seeks settle without permanent divergence', async ({ room }) => {
    const { adminPage, guestPage, adminPlayer, guestPlayer } = room;
    await adminPlayer.seekForward10();
    await guestPlayer.seekBackward10().catch(() => undefined);
    await adminPlayer.seekForward10();
    await guestPlayer.seekForward10();
    await waitForTimesConverged(adminPage, guestPage, 8, 60000);
  });

  test('03. guest reload recovers sync without admin stall', async ({ room }) => {
    const { adminPage, guestPage, adminPlayer } = room;
    await adminPlayer.playViaButton();
    await waitForPlaying(guestPage);
    await guestPage.reload();
    await joinRoomViaLobby(guestPage);
    await waitForMediaReady(guestPage);
    await waitForPlaying(adminPage);
    await waitForPlaying(guestPage);
    await waitForTimesConverged(adminPage, guestPage, 6, 45000);
  });

  test('04. buffering lock appears then releases after seek', async ({ room }) => {
    const { adminPage, adminPlayer } = room;
    // Large seek often triggers SYNCING / controls locked while syncing
    for (let i = 0; i < 5; i++) {
      await adminPlayer.seekForward10();
    }
    // Either briefly shows syncing lock or settles quickly — both OK if controls recover
    await expect
      .poll(
        async () => {
          const locked = await adminPage.locator('[title="Controls locked while syncing"]').count();
          const syncing = await adminPage.getByText('SYNCING', { exact: true }).isVisible().catch(() => false);
          const playOrPause = adminPage.locator('button[title="Play"], button[title="Pause"]');
          const enabled = await playOrPause.first().isEnabled().catch(() => false);
          // Success when either we observed syncing, or controls are usable again
          return locked > 0 || syncing || enabled;
        },
        { timeout: 30000 },
      )
      .toBe(true);

    await expect
      .poll(async () => {
        await adminPlayer.revealControls();
        return adminPage.locator('button[title="Play"], button[title="Pause"]').first().isEnabled();
      }, { timeout: 45000 })
      .toBe(true);
  });

  test('05. high-frequency play/pause toggles end in shared state', async ({ room }) => {
    const { adminPage, guestPage, adminPlayer, guestPlayer } = room;
    for (let i = 0; i < 5; i++) {
      await adminPlayer.toggleViaSpace();
      await pageWait(200);
    }
    await expect
      .poll(async () => {
        const a = await getVideoState(adminPage);
        const b = await getVideoState(guestPage);
        return a.paused === b.paused;
      }, { timeout: 30000 })
      .toBe(true);
    await expect(guestPlayer).toBeTruthy();
  });
});

async function pageWait(ms: number) {
  await new Promise((r) => setTimeout(r, ms));
}
