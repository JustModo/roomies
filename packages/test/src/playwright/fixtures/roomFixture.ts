import { test as base, Page, BrowserContext, APIRequestContext } from '@playwright/test';
import { PlayerPOM } from '../pom/PlayerPOM';

export interface MultiUserRoom {
  adminPage: Page;
  guestPage: Page;
  adminPlayer: PlayerPOM;
  guestPlayer: PlayerPOM;
  adminContext: BrowserContext;
  guestContext: BrowserContext;
}

async function obtainTokens(request: APIRequestContext) {
  const statusRes = await request.get('http://localhost:3000/api/auth/status');
  const status = await statusRes.json();

  if (!status.isSetup) {
    await request.post('http://localhost:3000/api/auth/setup', {
      data: { username: 'admin', password: 'Password123!' },
    });
  }

  const adminLoginRes = await request.post('http://localhost:3000/api/auth/login', {
    data: { username: 'admin', password: 'Password123!' },
  });
  const adminLoginData = await adminLoginRes.json();
  const adminToken = adminLoginData.token;

  const guestUsername = `guest_${Math.random().toString(36).substring(2, 7)}`;
  await request.post('http://localhost:3000/api/users', {
    headers: { Authorization: `Bearer ${adminToken}` },
    data: { username: guestUsername, password: 'Password123!', role: 'guest' },
  });

  const guestLoginRes = await request.post('http://localhost:3000/api/auth/login', {
    data: { username: guestUsername, password: 'Password123!' },
  });
  const guestLoginData = await guestLoginRes.json();
  const guestToken = guestLoginData.token;

  return { adminToken, guestToken };
}

export const test = base.extend<{ room: MultiUserRoom }>({
  room: async ({ browser, request }, use) => {
    const { adminToken, guestToken } = await obtainTokens(request);

    const adminContext = await browser.newContext();
    const guestContext = await browser.newContext();

    const adminPage = await adminContext.newPage();
    const guestPage = await guestContext.newPage();

    await adminPage.goto('/');
    await adminPage.evaluate((t) => localStorage.setItem('token', t), adminToken);

    await guestPage.goto('/');
    await guestPage.evaluate((t) => localStorage.setItem('token', t), guestToken);

    const adminPlayer = new PlayerPOM(adminPage);
    const guestPlayer = new PlayerPOM(guestPage);

    await use({
      adminPage,
      guestPage,
      adminPlayer,
      guestPlayer,
      adminContext,
      guestContext,
    });

    await adminContext.close();
    await guestContext.close();
  },
});

export { expect } from '@playwright/test';
