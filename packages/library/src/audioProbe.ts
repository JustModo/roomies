import type { PrismaClient } from '@prisma/client';
import { getEmbeddedAudioStreams } from './ffprobe';

/**
 * Probes a video's embedded audio streams and records them in the AudioTrack table.
 * Fire-and-forget: callers should not await this inline in the scan loop, just log failures.
 */
export const probeAudioTracks = async (
  prisma: PrismaClient,
  mediaFileId: string,
  videoPath: string
): Promise<void> => {
  const streams = await getEmbeddedAudioStreams(videoPath);
  if (streams.length === 0) return;

  const existing = await prisma.audioTrack.findMany({ where: { mediaFileId } });
  const existingByIndex = new Map(existing.map((a) => [a.streamIndex, a]));

  for (const stream of streams) {
    const match = existingByIndex.get(stream.index);
    if (!match) {
      await prisma.audioTrack.create({
        data: { mediaFileId, streamIndex: stream.index, language: stream.language, title: stream.title, channels: stream.channels },
      });
    } else if (match.language !== stream.language || match.title !== stream.title || match.channels !== stream.channels) {
      await prisma.audioTrack.update({
        where: { id: match.id },
        data: { language: stream.language, title: stream.title, channels: stream.channels },
      });
    }
  }
};
