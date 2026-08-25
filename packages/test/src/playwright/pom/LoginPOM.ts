import { Page, expect } from '@playwright/test';

export class LoginPOM {
  constructor(private page: Page) {}

  async navigate() {
    await this.page.goto('/login');
  }

  async login(username: string, password = 'password123') {
    await this.page.fill('input[name="username"]', username);
    await this.page.fill('input[name="password"]', password);
    await this.page.click('button[type="submit"]');
  }

  async expectError(message = 'Incorrect username or password.') {
    await expect(this.page.getByText(message)).toBeVisible();
  }

  async expectOnLogin() {
    await expect(this.page).toHaveURL(/\/login/);
  }
}
