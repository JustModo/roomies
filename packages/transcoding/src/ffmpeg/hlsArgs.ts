import {
  SEGMENT_DURATION,
  HLS_LIST_SIZE,
  AUDIO_BITRATE,
  AUDIO_BITRATE_CEILING,
} from '../config/config';

/** Picks an AAC bitrate for a rung. Stream-copying the source instead is not an option here:
 *  `-c:a copy` cannot be accurately input-seeked, so at any transcode offset > 0 the copied
 *  audio starts a whole source GOP (5.3s on a YTS x264 rip) ahead of the filtered video.
 *  So we always re-encode, but never below the source — an AAC->AAC pass under the source
 *  bitrate is the dulling viewers notice — with headroom for the tandem generation loss. */
export function audioBitrateFor(rungBitrate: string, sourceBitrate?: number): string {
  if (!sourceBitrate) return rungBitrate;
  const rung = parseInt(rungBitrate, 10) * 1000;
  const floor = Math.min(AUDIO_BITRATE_CEILING, Math.round(sourceBitrate * 1.5));
  return floor > rung ? `${Math.round(floor / 1000)}k` : rungBitrate;
}

/** Rebuilds audio timestamps against the sample clock before encoding.
 *  Some rips (YTS remuxes especially) ship a jittered MP4 sample-duration table — AAC-LC
 *  frames declared as 1008/1056/990/even 1 sample instead of the mandatory 1024. The samples
 *  themselves are continuous, only the container timing lies, so nothing errors and the audio
 *  measures clean; but ffmpeg follows those timestamps and the reconciliation surfaces as
 *  10-75ms holes at HLS segment boundaries — audible stutter with the video unaffected.
 *  async=1 stretches/pads to the timestamps rather than trusting the frame count, so a source
 *  with genuine gaps stays in sync instead of drifting (which `asetpts` would cause). */
export const AUDIO_TIMESTAMP_FIX = ['-af', 'aresample=async=1'];

/** Common per-output HLS flags used by both single-variant and grouped encodes. */
export function buildHlsMuxArgs(segmentPattern: string): string[] {
  return [
    '-threads', '0',
    '-avoid_negative_ts', 'make_zero',
    '-f', 'hls',
    // mpegts defaults to a 0.7s muxdelay/0.5s muxpreload offset, which makes audio PTS
    // jump backwards ~40ms at nearly every segment cut (audible glitch every segment).
    '-muxdelay', '0',
    '-muxpreload', '0',
    '-hls_time', String(SEGMENT_DURATION),
    '-hls_list_size', String(HLS_LIST_SIZE),
    '-hls_segment_type', 'mpegts',
    '-hls_flags', 'independent_segments+temp_file',
    '-hls_segment_filename', segmentPattern,
    '-hls_allow_cache', '1',
  ];
}

/** AAC audio encode flags for demuxed alternate-audio HLS outputs. */
export function buildSeparateAudioEncodeArgs(sourceBitrate?: number): string[] {
  return [...AUDIO_TIMESTAMP_FIX, '-c:a', 'aac', '-b:a', audioBitrateFor(AUDIO_BITRATE, sourceBitrate), '-ac', '2'];
}

/**
 * Append one demuxed audio-track HLS output (map + encode + mux + playlist path).
 * Shared by TranscodeWorker.
 */
export function appendAudioTrackHlsOutput(
  args: string[],
  streamIndex: number,
  playlistPath: string,
  segmentPattern: string,
  sourceBitrate?: number,
): void {
  args.push(
    '-map', `0:${streamIndex}`,
    ...buildSeparateAudioEncodeArgs(sourceBitrate),
    ...buildHlsMuxArgs(segmentPattern),
    playlistPath,
  );
}
