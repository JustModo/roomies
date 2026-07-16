import fs from 'fs';
import path from 'path';
import { CACHE_DIR, SEGMENT_DURATION } from './config';

export class TranscodeCache {
  static cleanGlobalCache(): void {
    try {
      if (fs.existsSync(CACHE_DIR)) {
        const files = fs.readdirSync(CACHE_DIR);
        for (const file of files) {
          fs.rmSync(path.join(CACHE_DIR, file), { recursive: true, force: true });
        }
      } else {
        fs.mkdirSync(CACHE_DIR, { recursive: true });
      }
      console.log('[transcode] Cleaned up global transcode cache directory.');
    } catch (err) {
      console.error('[transcode] Failed to clean global cache directory:', err);
    }
  }

  static cleanDirectory(dir: string): void {
    try {
      if (fs.existsSync(dir)) {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    } catch (err) {
      console.error(`[transcode] Failed to clean directory ${dir}:`, err);
    }
  }

  static ensureDirectory(dir: string): void {
    fs.mkdirSync(dir, { recursive: true });
  }

  static getVariantCacheStats(dir: string, startPosition: number): { newestSegmentTime: number; maxCoveredTime: number } {
    let newestSegmentTime = 0;
    let maxIndex = -1;

    try {
      const files = fs.readdirSync(dir);
      for (const file of files) {
        if (!file.endsWith('.ts')) continue;

        const match = file.match(/seg_(\d+)\.ts/);
        if (match) {
          const index = parseInt(match[1], 10);
          
          const segmentTime = startPosition + (index * SEGMENT_DURATION);
          if (segmentTime > newestSegmentTime) {
            newestSegmentTime = segmentTime;
          }

          if (index > maxIndex) {
            maxIndex = index;
          }
        }
      }
    } catch (err) {
      // Ignore read errors
    }

    const maxCoveredTime = maxIndex < 0 ? 0 : startPosition + (maxIndex + 1) * SEGMENT_DURATION;

    return { newestSegmentTime, maxCoveredTime };
  }

  static getSegmentCount(dir: string): number {
    try {
      const files = fs.readdirSync(dir);
      return files.filter(f => f.endsWith('.ts')).length;
    } catch {
      return 0;
    }
  }
}
