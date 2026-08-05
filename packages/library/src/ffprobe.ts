import { execFile } from 'child_process';
import { promisify } from 'util';
import { FFPROBE_PATH } from '@roomies/config';

const execFileAsync = promisify(execFile);

export const getMediaDuration = async (filePath: string): Promise<number> => {
  const { stdout } = await execFileAsync(FFPROBE_PATH, [
    '-v', 'error',
    '-show_entries', 'format=duration',
    '-of', 'default=noprint_wrappers=1:nokey=1',
    filePath,
  ]);
  const duration = parseFloat(stdout.trim());
  return isNaN(duration) ? 0 : Math.floor(duration);
};

export interface EmbeddedSubtitleStream {
  index: number;
  language: string | null;
}

const TEXT_SUBTITLE_CODECS = new Set(['subrip', 'ass', 'ssa', 'mov_text']);

/** Lists embedded text-based (non-image) subtitle streams in a video file. */
export const getEmbeddedTextSubtitleStreams = async (filePath: string): Promise<EmbeddedSubtitleStream[]> => {
  const { stdout } = await execFileAsync(FFPROBE_PATH, [
    '-v', 'error',
    '-select_streams', 's',
    '-show_entries', 'stream=index,codec_name:stream_tags=language',
    '-of', 'json',
    filePath,
  ]);
  const parsed = JSON.parse(stdout) as { streams?: { index: number; codec_name: string; tags?: { language?: string } }[] };
  return (parsed.streams ?? [])
    .filter((s) => TEXT_SUBTITLE_CODECS.has(s.codec_name))
    .map((s) => ({ index: s.index, language: s.tags?.language ?? null }));
};

export interface EmbeddedAudioStream {
  index: number;
  language: string | null;
  title: string | null;
  channels: number | null;
}

/** Lists embedded audio streams in a video file. */
export const getEmbeddedAudioStreams = async (filePath: string): Promise<EmbeddedAudioStream[]> => {
  const { stdout } = await execFileAsync(FFPROBE_PATH, [
    '-v', 'error',
    '-select_streams', 'a',
    '-show_entries', 'stream=index,channels:stream_tags=language,title',
    '-of', 'json',
    filePath,
  ]);
  const parsed = JSON.parse(stdout) as {
    streams?: { index: number; channels?: number; tags?: { language?: string; title?: string } }[];
  };
  return (parsed.streams ?? []).map((s) => ({
    index: s.index,
    language: s.tags?.language ?? null,
    title: s.tags?.title ?? null,
    channels: s.channels ?? null,
  }));
};
