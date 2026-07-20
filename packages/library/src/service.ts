import path from 'path';
import type { PrismaClient } from '@prisma/client';
import { MEDIA_ROOT as CONFIG_MEDIA_ROOT } from '@roomies/config';
import { Library, MediaFile as MediaFileContract, Subtitle, Movie } from '@roomies/contracts';
import { scanLibraryFolder } from './scanner';
import { getMediaDuration } from './ffprobe';
import { runWithConcurrency } from './concurrency';
import { ScannedEpisode, ScannedMedia } from './types';

const MEDIA_ROOT = CONFIG_MEDIA_ROOT;

const serializeSubtitle = (s: { id: string; mediaFileId: string; path: string; language: string | null }): Subtitle => ({
  id: s.id,
  mediaFileId: s.mediaFileId,
  path: s.path,
  language: s.language,
});

const serializeMediaFile = (mf: {
  id: string; movieId: string; title: string; path: string; duration: number; number: number | null;
  createdAt: Date; subtitles: { id: string; mediaFileId: string; path: string; language: string | null }[];
}): MediaFileContract => ({
  id: mf.id,
  movieId: mf.movieId,
  title: mf.title,
  path: mf.path,
  duration: mf.duration,
  number: mf.number,
  createdAt: mf.createdAt.toISOString(),
  subtitles: mf.subtitles.map(serializeSubtitle),
});

const serializeMovie = (movie: {
  id: string; libraryId: string; type: string; name: string; path: string;
  mediaFiles: Parameters<typeof serializeMediaFile>[0][];
}): Movie => ({
  id: movie.id,
  libraryId: movie.libraryId,
  type: movie.type as 'movie' | 'show',
  name: movie.name,
  path: movie.path,
  mediaFiles: movie.mediaFiles.map(serializeMediaFile),
});

const libraryInclude = {
  movies: { include: { mediaFiles: { include: { subtitles: true } } } },
} as const;

const serializeLibrary = (lib: {
  id: string; name: string; path: string;
  movies: Parameters<typeof serializeMovie>[0][];
}): Library => ({
  id: lib.id,
  name: lib.name,
  path: lib.path,
  movies: lib.movies.map(serializeMovie),
});

/** Syncs one movie's media-file + subtitle rows against disk. */
const syncEpisodes = async (prisma: PrismaClient, movieId: string, episodes: ScannedEpisode[]) => {
  const existing = await prisma.mediaFile.findMany({ where: { movieId } });
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
            movieId,
            title: episode.title,
            path: episode.path,
            duration,
            number: episode.number,
          },
        });
      } catch (err) {
        console.error(`[library] Failed to process media file ${episode.path}:`, err);
        return;
      }
    } else if (mediaFile.number !== episode.number || mediaFile.title !== episode.title) {
      mediaFile = await prisma.mediaFile.update({
        where: { id: mediaFile.id },
        data: { number: episode.number, title: episode.title },
      });
    }

    const existingSubs = await prisma.subtitle.findMany({ where: { mediaFileId: mediaFile.id } });
    const diskSubPaths = new Set(episode.subtitles.map((s) => s.path));

    const staleSubIds = existingSubs.filter((s) => !diskSubPaths.has(s.path)).map((s) => s.id);
    if (staleSubIds.length > 0) {
      await prisma.subtitle.deleteMany({ where: { id: { in: staleSubIds } } });
    }

    for (const sub of episode.subtitles) {
      const match = existingSubs.find((s) => s.path === sub.path);
      if (!match) {
        await prisma.subtitle.create({ data: { mediaFileId: mediaFile.id, path: sub.path, language: sub.language } });
      } else if (match.language !== sub.language) {
        await prisma.subtitle.update({ where: { id: match.id }, data: { language: sub.language } });
      }
    }
  });
};

/** Syncs a library's movie rows (and their episodes) against disk. */
const syncMovies = async (prisma: PrismaClient, libraryId: string, scannedMovies: ScannedMedia[]) => {
  const existing = await prisma.movie.findMany({ where: { libraryId } });
  const diskPaths = new Set(scannedMovies.map((m) => m.path));

  const staleIds = existing.filter((m) => !diskPaths.has(m.path)).map((m) => m.id);
  if (staleIds.length > 0) {
    await prisma.movie.deleteMany({ where: { id: { in: staleIds } } });
    console.log(`[library] Pruned ${staleIds.length} missing movies from database.`);
  }

  for (const scannedMovie of scannedMovies) {
    let movie = existing.find((m) => m.path === scannedMovie.path);
    if (!movie) {
      movie = await prisma.movie.create({
        data: {
          libraryId,
          type: scannedMovie.type,
          name: scannedMovie.name,
          path: scannedMovie.path,
        },
      });
    } else if (
      movie.type !== scannedMovie.type ||
      movie.name !== scannedMovie.name
    ) {
      movie = await prisma.movie.update({
        where: { id: movie.id },
        data: { type: scannedMovie.type, name: scannedMovie.name },
      });
    }
    await syncEpisodes(prisma, movie.id, scannedMovie.episodes);
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

      const movies = await prisma.movie.findMany({ where: { libraryId: library.id } });
      for (const m of movies) {
        await prisma.movie.update({
          where: { id: m.id },
          data: { path: rewrite(m.path) },
        });
      }

      const mediaFiles = await prisma.mediaFile.findMany({ where: { movie: { libraryId: library.id } } });
      for (const mf of mediaFiles) {
        await prisma.mediaFile.update({ where: { id: mf.id }, data: { path: rewrite(mf.path) } });
      }

      const subtitles = await prisma.subtitle.findMany({
        where: { mediaFile: { movie: { libraryId: library.id } } },
      });
      for (const s of subtitles) {
        await prisma.subtitle.update({ where: { id: s.id }, data: { path: rewrite(s.path) } });
      }

      console.log(`[library] Migrated ${movies.length} movies, ${mediaFiles.length} media files.`);
    }

    const scannedMovies = await scanLibraryFolder(safeRootPath);
    await syncMovies(prisma, library.id, scannedMovies);

    const updatedLibrary = await prisma.library.findUniqueOrThrow({
      where: { id: library.id },
      include: libraryInclude,
    });

    return serializeLibrary(updatedLibrary);
  },
};
