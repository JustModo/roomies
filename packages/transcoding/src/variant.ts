import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import fs from 'fs';
import path from 'path';
import { FfmpegPreset, HwAccelMode } from './settings';
import { Resolution, HardwareEncoder } from './types';
import {
  RESOLUTION_PRESETS,
  SEGMENT_DURATION,
  HLS_LIST_SIZE,
  LOOK_AHEAD_SEGMENTS,
  FFMPEG_PATH,
  VIDEO_CODEC,
} from './config';
import { getDetectedHardwareEncoder, markHardwareEncoderFailed } from './hwaccel';

/** Maps the software x264-style preset name to the closest NVENC preset. */
const NVENC_PRESET_MAP: Record<FfmpegPreset, string> = {
  ultrafast: 'p1',
  veryfast: 'p2',
  fast: 'p3',
  medium: 'p4',
  slow: 'p6',
};

/** Manages a single FFmpeg child process that transcodes one resolution variant. */
export class TranscodeVariant extends EventEmitter {
  public readonly resolution: Resolution;
  public readonly outputDir: string;

  private process: ChildProcess | null = null;
  private watcher: fs.FSWatcher | null = null;
  private _isReady = false;
  private _isRunning = false;
  private _isSuspended = false;
  private _startPosition: number = 0;
  private preset: FfmpegPreset = 'veryfast';
  private hwAccelMode: HwAccelMode = 'auto';
  private inputPath: string = '';
  private hwFallbackAttempted = false;

  constructor(resolution: Resolution, outputDir: string) {
    super();
    this.resolution = resolution;
    this.outputDir = outputDir;
  }

  get isReady(): boolean {
    return this._isReady;
  }

  get isRunning(): boolean {
    return this._isRunning;
  }

  /** Spawns the FFmpeg process to transcode the input file into HLS segments. */
  start(
    inputPath: string,
    startPosition: number = 0,
    preset: FfmpegPreset = 'veryfast',
    hwAccelMode: HwAccelMode = 'auto'
  ): void {
    if (this._isRunning) return;
    this.inputPath = inputPath;
    this._startPosition = startPosition;
    this.preset = preset;
    this.hwAccelMode = hwAccelMode;

    this.spawnProcess(this.shouldUseHardware());
  }

  private shouldUseHardware(): HardwareEncoder | null {
    if (this.hwAccelMode !== 'auto') return null;
    const detected = getDetectedHardwareEncoder();
    return detected === 'cpu' ? null : detected;
  }

  private buildArgs(hw: HardwareEncoder | null): string[] {
    const preset = RESOLUTION_PRESETS[this.resolution];
    const playlistPath = path.join(this.outputDir, 'stream.m3u8');
    const segmentPattern = path.join(this.outputDir, 'seg_%05d.ts');
    const scaleFilter = `scale=${preset.width}:${preset.height}:force_original_aspect_ratio=decrease,pad=${preset.width}:${preset.height}:(ow-iw)/2:(oh-ih)/2`;

    // WHY: Use encoder-native -g instead of filtergraph force_key_frames to save CPU.
    // GOP size matches SEGMENT_DURATION assuming a 24fps baseline.
    const gopSize = SEGMENT_DURATION * 24;

    let videoArgs: string[];
    if (hw === 'vaapi' || hw === 'qsv') {
      // NOTE: Software decode and scale, then upload to VAAPI device for hardware encoding.
      videoArgs = [
        '-vf', `${scaleFilter},format=nv12,hwupload`,
        '-vaapi_device', '/dev/dri/renderD128',
        '-c:v', 'h264_vaapi',
        '-g', String(gopSize),
      ];
    } else if (hw === 'nvenc') {
      videoArgs = [
        '-vf', scaleFilter,
        '-c:v', 'h264_nvenc',
        '-preset', NVENC_PRESET_MAP[this.preset],
        '-g', String(gopSize),
      ];
    } else {
      videoArgs = [
        '-vf', scaleFilter,
        '-c:v', VIDEO_CODEC,
        '-preset', this.preset,
        // NOTE: Minimize internal buffering for faster first segment write.
        '-tune', 'zerolatency',
        '-g', String(gopSize),
        '-keyint_min', String(gopSize),
      ];
    }

    return [
      // NOTE: Fast seek to keyframe. HLS only needs keyframe alignment.
      ...(this.startPosition > 0 ? ['-ss', this.startPosition.toString(), '-noaccurate_seek'] : []),

      '-i', this.inputPath,

      // NOTE: Normalize timestamps to 0 so segment indices are contiguous.
      ...(this.startPosition > 0 ? ['-avoid_negative_ts', 'make_zero'] : []),

      '-threads', '0',

      // NOTE: Disable scene-cut adaptive keyframes to keep fixed GOP.
      '-sc_threshold', '0',

      ...videoArgs,
      '-b:v', preset.videoBitrate,
      '-maxrate', preset.maxRate,
      '-bufsize', preset.bufSize,

      '-c:a', 'aac',
      '-b:a', preset.audioBitrate,
      '-ac', '2',

      // NOTE: HLS VOD mode configuration to keep all segments and ensure they are independent.
      '-f', 'hls',
      '-hls_time', String(SEGMENT_DURATION),
      '-hls_list_size', String(HLS_LIST_SIZE),
      '-hls_segment_type', 'mpegts',
      '-hls_flags', 'independent_segments',
      '-hls_segment_filename', segmentPattern,
      '-hls_allow_cache', '1',

      playlistPath,
    ];
  }

  private spawnProcess(hw: HardwareEncoder | null): void {
    fs.mkdirSync(this.outputDir, { recursive: true });

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
          console.error(`[transcode:${this.resolution}] ${line}`);
        }
      }
    });

    proc.on('error', (err) => {
      this._isRunning = false;
      this.stopWatcher();
      this.handleFailure(hw, err);
    });

    proc.on('exit', (code, signal) => {
      this._isRunning = false;
      this.stopWatcher();
      if (code !== 0 && signal !== 'SIGTERM') {
        this.handleFailure(hw, new Error(`FFmpeg exited with code ${code}, signal ${signal}`));
        return;
      }
      this.emit('exit', code, signal);
    });

    this.watchForFirstSegment();
  }

  /** NOTE: Fall back to CPU encoding once if hardware encoding fails before becoming ready. */
  private handleFailure(hw: HardwareEncoder | null, err: Error): void {
    if (hw !== null && !this._isReady && !this.hwFallbackAttempted) {
      this.hwFallbackAttempted = true;
      markHardwareEncoderFailed();
      console.error(`[transcode:${this.resolution}] Hardware encoder (${hw}) failed, falling back to CPU:`, err.message);
      this.spawnProcess(null);
      return;
    }
    this.emit('error', err);
  }

  stop(): void {
    this.stopWatcher();

    if (this.process && this._isRunning) {
      // NOTE: SIGCONT is required to process SIGTERM if suspended.
      if (this._isSuspended) {
        this.process.kill('SIGCONT');
      }
      this.process.kill('SIGTERM');
      this.process = null;
      this._isRunning = false;
      this._isSuspended = false;
    }
  }

  /** NOTE: Manages SIGSTOP/SIGCONT throttling based on playhead distance to cap CPU/disk usage. */
  manageCache(currentPlayhead: number): void {
    if (!this._isReady) return;

    try {
      const files = fs.readdirSync(this.outputDir);
      let newestSegmentTime = 0;

      for (const file of files) {
        if (!file.endsWith('.ts')) continue;

        const match = file.match(/seg_(\d+)\.ts/);
        if (match) {
          const index = parseInt(match[1], 10);
          const segmentTime = this.startPosition + (index * SEGMENT_DURATION);
          if (segmentTime > newestSegmentTime) {
            newestSegmentTime = segmentTime;
          }
        }
      }

      // NOTE: Suspend FFmpeg if ahead by >300s, resume when <60s to protect CPU/disk.
      if (this.process && this._isRunning) {
        const aheadBy = newestSegmentTime - currentPlayhead;

        if (aheadBy > 300 && !this._isSuspended) {
          console.log(`[transcode:${this.resolution}] Suspending FFmpeg (ahead by ${aheadBy.toFixed(1)}s)`);
          this.process.kill('SIGSTOP');
          this._isSuspended = true;
        } else if (aheadBy < 60 && this._isSuspended) {
          console.log(`[transcode:${this.resolution}] Resuming FFmpeg (ahead by ${aheadBy.toFixed(1)}s)`);
          this.process.kill('SIGCONT');
          this._isSuspended = false;
        }
      }
    } catch (err) {
      console.error(`Error managing cache for ${this.resolution}:`, err);
    }
  }

  /** Watches the output directory for the first .ts segment file. */
  private watchForFirstSegment(): void {
    // NOTE: Check if lookahead segments already exist from a previous run.
    try {
      const files = fs.readdirSync(this.outputDir);
      const tsCount = files.filter(f => f.endsWith('.ts')).length;
      if (tsCount >= LOOK_AHEAD_SEGMENTS) {
        this._isReady = true;
        this.emit('ready');
        return;
      }
    } catch {
    }

    // NOTE: Emits 'ready' once enough lookahead segments are present to prevent initial stall.
    const checkReady = () => {
      try {
        const files = fs.readdirSync(this.outputDir);
        const tsCount = files.filter(f => f.endsWith('.ts')).length;
        if (tsCount >= LOOK_AHEAD_SEGMENTS && !this._isReady) {
          this._isReady = true;
          this.stopWatcher();
          this.emit('ready');
        }
      } catch {
      }
    };

    try {
      this.watcher = fs.watch(this.outputDir, checkReady);
    } catch (err) {
      // NOTE: Fall back to polling if directory watching fails.
      const poll = setInterval(checkReady, 500);
      this.once('exit', () => clearInterval(poll));
    }
  }

  private stopWatcher(): void {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }
  }
}
