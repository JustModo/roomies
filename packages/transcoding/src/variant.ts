import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import fs from 'fs';
import path from 'path';
import { FfmpegPreset, HwAccelMode } from './settings';
import { Resolution, HardwareEncoder, AudioTrackDescriptor } from './types';
import {
  RESOLUTION_PRESETS,
  SEGMENT_DURATION,
  HLS_LIST_SIZE,
  LOOK_AHEAD_SEGMENTS,
  FFMPEG_PATH,
  VIDEO_CODEC,
  AUDIO_BITRATE,
} from './config';
import { getDetectedHardwareEncoder, markHardwareEncoderFailed } from './hwaccel';
import { TranscodeCache } from './cache';

/** Maps the software x264-style preset name to the closest NVENC preset. */
const NVENC_PRESET_MAP: Record<FfmpegPreset, string> = {
  ultrafast: 'p1',
  veryfast: 'p2',
  fast: 'p3',
  medium: 'p4',
  slow: 'p6',
};

interface AudioLegState {
  isReady: boolean;
  newestSegmentTime: number;
  maxCoveredTime: number;
}

/** Manages a single FFmpeg child process that transcodes one resolution variant. */
export class TranscodeVariant extends EventEmitter {
  public readonly resolution: Resolution;
  public readonly outputDir: string;
  public readonly sessionId: string;
  public readonly audioTracks: AudioTrackDescriptor[];
  /** Only when there's a genuine choice do we pay for separate audio-only HLS outputs;
   *  a single audio track keeps today's behavior (muxed into the video output). */
  public readonly hasSeparateAudio: boolean;

  private readonly audioOutputDirs: Map<string, string>;
  private readonly audioLegs: Map<string, AudioLegState>;

  private process: ChildProcess | null = null;
  private watcher: fs.FSWatcher | null = null;
  private audioWatchers: fs.FSWatcher[] = [];
  private pollInterval: NodeJS.Timeout | null = null;
  private _isReady = false;
  private _isRunning = false;
  private _isSuspended = false;
  private _newestSegmentTime: number = 0;
  private _maxCoveredTime: number = 0;
  private _startPosition: number = 0;
  private preset: FfmpegPreset = 'veryfast';
  private hwAccelMode: HwAccelMode = 'auto';
  private inputPath: string = '';
  private hwFallbackAttempted = false;
  private sourceFps: number = 24;
  private stopRequested = false;

  constructor(
    resolution: Resolution,
    outputDir: string,
    sessionId: string,
    audioTracks: AudioTrackDescriptor[] = []
  ) {
    super();
    this.setMaxListeners(50);
    this.resolution = resolution;
    this.outputDir = outputDir;
    this.sessionId = sessionId;
    this.audioTracks = audioTracks;
    this.hasSeparateAudio = audioTracks.length > 1;
    this.audioOutputDirs = new Map(audioTracks.map(t => [t.id, path.join(outputDir, 'audio', t.id)]));
    this.audioLegs = new Map(audioTracks.map(t => [t.id, { isReady: false, newestSegmentTime: 0, maxCoveredTime: 0 }]));
  }

  audioOutputDir(trackId: string): string {
    const dir = this.audioOutputDirs.get(trackId);
    if (!dir) throw new Error(`No output directory registered for audio track ${trackId}`);
    return dir;
  }

  isAudioReady(trackId: string): boolean {
    return this.audioLegs.get(trackId)?.isReady ?? false;
  }

  audioMaxCoveredTime(trackId: string): number {
    return this.audioLegs.get(trackId)?.maxCoveredTime ?? 0;
  }

  get isReady(): boolean {
    return this._isReady;
  }

  get isRunning(): boolean {
    return this._isRunning;
  }

  get startPosition(): number {
    return this._startPosition;
  }

  /** Newest segment's timeline position, tracked incrementally by the segment watcher (see watchForFirstSegment). */
  get newestSegmentTime(): number {
    return this._newestSegmentTime;
  }

  /** Furthest continuously-covered timeline position, tracked incrementally by the segment watcher. */
  get maxCoveredTime(): number {
    return this._maxCoveredTime;
  }

  /** Spawns the FFmpeg process to transcode the input file into HLS segments. */
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
    const preset = RESOLUTION_PRESETS[this.resolution];
    const playlistPath = path.join(this.outputDir, 'stream.m3u8');
    const segmentPattern = path.join(this.outputDir, 'seg_%05d.ts');
    const scaleFilter = `scale=${preset.width}:${preset.height}:force_original_aspect_ratio=decrease,pad=${preset.width}:${preset.height}:(ow-iw)/2:(oh-ih)/2,format=yuv420p`;

    // WHY: Use encoder-native -g instead of filtergraph force_key_frames to save CPU.
    // GOP size is derived from the probed source fps so keyframes land on segment boundaries.
    const gopSize = Math.round(SEGMENT_DURATION * this.sourceFps);

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
      // NOTE: Fast seek to keyframe, then decode up to startPosition to ensure exact frame alignment for synchronized playback.
      ...(this.startPosition > 0 ? ['-ss', this.startPosition.toString()] : []),

      '-i', this.inputPath,

      // NOTE: Normalize timestamps to 0 so segment indices are contiguous.
      ...(this.startPosition > 0 ? ['-avoid_negative_ts', 'make_zero'] : []),

      '-threads', '0',

      // NOTE: Disable scene-cut adaptive keyframes to keep fixed GOP.
      '-sc_threshold', '0',

      // NOTE: with no explicit -map, ffmpeg implicitly includes a default audio stream in this
      // output — fine for the muxed single-track case, but once audio has its own sibling
      // outputs below it must be excluded here explicitly or it'd be implicitly duplicated in.
      ...(this.hasSeparateAudio ? ['-map', '0:v:0', '-an'] : []),

      ...videoArgs,
      '-b:v', preset.videoBitrate,
      '-maxrate', preset.maxRate,
      '-bufsize', preset.bufSize,

      // NOTE: with >1 audio track, audio is demuxed into its own sibling HLS outputs below
      // (so hls.js can switch tracks without touching the video buffer); with 0-1 tracks,
      // audio stays muxed into the video output exactly like before this feature existed.
      ...(this.hasSeparateAudio ? [] : ['-c:a', 'aac', '-b:a', preset.audioBitrate, '-ac', '2']),

      // NOTE: HLS VOD mode configuration to keep all segments and ensure they are independent.
      '-f', 'hls',
      '-hls_time', String(SEGMENT_DURATION),
      '-hls_list_size', String(HLS_LIST_SIZE),
      '-hls_segment_type', 'mpegts',
      '-hls_flags', 'independent_segments+temp_file',
      '-hls_segment_filename', segmentPattern,
      '-hls_allow_cache', '1',

      playlistPath,

      ...(this.hasSeparateAudio ? this.buildAudioOutputArgs() : []),
    ];
  }

  private buildAudioOutputArgs(): string[] {
    const args: string[] = [];
    for (const track of this.audioTracks) {
      const dir = this.audioOutputDir(track.id);
      const trackPlaylistPath = path.join(dir, 'playlist.m3u8');
      const trackSegmentPattern = path.join(dir, 'audio_%05d.ts');

      args.push(
        '-map', `0:${track.streamIndex}`,
        '-c:a', 'aac',
        '-b:a', AUDIO_BITRATE,
        '-ac', '2',

        '-f', 'hls',
        '-hls_time', String(SEGMENT_DURATION),
        '-hls_list_size', String(HLS_LIST_SIZE),
        '-hls_segment_type', 'mpegts',
        '-hls_flags', 'independent_segments+temp_file',
        '-hls_segment_filename', trackSegmentPattern,
        '-hls_allow_cache', '1',

        trackPlaylistPath,
      );
    }
    return args;
  }

  private spawnProcess(hw: HardwareEncoder | null): void {
    TranscodeCache.ensureDirectory(this.outputDir);
    if (this.hasSeparateAudio) {
      for (const track of this.audioTracks) {
        TranscodeCache.ensureDirectory(this.audioOutputDir(track.id));
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
          console.error(`[transcode] variant ${this.resolution} error: ${line}`);
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
      const tsCount = TranscodeCache.getSegmentCount(this.outputDir);
      if (tsCount > 0 && !this._isReady && (code === 0 || this.stopRequested)) {
        this._isReady = true;
        this.emit('ready');
      }
      if (this.hasSeparateAudio) {
        for (const track of this.audioTracks) {
          const leg = this.audioLegs.get(track.id)!;
          if (!leg.isReady) {
            const audioTsCount = TranscodeCache.getSegmentCount(this.audioOutputDir(track.id));
            if (audioTsCount > 0 && (code === 0 || this.stopRequested)) {
              leg.isReady = true;
              this.emit('audio-ready', track.id);
            }
          }
        }
      }
      this.stopWatcher();
      // NOTE: FFmpeg traps SIGTERM to shut down gracefully (flushing the final segment/playlist)
      // and then exits with its own code (observed: 255) rather than being reported as killed by
      // signal — so `signal === 'SIGTERM'` alone doesn't reliably detect an intentional stop.
      if (!this.stopRequested && code !== 0 && signal !== 'SIGTERM') {
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
      console.error(`[transcode] variant ${this.resolution} hardware encoder (${hw}) failed, falling back to CPU:`, err.message);
      this.spawnProcess(null);
      return;
    }
    this.emit('error', err);
  }

  async stop(): Promise<void> {
    this.stopWatcher();
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
  }

  /** NOTE: Manages SIGSTOP/SIGCONT throttling based on playhead distance to cap CPU/disk usage. */
  manageCache(currentPlayhead: number, isActivelyWatched: boolean = true): void {
    if (!this._isReady) return;

    try {
      // NOTE: Suspend FFmpeg if ahead by >300s or NOT actively watched. Resume when <60s AND actively watched to protect CPU/disk.
      if (this.process && this._isRunning) {
        const aheadBy = this._newestSegmentTime - currentPlayhead;

        if ((!isActivelyWatched || aheadBy > 300) && !this._isSuspended) {
          const reason = !isActivelyWatched ? 'not actively watched' : `ahead by ${aheadBy.toFixed(1)}s`;
          console.log(`[transcode] [session ${this.sessionId}] variant ${this.resolution} suspending FFmpeg (${reason})`);
          this.process.kill('SIGSTOP');
          this._isSuspended = true;
        } else if (isActivelyWatched && aheadBy < 60 && this._isSuspended) {
          console.log(`[transcode] [session ${this.sessionId}] variant ${this.resolution} resuming FFmpeg (ahead by ${aheadBy.toFixed(1)}s)`);
          this.process.kill('SIGCONT');
          this._isSuspended = false;
        }
      }
    } catch (err) {
      console.error(`[transcode] [session ${this.sessionId}] Error managing cache for ${this.resolution}:`, err);
    }
  }

  /** Watches the output directory for the first .ts segment files. */
  private watchForFirstSegment(): void {
    const recomputeCacheStats = () => {
      const { newestSegmentTime, maxCoveredTime } = TranscodeCache.getVariantCacheStats(this.outputDir, this._startPosition);
      this._newestSegmentTime = newestSegmentTime;
      this._maxCoveredTime = maxCoveredTime;
    };

    const checkReady = () => {
      recomputeCacheStats();
      if (this._isReady) return;
      const tsCount = TranscodeCache.getSegmentCount(this.outputDir);
      // NOTE: Mark ready if lookahead segments are present OR if process finished and at least 1 segment exists
      if (tsCount >= LOOK_AHEAD_SEGMENTS || (!this._isRunning && tsCount > 0)) {
        this._isReady = true;
        this.emit('ready');
      }
    };

    const recomputeAudioLeg = (trackId: string) => {
      const leg = this.audioLegs.get(trackId)!;
      const { newestSegmentTime, maxCoveredTime } = TranscodeCache.getVariantCacheStats(this.audioOutputDir(trackId), this._startPosition);
      leg.newestSegmentTime = newestSegmentTime;
      leg.maxCoveredTime = maxCoveredTime;
    };

    const checkAudioReady = (trackId: string) => {
      recomputeAudioLeg(trackId);
      const leg = this.audioLegs.get(trackId)!;
      if (leg.isReady) return;
      const tsCount = TranscodeCache.getSegmentCount(this.audioOutputDir(trackId));
      if (tsCount >= LOOK_AHEAD_SEGMENTS || (!this._isRunning && tsCount > 0)) {
        leg.isReady = true;
        this.emit('audio-ready', trackId);
      }
    };

    checkReady();
    if (this.hasSeparateAudio) {
      for (const track of this.audioTracks) checkAudioReady(track.id);
    }

    // NOTE: fs.watch provides real-time OS events on native filesystems.
    try {
      this.watcher = fs.watch(this.outputDir, checkReady);
    } catch (err) {
      // Ignore watch setup error
    }
    if (this.hasSeparateAudio) {
      for (const track of this.audioTracks) {
        try {
          this.audioWatchers.push(fs.watch(this.audioOutputDir(track.id), () => checkAudioReady(track.id)));
        } catch (err) {
          // Ignore watch setup error
        }
      }
    }

    // NOTE: Docker host bind mounts on Windows/WSL2 do NOT pass inotify events to fs.watch.
    // We add an active polling interval so segment creation is ALWAYS detected regardless of environment.
    // NOTE: Kept running for the variant's full lifetime (not just until ready) so newestSegmentTime/
    // maxCoveredTime stay current without callers re-scanning the output directory themselves.
    this.pollInterval = setInterval(() => {
      checkReady();
      if (this.hasSeparateAudio) {
        for (const track of this.audioTracks) checkAudioReady(track.id);
      }
    }, 300);
  }

  private stopWatcher(): void {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }
    for (const w of this.audioWatchers) w.close();
    this.audioWatchers = [];
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
  }
}
