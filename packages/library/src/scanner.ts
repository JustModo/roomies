import fs from 'fs/promises';
import path from 'path';
import { Dirent } from 'fs';
import type { Logger } from '@roomies/config';
import { VIDEO_EXTENSIONS } from './config';
import type { ScannedMedia } from './types';
import { detectMediaType } from './detectors/mediaDetector';
import { processMovie, isSampleOrTrailer } from './handlers/movieHandler';
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
export const scanLibraryFolder = async (rootPath: string, log?: Logger): Promise<ScannedMedia[]> => {
  const mediaList: ScannedMedia[] = [];
  const rootEntries = await listDir(rootPath);

  for (const entry of rootEntries) {
    if (!entry.isDirectory()) continue;

    const titleFolder = path.join(rootPath, entry.name);
    const titleFiles = await listFilesRecursive(titleFolder);

    const videoFiles = filterByExtension(titleFiles, VIDEO_EXTENSIONS);

    if (videoFiles.length === 0) {
      log?.warn({ folder: titleFolder }, 'Skipping folder with no video files');
      continue;
    }

    const countableVideos = videoFiles.filter((p) => !isSampleOrTrailer(p));
    const type = detectMediaType(entry.name, countableVideos.length > 0 ? countableVideos : videoFiles);
    const scanned = type === 'movie' ? processMovie(titleFolder, entry.name, videoFiles) : processShow(titleFolder, entry.name, videoFiles);

    if (scanned) {
      mediaList.push(scanned);
    }
  }

  return mediaList;
};
