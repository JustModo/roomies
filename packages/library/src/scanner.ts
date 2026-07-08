import fs from 'fs/promises';
import path from 'path';
import { Dirent } from 'fs';
import { VIDEO_EXTENSIONS, SUBTITLE_EXTENSIONS, IMAGE_EXTENSIONS } from './constants';
import { ScannedEpisode, ScannedSeason, ScannedTitle } from './types';

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

const parseSeasonNumber = (name: string): number | null => {
  const match = name.match(/season\s*(\d+)/i);
  return match ? parseInt(match[1], 10) : null;
};

/** Builds the episodes for a folder that contains video files directly. */
const buildEpisodes = (folder: string, files: Dirent[]): ScannedEpisode[] => {
  const videoNames = byExtension(files, VIDEO_EXTENSIONS);
  const subtitlePaths = byExtension(files, SUBTITLE_EXTENSIONS).map((name) => path.join(folder, name));
  return videoNames.map((name) => ({
    path: path.join(folder, name),
    number: null,
    subtitlePaths,
  }));
};

const findCover = (folder: string, files: Dirent[]): string | null => {
  const [cover] = byExtension(files, IMAGE_EXTENSIONS);
  return cover ? path.join(folder, cover) : null;
};

/** Scans immediate subfolders of `rootPath`, classifying each as a movie or a show. */
export const scanLibraryFolder = async (rootPath: string): Promise<ScannedTitle[]> => {
  const titles: ScannedTitle[] = [];
  const rootEntries = await listDir(rootPath);

  for (const entry of rootEntries) {
    if (!entry.isDirectory()) continue;

    const titleFolder = path.join(rootPath, entry.name);
    const titleFiles = await listDir(titleFolder);
    const directVideos = byExtension(titleFiles, VIDEO_EXTENSIONS);

    if (directVideos.length > 0) {
      // NOTE: A folder with video files directly in it is a movie — first video wins.
      const episode: ScannedEpisode = {
        path: path.join(titleFolder, directVideos[0]),
        number: null,
        subtitlePaths: byExtension(titleFiles, SUBTITLE_EXTENSIONS).map((name) => path.join(titleFolder, name)),
      };
      titles.push({
        path: titleFolder,
        name: entry.name,
        type: 'movie',
        coverPath: findCover(titleFolder, titleFiles),
        seasons: [{ path: titleFolder, name: '', number: null, episodes: [episode] }],
      });
      continue;
    }

    const subDirs = titleFiles.filter((f) => f.isDirectory());
    const seasons: ScannedSeason[] = [];
    for (const subDir of subDirs) {
      const seasonFolder = path.join(titleFolder, subDir.name);
      const seasonFiles = await listDir(seasonFolder);
      const episodes = buildEpisodes(seasonFolder, seasonFiles);
      if (episodes.length === 0) continue;
      seasons.push({
        path: seasonFolder,
        name: subDir.name,
        number: parseSeasonNumber(subDir.name),
        episodes,
      });
    }

    if (seasons.length === 0) {
      console.warn(`[library] Skipping ${titleFolder}: no video files found`);
      continue;
    }

    titles.push({
      path: titleFolder,
      name: entry.name,
      type: 'show',
      coverPath: findCover(titleFolder, titleFiles),
      seasons,
    });
  }

  return titles;
};
