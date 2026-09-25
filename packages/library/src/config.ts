import type { Config } from '@roomies/config';

export const VIDEO_EXTENSIONS = ['.mp4', '.mkv', '.webm'];
export const SUBTITLE_EXTENSIONS = ['.srt', '.vtt', '.ass', '.ssa'];

export const SCAN_CONCURRENCY = 4;
export const PROBE_CONCURRENCY = 4;
export const PROBE_TIMEOUT_MS = 30_000;

/** The slice of server config the library scanner runs on. */
export interface LibraryOptions {
  readonly mediaRoot: string;
  readonly subtitleDataDir: string;
  readonly ffmpegPath: string;
  readonly ffprobePath: string;
}

export const libraryOptionsFrom = (config: Config): LibraryOptions => ({
  mediaRoot: config.MEDIA_ROOT,
  subtitleDataDir: config.SUBTITLE_DATA_DIR,
  ffmpegPath: config.FFMPEG_PATH,
  ffprobePath: config.FFPROBE_PATH,
});
