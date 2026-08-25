import { test, expect } from '../fixtures/roomFixture';
import {
  getVideoState,
  waitForTimesConverged,
  waitForTimeWithin,
  waitForPlaying,
  waitForPaused,
} from '../helpers/syncAssert';

test.describe('Seek / Transcode Offset (client-visible)', () => {
  test('01. seek far ahead eventually reaches target region', async ({ room }) => {
    const { adminPage, adminPlayer } = room;
    // 6 × 10s = ~60s ahead
    for (let i = 0; i < 6; i++) {
      await adminPlayer.seekForward10();
    }
    await waitForTimeWithin(adminPage, 60, 12, 60000);
    const state = await getVideoState(adminPage);
    expect(state.exists).toBe(true);
  });

  test('02. second seek in window still plays without permanent stall', async ({ room }) => {
    const { adminPage, adminPlayer } = room;
    for (let i = 0; i < 3; i++) {
      await adminPlayer.seekForward10();
    }
    await waitForTimeWithin(adminPage, 30, 10, 45000);
    await adminPlayer.seekForward10();
    await waitForTimeWithin(adminPage, 40, 10, 45000);
    await adminPlayer.playViaButton();
    await waitForPlaying(adminPage);
  });

  test('03. admin long seek — guest converges to same region', async ({ room }) => {
    const { adminPage, guestPage, adminPlayer } = room;
    for (let i = 0; i < 5; i++) {
      await adminPlayer.seekForward10();
    }
    await waitForTimesConverged(adminPage, guestPage, 8, 60000);
  });

  test('04. rate change keeps playhead continuity', async ({ room }) => {
    const { adminPage, adminPlayer } = room;
    await adminPlayer.playViaButton();
    const before = await adminPlayer.getCurrentTime();
    await adminPlayer.cyclePlaybackRate();
    await pageWait(1500);
    const after = await adminPlayer.getCurrentTime();
    expect(after).toBeGreaterThanOrEqual(before - 1);
    await expect(adminPage.locator('button[title="Playback speed"]')).toBeVisible();
  });

  test('05. seek storm settles with consistent shared state', async ({ room }) => {
    const { adminPage, guestPage, adminPlayer } = room;
    for (let i = 0; i < 8; i++) {
      await adminPlayer.seekForward10();
    }
    await waitForTimesConverged(adminPage, guestPage, 8, 60000);
    const a = await getVideoState(adminPage);
    const b = await getVideoState(guestPage);
    expect(a.paused).toBe(b.paused);
  });
});

async function pageWait(ms: number) {
  await new Promise((r) => setTimeout(r, ms));
}
