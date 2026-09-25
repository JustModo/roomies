import path from 'path';
import { FfmpegPreset, HwAccelMode } from '../config/settings';
import { Resolution, AudioTrackDescriptor } from '../types';
import { TranscodeWorker } from './worker';
import { MAX_CONCURRENT_VARIANTS, SEGMENT_DURATION, SUPPORTED_RESOLUTIONS, PLAYHEAD_STALE_MS, RESOLUTION_PRESETS, READY_TIMEOUT_MS } from '../config/config';
import { getSourceVideoInfo, SourceVideoInfo } from '../ffmpeg/ffprobe';
import { TranscodeCache } from '../fs/cache';
import { policyForSessionId, PlaybackPolicy, variantsForSource, scaledResolution } from '../config/policy';

/** Aligns seek position to nearest segment boundary. */
export function getAlignedPosition(position: number): number {
  return Math.max(
    0,
    Math.floor(position / SEGMENT_DURATION) * SEGMENT_DURATION - SEGMENT_DURATION,
  );
}

export interface PlayheadState {
  position: number;
  currentOffset: number;
  lastSeenAt: number;
}

/** Manages all transcoding workers for a single media file, grouped by transcode offset. */
export class TranscodeSession {
  public readonly sessionId: string;
  public readonly mediaFileId: string;
  public readonly inputPath: string;
  public readonly outputBaseDir: string;
  public readonly policy: PlaybackPolicy;
  public readonly audioTracks: AudioTrackDescriptor[];

  // Map of offset -> the shared worker covering every configured resolution at that offset.
  private variantGroups = new Map<number, TranscodeWorker>();
  private creatingGroups = new Map<number, Promise<TranscodeWorker>>();
  private groupCreatedAt = new Map<number, number>();
  private gcTimers = new Map<number, NodeJS.Timeout>();
  private playheads = new Map<string, PlayheadState>();
  private onErrorCallback: ((resolution: Resolution, error: Error) => void) | null = null;
  private videoInfoPromise: Promise<SourceVideoInfo> | null = null;
  private staleSweepTimer: NodeJS.Timeout;
  private reportedErrors = new WeakSet<Error>();

  constructor(sessionId: string, mediaFileId: string, inputPath: string, outputBaseDir: string, audioTracks: AudioTrackDescriptor[] = []) {
    this.sessionId = sessionId;
    this.mediaFileId = mediaFileId;
    this.inputPath = inputPath;
    this.outputBaseDir = outputBaseDir;
    this.policy = policyForSessionId(sessionId);
    this.audioTracks = audioTracks;

    TranscodeCache.ensureDirectory(this.outputBaseDir);

    // Sweep stale playheads that missed removePlayhead call.
    this.staleSweepTimer = setInterval(() => this.sweepStalePlayheads(), PLAYHEAD_STALE_MS);
  }

  private sweepStalePlayheads(): void {
    const now = Date.now();
    for (const [id, state] of this.playheads) {
      if (now - state.lastSeenAt > PLAYHEAD_STALE_MS) {
        console.log(`[transcode] Playhead ${id} went stale, removing`);
        this.removePlayhead(id);
      }
    }
  }

  onError(callback: (resolution: Resolution, error: Error) => void): void {
    this.onErrorCallback = callback;
  }

  /** Reports a failure for a given resolution through the same channel as worker process errors. */
  reportError(resolution: Resolution, error: Error): void {
    if (this.reportedErrors.has(error)) return;
    this.reportedErrors.add(error);
    if (this.onErrorCallback) this.onErrorCallback(resolution, error);
  }

  private getVideoInfo(): Promise<SourceVideoInfo> {
    if (!this.videoInfoPromise) {
      this.videoInfoPromise = getSourceVideoInfo(this.inputPath);
    }
    return this.videoInfoPromise;
  }

  /** The rungs this session's workers will actually encode, after pruning any that would
   *  upscale the source. Reuses the memoized probe, so callers pay no extra ffprobe.
   *  The master playlist must advertise exactly this — advertising a rung that is never
   *  encoded makes the server serve a lower rung under its URL, and hls.js then ABR-switches
   *  between two levels that are the same stream, flushing the buffer on every switch. */
  async availableVariants(): Promise<{ resolution: Resolution; width: number; height: number }[]> {
    const { width, height } = await this.getVideoInfo();
    return variantsForSource(this.policy.variants, width, height).map(resolution => ({
      resolution,
      ...scaledResolution(RESOLUTION_PRESETS[resolution], width, height),
    }));
  }

  /** Resolves a requested resolution to the nearest available worker resolution rung. */
  private resolveAvailableResolution(worker: TranscodeWorker, resolution: Resolution): Resolution {
    if (worker.resolutions.includes(resolution)) return resolution;
    const idx = SUPPORTED_RESOLUTIONS.indexOf(resolution);
    for (let i = idx - 1; i >= 0; i--) {
      if (worker.resolutions.includes(SUPPORTED_RESOLUTIONS[i])) return SUPPORTED_RESOLUTIONS[i];
    }
    return worker.resolutions[0];
  }

  private waitFor(worker: TranscodeWorker, event: 'ready' | 'audio-ready', key: string, offset: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const cleanup = () => {
        clearTimeout(timer);
        worker.removeListener(event, onReady);
        worker.removeListener('error', onError);
        worker.removeListener('exit', onExit);
      };
      const onReady = (readyKey: string) => {
        if (readyKey !== key) return;
        cleanup();
        resolve();
      };
      const onError = (err: Error) => {
        cleanup();
        reject(err);
      };
      const onExit = () => {
        cleanup();
        reject(new Error(`Worker @${offset} exited before ${key} was ready`));
      };
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error(`Timed out after ${READY_TIMEOUT_MS}ms waiting for ${key} @${offset}`));
        if (this.variantGroups.get(offset) === worker) this.stopGroup(offset);
      }, READY_TIMEOUT_MS);
      worker.on(event, onReady);
      worker.on('error', onError);
      worker.on('exit', onExit);
    });
  }

  async ensureVariantReady(
    resolution: Resolution,
    offset: number = 0,
    preset: FfmpegPreset = 'veryfast',
    hwAccelMode: HwAccelMode = 'auto'
  ): Promise<void> {
    const worker = await this.getOrCreateWorker(offset, preset, hwAccelMode);
    const available = this.resolveAvailableResolution(worker, resolution);
    if (worker.isLegReady(available)) return;
    return this.waitFor(worker, 'ready', available, offset);
  }

  /** Memoized worker creation per offset to prevent concurrent spawn races. */
  private getOrCreateWorker(
    offset: number,
    preset: FfmpegPreset,
    hwAccelMode: HwAccelMode
  ): Promise<TranscodeWorker> {
    const existing = this.variantGroups.get(offset);
    if (existing) return Promise.resolve(existing);

    let creation = this.creatingGroups.get(offset);
    if (!creation) {
      creation = this.createWorker(offset, preset, hwAccelMode).finally(() => {
        this.creatingGroups.delete(offset);
      });
      this.creatingGroups.set(offset, creation);
    }
    return creation;
  }

  private async createWorker(
    offset: number,
    preset: FfmpegPreset,
    hwAccelMode: HwAccelMode
  ): Promise<TranscodeWorker> {
    const { fps: sourceFps, width: sourceWidth, height: sourceHeight, audioBitrate } = await this.getVideoInfo();

    if (TranscodeWorker.liveProcessCount >= MAX_CONCURRENT_VARIANTS) {
      console.error(`[transcode] Refusing to spawn worker at offset ${offset}: MAX_CONCURRENT_VARIANTS (${MAX_CONCURRENT_VARIANTS}) reached`);
      throw new Error('Maximum concurrent transcode workers reached');
    }

    const variants = variantsForSource(this.policy.variants, sourceWidth, sourceHeight);

    const groupDir = path.join(this.outputBaseDir, offset.toString());
    const legSuffix = `ss-${offset}-${Math.random().toString(36).substring(2, 8)}`;
    const legDirs = new Map<Resolution, string>(
      variants.map(res => [res, path.join(groupDir, res, legSuffix)])
    );
    const audioLegDirs = new Map<string, string>(
      this.audioTracks.map(t => [t.id, path.join(groupDir, 'audio', t.id, legSuffix)])
    );

    const worker = new TranscodeWorker(variants, legDirs, this.sessionId, this.audioTracks, audioLegDirs);

    worker.on('ready', (res: Resolution) => console.log(`[transcode] [session ${this.sessionId}] Variant ${res}@${offset} ready`));
    worker.on('error', (err: Error) => {
      console.error(`[transcode] [session ${this.sessionId}] Worker @${offset} error:`, err.message, err.cause ?? '');
      // Drop dead worker so subsequent requests spawn a fresh worker.
      if (this.variantGroups.get(offset) === worker) {
        this.variantGroups.delete(offset);
        this.groupCreatedAt.delete(offset);
      }
      if (!this.variantGroups.has(offset)) TranscodeCache.cleanDirectory(groupDir);
      this.reportError(worker.resolutions[0], err);
    });
    worker.on('exit', (code: number | null) => {
      if (code === 0) console.log(`[transcode] [session ${this.sessionId}] Worker @${offset} completed`);
    });

    try {
      worker.start(this.inputPath, offset, preset, hwAccelMode, sourceFps, audioBitrate);
    } catch (err) {
      TranscodeCache.cleanDirectory(groupDir);
      throw err;
    }
    this.variantGroups.set(offset, worker);
    this.groupCreatedAt.set(offset, Date.now());
    return worker;
  }

  updatePlayhead(id: string, position: number): number | null {
    const now = Date.now();
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
        state.lastSeenAt = now;
      } else {
        this.playheads.set(id, { position, currentOffset: -1, lastSeenAt: now });
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
      state.lastSeenAt = now;
    } else {
      this.playheads.set(id, { position, currentOffset: maxOffset, lastSeenAt: now });
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
        const isLatest = Array.from(this.variantGroups.keys())
          .every((o) => (this.groupCreatedAt.get(o) || 0) <= createdAt);
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

    // Remove group immediately so new requests spawn a fresh worker.
    this.variantGroups.delete(offset);
    this.groupCreatedAt.delete(offset);
    clearTimeout(this.gcTimers.get(offset));
    this.gcTimers.delete(offset);

    console.log(`[transcode] Stopping worker for offset ${offset}`);
    await worker.stop();

    // Clean offset directory if no new group was created in the meantime.
    if (!this.variantGroups.has(offset)) {
      const groupDir = path.join(this.outputBaseDir, offset.toString());
      TranscodeCache.cleanDirectory(groupDir);
    }
  }

  async stop(): Promise<void> {
    clearInterval(this.staleSweepTimer);

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
      if (maxCoveredTime > worker.startPosition && newPosition >= worker.startPosition && newPosition <= maxCoveredTime) {
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
    return worker.legOutputDir(this.resolveAvailableResolution(worker, resolution));
  }

  /** Ensures an audio track's HLS output is ready. */
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
    return this.waitFor(worker, 'audio-ready', trackId, offset);
  }

  getAudioOutputDir(trackId: string, offset: number = 0): string {
    const worker = this.variantGroups.get(offset);
    if (!worker) throw new Error(`Worker not found for offset ${offset}`);
    return worker.audioLegOutputDir(trackId);
  }

  getPlayheadOffset(playheadId: string): number | undefined {
    const offset = this.playheads.get(playheadId)?.currentOffset;
    return offset !== undefined && offset >= 0 ? offset : undefined;
  }
}
