import path from 'path';
import type { PrismaClient } from '@prisma/client';
import { MEDIA_ROOT as CONFIG_MEDIA_ROOT } from '@roomies/config';
import { Library, Season, MediaFile as MediaFileContract, Subtitle, Title } from '@roomies/contracts';
import { scanLibraryFolder } from './scanner';
import { getMediaDuration } from './ffprobe';
import { runWithConcurrency } from './concurrency';
import { ScannedEpisode, ScannedTitle } from './types';

const MEDIA_ROOT = CONFIG_MEDIA_ROOT;

const serializeSubtitle = (s: { id: string; mediaFileId: string; path: string; language: string | null }): Subtitle => ({
  id: s.id,
  mediaFileId: s.mediaFileId,
  path: s.path,
  language: s.language,
});

const serializeMediaFile = (mf: {
  id: string; seasonId: string; title: string; path: string; duration: number; number: number | null;
  createdAt: Date; subtitles: { id: string; mediaFileId: string; path: string; language: string | null }[];
}): MediaFileContract => ({
  id: mf.id,
  seasonId: mf.seasonId,
  title: mf.title,
  path: mf.path,
  duration: mf.duration,
  number: mf.number,
  createdAt: mf.createdAt.toISOString(),
  subtitles: mf.subtitles.map(serializeSubtitle),
});

const serializeSeason = (season: {
  id: string; titleId: string; name: string; number: number | null;
  mediaFiles: Parameters<typeof serializeMediaFile>[0][];
}): Season => ({
  id: season.id,
  titleId: season.titleId,
  name: season.name,
  number: season.number,
  mediaFiles: season.mediaFiles.map(serializeMediaFile),
});

const serializeTitle = (title: {
  id: string; libraryId: string; type: string; name: string; path: string; coverPath: string | null;
  seasons: Parameters<typeof serializeSeason>[0][];
}): Title => ({
  id: title.id,
  libraryId: title.libraryId,
  type: title.type as 'movie' | 'show',
  name: title.name,
  path: title.path,
  coverPath: title.coverPath,
  seasons: title.seasons.map(serializeSeason),
});

const libraryInclude = {
  titles: { include: { seasons: { include: { mediaFiles: { include: { subtitles: true } } } } } },
} as const;

const serializeLibrary = (lib: {
  id: string; name: string; path: string;
  titles: Parameters<typeof serializeTitle>[0][];
}): Library => ({
  id: lib.id,
  name: lib.name,
  path: lib.path,
  titles: lib.titles.map(serializeTitle),
});

/** Syncs one folder's episode + subtitle rows against an existing (or new) Season row. */
const syncEpisodes = async (prisma: PrismaClient, seasonId: string, episodes: ScannedEpisode[]) => {
  const existing = await prisma.mediaFile.findMany({ where: { seasonId } });
  const diskPaths = new Set(episodes.map((e) => e.path));

  const staleIds = existing.filter((mf) => !diskPaths.has(mf.path)).map((mf) => mf.id);
  if (staleIds.length > 0) {
    await prisma.mediaFile.deleteMany({ where: { id: { in: staleIds } } });
  }

  await runWithConcurrency(episodes, async (episode) => {
    let mediaFile = existing.find((mf) => mf.path === episode.path);
    if (!mediaFile) {
      try {
        const duration = await getMediaDuration(episode.path);
        mediaFile = await prisma.mediaFile.create({
          data: {
            seasonId,
            title: path.basename(episode.path, path.extname(episode.path)),
            path: episode.path,
            duration,
            number: episode.number,
          },
        });
      } catch (err) {
        console.error(`[library] Failed to process media file ${episode.path}:`, err);
        return;
      }
    }

    const existingSubs = await prisma.subtitle.findMany({ where: { mediaFileId: mediaFile.id } });
    const diskSubPaths = new Set(episode.subtitlePaths);
    const staleSubIds = existingSubs.filter((s) => !diskSubPaths.has(s.path)).map((s) => s.id);
    if (staleSubIds.length > 0) {
      await prisma.subtitle.deleteMany({ where: { id: { in: staleSubIds } } });
    }
    const newSubPaths = episode.subtitlePaths.filter((p) => !existingSubs.some((s) => s.path === p));
    for (const subPath of newSubPaths) {
      await prisma.subtitle.create({ data: { mediaFileId: mediaFile.id, path: subPath, language: null } });
    }
  });
};

/** Syncs one title's season rows (and their episodes) against disk. */
const syncSeasons = async (prisma: PrismaClient, titleId: string, scannedTitle: ScannedTitle) => {
  const existing = await prisma.season.findMany({ where: { titleId } });
  const diskPaths = new Set(scannedTitle.seasons.map((s) => s.path));

  const staleIds = existing.filter((s) => !diskPaths.has(s.path)).map((s) => s.id);
  if (staleIds.length > 0) {
    await prisma.season.deleteMany({ where: { id: { in: staleIds } } });
  }

  for (const scannedSeason of scannedTitle.seasons) {
    let season = existing.find((s) => s.path === scannedSeason.path);
    if (!season) {
      season = await prisma.season.create({
        data: { titleId, name: scannedSeason.name, number: scannedSeason.number, path: scannedSeason.path },
      });
    } else if (season.name !== scannedSeason.name || season.number !== scannedSeason.number) {
      season = await prisma.season.update({
        where: { id: season.id },
        data: { name: scannedSeason.name, number: scannedSeason.number },
      });
    }
    await syncEpisodes(prisma, season.id, scannedSeason.episodes);
  }
};

/** Syncs a library's title rows (and their seasons/episodes) against disk. */
const syncTitles = async (prisma: PrismaClient, libraryId: string, scannedTitles: ScannedTitle[]) => {
  const existing = await prisma.title.findMany({ where: { libraryId } });
  const diskPaths = new Set(scannedTitles.map((t) => t.path));

  const staleIds = existing.filter((t) => !diskPaths.has(t.path)).map((t) => t.id);
  if (staleIds.length > 0) {
    await prisma.title.deleteMany({ where: { id: { in: staleIds } } });
    console.log(`[library] Pruned ${staleIds.length} missing titles from database.`);
  }

  for (const scannedTitle of scannedTitles) {
    let title = existing.find((t) => t.path === scannedTitle.path);
    if (!title) {
      title = await prisma.title.create({
        data: {
          libraryId,
          type: scannedTitle.type,
          name: scannedTitle.name,
          path: scannedTitle.path,
          coverPath: scannedTitle.coverPath,
        },
      });
    } else if (
      title.type !== scannedTitle.type ||
      title.name !== scannedTitle.name ||
      title.coverPath !== scannedTitle.coverPath
    ) {
      title = await prisma.title.update({
        where: { id: title.id },
        data: { type: scannedTitle.type, name: scannedTitle.name, coverPath: scannedTitle.coverPath },
      });
    }
    await syncSeasons(prisma, title.id, scannedTitle);
  }
};

export const LibraryService = {
  async getLibraries(prisma: PrismaClient): Promise<Library[]> {
    const libs = await prisma.library.findMany({ include: libraryInclude });
    return libs.map(serializeLibrary);
  },

  async scanLibrary(prisma: PrismaClient): Promise<Library> {
    const safeRootPath = MEDIA_ROOT;

    let library = await prisma.library.findFirst();
    if (!library) {
      library = await prisma.library.create({ data: { name: 'Library', path: safeRootPath } });
    } else if (library.path !== safeRootPath) {
      const oldLibraryPath = library.path;
      console.log(`[library] Environment path change detected. Migrating library path from ${oldLibraryPath} to ${safeRootPath}`);

      library = await prisma.library.update({ where: { id: library.id }, data: { path: safeRootPath } });

      const rewrite = (p: string) => path.resolve(safeRootPath, path.relative(oldLibraryPath, p));

      const titles = await prisma.title.findMany({ where: { libraryId: library.id } });
      for (const t of titles) {
        await prisma.title.update({
          where: { id: t.id },
          data: { path: rewrite(t.path), coverPath: t.coverPath ? rewrite(t.coverPath) : null },
        });
      }

      const seasons = await prisma.season.findMany({ where: { title: { libraryId: library.id } } });
      for (const s of seasons) {
        await prisma.season.update({ where: { id: s.id }, data: { path: rewrite(s.path) } });
      }

      const mediaFiles = await prisma.mediaFile.findMany({ where: { season: { title: { libraryId: library.id } } } });
      for (const mf of mediaFiles) {
        await prisma.mediaFile.update({ where: { id: mf.id }, data: { path: rewrite(mf.path) } });
      }

      const subtitles = await prisma.subtitle.findMany({
        where: { mediaFile: { season: { title: { libraryId: library.id } } } },
      });
      for (const s of subtitles) {
        await prisma.subtitle.update({ where: { id: s.id }, data: { path: rewrite(s.path) } });
      }

      console.log(`[library] Migrated ${titles.length} titles, ${seasons.length} seasons, ${mediaFiles.length} media files.`);
    }

    const scannedTitles = await scanLibraryFolder(safeRootPath);
    await syncTitles(prisma, library.id, scannedTitles);

    const updatedLibrary = await prisma.library.findUniqueOrThrow({
      where: { id: library.id },
      include: libraryInclude,
    });

    return serializeLibrary(updatedLibrary);
  },
};
