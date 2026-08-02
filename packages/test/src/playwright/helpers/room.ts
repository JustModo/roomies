import { Page, expect } from '@playwright/test';

/** Inject JWT and land on the lobby (Login does not auto-redirect after localStorage write). */
export async function setAuthToken(page: Page, token: string) {
  await page.goto('/login');
  await page.evaluate((t) => {
    localStorage.setItem('token', t);
  }, token);
  await page.goto('/');
  await expect(page.getByRole('button', { name: /JOIN ROOM/i })).toBeVisible({ timeout: 20000 });
}

export async function joinRoomViaLobby(page: Page) {
  // Ensure we're authenticated on lobby first
  if (!page.url().match(/\/($|\?)/) || !(await page.getByRole('button', { name: /JOIN ROOM/i }).isVisible().catch(() => false))) {
    await page.goto('/');
    await expect(page.getByRole('button', { name: /JOIN ROOM/i })).toBeVisible({ timeout: 20000 });
  }
  await page.getByRole('button', { name: /JOIN ROOM/i }).click();
  await page.waitForURL(/\/room/, { timeout: 20000 });
  await expect(page.getByRole('button', { name: /Exit/i })).toBeVisible({ timeout: 20000 });
}

export async function exitRoom(page: Page) {
  await page.getByRole('button', { name: /Exit/i }).click();
  await page.waitForURL(/\/($|\?)/, { timeout: 20000 });
  await expect(page.getByRole('button', { name: /JOIN ROOM/i })).toBeVisible({ timeout: 20000 });
}

export async function openSidebarTab(page: Page, tab: 'PARTY' | 'SETTINGS') {
  const tabBtn = page.getByRole('button', { name: new RegExp(`^${tab}$`, 'i') });
  if (!(await tabBtn.isVisible().catch(() => false))) {
    const toggle = page.locator('button[title="Toggle chat"]');
    if (await toggle.isVisible().catch(() => false)) {
      await toggle.click();
    }
  }
  await expect(tabBtn).toBeVisible({ timeout: 10000 });
  await tabBtn.click();
}

export async function openPartyTab(page: Page) {
  await openSidebarTab(page, 'PARTY');
}

export async function openSettingsTab(page: Page) {
  await openSidebarTab(page, 'SETTINGS');
}

export async function lockGuestControls(adminPage: Page, guestUsername: string) {
  await openPartyTab(adminPage);
  await adminPage.getByRole('button', { name: new RegExp(guestUsername, 'i') }).click();
  const lockBtn = adminPage.getByRole('button', { name: /^Lock controls$/i });
  await expect(lockBtn).toBeVisible({ timeout: 10000 });
  await lockBtn.click();
}

export async function unlockGuestControls(adminPage: Page, guestUsername: string) {
  await openPartyTab(adminPage);
  const memberBtn = adminPage.getByRole('button', { name: new RegExp(guestUsername, 'i') });
  if (await memberBtn.isVisible().catch(() => false)) {
    await memberBtn.click();
  }
  const unlockBtn = adminPage.getByRole('button', { name: /^Unlock controls$/i });
  await expect(unlockBtn).toBeVisible({ timeout: 10000 });
  await unlockBtn.click();
}

export async function setAllowAsyncMode(adminPage: Page, enabled: boolean) {
  await openSettingsTab(adminPage);
  const label = adminPage.getByText('Allow Async Mode', { exact: true });
  await expect(label).toBeVisible();
  const row = label.locator('xpath=ancestor::div[contains(@class,"justify-between")]');
  const toggle = row.locator('button').last();
  const className = (await toggle.getAttribute('class')) ?? '';
  const isOn = className.includes('bg-blue-400');
  if (isOn !== enabled) {
    await toggle.click();
  }
}

export async function getAllowAsyncMode(adminPage: Page): Promise<boolean> {
  await openSettingsTab(adminPage);
  const label = adminPage.getByText('Allow Async Mode', { exact: true });
  const row = label.locator('xpath=ancestor::div[contains(@class,"justify-between")]');
  const toggle = row.locator('button').last();
  const className = (await toggle.getAttribute('class')) ?? '';
  return className.includes('bg-blue-400');
}
