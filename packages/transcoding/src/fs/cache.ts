import fs from 'fs';
import path from 'path';
import type { Logger } from '@roomies/config';
import { SEGMENT_DURATION } from '../config/constants';

export interface SegmentStats {
  newestSegmentTime: number;
  maxCoveredTime: number;
  segmentCount: number;
}

const SEGMENT_FILE = /^(?:seg|audio)_(\d+)\.ts$/;

export function ensureDirectory(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
}

export function removeDirectory(dir: string, log: Logger): void {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch (err) {
    log.error({ err, dir }, 'Failed to clean directory');
  }
}

/** Empties dir (creating it if missing) without removing the directory itself. */
export function emptyDirectory(dir: string, log: Logger): void {
  ensureDirectory(dir);
  for (const entry of fs.readdirSync(dir)) removeDirectory(path.join(dir, entry), log);
}

/** Timeline coverage of the HLS segments in dir, for a variant that started at startPosition. */
export function readSegmentStats(dir: string, startPosition: number): SegmentStats {
  let files: string[] = [];
  try {
    files = fs.readdirSync(dir);
  } catch {
    // Directory not created yet: no segments.
  }

  const indices = files.map((file) => SEGMENT_FILE.exec(file)).flatMap((match) => (match ? [parseInt(match[1], 10)] : []));
  const maxIndex = Math.max(-1, ...indices);
  return {
    newestSegmentTime: maxIndex < 0 ? 0 : startPosition + maxIndex * SEGMENT_DURATION,
    maxCoveredTime: maxIndex < 0 ? 0 : startPosition + (maxIndex + 1) * SEGMENT_DURATION,
    segmentCount: indices.length,
  };
}
