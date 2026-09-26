import { describe, it, expect } from 'vitest';
import { layoutFor } from '@roomies/web/src/lib/breakpoints';

describe('layoutFor', () => {
  it.each([
    [{ landscape: false, screenShortSide: 390, viewportWidth: 390 }, 'column'],
    [{ landscape: true, screenShortSide: 390, viewportWidth: 844 }, 'short'],
    [{ landscape: true, screenShortSide: 430, viewportWidth: 1100 }, 'short'],
    [{ landscape: false, screenShortSide: 1024, viewportWidth: 1024 }, 'column'],
    [{ landscape: true, screenShortSide: 1024, viewportWidth: 1366 }, 'desk'],
    [{ landscape: true, screenShortSide: 1080, viewportWidth: 900 }, 'column'],
  ] as const)('%o -> %s', (env, layout) => {
    expect(layoutFor(env)).toBe(layout);
  });

  it('ignores a keyboard shrinking the viewport in portrait', () => {
    expect(layoutFor({ landscape: false, screenShortSide: 390, viewportWidth: 390 })).toBe('column');
  });
});
