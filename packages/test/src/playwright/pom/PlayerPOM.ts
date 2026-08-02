import { Page, expect, Locator } from '@playwright/test';
import {
  getVideoState,
  waitForPaused,
  waitForPlaybackUnlocked,
  waitForPlaying,
} from '../helpers/syncAssert';

export class PlayerPOM {
  constructor(private page: Page) {}

  video(): Locator {
    return this.page.locator('video');
  }

  controls(): Locator {
    return this.page.locator('[data-video-controls="true"]');
  }

  async revealControls() {
    await this.video().hover({ force: true });
    await this.page.mouse.move(400, 400);
  }

  playButton() {
    return this.page.locator('button[title="Play"]');
  }

  pauseButton() {
    return this.page.locator('button[title="Pause"]');
  }

  forwardButton() {
    return this.page.locator('button[title="Forward 10s"]');
  }

  backButton() {
    return this.page.locator('button[title="Back 10s"]');
  }

  /** Ensure syncing/admin locks are clear and transport controls are enabled. */
  async ensureUnlocked() {
    await waitForPlaybackUnlocked(this.page);
    await this.revealControls();
  }

  async playViaButton() {
    await this.ensureUnlocked();
    const play = this.playButton();
    await expect(play).toBeVisible({ timeout: 10000 });
    await expect(play).toBeEnabled({ timeout: 10000 });
    await play.click();
    await waitForPlaying(this.page);
  }

  async pauseViaButton() {
    await this.ensureUnlocked();
    const pause = this.pauseButton();
    await expect(pause).toBeVisible({ timeout: 10000 });
    await expect(pause).toBeEnabled({ timeout: 10000 });
    await pause.click();
    await waitForPaused(this.page);
  }

  async toggleViaSpace() {
    await this.ensureUnlocked();
    await this.page.locator('body').click({ position: { x: 10, y: 10 } }).catch(() => undefined);
    await this.page.keyboard.press('Space');
  }

  async toggleViaK() {
    await this.ensureUnlocked();
    await this.page.locator('body').click({ position: { x: 10, y: 10 } }).catch(() => undefined);
    await this.page.keyboard.press('KeyK');
  }

  async seekForward10() {
    await this.ensureUnlocked();
    await this.page.keyboard.press('ArrowRight');
  }

  async seekBackward10() {
    await this.ensureUnlocked();
    await this.page.keyboard.press('ArrowLeft');
  }

  async seekForwardViaButton() {
    await this.ensureUnlocked();
    const btn = this.forwardButton();
    await expect(btn).toBeEnabled({ timeout: 10000 });
    await btn.click();
  }

  async seekBackwardViaButton() {
    await this.ensureUnlocked();
    const btn = this.backButton();
    await expect(btn).toBeEnabled({ timeout: 10000 });
    await btn.click();
  }

  async mute() {
    await this.revealControls();
    const mute = this.page.locator('button[title="Mute"]');
    if (await mute.isVisible().catch(() => false)) {
      await mute.click();
    }
  }

  async unmute() {
    await this.revealControls();
    const unmute = this.page.locator('button[title="Unmute"]');
    if (await unmute.isVisible().catch(() => false)) {
      await unmute.click();
    }
  }

  async setVolume(value: number) {
    await this.revealControls();
    const volumeBtn = this.page.locator('button[title="Mute"], button[title="Unmute"]');
    await volumeBtn.hover();
    const slider = this.page.locator('input[type="range"][min="0"][max="1"]');
    await slider.waitFor({ state: 'visible', timeout: 5000 });
    await slider.evaluate((el, v) => {
      const input = el as HTMLInputElement;
      input.value = String(v);
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }, value);
  }

  async cyclePlaybackRate() {
    await this.revealControls();
    await this.page.locator('button[title="Playback speed"]').click();
  }

  async getRateLabel(): Promise<string> {
    await this.revealControls();
    return ((await this.page.locator('button[title="Playback speed"]').textContent()) ?? '').trim();
  }

  async openSubtitlesMenu() {
    await this.revealControls();
    await this.page.locator('button[title="Subtitles"]').click();
    await expect(this.page.getByText('Subtitles', { exact: true }).first()).toBeVisible();
  }

  async selectSubtitleTrack(label: string | RegExp) {
    await this.openSubtitlesMenu();
    await this.page.getByRole('button', { name: label }).click();
  }

  async turnSubtitlesOff() {
    await this.openSubtitlesMenu();
    await this.page.getByRole('button', { name: /^Off$/i }).click();
  }

  async getCurrentTime(): Promise<number> {
    return (await getVideoState(this.page)).currentTime;
  }

  async isPaused(): Promise<boolean> {
    return (await getVideoState(this.page)).paused;
  }

  async expectPlaying() {
    await waitForPlaying(this.page);
  }

  async expectPaused() {
    await waitForPaused(this.page);
  }

  async expectPlayButtonVisible() {
    await this.revealControls();
    await expect(this.playButton()).toBeVisible();
  }

  async expectPauseButtonVisible() {
    await this.revealControls();
    await expect(this.pauseButton()).toBeVisible();
  }

  async expectControlsDisabled() {
    await this.revealControls();
    const playOrPause = this.page.locator('button[title="Play"], button[title="Pause"]');
    await expect(playOrPause.first()).toBeDisabled({ timeout: 10000 });
  }

  async expectControlsEnabled() {
    await this.revealControls();
    const playOrPause = this.page.locator('button[title="Play"], button[title="Pause"]');
    await expect(playOrPause.first()).toBeEnabled({ timeout: 10000 });
  }

  async expectSubtitleText(text: string | RegExp) {
    await expect(this.page.getByText(text)).toBeVisible({ timeout: 15000 });
  }

  async expectNoSubtitleText(text: string | RegExp) {
    await expect(this.page.getByText(text)).toHaveCount(0);
  }
}
