import fs from 'fs';
import path from 'path';
import { FfmpegPreset, HwAccelMode } from './settings';
import { Resolution } from './types';
import { TranscodeVariant } from './variant';
import { MAX_CONCURRENT_VARIANTS, SEGMENT_DURATION } from './config';
import { getSourceFrameRate } from './ffprobe';

/** Manages all transcoding variants for a single media file, grouped by transcode offset. */
export class TranscodeSession {
  public readonly sessionId: string;
  public readonly mediaFileId: string;
  public readonly inputPath: string;
  public readonly outputBaseDir: string;

  // Map of offset -> Map of Resolution -> TranscodeVariant
  private variantGroups = new Map<number, Map<Resolution, TranscodeVariant>>();
  private groupCreatedAt = new Map<number, number>();
  private onErrorCallback: ((resolution: Resolution, error: Error) => void) | null = null;
  private fpsPromise: Promise<number> | null = null;

  constructor(sessionId: string, mediaFileId: string, inputPath: string, outputBaseDir: string) {
    this.sessionId = sessionId;
    this.mediaFileId = mediaFileId;
    this.inputPath = inputPath;
    this.outputBaseDir = outputBaseDir;

    fs.mkdirSync(this.outputBaseDir, { recursive: true });
  }

  onError(callback: (resolution: Resolution, error: Error) => void): void {
    this.onErrorCallback = callback;
  }

  private getSourceFps(): Promise<number> {
    if (!this.fpsPromise) {
      this.fpsPromise = getSourceFrameRate(this.inputPath);
    }
    return this.fpsPromise;
  }

  private getTotalActiveVariants(): number {
    let total = 0;
    for (const group of this.variantGroups.values()) {
      total += group.size;
    }
    return total;
  }

  async ensureVariantReady(
    resolution: Resolution,
    offset: number = 0,
    preset: FfmpegPreset = 'veryfast',
    hwAccelMode: HwAccelMode = 'auto'
  ): Promise<void> {
    let group = this.variantGroups.get(offset);
    if (!group) {
      group = new Map<Resolution, TranscodeVariant>();
      this.variantGroups.set(offset, group);
      this.groupCreatedAt.set(offset, Date.now());
    }

    const existing = group.get(resolution);
    if (existing) {
      if (existing.isReady) return;
      return new Promise((resolve) => existing.once('ready', resolve));
    }

    if (this.getTotalActiveVariants() >= MAX_CONCURRENT_VARIANTS) {
      console.error(`[transcode] Refusing to spawn variant ${resolution} at offset ${offset}: MAX_CONCURRENT_VARIANTS (${MAX_CONCURRENT_VARIANTS}) reached`);
      throw new Error('Maximum concurrent transcode variants reached');
    }

    const randomSuffix = Math.random().toString(36).substring(2, 8);
    // Include offset in the directory path so groups are isolated
    const variantDir = path.join(this.outputBaseDir, offset.toString(), resolution, `ss-${offset}-${randomSuffix}`);
    const variant = new TranscodeVariant(resolution, variantDir, this.sessionId);

    variant.on('ready', () => console.log(`[transcode] [session ${this.sessionId}] Variant ${resolution}@${offset} ready`));
    variant.on('error', (err: Error) => {
      console.error(`[transcode] [session ${this.sessionId}] Variant ${resolution}@${offset} error:`, err.message);
      if (this.onErrorCallback) this.onErrorCallback(resolution, err);
    });
    variant.on('exit', (code: number | null) => {
      if (code === 0) console.log(`[transcode] [session ${this.sessionId}] Variant ${resolution}@${offset} completed`);
    });

    group.set(resolution, variant);

    const sourceFps = await this.getSourceFps();
    variant.start(this.inputPath, offset, preset, hwAccelMode, sourceFps);

    return new Promise((resolve) => variant.once('ready', resolve));
  }

  isVariantReady(resolution: Resolution, offset: number): boolean {
    return this.variantGroups.get(offset)?.get(resolution)?.isReady ?? false;
  }

  manageActiveCaches(activeOffset: number, playheads: number[]): void {
    for (const offset of Array.from(this.variantGroups.keys())) {
      let isActive = (offset === activeOffset);
      let minPlayheadInGroup = Infinity;

      for (const pos of playheads) {
        if (this.isPositionCovered(pos, offset)) {
          isActive = true;
          if (pos < minPlayheadInGroup) minPlayheadInGroup = pos;
        }
      }

      if (!isActive) {
        const createdAt = this.groupCreatedAt.get(offset) || 0;
        if (Date.now() - createdAt < 15000) {
          // Keep it alive during the 15-second grace period
          continue;
        }

        console.log(`[transcode] Garbage collecting unused offset group ${offset}`);
        this.stopGroup(offset);
      } else {
        const group = this.variantGroups.get(offset);
        if (group && minPlayheadInGroup !== Infinity) {
          for (const variant of group.values()) {
            variant.manageCache(minPlayheadInGroup);
          }
        }
      }
    }
  }

  async stopGroup(offset: number): Promise<void> {
    const group = this.variantGroups.get(offset);
    if (!group) return;

    console.log(`[transcode] Stopping all variants for offset ${offset}`);
    const promises: Promise<void>[] = [];
    for (const variant of group.values()) {
      promises.push(variant.stop());
    }
    await Promise.all(promises);
    this.variantGroups.delete(offset);
    this.groupCreatedAt.delete(offset);

    try {
      const groupDir = path.join(this.outputBaseDir, offset.toString());
      if (fs.existsSync(groupDir)) {
        fs.rmSync(groupDir, { recursive: true, force: true });
      }
    } catch (err) {
      console.error(`[transcode] Failed to delete cache directory for offset ${offset}:`, err);
    }
  }

  async stop(): Promise<void> {
    const promises: Promise<void>[] = [];
    for (const offset of this.variantGroups.keys()) {
      promises.push(this.stopGroup(offset));
    }
    await Promise.all(promises);

    try {
      if (fs.existsSync(this.outputBaseDir)) {
        fs.rmSync(this.outputBaseDir, { recursive: true, force: true });
      }
    } catch (err) {
      console.error(`[transcode] Failed to delete base cache directory on stop:`, err);
    }
  }

  isPositionCovered(newPosition: number, offset: number): boolean {
    const group = this.variantGroups.get(offset);
    if (!group) return false;
    
    const activeVariants = Array.from(group.values());
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
    currentOffset: number,
    preset: FfmpegPreset = 'veryfast',
    hwAccelMode: HwAccelMode = 'auto',
    resolutionsToPrewarm: Resolution[] = ['360p', '720p', '1080p']
  ): Promise<number> {
    const isCovered = this.isPositionCovered(newPosition, currentOffset);

    if (isCovered) {
      console.log(`[transcode] Seek to ${newPosition.toFixed(1)}s is covered by offset ${currentOffset}, reusing cache`);
      return currentOffset;
    }

    console.log(`[transcode] Seek to ${newPosition.toFixed(1)}s not covered by offset ${currentOffset}, starting new variants`);

    await this.stopGroup(currentOffset);

    const alignedPosition = Math.max(
      0,
      Math.floor(newPosition / SEGMENT_DURATION) * SEGMENT_DURATION - SEGMENT_DURATION
    );

    if (resolutionsToPrewarm.length > 0) {
      await Promise.all(
        resolutionsToPrewarm.map(res => this.ensureVariantReady(res, alignedPosition, preset, hwAccelMode))
      );
    }

    return alignedPosition;
  }

  getVariantOutputDir(resolution: Resolution, offset: number): string {
    const group = this.variantGroups.get(offset);
    const variant = group?.get(resolution);
    if (!variant) {
      throw new Error(`Variant not found for resolution ${resolution} at offset ${offset}`);
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
}
