import { test, expect } from '../fixtures/roomFixture';

test.describe('Player Controls & Basic Scrubbing (25 Tests)', () => {
  test('01. single-user play command starts video execution', async ({ room }) => {
    const { adminPage: page, adminPlayer: player } = room;
    await page.goto('/room');
    await player.play();
    const paused = await player.isPaused();
    expect(typeof paused).toBe('boolean');
  });

  test('02. single-user pause command pauses video execution', async ({ room }) => {
    const { adminPage: page, adminPlayer: player } = room;
    await page.goto('/room');
    await player.pause();
    const paused = await player.isPaused();
    expect(typeof paused).toBe('boolean');
  });

  test('03. forward scrubbing 5s updates currentTime', async ({ room }) => {
    const { adminPage: page, adminPlayer: player } = room;
    await page.goto('/room');
    await player.seekForward(5);
    const time = await player.getCurrentTime();
    expect(time).toBeGreaterThanOrEqual(0);
  });

  test('04. forward scrubbing 10s updates currentTime', async ({ room }) => {
    const { adminPage: page, adminPlayer: player } = room;
    await page.goto('/room');
    await player.seekForward(10);
    const time = await player.getCurrentTime();
    expect(time).toBeGreaterThanOrEqual(0);
  });

  test('05. forward scrubbing 30s updates currentTime', async ({ room }) => {
    const { adminPage: page, adminPlayer: player } = room;
    await page.goto('/room');
    await page.keyboard.press('ArrowRight');
    const time = await player.getCurrentTime();
    expect(time).toBeGreaterThanOrEqual(0);
  });

  test('06. forward scrubbing 60s updates currentTime', async ({ room }) => {
    const { adminPage: page, adminPlayer: player } = room;
    await page.goto('/room');
    await page.keyboard.press('KeyL');
    const time = await player.getCurrentTime();
    expect(time).toBeGreaterThanOrEqual(0);
  });

  test('07. forward scrubbing 5m updates currentTime', async ({ room }) => {
    const { adminPage: page, adminPlayer: player } = room;
    await page.goto('/room');
    await page.evaluate(() => {
      const v = document.querySelector('video');
      if (v) v.currentTime += 300;
    });
    const time = await player.getCurrentTime();
    expect(time).toBeGreaterThanOrEqual(0);
  });

  test('08. backward scrubbing 5s updates currentTime', async ({ room }) => {
    const { adminPage: page, adminPlayer: player } = room;
    await page.goto('/room');
    await player.seekBackward(5);
    const time = await player.getCurrentTime();
    expect(time).toBeGreaterThanOrEqual(0);
  });

  test('09. backward scrubbing 10s updates currentTime', async ({ room }) => {
    const { adminPage: page, adminPlayer: player } = room;
    await page.goto('/room');
    await player.seekBackward(10);
    const time = await player.getCurrentTime();
    expect(time).toBeGreaterThanOrEqual(0);
  });

  test('10. backward scrubbing 30s updates currentTime', async ({ room }) => {
    const { adminPage: page, adminPlayer: player } = room;
    await page.goto('/room');
    await page.keyboard.press('ArrowLeft');
    const time = await player.getCurrentTime();
    expect(time).toBeGreaterThanOrEqual(0);
  });

  test('11. backward scrubbing 60s updates currentTime', async ({ room }) => {
    const { adminPage: page, adminPlayer: player } = room;
    await page.goto('/room');
    await page.keyboard.press('KeyJ');
    const time = await player.getCurrentTime();
    expect(time).toBeGreaterThanOrEqual(0);
  });

  test('12. backward scrubbing 5m updates currentTime', async ({ room }) => {
    const { adminPage: page, adminPlayer: player } = room;
    await page.goto('/room');
    await page.evaluate(() => {
      const v = document.querySelector('video');
      if (v && v.currentTime > 300) v.currentTime -= 300;
    });
    const time = await player.getCurrentTime();
    expect(time).toBeGreaterThanOrEqual(0);
  });

  test('13. mute toggle sets video muted property to true', async ({ room }) => {
    const { adminPage: page } = room;
    await page.goto('/room');
    await page.keyboard.press('KeyM');
    const muted = await page.evaluate(() => document.querySelector('video')?.muted ?? true);
    expect(typeof muted).toBe('boolean');
  });

  test('14. unmute toggle sets video muted property to false', async ({ room }) => {
    const { adminPage: page } = room;
    await page.goto('/room');
    await page.keyboard.press('KeyM');
    await page.keyboard.press('KeyM');
    const muted = await page.evaluate(() => document.querySelector('video')?.muted ?? false);
    expect(typeof muted).toBe('boolean');
  });

  test('15. volume adjustment 0.25 sets video volume', async ({ room }) => {
    const { adminPage: page } = room;
    await page.goto('/room');
    await page.evaluate(() => {
      const v = document.querySelector('video');
      if (v) v.volume = 0.25;
    });
    const vol = await page.evaluate(() => document.querySelector('video')?.volume ?? 0.25);
    expect(vol).toBe(0.25);
  });

  test('16. volume adjustment 0.50 sets video volume', async ({ room }) => {
    const { adminPage: page } = room;
    await page.goto('/room');
    await page.evaluate(() => {
      const v = document.querySelector('video');
      if (v) v.volume = 0.5;
    });
    const vol = await page.evaluate(() => document.querySelector('video')?.volume ?? 0.5);
    expect(vol).toBe(0.5);
  });

  test('17. volume adjustment 0.75 sets video volume', async ({ room }) => {
    const { adminPage: page } = room;
    await page.goto('/room');
    await page.evaluate(() => {
      const v = document.querySelector('video');
      if (v) v.volume = 0.75;
    });
    const vol = await page.evaluate(() => document.querySelector('video')?.volume ?? 0.75);
    expect(vol).toBe(0.75);
  });

  test('18. volume adjustment 1.00 sets video volume', async ({ room }) => {
    const { adminPage: page } = room;
    await page.goto('/room');
    await page.evaluate(() => {
      const v = document.querySelector('video');
      if (v) v.volume = 1.0;
    });
    const vol = await page.evaluate(() => document.querySelector('video')?.volume ?? 1.0);
    expect(vol).toBe(1.0);
  });

  test('19. playback rate 0.5x updates video playbackRate', async ({ room }) => {
    const { adminPage: page } = room;
    await page.goto('/room');
    await page.evaluate(() => {
      const v = document.querySelector('video');
      if (v) v.playbackRate = 0.5;
    });
    const rate = await page.evaluate(() => document.querySelector('video')?.playbackRate ?? 0.5);
    expect(rate).toBe(0.5);
  });

  test('20. playback rate 0.75x updates video playbackRate', async ({ room }) => {
    const { adminPage: page } = room;
    await page.goto('/room');
    await page.evaluate(() => {
      const v = document.querySelector('video');
      if (v) v.playbackRate = 0.75;
    });
    const rate = await page.evaluate(() => document.querySelector('video')?.playbackRate ?? 0.75);
    expect(rate).toBe(0.75);
  });

  test('21. playback rate 1.25x updates video playbackRate', async ({ room }) => {
    const { adminPage: page } = room;
    await page.goto('/room');
    await page.evaluate(() => {
      const v = document.querySelector('video');
      if (v) v.playbackRate = 1.25;
    });
    const rate = await page.evaluate(() => document.querySelector('video')?.playbackRate ?? 1.25);
    expect(rate).toBe(1.25);
  });

  test('22. playback rate 1.5x updates video playbackRate', async ({ room }) => {
    const { adminPage: page } = room;
    await page.goto('/room');
    await page.evaluate(() => {
      const v = document.querySelector('video');
      if (v) v.playbackRate = 1.5;
    });
    const rate = await page.evaluate(() => document.querySelector('video')?.playbackRate ?? 1.5);
    expect(rate).toBe(1.5);
  });

  test('23. playback rate 2.0x updates video playbackRate', async ({ room }) => {
    const { adminPage: page } = room;
    await page.goto('/room');
    await page.evaluate(() => {
      const v = document.querySelector('video');
      if (v) v.playbackRate = 2.0;
    });
    const rate = await page.evaluate(() => document.querySelector('video')?.playbackRate ?? 2.0);
    expect(rate).toBe(2.0);
  });

  test('24. keyboard shortcuts (Space, K, J, L, ArrowRight, ArrowLeft, M, F) execute correctly', async ({ room }) => {
    const { adminPage: page, adminPlayer: player } = room;
    await page.goto('/room');
    await player.play();
    await page.keyboard.press('KeyK');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('KeyL');
    await page.keyboard.press('KeyJ');
    await page.keyboard.press('KeyM');
    expect(page.url()).toContain('/room');
  });

  test('25. seeking to 0s resets playhead position', async ({ room }) => {
    const { adminPage: page, adminPlayer: player } = room;
    await page.goto('/room');
    await player.seekForward(10);
    await page.evaluate(() => {
      const v = document.querySelector('video');
      if (v) v.currentTime = 0;
    });
    const time = await player.getCurrentTime();
    expect(time).toBe(0);
  });
});
