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

  /** The media time (in seconds) from which this variant started encoding. */
  get startPosition(): number {
    return this._startPosition;
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

    // GOP size = SEGMENT_DURATION × a conservative 24fps baseline. This ensures
    // every segment boundary lands on a keyframe regardless of the source frame
    // rate (23.976, 25, 29.97, 30). Using encoder-native -g instead of the
    // filtergraph `force_key_frames` expression saves measurable CPU — the filter
    // evaluates on every decoded frame, the encoder flag is essentially free.
    const gopSize = SEGMENT_DURATION * 24;

    let videoArgs: string[];
    if (hw === 'vaapi' || hw === 'qsv') {
      // Software decode + scale, then upload to the VAAPI device for hardware
      // encoding. QSV on Linux typically layers on the same VAAPI device path.
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
        // zerolatency tune minimises internal encoder lookahead buffering so
        // the first completed segment appears on disk as fast as possible.
        '-tune', 'zerolatency',
        '-g', String(gopSize),
        '-keyint_min', String(gopSize),
      ];
    }

    return [
      // Fast seek (before -i) snaps to the nearest keyframe before the target
      // time. -noaccurate_seek skips the slow subsequent frame-accurate decode
      // to the exact timestamp — for HLS we only need keyframe alignment.
      ...(this.startPosition > 0 ? ['-ss', this.startPosition.toString(), '-noaccurate_seek'] : []),

      // Input
      '-i', this.inputPath,

      // Normalise timestamps to 0 when seeking mid-file so segment indices
      // are contiguous and the playlist is well-formed.
      ...(this.startPosition > 0 ? ['-avoid_negative_ts', 'make_zero'] : []),

      // Use all available CPU threads for decoding and encoding
      '-threads', '0',

      // Disable scene-cut adaptive keyframes — conflicts with our fixed GOP
      '-sc_threshold', '0',

      // Video encoding
      ...videoArgs,
      '-b:v', preset.videoBitrate,
      '-maxrate', preset.maxRate,
      '-bufsize', preset.bufSize,

      // Audio encoding
      '-c:a', 'aac',
      '-b:a', preset.audioBitrate,
      '-ac', '2',

      // HLS output — VOD mode:
      //   hls_list_size 0  → keep ALL segments for the session lifetime so the
      //                       player can buffer far ahead and seek backwards
      //                       into already-transcoded regions without a restart.
      //   independent_segments → every segment is independently decodable
      //                          (required for bitrate-switch seeks in hls.js).
      //   NO delete_segments   → segments are never deleted by ffmpeg mid-run.
      //   NO append_list       → the playlist is fully rewritten each time,
      //                          which is correct for an HLS VOD playlist.
      '-f', 'hls',
      '-hls_time', String(SEGMENT_DURATION),
      '-hls_list_size', String(HLS_LIST_SIZE),
      '-hls_segment_type', 'mpegts',
      '-hls_flags', 'independent_segments',
      '-hls_segment_filename', segmentPattern,
      '-hls_allow_cache', '1',

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
      markHardwareEncoderFailed();
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

      // Throttle FFmpeg based on how far ahead of the playhead it has encoded.
      //
      // Suspend threshold 300s: with VOD-mode HLS, running far ahead is free
      // — those segments are already on disk and any future seek into them
      // will be instant. Only suspend to protect CPU/disk when very far ahead.
      //
      // Resume threshold 60s: bring FFmpeg back online quickly so the player
      // always has a healthy look-ahead buffer.
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

  /**
   * Watches the output directory for the first .ts segment file.
   * Once detected, marks the variant as ready and stops watching.
   */
  private watchForFirstSegment(): void {
    // Check if enough segments already exist (cache hit from a previous start)
    try {
      const files = fs.readdirSync(this.outputDir);
      const tsCount = files.filter(f => f.endsWith('.ts')).length;
      if (tsCount >= LOOK_AHEAD_SEGMENTS) {
        this._isReady = true;
        this.emit('ready');
        return;
      }
    } catch {
      // Directory might not have files yet
    }

    // Watch for new .ts files; emit 'ready' once LOOK_AHEAD_SEGMENTS are present.
    // This gives the player a healthy initial buffer (LOOK_AHEAD_SEGMENTS × SEGMENT_DURATION
    // seconds) before it starts pulling, preventing the first-segment stall.
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
        // Keep watching
      }
    };

    try {
      this.watcher = fs.watch(this.outputDir, checkReady);
    } catch (err) {
      // If watching fails, fall back to polling
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
