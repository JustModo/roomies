/**
 * Shared HLS offset / absolute-time helpers.
 *
 * Sync ownership: room `transcodeOffset` + broadcast `media.changed` drive the player.
 * Async ownership: member `asyncSession.transcodeOffset` + unicast `media.changed` (on reinit);
 * local play/pause/rate/status stay in `useAsyncPlayback`.
 * Async: one video quality per offset — pass preferred `res` so the master advertises only that ladder.
 */

/** Absolute media timeline time from video element time + active transcode offset. */
export function absolutePlaybackTime(videoCurrentTime: number, transcodeOffset: number): number {
  return videoCurrentTime + (transcodeOffset || 0);
}

/** HLS startPosition within the active offset window. */
export function relativeStartPosition(absoluteTime: number, transcodeOffset: number): number {
  return Math.max(0, absoluteTime - (transcodeOffset || 0));
}

export type PreferredResolution = '360p' | '720p' | '1080p';

/** Build master playlist URL with cache-bust, offset (incl. 0), and optional preferred res for async. */
export function buildHlsMasterUrl(
  hlsUrl: string,
  transcodeOffset: number,
  options?: { cacheBust?: number; preferredResolution?: PreferredResolution },
): string {
  const url = new URL(hlsUrl, typeof window !== 'undefined' ? window.location.origin : 'http://localhost');
  url.searchParams.set('t', String(options?.cacheBust ?? Date.now()));
  url.searchParams.set('offset', String(transcodeOffset || 0));
  if (options?.preferredResolution) {
    url.searchParams.set('res', options.preferredResolution);
  }
  return url.toString();
}

/** Fixed quality menu options for async (master only advertises the active one). */
export const ASYNC_QUALITY_OPTIONS: Array<{ name: PreferredResolution; height: number }> = [
  { name: '360p', height: 360 },
  { name: '720p', height: 720 },
  { name: '1080p', height: 1080 },
];
