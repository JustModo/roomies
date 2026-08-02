import { test, expect } from '@playwright/test';
import { LoginPOM } from '../pom/LoginPOM';
import { LobbyPOM } from '../pom/LobbyPOM';
import { RoomPOM } from '../pom/RoomPOM';
import { ADMIN_USER, GUEST_PASSWORD, obtainAdminAndGuest } from '../helpers/auth';
import { stopMedia } from '../helpers/media';
import { joinRoomViaLobby, setAuthToken } from '../helpers/room';

test.describe('Auth & Lobby', () => {
  test('01. root login lands on lobby', async ({ page }) => {
    await obtainAdminAndGuest();
    const loginPom = new LoginPOM(page);
    await loginPom.navigate();
    await loginPom.login(ADMIN_USER.username, ADMIN_USER.password);
    const lobby = new LobbyPOM(page);
    await lobby.expectOnLobby();
  });

  test('02. invalid credentials stay on login with error', async ({ page }) => {
    await obtainAdminAndGuest();
    const loginPom = new LoginPOM(page);
    await loginPom.navigate();
    await loginPom.login(ADMIN_USER.username, 'WrongPass999');
    await loginPom.expectOnLogin();
    await loginPom.expectError();
  });

  test('03. guest login reaches lobby', async ({ page }) => {
    const tokens = await obtainAdminAndGuest();
    const loginPom = new LoginPOM(page);
    await loginPom.navigate();
    await loginPom.login(tokens.guestUsername, GUEST_PASSWORD);
    const lobby = new LobbyPOM(page);
    await lobby.expectOnLobby();
  });

  test('04. lobby shows WAITING when no media', async ({ page, request }) => {
    const tokens = await obtainAdminAndGuest();
    await stopMedia(request, tokens.adminToken).catch(() => undefined);
    await setAuthToken(page, tokens.adminToken);
    const lobby = new LobbyPOM(page);
    await lobby.goto();
    await lobby.expectStatus('WAITING');
  });

  test('05. JOIN ROOM enters room and shows room chrome', async ({ page }) => {
    const tokens = await obtainAdminAndGuest();
    await setAuthToken(page, tokens.adminToken);
    await joinRoomViaLobby(page);
    const room = new RoomPOM(page);
    await room.expectInRoom();
    await expect(page).toHaveURL(/\/room/);
  });

  test('06. direct /room without join interaction redirects to lobby', async ({ page }) => {
    const tokens = await obtainAdminAndGuest();
    await setAuthToken(page, tokens.adminToken);
    await page.goto('/room');
    await expect(page).toHaveURL(/\/($|\?)/);
    const lobby = new LobbyPOM(page);
    await lobby.expectOnLobby();
  });

  test('07. Exit returns to lobby and updates member count', async ({ browser, request }) => {
    const tokens = await obtainAdminAndGuest();
    await stopMedia(request, tokens.adminToken).catch(() => undefined);

    const adminContext = await browser.newContext();
    const guestContext = await browser.newContext();
    const adminPage = await adminContext.newPage();
    const guestPage = await guestContext.newPage();

    await setAuthToken(adminPage, tokens.adminToken);
    await setAuthToken(guestPage, tokens.guestToken);
    await joinRoomViaLobby(adminPage);
    await joinRoomViaLobby(guestPage);

    const adminRoom = new RoomPOM(adminPage);
    await adminRoom.expectMemberCount(2);

    const guestRoom = new RoomPOM(guestPage);
    await guestRoom.exit();

    const guestLobby = new LobbyPOM(guestPage);
    await guestLobby.expectOnLobby();

    await adminRoom.expectMemberCount(1);

    await adminContext.close();
    await guestContext.close();
  });
});
