import fs from 'fs/promises';
import path from 'path';
import { Dirent } from 'fs';
import { VIDEO_EXTENSIONS, SUBTITLE_EXTENSIONS } from './constants';
import { ScannedEpisode, ScannedMedia, ScannedSubtitle } from './types';
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

/** Alias table mapping common language tokens (found in sidecar filenames) to a normalized ISO-639-1 code. */
const LANGUAGE_ALIASES: Record<string, string> = {
  en: 'en', eng: 'en', english: 'en',
  fr: 'fr', fre: 'fr', fra: 'fr', french: 'fr',
  es: 'es', spa: 'es', spanish: 'es',
  de: 'de', ger: 'de', deu: 'de', german: 'de',
  it: 'it', ita: 'it', italian: 'it',
  pt: 'pt', por: 'pt', portuguese: 'pt',
  ru: 'ru', rus: 'ru', russian: 'ru',
  ja: 'ja', jpn: 'ja', japanese: 'ja',
  ko: 'ko', kor: 'ko', korean: 'ko',
  zh: 'zh', chi: 'zh', zho: 'zh', chinese: 'zh',
  ar: 'ar', ara: 'ar', arabic: 'ar',
  hi: 'hi', hin: 'hi', hindi: 'hi',
  nl: 'nl', dut: 'nl', nld: 'nl', dutch: 'nl',
};

// NOTE: '-' is deliberately excluded to avoid colliding with episode-numbering conventions in parser.ts.
const SUBTITLE_SEPARATORS = ['.', '_', ' '];

/** Matches all sidecar subtitle files for a video: exact stem match (language unknown), or stem + separator + a recognized language token. */
const matchSubtitles = (videoPath: string, subtitlePaths: string[]): ScannedSubtitle[] => {
  const videoStem = stem(videoPath);
  const matches: ScannedSubtitle[] = [];

  for (const subPath of subtitlePaths) {
    const subStem = stem(subPath);
    if (subStem === videoStem) {
      matches.push({ path: subPath, language: null });
      continue;
    }

    for (const sep of SUBTITLE_SEPARATORS) {
      const prefix = videoStem + sep;
      if (subStem.startsWith(prefix)) {
        const remaining = subStem.slice(prefix.length);
        const token = remaining.split(/[._ ]/)[0];
        const language = LANGUAGE_ALIASES[token];
        if (language) {
          matches.push({ path: subPath, language });
        }
        break;
      }
    }
  }

  return matches;
};


/** Builds the sorted episode list for a title folder from its video + subtitle files. */
const buildEpisodes = (folder: string, allFiles: string[]): ScannedEpisode[] => {
  const videoPaths = filterByExtension(allFiles, VIDEO_EXTENSIONS);
  const subtitlePaths = filterByExtension(allFiles, SUBTITLE_EXTENSIONS);

  const initialEpisodes = videoPaths.map((videoPath) => {
    const subtitles = matchSubtitles(videoPath, subtitlePaths);
    const parsed = parseEpisodeFilename(videoPath);
    return { path: videoPath, parsed, subtitles };
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
          title: path.basename(ep.path, path.extname(ep.path)),
          subtitles: ep.subtitles,
        });
      } else {
        finalEpisodes.push({
          path: ep.path,
          number: null,
          title: path.basename(ep.path, path.extname(ep.path)),
          subtitles: ep.subtitles,
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
export const scanLibraryFolder = async (rootPath: string): Promise<ScannedMedia[]> => {
  const movies: ScannedMedia[] = [];
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

    const type = episodes.length > 1 ? 'show' : 'movie';

    movies.push({
      path: titleFolder,
      name: entry.name,
      type,
      episodes: episodes.map(ep => ({
        ...ep,
        title: type === 'movie' 
          ? entry.name 
          : (ep.number !== null ? `${entry.name} Episode ${ep.number}` : ep.title)
      })),
    });
  }

  return movies;
};
