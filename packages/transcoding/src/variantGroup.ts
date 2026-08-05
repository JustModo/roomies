import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import path from 'path';
import { FfmpegPreset, HwAccelMode } from './settings';
import { Resolution, HardwareEncoder, AudioTrackDescriptor } from './types';
import {
  RESOLUTION_PRESETS,
  SEGMENT_DURATION,
  FFMPEG_PATH,
  VIDEO_CODEC,
} from './config';
import { getDetectedHardwareEncoder, markHardwareEncoderFailed } from './hwaccel';
import { TranscodeCache } from './cache';
import { appendAudioTrackHlsOutput, buildHlsMuxArgs } from './hlsArgs';
import { startSegmentReadyWatcher } from './readyWatcher';

/** Maps the software x264-style preset name to the closest NVENC preset. */
const NVENC_PRESET_MAP: Record<FfmpegPreset, string> = {
  ultrafast: 'p1',
  veryfast: 'p2',
  fast: 'p3',
  medium: 'p4',
  slow: 'p6',
};

interface LegState {
  isReady: boolean;
  newestSegmentTime: number;
  maxCoveredTime: number;
}

/**
 * Manages one shared FFmpeg process that decodes the source once and encodes N resolution
 * outputs via a `-filter_complex split` graph, instead of N fully independent processes each
 * redundantly decoding the same frames (see TranscodeVariant, used for async sessions where
 * legs need independent per-resolution SIGSTOP throttling).
 *
 * NOTE: A fatal error in any one leg's encode aborts the whole shared process (it's one
 * ffmpeg invocation), so a 1080p-only failure also kills 360p/720p. Acceptable here because
 * this class is only used for sync-scope groups, which always request all resolutions
 * together anyway (see TranscodeSession.useGroupedVariants) — a partially-broken sync group
 * is already a degraded experience, and the existing hw-fallback-to-CPU retry (handleFailure)
 * covers the common failure mode (hardware encoder issues before anything is ready).
 */
export class TranscodeVariantGroup extends EventEmitter {
  public readonly resolutions: Resolution[];
  public readonly sessionId: string;
  public readonly audioTracks: AudioTrackDescriptor[];
  /** Only when there's a genuine choice do we pay for separate audio-only HLS outputs;
   *  a single audio track keeps today's behavior (muxed into each resolution, zero extra cost). */
  public readonly hasSeparateAudio: boolean;

  private readonly legDirs: Map<Resolution, string>;
  private readonly legs: Map<Resolution, LegState>;
  private readonly audioLegDirs: Map<string, string>;
  private readonly audioLegs: Map<string, LegState>;

  private process: ChildProcess | null = null;
  private stopReadyWatcher: (() => void) | null = null;
  private _isRunning = false;
  private _isSuspended = false;
  private _startPosition: number = 0;
  private preset: FfmpegPreset = 'veryfast';
  private hwAccelMode: HwAccelMode = 'auto';
  private inputPath: string = '';
  private hwFallbackAttempted = false;
  private sourceFps: number = 24;
  private stopRequested = false;
  private stopPromise: Promise<void> | null = null;

  constructor(
    resolutions: Resolution[],
    legDirs: Map<Resolution, string>,
    sessionId: string,
    audioTracks: AudioTrackDescriptor[] = [],
    audioLegDirs: Map<string, string> = new Map()
  ) {
    super();
    this.setMaxListeners(50);
    this.resolutions = resolutions;
    this.legDirs = legDirs;
    this.sessionId = sessionId;
    this.legs = new Map(resolutions.map(res => [res, { isReady: false, newestSegmentTime: 0, maxCoveredTime: 0 }]));
    this.audioTracks = audioTracks;
    this.hasSeparateAudio = audioTracks.length > 1;
    this.audioLegDirs = audioLegDirs;
    this.audioLegs = new Map(audioTracks.map(t => [t.id, { isReady: false, newestSegmentTime: 0, maxCoveredTime: 0 }]));
  }

  get isRunning(): boolean {
    return this._isRunning;
  }

  get startPosition(): number {
    return this._startPosition;
  }

  legOutputDir(resolution: Resolution): string {
    const dir = this.legDirs.get(resolution);
    if (!dir) throw new Error(`No output directory registered for resolution ${resolution}`);
    return dir;
  }

  isLegReady(resolution: Resolution): boolean {
    return this.legs.get(resolution)?.isReady ?? false;
  }

  legMaxCoveredTime(resolution: Resolution): number {
    return this.legs.get(resolution)?.maxCoveredTime ?? 0;
  }

  /** A view over one resolution leg, shaped like TranscodeVariant so TranscodeSession's
   *  existing per-offset-group bookkeeping (Map<Resolution, ...>) doesn't need to branch. */
  getLeg(resolution: Resolution): GroupedVariantLeg {
    return new GroupedVariantLeg(this, resolution);
  }

  audioLegOutputDir(trackId: string): string {
    const dir = this.audioLegDirs.get(trackId);
    if (!dir) throw new Error(`No output directory registered for audio track ${trackId}`);
    return dir;
  }

  isAudioLegReady(trackId: string): boolean {
    return this.audioLegs.get(trackId)?.isReady ?? false;
  }

  audioLegMaxCoveredTime(trackId: string): number {
    return this.audioLegs.get(trackId)?.maxCoveredTime ?? 0;
  }

  /** A view over one audio track leg, shaped like GroupedVariantLeg. */
  getAudioLeg(trackId: string): GroupedAudioLeg {
    return new GroupedAudioLeg(this, trackId);
  }

  start(
    inputPath: string,
    startPosition: number = 0,
    preset: FfmpegPreset = 'veryfast',
    hwAccelMode: HwAccelMode = 'auto',
    sourceFps: number = 24
  ): void {
    if (this._isRunning) return;
    this.inputPath = inputPath;
    this._startPosition = startPosition;
    this.preset = preset;
    this.hwAccelMode = hwAccelMode;
    this.sourceFps = sourceFps;

    this.spawnProcess(this.shouldUseHardware());
  }

  private shouldUseHardware(): HardwareEncoder | null {
    if (this.hwAccelMode !== 'auto') return null;
    const detected = getDetectedHardwareEncoder();
    return detected === 'cpu' ? null : detected;
  }

  private buildArgs(hw: HardwareEncoder | null): string[] {
    const splitLabels = this.resolutions.map((_, i) => `v${i}`);
    const outLabels = this.resolutions.map((_, i) => `o${i}`);

    // NOTE: decode + split happen once; per-leg scale (and, for vaapi/qsv, the hwupload)
    // must live inside this filter_complex graph — a labeled complex-filter output can't
    // also go through a separate simple `-vf` after `-map`, unlike the single-output case.
    const filterParts = [`[0:v]split=${this.resolutions.length}${splitLabels.map(l => `[${l}]`).join('')}`];
    this.resolutions.forEach((res, i) => {
      const preset = RESOLUTION_PRESETS[res];
      const scaleFilter = `scale=${preset.width}:${preset.height}:force_original_aspect_ratio=decrease,pad=${preset.width}:${preset.height}:(ow-iw)/2:(oh-ih)/2,format=yuv420p`;
      const hwSuffix = (hw === 'vaapi' || hw === 'qsv') ? ',format=nv12,hwupload' : '';
      filterParts.push(`[${splitLabels[i]}]${scaleFilter}${hwSuffix}[${outLabels[i]}]`);
    });

    // WHY: Use encoder-native -g instead of filtergraph force_key_frames to save CPU.
    // GOP size is derived from the probed source fps so keyframes land on segment boundaries.
    const gopSize = Math.round(SEGMENT_DURATION * this.sourceFps);

    const outputArgs: string[] = [];
    this.resolutions.forEach((res, i) => {
      const preset = RESOLUTION_PRESETS[res];
      const dir = this.legOutputDir(res);
      const playlistPath = path.join(dir, 'stream.m3u8');
      const segmentPattern = path.join(dir, 'seg_%05d.ts');

      let videoArgs: string[];
      if (hw === 'vaapi' || hw === 'qsv') {
        videoArgs = ['-vaapi_device', '/dev/dri/renderD128', '-c:v', 'h264_vaapi', '-g', String(gopSize)];
      } else if (hw === 'nvenc') {
        videoArgs = ['-c:v', 'h264_nvenc', '-preset', NVENC_PRESET_MAP[this.preset], '-g', String(gopSize)];
      } else {
        videoArgs = [
          '-c:v', VIDEO_CODEC,
          '-preset', this.preset,
          '-tune', 'zerolatency',
          '-g', String(gopSize),
          '-keyint_min', String(gopSize),
        ];
      }

      outputArgs.push(
        '-map', `[${outLabels[i]}]`,
        // NOTE: with >1 audio track, audio is demuxed into its own sibling HLS outputs below
        // (so hls.js can switch tracks without touching the video buffer); with 0-1 tracks,
        // audio stays muxed into every resolution exactly like before this feature existed.
        ...(this.hasSeparateAudio ? [] : ['-map', '0:a']),
        ...videoArgs,
        '-b:v', preset.videoBitrate,
        '-maxrate', preset.maxRate,
        '-bufsize', preset.bufSize,

        ...(this.hasSeparateAudio ? [] : ['-c:a', 'aac', '-b:a', preset.audioBitrate, '-ac', '2']),

        ...buildHlsMuxArgs(segmentPattern),
        playlistPath,
      );
    });

    if (this.hasSeparateAudio) {
      for (const track of this.audioTracks) {
        const dir = this.audioLegOutputDir(track.id);
        appendAudioTrackHlsOutput(
          outputArgs,
          track.streamIndex,
          path.join(dir, 'playlist.m3u8'),
          path.join(dir, 'audio_%05d.ts'),
        );
      }
    }

    return [
      ...(this.startPosition > 0 ? ['-ss', this.startPosition.toString()] : []),
      '-i', this.inputPath,
      ...(this.startPosition > 0 ? ['-avoid_negative_ts', 'make_zero'] : []),
      '-threads', '0',
      '-sc_threshold', '0',
      '-filter_complex', filterParts.join(';'),
      ...outputArgs,
    ];
  }

  private spawnProcess(hw: HardwareEncoder | null): void {
    for (const res of this.resolutions) {
      TranscodeCache.ensureDirectory(this.legOutputDir(res));
    }
    if (this.hasSeparateAudio) {
      for (const track of this.audioTracks) {
        TranscodeCache.ensureDirectory(this.audioLegOutputDir(track.id));
      }
    }

    const args = this.buildArgs(hw);
    const proc = spawn(FFMPEG_PATH, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    this.process = proc;
    this._isRunning = true;

    proc.stderr?.on('data', (data: Buffer) => {
      const line = data.toString().trim();
      if (line) {
        if (line.toLowerCase().includes('error') || line.toLowerCase().includes('fatal')) {
          console.error(`[transcode] variant group [${this.resolutions.join(',')}] error: ${line}`);
        }
      }
    });

    proc.on('error', (err) => {
      this._isRunning = false;
      this.stopWatchers();
      this.handleFailure(hw, err);
    });

    proc.on('exit', (code, signal) => {
      this._isRunning = false;

      // NOTE: Mirrors TranscodeVariant's exit-time ready check — if the process exits after
      // producing at least one segment for a leg that hadn't been marked ready yet (e.g. a
      // very short source), mark it ready so callers awaiting `once('ready')` aren't stuck.
      for (const res of this.resolutions) {
        const leg = this.legs.get(res)!;
        if (!leg.isReady) {
          const tsCount = TranscodeCache.getSegmentCount(this.legOutputDir(res));
          if (tsCount > 0 && (code === 0 || this.stopRequested)) {
            leg.isReady = true;
            this.emit('ready', res);
          }
        }
      }
      if (this.hasSeparateAudio) {
        for (const track of this.audioTracks) {
          const leg = this.audioLegs.get(track.id)!;
          if (!leg.isReady) {
            const tsCount = TranscodeCache.getSegmentCount(this.audioLegOutputDir(track.id));
            if (tsCount > 0 && (code === 0 || this.stopRequested)) {
              leg.isReady = true;
              this.emit('audio-ready', track.id);
            }
          }
        }
      }

      this.stopWatchers();
      // NOTE: FFmpeg traps SIGTERM to shut down gracefully (flushing the final segment/playlist)
      // and then exits with its own code (observed: 255) rather than being reported as killed by
      // signal — so `signal === 'SIGTERM'` alone doesn't reliably detect an intentional stop.
      if (!this.stopRequested && code !== 0 && signal !== 'SIGTERM') {
        this.handleFailure(hw, new Error(`FFmpeg exited with code ${code}, signal ${signal}`));
        return;
      }
      this.emit('exit', code, signal);
    });

    this.watchSegments();
  }

  /** NOTE: Fall back to CPU encoding once if hardware encoding fails before ANY leg becomes ready. */
  private handleFailure(hw: HardwareEncoder | null, err: Error): void {
    const anyLegReady = this.resolutions.some(res => this.legs.get(res)!.isReady);
    if (hw !== null && !anyLegReady && !this.hwFallbackAttempted) {
      this.hwFallbackAttempted = true;
      markHardwareEncoderFailed();
      console.error(`[transcode] variant group [${this.resolutions.join(',')}] hardware encoder (${hw}) failed, falling back to CPU:`, err.message);
      this.spawnProcess(null);
      return;
    }
    this.emit('error', err);
  }

  async stop(): Promise<void> {
    if (this.stopPromise) return this.stopPromise;

    this.stopPromise = (async () => {
      this.stopWatchers();
      this.stopRequested = true;

      if (this.process && this._isRunning) {
        const exitPromise = new Promise<void>((resolve) => {
          const onExit = () => {
            this.removeListener('exit', onExit);
            resolve();
          };
          this.on('exit', onExit);
        });

        // NOTE: SIGCONT is required to process SIGTERM if suspended.
        if (this._isSuspended) {
          this.process.kill('SIGCONT');
        }
        this.process.kill('SIGTERM');

        // NOTE: Force kill if FFmpeg hangs for more than 3 seconds
        const timeout = setTimeout(() => {
          if (this.process) this.process.kill('SIGKILL');
        }, 3000);

        await exitPromise;
        clearTimeout(timeout);

        this.process = null;
        this._isRunning = false;
        this._isSuspended = false;
      }
    })();

    return this.stopPromise;
  }

  /** NOTE: Suspend/resume the whole shared process based on the MOST-BEHIND leg's progress,
   *  so we never suspend while any leg still needs to catch up. Sync-scope groups (the only
   *  caller of this class) already always treat every resolution as "actively watched"
   *  (see TranscodeSession.updateVariantCache), so there's no per-leg throttling to preserve. */
  manageCache(currentPlayhead: number): void {
    if (!this.resolutions.some(res => this.legs.get(res)!.isReady)) return;

    try {
      if (this.process && this._isRunning) {
        const minNewestSegmentTime = Math.min(...this.resolutions.map(res => this.legs.get(res)!.newestSegmentTime));
        const aheadBy = minNewestSegmentTime - currentPlayhead;

        if (aheadBy > 300 && !this._isSuspended) {
          console.log(`[transcode] [session ${this.sessionId}] variant group [${this.resolutions.join(',')}] suspending FFmpeg (ahead by ${aheadBy.toFixed(1)}s)`);
          this.process.kill('SIGSTOP');
          this._isSuspended = true;
        } else if (aheadBy < 60 && this._isSuspended) {
          console.log(`[transcode] [session ${this.sessionId}] variant group [${this.resolutions.join(',')}] resuming FFmpeg (ahead by ${aheadBy.toFixed(1)}s)`);
          this.process.kill('SIGCONT');
          this._isSuspended = false;
        }
      }
    } catch (err) {
      console.error(`[transcode] [session ${this.sessionId}] Error managing cache for group [${this.resolutions.join(',')}]:`, err);
    }
  }

  /** Watches every leg's output directory for segment files via shared readyWatcher. */
  private watchSegments(): void {
    const targets = [
      ...this.resolutions.map((res) => ({
        dir: this.legOutputDir(res),
        isReady: () => this.legs.get(res)?.isReady ?? false,
        onReady: () => {
          const leg = this.legs.get(res)!;
          leg.isReady = true;
          this.emit('ready', res);
        },
        onStats: ({ newestSegmentTime, maxCoveredTime }: { newestSegmentTime: number; maxCoveredTime: number }) => {
          const leg = this.legs.get(res)!;
          leg.newestSegmentTime = newestSegmentTime;
          leg.maxCoveredTime = maxCoveredTime;
        },
      })),
      ...(this.hasSeparateAudio
        ? this.audioTracks.map((track) => ({
            dir: this.audioLegOutputDir(track.id),
            isReady: () => this.audioLegs.get(track.id)?.isReady ?? false,
            onReady: () => {
              const leg = this.audioLegs.get(track.id)!;
              leg.isReady = true;
              this.emit('audio-ready', track.id);
            },
            onStats: ({ newestSegmentTime, maxCoveredTime }: { newestSegmentTime: number; maxCoveredTime: number }) => {
              const leg = this.audioLegs.get(track.id)!;
              leg.newestSegmentTime = newestSegmentTime;
              leg.maxCoveredTime = maxCoveredTime;
            },
          }))
        : []),
    ];

    const watcher = startSegmentReadyWatcher({
      startPosition: this._startPosition,
      isRunning: () => this._isRunning,
      targets,
    });
    this.stopReadyWatcher = watcher.stop;
  }

  private stopWatchers(): void {
    if (this.stopReadyWatcher) {
      this.stopReadyWatcher();
      this.stopReadyWatcher = null;
    }
  }
}

/**
 * Per-resolution view of a TranscodeVariantGroup, shaped like TranscodeVariant so
 * TranscodeSession's existing Map<Resolution, TranscodeVariant>-based bookkeeping
 * (isPositionCovered, updateVariantCache, stopGroup, etc.) works against either without
 * branching on which one it holds.
 */
export class GroupedVariantLeg extends EventEmitter {
  public readonly resolution: Resolution;

  constructor(private readonly group: TranscodeVariantGroup, resolution: Resolution) {
    super();
    this.setMaxListeners(50);
    this.resolution = resolution;

    group.on('ready', (res: Resolution) => {
      if (res === this.resolution) this.emit('ready');
    });
    group.on('error', (err: Error) => this.emit('error', err));
    group.on('exit', (code: number | null, signal: NodeJS.Signals | null) => this.emit('exit', code, signal));
  }

  get outputDir(): string {
    return this.group.legOutputDir(this.resolution);
  }

  get isReady(): boolean {
    return this.group.isLegReady(this.resolution);
  }

  get startPosition(): number {
    return this.group.startPosition;
  }

  get maxCoveredTime(): number {
    return this.group.legMaxCoveredTime(this.resolution);
  }

  manageCache(currentPlayhead: number, _isActivelyWatched: boolean = true): void {
    // Group-level suspend/resume is computed once from all legs' progress (see
    // TranscodeVariantGroup.manageCache) — safe to call redundantly per leg since it's
    // idempotent (checks the suspended flag before re-issuing a signal). isActivelyWatched
    // is ignored: sync sessions (the only caller of grouped legs) always treat every
    // resolution as actively watched, see TranscodeSession.updateVariantCache.
    this.group.manageCache(currentPlayhead);
  }

  stop(): Promise<void> {
    // Whichever leg's stop() is called first tears down the whole shared process — safe to
    // call from multiple legs since TranscodeVariantGroup.stop() memoizes the in-flight promise.
    return this.group.stop();
  }
}

/**
 * Per-audio-track view of a TranscodeVariantGroup, analogous to GroupedVariantLeg but keyed
 * by track id instead of resolution. Only meaningful when group.hasSeparateAudio is true.
 */
export class GroupedAudioLeg extends EventEmitter {
  public readonly trackId: string;

  constructor(private readonly group: TranscodeVariantGroup, trackId: string) {
    super();
    this.setMaxListeners(50);
    this.trackId = trackId;

    group.on('audio-ready', (id: string) => {
      if (id === this.trackId) this.emit('ready');
    });
    group.on('error', (err: Error) => this.emit('error', err));
    group.on('exit', (code: number | null, signal: NodeJS.Signals | null) => this.emit('exit', code, signal));
  }

  get outputDir(): string {
    return this.group.audioLegOutputDir(this.trackId);
  }

  get isReady(): boolean {
    return this.group.isAudioLegReady(this.trackId);
  }

  get startPosition(): number {
    return this.group.startPosition;
  }

  get maxCoveredTime(): number {
    return this.group.audioLegMaxCoveredTime(this.trackId);
  }
}
