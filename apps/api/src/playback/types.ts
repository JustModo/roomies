import { SEGMENT_DURATION } from '@roomies/transcoding';

// ── Session Scope ──────────────────────────────────────────────────────

/** Discriminated union identifying who a playback session belongs to. */
export type SessionScope =
  | { type: 'room' }
  | { type: 'user'; userId: string };

/** Convert a SessionScope to the string key used by TranscodeSessionManager. */
export function sessionScopeToId(scope: SessionScope): string {
  return scope.type === 'room' ? 'sync' : 'async';
}

// ── Offset Policy ──────────────────────────────────────────────────────

/** Strategy for computing the transcoding start offset from an arbitrary seek position. */
export interface OffsetPolicy {
  align(position: number): number;
}

/**
 * Aligns to the nearest segment boundary, one segment before the target.
 * This is the standard policy — ensures the player always has a key-frame
 * to decode from while keeping alignment consistent with SEGMENT_DURATION.
 */
export class SegmentAlignedOffsetPolicy implements OffsetPolicy {
  constructor(private segmentDuration: number = SEGMENT_DURATION) {}

  align(position: number): number {
    return Math.max(
      0,
      Math.floor(position / this.segmentDuration) * this.segmentDuration - this.segmentDuration,
    );
  }
}

/** Singleton default policy instance. */
export const defaultOffsetPolicy = new SegmentAlignedOffsetPolicy();
