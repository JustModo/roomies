import path from 'path';
import { FfmpegPreset, HwAccelMode } from './settings';
import { Resolution } from './types';
import { TranscodeVariant } from './variant';
import { MAX_CONCURRENT_VARIANTS, SEGMENT_DURATION } from './config';
import { getSourceFrameRate } from './ffprobe';
import { TranscodeCache } from './cache';
import { getAlignedPosition } from './utils';

export interface PlayheadState {
  position: number;
  resolution?: string;
  currentOffset: number;
}

/** Manages all transcoding variants for a single media file, grouped by transcode offset. */
export class TranscodeSession {
  public readonly sessionId: string;
  public readonly mediaFileId: string;
  public readonly inputPath: string;
  public readonly outputBaseDir: string;

  // Map of offset -> Map of Resolution -> TranscodeVariant
  private variantGroups = new Map<number, Map<Resolution, TranscodeVariant>>();
  private groupCreatedAt = new Map<number, number>();
  public mergedOffsets = new Map<number, number>();
  private playheads = new Map<string, PlayheadState>();
  private onErrorCallback: ((resolution: Resolution, error: Error) => void) | null = null;
  private fpsPromise: Promise<number> | null = null;

  constructor(sessionId: string, mediaFileId: string, inputPath: string, outputBaseDir: string) {
    this.sessionId = sessionId;
    this.mediaFileId = mediaFileId;
    this.inputPath = inputPath;
    this.outputBaseDir = outputBaseDir;

    TranscodeCache.ensureDirectory(this.outputBaseDir);
  }

  onError(callback: (resolution: Resolution, error: Error) => void): void {
    this.onErrorCallback = callback;
  }

  resolveMergedOffset(offset: number): number {
    let effectiveOffset = offset;
    while (this.mergedOffsets.has(effectiveOffset)) {
      effectiveOffset = this.mergedOffsets.get(effectiveOffset)!;
    }
    return effectiveOffset;
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
    offset = this.resolveMergedOffset(offset);

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

  updatePlayhead(id: string, position: number, resolution?: string): number | null {
    const state = this.playheads.get(id);
    let currentOffset = state?.currentOffset ?? -1;

    let maxOffset = -1;
    for (const offset of this.variantGroups.keys()) {
      if (this.isPositionCovered(position, offset)) {
        if (offset > maxOffset) {
          maxOffset = offset;
        }
      }
    }

    if (maxOffset === -1) {
      if (state) {
        state.position = position;
        state.resolution = resolution;
      } else {
        this.playheads.set(id, { position, resolution, currentOffset: -1 });
      }
      return null;
    }

    let swappedToOffset: number | null = null;
    if (state) {
      if (state.currentOffset !== maxOffset) {
        const oldOffset = state.currentOffset;
        console.log(`[transcode] Playhead ${id} shifted from offset ${oldOffset} to new offset ${maxOffset}`);
        state.currentOffset = maxOffset;
        swappedToOffset = maxOffset;
        this.cleanupOffsetIfEmpty(oldOffset);
      }
      state.position = position;
      state.resolution = resolution;
    } else {
      this.playheads.set(id, { position, resolution, currentOffset: maxOffset });
      swappedToOffset = maxOffset;
    }

    this.updateVariantCache(maxOffset);
    return swappedToOffset;
  }

  removePlayhead(id: string): void {
    const state = this.playheads.get(id);
    if (state) {
      const oldOffset = state.currentOffset;
      this.playheads.delete(id);
      this.cleanupOffsetIfEmpty(oldOffset);
    }
  }

  private cleanupOffsetIfEmpty(offset: number) {
    if (offset === -1 || !this.variantGroups.has(offset)) return;

    let hasPlayheads = false;
    for (const ph of this.playheads.values()) {
      if (ph.currentOffset === offset) {
        hasPlayheads = true;
        break;
      }
    }

    if (!hasPlayheads) {
      const createdAt = this.groupCreatedAt.get(offset) || 0;
      const age = Date.now() - createdAt;
      
      if (age < 15000) {
        setTimeout(() => this.cleanupOffsetIfEmpty(offset), 15000 - age + 100);
        return;
      }

      const sortedOffsets = Array.from(this.variantGroups.keys()).sort((a, b) => a - b);
      const nextOffset = sortedOffsets.find(o => o > offset);

      if (nextOffset !== undefined) {
        console.log(`[transcode] Offset ${offset} has no remaining playheads, merging into ${nextOffset}`);
        this.mergedOffsets.set(offset, nextOffset);
        this.stopGroup(offset);
      } else {
        console.log(`[transcode] Garbage collecting unused offset group ${offset}`);
        this.stopGroup(offset);
      }
    } else {
       this.updateVariantCache(offset);
    }
  }

  private updateVariantCache(offset: number) {
    const group = this.variantGroups.get(offset);
    if (!group) return;

    let maxPlayheadInGroup = -1;
    const activeResolutions = new Set<string>();

    for (const ph of this.playheads.values()) {
      if (ph.currentOffset === offset) {
        if (ph.position > maxPlayheadInGroup) maxPlayheadInGroup = ph.position;
        if (ph.resolution) activeResolutions.add(ph.resolution);
      }
    }

    if (maxPlayheadInGroup !== -1) {
      for (const variant of group.values()) {
        const isActivelyWatched = this.sessionId === 'sync' || activeResolutions.size === 0 || activeResolutions.has(variant.resolution);
        variant.manageCache(maxPlayheadInGroup, isActivelyWatched);
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

    const groupDir = path.join(this.outputBaseDir, offset.toString());
    TranscodeCache.cleanDirectory(groupDir);
  }

  async stop(): Promise<void> {
    const promises: Promise<void>[] = [];
    for (const offset of this.variantGroups.keys()) {
      promises.push(this.stopGroup(offset));
    }
    await Promise.all(promises);

    TranscodeCache.cleanDirectory(this.outputBaseDir);
  }

  isPositionCovered(newPosition: number, offset: number): boolean {
    const group = this.variantGroups.get(offset);
    if (!group) return false;
    
    const activeVariants = Array.from(group.values());
    if (activeVariants.length === 0) return false;

    for (const variant of activeVariants) {
      const maxCoveredTime = this.getMaxCoveredTime(variant);
      if (newPosition >= variant.startPosition && newPosition <= maxCoveredTime) {
        return true;
      }
    }
    return false;
  }

  getCoveringOffset(position: number): number | null {
    for (const offset of this.variantGroups.keys()) {
      if (this.isPositionCovered(position, offset)) {
        return offset;
      }
    }
    return null;
  }

  isPositionCoveredByVariant(resolution: Resolution, newPosition: number, offset: number): boolean {
    const group = this.variantGroups.get(offset);
    if (!group) return false;
    
    const variant = group.get(resolution);
    if (!variant) return false;

    const maxCoveredTime = this.getMaxCoveredTime(variant);
    return newPosition >= variant.startPosition && newPosition <= maxCoveredTime;
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

    const alignedPosition = getAlignedPosition(newPosition);

    if (resolutionsToPrewarm.length > 0) {
      await Promise.all(
        resolutionsToPrewarm.map(res => this.ensureVariantReady(res, alignedPosition, preset, hwAccelMode))
      );
    }

    return alignedPosition;
  }

  getVariantOutputDir(resolution: Resolution, offset: number): string {
    offset = this.resolveMergedOffset(offset);
    const group = this.variantGroups.get(offset);
    const variant = group?.get(resolution);
    if (!variant) {
      throw new Error(`Variant not found for resolution ${resolution} at offset ${offset}`);
    }
    return variant.outputDir;
  }

  private getMaxCoveredTime(variant: TranscodeVariant): number {
    return TranscodeCache.getVariantCacheStats(variant.outputDir, variant.startPosition).maxCoveredTime;
  }
}
