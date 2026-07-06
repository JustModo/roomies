import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import fs from 'fs';
import path from 'path';
import { Resolution } from './types';
import {
  RESOLUTION_PRESETS,
  SEGMENT_DURATION,
  FFMPEG_PATH,
  VIDEO_CODEC,
} from './config';

/**
 * Manages a single FFmpeg child process that transcodes one resolution variant.
 *
 * Lifecycle:
 *   start() → spawns ffmpeg → emits 'ready' when first segment appears → emits 'exit' when done
 *   stop()  → sends SIGTERM, cleans up
 *
 * Events:
 *   'ready'  — first .ts segment written to disk (client can start fetching)
 *   'error'  — ffmpeg process error
 *   'exit'   — ffmpeg process exited (code, signal)
 */
export class TranscodeVariant extends EventEmitter {
  public readonly resolution: Resolution;
  public readonly outputDir: string;

  private process: ChildProcess | null = null;
  private watcher: fs.FSWatcher | null = null;
  private _isReady = false;
  private _isRunning = false;

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
   */
  start(inputPath: string): void {
    if (this._isRunning) return;

    // Ensure the output directory exists
    fs.mkdirSync(this.outputDir, { recursive: true });

    const preset = RESOLUTION_PRESETS[this.resolution];
    const playlistPath = path.join(this.outputDir, 'stream.m3u8');
    const segmentPattern = path.join(this.outputDir, 'seg_%05d.ts');

    const args = [
      // Input
      '-i', inputPath,

      // Video encoding
      '-vf', `scale=${preset.width}:${preset.height}:force_original_aspect_ratio=decrease,pad=${preset.width}:${preset.height}:(ow-iw)/2:(oh-ih)/2`,
      '-c:v', VIDEO_CODEC,
      '-preset', 'veryfast',
      '-b:v', preset.videoBitrate,
      '-maxrate', preset.maxRate,
      '-bufsize', preset.bufSize,

      // Audio encoding
      '-c:a', 'aac',
      '-b:a', preset.audioBitrate,
      '-ac', '2',

      // HLS output
      '-f', 'hls',
      '-hls_time', String(SEGMENT_DURATION),
      '-hls_list_size', '0',
      '-hls_segment_type', 'mpegts',
      '-hls_flags', 'delete_segments+append_list+independent_segments',
      '-hls_segment_filename', segmentPattern,

      // Force keyframe alignment at segment boundaries
      '-force_key_frames', `expr:gte(t,n_forced*${SEGMENT_DURATION})`,

      // Output playlist
      playlistPath,
    ];

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
      this.emit('error', err);
    });

    proc.on('exit', (code, signal) => {
      this._isRunning = false;
      this.stopWatcher();
      if (code !== 0 && signal !== 'SIGTERM') {
        this.emit('error', new Error(`FFmpeg exited with code ${code}, signal ${signal}`));
      }
      this.emit('exit', code, signal);
    });

    // Watch for the first .ts segment to appear → emit 'ready'
    this.watchForFirstSegment();
  }

  /**
   * Stops the FFmpeg process gracefully.
   */
  stop(): void {
    this.stopWatcher();

    if (this.process && this._isRunning) {
      this.process.kill('SIGTERM');
      this.process = null;
      this._isRunning = false;
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
