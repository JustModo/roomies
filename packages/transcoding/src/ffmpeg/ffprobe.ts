import { execFile } from 'child_process';
import { promisify } from 'util';
import { FFPROBE_PATH } from '@roomies/config';

const execFileAsync = promisify(execFile);

const DEFAULT_FPS = 24;

/** Parses an ffprobe r_frame_rate value (e.g. "24000/1001" or "25/1") into a float. */
const parseFrameRate = (value: string): number => {
  const [num, den] = value.split('/').map(Number);
  if (!den) return num;
  return num / den;
};

/** Probes the average frame rate of the first video stream, used to align GOP size with segment duration. */
export const getSourceFrameRate = async (filePath: string): Promise<number> => {
  try {
    const { stdout } = await execFileAsync(FFPROBE_PATH, [
      '-v', 'error',
      '-select_streams', 'v:0',
      '-show_entries', 'stream=r_frame_rate',
      '-of', 'default=noprint_wrappers=1:nokey=1',
      filePath,
    ]);
    const fps = parseFrameRate(stdout.trim());
    return Number.isFinite(fps) && fps > 0 ? fps : DEFAULT_FPS;
  } catch {
    return DEFAULT_FPS;
  }
};
