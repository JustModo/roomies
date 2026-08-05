/**
 * Mode policies for sync vs async playback sessions.
 * Feature work should prefer adjusting policy here over forking encode/playlist paths.
 */
import type { Resolution } from './types';

export type EncodeStrategy = 'grouped' | 'perResolution';
export type SeekNotifyPolicy = 'broadcast' | 'unicastIfReinit';

export interface PlaybackModePolicy {
  sessionId: 'sync' | 'async';
  encode: EncodeStrategy;
  /** Resolutions to start on seek / media change. Empty = cold start until first playlist hit. */
  prewarmOnSeek: Resolution[];
  /** Keep the latest empty offset group around (sync) vs GC empty groups (async). */
  keepLatestEmptyOffset: boolean;
  /** SIGSTOP unused resolutions when not actively watched (async only). */
  throttleUnused: boolean;
  seekNotify: SeekNotifyPolicy;
}

export const SyncPolicy: PlaybackModePolicy = {
  sessionId: 'sync',
  encode: 'grouped',
  prewarmOnSeek: ['360p', '720p', '1080p'],
  keepLatestEmptyOffset: true,
  throttleUnused: false,
  seekNotify: 'broadcast',
};

export const AsyncPolicy: PlaybackModePolicy = {
  sessionId: 'async',
  encode: 'perResolution',
  // Prewarm active resolution only — filled at call sites with current res; default empty list
  // means "use caller's resolution" rather than all three.
  prewarmOnSeek: [],
  keepLatestEmptyOffset: false,
  throttleUnused: true,
  seekNotify: 'unicastIfReinit',
};

export function policyForSessionId(sessionId: string): PlaybackModePolicy {
  return sessionId === 'sync' ? SyncPolicy : AsyncPolicy;
}
