/** Mode policies for sync vs async playback sessions. */
import type { Resolution, ResolutionConfig } from '../types';
import { SUPPORTED_RESOLUTIONS, RESOLUTION_PRESETS } from './constants';

export interface PlaybackPolicy {
  sessionId: 'sync' | 'async';
  /** Resolutions transcoded together per offset. */
  variants: Resolution[];
  /** Whether to preserve the latest empty offset group when playheads leave. */
  keepLatestEmptyOffset: boolean;
}

export const SyncPolicy: PlaybackPolicy = {
  sessionId: 'sync',
  variants: SUPPORTED_RESOLUTIONS,
  keepLatestEmptyOffset: true,
};

export const AsyncPolicy: PlaybackPolicy = {
  sessionId: 'async',
  variants: SUPPORTED_RESOLUTIONS,
  keepLatestEmptyOffset: false,
};

export function policyForSessionId(sessionId: string): PlaybackPolicy {
  return sessionId === 'sync' ? SyncPolicy : AsyncPolicy;
}

/**
 * The frame a rung actually encodes: the source scaled to fit inside the rung's box with its
 * aspect ratio intact, rounded to even (h264 requires it) — matching ffmpeg's
 * `force_original_aspect_ratio=decrease:force_divisible_by=2`.
 *
 * Nothing is padded to the box. Padding would bake black bars into a non-16:9 source (24% of
 * every frame for a 2.35:1 rip), which the player then letterboxes a second time whenever its
 * container is not exactly 16:9. Encoding the real frame lets `object-contain` letterbox once.
 */
export function scaledResolution(preset: ResolutionConfig, sourceWidth: number, sourceHeight: number): { width: number; height: number } {
  if (!Number.isFinite(sourceWidth) || !Number.isFinite(sourceHeight) || sourceWidth <= 0 || sourceHeight <= 0) {
    return { width: preset.width, height: preset.height };
  }
  const scale = Math.min(preset.width / sourceWidth, preset.height / sourceHeight);
  const even = (v: number) => Math.max(2, Math.round((v * scale) / 2) * 2);
  return { width: even(sourceWidth), height: even(sourceHeight) };
}

/**
 * Rungs worth encoding for a source: those whose box does not enlarge it.
 *
 * Compares the actual scale factor, not the rung's box height against the source height.
 * Those differ for anything that isn't 16:9 — a 1920x816 scope film is a full-width 1080p
 * source, but its 816 height is below the 1080 rung's box, so a height comparison drops the
 * native rung and caps the film at 1280x544. By scale, the 1080p rung is exactly 1.0 (native,
 * no resampling) and is kept. An unknown source size scales to 0 here, so nothing is pruned.
 */
export function variantsForSource(variants: Resolution[], sourceWidth: number, sourceHeight: number): Resolution[] {
  const fitting = variants.filter((res) => {
    const preset = RESOLUTION_PRESETS[res];
    return Math.min(preset.width / sourceWidth, preset.height / sourceHeight) <= 1;
  });
  return fitting.length > 0 ? fitting : [variants[0]];
}
