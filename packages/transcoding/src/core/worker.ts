import { ChildProcess, spawn } from 'child_process';
import { EventEmitter } from 'events';
import path from 'path';
import {
  CACHE_RESUME_AHEAD_SECONDS,
  CACHE_SUSPEND_AHEAD_SECONDS,
  LOOK_AHEAD_SEGMENTS,
  RENDER_NODE,
  RESOLUTION_PRESETS,
  SEGMENT_DURATION,
} from '../config/constants';
import { AUDIO_TIMESTAMP_FIX, appendAudioTrackHlsOutput, audioBitrateFor, buildHlsMuxArgs } from '../ffmpeg/hlsArgs';
import { countSegments, ensureDirectory } from '../fs/cache';
import { AudioTrackDescriptor, FfmpegPreset, HardwareEncoder, Resolution } from '../types';
import { TranscodeDeps } from './deps';

export interface WorkerSpec {
  sessionId: string;
  resolutions: Resolution[];
  legDirs: Map<Resolution, string>;
  audioTracks?: AudioTrackDescriptor[];
  audioLegDirs?: Map<string, string>;
}

export interface WorkerInput {
  inputPath: string;
  startPosition?: number;
  sourceFps?: number;
  sourceAudioBitrate?: number;
}

/** One HLS output of the shared process: a video rung, or a demuxed audio track. */
interface Leg {
  key: string;
  dir: string;
  prefix: 'seg' | 'audio';
  event: 'ready' | 'audio-ready';
  isReady: boolean;
  segmentCount: number;
}

/** Maps the software x264-style preset name to the closest NVENC preset. */
const NVENC_PRESET_MAP: Record<FfmpegPreset, string> = {
  ultrafast: 'p1',
  veryfast: 'p2',
  fast: 'p3',
  medium: 'p4',
  slow: 'p6',
};

const QSV_PRESET_MAP: Record<FfmpegPreset, string> = {
  ultrafast: 'veryfast',
  veryfast: 'veryfast',
  fast: 'fast',
  medium: 'medium',
  slow: 'slow',
};

const STDERR_TAIL_LINES = 50;
const STOP_TIMEOUT_MS = 3000;
const WARMUP_POLL_MS = 300;
const READY_POLL_MS = 1000;

const createLeg = (key: string, dir: string, prefix: Leg['prefix'], event: Leg['event']): Leg => ({
  key,
  dir,
  prefix,
  event,
  isReady: false,
  segmentCount: 0,
});

/**
 * Manages a shared FFmpeg process encoding all configured resolutions via filter_complex split.
 * Emits 'ready' (resolution) / 'audio-ready' (trackId) per leg, 'error' and 'exit'.
 */
export class TranscodeWorker extends EventEmitter {
  readonly sessionId: string;
  readonly resolutions: Resolution[];
  readonly audioTracks: AudioTrackDescriptor[];
  /** Enables separate audio-only HLS outputs when multiple audio tracks exist. */
  readonly hasSeparateAudio: boolean;

  private readonly legs: Map<Resolution, Leg>;
  private readonly audioLegs: Map<string, Leg>;

  private input: WorkerInput & { startPosition: number; sourceFps: number } = { inputPath: '', startPosition: 0, sourceFps: 24 };
  private process: ChildProcess | null = null;
  private segmentPollTimer: NodeJS.Timeout | undefined;
  private running = false;
  private suspended = false;
  private hwFallbackAttempted = false;
  private stopRequested = false;
  private stopPromise: Promise<void> | null = null;
  private stderrTail: string[] = [];

  constructor(
    private readonly deps: TranscodeDeps,
    spec: WorkerSpec,
  ) {
    super();
    this.setMaxListeners(50);
    this.sessionId = spec.sessionId;
    this.resolutions = spec.resolutions;
    this.audioTracks = spec.audioTracks ?? [];
    this.hasSeparateAudio = this.audioTracks.length > 1;
    this.legs = new Map(spec.resolutions.map((res) => [res, createLeg(res, spec.legDirs.get(res) ?? '', 'seg', 'ready')]));
    this.audioLegs = new Map(
      this.hasSeparateAudio
        ? this.audioTracks.map((t) => [t.id, createLeg(t.id, spec.audioLegDirs?.get(t.id) ?? '', 'audio', 'audio-ready')])
        : [],
    );
  }

  get isStopped(): boolean {
    return this.stopRequested;
  }

  get startPosition(): number {
    return this.input.startPosition;
  }

  legOutputDir(resolution: Resolution): string {
    const dir = this.legs.get(resolution)?.dir;
    if (!dir) throw new Error(`No output directory registered for resolution ${resolution}`);
    return dir;
  }

  isLegReady(resolution: Resolution): boolean {
    return this.legs.get(resolution)?.isReady ?? false;
  }

  legMaxCoveredTime(resolution: Resolution): number {
    return this.input.startPosition + (this.legs.get(resolution)?.segmentCount ?? 0) * SEGMENT_DURATION;
  }

  audioLegOutputDir(trackId: string): string {
    const dir = this.audioLegs.get(trackId)?.dir;
    if (!dir) throw new Error(`No output directory registered for audio track ${trackId}`);
    return dir;
  }

  isAudioLegReady(trackId: string): boolean {
    return this.audioLegs.get(trackId)?.isReady ?? false;
  }

  start(input: WorkerInput): void {
    if (this.running) return;
    this.input = { ...input, startPosition: input.startPosition ?? 0, sourceFps: input.sourceFps ?? 24 };
    this.spawnProcess(this.hardwareEncoder());
  }

  async stop(): Promise<void> {
    this.stopPromise ??= this.terminate();
    return this.stopPromise;
  }

  suspend(): void {
    if (!this.process || !this.running || this.suspended || ![...this.legs.values()].some((leg) => leg.isReady)) return;
    this.process.kill('SIGSTOP');
    this.suspended = true;
  }

  /** Suspend/resume the shared process based on the most-behind leg's progress. */
  manageCache(currentPlayhead: number): void {
    const videoLegs = [...this.legs.values()];
    if (!this.process || !this.running || !videoLegs.some((leg) => leg.isReady)) return;

    const newestSegmentTime = this.input.startPosition + (Math.min(...videoLegs.map((leg) => leg.segmentCount)) - 1) * SEGMENT_DURATION;
    const aheadBy = newestSegmentTime - currentPlayhead;
    const logContext = { sessionId: this.sessionId, resolutions: this.resolutions, aheadBy: Math.round(aheadBy) };
    try {
      if (aheadBy > CACHE_SUSPEND_AHEAD_SECONDS && !this.suspended) {
        this.deps.log.debug(logContext, 'Suspending FFmpeg');
        this.process.kill('SIGSTOP');
        this.suspended = true;
      } else if (aheadBy < CACHE_RESUME_AHEAD_SECONDS && this.suspended) {
        this.deps.log.debug(logContext, 'Resuming FFmpeg');
        this.process.kill('SIGCONT');
        this.suspended = false;
      }
    } catch (err) {
      this.deps.log.error({ err, ...logContext }, 'Error managing worker cache');
    }
  }

  private allLegs(): Leg[] {
    return [...this.legs.values(), ...this.audioLegs.values()];
  }

  private markReady(leg: Leg): void {
    leg.isReady = true;
    this.emit(leg.event, leg.key);
  }

  private hardwareEncoder(): HardwareEncoder | null {
    if (this.deps.options.hwAccelMode !== 'auto') return null;
    const detected = this.deps.encoder.current;
    return detected === 'cpu' ? null : detected;
  }

  private videoCodecArgs(hw: HardwareEncoder | null): string[] {
    const { preset, videoCodec } = this.deps.options;
    // Use encoder-native -g based on source FPS for segment-aligned keyframes.
    const gop = String(Math.round(SEGMENT_DURATION * this.input.sourceFps));
    // -g alone is advisory: x264 clamps keyint_min to keyint/2 and hardware encoders ignore
    // sc_threshold, so scene cuts still emit IDRs and segments drift (0.4s-3.9s observed).
    const forceKeyframes = ['-force_key_frames', `expr:gte(t,n_forced*${SEGMENT_DURATION})`];

    switch (hw) {
      case 'vaapi':
        return ['-c:v', 'h264_vaapi', '-g', gop, ...forceKeyframes];
      case 'qsv':
        return ['-c:v', 'h264_qsv', '-preset', QSV_PRESET_MAP[preset], '-g', gop, ...forceKeyframes];
      case 'nvenc':
        return ['-c:v', 'h264_nvenc', '-preset', NVENC_PRESET_MAP[preset], '-g', gop, ...forceKeyframes];
      default:
        return [
          '-c:v',
          videoCodec,
          '-preset',
          preset,
          '-g',
          gop,
          '-keyint_min',
          gop,
          ...forceKeyframes,
        ];
    }
  }

  private buildArgs(hw: HardwareEncoder | null): string[] {
    const { inputPath, startPosition, sourceAudioBitrate } = this.input;
    const splitLabels = this.resolutions.map((_, i) => `[v${i}]`);

    // Decode and split happen once; per-leg scaling is performed within filter_complex.
    // Fit inside the rung's box keeping the source aspect; deliberately no pad. Padding
    // bakes black bars into every frame of a non-16:9 source, which the player then
    // letterboxes again whenever its container is not 16:9. See scaledResolution().
    const hwSuffix = hw === 'vaapi' ? ',format=nv12,hwupload' : hw === 'qsv' ? ',format=nv12,hwupload=extra_hw_frames=64' : '';
    const filterParts = [
      `[0:v]split=${this.resolutions.length}${splitLabels.join('')}`,
      ...this.resolutions.map((res, i) => {
        const { width, height } = RESOLUTION_PRESETS[res];
        const scale = `scale=${width}:${height}:force_original_aspect_ratio=decrease:force_divisible_by=2,format=yuv420p`;
        return `${splitLabels[i]}${scale}${hwSuffix}[o${i}]`;
      }),
    ];

    const muxedAudioMap = this.audioTracks[0] ? `0:${this.audioTracks[0].streamIndex}` : '0:a:0?';
    const outputArgs = this.resolutions.flatMap((res, i) => {
      const preset = RESOLUTION_PRESETS[res];
      const dir = this.legOutputDir(res);
      // Audio is demuxed into sibling HLS outputs when multiple tracks exist.
      const audioMap = this.hasSeparateAudio ? [] : ['-map', muxedAudioMap];
      const audioEncode = this.hasSeparateAudio
        ? []
        : [...AUDIO_TIMESTAMP_FIX, '-c:a', 'aac', '-b:a', audioBitrateFor(preset.audioBitrate, sourceAudioBitrate), '-ac', '2'];
      return [
        '-map',
        `[o${i}]`,
        ...audioMap,
        ...this.videoCodecArgs(hw),
        '-b:v',
        preset.videoBitrate,
        '-maxrate',
        preset.maxRate,
        '-bufsize',
        preset.bufSize,
        ...audioEncode,
        ...buildHlsMuxArgs(path.join(dir, 'seg_%05d.ts')),
        path.join(dir, 'stream.m3u8'),
      ];
    });

    for (const leg of this.audioLegs.values()) {
      const track = this.audioTracks.find((t) => t.id === leg.key)!;
      appendAudioTrackHlsOutput(
        outputArgs,
        track.streamIndex,
        path.join(leg.dir, 'playlist.m3u8'),
        path.join(leg.dir, 'audio_%05d.ts'),
        sourceAudioBitrate,
      );
    }

    const hwDeviceArgs =
      hw === 'vaapi'
        ? ['-vaapi_device', RENDER_NODE]
        : hw === 'qsv'
          ? ['-init_hw_device', `qsv=hw:hw,child_device=${RENDER_NODE}`, '-filter_hw_device', 'hw']
          : [];

    return [
      ...hwDeviceArgs,
      ...(startPosition > 0 ? ['-ss', startPosition.toString()] : []),
      '-i',
      inputPath,
      '-filter_complex',
      filterParts.join(';'),
      ...outputArgs,
    ];
  }

  private spawnProcess(hw: HardwareEncoder | null): void {
    for (const leg of this.allLegs()) ensureDirectory(leg.dir);

    const proc = spawn(this.deps.options.ffmpegPath, this.buildArgs(hw), { stdio: ['ignore', 'ignore', 'pipe'] });
    this.process = proc;
    this.running = true;
    this.stderrTail = [];
    this.deps.slots.acquire();

    let settled = false;
    const settle = (): boolean => {
      if (settled) return false;
      settled = true;
      this.running = false;
      this.deps.slots.release();
      this.stopWatchers();
      return true;
    };

    proc.stderr?.on('data', (data: Buffer) => this.recordStderr(data));

    proc.on('error', (err) => {
      if (settle()) this.handleFailure(hw, err);
    });

    proc.on('exit', (code, signal) => {
      if (!settle()) return;

      // Mark leg ready on exit if segments exist; flag starved legs on unexpected exit.
      let anyLegStarved = false;
      for (const leg of this.allLegs()) leg.segmentCount = countSegments(leg.dir, leg.prefix, leg.segmentCount);
      for (const leg of this.allLegs().filter((l) => !l.isReady && !this.stopRequested)) {
        if (code === 0 && leg.segmentCount > 0) this.markReady(leg);
        else anyLegStarved = true;
      }

      // FFmpeg traps SIGTERM to flush segments and exit cleanly.
      if (!this.stopRequested && (anyLegStarved || (code !== 0 && signal !== 'SIGTERM'))) {
        const message = `FFmpeg exited with code ${code}, signal ${signal}, produced no output for one or more legs`;
        this.handleFailure(hw, new Error(message, { cause: this.stderrTail.join('\n') }));
        return;
      }
      this.emit('exit', code, signal);
    });

    this.watchSegments();
  }

  private recordStderr(data: Buffer): void {
    for (const raw of data.toString().split(/\r?\n|\r/)) {
      const line = raw.trim();
      if (!line) continue;
      this.stderrTail.push(line);
      if (this.stderrTail.length > STDERR_TAIL_LINES) this.stderrTail.shift();
      if (/error|fatal/i.test(line)) this.deps.log.error({ resolutions: this.resolutions }, `FFmpeg: ${line}`);
    }
  }

  /** Fall back to CPU encoding once if hardware encoding fails before any leg is ready. */
  private handleFailure(hw: HardwareEncoder | null, err: Error): void {
    const anyLegReady = [...this.legs.values()].some((leg) => leg.isReady);
    if (hw !== null && !anyLegReady && !this.hwFallbackAttempted) {
      this.hwFallbackAttempted = true;
      this.deps.log.error({ err, hw, resolutions: this.resolutions }, 'Hardware encoder failed, falling back to CPU');
      this.deps.encoder.downgradeToCpu();
      try {
        this.spawnProcess(null);
        return;
      } catch (spawnErr) {
        err = spawnErr instanceof Error ? spawnErr : new Error(String(spawnErr));
      }
    }
    this.emit('error', err);
  }

  private async terminate(): Promise<void> {
    this.stopWatchers();
    this.stopRequested = true;
    if (!this.process || !this.running) return;

    const proc = this.process;
    const exited = new Promise<void>((resolve) => this.once('exit', () => resolve()));
    // SIGCONT is required to process SIGTERM if suspended.
    if (this.suspended) proc.kill('SIGCONT');
    proc.kill('SIGTERM');
    // Force kill if FFmpeg hangs.
    const timeout = setTimeout(() => proc.kill('SIGKILL'), STOP_TIMEOUT_MS);

    await exited;
    clearTimeout(timeout);
    this.process = null;
    this.suspended = false;
  }

  private watchSegments(): void {
    const allReady = this.allLegs().every((leg) => leg.isReady);
    this.segmentPollTimer = setTimeout(() => this.watchSegments(), allReady ? READY_POLL_MS : WARMUP_POLL_MS);
    for (const leg of this.allLegs()) {
      leg.segmentCount = countSegments(leg.dir, leg.prefix, leg.segmentCount);
      if (!leg.isReady && leg.segmentCount >= LOOK_AHEAD_SEGMENTS) this.markReady(leg);
    }
  }

  private stopWatchers(): void {
    clearTimeout(this.segmentPollTimer);
    this.segmentPollTimer = undefined;
  }
}
