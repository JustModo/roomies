export const VIDEO_EXTENSIONS = ['.mp4', '.mkv', '.webm'];
export const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp'];

export const SCAN_CONCURRENCY = 4;

export const LIBRARY_CONFIG = {
  VIDEO_EXTENSIONS,
  IMAGE_EXTENSIONS,
  SCAN_CONCURRENCY,
} as const;
