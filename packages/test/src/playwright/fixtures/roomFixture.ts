import { test as base, Page, BrowserContext, APIRequestContext } from '@playwright/test';
import { PlayerPOM } from '../pom/PlayerPOM';
import { RoomPOM } from '../pom/RoomPOM';
import { LobbyPOM } from '../pom/LobbyPOM';
import { obtainAdminAndGuest } from '../helpers/auth';
import { startMedia, stopMedia } from '../helpers/media';
import { joinRoomViaLobby, setAuthToken } from '../helpers/room';
import { waitForMediaReady } from '../helpers/syncAssert';

export interface MultiUserRoom {
  adminPage: Page;
  guestPage: Page;
  adminPlayer: PlayerPOM;
  guestPlayer: PlayerPOM;
  adminRoom: RoomPOM;
  guestRoom: RoomPOM;
  adminLobby: LobbyPOM;
  guestLobby: LobbyPOM;
  adminContext: BrowserContext;
  guestContext: BrowserContext;
  adminToken: string;
  guestToken: string;
  guestUsername: string;
  adminUsername: string;
  request: APIRequestContext;
}

async function buildRoom(
  browser: import('@playwright/test').Browser,
  request: APIRequestContext,
  options: { startMovie?: boolean; joinBoth?: boolean } = {},
): Promise<MultiUserRoom & { cleanup: () => Promise<void> }> {
  const { startMovie = true, joinBoth = true } = options;
  const tokens = await obtainAdminAndGuest();

  if (startMovie) {
    await startMedia(request, tokens.adminToken);
  } else {
    await stopMedia(request, tokens.adminToken).catch(() => undefined);
  }

  const adminContext = await browser.newContext();
  const guestContext = await browser.newContext();
  const adminPage = await adminContext.newPage();
  const guestPage = await guestContext.newPage();

  await setAuthToken(adminPage, tokens.adminToken);
  await setAuthToken(guestPage, tokens.guestToken);

  if (joinBoth) {
    await joinRoomViaLobby(adminPage);
    await joinRoomViaLobby(guestPage);
    if (startMovie) {
      // Parallel: sequential wait hangs the 2nd page on a missed HLS response listener.
      await Promise.all([waitForMediaReady(adminPage), waitForMediaReady(guestPage)]);
    }
  }

  return {
    adminPage,
    guestPage,
    adminPlayer: new PlayerPOM(adminPage),
    guestPlayer: new PlayerPOM(guestPage),
    adminRoom: new RoomPOM(adminPage),
    guestRoom: new RoomPOM(guestPage),
    adminLobby: new LobbyPOM(adminPage),
    guestLobby: new LobbyPOM(guestPage),
    adminContext,
    guestContext,
    adminToken: tokens.adminToken,
    guestToken: tokens.guestToken,
    guestUsername: tokens.guestUsername,
    adminUsername: tokens.adminUsername,
    request,
    cleanup: async () => {
      await adminContext.close().catch(() => undefined);
      await guestContext.close().catch(() => undefined);
    },
  };
}

export const test = base.extend<{
  room: MultiUserRoom;
  roomNoMedia: MultiUserRoom;
}>({
  room: async ({ browser, request }, use) => {
    const ctx = await buildRoom(browser, request, { startMovie: true, joinBoth: true });
    await use(ctx);
    await stopMedia(request, ctx.adminToken).catch(() => undefined);
    await ctx.cleanup();
  },
  roomNoMedia: async ({ browser, request }, use) => {
    const ctx = await buildRoom(browser, request, { startMovie: false, joinBoth: true });
    await use(ctx);
    await ctx.cleanup();
  },
});

export { expect } from '@playwright/test';
export { buildRoom };
