import path from 'path';

/** Determines whether a media directory represents a 'movie' or a 'show'. */
export const detectMediaType = (folderName: string, videoFiles: string[]): 'movie' | 'show' => {
  // 1. Multiple video files in a folder indicates a TV show (episodes)
  if (videoFiles.length > 1) {
    return 'show';
  }

  // 2. Single video file in a title directory:
  // Default to 'movie' unless there are explicit TV show indicators (Season subfolder or S01E01 format)
  if (videoFiles.length === 1) {
    const filePath = videoFiles[0];
    const fileName = path.basename(filePath).toLowerCase();

    // Explicit S01E01, 1x01, or Episode 01 markers
    const hasExplicitEpisodePattern =
      /s\d+\s*e\d+/i.test(fileName) ||
      /(?:^|\s|[\[\(])\d+x\d+(?:\s|[\]\)]|$)/i.test(fileName) ||
      /(?:ep(?:isode)?)\s*[\._-]?\s*\d+/i.test(fileName);

    // Season folder structure (e.g. /Season 01/ or /Season 1/)
    const hasSeasonSubfolder = /[\\/]season\s*\d+/i.test(filePath);

    if (hasExplicitEpisodePattern || hasSeasonSubfolder) {
      return 'show';
    }

    return 'movie';
  }

  return 'movie';
};
