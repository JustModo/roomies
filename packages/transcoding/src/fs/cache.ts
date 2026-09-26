import fs from 'fs';
import path from 'path';
import type { Logger } from '@roomies/config';

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

export function countSegments(dir: string, prefix: 'seg' | 'audio', from = 0): number {
  let count = from;
  while (fs.existsSync(path.join(dir, `${prefix}_${String(count).padStart(5, '0')}.ts`))) count++;
  return count;
}
