import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import path from 'path';
import { FfmpegPreset, HwAccelMode } from '../config/settings';
import { Resolution, HardwareEncoder, AudioTrackDescriptor } from '../types';
import {
  RESOLUTION_PRESETS,
  SEGMENT_DURATION,
  FFMPEG_PATH,
  VIDEO_CODEC,
  CACHE_SUSPEND_AHEAD_SECONDS,
  CACHE_RESUME_AHEAD_SECONDS,
} from '../config/config';
import { getDetectedHardwareEncoder, downgradeToCpu } from '../ffmpeg/hwaccel';
import { TranscodeCache } from '../fs/cache';
import { appendAudioTrackHlsOutput, buildHlsMuxArgs } from '../ffmpeg/hlsArgs';
import { startSegmentReadyWatcher } from '../fs/readyWatcher';

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

/** Manages a shared FFmpeg process encoding all configured resolutions via filter_complex split. */
export class TranscodeWorker extends EventEmitter {
  public readonly resolutions: Resolution[];
  public readonly sessionId: string;
  public readonly audioTracks: AudioTrackDescriptor[];
  /** Enables separate audio-only HLS outputs when multiple audio tracks exist. */
  public readonly hasSeparateAudio: boolean;
  /** Omits audio mapping options when zero audio tracks are present in source. */
  public readonly hasMuxedAudio: boolean;

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
    this.hasMuxedAudio = audioTracks.length === 1;
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

    // Decode and split happen once; per-leg scaling is performed within filter_complex.
    const filterParts = [`[0:v]split=${this.resolutions.length}${splitLabels.map(l => `[${l}]`).join('')}`];
    this.resolutions.forEach((res, i) => {
      const preset = RESOLUTION_PRESETS[res];
      const scaleFilter = `scale=${preset.width}:${preset.height}:force_original_aspect_ratio=decrease,pad=${preset.width}:${preset.height}:(ow-iw)/2:(oh-ih)/2,format=yuv420p`;
      const hwSuffix = (hw === 'vaapi' || hw === 'qsv') ? ',format=nv12,hwupload' : '';
      filterParts.push(`[${splitLabels[i]}]${scaleFilter}${hwSuffix}[${outLabels[i]}]`);
    });

    // Use encoder-native -g based on source FPS for segment-aligned keyframes.
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
        // Audio is demuxed into sibling HLS outputs when multiple tracks exist.
        ...(this.hasMuxedAudio ? ['-map', '0:a'] : []),
        ...videoArgs,
        '-b:v', preset.videoBitrate,
        '-maxrate', preset.maxRate,
        '-bufsize', preset.bufSize,

        ...(this.hasMuxedAudio ? ['-c:a', 'aac', '-b:a', preset.audioBitrate, '-ac', '2'] : []),

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
      stdio: ['ignore', 'ignore', 'pipe'],
    });

    this.process = proc;
    this._isRunning = true;

    proc.stderr?.on('data', (data: Buffer) => {
      const line = data.toString().trim();
      if (line) {
        if (line.toLowerCase().includes('error') || line.toLowerCase().includes('fatal')) {
          console.error(`[transcode] worker [${this.resolutions.join(',')}] error: ${line}`);
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

      // Mark leg ready on exit if segments exist; flag starved legs on unexpected exit.
      let anyLegStarved = false;
      for (const res of this.resolutions) {
        const leg = this.legs.get(res)!;
        if (!leg.isReady) {
          const tsCount = TranscodeCache.getSegmentCount(this.legOutputDir(res));
          if (tsCount > 0 && (code === 0 || this.stopRequested)) {
            leg.isReady = true;
            this.emit('ready', res);
          } else if (!this.stopRequested) {
            anyLegStarved = true;
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
            } else if (!this.stopRequested) {
              anyLegStarved = true;
            }
          }
        }
      }

      this.stopWatchers();
      // FFmpeg traps SIGTERM to flush segments and exit cleanly.
      if (!this.stopRequested && (anyLegStarved || (code !== 0 && signal !== 'SIGTERM'))) {
        this.handleFailure(hw, new Error(`FFmpeg exited with code ${code}, signal ${signal}, produced no output for one or more legs`));
        return;
      }
      this.emit('exit', code, signal);
    });

    this.watchSegments();
  }

  /** Fall back to CPU encoding once if hardware encoding fails before any leg is ready. */
  private handleFailure(hw: HardwareEncoder | null, err: Error): void {
    const anyLegReady = this.resolutions.some(res => this.legs.get(res)!.isReady);
    if (hw !== null && !anyLegReady && !this.hwFallbackAttempted) {
      this.hwFallbackAttempted = true;
      console.error(`[transcode] worker [${this.resolutions.join(',')}] hardware encoder (${hw}) failed, falling back to CPU:`, err.message);
      // Downgrade shared detection cache so subsequent workers skip hardware encoder.
      downgradeToCpu();
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

        // SIGCONT is required to process SIGTERM if suspended.
        if (this._isSuspended) {
          this.process.kill('SIGCONT');
        }
        this.process.kill('SIGTERM');

        // Force kill if FFmpeg hangs for more than 3 seconds.
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

  /** Suspend/resume the shared process based on the most-behind leg's progress. */
  manageCache(currentPlayhead: number): void {
    if (!this.resolutions.some(res => this.legs.get(res)!.isReady)) return;

    try {
      if (this.process && this._isRunning) {
        const minNewestSegmentTime = Math.min(...this.resolutions.map(res => this.legs.get(res)!.newestSegmentTime));
        const aheadBy = minNewestSegmentTime - currentPlayhead;

        if (aheadBy > CACHE_SUSPEND_AHEAD_SECONDS && !this._isSuspended) {
          console.log(`[transcode] [session ${this.sessionId}] worker [${this.resolutions.join(',')}] suspending FFmpeg (ahead by ${aheadBy.toFixed(1)}s)`);
          this.process.kill('SIGSTOP');
          this._isSuspended = true;
        } else if (aheadBy < CACHE_RESUME_AHEAD_SECONDS && this._isSuspended) {
          console.log(`[transcode] [session ${this.sessionId}] worker [${this.resolutions.join(',')}] resuming FFmpeg (ahead by ${aheadBy.toFixed(1)}s)`);
          this.process.kill('SIGCONT');
          this._isSuspended = false;
        }
      }
    } catch (err) {
      console.error(`[transcode] [session ${this.sessionId}] Error managing cache for worker [${this.resolutions.join(',')}]:`, err);
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
