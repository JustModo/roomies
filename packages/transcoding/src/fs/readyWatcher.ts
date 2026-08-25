import fs from 'fs';
import { LOOK_AHEAD_SEGMENTS } from '../config/config';
import { TranscodeCache } from './cache';

export interface SegmentReadyTarget {
  /** Directory whose .ts segments are watched. */
  dir: string;
  /** Called when look-ahead (or stopped-with-segments) condition is met. Idempotent. */
  onReady: () => void;
  /** Optional: refresh newest/maxCovered stats on each check. */
  onStats?: (stats: { newestSegmentTime: number; maxCoveredTime: number }) => void;
  /** Whether this target is already ready (skip emit). */
  isReady: () => boolean;
}

export interface SegmentReadyWatcherOptions {
  /** Absolute timeline origin for cache stats (variant startPosition). */
  startPosition: number;
  /** True while the producing FFmpeg process is still running. */
  isRunning: () => boolean;
  targets: SegmentReadyTarget[];
  pollMs?: number;
}

/**
 * Shared fs.watch + poll loop used by TranscodeWorker.
 * Marks a target ready when ≥ LOOK_AHEAD_SEGMENTS exist, or the process stopped with ≥1 segment.
 */
export function startSegmentReadyWatcher(options: SegmentReadyWatcherOptions): { stop: () => void } {
  const { startPosition, isRunning, targets, pollMs = 300 } = options;
  const watchers: fs.FSWatcher[] = [];
  let pollInterval: NodeJS.Timeout | null = null;

  const checkTarget = (target: SegmentReadyTarget) => {
    if (target.onStats) {
      target.onStats(TranscodeCache.getVariantCacheStats(target.dir, startPosition));
    }
    if (target.isReady()) return;
    const tsCount = TranscodeCache.getSegmentCount(target.dir);
    if (tsCount >= LOOK_AHEAD_SEGMENTS || (!isRunning() && tsCount > 0)) {
      target.onReady();
    }
  };

  const checkAll = () => {
    for (const target of targets) checkTarget(target);
  };

  checkAll();

  for (const target of targets) {
    try {
      watchers.push(fs.watch(target.dir, () => checkTarget(target)));
    } catch {
      // Ignore watch setup error (e.g. dir not yet ready on some mounts).
    }
  }

  // Poll continuously for environments (e.g. Docker bind mounts) where inotify is unreliable.
  pollInterval = setInterval(checkAll, pollMs);

  return {
    stop: () => {
      for (const w of watchers) w.close();
      watchers.length = 0;
      if (pollInterval) {
        clearInterval(pollInterval);
        pollInterval = null;
      }
    },
  };
}
