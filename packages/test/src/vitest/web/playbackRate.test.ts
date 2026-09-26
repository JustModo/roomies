import { describe, it, expect } from 'vitest';
import { nextPlaybackRate, PLAYBACK_RATES } from '@roomies/web/src/lib/playbackRate';

describe('Playback speed cycle', () => {
  it('steps through every rate in ascending order and wraps back to the slowest', () => {
    const seen = [PLAYBACK_RATES[0]];
    for (let i = 0; i < PLAYBACK_RATES.length; i++) seen.push(nextPlaybackRate(seen[seen.length - 1]));

    expect(seen).toEqual([0.5, 1, 1.25, 1.5, 2, 0.5]);
  });

  it('moves an off-cycle rate to the next rate above it', () => {
    expect(nextPlaybackRate(1.1)).toBe(1.25);
    expect(nextPlaybackRate(0.9)).toBe(1);
    expect(nextPlaybackRate(3)).toBe(0.5);
  });
});
