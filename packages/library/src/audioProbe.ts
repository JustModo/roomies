import type { PrismaClient } from '@prisma/client';
import { getEmbeddedAudioStreams } from './ffprobe';

/**
 * Probes a video's embedded audio streams and syncs them into the AudioTrack table —
 * upserts streams still present, and deletes rows for streams that no longer exist (e.g.
 * the file at this path was replaced by a re-rip with a different track layout).
 * Fire-and-forget: callers should not await this inline in the scan loop, just log failures.
 */
export const probeAudioTracks = async (
  prisma: PrismaClient,
  mediaFileId: string,
  videoPath: string
): Promise<void> => {
  const streams = await getEmbeddedAudioStreams(videoPath);

  // The container's own default flag wins; if none is set (or several conflicting ones
  // are), fall back to the first stream rather than trusting raw ffprobe disposition blindly.
  const defaultIndex = streams.find((s) => s.isDefault)?.index ?? streams[0]?.index;

  await prisma.$transaction([
    ...streams.map((stream) =>
      prisma.audioTrack.upsert({
        where: { mediaFileId_streamIndex: { mediaFileId, streamIndex: stream.index } },
        create: {
          mediaFileId,
          streamIndex: stream.index,
          language: stream.language,
          title: stream.title,
          channels: stream.channels,
          isDefault: stream.index === defaultIndex,
        },
        update: {
          language: stream.language,
          title: stream.title,
          channels: stream.channels,
          isDefault: stream.index === defaultIndex,
        },
      })
    ),
    prisma.audioTrack.deleteMany({
      where: { mediaFileId, streamIndex: { notIn: streams.map((s) => s.index) } },
    }),
  ]);
};
