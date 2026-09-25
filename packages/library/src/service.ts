import fs from 'fs';
import path from 'path';
import type { Prisma, PrismaClient } from '@prisma/client';
import type { Logger } from '@roomies/config';
import { AudioTrack, Library, MediaFile, Movie, Subtitle } from '@roomies/contracts';
import { ConcurrencyLimiter, runWithConcurrency } from './concurrency';
import { LibraryOptions, PROBE_CONCURRENCY, SCAN_CONCURRENCY } from './config';
import { MediaProbe } from './probe';
import { scanLibraryFolder } from './scanner';
import { TrackIndexer } from './trackIndexer';
import { ScannedEpisode, ScannedMedia } from './types';

const libraryInclude = {
  movies: { include: { mediaFiles: { include: { subtitles: true, audioTracks: true } } } },
} as const;

type LibraryRow = Prisma.LibraryGetPayload<{ include: typeof libraryInclude }>;
type MovieRow = LibraryRow['movies'][number];
type MediaFileRow = MovieRow['mediaFiles'][number];

const serializeSubtitle = (s: MediaFileRow['subtitles'][number]): Subtitle => ({
  id: s.id,
  mediaFileId: s.mediaFileId,
  language: s.language,
});

const serializeAudioTrack = (a: MediaFileRow['audioTracks'][number]): AudioTrack => ({
  id: a.id,
  mediaFileId: a.mediaFileId,
  streamIndex: a.streamIndex,
  language: a.language,
  title: a.title,
  channels: a.channels,
  isDefault: a.isDefault,
});

const serializeMediaFile = (mf: MediaFileRow): MediaFile => ({
  id: mf.id,
  movieId: mf.movieId,
  title: mf.title,
  duration: mf.duration,
  number: mf.number,
  createdAt: mf.createdAt.toISOString(),
  subtitles: mf.subtitles.map(serializeSubtitle),
  audioTracks: mf.audioTracks.map(serializeAudioTrack),
});

const serializeMovie = (movie: MovieRow): Movie => ({
  id: movie.id,
  libraryId: movie.libraryId,
  type: movie.type as Movie['type'],
  name: movie.name,
  mediaFiles: movie.mediaFiles.map(serializeMediaFile),
});

const serializeLibrary = (lib: LibraryRow): Library => ({
  id: lib.id,
  name: lib.name,
  movies: lib.movies.map(serializeMovie),
});

/** Keeps the Library/Movie/MediaFile tables in sync with the media root on disk. */
export class LibraryService {
  private readonly probe: MediaProbe;
  private readonly tracks: TrackIndexer;
  private readonly probeLimiter = new ConcurrencyLimiter(PROBE_CONCURRENCY);
  private inFlightScan: Promise<Library> | null = null;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly options: LibraryOptions,
    private readonly log: Logger,
  ) {
    this.probe = new MediaProbe(options.ffprobePath);
    this.tracks = new TrackIndexer(prisma, this.probe, options, log);
  }

  async getLibraries(): Promise<Library[]> {
    const libraries = await this.prisma.library.findMany({ include: libraryInclude });
    return libraries.map(serializeLibrary);
  }

  /** Concurrent callers share one scan instead of racing each other over the same rows. */
  scan(): Promise<Library> {
    this.inFlightScan ??= this.runScan().finally(() => {
      this.inFlightScan = null;
    });
    return this.inFlightScan;
  }

  private async runScan(): Promise<Library> {
    const { mediaRoot } = this.options;

    let library = await this.prisma.library.findFirst();
    if (!library) {
      library = await this.prisma.library.create({ data: { name: 'Library', path: mediaRoot } });
    } else if (library.path !== mediaRoot) {
      await this.migrateRoot(library.id, library.path, mediaRoot);
    }

    await this.syncMovies(library.id, await scanLibraryFolder(mediaRoot, this.log));

    const updated = await this.prisma.library.findUniqueOrThrow({ where: { id: library.id }, include: libraryInclude });
    return serializeLibrary(updated);
  }

  /** Rewrites stored paths when MEDIA_ROOT moved, so existing rows (and their ids) survive. */
  private async migrateRoot(libraryId: string, oldRoot: string, newRoot: string): Promise<void> {
    this.log.info({ from: oldRoot, to: newRoot }, 'Media root changed, migrating library paths');
    await this.prisma.library.update({ where: { id: libraryId }, data: { path: newRoot } });

    const isUnderOldRoot = (p: string) => p === oldRoot || p.startsWith(oldRoot + path.sep);
    const rewrite = (p: string) => path.resolve(newRoot, path.relative(oldRoot, p));

    const movies = await this.prisma.movie.findMany({ where: { libraryId } });
    for (const m of movies.filter((row) => isUnderOldRoot(row.path))) {
      await this.prisma.movie.update({ where: { id: m.id }, data: { path: rewrite(m.path) } });
    }

    const mediaFiles = await this.prisma.mediaFile.findMany({ where: { movie: { libraryId } } });
    for (const mf of mediaFiles.filter((row) => isUnderOldRoot(row.path))) {
      await this.prisma.mediaFile.update({ where: { id: mf.id }, data: { path: rewrite(mf.path) } });
    }

    const subtitles = await this.prisma.subtitle.findMany({ where: { mediaFile: { movie: { libraryId } } } });
    for (const s of subtitles.filter((row) => isUnderOldRoot(row.path))) {
      await this.prisma.subtitle.update({ where: { id: s.id }, data: { path: rewrite(s.path) } });
    }

    this.log.info({ movies: movies.length, mediaFiles: mediaFiles.length }, 'Migrated library paths');
  }

  /** Syncs a library's movie rows (and their episodes) against disk. */
  private async syncMovies(libraryId: string, scannedMovies: ScannedMedia[]): Promise<void> {
    const existing = await this.prisma.movie.findMany({ where: { libraryId } });
    const diskPaths = new Set(scannedMovies.map((m) => m.path));

    const staleIds = existing.filter((m) => !diskPaths.has(m.path)).map((m) => m.id);
    if (staleIds.length > 0) {
      await this.prisma.movie.deleteMany({ where: { id: { in: staleIds } } });
      this.log.info({ count: staleIds.length }, 'Pruned missing movies from database');
    }

    for (const scanned of scannedMovies) {
      const data = { type: scanned.type, name: scanned.name };
      let movie = existing.find((m) => m.path === scanned.path);
      if (!movie) {
        movie = await this.prisma.movie.create({ data: { libraryId, path: scanned.path, ...data } });
      } else if (movie.type !== scanned.type || movie.name !== scanned.name) {
        movie = await this.prisma.movie.update({ where: { id: movie.id }, data });
      }
      await this.syncEpisodes(movie.id, scanned.episodes);
    }
  }

  /** Syncs one movie's media-file rows against disk, re-probing only new or changed files. */
  private async syncEpisodes(movieId: string, episodes: ScannedEpisode[]): Promise<void> {
    const existing = await this.prisma.mediaFile.findMany({ where: { movieId } });
    const diskPaths = new Set(episodes.map((e) => e.path));

    const staleIds = existing.filter((mf) => !diskPaths.has(mf.path)).map((mf) => mf.id);
    if (staleIds.length > 0) {
      await this.prisma.mediaFile.deleteMany({ where: { id: { in: staleIds } } });
      await Promise.all(
        staleIds.map((id) => fs.promises.rm(path.join(this.options.subtitleDataDir, id), { recursive: true, force: true }).catch(() => {})),
      );
    }

    await runWithConcurrency(episodes, SCAN_CONCURRENCY, async (episode) => {
      let mediaFile = existing.find((mf) => mf.path === episode.path);

      // Check file mtime via stat() to avoid expensive probe calls on unchanged files.
      let sourceMtimeMs: number;
      try {
        sourceMtimeMs = (await fs.promises.stat(episode.path)).mtimeMs;
      } catch (err) {
        this.log.error({ err, path: episode.path }, 'Failed to stat media file');
        return;
      }
      const isNewOrChanged = !mediaFile || mediaFile.sourceMtimeMs !== sourceMtimeMs;

      if (!mediaFile) {
        try {
          const duration = await this.probe.duration(episode.path);
          mediaFile = await this.prisma.mediaFile.create({
            data: { movieId, title: episode.title, path: episode.path, duration, sourceMtimeMs, number: episode.number },
          });
        } catch (err) {
          this.log.error({ err, path: episode.path }, 'Failed to process media file');
          return;
        }
      } else if (isNewOrChanged || mediaFile.number !== episode.number || mediaFile.title !== episode.title) {
        let duration = mediaFile.duration;
        if (isNewOrChanged) {
          duration = await this.probe.duration(episode.path).catch((err) => {
            this.log.error({ err, path: episode.path }, 'Failed to re-probe duration');
            return duration;
          });
        }
        mediaFile = await this.prisma.mediaFile.update({
          where: { id: mediaFile.id },
          data: { number: episode.number, title: episode.title, duration, sourceMtimeMs },
        });
      }

      if (isNewOrChanged) this.indexTracksInBackground(mediaFile.id, mediaFile.path);
    });
  }

  /** Probes subtitles and audio tracks without blocking the scan loop; failures are logged. */
  private indexTracksInBackground(mediaFileId: string, videoPath: string): void {
    const run = (task: () => Promise<void>, failure: string, onFailure?: () => Promise<unknown>) => {
      this.probeLimiter.run(task).catch(async (err) => {
        this.log.error({ err, path: videoPath }, failure);
        await onFailure?.().catch(() => {});
      });
    };

    run(() => this.tracks.extractEmbeddedSubtitles(mediaFileId, videoPath), 'Embedded subtitle extraction failed');
    run(() => this.tracks.importSidecarSubtitles(mediaFileId, videoPath), 'Sidecar subtitle import failed');
    // A failed audio probe resets the mtime so the next scan retries the file.
    run(
      () => this.tracks.syncAudioTracks(mediaFileId, videoPath),
      'Audio track probing failed',
      () => this.prisma.mediaFile.update({ where: { id: mediaFileId }, data: { sourceMtimeMs: 0 } }),
    );
  }
}
