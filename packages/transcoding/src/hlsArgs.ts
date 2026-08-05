import {
  SEGMENT_DURATION,
  HLS_LIST_SIZE,
  AUDIO_BITRATE,
} from './config';

/** Common HLS muxer flags used by both single-variant and grouped encodes. */
export function buildHlsMuxArgs(segmentPattern: string): string[] {
  return [
    '-f', 'hls',
    '-hls_time', String(SEGMENT_DURATION),
    '-hls_list_size', String(HLS_LIST_SIZE),
    '-hls_segment_type', 'mpegts',
    '-hls_flags', 'independent_segments+temp_file',
    '-hls_segment_filename', segmentPattern,
    '-hls_allow_cache', '1',
  ];
}

/** AAC audio encode flags for demuxed alternate-audio HLS outputs. */
export function buildSeparateAudioEncodeArgs(): string[] {
  return ['-c:a', 'aac', '-b:a', AUDIO_BITRATE, '-ac', '2'];
}

/**
 * Append one demuxed audio-track HLS output (map + encode + mux + playlist path).
 * Shared by TranscodeVariant and TranscodeVariantGroup.
 */
export function appendAudioTrackHlsOutput(
  args: string[],
  streamIndex: number,
  playlistPath: string,
  segmentPattern: string,
): void {
  args.push(
    '-map', `0:${streamIndex}`,
    ...buildSeparateAudioEncodeArgs(),
    ...buildHlsMuxArgs(segmentPattern),
    playlistPath,
  );
}
