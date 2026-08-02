import {
  createAdminAccount,
  createGuestAccount,
  type UserAccount,
} from '../../vitest/helpers/testFixtures';

export const API_BASE = 'http://127.0.0.1:3000';

/** Same credentials as Vitest fixtures (`createAdminAccount` / `createGuestAccount`). */
export const ADMIN_USER = { username: 'admin', password: 'password123' };
export const GUEST_PASSWORD = 'guestpassword123';

export interface AuthTokens {
  adminToken: string;
  guestToken: string;
  guestUsername: string;
  adminUsername: string;
  admin: UserAccount;
  guest: UserAccount;
}

async function getStatus(): Promise<{ needsBootstrap: boolean; hasRoot: boolean }> {
  const res = await fetch(`${API_BASE}/api/auth/status`);
  if (!res.ok) {
    throw new Error(`auth status failed: ${res.status}`);
  }
  return res.json();
}

/**
 * Bootstrap admin+guest using Vitest helpers against the .e2e sandbox DB.
 * Fresh DB each run → always POST /api/auth/setup.
 */
export async function obtainAdminAndGuest(): Promise<AuthTokens> {
  const status = await getStatus();

  let admin: UserAccount;
  if (status.needsBootstrap) {
    admin = await createAdminAccount(API_BASE, ADMIN_USER.username, ADMIN_USER.password);
  } else {
    // Sandbox should be wiped each run; if root exists, setup was already done in this process.
    const res = await fetch(`${API_BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(ADMIN_USER),
    });
    if (!res.ok) {
      throw new Error(
        `E2E DB already has a root but setup credentials failed (${res.status}). ` +
          `Ensure prepare-sandbox recreates packages/test/.e2e/config each run.`,
      );
    }
    const data = await res.json();
    admin = { username: ADMIN_USER.username, token: data.token, user: data.user };
  }

  const guestUsername = `g_${Math.random().toString(36).slice(2, 8)}`;
  const guest = await createGuestAccount(
    API_BASE,
    admin.token,
    guestUsername,
    GUEST_PASSWORD,
  );

  return {
    adminToken: admin.token,
    guestToken: guest.token,
    guestUsername: guest.username,
    adminUsername: admin.username,
    admin,
    guest,
  };
}

export async function createGuest(
  adminToken: string,
  username?: string,
): Promise<UserAccount> {
  const guestUsername = username ?? `g_${Math.random().toString(36).slice(2, 8)}`;
  return createGuestAccount(API_BASE, adminToken, guestUsername, GUEST_PASSWORD);
}

export async function authHeaders(token: string) {
  return { Authorization: `Bearer ${token}` };
}
