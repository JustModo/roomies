import fs from 'fs';
import { PrismaClient } from '@prisma/client';
import { FastifyBaseLogger, FastifyReply, FastifyRequest } from 'fastify';
import { TranscodeSessionManager } from '@roomies/transcoding';

const freeBytes = async (dir: string): Promise<number | null> => {
  try {
    const stats = await fs.promises.statfs(dir);
    return stats.bavail * stats.bsize;
  } catch {
    return null;
  }
};

export class HealthController {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly transcoder: TranscodeSessionManager,
    private readonly log: FastifyBaseLogger,
  ) {}

  status = async (_req: FastifyRequest, reply: FastifyReply) => {
    try {
      // NOTE: The process can be up while the database is unreachable, so probe it.
      await this.prisma.$queryRaw`SELECT 1`;
    } catch (err) {
      this.log.error({ err }, 'Database unreachable');
      return reply.status(503).send({ status: 'error', database: 'unreachable' });
    }

    const { preset, hwAccelMode, cacheDir } = this.transcoder.options;
    return reply.send({
      status: 'ok',
      ffmpeg: { preset, hwAccelMode, encoder: this.transcoder.encoder.current },
      cache: { freeBytes: await freeBytes(cacheDir) },
    });
  };
}
