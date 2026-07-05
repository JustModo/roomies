import path from 'path';
import fs from 'fs/promises';
import { spawn, ChildProcess } from 'child_process';
import { getActiveProfiles, TranscodeProfile } from './profiles';

/**
 * Resolves the ffmpeg binary path.
 * - In Docker: installed via apk (system-level)
 * - Locally: relies on system PATH
 */
const FFMPEG_BIN = process.env.FFMPEG_PATH || 'ffmpeg';

// The H.264 encoder to use. Configurable because ffmpeg builds vary in which
// H.264 encoder is available (libx264, libopenh264, h264_vaapi, etc.).
const FFMPEG_VIDEO_CODEC = process.env.FFMPEG_VIDEO_CODEC || 'libx264';

// Extra encoder-specific args (e.g. `-profile:v baseline -level 3.0` for
// libx264). Split from a space-separated string.
const FFMPEG_VIDEO_CODEC_ARGS = process.env.FFMPEG_VIDEO_CODEC_ARGS
  ? process.env.FFMPEG_VIDEO_CODEC_ARGS.split(' ').filter(Boolean)
  : ['-profile:v', 'baseline', '-level', '3.0'];

/** How long (ms) to wait after SIGTERM before sending SIGKILL */
const KILL_GRACE_MS = 3_000;

interface TranscodeSession {
  /** One FFmpeg child process per quality variant */
  processes: Map<string, ChildProcess>;
  outputDir: string;
}

// ─── Module-level state ──────────────────────────────────────────────
// Only one party is active at a time (architecture constraint), so we
// track a single session. This mirrors the single-slot design of the
// old playbackStateStore.
let activeSession: TranscodeSession | null = null;

/**
 * Error callback: called when an FFmpeg variant process exits unexpectedly.
 * Set by the bootstrap/playback layer so it can broadcast an error to clients.
 */
let onErrorCallback: ((profileName: string, error: string) => void) | null = null;

export const TranscodeSessionManager = {
  /**
   * Register a callback that fires when an FFmpeg process crashes during
   * a session. The playback layer uses this to push error events over the
   * WebSocket to connected clients.
   */
  onError(cb: (profileName: string, error: string) => void) {
    onErrorCallback = cb;
  },

  /**
   * Start a live-transcoding session.
   *
   * 1. Kills any existing session (FFmpeg processes + cleans files)
   * 2. Creates output directories
   * 3. Spawns one FFmpeg process per quality profile
   * 4. Writes the HLS master playlist (static — lists all variants)
   * 5. Returns immediately — does NOT wait for transcoding to finish
   *
   * The client can start loading the master.m3u8 right away. Shaka Player
   * will retry segment fetches until they appear on disk, which happens
   * within seconds as FFmpeg begins writing.
   */
  async startSession(
    inputPath: string,
    outputDir: string,
  ): Promise<{ hlsUrl: string }> {
    // Kill prior session (handles the cache lock issue — FFmpeg is dead
    // before we touch its files)
    await this.stopSession();

    // Ensure a clean output directory
    await fs.rm(outputDir, { recursive: true, force: true });
    await fs.mkdir(outputDir, { recursive: true });

    const profiles = getActiveProfiles();
    const processes = new Map<string, ChildProcess>();

    // Spawn an FFmpeg process for each quality variant
    for (const profile of profiles) {
      const variantDir = path.join(outputDir, profile.name);
      await fs.mkdir(variantDir, { recursive: true });

      const child = spawnFFmpeg(inputPath, variantDir, profile);
      processes.set(profile.name, child);

      // Handle unexpected exits
      child.on('exit', (code, signal) => {
        processes.delete(profile.name);

        // code 0 or signal-based kill (from our stopSession) is expected
        if (code !== 0 && signal !== 'SIGTERM' && signal !== 'SIGKILL') {
          const msg = `FFmpeg ${profile.name} exited with code ${code}`;
          console.error(`[TranscodeSessionManager] ${msg}`);
          onErrorCallback?.(profile.name, msg);
        }
      });

      // Log stderr for debugging (ffmpeg outputs progress to stderr)
      child.stderr?.on('data', (chunk: Buffer) => {
        // Only log at trace level to avoid flooding — pipe to a debug
        // log file in production if needed.
        if (process.env.FFMPEG_DEBUG === '1') {
          process.stderr.write(`[ffmpeg:${profile.name}] ${chunk}`);
        }
      });
    }

    // Write the master playlist immediately — it's a static file that
    // simply lists the variant streams. FFmpeg will create each variant's
    // playlist.m3u8 on its own as it encodes.
    await writeMasterPlaylist(outputDir, profiles);

    activeSession = { processes, outputDir };

    const hlsBaseUrl = process.env.HLS_BASE_URL || 'http://localhost:80/hls';
    return { hlsUrl: `${hlsBaseUrl}/main/master.m3u8` };
  },

  /**
   * Stop the active transcoding session.
   *
   * Gracefully terminates all FFmpeg processes (SIGTERM, then SIGKILL
   * after a timeout), waits for them to exit, THEN cleans the output
   * directory. This ordering eliminates the EBUSY / lock errors the old
   * code hit when it tried to delete files while FFmpeg still had handles
   * open.
   */
  async stopSession(): Promise<void> {
    if (!activeSession) return;

    const { processes, outputDir } = activeSession;
    activeSession = null;

    // Kill all FFmpeg processes and wait for them to exit
    await Promise.all(
      Array.from(processes.entries()).map(([name, child]) =>
        killProcess(child, name),
      ),
    );

    // Now safe to delete — no open file handles
    try {
      await fs.rm(outputDir, { recursive: true, force: true });
    } catch {
      // Best-effort cleanup; if it still fails we'll overwrite next time
    }
  },

  /** Returns true if a session is currently active */
  isActive(): boolean {
    return activeSession !== null;
  },
};

// ─── Internals ───────────────────────────────────────────────────────

/**
 * Spawn a single FFmpeg process for one quality variant.
 *
 * Key flags for live/on-the-fly HLS:
 * - `-hls_time 4`: 4-second segments for fast start
 * - `-hls_flags append_list+independent_segments`: FFmpeg continuously
 *   appends to the playlist so the player can start reading immediately
 * - `-hls_list_size 0`: keep all segments in the playlist (full seek-back)
 * - `-g 48 -keyint_min 48`: force keyframes every 48 frames so each
 *   segment is independently decodable (required for ABR switching)
 */
function spawnFFmpeg(
  inputPath: string,
  variantDir: string,
  profile: TranscodeProfile,
): ChildProcess {
  const playlistPath = path.join(variantDir, 'playlist.m3u8');
  const segmentPattern = path.join(variantDir, 'seg%05d.ts');

  const args = [
    // Global options
    '-hide_banner',
    '-loglevel', 'warning',

    // Input
    '-i', inputPath,

    // Video encoding
    '-c:v', FFMPEG_VIDEO_CODEC,
    ...FFMPEG_VIDEO_CODEC_ARGS,
    '-vf', `scale=${profile.width}:${profile.height}:force_original_aspect_ratio=decrease,pad=${profile.width}:${profile.height}:(ow-iw)/2:(oh-ih)/2`,
    '-b:v', profile.videoBitrate,
    '-maxrate', profile.maxRate,
    '-bufsize', profile.bufSize,

    // Force keyframe interval — essential for segment-aligned ABR switching
    '-g', '48',
    '-keyint_min', '48',
    '-sc_threshold', '0',

    // Audio encoding
    '-c:a', 'aac',
    '-b:a', profile.audioBitrate,
    '-ac', '2',

    // HLS output
    '-f', 'hls',
    '-hls_time', '4',
    '-hls_list_size', '0',
    '-hls_flags', 'append_list+independent_segments',
    '-hls_segment_filename', segmentPattern,
    '-start_number', '0',

    playlistPath,
  ];

  const child = spawn(FFMPEG_BIN, args, {
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  return child;
}

/**
 * Write the HLS master playlist that references all quality variants.
 *
 * Example output:
 * ```
 * #EXTM3U
 * #EXT-X-VERSION:3
 * #EXT-X-STREAM-INF:BANDWIDTH=700000,RESOLUTION=640x360,NAME="360p"
 * 360p/playlist.m3u8
 * #EXT-X-STREAM-INF:BANDWIDTH=3200000,RESOLUTION=1280x720,NAME="720p"
 * 720p/playlist.m3u8
 * #EXT-X-STREAM-INF:BANDWIDTH=6200000,RESOLUTION=1920x1080,NAME="1080p"
 * 1080p/playlist.m3u8
 * ```
 */
async function writeMasterPlaylist(
  outputDir: string,
  profiles: TranscodeProfile[],
): Promise<void> {
  const lines = ['#EXTM3U', '#EXT-X-VERSION:3'];

  for (const p of profiles) {
    lines.push(
      `#EXT-X-STREAM-INF:BANDWIDTH=${p.bandwidth},RESOLUTION=${p.width}x${p.height},NAME="${p.name}"`,
      `${p.name}/playlist.m3u8`,
    );
  }

  lines.push(''); // trailing newline
  await fs.writeFile(path.join(outputDir, 'master.m3u8'), lines.join('\n'));
}

/**
 * Kill a child process gracefully: SIGTERM first, then SIGKILL after a
 * timeout. Returns a promise that resolves once the process has actually
 * exited.
 */
function killProcess(child: ChildProcess, label: string): Promise<void> {
  return new Promise((resolve) => {
    if (child.exitCode !== null || child.killed) {
      resolve();
      return;
    }

    const forceKillTimer = setTimeout(() => {
      try {
        child.kill('SIGKILL');
      } catch {
        // already dead
      }
    }, KILL_GRACE_MS);

    child.once('exit', () => {
      clearTimeout(forceKillTimer);
      resolve();
    });

    try {
      child.kill('SIGTERM');
    } catch {
      clearTimeout(forceKillTimer);
      resolve();
    }
  });
}
