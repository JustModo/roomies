import { execFile } from 'child_process';
import fs from 'fs';
import { promisify } from 'util';
import path from 'path';
import { FFMPEG_PATH, RENDER_NODE } from '../config/config';
import { HardwareEncoder } from '../types';

const execFileAsync = promisify(execFile);

let cached: HardwareEncoder | null = null;

const isIntelRenderNode = (): boolean => {
  try {
    return fs.readFileSync(`/sys/class/drm/${path.basename(RENDER_NODE)}/device/vendor`, 'utf8').trim() === '0x8086';
  } catch {
    return false;
  }
};

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

/** Detects supported hardware H.264 encoder. */
export const detectHardwareEncoder = async (): Promise<HardwareEncoder> => {
  if (cached) return cached;

  try {
    const { stdout } = await execFileAsync(FFMPEG_PATH, ['-hide_banner', '-encoders']);

    // Prefer nvenc (dGPU) over integrated GPUs, and QSV over VAAPI on Intel.
    const hasRenderNode = fs.existsSync(RENDER_NODE);
    if (stdout.includes('h264_nvenc') && fs.existsSync('/dev/nvidia0')) {
      cached = 'nvenc';
    } else if (stdout.includes('h264_qsv') && hasRenderNode && isIntelRenderNode()) {
      cached = 'qsv';
    } else if (stdout.includes('h264_vaapi') && hasRenderNode) {
      cached = 'vaapi';
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

/** Downgrades cached encoder to 'cpu' after a runtime failure. */
export const downgradeToCpu = (): void => {
  cached = 'cpu';
};
