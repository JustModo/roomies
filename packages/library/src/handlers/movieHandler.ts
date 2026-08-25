import path from 'path';
import type { ScannedMedia } from '../types';

/** Processes a directory identified as a Movie. */
export const processMovie = (
  folderPath: string,
  folderName: string,
  videoFiles: string[]
): ScannedMedia | null => {
  if (videoFiles.length === 0) return null;

  // Filter out common sample/trailer files if multiple video files exist in movie directory
  const nonSamples = videoFiles.filter(
    (p) => !path.basename(p).toLowerCase().includes('sample') && !path.basename(p).toLowerCase().includes('trailer')
  );

  const mainVideoPath = nonSamples.length > 0 ? nonSamples[0] : videoFiles[0];

  return {
    path: folderPath,
    name: folderName,
    type: 'movie',
    episodes: [
      {
        path: mainVideoPath,
        number: null,
        title: folderName,
      },
    ],
  };
};
