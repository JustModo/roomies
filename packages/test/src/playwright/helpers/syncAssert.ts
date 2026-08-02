import { Page, expect } from '@playwright/test';

const SETTLE_MS = 15000;
/** Fail fast — do not sit near the full Playwright test timeout. */
const MEDIA_READY_MS = 30000;

export async function waitForVideo(page: Page, timeout = SETTLE_MS) {
  await page.locator('video').waitFor({ state: 'attached', timeout });
}

export async function getVideoState(page: Page) {
  return page.evaluate(() => {
    const video = document.querySelector('video');
    if (!video) {
      return {
        exists: false,
        paused: true,
        currentTime: 0,
        playbackRate: 1,
        muted: true,
        volume: 0,
        duration: 0,
        readyState: 0,
      };
    }
    return {
      exists: true,
      paused: video.paused,
      currentTime: video.currentTime,
      playbackRate: video.playbackRate,
      muted: video.muted,
      volume: video.volume,
      duration: Number.isFinite(video.duration) ? video.duration : 0,
      readyState: video.readyState,
    };
  });
}

export async function waitForPaused(page: Page, timeout = SETTLE_MS) {
  await expect
    .poll(async () => (await getVideoState(page)).paused, { timeout })
    .toBe(true);
  await expect(page.getByText('PAUSED', { exact: true })).toBeVisible({ timeout });
}

export async function waitForPlaying(page: Page, timeout = SETTLE_MS) {
  await expect
    .poll(async () => (await getVideoState(page)).paused, { timeout })
    .toBe(false);
  await expect(page.getByText('PAUSED', { exact: true })).toBeHidden({ timeout });
}

export async function waitForTimeWithin(
  page: Page,
  target: number,
  tolerance = 3,
  timeout = SETTLE_MS,
) {
  await expect
    .poll(
      async () => {
        const { currentTime } = await getVideoState(page);
        return Math.abs(currentTime - target);
      },
      { timeout, message: `expected currentTime near ${target}±${tolerance}` },
    )
    .toBeLessThanOrEqual(tolerance);
}

export async function waitForTimesConverged(
  pageA: Page,
  pageB: Page,
  tolerance = 3,
  timeout = SETTLE_MS,
) {
  await expect
    .poll(
      async () => {
        const a = await getVideoState(pageA);
        const b = await getVideoState(pageB);
        return Math.abs(a.currentTime - b.currentTime);
      },
      { timeout, message: `expected playheads within ${tolerance}s` },
    )
    .toBeLessThanOrEqual(tolerance);
}

export async function waitForOverlay(page: Page, text: string, timeout = SETTLE_MS) {
  await expect(page.getByText(text, { exact: true })).toBeVisible({ timeout });
}

/** Assert the empty-room overlay is showing (no media selected). */
export async function waitForNoMediaOverlay(page: Page, timeout = SETTLE_MS) {
  await waitForOverlay(page, 'THE PARTY WILL START SOON', timeout);
}

function isHlsResponse(url: string) {
  return (
    url.includes('/hls/') ||
    url.includes('master.m3u8') ||
    url.includes('stream.m3u8') ||
    /\.m3u8(\?|$)/.test(url) ||
    /\.ts(\?|$)/.test(url)
  );
}

/**
 * Wait until playback controls are unlocked (not buffering / not admin-sync lock).
 */
export async function waitForPlaybackUnlocked(page: Page, timeout = MEDIA_READY_MS) {
  await expect(page.locator('[title="Controls locked while syncing"]')).toHaveCount(0, {
    timeout,
  });
  await expect(page.locator('[title="Controls locked by admin"]')).toHaveCount(0, {
    timeout,
  });
  await expect(page.getByText('SYNCING', { exact: true })).toBeHidden({ timeout });

  await page.locator('video').hover({ force: true }).catch(() => undefined);
  const playOrPause = page.locator('button[title="Play"], button[title="Pause"]');
  await expect(playOrPause.first()).toBeEnabled({ timeout });
}

/**
 * Media is selected, HLS has buffered enough to unlock controls, and the
 * video element has a real duration / readyState (not 0:00/0:00 locked UI).
 */
export async function waitForMediaReady(page: Page, timeout = MEDIA_READY_MS) {
  // Best-effort only. HLS may already have completed before this hook runs
  // (e.g. second page). Never block readiness on it — duration/readyState wins.
  const hlsSeenPromise = page
    .waitForResponse((res) => res.ok() && isHlsResponse(res.url()), {
      timeout: Math.min(timeout, 10000),
    })
    .then(() => true)
    .catch(() => false);

  await waitForVideo(page, timeout);
  await expect(page.getByText('THE PARTY WILL START SOON', { exact: true })).toBeHidden({
    timeout,
  });

  await waitForPlaybackUnlocked(page, timeout);

  await expect
    .poll(
      async () => {
        const state = await getVideoState(page);
        return (
          state.exists &&
          state.readyState >= 2 &&
          state.duration > 0 &&
          Number.isFinite(state.duration)
        );
      },
      { timeout, message: 'expected video readyState>=2 and duration>0 (HLS buffered)' },
    )
    .toBe(true);

  // Don't wait out the HLS observer — video buffer already proved load.
  await Promise.race([
    hlsSeenPromise,
    new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 50)),
  ]);
}
