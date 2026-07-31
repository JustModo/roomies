import fs from 'fs/promises';
import path from 'path';
import { Dirent } from 'fs';
import { VIDEO_EXTENSIONS, SUBTITLE_EXTENSIONS } from './config';
import type { ScannedMedia } from './types';
import { detectMediaType } from './detectors/mediaDetector';
import { processMovie } from './handlers/movieHandler';
import { processShow } from './handlers/showHandler';

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

/** Scans immediate subfolders of `rootPath` — each one is a title (movie or show). */
export const scanLibraryFolder = async (rootPath: string): Promise<ScannedMedia[]> => {
  const mediaList: ScannedMedia[] = [];
  const rootEntries = await listDir(rootPath);

  for (const entry of rootEntries) {
    if (!entry.isDirectory()) continue;

    const titleFolder = path.join(rootPath, entry.name);
    const titleFiles = await listFilesRecursive(titleFolder);

    const videoFiles = filterByExtension(titleFiles, VIDEO_EXTENSIONS);
    const subtitleFiles = filterByExtension(titleFiles, SUBTITLE_EXTENSIONS);

    if (videoFiles.length === 0) {
      console.warn(`[library] Skipping ${titleFolder}: no video files found`);
      continue;
    }

    const type = detectMediaType(entry.name, videoFiles);
    const scanned = type === 'movie'
      ? processMovie(titleFolder, entry.name, videoFiles, subtitleFiles)
      : processShow(titleFolder, entry.name, videoFiles, subtitleFiles);

    if (scanned) {
      mediaList.push(scanned);
    }
  }

  return mediaList;
};
