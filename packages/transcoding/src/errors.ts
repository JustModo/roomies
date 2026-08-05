import { Resolution } from './types';

/** Thrown when async playback requests a second resolution at an offset that already has one. */
export class AsyncOffsetResolutionLockedError extends Error {
  readonly lockedResolution: Resolution;
  readonly requestedResolution: Resolution;
  readonly offset: number;

  constructor(lockedResolution: Resolution, requestedResolution: Resolution, offset: number) {
    super(
      `Async offset ${offset} is locked to ${lockedResolution}; cannot start ${requestedResolution} (quality change requires a new offset)`
    );
    this.name = 'AsyncOffsetResolutionLocked';
    this.lockedResolution = lockedResolution;
    this.requestedResolution = requestedResolution;
    this.offset = offset;
  }
}
