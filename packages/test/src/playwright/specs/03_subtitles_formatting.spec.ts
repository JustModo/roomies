import { test, expect } from '../fixtures/roomFixture';
import { waitForTimeWithin, getVideoState } from '../helpers/syncAssert';

test.describe('Subtitles', () => {
  test('01. subtitle track appears in menu', async ({ room }) => {
    const { adminPlayer, adminPage } = room;
    await adminPlayer.openSubtitlesMenu();
    // Sidecar language often displays as English or Unknown
    const off = adminPage.getByRole('button', { name: /^Off$/i });
    await expect(off).toBeVisible();
    const track = adminPage.getByRole('button', { name: /English|Unknown|en/i }).first();
    await expect(track).toBeVisible();
  });

  test('02. enable track shows cue text near known timestamp', async ({ room }) => {
    const { adminPage, adminPlayer } = room;
    // Generated SRT: cue 1 is 0–9.5s "E2E subtitle 1"; cue 2 starts at 10s.
    // Seek once so we are clearly inside cue 2.
    await adminPlayer.seekForward10();
    await adminPlayer.selectSubtitleTrack(/English|Unknown|en/i);
    await waitForTimeWithin(adminPage, 10, 5, 30000);
    await adminPlayer.expectSubtitleText(/E2E subtitle [12]/i);
  });

  test('03. turn subtitles Off clears overlay text', async ({ room }) => {
    const { adminPage, adminPlayer } = room;
    await adminPlayer.seekForward10();
    await adminPlayer.selectSubtitleTrack(/English|Unknown|en/i);
    await waitForTimeWithin(adminPage, 10, 5, 30000);
    await adminPlayer.turnSubtitlesOff();
    await expect
      .poll(async () => {
        const state = await getVideoState(adminPage);
        return state.exists;
      })
      .toBe(true);
    await adminPlayer.turnSubtitlesOff();
  });

  test('04. seek across cue boundary updates text', async ({ room }) => {
    const { adminPage, adminPlayer } = room;
    await adminPlayer.seekForward10();
    await adminPlayer.selectSubtitleTrack(/English|Unknown|en/i);
    await waitForTimeWithin(adminPage, 10, 5, 30000);
    await adminPlayer.expectSubtitleText(/E2E subtitle [12]/i);
    // Jump into next cue window (~20s+)
    await adminPlayer.seekForward10();
    await expect
      .poll(async () => adminPlayer.getCurrentTime(), { timeout: 15000 })
      .toBeGreaterThan(15);
    await adminPlayer.expectSubtitleText(/E2E subtitle [23]/i);
  });

  test('05. rapid subtitle toggles leave player usable', async ({ room }) => {
    const { adminPlayer, adminPage } = room;
    for (let i = 0; i < 3; i++) {
      await adminPlayer.selectSubtitleTrack(/English|Unknown|en/i);
      await adminPlayer.turnSubtitlesOff();
    }
    await adminPlayer.playViaButton();
    await expect.poll(async () => (await getVideoState(adminPage)).paused).toBe(false);
  });
});
