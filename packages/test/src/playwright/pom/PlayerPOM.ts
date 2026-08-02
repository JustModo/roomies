import { Page, expect } from '@playwright/test';

export class PlayerPOM {
  constructor(private page: Page) {}

  async play() {
    await this.page.keyboard.press('Space');
  }

  async pause() {
    await this.page.keyboard.press('Space');
  }

  async seekForward(seconds: number = 5) {
    if (seconds === 10) {
      await this.page.keyboard.press('KeyL');
    } else {
      await this.page.keyboard.press('ArrowRight');
    }
  }

  async seekBackward(seconds: number = 5) {
    if (seconds === 10) {
      await this.page.keyboard.press('KeyJ');
    } else {
      await this.page.keyboard.press('ArrowLeft');
    }
  }

  async getCurrentTime(): Promise<number> {
    return await this.page.evaluate(() => {
      const video = document.querySelector('video');
      return video ? video.currentTime : 0;
    });
  }

  async isPaused(): Promise<boolean> {
    return await this.page.evaluate(() => {
      const video = document.querySelector('video');
      return video ? video.paused : true;
    });
  }

  async expectPlaying() {
    const paused = await this.isPaused();
    expect(paused).toBe(false);
  }

  async expectPaused() {
    const paused = await this.isPaused();
    expect(paused).toBe(true);
  }
}
