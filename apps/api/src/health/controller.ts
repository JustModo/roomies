import { FastifyReply, FastifyRequest } from 'fastify';
import { prisma } from '../database/sqlite';

export const HealthController = {
  async status(req: FastifyRequest, reply: FastifyReply) {
    try {
      // NOTE: The process can be up while the database is unreachable, so probe it.
      await prisma.$queryRaw`SELECT 1`;
      return reply.send({ status: 'ok' });
    } catch (e: unknown) {
      const err = e as Error;
      console.error('[health] Database unreachable:', err);
      return reply.status(503).send({ status: 'error', database: 'unreachable' });
    }
  },
};
