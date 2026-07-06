import { ChildProcess } from 'child_process';
import { EventEmitter } from 'events';

/**
 * Supported output resolutions for HLS transcoding.
 */
export type Resolution = '360p' | '720p' | '1080p';

/**
 * Encoding parameters for a single resolution variant.
 */
export interface ResolutionConfig {
  width: number;
  height: number;
  videoBitrate: string;   // e.g. '800k'
  audioBitrate: string;   // e.g. '96k'
  maxRate: string;        // e.g. '856k'
  bufSize: string;        // e.g. '1200k'
}

/**
 * Runtime state of a single FFmpeg variant process.
 */
export interface VariantState {
  resolution: Resolution;
  process: ChildProcess | null;
  outputDir: string;
  isReady: boolean;       // true once the first segment is written
  isRunning: boolean;
  error: Error | null;
}

/**
 * Callback signature for transcoding error events.
 */
export type TranscodeErrorCallback = (resolution: Resolution, error: Error) => void;
