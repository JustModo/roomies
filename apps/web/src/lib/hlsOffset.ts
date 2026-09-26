/**
 * Shared HLS offset / absolute-time helpers.
 *
 * Sync ownership: room `transcodeOffset` + broadcast `media.changed` drive the player.
 * Async ownership: member `asyncSession.transcodeOffset` + unicast `media.changed` (on reinit);
 * local play/pause/rate/status stay in `useAsyncPlayback`.
 * Both sync and async now advertise the full resolution ladder — quality switching is an
 * in-place hls.js `currentLevel` change in either mode, no server round-trip needed.
 */

/** Absolute media timeline time from video element time + active transcode offset. */
export function absolutePlaybackTime(videoCurrentTime: number, transcodeOffset: number): number {
  return videoCurrentTime + (transcodeOffset || 0);
}

/** HLS startPosition within the active offset window. */
export function relativeStartPosition(absoluteTime: number, transcodeOffset: number): number {
  return Math.max(0, absoluteTime - (transcodeOffset || 0));
}

/** Build master playlist URL with cache-bust and offset (incl. 0). */
export function buildHlsMasterUrl(
  hlsUrl: string,
  transcodeOffset: number,
  options?: { cacheBust?: number },
): string {
  const url = new URL(hlsUrl, typeof window !== 'undefined' ? window.location.origin : 'http://localhost');
  url.searchParams.set('t', String(options?.cacheBust ?? Date.now()));
  url.searchParams.set('offset', String(transcodeOffset || 0));
  return url.toString();
}
