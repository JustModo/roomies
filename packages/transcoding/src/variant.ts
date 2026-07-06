import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import fs from 'fs';
import path from 'path';
import { FfmpegPreset, HwAccelMode } from '@roomies/contracts';
import { Resolution, HardwareEncoder } from './types';
import {
  RESOLUTION_PRESETS,
  SEGMENT_DURATION,
  HLS_LIST_SIZE,
  FFMPEG_PATH,
  VIDEO_CODEC,
} from './config';
import { getDetectedHardwareEncoder } from './hwaccel';

/** Maps the software x264-style preset name to the closest NVENC preset. */
const NVENC_PRESET_MAP: Record<FfmpegPreset, string> = {
  ultrafast: 'p1',
  veryfast: 'p2',
  fast: 'p3',
  medium: 'p4',
  slow: 'p6',
};

/**
 * Manages a single FFmpeg child process that transcodes one resolution variant.
 *
 * Lifecycle:
 *   start() → spawns ffmpeg → emits 'ready' when first segment appears → emits 'exit' when done
 *   stop()  → sends SIGTERM, cleans up
 *
 * Events:
 *   'ready'  — first .ts segment written to disk (client can start fetching)
 *   'error'  — ffmpeg process error (only emitted after the CPU fallback, if any, also fails)
 *   'exit'   — ffmpeg process exited (code, signal)
 */
export class TranscodeVariant extends EventEmitter {
  public readonly resolution: Resolution;
  public readonly outputDir: string;

  private process: ChildProcess | null = null;
  private watcher: fs.FSWatcher | null = null;
  private _isReady = false;
  private _isRunning = false;
  private _isSuspended = false;
  private startPosition: number = 0;
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

  /**
   * Spawns the FFmpeg process to transcode the input file into HLS segments.
   * Non-blocking — returns immediately, segments are written asynchronously.
   *
   * @param startPosition The time in seconds to start transcoding from
   */
  start(
    inputPath: string,
    startPosition: number = 0,
    preset: FfmpegPreset = 'veryfast',
    hwAccelMode: HwAccelMode = 'auto'
  ): void {
    if (this._isRunning) return;
    this.inputPath = inputPath;
    this.startPosition = startPosition;
    this.preset = preset;
    this.hwAccelMode = hwAccelMode;

    this.spawnProcess(this.shouldUseHardware());
  }

  private shouldUseHardware(): HardwareEncoder | null {
    if (this.hwAccelMode !== 'auto' || this.hwFallbackAttempted) return null;
    const detected = getDetectedHardwareEncoder();
    return detected === 'cpu' ? null : detected;
  }

  private buildArgs(hw: HardwareEncoder | null): string[] {
    const preset = RESOLUTION_PRESETS[this.resolution];
    const playlistPath = path.join(this.outputDir, 'stream.m3u8');
    const segmentPattern = path.join(this.outputDir, 'seg_%05d.ts');
    const scaleFilter = `scale=${preset.width}:${preset.height}:force_original_aspect_ratio=decrease,pad=${preset.width}:${preset.height}:(ow-iw)/2:(oh-ih)/2`;

    let videoArgs: string[];
    if (hw === 'vaapi' || hw === 'qsv') {
      // Software decode + scale, then upload to the VAAPI device for hardware
      // encoding. QSV on Linux typically layers on the same VAAPI device path.
      videoArgs = [
        '-vf', `${scaleFilter},format=nv12,hwupload`,
        '-vaapi_device', '/dev/dri/renderD128',
        '-c:v', 'h264_vaapi',
      ];
    } else if (hw === 'nvenc') {
      videoArgs = [
        '-vf', scaleFilter,
        '-c:v', 'h264_nvenc',
        '-preset', NVENC_PRESET_MAP[this.preset],
      ];
    } else {
      videoArgs = [
        '-vf', scaleFilter,
        '-c:v', VIDEO_CODEC,
        '-preset', this.preset,
      ];
    }

    return [
      // Fast seek (before input) — seeks to the nearest keyframe before
      // decoding, which is far faster than seeking after -i for large jumps.
      ...(this.startPosition > 0 ? ['-ss', this.startPosition.toString()] : []),

      // Input
      '-i', this.inputPath,

      // Preserve original timestamps so the player's internal time matches the actual media time
      ...(this.startPosition > 0 ? ['-copyts'] : []),

      // Video encoding
      ...videoArgs,
      '-b:v', preset.videoBitrate,
      '-maxrate', preset.maxRate,
      '-bufsize', preset.bufSize,

      // Disable scene-cut adaptive keyframes so nothing conflicts with the
      // explicit segment-boundary keyframes forced below.
      '-sc_threshold', '0',

      // Audio encoding
      '-c:a', 'aac',
      '-b:a', preset.audioBitrate,
      '-ac', '2',

      // HLS output — short segments + a bounded rolling live window. Every
      // client in a party watches the same live position (no per-user
      // rewind into already-transcoded regions — seeks fully restart
      // encoding at the new position), so a live-style rolling playlist is
      // a correct fit, not just an optimization.
      '-f', 'hls',
      '-hls_time', String(SEGMENT_DURATION),
      '-hls_list_size', String(HLS_LIST_SIZE),
      '-hls_segment_type', 'mpegts',
      '-hls_flags', 'delete_segments+append_list+independent_segments',
      '-hls_segment_filename', segmentPattern,

      // Force keyframe alignment at segment boundaries. Time-based (not
      // frame-count-based like `-g`/`-keyint_min`) so it stays correct
      // regardless of the source's frame rate.
      '-force_key_frames', `expr:gte(t,n_forced*${SEGMENT_DURATION})`,

      // Output playlist
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

    // Log stderr (ffmpeg progress/errors go to stderr)
    proc.stderr?.on('data', (data: Buffer) => {
      const line = data.toString().trim();
      if (line) {
        // Only log actual errors, not progress lines
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

    // Watch for the first .ts segment to appear → emit 'ready'
    this.watchForFirstSegment();
  }

  /**
   * If a hardware-encoded attempt fails before ever becoming ready, retry
   * once via the plain CPU path instead of surfacing the error — hardware
   * detection can still be wrong (permissions, half-supported drivers), and
   * this must never break playback for it. Only ever retries once.
   */
  private handleFailure(hw: HardwareEncoder | null, err: Error): void {
    if (hw !== null && !this._isReady && !this.hwFallbackAttempted) {
      this.hwFallbackAttempted = true;
      console.error(`[transcode:${this.resolution}] Hardware encoder (${hw}) failed, falling back to CPU:`, err.message);
      this.spawnProcess(null);
      return;
    }
    this.emit('error', err);
  }

  /**
   * Stops the FFmpeg process gracefully.
   */
  stop(): void {
    this.stopWatcher();

    if (this.process && this._isRunning) {
      // If the process was suspended, it won't process SIGTERM until resumed
      if (this._isSuspended) {
        this.process.kill('SIGCONT');
      }
      this.process.kill('SIGTERM');
      this.process = null;
      this._isRunning = false;
      this._isSuspended = false;
    }
  }

  /**
   * Throttles FFmpeg based on how far ahead of the playhead it's encoded.
   * Segment file deletion/rotation is handled natively by ffmpeg itself now
   * (`-hls_list_size` + `hls_flags delete_segments`), so this only needs to
   * manage the SIGSTOP/SIGCONT throttle to cap CPU/disk use when a viewer is
   * paused or lagging far behind the live edge.
   */
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

      // Throttle FFmpeg based on how far ahead it is
      if (this.process && this._isRunning) {
        const aheadBy = newestSegmentTime - currentPlayhead;

        if (aheadBy > 180 && !this._isSuspended) {
          console.log(`[transcode:${this.resolution}] Suspending FFmpeg (ahead by ${aheadBy.toFixed(1)}s)`);
          this.process.kill('SIGSTOP');
          this._isSuspended = true;
        } else if (aheadBy < 120 && this._isSuspended) {
          console.log(`[transcode:${this.resolution}] Resuming FFmpeg (ahead by ${aheadBy.toFixed(1)}s)`);
          this.process.kill('SIGCONT');
          this._isSuspended = false;
        }
      }
    } catch (err) {
      console.error(`Error managing cache for ${this.resolution}:`, err);
    }
  }

  /**
   * Watches the output directory for the first .ts segment file.
   * Once detected, marks the variant as ready and stops watching.
   */
  private watchForFirstSegment(): void {
    // Check if segments already exist (cache hit from previous run)
    try {
      const files = fs.readdirSync(this.outputDir);
      if (files.some(f => f.endsWith('.ts'))) {
        this._isReady = true;
        this.emit('ready');
        return;
      }
    } catch {
      // Directory might not have files yet
    }

    try {
      this.watcher = fs.watch(this.outputDir, (eventType, filename) => {
        if (filename && filename.endsWith('.ts') && !this._isReady) {
          this._isReady = true;
          this.stopWatcher();
          this.emit('ready');
        }
      });
    } catch (err) {
      // If watching fails, poll instead
      const poll = setInterval(() => {
        try {
          const files = fs.readdirSync(this.outputDir);
          if (files.some(f => f.endsWith('.ts'))) {
            this._isReady = true;
            clearInterval(poll);
            this.emit('ready');
          }
        } catch {
          // Keep polling
        }
      }, 500);

      // Clean up the poll if the variant is stopped
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
