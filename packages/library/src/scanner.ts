import fs from 'fs/promises';
import path from 'path';
import { Dirent } from 'fs';
import { VIDEO_EXTENSIONS, SUBTITLE_EXTENSIONS, IMAGE_EXTENSIONS } from './constants';
import { ScannedEpisode, ScannedMovie } from './types';
import { parseEpisodeFilename } from './parser';

const listDir = async (dir: string): Promise<Dirent[]> => {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  // NOTE: Skips symlinks to prevent directory traversal escapes.
  return entries.filter((entry) => !entry.isSymbolicLink());
};

const listFilesRecursive = async (dir: string): Promise<string[]> => {
  let results: string[] = [];
  const entries = await listDir(dir);
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results = results.concat(await listFilesRecursive(fullPath));
    } else if (entry.isFile()) {
      results.push(fullPath);
    }
  }
  return results;
};

const filterByExtension = (paths: string[], extensions: string[]): string[] =>
  paths.filter((p) => extensions.includes(path.extname(p).toLowerCase()));

const stem = (name: string): string => path.basename(name, path.extname(name)).toLowerCase();

/** Exact case-insensitive filename-stem match; returns the matched subtitle's full path, or null. */
const matchSubtitle = (videoPath: string, subtitlePaths: string[]): string | null => {
  const videoStem = stem(videoPath);
  // Match in same directory first, or anywhere if unique name
  return subtitlePaths.find((s) => stem(s) === videoStem) ?? null;
};

const findCover = (folder: string, allFiles: string[]): string | null => {
  // Look for cover in the root of the title folder
  const covers = filterByExtension(allFiles, IMAGE_EXTENSIONS);
  const rootCovers = covers.filter(c => path.dirname(c) === folder);
  return rootCovers.length > 0 ? rootCovers[0] : (covers.length > 0 ? covers[0] : null);
};

/** Builds the sorted episode list for a title folder from its video + subtitle files. */
const buildEpisodes = (folder: string, allFiles: string[]): ScannedEpisode[] => {
  const videoPaths = filterByExtension(allFiles, VIDEO_EXTENSIONS);
  const subtitlePaths = filterByExtension(allFiles, SUBTITLE_EXTENSIONS);

  const initialEpisodes = videoPaths.map((videoPath) => {
    const subtitlePath = matchSubtitle(videoPath, subtitlePaths);
    const parsed = parseEpisodeFilename(videoPath);
    return { path: videoPath, parsed, subtitlePath };
  });

  const bySeason = new Map<number | null, typeof initialEpisodes>();
  for (const ep of initialEpisodes) {
    const s = ep.parsed.season;
    if (!bySeason.has(s)) bySeason.set(s, []);
    bySeason.get(s)!.push(ep);
  }

  const finalEpisodes: ScannedEpisode[] = [];

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

      if (isValid) {
        finalEpisodes.push({
          path: ep.path,
          number: ep.parsed.sortNumber,
          title: ep.parsed.title,
          subtitlePath: ep.subtitlePath,
        });
      } else {
        finalEpisodes.push({
          path: ep.path,
          number: null,
          title: path.basename(ep.path, path.extname(ep.path)),
          subtitlePath: ep.subtitlePath,
        });
      }
    }
  }

  return finalEpisodes.sort((a, b) => {
    if (a.number !== null && b.number !== null) return a.number - b.number;
    if (a.number !== null) return -1;
    if (b.number !== null) return 1;
    return a.path.localeCompare(b.path);
  });
};

/** Scans immediate subfolders of `rootPath` — each one is a title (movie or show). */
export const scanLibraryFolder = async (rootPath: string): Promise<ScannedMovie[]> => {
  const movies: ScannedMovie[] = [];
  const rootEntries = await listDir(rootPath);

  for (const entry of rootEntries) {
    if (!entry.isDirectory()) continue;

    const titleFolder = path.join(rootPath, entry.name);
    const titleFiles = await listFilesRecursive(titleFolder);
    const episodes = buildEpisodes(titleFolder, titleFiles);

    if (episodes.length === 0) {
      console.warn(`[library] Skipping ${titleFolder}: no video files found`);
      continue;
    }

    movies.push({
      path: titleFolder,
      name: entry.name,
      type: episodes.length > 1 ? 'show' : 'movie',
      coverPath: findCover(titleFolder, titleFiles),
      episodes,
    });
  }

  return movies;
};
