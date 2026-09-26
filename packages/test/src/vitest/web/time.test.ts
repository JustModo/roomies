import { describe, it, expect } from 'vitest';
import { formatTime } from '@roomies/web/src/lib/time';

describe('formatTime', () => {
  it('formats minutes and seconds', () => {
    expect(formatTime(0)).toBe('0:00');
    expect(formatTime(65.9)).toBe('1:05');
  });

  it('adds hours past an hour', () => {
    expect(formatTime(3600)).toBe('1:00:00');
    expect(formatTime(5712)).toBe('1:35:12');
  });

  it('falls back to 0:00 for invalid input', () => {
    expect(formatTime(NaN)).toBe('0:00');
    expect(formatTime(Infinity)).toBe('0:00');
    expect(formatTime(-5)).toBe('0:00');
  });
});
