import { execFile } from 'child_process';
import { promisify } from 'util';
import { PROBE_TIMEOUT_MS } from './config';

export interface EmbeddedSubtitleStream {
  index: number;
  language: string | null;
}

export interface EmbeddedAudioStream {
  index: number;
  language: string | null;
  title: string | null;
  channels: number | null;
  isDefault: boolean;
}

interface ProbedStream {
  index: number;
  codec_name?: string;
  channels?: number;
  tags?: { language?: string; title?: string };
  disposition?: { default?: number };
}

const execFileAsync = promisify(execFile);

const TEXT_SUBTITLE_CODECS = ['subrip', 'ass', 'ssa', 'mov_text', 'webvtt'];

/** Reads media metadata through ffprobe. */
export class MediaProbe {
  constructor(private readonly ffprobePath: string) {}

  async duration(filePath: string): Promise<number> {
    const stdout = await this.run(['-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', filePath]);
    const duration = parseFloat(stdout.trim());
    return isNaN(duration) ? 0 : Math.floor(duration);
  }

  /** Lists embedded text-based (non-image) subtitle streams in a video file. */
  async textSubtitleStreams(filePath: string): Promise<EmbeddedSubtitleStream[]> {
    const streams = await this.streams(filePath, 's', 'stream=index,codec_name:stream_tags=language');
    return streams
      .filter((s) => s.codec_name && TEXT_SUBTITLE_CODECS.includes(s.codec_name))
      .map((s) => ({ index: s.index, language: s.tags?.language ?? null }));
  }

  /** Lists embedded audio streams in a video file, in container order. */
  async audioStreams(filePath: string): Promise<EmbeddedAudioStream[]> {
    const streams = await this.streams(filePath, 'a', 'stream=index,channels:stream_tags=language,title:stream_disposition=default');
    return streams.map((s) => ({
      index: s.index,
      language: s.tags?.language ?? null,
      title: s.tags?.title ?? null,
      channels: s.channels ?? null,
      isDefault: s.disposition?.default === 1,
    }));
  }

  private async streams(filePath: string, selector: string, entries: string): Promise<ProbedStream[]> {
    const stdout = await this.run(['-select_streams', selector, '-show_entries', entries, '-of', 'json', filePath]);
    return (JSON.parse(stdout) as { streams?: ProbedStream[] }).streams ?? [];
  }

  private async run(args: string[]): Promise<string> {
    const { stdout } = await execFileAsync(this.ffprobePath, ['-v', 'error', ...args], { timeout: PROBE_TIMEOUT_MS });
    return stdout;
  }
}
