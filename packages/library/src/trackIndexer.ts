import { execFile } from 'child_process';
import fs from 'fs';
import path from 'path';
import { promisify } from 'util';
import type { PrismaClient } from '@prisma/client';
import type { Logger } from '@roomies/config';
import { LibraryOptions, PROBE_TIMEOUT_MS, SUBTITLE_EXTENSIONS } from './config';
import { MediaProbe } from './probe';
import { matchSubtitles } from './utils/subtitleMatcher';

const execFileAsync = promisify(execFile);

/** Syncs a media file's embedded/sidecar subtitles and audio tracks into the database. */
export class TrackIndexer {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly probe: MediaProbe,
    private readonly options: LibraryOptions,
    private readonly log: Logger,
  ) {}

  /**
   * Extracts embedded text subtitle streams into the subtitle data dir and syncs them into the
   * Subtitle table — one failing stream doesn't stop the rest, and streams that disappeared since
   * the last scan (file replaced with a different track layout) have their row and .vtt removed.
   */
  async extractEmbeddedSubtitles(mediaFileId: string, videoPath: string): Promise<void> {
    const streams = await this.probe.textSubtitleStreams(videoPath);
    const existing = await this.prisma.subtitle.findMany({ where: { mediaFileId, streamIndex: { not: null } } });
    const mediaSubtitleDir = path.join(this.options.subtitleDataDir, mediaFileId);

    for (const stream of streams) {
      const outputPath = path.join(mediaSubtitleDir, `${stream.index}.vtt`);
      try {
        await fs.promises.mkdir(mediaSubtitleDir, { recursive: true });
        await execFileAsync(this.options.ffmpegPath, ['-y', '-i', videoPath, '-map', `0:${stream.index}`, '-f', 'webvtt', outputPath], {
          timeout: PROBE_TIMEOUT_MS,
        });
        await this.prisma.subtitle.upsert({
          where: { mediaFileId_streamIndex: { mediaFileId, streamIndex: stream.index } },
          create: { mediaFileId, path: outputPath, language: stream.language, streamIndex: stream.index },
          update: { path: outputPath, language: stream.language },
        });
      } catch (err) {
        this.log.error({ err, mediaFileId, streamIndex: stream.index }, 'Subtitle extraction failed');
        await fs.promises.rm(outputPath, { force: true }).catch(() => {});
      }
    }

    const currentIndices = new Set(streams.map((s) => s.index));
    const stale = existing.filter((s) => s.streamIndex !== null && !currentIndices.has(s.streamIndex));
    if (stale.length > 0) {
      await Promise.all(stale.map((s) => fs.promises.rm(s.path, { force: true }).catch(() => {})));
      await this.prisma.subtitle.deleteMany({ where: { id: { in: stale.map((s) => s.id) } } });
    }
  }

  /** Imports subtitle files next to the video whose names match it (optionally with a language token). */
  async importSidecarSubtitles(mediaFileId: string, videoPath: string): Promise<void> {
    const dir = path.dirname(videoPath);
    let siblings: string[];
    try {
      siblings = (await fs.promises.readdir(dir))
        .filter((name) => SUBTITLE_EXTENSIONS.includes(path.extname(name).toLowerCase()))
        .map((name) => path.join(dir, name));
    } catch (err) {
      this.log.error({ err, dir }, 'Failed to list sidecar subtitles');
      return;
    }

    const matches = matchSubtitles(videoPath, siblings);
    const matchedPaths = new Set(matches.map((m) => m.path));

    const existing = await this.prisma.subtitle.findMany({ where: { mediaFileId, streamIndex: null } });
    const stale = existing.filter((s) => path.dirname(s.path) === dir && !matchedPaths.has(s.path));
    if (stale.length > 0) {
      await this.prisma.subtitle.deleteMany({ where: { id: { in: stale.map((s) => s.id) } } });
    }

    for (const match of matches) {
      await this.prisma.subtitle.upsert({
        where: { path: match.path },
        create: { mediaFileId, path: match.path, language: match.language },
        update: { mediaFileId, language: match.language },
      });
    }
  }

  /** Probes embedded audio streams and syncs them into the AudioTrack table. */
  async syncAudioTracks(mediaFileId: string, videoPath: string): Promise<void> {
    const streams = await this.probe.audioStreams(videoPath);
    // Use the container's default stream flag or fall back to the first stream.
    const defaultIndex = streams.find((s) => s.isDefault)?.index ?? streams[0]?.index;

    await this.prisma.$transaction([
      ...streams.map((stream) => {
        const fields = {
          language: stream.language,
          title: stream.title,
          channels: stream.channels,
          isDefault: stream.index === defaultIndex,
        };
        return this.prisma.audioTrack.upsert({
          where: { mediaFileId_streamIndex: { mediaFileId, streamIndex: stream.index } },
          create: { mediaFileId, streamIndex: stream.index, ...fields },
          update: fields,
        });
      }),
      this.prisma.audioTrack.deleteMany({ where: { mediaFileId, streamIndex: { notIn: streams.map((s) => s.index) } } }),
    ]);
  }
}
