/**
 * Mode policies for sync vs async playback sessions.
 * Feature work should prefer adjusting policy here over forking worker/playlist paths.
 */
import type { Resolution } from '../types';
import { SUPPORTED_RESOLUTIONS } from './config';

export type SeekNotifyPolicy = 'broadcast' | 'unicastIfReinit';

export interface PlaybackPolicy {
  sessionId: 'sync' | 'async';
  /** Resolutions this mode's worker always transcodes together per offset. Defaults to every
   *  supported resolution for both modes; narrow this list (e.g. to save CPU) without touching
   *  any other file. */
  variants: Resolution[];
  /** Keep the latest empty offset group around (sync — global playhead always returns) vs
   *  GC empty groups after the grace period (async — playheads can leave for good). */
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
