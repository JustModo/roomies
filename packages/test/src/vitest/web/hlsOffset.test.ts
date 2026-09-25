import { describe, it, expect } from 'vitest';
import { absolutePlaybackTime, relativeStartPosition, buildHlsMasterUrl } from '@roomies/web/src/components/VideoPlayer/hlsOffset';

describe('HLS offset helpers', () => {
  it('maps video time onto the absolute media timeline via the transcode offset', () => {
    expect(absolutePlaybackTime(12.5, 100)).toBe(112.5);
    expect(absolutePlaybackTime(12.5, 0)).toBe(12.5);
    expect(absolutePlaybackTime(12.5, NaN)).toBe(12.5);
  });

  it('derives a start position inside the offset window, clamped at zero', () => {
    expect(relativeStartPosition(130, 100)).toBe(30);
    expect(relativeStartPosition(90, 100)).toBe(0);
    expect(relativeStartPosition(42, 0)).toBe(42);
  });

  it('builds the master URL with the offset (including zero) and a cache-bust param', () => {
    const url = new URL(buildHlsMasterUrl('/api/playback/hls/m1/sync/master.m3u8', 0, { cacheBust: 7 }));

    expect(url.pathname).toBe('/api/playback/hls/m1/sync/master.m3u8');
    expect(url.searchParams.get('offset')).toBe('0');
    expect(url.searchParams.get('t')).toBe('7');
  });

  it('replaces an existing offset rather than appending a second one', () => {
    const url = new URL(buildHlsMasterUrl('/api/playback/hls/m1/async/master.m3u8?offset=10', 60, { cacheBust: 1 }));

    expect(url.searchParams.getAll('offset')).toEqual(['60']);
  });
});
