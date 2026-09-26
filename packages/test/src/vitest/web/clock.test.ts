import { describe, it, expect } from 'vitest';
import { INITIAL_PING, backoffDelay, nextPingState, positionFromAnchor } from '@roomies/web/src/lib/clock';

const playback = { state: 'playing' as const, intendedState: 'playing' as const, anchorPosition: 100, anchorTime: 10_000, playbackRate: 1 };

describe('positionFromAnchor', () => {
  it('advances a playing anchor by elapsed time and rate', () => {
    expect(positionFromAnchor(playback, 12_000)).toBe(102);
    expect(positionFromAnchor({ ...playback, playbackRate: 2 }, 12_000)).toBe(104);
  });

  it('applies the server clock offset', () => {
    expect(positionFromAnchor(playback, 11_000, 1000)).toBe(102);
  });

  it('holds position when not playing', () => {
    expect(positionFromAnchor({ ...playback, state: 'paused' }, 99_000)).toBe(100);
  });
});

describe('nextPingState', () => {
  it('seeds from the first sample and estimates the clock offset', () => {
    const next = nextPingState(INITIAL_PING, 1000, 5100, 1200);
    expect(next.smoothed).toBe(200);
    expect(next.clockOffset).toBe(5100 + 100 - 1200);
  });

  it('only changes quality after three consecutive samples in a new tier', () => {
    let state = INITIAL_PING;
    state = nextPingState(state, 0, 0, 400);
    state = nextPingState(state, 0, 0, 400);
    expect(state.quality).toBe(0);
    state = nextPingState(state, 0, 0, 400);
    expect(state.quality).toBe(2);
  });
});

describe('backoffDelay', () => {
  it('doubles per attempt with jitter and caps at 30s', () => {
    expect(backoffDelay(0, () => 0)).toBe(1000);
    expect(backoffDelay(3, () => 0)).toBe(8000);
    expect(backoffDelay(10, () => 1)).toBe(30300);
  });
});
