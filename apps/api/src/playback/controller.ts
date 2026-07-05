import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { verifyJwt, requireRole } from '../auth/middleware';
import { PlaybackService } from './service';
import { StartPartyRequestSchema } from '@roomies/contracts';
import { prisma } from '../database/sqlite';
import { getRoomSize } from './socket';

export const playbackRoutes = async (app: FastifyInstance) => {
  /**
   * POST /api/playback/start
   * Starts a party: seeds in-memory playback state, starts live FFmpeg
   * transcoding, and returns { partyId, hlsUrl } immediately.
   * Root-only: only the household admin picks what plays for everyone.
   */
  app.post(
    '/start',
    { preHandler: [verifyJwt, requireRole('root')] },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const parsed = StartPartyRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.status(400).send({ error: parsed.error.flatten() });
      }

      const result = await PlaybackService.startParty(parsed.data.mediaFileId);

      const msg = { event: 'server.party.started', payload: {} };
      const room = (req.server as any).room;
      if (room) {
        for (const socket of room) {
          if (socket.readyState === 1) socket.send(JSON.stringify(msg));
        }
      }

      return reply.status(201).send(result);
    }
  );

  /**
   * GET /api/playback/active
   * Returns the globally active party, if any exists.
   */
  app.get(
    '/active',
    { preHandler: verifyJwt },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const activeParty = await PlaybackService.getActiveParty();
      if (!activeParty) {
        return reply.send({});
      }

      const media = activeParty.currentMovieId
        ? await prisma.mediaFile.findUnique({ where: { id: activeParty.currentMovieId } })
        : null;

      return reply.send({
        mediaFileId: activeParty.currentMovieId,
        mediaTitle: media?.title,
        viewersCount: getRoomSize(req.server),
        state: activeParty.isPaused ? 'paused' : 'playing',
      });
    }
  );


};
