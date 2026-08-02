import { describe, it, expect } from 'vitest';
import { TranscodeCache, RESOLUTION_PRESETS } from '@roomies/transcoding';
import fs from 'fs';

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
});
