import fs from 'fs';
import path from 'path';
import { FfmpegPreset, HwAccelMode } from '@roomies/contracts';
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
   * Handles a seek to a new position for a specific resolution variant.
   *
   * Rather than always nuking the cache (cold restart), this first checks
   * whether the requested position is already covered by segments that FFmpeg
   * has already written. If it is, the existing process is left running and the
   * caller gets an instant response — no stall.
   *
   * Only if the position is NOT yet transcoded do we kill the old process and
   * restart from the new position. Crucially we do NOT delete the cache dir on
   * restart — segments for other variants or time regions remain usable.
   */
  async seekVariant(
    resolution: Resolution,
    newPosition: number,
    preset: FfmpegPreset = 'veryfast',
    hwAccelMode: HwAccelMode = 'auto'
  ): Promise<void> {
    const existing = this.variants.get(resolution);

    if (existing) {
      // Check if newPosition is already within the transcoded window.
      // The variant tracks its own startPosition; we count how many .ts
      // files exist and derive the furthest covered timestamp.
      const variantDir = path.join(this.outputBaseDir, resolution);
      const maxCoveredTime = this.getMaxCoveredTime(variantDir, existing);

      if (newPosition <= maxCoveredTime) {
        // Already transcoded — nothing to do. The player's hls.js will
        // re-request stream.m3u8 and find the right segment immediately.
        console.log(
          `[session:${this.mediaFileId}] Seek to ${newPosition.toFixed(1)}s is already covered ` +
          `(max=${maxCoveredTime.toFixed(1)}s) for ${resolution} — reusing cache`
        );
        return;
      }

      // Position is beyond what we've transcoded. Kill just this variant
      // process (NOT the cache dir) and restart from the new position.
      console.log(
        `[session:${this.mediaFileId}] Seek to ${newPosition.toFixed(1)}s not yet transcoded ` +
        `(max=${maxCoveredTime.toFixed(1)}s) for ${resolution} — restarting from new position`
      );
      existing.stop();

      // Wipe only this variant's output dir so the restarted process writes
      // fresh segment indices from 0 (seg_00000.ts, seg_00001.ts …).
      try {
        fs.rmSync(variantDir, { recursive: true, force: true });
      } catch (err) {
        console.error(`[session:${this.mediaFileId}] Failed to clear variant dir for ${resolution}:`, err);
      }

      this.variants.delete(resolution);
    }

    // Spawn a new variant at the requested position (same path as ensureVariantReady).
    return this.ensureVariantReady(resolution, newPosition, preset, hwAccelMode);
  }

  /**
   * Derives the furthest media timestamp that has been transcoded for a variant,
   * by counting .ts segment files in its output directory.
   */
  private getMaxCoveredTime(variantDir: string, variant: TranscodeVariant): number {
    try {
      const files = fs.readdirSync(variantDir);
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
}

