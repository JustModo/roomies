import fs from 'fs';
import path from 'path';
import { FfmpegPreset, HwAccelMode } from '@roomies/contracts';
import { Resolution } from './types';
import { TranscodeVariant } from './variant';
import { MAX_CONCURRENT_VARIANTS } from './config';

/**
 * Manages all transcoding variants for a single media file.
 *
 * Variants are created on-demand: when a client requests a specific resolution,
 * the session either returns an existing (cached) variant or spawns a new one.
 */
export class TranscodeSession {
  public readonly mediaFileId: string;
  public readonly inputPath: string;
  public readonly outputBaseDir: string;

  private variants = new Map<Resolution, TranscodeVariant>();
  private onErrorCallback: ((resolution: Resolution, error: Error) => void) | null = null;

  constructor(mediaFileId: string, inputPath: string, outputBaseDir: string) {
    this.mediaFileId = mediaFileId;
    this.inputPath = inputPath;
    this.outputBaseDir = outputBaseDir;

    // Ensure the base output directory exists
    fs.mkdirSync(this.outputBaseDir, { recursive: true });
  }

  /**
   * Registers an error callback for variant failures.
   */
  onError(callback: (resolution: Resolution, error: Error) => void): void {
    this.onErrorCallback = callback;
  }

  /**
   * Ensures a variant for the given resolution exists and is running.
   * Resolves only when the variant is ready (first segment written).
   */
  async ensureVariantReady(
    resolution: Resolution,
    startPosition: number = 0,
    preset: FfmpegPreset = 'veryfast',
    hwAccelMode: HwAccelMode = 'auto'
  ): Promise<void> {
    const existing = this.variants.get(resolution);
    if (existing) {
      if (existing.isReady) {
        return;
      }
      // Wait for it to become ready
      return new Promise((resolve) => {
        existing.once('ready', resolve);
      });
    }

    if (this.variants.size >= MAX_CONCURRENT_VARIANTS) {
      console.error(`[session:${this.mediaFileId}] Refusing to spawn variant ${resolution}: MAX_CONCURRENT_VARIANTS (${MAX_CONCURRENT_VARIANTS}) reached`);
      throw new Error('Maximum concurrent transcode variants reached');
    }

    // Spawn a new FFmpeg process
    const variantDir = path.join(this.outputBaseDir, resolution);
    const variant = new TranscodeVariant(resolution, variantDir);

    variant.on('ready', () => {
      console.log(`[session:${this.mediaFileId}] Variant ${resolution} ready (first segment available)`);
    });

    variant.on('error', (err: Error) => {
      console.error(`[session:${this.mediaFileId}] Variant ${resolution} error:`, err.message);
      if (this.onErrorCallback) {
        this.onErrorCallback(resolution, err);
      }
    });

    variant.on('exit', (code: number | null) => {
      if (code === 0) {
        console.log(`[session:${this.mediaFileId}] Variant ${resolution} completed successfully`);
      }
    });

    this.variants.set(resolution, variant);

    // Start the FFmpeg process (non-blocking)
    variant.start(this.inputPath, startPosition, preset, hwAccelMode);

    return new Promise((resolve) => {
      variant.once('ready', resolve);
    });
  }

  /**
   * Returns the list of currently active resolutions.
   */
  getActiveResolutions(): Resolution[] {
    return Array.from(this.variants.keys());
  }

  /**
   * Checks if a specific variant has cached segments ready.
   */
  isVariantReady(resolution: Resolution): boolean {
    return this.variants.get(resolution)?.isReady ?? false;
  }

  /**
   * Manages caching for all variants in this session based on the current playhead.
   */
  manageActiveCaches(currentPlayhead: number): void {
    for (const variant of this.variants.values()) {
      variant.manageCache(currentPlayhead);
    }
  }

  /**
   * Stops all running FFmpeg processes and completely deletes the cache directory for this session.
   */
  stop(): void {
    for (const [resolution, variant] of this.variants) {
      console.log(`[session:${this.mediaFileId}] Stopping variant ${resolution}`);
      variant.stop();
    }
    this.variants.clear();

    try {
      if (fs.existsSync(this.outputBaseDir)) {
        fs.rmSync(this.outputBaseDir, { recursive: true, force: true });
      }
    } catch (err) {
      console.error(`[session:${this.mediaFileId}] Failed to delete cache directory on stop:`, err);
    }
  }

  /**
   * Clears the current running variants and deletes their cache directories.
   * This forces new requests to spawn FFmpeg at the new requested position.
   */
  clearVariants(): void {
    this.stop();
    try {
      if (fs.existsSync(this.outputBaseDir)) {
        fs.rmSync(this.outputBaseDir, { recursive: true, force: true });
      }
      fs.mkdirSync(this.outputBaseDir, { recursive: true });
    } catch (err) {
      console.error(`[session:${this.mediaFileId}] Failed to clear cache directory:`, err);
    }
  }
}
