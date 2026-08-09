import { execFile } from 'child_process';
import fs from 'fs';
import { promisify } from 'util';
import { FFMPEG_PATH } from '../config/config';
import { HardwareEncoder } from '../types';

const execFileAsync = promisify(execFile);

let cached: HardwareEncoder | null = null;

/** Fails fast at boot when the binary is missing, instead of at first playback. */
export const assertFfmpegAvailable = async (): Promise<void> => {
  try {
    await execFileAsync(FFMPEG_PATH, ['-version']);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error(`ffmpeg not found at "${FFMPEG_PATH}". Install ffmpeg or set FFMPEG_PATH.`);
    }
    throw err;
  }
};

/**
 * Detects supported hardware H.264 encoder.
 * NOTE: Cached after the first call.
 */
export const detectHardwareEncoder = async (): Promise<HardwareEncoder> => {
  if (cached) return cached;

  try {
    const { stdout } = await execFileAsync(FFMPEG_PATH, ['-hide_banner', '-encoders']);

    // NOTE: Prefer nvenc (dGPU) over integrated VAAPI.
    if (stdout.includes('h264_nvenc') && fs.existsSync('/dev/nvidia0')) {
      cached = 'nvenc';
    } else if (stdout.includes('h264_vaapi') && fs.existsSync('/dev/dri')) {
      cached = 'vaapi';
    } else if (stdout.includes('h264_qsv') && fs.existsSync('/dev/dri')) {
      cached = 'qsv';
    } else {
      cached = 'cpu';
    }
  } catch (err) {
    console.error('[transcode] Failed to detect hardware encoders, falling back to CPU:', err);
    cached = 'cpu';
  }

  console.log(`[transcode] Detected encoder backend: ${cached}`);
  return cached;
};

/** Returns the cached detection result or 'cpu'. */
export const getDetectedHardwareEncoder = (): HardwareEncoder => {
  return cached ?? 'cpu';
};

/** Downgrades the cache to 'cpu' after a runtime encoder failure, so a hardware encoder
 *  that was falsely detected as usable doesn't keep getting retried by every new worker. */
export const downgradeToCpu = (): void => {
  cached = 'cpu';
};
