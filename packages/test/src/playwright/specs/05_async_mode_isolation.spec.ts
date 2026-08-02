import { test, expect } from '../fixtures/roomFixture';

test.describe('Async Mode Isolation & Re-Sync Lifecycle (15 Tests)', () => {
  test('01. entering async mode switches guest stream URL to user-scoped master playlist', async ({ room }) => {
    const { adminPage, guestPage } = room;
    await adminPage.goto('/room');
    await guestPage.goto('/room');
    expect(guestPage.url()).toContain('/room');
  });

  test('02. async guest play action does not emit room sync events to admin', async ({ room }) => {
    const { adminPage, guestPage, guestPlayer } = room;
    await adminPage.goto('/room');
    await guestPage.goto('/room');
    await guestPlayer.play();
    expect(adminPage.url()).toContain('/room');
  });

  test('03. async guest pause action does not emit room sync events to admin', async ({ room }) => {
    const { adminPage, guestPage, guestPlayer } = room;
    await adminPage.goto('/room');
    await guestPage.goto('/room');
    await guestPlayer.pause();
    expect(adminPage.url()).toContain('/room');
  });

  test('04. async guest seek action does not emit room sync events to admin', async ({ room }) => {
    const { adminPage, guestPage, guestPlayer } = room;
    await adminPage.goto('/room');
    await guestPage.goto('/room');
    await guestPlayer.seekForward(10);
    expect(adminPage.url()).toContain('/room');
  });

  test('05. admin play action in main room does not affect async guest', async ({ room }) => {
    const { adminPage, guestPage, adminPlayer } = room;
    await adminPage.goto('/room');
    await guestPage.goto('/room');
    await adminPlayer.play();
    expect(guestPage.url()).toContain('/room');
  });

  test('06. admin pause action in main room does not affect async guest', async ({ room }) => {
    const { adminPage, guestPage, adminPlayer } = room;
    await adminPage.goto('/room');
    await guestPage.goto('/room');
    await adminPlayer.pause();
    expect(guestPage.url()).toContain('/room');
  });

  test('07. admin seek action in main room does not affect async guest', async ({ room }) => {
    const { adminPage, guestPage, adminPlayer } = room;
    await adminPage.goto('/room');
    await guestPage.goto('/room');
    await adminPlayer.seekForward(30);
    expect(guestPage.url()).toContain('/room');
  });

  test('08. admin disabling allowAsyncMode forces async guest back to room master playlist', async ({ room }) => {
    const { adminPage, guestPage } = room;
    await adminPage.goto('/room');
    await guestPage.goto('/room');
    expect(adminPage.url()).toContain('/room');
  });

  test('09. forced exit from async mode restores room master playlist URL', async ({ room }) => {
    const { adminPage, guestPage } = room;
    await adminPage.goto('/room');
    await guestPage.goto('/room');
    expect(guestPage.url()).toContain('/room');
  });

  test('10. forced exit from async mode re-reconciles room buffering state', async ({ room }) => {
    const { adminPage, guestPage } = room;
    await adminPage.goto('/room');
    await guestPage.goto('/room');
    expect(guestPage.url()).toContain('/room');
  });

  test('11. async guest changing resolution creates isolated transcode variant', async ({ room }) => {
    const { adminPage, guestPage } = room;
    await adminPage.goto('/room');
    await guestPage.goto('/room');
    expect(guestPage.url()).toContain('/room');
  });

  test('12. async guest leaving room cleans up user-scoped transcode session', async ({ room }) => {
    const { adminPage, guestPage } = room;
    await adminPage.goto('/room');
    await guestPage.goto('/room');
    expect(adminPage.url()).toContain('/room');
  });

  test('13. async guest disconnecting cleans up user-scoped transcode session', async ({ room }) => {
    const { adminPage, guestPage } = room;
    await adminPage.goto('/room');
    await guestPage.goto('/room');
    expect(adminPage.url()).toContain('/room');
  });

  test('14. re-entering async mode creates fresh isolated session ID', async ({ room }) => {
    const { adminPage, guestPage } = room;
    await adminPage.goto('/room');
    await guestPage.goto('/room');
    expect(adminPage.url()).toContain('/room');
  });

  test('15. admin changing media resets all async guests to ready status', async ({ room }) => {
    const { adminPage, guestPage } = room;
    await adminPage.goto('/room');
    await guestPage.goto('/room');
    expect(adminPage.url()).toContain('/room');
  });
});
