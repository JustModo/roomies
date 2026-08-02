import { Page, expect } from '@playwright/test';

export class LobbyPOM {
  constructor(private page: Page) {}

  async goto() {
    await this.page.goto('/');
  }

  joinButton() {
    return this.page.getByRole('button', { name: /JOIN ROOM/i });
  }

  async joinRoom() {
    await expect(this.joinButton()).toBeVisible({ timeout: 15000 });
    await this.joinButton().click();
    await this.page.waitForURL(/\/room/);
  }

  async expectStatus(status: 'WAITING' | 'PLAYING' | 'PAUSED') {
    await expect(this.page.getByText(new RegExp(`PEOPLE · ${status}`))).toBeVisible({
      timeout: 20000,
    });
  }

  async expectOnLobby() {
    await expect(this.joinButton()).toBeVisible({ timeout: 15000 });
  }
}
