/**
 * Adaptive bitrate quality profiles for HLS transcoding.
 *
 * Each profile produces a separate HLS variant stream. The master playlist
 * lists all variants so the client (Shaka Player) can switch quality based
 * on available bandwidth — exactly like Jellyfin's adaptive streaming.
 *
 * These can be overridden or reduced via the TRANSCODE_PROFILES env var
 * (comma-separated profile names, e.g. "720p,360p") for low-power hosts.
 */

export interface TranscodeProfile {
  /** Human-readable name, also used as the subdirectory name */
  name: string;
  width: number;
  height: number;
  /** Target video bitrate (ffmpeg -b:v syntax) */
  videoBitrate: string;
  /** Max video bitrate (ffmpeg -maxrate syntax) */
  maxRate: string;
  /** VBV buffer size (ffmpeg -bufsize syntax) */
  bufSize: string;
  /** Audio bitrate (ffmpeg -b:a syntax) */
  audioBitrate: string;
  /** BANDWIDTH value for the HLS master playlist #EXT-X-STREAM-INF tag (bps) */
  bandwidth: number;
}

const ALL_PROFILES: TranscodeProfile[] = [
  {
    name: '360p',
    width: 640,
    height: 360,
    videoBitrate: '600k',
    maxRate: '700k',
    bufSize: '1200k',
    audioBitrate: '96k',
    bandwidth: 700_000,
  },
  {
    name: '720p',
    width: 1280,
    height: 720,
    videoBitrate: '2500k',
    maxRate: '3000k',
    bufSize: '5000k',
    audioBitrate: '128k',
    bandwidth: 3_200_000,
  },
  {
    name: '1080p',
    width: 1920,
    height: 1080,
    videoBitrate: '5000k',
    maxRate: '6000k',
    bufSize: '10000k',
    audioBitrate: '192k',
    bandwidth: 6_200_000,
  },
];

/**
 * Returns the active set of transcode profiles.
 *
 * By default all three tiers are used. Set TRANSCODE_PROFILES to a
 * comma-separated list of profile names (e.g. "720p,360p") to restrict
 * which variants are generated — useful on low-power hardware where
 * running 3 simultaneous FFmpeg processes is too heavy.
 */
export const getActiveProfiles = (): TranscodeProfile[] => {
  const envFilter = process.env.TRANSCODE_PROFILES;
  if (!envFilter) return ALL_PROFILES;

  const requested = envFilter
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  const filtered = ALL_PROFILES.filter((p) => requested.includes(p.name));
  // Fall back to the full set if the env var contained no valid names
  return filtered.length > 0 ? filtered : ALL_PROFILES;
};
