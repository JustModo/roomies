import path from 'path';
import type { ScannedEpisode, ScannedMedia } from '../types';
import { parseEpisodeFilename } from '../parser';

/** Processes a directory identified as a TV Show. */
export const processShow = (
  folderPath: string,
  folderName: string,
  videoFiles: string[]
): ScannedMedia | null => {
  if (videoFiles.length === 0) return null;

  const initialEpisodes = videoFiles.map((videoPath) => {
    const parsed = parseEpisodeFilename(videoPath);
    return { path: videoPath, parsed };
  });

  // Group by season
  const bySeason = new Map<number | null, typeof initialEpisodes>();
  for (const ep of initialEpisodes) {
    const s = ep.parsed.season;
    if (!bySeason.has(s)) bySeason.set(s, []);
    bySeason.get(s)!.push(ep);
  }

  const finalEpisodes: (ScannedEpisode & { sortNumber: number | null })[] = [];

  for (const group of bySeason.values()) {
    const counts = new Map<number, number>();
    for (const ep of group) {
      if (ep.parsed.episode !== null) {
        counts.set(ep.parsed.episode, (counts.get(ep.parsed.episode) || 0) + 1);
      }
    }

    const uniqueEpisodes = Array.from(counts.entries())
      .filter(([_, count]) => count === 1)
      .map(([epNum]) => epNum);

    for (const ep of group) {
      const epNum = ep.parsed.episode;
      let isValid = true;

      if (epNum === null) {
        isValid = false;
      } else if (counts.get(epNum)! > 1) {
        isValid = false;
      } else if (uniqueEpisodes.length > 1) {
        let minDist = Infinity;
        for (const other of uniqueEpisodes) {
          if (other !== epNum) {
            minDist = Math.min(minDist, Math.abs(other - epNum));
          }
        }
        if (minDist > 10) {
          isValid = false;
        }
      }

      const number = isValid ? ep.parsed.episode : null;
      const sortNumber = isValid ? ep.parsed.sortNumber : null;
      const baseFilename = path.basename(ep.path, path.extname(ep.path));
      const pad = (n: number) => String(n).padStart(2, '0');
      const formattedTitle =
        number !== null
          ? ep.parsed.season !== null
            ? `${folderName} S${pad(ep.parsed.season)}E${pad(number)}`
            : `${folderName} Episode ${number}`
          : baseFilename;

      finalEpisodes.push({
        path: ep.path,
        number,
        sortNumber,
        title: formattedTitle,
      });
    }
  }

  // Sort episodes: numbered episodes first (by cross-season sort key), then alphabetically
  finalEpisodes.sort((a, b) => {
    if (a.sortNumber !== null && b.sortNumber !== null) return a.sortNumber - b.sortNumber;
    if (a.sortNumber !== null) return -1;
    if (b.sortNumber !== null) return 1;
    return a.path.localeCompare(b.path);
  });

  return {
    path: folderPath,
    name: folderName,
    type: 'show',
    episodes: finalEpisodes.map(({ path, number, title }) => ({ path, number, title })),
  };
};
