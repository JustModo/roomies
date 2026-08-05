import { describe, it, expect, vi } from 'vitest';

// Node's built-in child_process module exports aren't configurable, so vi.spyOn can't
// redefine `spawn` directly — mock the module instead (still calls the real spawn under
// the hood via vi.fn(actual.spawn), just makes calls trackable).
vi.mock('child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('child_process')>();
  return { ...actual, spawn: vi.fn(actual.spawn) };
});

import { TranscodeCache, TranscodeSession, RESOLUTION_PRESETS, SUPPORTED_RESOLUTIONS, SEGMENT_DURATION, MAX_CONCURRENT_VARIANTS, buildHlsMuxArgs, SyncPolicy, AsyncPolicy, policyForSessionId } from '@roomies/transcoding';
import fs from 'fs';
import { spawn as mockedSpawn } from 'child_process';

describe('Transcoding & Quality Variant Pipeline', () => {
  it('defines valid resolution presets for 1080p, 720p, and 360p', () => {
    expect(RESOLUTION_PRESETS['1080p']).toBeDefined();
    expect(RESOLUTION_PRESETS['720p']).toBeDefined();
    expect(RESOLUTION_PRESETS['360p']).toBeDefined();

    expect(RESOLUTION_PRESETS['1080p'].width).toBe(1920);
    expect(RESOLUTION_PRESETS['720p'].width).toBe(1280);
    expect(RESOLUTION_PRESETS['360p'].width).toBe(640);
  });

  it('cleans global transcode cache without throwing', () => {
    expect(() => {
      TranscodeCache.cleanGlobalCache();
    }).not.toThrow();
  });

  it('resolves correct target bitrates for resolution variants', () => {
    expect(RESOLUTION_PRESETS['1080p'].videoBitrate).toBe('5000k');
    expect(RESOLUTION_PRESETS['720p'].videoBitrate).toBe('2500k');
    expect(RESOLUTION_PRESETS['360p'].videoBitrate).toBe('800k');
  });

  it('ensures directory helper creates recursively', () => {
    const testDir = `${process.env.CACHE_DIR}/nested/dir`;
    TranscodeCache.ensureDirectory(testDir);
    expect(fs.existsSync(testDir)).toBe(true);
    TranscodeCache.cleanDirectory(testDir);
  });

  it('computes newest/max-covered segment time from segment filenames on disk', () => {
    const testDir = `${process.env.CACHE_DIR}/variant-cache-stats`;
    TranscodeCache.ensureDirectory(testDir);
    const startPosition = 100;

    // seg_00000.ts..seg_00003.ts => 4 segments, indices 0-3
    for (let i = 0; i < 4; i++) {
      fs.writeFileSync(`${testDir}/seg_${String(i).padStart(5, '0')}.ts`, '');
    }

    const { newestSegmentTime, maxCoveredTime } = TranscodeCache.getVariantCacheStats(testDir, startPosition);

    // newestSegmentTime is derived from the highest-index segment's own start time.
    expect(newestSegmentTime).toBe(startPosition + 3 * SEGMENT_DURATION);
    // maxCoveredTime extends one segment past the highest index (its end time).
    expect(maxCoveredTime).toBe(startPosition + 4 * SEGMENT_DURATION);

    TranscodeCache.cleanDirectory(testDir);
  });

  it('routes reportError() through the registered onError callback', () => {
    const testDir = `${process.env.CACHE_DIR}/report-error-test`;
    const session = new TranscodeSession('test-session', 'media-1', '/dev/null', testDir);

    const received: Array<{ resolution: string; error: Error }> = [];
    session.onError((resolution, error) => received.push({ resolution, error }));

    const err = new Error('Maximum concurrent transcode variants reached');
    session.reportError('720p', err);

    expect(received).toHaveLength(1);
    expect(received[0].resolution).toBe('720p');
    expect(received[0].error).toBe(err);

    TranscodeCache.cleanDirectory(testDir);
  });

  it('reportError() is a no-op when no onError callback is registered', () => {
    const testDir = `${process.env.CACHE_DIR}/report-error-noop-test`;
    const session = new TranscodeSession('test-session-2', 'media-1', '/dev/null', testDir);

    expect(() => session.reportError('360p', new Error('boom'))).not.toThrow();

    TranscodeCache.cleanDirectory(testDir);
  });

  it('spawns exactly one ffmpeg process for a 3-resolution sync-scope offset group (single-decode optimization)', async () => {
    const spawnMock = mockedSpawn as unknown as ReturnType<typeof vi.fn>;
    spawnMock.mockClear();

    const testDir = `${process.env.CACHE_DIR}/group-spawn-test`;
    const session = new TranscodeSession('sync', 'media-1', '/dev/null', testDir);

    // Fire all 3 resolution requests roughly concurrently, like coordinator.ts's
    // Promise.allSettled prewarm does for a room-scope seek. Requests never resolve under
    // the 'echo' FFMPEG_PATH stub (no real segments get written), so don't await them.
    session.ensureVariantReady('360p', 0).catch(() => {});
    session.ensureVariantReady('720p', 0).catch(() => {});
    session.ensureVariantReady('1080p', 0).catch(() => {});

    // Let the microtask queue drain (getSourceFps() + the group's spawnProcess call).
    await new Promise((resolve) => setTimeout(resolve, 50));

    const ffmpegLikeCalls = spawnMock.mock.calls.filter((call: any[]) =>
      Array.isArray(call[1]) && call[1].includes('-filter_complex')
    );
    expect(ffmpegLikeCalls).toHaveLength(1);

    // All 3 resolutions should have been mapped into that single invocation's filter graph.
    const [, groupArgs] = ffmpegLikeCalls[0] as [string, string[]];
    expect(groupArgs.filter((a) => a === '-map')).toHaveLength(6); // 2 maps (video+audio) x 3 legs

    await session.stop();
  });

  it('derives a sane MAX_CONCURRENT_VARIANTS default from host CPU count', () => {
    expect(Number.isInteger(MAX_CONCURRENT_VARIANTS)).toBe(true);
    expect(MAX_CONCURRENT_VARIANTS).toBeGreaterThanOrEqual(4);
  });

  it('returns zeroed stats for a directory with no segments', () => {
    const testDir = `${process.env.CACHE_DIR}/variant-cache-stats-empty`;
    TranscodeCache.ensureDirectory(testDir);

    const { newestSegmentTime, maxCoveredTime } = TranscodeCache.getVariantCacheStats(testDir, 50);
    expect(newestSegmentTime).toBe(0);
    expect(maxCoveredTime).toBe(0);

    TranscodeCache.cleanDirectory(testDir);
  });

  it('exposes shared HLS mux args used by both encode strategies', () => {
    const args = buildHlsMuxArgs('/tmp/seg_%05d.ts');
    expect(args).toContain('-f');
    expect(args).toContain('hls');
    expect(args).toContain('-hls_time');
    expect(args).toContain(String(SEGMENT_DURATION));
    expect(args).toContain('/tmp/seg_%05d.ts');
  });

  it('defines sync vs async mode policies that both carry the full resolution ladder', () => {
    expect(SyncPolicy.variants).toEqual(SUPPORTED_RESOLUTIONS);
    expect(AsyncPolicy.variants).toEqual(SUPPORTED_RESOLUTIONS);
    expect(SyncPolicy.keepLatestEmptyOffset).toBe(true);
    expect(AsyncPolicy.keepLatestEmptyOffset).toBe(false);
    expect(policyForSessionId('sync')).toBe(SyncPolicy);
    expect(policyForSessionId('async')).toBe(AsyncPolicy);
  });

  it('spawns exactly one ffmpeg process for a 3-resolution async-scope offset group, same as sync', async () => {
    const spawnMock = mockedSpawn as unknown as ReturnType<typeof vi.fn>;
    spawnMock.mockClear();

    const testDir = `${process.env.CACHE_DIR}/async-group-spawn-test`;
    const session = new TranscodeSession('async', 'media-1', '/dev/null', testDir);

    // A second (and third) resolution request at the same offset is no longer refused —
    // every offset always carries the full ladder, so these just await the same worker.
    // Requests never resolve under the 'echo' FFMPEG_PATH stub (no real segments get
    // written), so don't await them — same as the sync test above.
    session.ensureVariantReady('720p', 0).catch(() => {});
    session.ensureVariantReady('360p', 0).catch(() => {});
    session.ensureVariantReady('1080p', 0).catch(() => {});

    await new Promise((resolve) => setTimeout(resolve, 50));

    const ffmpegLikeCalls = spawnMock.mock.calls.filter((call: any[]) =>
      Array.isArray(call[1]) && call[1].includes('-filter_complex')
    );
    expect(ffmpegLikeCalls).toHaveLength(1);

    const [, groupArgs] = ffmpegLikeCalls[0] as [string, string[]];
    expect(groupArgs.filter((a) => a === '-map')).toHaveLength(6); // 2 maps (video+audio) x 3 legs

    await session.stop();
  });
});
