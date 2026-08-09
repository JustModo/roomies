/** Mode policies for sync vs async playback sessions. */
import type { Resolution } from '../types';
import { SUPPORTED_RESOLUTIONS, RESOLUTION_PRESETS } from './config';

export type SeekNotifyPolicy = 'broadcast' | 'unicastIfReinit';

export interface PlaybackPolicy {
  sessionId: 'sync' | 'async';
  /** Resolutions transcoded together per offset. */
  variants: Resolution[];
  /** Whether to preserve the latest empty offset group when playheads leave. */
  keepLatestEmptyOffset: boolean;
  seekNotify: SeekNotifyPolicy;
}

export const SyncPolicy: PlaybackPolicy = {
  sessionId: 'sync',
  variants: SUPPORTED_RESOLUTIONS,
  keepLatestEmptyOffset: true,
  seekNotify: 'broadcast',
};

export const AsyncPolicy: PlaybackPolicy = {
  sessionId: 'async',
  variants: SUPPORTED_RESOLUTIONS,
  keepLatestEmptyOffset: false,
  seekNotify: 'unicastIfReinit',
};

export function policyForSessionId(sessionId: string): PlaybackPolicy {
  return sessionId === 'sync' ? SyncPolicy : AsyncPolicy;
}

/** Drops resolution rungs that upscale a source shorter than their target height. */
export function variantsForSourceHeight(variants: Resolution[], sourceHeight: number): Resolution[] {
  const fitting = variants.filter(res => RESOLUTION_PRESETS[res].height <= sourceHeight);
  return fitting.length > 0 ? fitting : [variants[0]];
}
