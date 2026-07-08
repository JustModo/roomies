import { execFile } from 'child_process';
import fs from 'fs';
import { promisify } from 'util';
import { FFMPEG_PATH } from './config';
import { HardwareEncoder } from './types';

const execFileAsync = promisify(execFile);

let cached: HardwareEncoder | null = null;
let hwFallbackTriggered = false;

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
    console.error('[hwaccel] Failed to detect hardware encoders, falling back to CPU:', err);
    cached = 'cpu';
  }

  console.log(`[hwaccel] Detected encoder backend: ${cached}`);
  return cached;
};

export const markHardwareEncoderFailed = () => {
  console.log('[hwaccel] Hardware encoder permanently disabled for this run due to a failure.');
  hwFallbackTriggered = true;
};

/** Returns the cached detection result or 'cpu'. */
export const getDetectedHardwareEncoder = (): HardwareEncoder => {
  if (hwFallbackTriggered) return 'cpu';
  return cached ?? 'cpu';
};
