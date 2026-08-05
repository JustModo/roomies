import path from 'path';
import { FfmpegPreset, HwAccelMode } from './settings';
import { Resolution, AudioTrackDescriptor } from './types';
import { TranscodeVariant } from './variant';
import { TranscodeVariantGroup, GroupedVariantLeg } from './variantGroup';
import { MAX_CONCURRENT_VARIANTS } from './config';
import { getSourceFrameRate } from './ffprobe';
import { TranscodeCache } from './cache';
import { getAlignedPosition } from './utils';
import { policyForSessionId } from './modePolicy';
import { AsyncOffsetResolutionLockedError } from './errors';

type VariantLike = TranscodeVariant | GroupedVariantLeg;
const ALL_RESOLUTIONS: Resolution[] = ['360p', '720p', '1080p'];

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
  private variantGroups = new Map<number, Map<Resolution, VariantLike>>();
  private groupCreatedAt = new Map<number, number>();
  public mergedOffsets = new Map<number, number>();
  private playheads = new Map<string, PlayheadState>();
  private onErrorCallback: ((resolution: Resolution, error: Error) => void) | null = null;
  private fpsPromise: Promise<number> | null = null;

  public readonly audioTracks: AudioTrackDescriptor[];
  // Only populated for grouped (sync) sessions — the underlying TranscodeVariantGroup instance
  // per offset, needed to reach getAudioLeg/audioLegOutputDir (GroupedVariantLeg only proxies
  // the per-resolution view, not the group itself).
  private variantGroupInstances = new Map<number, TranscodeVariantGroup>();
  // Only used for non-grouped (async) sessions — since each resolution independently duplicates
  // all audio tracks there (see TranscodeVariant), audio for a given offset is sourced from
  // the playhead's current resolution when available (else last requested / first in group).
  private lastResolutionByOffset = new Map<number, Resolution>();

  /** Sync sessions merge all resolutions into one shared decode process (TranscodeVariantGroup)
   *  since they always prewarm every resolution together anyway; async sessions keep one
   *  independent process per resolution (TranscodeVariant) to preserve per-resolution
   *  SIGSTOP throttling, which matters there since users can each be watching a different
   *  resolution (see updateVariantCache). */
  private readonly useGroupedVariants: boolean;
  private readonly keepLatestEmptyOffset: boolean;
  private readonly throttleUnused: boolean;

  constructor(sessionId: string, mediaFileId: string, inputPath: string, outputBaseDir: string, audioTracks: AudioTrackDescriptor[] = []) {
    this.sessionId = sessionId;
    this.mediaFileId = mediaFileId;
    this.inputPath = inputPath;
    this.outputBaseDir = outputBaseDir;
    const policy = policyForSessionId(sessionId);
    this.useGroupedVariants = policy.encode === 'grouped';
    this.keepLatestEmptyOffset = policy.keepLatestEmptyOffset;
    this.throttleUnused = policy.throttleUnused;
    this.audioTracks = audioTracks;

    TranscodeCache.ensureDirectory(this.outputBaseDir);
  }

  onError(callback: (resolution: Resolution, error: Error) => void): void {
    this.onErrorCallback = callback;
  }

  /** Reports a failure for a given resolution through the same channel as variant process errors. */
  reportError(resolution: Resolution, error: Error): void {
    if (this.onErrorCallback) this.onErrorCallback(resolution, error);
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
      group = new Map<Resolution, VariantLike>();
      this.variantGroups.set(offset, group);
      this.groupCreatedAt.set(offset, Date.now());
    }

    // Async: one video quality per offset — refuse a second resolution at the same offset.
    if (!this.useGroupedVariants && group.size > 0 && !group.has(resolution)) {
      const locked = this.getLockedResolution(offset)!;
      throw new AsyncOffsetResolutionLockedError(locked, resolution, offset);
    }

    this.lastResolutionByOffset.set(offset, resolution);

    const existing = group.get(resolution);
    if (existing) {
      // Do not force-resume here — manageCache owns SIGSTOP/SIGCONT (incl. ahead>300 look-ahead).
      if (existing.isReady) return;
      return new Promise((resolve) => existing.once('ready', resolve));
    }

    if (this.useGroupedVariants) {
      return this.ensureGroupedVariantReady(resolution, offset, group, preset, hwAccelMode);
    }

    if (this.getTotalActiveVariants() >= MAX_CONCURRENT_VARIANTS) {
      console.error(`[transcode] Refusing to spawn variant ${resolution} at offset ${offset}: MAX_CONCURRENT_VARIANTS (${MAX_CONCURRENT_VARIANTS}) reached`);
      throw new Error('Maximum concurrent transcode variants reached');
    }

    const randomSuffix = Math.random().toString(36).substring(2, 8);
    // Include offset in the directory path so groups are isolated
    const variantDir = path.join(this.outputBaseDir, offset.toString(), resolution, `ss-${offset}-${randomSuffix}`);
    const variant = new TranscodeVariant(resolution, variantDir, this.sessionId, this.audioTracks);

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

  /** Locked video resolution for an async offset, or null if none started yet. */
  getLockedResolution(offset: number): Resolution | null {
    offset = this.resolveMergedOffset(offset);
    const group = this.variantGroups.get(offset);
    if (!group || group.size === 0) return null;
    const last = this.lastResolutionByOffset.get(offset);
    if (last && group.has(last)) return last;
    return group.keys().next().value ?? null;
  }

  /** True if soft-warm may ensure this resolution at offset (empty or same locked res). */
  canWarmResolution(offset: number, resolution: Resolution): boolean {
    if (this.useGroupedVariants) return true;
    const locked = this.getLockedResolution(offset);
    return locked === null || locked === resolution;
  }

  /**
   * Sync-scope variant creation: spawns one shared TranscodeVariantGroup covering ALL
   * resolutions at once (not just the one requested), since sync sessions always prewarm
   * every resolution together (see coordinator.ts/service.ts callers) — there's no partial-
   * group case to support. All 3 leg entries are populated into `group` synchronously,
   * before any `await`, so concurrent ensureVariantReady calls for the other two resolutions
   * (fired in the same Promise.allSettled batch by the caller) find `existing` already set
   * instead of racing to create a second group for the same offset.
   */
  private async ensureGroupedVariantReady(
    resolution: Resolution,
    offset: number,
    group: Map<Resolution, VariantLike>,
    preset: FfmpegPreset,
    hwAccelMode: HwAccelMode
  ): Promise<void> {
    if (this.getTotalActiveVariants() + ALL_RESOLUTIONS.length > MAX_CONCURRENT_VARIANTS) {
      console.error(`[transcode] Refusing to spawn variant group at offset ${offset}: MAX_CONCURRENT_VARIANTS (${MAX_CONCURRENT_VARIANTS}) reached`);
      throw new Error('Maximum concurrent transcode variants reached');
    }

    const randomSuffix = Math.random().toString(36).substring(2, 8);
    const legDirs = new Map<Resolution, string>(
      ALL_RESOLUTIONS.map(res => [res, path.join(this.outputBaseDir, offset.toString(), res, `ss-${offset}-${randomSuffix}`)])
    );
    const audioLegDirs = new Map<string, string>(
      this.audioTracks.map(t => [t.id, path.join(this.outputBaseDir, offset.toString(), 'audio', t.id)])
    );

    const variantGroup = new TranscodeVariantGroup(ALL_RESOLUTIONS, legDirs, this.sessionId, this.audioTracks, audioLegDirs);
    this.variantGroupInstances.set(offset, variantGroup);

    for (const res of ALL_RESOLUTIONS) {
      const leg = variantGroup.getLeg(res);
      leg.on('ready', () => console.log(`[transcode] [session ${this.sessionId}] Variant ${res}@${offset} ready (grouped)`));
      leg.on('error', (err: Error) => {
        console.error(`[transcode] [session ${this.sessionId}] Variant group @${offset} error:`, err.message);
        if (this.onErrorCallback) this.onErrorCallback(res, err);
      });
      leg.on('exit', (code: number | null) => {
        if (code === 0) console.log(`[transcode] [session ${this.sessionId}] Variant ${res}@${offset} completed (grouped)`);
      });
      group.set(res, leg);
    }

    const sourceFps = await this.getSourceFps();
    variantGroup.start(this.inputPath, offset, preset, hwAccelMode, sourceFps);

    const requestedLeg = group.get(resolution)!;
    return new Promise((resolve) => requestedLeg.once('ready', resolve));
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
        if (this.keepLatestEmptyOffset) {
          console.log(`[transcode] Keeping latest offset group ${offset} active for sync session`);
          return;
        }
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

    if (maxPlayheadInGroup === -1) return;

    const fallbackRes = this.lastResolutionByOffset.get(offset);
    for (const variant of group.values()) {
      let isActivelyWatched: boolean;
      if (!this.throttleUnused) {
        isActivelyWatched = true;
      } else if (activeResolutions.size > 0) {
        isActivelyWatched = activeResolutions.has(variant.resolution);
      } else if (fallbackRes) {
        // No playhead resolution yet — only keep last-requested res awake, not every variant.
        isActivelyWatched = variant.resolution === fallbackRes;
      } else {
        // Unknown: skip inactivity suspend; still allow ahead>300 via manageCache(…, true).
        isActivelyWatched = true;
      }
      variant.manageCache(maxPlayheadInGroup, isActivelyWatched);
    }
  }

  async stopGroup(offset: number): Promise<void> {
    const group = this.variantGroups.get(offset);
    if (!group) return;

    // NOTE: Immediately remove the group so new requests create a fresh group
    // instead of latching onto this dying one.
    this.variantGroups.delete(offset);
    this.groupCreatedAt.delete(offset);
    this.variantGroupInstances.delete(offset);
    this.lastResolutionByOffset.delete(offset);

    console.log(`[transcode] Stopping all variants for offset ${offset}`);
    const promises: Promise<void>[] = [];
    for (const variant of group.values()) {
      promises.push(variant.stop().then(() => {
        TranscodeCache.cleanDirectory(variant.outputDir);
      }));
    }
    await Promise.all(promises);

    // NOTE: Only clean the entire offset directory if a new group hasn't
    // been created for this offset in the meantime.
    if (!this.variantGroups.has(offset)) {
      const groupDir = path.join(this.outputBaseDir, offset.toString());
      TranscodeCache.cleanDirectory(groupDir);
    }
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
      const results = await Promise.allSettled(
        resolutionsToPrewarm.map(res => this.ensureVariantReady(res, alignedPosition, preset, hwAccelMode))
      );
      results.forEach((result, i) => {
        if (result.status === 'rejected') {
          const resolution = resolutionsToPrewarm[i];
          const error = result.reason instanceof Error ? result.reason : new Error(String(result.reason));
          console.error(`[transcode] Prewarm failed for ${resolution} at offset ${alignedPosition}:`, error.message);
          this.reportError(resolution, error);
        }
      });
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

  /** Ensures an audio track's HLS output is ready. Grouped (sync) sessions share one audio
   *  encode across all resolutions; non-grouped (async) sessions source audio from the
   *  playhead's current resolution when available (see resolveAsyncAudioResolution). */
  async ensureAudioTrackReady(
    trackId: string,
    offset: number = 0,
    preset: FfmpegPreset = 'veryfast',
    hwAccelMode: HwAccelMode = 'auto'
  ): Promise<void> {
    offset = this.resolveMergedOffset(offset);

    if (this.useGroupedVariants) {
      await this.ensureVariantReady(ALL_RESOLUTIONS[0], offset, preset, hwAccelMode);
      const group = this.variantGroupInstances.get(offset);
      if (!group) throw new Error(`Variant group not found for offset ${offset}`);
      const leg = group.getAudioLeg(trackId);
      if (leg.isReady) return;
      return new Promise((resolve) => leg.once('ready', resolve));
    }

    const resolution = this.resolveAsyncAudioResolution(offset);
    await this.ensureVariantReady(resolution, offset, preset, hwAccelMode);
    const group = this.variantGroups.get(offset);
    const variant = group?.get(resolution) as TranscodeVariant | undefined;
    if (!variant) throw new Error(`Variant not found for resolution ${resolution} at offset ${offset}`);
    if (variant.isAudioReady(trackId)) return;
    return new Promise((resolve) => {
      const onReady = (id: string) => {
        if (id === trackId) {
          variant.removeListener('audio-ready', onReady);
          resolve();
        }
      };
      variant.on('audio-ready', onReady);
    });
  }

  getAudioOutputDir(trackId: string, offset: number = 0): string {
    offset = this.resolveMergedOffset(offset);

    if (this.useGroupedVariants) {
      const group = this.variantGroupInstances.get(offset);
      if (!group) throw new Error(`Variant group not found for offset ${offset}`);
      return group.audioLegOutputDir(trackId);
    }

    const resolution = this.resolveAsyncAudioResolution(offset);
    const group = this.variantGroups.get(offset);
    const variant = group?.get(resolution) as TranscodeVariant | undefined;
    if (!variant) throw new Error(`Variant not found for resolution ${resolution} at offset ${offset}`);
    return variant.audioOutputDir(trackId);
  }

  /** Preferred resolution for async demuxed audio: playhead on this offset, else any
   *  existing variant in the group, else last-requested, else 360p. */
  private resolveAsyncAudioResolution(offset: number): Resolution {
    for (const ph of this.playheads.values()) {
      if (ph.currentOffset === offset && (ph.resolution === '360p' || ph.resolution === '720p' || ph.resolution === '1080p')) {
        const group = this.variantGroups.get(offset);
        if (group?.has(ph.resolution)) return ph.resolution;
      }
    }

    const group = this.variantGroups.get(offset);
    if (group) {
      for (const res of ALL_RESOLUTIONS) {
        if (group.has(res)) return res;
      }
    }

    return this.lastResolutionByOffset.get(offset) ?? ALL_RESOLUTIONS[0];
  }

  getPlayheadResolution(playheadId: string): string | undefined {
    return this.playheads.get(playheadId)?.resolution;
  }

  getPlayheadOffset(playheadId: string): number | undefined {
    const offset = this.playheads.get(playheadId)?.currentOffset;
    return offset !== undefined && offset >= 0 ? offset : undefined;
  }

  private getMaxCoveredTime(variant: VariantLike): number {
    return variant.maxCoveredTime;
  }
}
