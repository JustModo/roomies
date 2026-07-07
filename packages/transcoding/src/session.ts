import fs from 'fs';
import path from 'path';
import { FfmpegPreset, HwAccelMode } from './settings';
import { Resolution } from './types';
import { TranscodeVariant } from './variant';
import { MAX_CONCURRENT_VARIANTS, SEGMENT_DURATION } from './config';

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

    // Spawn a new FFmpeg process in a unique subdirectory
    const randomSuffix = Math.random().toString(36).substring(2, 8);
    const variantDir = path.join(this.outputBaseDir, resolution, `ss-${startPosition}-${randomSuffix}`);
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
   * Checks if the seek position is covered by the transcode cache for all active variants.
   */
  isSeekCovered(newPosition: number): boolean {
    const activeVariants = Array.from(this.variants.values());
    if (activeVariants.length === 0) return false;

    for (const variant of activeVariants) {
      const maxCoveredTime = this.getMaxCoveredTime(variant);
      if (newPosition < variant.startPosition || newPosition > maxCoveredTime) {
        return false;
      }
    }
    return true;
  }

  /**
   * Performs a seek on the session level, ensuring all active variants are kept in sync.
   */
  async seek(
    newPosition: number,
    preset: FfmpegPreset = 'veryfast',
    hwAccelMode: HwAccelMode = 'auto'
  ): Promise<void> {
    const resolutions: Resolution[] = ['360p', '720p', '1080p'];
    const isCovered = this.isSeekCovered(newPosition);

    if (isCovered) {
      console.log(
        `[session:${this.mediaFileId}] Seek to ${newPosition.toFixed(1)}s is covered by all active variants — reusing cache`
      );
      return;
    }

    console.log(
      `[session:${this.mediaFileId}] Seek to ${newPosition.toFixed(1)}s not covered by all active variants — restarting all variants from new position`
    );

    // Stop and clear all variants that need to be restarted
    for (const res of resolutions) {
      const existing = this.variants.get(res);
      if (existing) {
        existing.stop();
        try {
          fs.rmSync(existing.outputDir, { recursive: true, force: true });
        } catch (err) {
          console.error(`[session:${this.mediaFileId}] Failed to clear variant dir for ${res}:`, err);
        }
        this.variants.delete(res);
      }
    }

    // Align startPosition to the segment boundary, starting at least 1 segment before
    const alignedPosition = Math.max(
      0,
      Math.floor(newPosition / SEGMENT_DURATION) * SEGMENT_DURATION - SEGMENT_DURATION
    );

    // Restart all resolutions in parallel
    await Promise.all(
      resolutions.map(res => this.ensureVariantReady(res, alignedPosition, preset, hwAccelMode))
    );
  }

  /**
   * Returns the dynamic output directory of a specific resolution variant.
   */
  getVariantOutputDir(resolution: Resolution): string {
    const variant = this.variants.get(resolution);
    if (!variant) {
      throw new Error(`Variant not found for resolution ${resolution}`);
    }
    return variant.outputDir;
  }

  /**
   * Derives the furthest media timestamp that has been transcoded for a variant,
   * by counting .ts segment files in its output directory.
   */
  private getMaxCoveredTime(variant: TranscodeVariant): number {
    try {
      const files = fs.readdirSync(variant.outputDir);
      let maxIndex = -1;
      for (const file of files) {
        const match = file.match(/seg_(\d+)\.ts/);
        if (match) {
          const idx = parseInt(match[1], 10);
          if (idx > maxIndex) maxIndex = idx;
        }
      }
      if (maxIndex < 0) return 0;
      // Each segment covers SEGMENT_DURATION seconds; the variant started at its startPosition.
      // We expose startPosition via a public accessor added to TranscodeVariant.
      return variant.startPosition + (maxIndex + 1) * SEGMENT_DURATION;
    } catch {
      return 0;
    }
  }

  /**
   * Returns the actual transcode offset (startPosition) of any active variant.
   */
  getTranscodeOffset(): number {
    const active = this.variants.values().next().value;
    return active ? active.startPosition : 0;
  }
}

