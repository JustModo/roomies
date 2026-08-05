import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import type { PrismaClient } from '@prisma/client';
import { FFMPEG_PATH, SUBTITLE_DATA_DIR } from '@roomies/config';
import { getEmbeddedTextSubtitleStreams } from './ffprobe';

const execFileAsync = promisify(execFile);

/**
 * Extracts embedded text subtitle streams from a video into SUBTITLE_DATA_DIR
 * and records them in the Subtitle table. Fire-and-forget: callers should not
 * await this inline in the scan loop, just log failures.
 */
export const extractEmbeddedSubtitles = async (
  prisma: PrismaClient,
  mediaFileId: string,
  videoPath: string
): Promise<void> => {
  const streams = await getEmbeddedTextSubtitleStreams(videoPath);
  if (streams.length === 0) return;

  const existing = await prisma.subtitle.findMany({ where: { mediaFileId } });
  const existingPaths = new Set(existing.map((s) => s.path));

  for (const stream of streams) {
    const outputPath = path.join(SUBTITLE_DATA_DIR, `${mediaFileId}_${stream.index}.vtt`);
    if (existingPaths.has(outputPath)) continue;

    await execFileAsync(FFMPEG_PATH, [
      '-y',
      '-i', videoPath,
      '-map', `0:${stream.index}`,
      '-f', 'webvtt',
      outputPath,
    ]);

    await prisma.subtitle.create({
      data: { mediaFileId, path: outputPath, language: stream.language },
    });
  }
};
