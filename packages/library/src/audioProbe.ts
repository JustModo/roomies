import type { PrismaClient } from '@prisma/client';
import { getEmbeddedAudioStreams } from './ffprobe';

/** Probes embedded audio streams and syncs them into the AudioTrack table. */
export const probeAudioTracks = async (
  prisma: PrismaClient,
  mediaFileId: string,
  videoPath: string
): Promise<void> => {
  const streams = await getEmbeddedAudioStreams(videoPath);

  // Use the container's default stream flag or fall back to the first stream.
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
