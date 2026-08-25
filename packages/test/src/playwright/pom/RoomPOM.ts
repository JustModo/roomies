import { Page, expect } from '@playwright/test';
import { openPartyTab, openSettingsTab } from '../helpers/room';

export class RoomPOM {
  constructor(private page: Page) {}

  exitButton() {
    return this.page.getByRole('button', { name: /Exit/i });
  }

  async expectInRoom() {
    await expect(this.exitButton()).toBeVisible({ timeout: 15000 });
  }

  async exit() {
    await this.exitButton().click();
    await this.page.waitForURL(/\/($|\?)/);
  }

  async openParty() {
    await openPartyTab(this.page);
  }

  async openSettings() {
    await openSettingsTab(this.page);
  }

  async expectMemberCount(count: number) {
    await this.openParty();
    await expect(this.page.getByText(new RegExp(`IN ROOM \\(${count}\\)`, 'i'))).toBeVisible({
      timeout: 15000,
    });
  }

  async expectMemberAbsent(username: string) {
    await this.openParty();
    await expect(this.page.getByRole('button', { name: new RegExp(`^${username}$`, 'i') })).toHaveCount(0, {
      timeout: 15000,
    });
  }

  async selfLock() {
    await this.page.locator('button[title="Lock controls"]').click();
  }

  async selfUnlock() {
    await this.page.locator('button[title="Unlock controls"]').click();
  }

  async expectControlsLockedByAdmin() {
    await expect(this.page.locator('[title="Controls locked by admin"]')).toBeVisible({
      timeout: 15000,
    });
  }

  async expectControlsUnlocked() {
    await expect(this.page.locator('[title="Controls locked by admin"]')).toHaveCount(0);
    await expect(this.page.locator('[title="Controls locked while syncing"]')).toHaveCount(0);
  }

  syncButton() {
    return this.page.getByRole('button', { name: /^SYNC$/i });
  }

  async enterAsyncMode() {
    const sync = this.syncButton();
    await expect(sync).toBeEnabled({ timeout: 15000 });
    await expect(sync).toHaveAttribute('title', /Go Async Mode/i);
    await sync.click();
    await expect(sync).toHaveAttribute('title', /Resync with Room/i);
  }

  async resyncWithRoom() {
    const sync = this.syncButton();
    await expect(sync).toHaveAttribute('title', /Resync with Room/i);
    await sync.click();
    await expect(sync).toHaveAttribute('title', /Go Async Mode/i, { timeout: 15000 });
  }

  async expectAsyncDisabled() {
    const sync = this.syncButton();
    await expect(sync).toBeDisabled({ timeout: 15000 });
    await expect(sync).toHaveAttribute('title', /Async mode disabled by admin/i);
  }
}
