import fs from 'fs';
import path from 'path';
import { FfmpegPreset, HwAccelMode } from './settings';
import { Resolution } from './types';
import { TranscodeVariant } from './variant';
import { MAX_CONCURRENT_VARIANTS, SEGMENT_DURATION } from './config';
import { getSourceFrameRate } from './ffprobe';

/** Manages all transcoding variants for a single media file. */
export class TranscodeSession {
  public readonly mediaFileId: string;
  public readonly inputPath: string;
  public readonly outputBaseDir: string;

  private variants = new Map<Resolution, TranscodeVariant>();
  private onErrorCallback: ((resolution: Resolution, error: Error) => void) | null = null;
  private fpsPromise: Promise<number> | null = null;

  constructor(mediaFileId: string, inputPath: string, outputBaseDir: string) {
    this.mediaFileId = mediaFileId;
    this.inputPath = inputPath;
    this.outputBaseDir = outputBaseDir;

    fs.mkdirSync(this.outputBaseDir, { recursive: true });
  }

  onError(callback: (resolution: Resolution, error: Error) => void): void {
    this.onErrorCallback = callback;
  }

  /** Probes the source frame rate once and caches it, so parallel variant starts share one ffprobe call. */
  private getSourceFps(): Promise<number> {
    if (!this.fpsPromise) {
      this.fpsPromise = getSourceFrameRate(this.inputPath);
    }
    return this.fpsPromise;
  }

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
      return new Promise((resolve) => {
        existing.once('ready', resolve);
      });
    }

    if (this.variants.size >= MAX_CONCURRENT_VARIANTS) {
      console.error(`[transcode] Refusing to spawn variant ${resolution}: MAX_CONCURRENT_VARIANTS (${MAX_CONCURRENT_VARIANTS}) reached`);
      throw new Error('Maximum concurrent transcode variants reached');
    }

    const randomSuffix = Math.random().toString(36).substring(2, 8);
    const variantDir = path.join(this.outputBaseDir, resolution, `ss-${startPosition}-${randomSuffix}`);
    const variant = new TranscodeVariant(resolution, variantDir);

    variant.on('ready', () => {
      console.log(`[transcode] Variant ${resolution} ready (first segment available)`);
    });

    variant.on('error', (err: Error) => {
      console.error(`[transcode] Variant ${resolution} error:`, err.message);
      if (this.onErrorCallback) {
        this.onErrorCallback(resolution, err);
      }
    });

    variant.on('exit', (code: number | null) => {
      if (code === 0) {
        console.log(`[transcode] Variant ${resolution} completed successfully`);
      }
    });

    this.variants.set(resolution, variant);

    const sourceFps = await this.getSourceFps();
    variant.start(this.inputPath, startPosition, preset, hwAccelMode, sourceFps);

    return new Promise((resolve) => {
      variant.once('ready', resolve);
    });
  }

  getActiveResolutions(): Resolution[] {
    return Array.from(this.variants.keys());
  }

  isVariantReady(resolution: Resolution): boolean {
    return this.variants.get(resolution)?.isReady ?? false;
  }

  manageActiveCaches(currentPlayhead: number): void {
    for (const variant of this.variants.values()) {
      variant.manageCache(currentPlayhead);
    }
  }

  async stop(): Promise<void> {
    const promises: Promise<void>[] = [];
    for (const [resolution, variant] of this.variants) {
      console.log(`[transcode] Stopping variant ${resolution}`);
      promises.push(variant.stop());
    }
    await Promise.all(promises);
    this.variants.clear();

    try {
      if (fs.existsSync(this.outputBaseDir)) {
        fs.rmSync(this.outputBaseDir, { recursive: true, force: true });
      }
    } catch (err) {
      console.error(`[transcode] Failed to delete cache directory on stop:`, err);
    }
  }

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

  async seek(
    newPosition: number,
    preset: FfmpegPreset = 'veryfast',
    hwAccelMode: HwAccelMode = 'auto'
  ): Promise<void> {
    const resolutions: Resolution[] = ['360p', '720p', '1080p'];
    const isCovered = this.isSeekCovered(newPosition);

    if (isCovered) {
      console.log(
        `[transcode] Seek to ${newPosition.toFixed(1)}s is covered by all active variants, reusing cache`
      );
      return;
    }

    console.log(
      `[transcode] Seek to ${newPosition.toFixed(1)}s not covered, restarting all variants from new position`
    );

    const stopPromises: Promise<void>[] = [];
    for (const res of resolutions) {
      const existing = this.variants.get(res);
      if (existing) {
        stopPromises.push((async () => {
          await existing.stop();
          try {
            fs.rmSync(existing.outputDir, { recursive: true, force: true });
          } catch (err) {
            console.error(`[transcode] Failed to clear variant dir for ${res}:`, err);
          }
        })());
        this.variants.delete(res);
      }
    }
    await Promise.all(stopPromises);

    // NOTE: Align startPosition to segment boundary, starting at least 1 segment before.
    const alignedPosition = Math.max(
      0,
      Math.floor(newPosition / SEGMENT_DURATION) * SEGMENT_DURATION - SEGMENT_DURATION
    );

    await Promise.all(
      resolutions.map(res => this.ensureVariantReady(res, alignedPosition, preset, hwAccelMode))
    );
  }

  getVariantOutputDir(resolution: Resolution): string {
    const variant = this.variants.get(resolution);
    if (!variant) {
      throw new Error(`Variant not found for resolution ${resolution}`);
    }
    return variant.outputDir;
  }

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
      return variant.startPosition + (maxIndex + 1) * SEGMENT_DURATION;
    } catch {
      return 0;
    }
  }

  getTranscodeOffset(): number {
    const active = this.variants.values().next().value;
    return active ? active.startPosition : 0;
  }
}

