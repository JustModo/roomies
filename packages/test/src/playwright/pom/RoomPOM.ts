import { Page, expect } from '@playwright/test';
import { openChatTab, openPartyTab, openSettingsTab } from '../helpers/room';

export class RoomPOM {
  constructor(private page: Page) {}

  exitButton() {
    return this.page.getByRole('button', { name: /Exit/i });
  }

  manageButton() {
    return this.page.getByRole('button', { name: /Manage/i });
  }

  async expectInRoom() {
    await expect(this.exitButton()).toBeVisible({ timeout: 15000 });
  }

  async exit() {
    await this.exitButton().click();
    await this.page.waitForURL(/\/($|\?)/);
  }

  async openManage() {
    await this.manageButton().click();
    await expect(this.page.getByText('MANAGE ROOM')).toBeVisible();
  }

  async stopMediaViaManage() {
    await this.openManage();
    await this.page.getByRole('button', { name: /^Stop$/i }).click();
    await this.page.locator('button').filter({ has: this.page.locator('svg') }).first();
    // Close overlay via X if still open
    const close = this.page.locator('button').filter({ hasText: '' });
    // Prefer Escape or clicking X icon button near MANAGE ROOM
    const overlayClose = this.page.locator('h1:has-text("MANAGE ROOM")').locator('..').locator('button').last();
    if (await overlayClose.isVisible().catch(() => false)) {
      await overlayClose.click();
    }
  }

  async openParty() {
    await openPartyTab(this.page);
  }

  async openSettings() {
    await openSettingsTab(this.page);
  }

  async openChat() {
    await openChatTab(this.page);
  }

  async expectMemberCount(count: number) {
    await this.openParty();
    await expect(this.page.getByText(new RegExp(`IN ROOM \\(${count}\\)`, 'i'))).toBeVisible({
      timeout: 15000,
    });
  }

  async expectMemberPresent(username: string) {
    await this.openParty();
    await expect(this.page.getByText(new RegExp(username, 'i')).first()).toBeVisible({
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

  async expectControlsLockedWhileSyncing() {
    await expect(this.page.locator('[title="Controls locked while syncing"]')).toBeVisible({
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

  async sendChatMessage(message: string) {
    await this.openChat();
    const input = this.page.locator('textarea[placeholder="Message"]');
    await input.fill(message);
    await input.press('Enter');
  }

  async expectChatMessage(message: string) {
    await this.openChat();
    await expect(this.page.getByText(message)).toBeVisible({ timeout: 15000 });
  }
}
