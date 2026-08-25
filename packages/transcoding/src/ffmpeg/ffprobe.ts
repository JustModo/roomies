import { execFile } from 'child_process';
import { promisify } from 'util';
import { FFPROBE_PATH } from '@roomies/config';
import { PROBE_TIMEOUT_MS } from '../config/config';

const execFileAsync = promisify(execFile);

const DEFAULT_FPS = 24;
// Unknown height must never prune the resolution ladder, so default "as tall as the tallest rung".
const DEFAULT_HEIGHT = Number.POSITIVE_INFINITY;
const DEFAULT_WIDTH = Number.POSITIVE_INFINITY;

export interface SourceVideoInfo {
  fps: number;
  width: number;
  height: number;
  /** Default audio track's bit rate in bits/s, so rungs never encode below the source. */
  audioBitrate?: number;
}

interface ProbeStream {
  codec_type?: string;
  bit_rate?: string;
  r_frame_rate?: string;
  width?: number;
  height?: number;
}

/** Parses an ffprobe r_frame_rate value (e.g. "24000/1001" or "25/1") into a float. */
const parseFrameRate = (value: string): number => {
  const [num, den] = value.split('/').map(Number);
  if (!den) return num;
  return num / den;
};

/** Probes the first video stream's frame rate (GOP sizing) and height (resolution-ladder
 *  pruning) plus the default audio track's bit rate (encode-bitrate floor) in a single
 *  ffprobe call, with a timeout so a stuck probe can't hang the caller. */
export const getSourceVideoInfo = async (filePath: string): Promise<SourceVideoInfo> => {
  try {
    const { stdout } = await execFileAsync(FFPROBE_PATH, [
      '-v', 'error',
      '-show_entries', 'stream=codec_type,bit_rate,r_frame_rate,width,height',
      '-of', 'json',
      filePath,
    ], { timeout: PROBE_TIMEOUT_MS });

    const streams: ProbeStream[] = JSON.parse(stdout).streams ?? [];
    const video = streams.find(s => s.codec_type === 'video');
    const audio = streams.find(s => s.codec_type === 'audio');

    const fps = parseFrameRate(video?.r_frame_rate ?? '');
    const width = Number(video?.width);
    const height = Number(video?.height);
    const audioBitrate = Number(audio?.bit_rate);

    return {
      fps: Number.isFinite(fps) && fps > 0 ? fps : DEFAULT_FPS,
      width: Number.isFinite(width) && width > 0 ? width : DEFAULT_WIDTH,
      height: Number.isFinite(height) && height > 0 ? height : DEFAULT_HEIGHT,
      audioBitrate: Number.isFinite(audioBitrate) && audioBitrate > 0 ? audioBitrate : undefined,
    };
  } catch {
    return { fps: DEFAULT_FPS, width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT };
  }
};
