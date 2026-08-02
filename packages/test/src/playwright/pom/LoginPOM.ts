import { Page } from '@playwright/test';

export class LoginPOM {
  constructor(private page: Page) {}

  async navigate() {
    await this.page.goto('/login');
  }

  async login(username: string) {
    await this.page.fill('input[type="text"], input[name="username"]', username);
    await this.page.fill('input[type="password"]', 'Password123!');
    await this.page.click('button[type="submit"]');
  }
}
