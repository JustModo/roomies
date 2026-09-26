import path from 'path';
import { READY_TIMEOUT_MS, PLAYHEAD_STALE_MS, RESOLUTION_PRESETS, SEGMENT_DURATION, SUPPORTED_RESOLUTIONS } from '../config/constants';
import { PlaybackPolicy, policyForSessionId, scaledResolution, variantsForSource } from '../config/policy';
import { SourceVideoInfo, getSourceVideoInfo } from '../ffmpeg/ffprobe';
import { ensureDirectory, removeDirectory } from '../fs/cache';
import { AudioTrackDescriptor, Resolution } from '../types';
import { TranscodeDeps } from './deps';
import { TranscodeWorker } from './worker';

export interface SessionSpec {
  sessionId: string;
  mediaFileId: string;
  inputPath: string;
  outputDir: string;
  audioTracks?: AudioTrackDescriptor[];
}

export interface PlayheadState {
  position: number;
  currentOffset: number;
  lastSeenAt: number;
}

/** A freshly created offset group is never collected before this age, so a seek can land on it. */
const GROUP_MIN_AGE_MS = 15000;

export class GroupStoppedError extends Error {
  constructor(offset: number) {
    super(`Offset group @${offset} was stopped`);
    this.name = 'GroupStoppedError';
  }
}

/** Aligns seek position to nearest segment boundary. */
export function getAlignedPosition(position: number): number {
  return Math.max(0, Math.floor(position / SEGMENT_DURATION) * SEGMENT_DURATION - SEGMENT_DURATION);
}

/** Manages all transcoding workers for a single media file, grouped by transcode offset. */
export class TranscodeSession {
  readonly sessionId: string;
  readonly mediaFileId: string;
  readonly inputPath: string;
  readonly outputBaseDir: string;
  readonly policy: PlaybackPolicy;
  readonly audioTracks: AudioTrackDescriptor[];

  // Map of offset -> the shared worker covering every configured resolution at that offset.
  private variantGroups = new Map<number, TranscodeWorker>();
  private creatingGroups = new Map<number, Promise<TranscodeWorker>>();
  private groupCreatedAt = new Map<number, number>();
  private gcTimers = new Map<number, NodeJS.Timeout>();
  private playheads = new Map<string, PlayheadState>();
  private videoInfoPromise: Promise<SourceVideoInfo> | null = null;
  private readonly staleSweepTimer: NodeJS.Timeout;

  constructor(
    private readonly deps: TranscodeDeps,
    spec: SessionSpec,
  ) {
    this.sessionId = spec.sessionId;
    this.mediaFileId = spec.mediaFileId;
    this.inputPath = spec.inputPath;
    this.outputBaseDir = spec.outputDir;
    this.audioTracks = spec.audioTracks ?? [];
    this.policy = policyForSessionId(spec.sessionId);

    ensureDirectory(this.outputBaseDir);
    // Sweep stale playheads that missed a removePlayhead call.
    this.staleSweepTimer = setInterval(() => this.sweepStalePlayheads(), PLAYHEAD_STALE_MS);
  }

  /** The rungs this session's workers will actually encode, after pruning any that would
   *  upscale the source. Reuses the memoized probe, so callers pay no extra ffprobe.
   *  The master playlist must advertise exactly this — advertising a rung that is never
   *  encoded makes the server serve a lower rung under its URL, and hls.js then ABR-switches
   *  between two levels that are the same stream, flushing the buffer on every switch. */
  async availableVariants(): Promise<{ resolution: Resolution; width: number; height: number }[]> {
    const { width, height } = await this.getVideoInfo();
    return this.encodedVariants(width, height).map((resolution) => ({
      resolution,
      ...scaledResolution(RESOLUTION_PRESETS[resolution], width, height),
    }));
  }

  async ensureVariantReady(resolution: Resolution, offset = 0): Promise<void> {
    const worker = await this.getOrCreateWorker(offset);
    const available = this.resolveAvailableResolution(worker, resolution);
    if (worker.isLegReady(available)) return;
    return this.waitFor(worker, 'ready', available, offset);
  }

  /** Ensures an audio track's HLS output is ready. */
  async ensureAudioTrackReady(trackId: string, offset = 0): Promise<void> {
    await this.ensureVariantReady(this.policy.variants[0], offset);
    const worker = this.requireWorker(offset);
    if (worker.isAudioLegReady(trackId)) return;
    return this.waitFor(worker, 'audio-ready', trackId, offset);
  }

  getVariantOutputDir(resolution: Resolution, offset: number): string {
    const worker = this.requireWorker(offset);
    return worker.legOutputDir(this.resolveAvailableResolution(worker, resolution));
  }

  getAudioOutputDir(trackId: string, offset = 0): string {
    return this.requireWorker(offset).audioLegOutputDir(trackId);
  }

  /** Records a viewer's position; returns the new offset when it moved onto a different covering group. */
  updatePlayhead(id: string, position: number): number | null {
    const now = Date.now();
    const state = this.playheads.get(id);
    const coveringOffsets = [...this.variantGroups.keys()].filter((offset) => this.isPositionCovered(position, offset));
    const maxOffset = Math.max(-1, ...coveringOffsets);

    if (!state) {
      this.playheads.set(id, { position, currentOffset: maxOffset, lastSeenAt: now });
    } else {
      state.position = position;
      state.lastSeenAt = now;
    }
    if (maxOffset === -1) return null;

    let swappedToOffset: number | null = state ? null : maxOffset;
    if (state && state.currentOffset !== maxOffset) {
      const oldOffset = state.currentOffset;
      this.deps.log.debug({ playhead: id, from: oldOffset, to: maxOffset }, 'Playhead shifted offset');
      state.currentOffset = maxOffset;
      swappedToOffset = maxOffset;
      this.cleanupOffsetIfEmpty(oldOffset);
    }

    this.updateVariantCache(maxOffset);
    return swappedToOffset;
  }

  removePlayhead(id: string): void {
    const state = this.playheads.get(id);
    if (!state) return;
    this.playheads.delete(id);
    this.cleanupOffsetIfEmpty(state.currentOffset);
  }

  getPlayheadOffset(playheadId: string): number | undefined {
    const offset = this.playheads.get(playheadId)?.currentOffset;
    return offset !== undefined && offset >= 0 ? offset : undefined;
  }

  isPositionCovered(position: number, offset: number): boolean {
    const worker = this.variantGroups.get(offset);
    if (!worker) return false;

    return worker.resolutions.some((res) => {
      const maxCoveredTime = worker.legMaxCoveredTime(res);
      return maxCoveredTime > worker.startPosition && position >= worker.startPosition && position <= maxCoveredTime;
    });
  }

  idleGroups(): { offset: number; createdAt: number }[] {
    const watched = new Set([...this.playheads.values()].map((ph) => ph.currentOffset));
    return [...this.variantGroups.keys()]
      .filter((offset) => !watched.has(offset))
      .map((offset) => ({ offset, createdAt: this.groupCreatedAt.get(offset) ?? 0 }));
  }

  stopIdleGroups(keepOffset: number): void {
    for (const { offset } of this.idleGroups()) {
      if (offset !== keepOffset) void this.stopGroup(offset);
    }
  }

  getCoveringOffset(position: number): number | null {
    return [...this.variantGroups.keys()].find((offset) => this.isPositionCovered(position, offset)) ?? null;
  }

  /** Reuses currentOffset if it covers the position, otherwise starts (and prewarms) a group at the aligned offset. */
  async seek(position: number, currentOffset: number, resolutionsToPrewarm: Resolution[] = this.policy.variants): Promise<number> {
    if (this.isPositionCovered(position, currentOffset)) {
      this.deps.log.debug({ position, offset: currentOffset }, 'Seek covered by current offset, reusing cache');
      return currentOffset;
    }

    const alignedPosition = getAlignedPosition(position);
    this.deps.log.info({ position, offset: currentOffset, alignedPosition }, 'Seek not covered, starting new variants');

    const results = await Promise.allSettled(resolutionsToPrewarm.map((res) => this.ensureVariantReady(res, alignedPosition)));
    results.forEach((result, i) => {
      if (result.status === 'fulfilled' || result.reason instanceof GroupStoppedError) return;
      this.deps.log.error({ err: result.reason, resolution: resolutionsToPrewarm[i], offset: alignedPosition }, 'Prewarm failed');
    });

    return alignedPosition;
  }

  async stopGroup(offset: number): Promise<void> {
    const worker = this.variantGroups.get(offset);
    if (!worker) return;

    // Remove group immediately so new requests spawn a fresh worker.
    this.forgetGroup(offset);
    clearTimeout(this.gcTimers.get(offset));
    this.gcTimers.delete(offset);

    this.deps.log.debug({ sessionId: this.sessionId, offset }, 'Stopping worker');
    await worker.stop();

    // Clean offset directory if no new group was created in the meantime.
    if (!this.variantGroups.has(offset)) removeDirectory(this.groupDir(offset), this.deps.log);
  }

  park(): void {
    this.playheads.clear();
    for (const timer of this.gcTimers.values()) clearTimeout(timer);
    this.gcTimers.clear();
    const newest = [...this.groupCreatedAt.entries()].reduce<[number, number] | null>((a, b) => (!a || b[1] > a[1] ? b : a), null)?.[0];
    for (const offset of [...this.variantGroups.keys()]) {
      if (offset !== newest) void this.stopGroup(offset);
    }
    if (newest !== undefined) this.variantGroups.get(newest)?.suspend();
  }

  async stop(): Promise<void> {
    clearInterval(this.staleSweepTimer);
    await Promise.all([...this.variantGroups.keys()].map((offset) => this.stopGroup(offset)));
    removeDirectory(this.outputBaseDir, this.deps.log);
  }

  private getVideoInfo(): Promise<SourceVideoInfo> {
    this.videoInfoPromise ??= getSourceVideoInfo(this.deps.options.ffprobePath, this.inputPath);
    return this.videoInfoPromise;
  }

  private encodedVariants(width: number, height: number): Resolution[] {
    const fitting = variantsForSource(this.policy.variants, width, height);
    return this.policy.ladderEnds && fitting.length > 2 ? [fitting[0], fitting[fitting.length - 1]] : fitting;
  }

  private requireWorker(offset: number): TranscodeWorker {
    const worker = this.variantGroups.get(offset);
    if (!worker) throw new Error(`Worker not found for offset ${offset}`);
    return worker;
  }

  private groupDir(offset: number): string {
    return path.join(this.outputBaseDir, offset.toString());
  }

  private forgetGroup(offset: number): void {
    this.variantGroups.delete(offset);
    this.groupCreatedAt.delete(offset);
  }

  /** Resolves a requested resolution to the nearest available worker resolution rung. */
  private resolveAvailableResolution(worker: TranscodeWorker, resolution: Resolution): Resolution {
    if (worker.resolutions.includes(resolution)) return resolution;
    const lower = SUPPORTED_RESOLUTIONS.slice(0, SUPPORTED_RESOLUTIONS.indexOf(resolution)).reverse();
    return lower.find((res) => worker.resolutions.includes(res)) ?? worker.resolutions[0];
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
        reject(worker.isStopped ? new GroupStoppedError(offset) : new Error(`Worker @${offset} exited before ${key} was ready`));
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

  /** Memoized worker creation per offset to prevent concurrent spawn races. */
  private getOrCreateWorker(offset: number): Promise<TranscodeWorker> {
    const existing = this.variantGroups.get(offset);
    if (existing) return Promise.resolve(existing);

    let creation = this.creatingGroups.get(offset);
    if (!creation) {
      creation = this.createWorker(offset).finally(() => this.creatingGroups.delete(offset));
      this.creatingGroups.set(offset, creation);
    }
    return creation;
  }

  private async createWorker(offset: number): Promise<TranscodeWorker> {
    const { fps, width, height, audioBitrate } = await this.getVideoInfo();

    const { slots, log } = this.deps;
    if (slots.isFull) await this.deps.evictIdleGroup?.();
    if (slots.isFull) {
      log.error({ offset, max: slots.max }, 'Refusing to spawn worker: concurrent worker cap reached');
      throw new Error('Maximum concurrent transcode workers reached');
    }

    const variants = this.encodedVariants(width, height);
    const groupDir = this.groupDir(offset);
    const legSuffix = `ss-${offset}-${Math.random().toString(36).substring(2, 8)}`;
    const worker = new TranscodeWorker(this.deps, {
      sessionId: this.sessionId,
      resolutions: variants,
      legDirs: new Map(variants.map((res) => [res, path.join(groupDir, res, legSuffix)])),
      audioTracks: this.audioTracks,
      audioLegDirs: new Map(this.audioTracks.map((t) => [t.id, path.join(groupDir, 'audio', t.id, legSuffix)])),
    });

    const context = { sessionId: this.sessionId, offset };
    worker.on('ready', (resolution: Resolution) => log.debug({ ...context, resolution }, 'Variant ready'));
    worker.on('error', (err: Error) => {
      log.error({ ...context, err, cause: err.cause }, 'Worker error');
      // Drop dead worker so subsequent requests spawn a fresh worker.
      if (this.variantGroups.get(offset) === worker) this.forgetGroup(offset);
      if (!this.variantGroups.has(offset)) removeDirectory(groupDir, log);
    });
    worker.on('exit', (code: number | null) => {
      if (code === 0) log.debug(context, 'Worker completed');
    });

    try {
      worker.start({ inputPath: this.inputPath, startPosition: offset, sourceFps: fps, sourceAudioBitrate: audioBitrate });
    } catch (err) {
      removeDirectory(groupDir, log);
      throw err;
    }
    this.variantGroups.set(offset, worker);
    this.groupCreatedAt.set(offset, Date.now());
    return worker;
  }

  private sweepStalePlayheads(): void {
    const now = Date.now();
    for (const [id, state] of this.playheads) {
      if (now - state.lastSeenAt > PLAYHEAD_STALE_MS) {
        this.deps.log.info({ playhead: id }, 'Playhead went stale, removing');
        this.removePlayhead(id);
      }
    }
  }

  private cleanupOffsetIfEmpty(offset: number): void {
    if (offset === -1 || !this.variantGroups.has(offset)) return;

    const hasPlayheads = [...this.playheads.values()].some((ph) => ph.currentOffset === offset);
    if (hasPlayheads) {
      this.updateVariantCache(offset);
      return;
    }

    const createdAt = this.groupCreatedAt.get(offset) || 0;
    const age = Date.now() - createdAt;
    if (age < GROUP_MIN_AGE_MS) {
      clearTimeout(this.gcTimers.get(offset));
      this.gcTimers.set(
        offset,
        setTimeout(
          () => {
            this.gcTimers.delete(offset);
            this.cleanupOffsetIfEmpty(offset);
          },
          GROUP_MIN_AGE_MS - age + 100,
        ),
      );
      return;
    }

    if (this.policy.keepLatestEmptyOffset) {
      const isLatest = [...this.variantGroups.keys()].every((o) => (this.groupCreatedAt.get(o) || 0) <= createdAt);
      if (isLatest) {
        this.deps.log.debug({ sessionId: this.sessionId, offset }, 'Keeping latest offset group active');
        return;
      }
    }
    this.deps.log.info({ sessionId: this.sessionId, offset }, 'Garbage collecting unused offset group');
    this.stopGroup(offset);
  }

  private updateVariantCache(offset: number): void {
    const worker = this.variantGroups.get(offset);
    const positions = [...this.playheads.values()].filter((ph) => ph.currentOffset === offset).map((ph) => ph.position);
    if (worker && positions.length > 0) worker.manageCache(Math.max(...positions));
  }
}
