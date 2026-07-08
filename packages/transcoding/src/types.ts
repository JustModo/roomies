import { ChildProcess } from 'child_process';

export type Resolution = '360p' | '720p' | '1080p';

export interface ResolutionConfig {
  width: number;
  height: number;
  videoBitrate: string;
  audioBitrate: string;
  maxRate: string;
  bufSize: string;
}

export interface VariantState {
  resolution: Resolution;
  process: ChildProcess | null;
  outputDir: string;
  isReady: boolean;
  isRunning: boolean;
  error: Error | null;
}

export type TranscodeErrorCallback = (resolution: Resolution, error: Error) => void;

export type HardwareEncoder = 'vaapi' | 'nvenc' | 'qsv' | 'cpu';
