import { execFile } from 'child_process';
import fs from 'fs';
import { promisify } from 'util';
import { FFMPEG_PATH } from './config';
import { HardwareEncoder } from './types';

const execFileAsync = promisify(execFile);

let cached: HardwareEncoder | null = null;

/**
 * Detects which hardware H.264 encoder (if any) this ffmpeg build and host
 * actually support. An encoder being compiled into ffmpeg doesn't guarantee
 * the device is present (e.g. a VAAPI-enabled ffmpeg build with no /dev/dri
 * mounted into the container), so both are checked.
 *
 * Cached after the first call — call once at boot.
 */
export const detectHardwareEncoder = async (): Promise<HardwareEncoder> => {
  if (cached) return cached;

  try {
    const { stdout } = await execFileAsync(FFMPEG_PATH, ['-hide_banner', '-encoders']);

    if (stdout.includes('h264_vaapi') && fs.existsSync('/dev/dri')) {
      cached = 'vaapi';
    } else if (stdout.includes('h264_nvenc') && fs.existsSync('/dev/nvidia0')) {
      cached = 'nvenc';
    } else if (stdout.includes('h264_qsv') && fs.existsSync('/dev/dri')) {
      cached = 'qsv';
    } else {
      cached = 'cpu';
    }
  } catch (err) {
    console.error('[hwaccel] Failed to detect hardware encoders, falling back to CPU:', err);
    cached = 'cpu';
  }

  console.log(`[hwaccel] Detected encoder backend: ${cached}`);
  return cached;
};

/** Returns the cached detection result, or 'cpu' if detection hasn't run yet. */
export const getDetectedHardwareEncoder = (): HardwareEncoder => cached ?? 'cpu';
