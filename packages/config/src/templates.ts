export const defaultConf = `
# Roomies Configuration File
# --------------------------
# Timezone for log timestamps and time-aware operations (IANA timezone name).
# Examples: UTC, America/New_York, Europe/London, Asia/Tokyo
# https://en.wikipedia.org/wiki/List_of_tz_database_time_zones
TZ=UTC

# FFmpeg video codec for transcoding
FFMPEG_VIDEO_CODEC=libx264

# FFmpeg encoding preset (ultrafast, veryfast, fast, medium, slow)
FFMPEG_PRESET=veryfast

# Hardware acceleration mode (auto, cpu)
HWACCEL_MODE=auto

# Allowed browser origins, comma separated (the CORS_ORIGIN environment variable takes priority)
# CORS_ORIGIN=http://localhost

# Maximum FFmpeg transcode processes running at once across the whole server (default: 2x CPU cores, minimum 4)
# MAX_CONCURRENT_VARIANTS=24
`.trim() + '\n';
