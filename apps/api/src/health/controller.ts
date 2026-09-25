import fs from 'fs';
import { FastifyReply, FastifyRequest } from 'fastify';
import { CACHE_DIR } from '@roomies/config';
import { getDetectedHardwareEncoder, getTranscodeSettings } from '@roomies/transcoding';
import { prisma } from '../database/sqlite';

const cacheFreeBytes = async (): Promise<number | null> => {
  try {
    const stats = await fs.promises.statfs(CACHE_DIR);
    return stats.bavail * stats.bsize;
  } catch {
    return null;
  }
};

export const HealthController = {
  async status(req: FastifyRequest, reply: FastifyReply) {
    try {
      // NOTE: The process can be up while the database is unreachable, so probe it.
      await prisma.$queryRaw`SELECT 1`;
    } catch (e: unknown) {
      const err = e as Error;
      console.error('[health] Database unreachable:', err);
      return reply.status(503).send({ status: 'error', database: 'unreachable' });
    }

    const { ffmpegPreset, hwAccelMode } = getTranscodeSettings();
    return reply.send({
      status: 'ok',
      ffmpeg: { preset: ffmpegPreset, hwAccelMode, encoder: getDetectedHardwareEncoder() },
      cache: { freeBytes: await cacheFreeBytes() },
    });
  },
};
