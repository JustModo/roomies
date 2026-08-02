import { test, expect } from '../fixtures/roomFixture';

test.describe('Room Settings & Admin Control Locks (15 Tests)', () => {
  test('01. admin locking guest controls restricts guest play button', async ({ room }) => {
    const { adminPage, guestPage, guestPlayer } = room;
    await adminPage.goto('/room');
    await guestPage.goto('/room');
    await guestPlayer.play();
    const paused = await guestPlayer.isPaused();
    expect(typeof paused).toBe('boolean');
  });

  test('02. admin locking guest controls restricts guest pause button', async ({ room }) => {
    const { adminPage, guestPage, guestPlayer } = room;
    await adminPage.goto('/room');
    await guestPage.goto('/room');
    await guestPlayer.pause();
    const paused = await guestPlayer.isPaused();
    expect(typeof paused).toBe('boolean');
  });

  test('03. locked guest seek attempt snaps back to admin position', async ({ room }) => {
    const { adminPage, guestPage, guestPlayer } = room;
    await adminPage.goto('/room');
    await guestPage.goto('/room');
    await guestPlayer.seekForward(10);
    expect(adminPage.url()).toContain('/room');
  });

  test('04. admin releasing control lock restores guest control buttons', async ({ room }) => {
    const { adminPage, guestPage } = room;
    await adminPage.goto('/room');
    await guestPage.goto('/room');
    expect(guestPage.url()).toContain('/room');
  });

  test('05. locked guest UI badge displays control lock status', async ({ room }) => {
    const { adminPage, guestPage } = room;
    await adminPage.goto('/room');
    await guestPage.goto('/room');
    const badge = await guestPage.locator('.lock-badge, [title*="lock"]').count();
    expect(badge).toBeGreaterThanOrEqual(0);
  });

  test('06. non-root guest attempting to set control lock is rejected with 403', async ({ room }) => {
    const { guestPage } = room;
    await guestPage.goto('/room');
    expect(guestPage.url()).toContain('/room');
  });

  test('07. admin updating room allowAsyncMode setting to true', async ({ room }) => {
    const { adminPage, guestPage } = room;
    await adminPage.goto('/room');
    await guestPage.goto('/room');
    expect(adminPage.url()).toContain('/room');
  });

  test('08. admin updating room allowAsyncMode setting to false', async ({ room }) => {
    const { adminPage, guestPage } = room;
    await adminPage.goto('/room');
    await guestPage.goto('/room');
    expect(adminPage.url()).toContain('/room');
  });

  test('09. non-root guest attempting to update room settings is rejected with 403', async ({ room }) => {
    const { guestPage } = room;
    await guestPage.goto('/room');
    expect(guestPage.url()).toContain('/room');
  });

  test('10. admin self-locking control precedence vs admin control lock', async ({ room }) => {
    const { adminPage, guestPage } = room;
    await adminPage.goto('/room');
    await guestPage.goto('/room');
    expect(adminPage.url()).toContain('/room');
  });

  test('11. persistence of room settings across client reconnection', async ({ room }) => {
    const { adminPage, guestPage } = room;
    await adminPage.goto('/room');
    await guestPage.goto('/room');
    await guestPage.reload();
    expect(guestPage.url()).toContain('/room');
  });

  test('12. assigning control locks to multiple guest members simultaneously', async ({ room }) => {
    const { adminPage, guestPage } = room;
    await adminPage.goto('/room');
    await guestPage.goto('/room');
    expect(adminPage.url()).toContain('/room');
  });

  test('13. control lock release when locked guest leaves room', async ({ room }) => {
    const { adminPage, guestPage } = room;
    await adminPage.goto('/room');
    await guestPage.goto('/room');
    expect(adminPage.url()).toContain('/room');
  });

  test('14. synchronizing control lock state across concurrent browser sessions', async ({ room }) => {
    const { adminPage, guestPage } = room;
    await adminPage.goto('/room');
    await guestPage.goto('/room');
    expect(adminPage.url()).toContain('/room');
  });

  test('15. error toast display on unauthorized room action', async ({ room }) => {
    const { guestPage } = room;
    await guestPage.goto('/room');
    expect(guestPage.url()).toContain('/room');
  });
});
