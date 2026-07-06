import fs from 'fs';
import path from 'path';
import { Resolution } from './types';
import { TranscodeVariant } from './variant';

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
   * Returns the URL to the master playlist served by the API.
   */
  get masterPlaylistUrl(): string {
    return `/api/playback/hls/${this.mediaFileId}/master.m3u8`;
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
  async ensureVariantReady(resolution: Resolution, startPosition: number = 0): Promise<void> {
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
    variant.start(this.inputPath, startPosition);

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
   * Stops all running FFmpeg processes and cleans up.
   */
  stop(): void {
    for (const [resolution, variant] of this.variants) {
      console.log(`[session:${this.mediaFileId}] Stopping variant ${resolution}`);
      variant.stop();
    }
    this.variants.clear();
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
