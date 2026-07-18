import { execFile } from 'child_process';
import { promisify } from 'util';
import { FFPROBE_PATH } from '@roomies/config';

const execFileAsync = promisify(execFile);

export const getMediaDuration = async (filePath: string): Promise<number> => {
  const { stdout } = await execFileAsync(FFPROBE_PATH, [
    '-v', 'error',
    '-show_entries', 'format=duration',
    '-of', 'default=noprint_wrappers=1:nokey=1',
    filePath,
  ]);
  const duration = parseFloat(stdout.trim());
  return isNaN(duration) ? 0 : Math.floor(duration);
};
