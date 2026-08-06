import path from 'path';
import { FfmpegPreset, HwAccelMode } from '../config/settings';
import { Resolution, AudioTrackDescriptor } from '../types';
import { TranscodeWorker } from './worker';
import { MAX_CONCURRENT_VARIANTS, SEGMENT_DURATION } from '../config/config';
import { getSourceFrameRate } from '../ffmpeg/ffprobe';
import { TranscodeCache } from '../fs/cache';
import { policyForSessionId, PlaybackPolicy } from '../config/policy';

/**
 * Aligns a given seek position to the nearest segment boundary,
 * ensuring the player has a key-frame to decode from while
 * keeping alignment consistent with SEGMENT_DURATION.
 */
export function getAlignedPosition(position: number): number {
  return Math.max(
    0,
    Math.floor(position / SEGMENT_DURATION) * SEGMENT_DURATION - SEGMENT_DURATION,
  );
}

export interface PlayheadState {
  position: number;
  resolution?: string;
  currentOffset: number;
}

/** Manages all transcoding workers for a single media file, grouped by transcode offset.
 *  Every offset spawns exactly one TranscodeWorker covering every resolution in the
 *  session's policy — sync and async differ only in policy (see policy.ts), not in code path. */
export class TranscodeSession {
  public readonly sessionId: string;
  public readonly mediaFileId: string;
  public readonly inputPath: string;
  public readonly outputBaseDir: string;
  public readonly policy: PlaybackPolicy;
  public readonly audioTracks: AudioTrackDescriptor[];

  // Map of offset -> the shared worker covering every configured resolution at that offset.
  private variantGroups = new Map<number, TranscodeWorker>();
  private groupCreatedAt = new Map<number, number>();
  private gcTimers = new Map<number, NodeJS.Timeout>();
  private playheads = new Map<string, PlayheadState>();
  private onErrorCallback: ((resolution: Resolution, error: Error) => void) | null = null;
  private fpsPromise: Promise<number> | null = null;

  constructor(sessionId: string, mediaFileId: string, inputPath: string, outputBaseDir: string, audioTracks: AudioTrackDescriptor[] = []) {
    this.sessionId = sessionId;
    this.mediaFileId = mediaFileId;
    this.inputPath = inputPath;
    this.outputBaseDir = outputBaseDir;
    this.policy = policyForSessionId(sessionId);
    this.audioTracks = audioTracks;

    TranscodeCache.ensureDirectory(this.outputBaseDir);
  }

  onError(callback: (resolution: Resolution, error: Error) => void): void {
    this.onErrorCallback = callback;
  }

  /** Reports a failure for a given resolution through the same channel as worker process errors. */
  reportError(resolution: Resolution, error: Error): void {
    if (this.onErrorCallback) this.onErrorCallback(resolution, error);
  }

  private getSourceFps(): Promise<number> {
    if (!this.fpsPromise) {
      this.fpsPromise = getSourceFrameRate(this.inputPath);
    }
    return this.fpsPromise;
  }

  private awaitLegReady(worker: TranscodeWorker, resolution: Resolution): Promise<void> {
    if (worker.isLegReady(resolution)) return Promise.resolve();
    return new Promise((resolve) => {
      const onReady = (res: Resolution) => {
        if (res === resolution) {
          worker.removeListener('ready', onReady);
          resolve();
        }
      };
      worker.on('ready', onReady);
    });
  }

  async ensureVariantReady(
    resolution: Resolution,
    offset: number = 0,
    preset: FfmpegPreset = 'veryfast',
    hwAccelMode: HwAccelMode = 'auto'
  ): Promise<void> {
    let worker = this.variantGroups.get(offset);
    if (!worker) {
      if (this.variantGroups.size >= MAX_CONCURRENT_VARIANTS) {
        console.error(`[transcode] Refusing to spawn worker at offset ${offset}: MAX_CONCURRENT_VARIANTS (${MAX_CONCURRENT_VARIANTS}) reached`);
        throw new Error('Maximum concurrent transcode workers reached');
      }

      const randomSuffix = Math.random().toString(36).substring(2, 8);
      const legDirs = new Map<Resolution, string>(
        this.policy.variants.map(res => [res, path.join(this.outputBaseDir, offset.toString(), res, `ss-${offset}-${randomSuffix}`)])
      );
      const audioLegDirs = new Map<string, string>(
        this.audioTracks.map(t => [t.id, path.join(this.outputBaseDir, offset.toString(), 'audio', t.id)])
      );

      worker = new TranscodeWorker(this.policy.variants, legDirs, this.sessionId, this.audioTracks, audioLegDirs);
      this.variantGroups.set(offset, worker);
      this.groupCreatedAt.set(offset, Date.now());

      worker.on('ready', (res: Resolution) => console.log(`[transcode] [session ${this.sessionId}] Variant ${res}@${offset} ready`));
      worker.on('error', (err: Error) => {
        console.error(`[transcode] [session ${this.sessionId}] Worker @${offset} error:`, err.message);
        for (const res of this.policy.variants) this.reportError(res, err);
      });
      worker.on('exit', (code: number | null) => {
        if (code === 0) console.log(`[transcode] [session ${this.sessionId}] Worker @${offset} completed`);
      });

      const sourceFps = await this.getSourceFps();
      worker.start(this.inputPath, offset, preset, hwAccelMode, sourceFps);
    }

    return this.awaitLegReady(worker, resolution);
  }

  isVariantReady(resolution: Resolution, offset: number): boolean {
    return this.variantGroups.get(offset)?.isLegReady(resolution) ?? false;
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
        clearTimeout(this.gcTimers.get(offset));
        this.gcTimers.set(offset, setTimeout(() => {
          this.gcTimers.delete(offset);
          this.cleanupOffsetIfEmpty(offset);
        }, 15000 - age + 100));
        return;
      }

      if (this.policy.keepLatestEmptyOffset) {
        const sortedOffsets = Array.from(this.variantGroups.keys()).sort((a, b) => a - b);
        const isLatest = sortedOffsets[sortedOffsets.length - 1] === offset;
        if (isLatest) {
          console.log(`[transcode] Keeping latest offset group ${offset} active for ${this.sessionId} session`);
          return;
        }
      }
      console.log(`[transcode] Garbage collecting unused offset group ${offset}`);
      this.stopGroup(offset);
    } else {
      this.updateVariantCache(offset);
    }
  }

  private updateVariantCache(offset: number) {
    const worker = this.variantGroups.get(offset);
    if (!worker) return;

    let maxPlayheadInGroup = -1;
    for (const ph of this.playheads.values()) {
      if (ph.currentOffset === offset && ph.position > maxPlayheadInGroup) {
        maxPlayheadInGroup = ph.position;
      }
    }

    if (maxPlayheadInGroup === -1) return;

    worker.manageCache(maxPlayheadInGroup);
  }

  async stopGroup(offset: number): Promise<void> {
    const worker = this.variantGroups.get(offset);
    if (!worker) return;

    // NOTE: Immediately remove the group so new requests create a fresh worker
    // instead of latching onto this dying one.
    this.variantGroups.delete(offset);
    this.groupCreatedAt.delete(offset);
    clearTimeout(this.gcTimers.get(offset));
    this.gcTimers.delete(offset);

    console.log(`[transcode] Stopping worker for offset ${offset}`);
    await worker.stop();

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
    const worker = this.variantGroups.get(offset);
    if (!worker) return false;

    for (const res of worker.resolutions) {
      const maxCoveredTime = worker.legMaxCoveredTime(res);
      if (newPosition >= worker.startPosition && newPosition <= maxCoveredTime) {
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
    const worker = this.variantGroups.get(offset);
    if (!worker || !worker.resolutions.includes(resolution)) return false;

    const maxCoveredTime = worker.legMaxCoveredTime(resolution);
    return newPosition >= worker.startPosition && newPosition <= maxCoveredTime;
  }

  async seek(
    newPosition: number,
    currentOffset: number,
    preset: FfmpegPreset = 'veryfast',
    hwAccelMode: HwAccelMode = 'auto',
    resolutionsToPrewarm: Resolution[] = this.policy.variants
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
    const worker = this.variantGroups.get(offset);
    if (!worker) {
      throw new Error(`Variant not found for resolution ${resolution} at offset ${offset}`);
    }
    return worker.legOutputDir(resolution);
  }

  /** Ensures an audio track's HLS output is ready. Audio is always encoded on the same shared
   *  worker as every video resolution at this offset — there's no separate audio-routing
   *  concern to resolve between sync/async now that both always carry the full ladder. */
  async ensureAudioTrackReady(
    trackId: string,
    offset: number = 0,
    preset: FfmpegPreset = 'veryfast',
    hwAccelMode: HwAccelMode = 'auto'
  ): Promise<void> {
    await this.ensureVariantReady(this.policy.variants[0], offset, preset, hwAccelMode);
    const worker = this.variantGroups.get(offset);
    if (!worker) throw new Error(`Worker not found for offset ${offset}`);
    if (worker.isAudioLegReady(trackId)) return;
    return new Promise((resolve) => {
      const onReady = (id: string) => {
        if (id === trackId) {
          worker.removeListener('audio-ready', onReady);
          resolve();
        }
      };
      worker.on('audio-ready', onReady);
    });
  }

  getAudioOutputDir(trackId: string, offset: number = 0): string {
    const worker = this.variantGroups.get(offset);
    if (!worker) throw new Error(`Worker not found for offset ${offset}`);
    return worker.audioLegOutputDir(trackId);
  }

  getPlayheadResolution(playheadId: string): string | undefined {
    return this.playheads.get(playheadId)?.resolution;
  }

  getPlayheadOffset(playheadId: string): number | undefined {
    const offset = this.playheads.get(playheadId)?.currentOffset;
    return offset !== undefined && offset >= 0 ? offset : undefined;
  }
}
