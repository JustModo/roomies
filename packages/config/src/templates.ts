export const defaultConf = `
# Roomies Configuration File
# --------------------------
# All configuration properties strictly controlled here.
# Do not rely on environment variables for overrides.

# Internal Server Port
PORT=3000

# CORS Origin for the web frontend
CORS_ORIGIN=http://localhost

# FFmpeg video codec for transcoding
FFMPEG_VIDEO_CODEC=libx264

# FFmpeg encoding preset (ultrafast, veryfast, fast, medium, slow)
FFMPEG_PRESET=veryfast

# Hardware acceleration mode (auto, cpu)
HWACCEL_MODE=auto
`.trim() + '\n';
