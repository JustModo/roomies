import { SEGMENT_DURATION } from './config';

/**
 * Aligns a given seek position to the nearest segment boundary,
 * ensuring the player has a key-frame to decode from while
 * keeping alignment consistent with SEGMENT_DURATION.
 */
export function getAlignedPosition(position: number): number {
  return Math.max(
    0,
    Math.floor(position / SEGMENT_DURATION) * SEGMENT_DURATION - SEGMENT_DURATION,
  );
}
