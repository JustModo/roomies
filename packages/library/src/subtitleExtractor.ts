import path from 'path';
import fs from 'fs';
import { execFile } from 'child_process';
import { promisify } from 'util';
import type { PrismaClient } from '@prisma/client';
import { FFMPEG_PATH, SUBTITLE_DATA_DIR } from '@roomies/config';
import { getEmbeddedTextSubtitleStreams } from './ffprobe';

const execFileAsync = promisify(execFile);

/**
 * Extracts embedded text subtitle streams from a video into SUBTITLE_DATA_DIR and syncs
 * them into the Subtitle table — one failing stream doesn't stop the rest, and streams
 * that disappeared since the last scan (file replaced with a different track layout) have
 * their DB row and .vtt file removed. Fire-and-forget: callers should not await this inline
 * in the scan loop, just log failures.
 */
export const extractEmbeddedSubtitles = async (
  prisma: PrismaClient,
  mediaFileId: string,
  videoPath: string
): Promise<void> => {
  const streams = await getEmbeddedTextSubtitleStreams(videoPath);

  const existing = await prisma.subtitle.findMany({ where: { mediaFileId, streamIndex: { not: null } } });
  const existingByIndex = new Map(existing.map((s) => [s.streamIndex, s]));

  for (const stream of streams) {
    if (existingByIndex.has(stream.index)) continue;

    const mediaSubtitleDir = path.join(SUBTITLE_DATA_DIR, mediaFileId);
    const outputPath = path.join(mediaSubtitleDir, `${stream.index}.vtt`);
    try {
      await fs.promises.mkdir(mediaSubtitleDir, { recursive: true });
      await execFileAsync(FFMPEG_PATH, [
        '-y',
        '-i', videoPath,
        '-map', `0:${stream.index}`,
        '-f', 'webvtt',
        outputPath,
      ]);
      await prisma.subtitle.upsert({
        where: { mediaFileId_streamIndex: { mediaFileId, streamIndex: stream.index } },
        create: { mediaFileId, path: outputPath, language: stream.language, streamIndex: stream.index },
        update: { path: outputPath, language: stream.language },
      });
    } catch (err) {
      console.error(`[library] Subtitle extraction failed for ${mediaFileId} stream ${stream.index}:`, err);
      await fs.promises.rm(outputPath, { force: true }).catch(() => {});
    }
  }

  const currentIndices = new Set(streams.map((s) => s.index));
  const stale = existing.filter((s) => s.streamIndex !== null && !currentIndices.has(s.streamIndex));
  if (stale.length > 0) {
    await Promise.all(stale.map((s) => fs.promises.rm(s.path, { force: true }).catch(() => {})));
    await prisma.subtitle.deleteMany({ where: { id: { in: stale.map((s) => s.id) } } });
  }
};
