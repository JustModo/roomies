import type { PlaybackState } from '@roomies/contracts';

export function positionFromAnchor(playback: PlaybackState, now: number, clockOffset = 0): number {
  if (playback.state !== 'playing') return playback.anchorPosition;
  return playback.anchorPosition + ((now + clockOffset - playback.anchorTime) / 1000) * playback.playbackRate;
}

export interface PingState {
  smoothed: number | null;
  clockOffset: number;
  quality: number;
  candidate: { tier: number; count: number };
}

export const INITIAL_PING: PingState = { smoothed: null, clockOffset: 0, quality: 0, candidate: { tier: 0, count: 0 } };

const SMOOTHING = 0.3;
const TIER_CONFIRMATIONS = 3;

const pingTier = (ms: number) => (ms >= 300 ? 2 : ms >= 150 ? 1 : 0);

export function nextPingState(prev: PingState, sentAt: number, serverTime: number, now: number): PingState {
  const raw = now - sentAt;
  const offsetSample = serverTime + raw / 2 - now;
  const first = prev.smoothed === null;
  const smoothed = first ? raw : prev.smoothed! * (1 - SMOOTHING) + raw * SMOOTHING;
  const clockOffset = first ? offsetSample : prev.clockOffset * (1 - SMOOTHING) + offsetSample * SMOOTHING;
  const tier = pingTier(smoothed);
  const candidate = prev.candidate.tier === tier ? { tier, count: prev.candidate.count + 1 } : { tier, count: 1 };
  const quality = candidate.count >= TIER_CONFIRMATIONS ? tier : prev.quality;
  return { smoothed, clockOffset, quality, candidate };
}

const BASE_RECONNECT_DELAY_MS = 1000;
const MAX_RECONNECT_DELAY_MS = 30000;
const RECONNECT_JITTER_MS = 300;

export const backoffDelay = (attempt: number, random: () => number = Math.random) =>
  Math.min(BASE_RECONNECT_DELAY_MS * 2 ** attempt, MAX_RECONNECT_DELAY_MS) + random() * RECONNECT_JITTER_MS;
