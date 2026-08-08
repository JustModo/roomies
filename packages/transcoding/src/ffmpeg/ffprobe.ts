import { execFile } from 'child_process';
import { promisify } from 'util';
import { FFPROBE_PATH } from '@roomies/config';
import { PROBE_TIMEOUT_MS } from '../config/config';

const execFileAsync = promisify(execFile);

const DEFAULT_FPS = 24;
// Unknown height must never prune the resolution ladder, so default "as tall as the tallest rung".
const DEFAULT_HEIGHT = Number.POSITIVE_INFINITY;

export interface SourceVideoInfo {
  fps: number;
  height: number;
}

/** Parses an ffprobe r_frame_rate value (e.g. "24000/1001" or "25/1") into a float. */
const parseFrameRate = (value: string): number => {
  const [num, den] = value.split('/').map(Number);
  if (!den) return num;
  return num / den;
};

/** Probes the first video stream's frame rate (GOP sizing) and height (resolution-ladder
 *  pruning) in a single ffprobe call, with a timeout so a stuck probe can't hang the caller. */
export const getSourceVideoInfo = async (filePath: string): Promise<SourceVideoInfo> => {
  try {
    const { stdout } = await execFileAsync(FFPROBE_PATH, [
      '-v', 'error',
      '-select_streams', 'v:0',
      '-show_entries', 'stream=r_frame_rate,height',
      '-of', 'default=noprint_wrappers=1',
      filePath,
    ], { timeout: PROBE_TIMEOUT_MS });

    const fields = new Map(
      stdout.trim().split('\n').map(line => line.split('=') as [string, string])
    );

    const fps = parseFrameRate(fields.get('r_frame_rate') ?? '');
    const height = Number(fields.get('height'));

    return {
      fps: Number.isFinite(fps) && fps > 0 ? fps : DEFAULT_FPS,
      height: Number.isFinite(height) && height > 0 ? height : DEFAULT_HEIGHT,
    };
  } catch {
    return { fps: DEFAULT_FPS, height: DEFAULT_HEIGHT };
  }
};
