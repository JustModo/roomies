import { execFile } from 'child_process';
import fs from 'fs';
import path from 'path';
import { promisify } from 'util';
import type { Logger } from '@roomies/config';
import { RENDER_NODE } from '../config/constants';
import { HardwareEncoder } from '../types';

const execFileAsync = promisify(execFile);

const isIntelRenderNode = (): boolean => {
  try {
    return fs.readFileSync(`/sys/class/drm/${path.basename(RENDER_NODE)}/device/vendor`, 'utf8').trim() === '0x8086';
  } catch {
    return false;
  }
};

/** The H.264 encoder backend workers use; 'cpu' until detect() runs or after a hardware failure. */
export class EncoderBackend {
  private encoder: HardwareEncoder = 'cpu';

  constructor(
    private readonly ffmpegPath: string,
    private readonly log: Logger,
  ) {}

  get current(): HardwareEncoder {
    return this.encoder;
  }

  /** Fails fast at boot when ffmpeg is missing, then picks the best available hardware encoder. */
  async detect(): Promise<HardwareEncoder> {
    await this.assertFfmpegAvailable();

    try {
      const { stdout } = await execFileAsync(this.ffmpegPath, ['-hide_banner', '-encoders']);
      // Prefer nvenc (dGPU) over integrated GPUs, and QSV over VAAPI on Intel.
      const hasRenderNode = fs.existsSync(RENDER_NODE);
      if (stdout.includes('h264_nvenc') && fs.existsSync('/dev/nvidia0')) this.encoder = 'nvenc';
      else if (stdout.includes('h264_qsv') && hasRenderNode && isIntelRenderNode()) this.encoder = 'qsv';
      else if (stdout.includes('h264_vaapi') && hasRenderNode) this.encoder = 'vaapi';
      else this.encoder = 'cpu';
    } catch (err) {
      this.log.error({ err }, 'Failed to detect hardware encoders, falling back to CPU');
      this.encoder = 'cpu';
    }

    this.log.info(`Detected encoder backend: ${this.encoder}`);
    return this.encoder;
  }

  /** Called after a runtime hardware failure so subsequent workers skip the hardware encoder. */
  downgradeToCpu(): void {
    this.encoder = 'cpu';
  }

  private async assertFfmpegAvailable(): Promise<void> {
    try {
      await execFileAsync(this.ffmpegPath, ['-version']);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new Error(`ffmpeg not found at "${this.ffmpegPath}". Install ffmpeg or set FFMPEG_PATH.`, { cause: err });
      }
      throw err;
    }
  }
}
