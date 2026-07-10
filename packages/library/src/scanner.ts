import fs from 'fs/promises';
import path from 'path';
import { Dirent } from 'fs';
import { VIDEO_EXTENSIONS, SUBTITLE_EXTENSIONS, IMAGE_EXTENSIONS } from './constants';
import { ScannedEpisode, ScannedMovie } from './types';

const listDir = async (dir: string): Promise<Dirent[]> => {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  // NOTE: Skips symlinks to prevent directory traversal escapes.
  return entries.filter((entry) => !entry.isSymbolicLink());
};

const byExtension = (files: Dirent[], extensions: string[]): string[] =>
  files
    .filter((f) => f.isFile() && extensions.includes(path.extname(f.name).toLowerCase()))
    .map((f) => f.name)
    .sort((a, b) => a.localeCompare(b));

const stem = (name: string): string => path.basename(name, path.extname(name)).toLowerCase();

/** Best-effort episode number parse: SxxEyy, Exx, leading number, trailing number. */
const parseEpisodeNumber = (name: string): number | null => {
  const base = path.basename(name, path.extname(name));

  const seasonEpisode = base.match(/s\d+\s*e(\d+)/i);
  if (seasonEpisode) return parseInt(seasonEpisode[1], 10);

  const episodeOnly = base.match(/e(\d+)/i);
  if (episodeOnly) return parseInt(episodeOnly[1], 10);

  const leading = base.match(/^(\d+)/);
  if (leading) return parseInt(leading[1], 10);

  const trailing = base.match(/(\d+)$/);
  if (trailing) return parseInt(trailing[1], 10);

  return null;
};

/** Exact case-insensitive filename-stem match; returns the matched subtitle's full name, or null. */
const matchSubtitle = (videoName: string, subtitleNames: string[]): string | null => {
  const videoStem = stem(videoName);
  return subtitleNames.find((s) => stem(s) === videoStem) ?? null;
};

const findCover = (folder: string, files: Dirent[]): string | null => {
  const [cover] = byExtension(files, IMAGE_EXTENSIONS);
  return cover ? path.join(folder, cover) : null;
};

/** Builds the sorted episode list for a title folder from its video + subtitle files. */
const buildEpisodes = (folder: string, files: Dirent[]): ScannedEpisode[] => {
  const videoNames = byExtension(files, VIDEO_EXTENSIONS);
  const subtitleNames = byExtension(files, SUBTITLE_EXTENSIONS);

  const episodes = videoNames.map((name) => {
    const subtitleName = matchSubtitle(name, subtitleNames);
    return {
      path: path.join(folder, name),
      number: parseEpisodeNumber(name),
      subtitlePath: subtitleName ? path.join(folder, subtitleName) : null,
    };
  });

  return episodes.sort((a, b) => {
    if (a.number !== null && b.number !== null) return a.number - b.number;
    if (a.number !== null) return -1;
    if (b.number !== null) return 1;
    return a.path.localeCompare(b.path);
  });
};

/** Scans immediate subfolders of `rootPath` — each one is a title (movie or show), flat, no season nesting. */
export const scanLibraryFolder = async (rootPath: string): Promise<ScannedMovie[]> => {
  const movies: ScannedMovie[] = [];
  const rootEntries = await listDir(rootPath);

  for (const entry of rootEntries) {
    if (!entry.isDirectory()) continue;

    const titleFolder = path.join(rootPath, entry.name);
    const titleFiles = await listDir(titleFolder);
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
