import { describe, it, expect } from 'vitest';
import { detectCaps } from '@roomies/web/src/services/media';

const env = ({ fullscreen = false, webkitFullscreen = false, volumeWritable = true, navigator = {}, standaloneQuery = false }) => ({
  document: {
    fullscreenEnabled: fullscreen,
    webkitFullscreenEnabled: webkitFullscreen,
    createElement: () => {
      let volume = 1;
      return {
        get volume() {
          return volume;
        },
        set volume(v: number) {
          if (volumeWritable) volume = v;
        },
      };
    },
  },
  navigator,
  matchMedia: () => ({ matches: standaloneQuery }),
});

describe('detectCaps', () => {
  it('iPhone Safari: no element fullscreen and read-only volume', () => {
    const caps = detectCaps(env({ volumeWritable: false, navigator: { wakeLock: {}, audioSession: {} } }) as never);
    expect(caps).toEqual({ elementFullscreen: false, canSetVolume: false, audioSession: true, wakeLock: true, standalone: false });
  });

  it('iPhone Home Screen app reports standalone', () => {
    expect(detectCaps(env({ volumeWritable: false, navigator: { standalone: true } }) as never).standalone).toBe(true);
  });

  it('iPad Safari: webkit element fullscreen', () => {
    expect(detectCaps(env({ webkitFullscreen: true, volumeWritable: false }) as never).elementFullscreen).toBe(true);
  });

  it('desktop Chrome: fullscreen and settable volume', () => {
    const caps = detectCaps(env({ fullscreen: true, navigator: { wakeLock: {} }, standaloneQuery: false }) as never);
    expect(caps.elementFullscreen && caps.canSetVolume && caps.wakeLock).toBe(true);
    expect(caps.audioSession).toBe(false);
  });
});
