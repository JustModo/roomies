import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { verifyJwt, requireRole } from '../common/authMiddleware';
import { PlaybackService } from './service';
import { StartPartyRequestSchema } from '@roomies/contracts';

export const playbackRoutes = async (app: FastifyInstance) => {
  /**
   * POST /api/playback/start
   * Starts a party, seeds in-memory playback state, enqueues transcode.
   * Returns { partyId, sessionId }
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

      const userId = (req as any).user.userId as string;

      const result = await PlaybackService.startParty(parsed.data.mediaFileId, userId);
      return reply.status(201).send(result);
    }
  );

  /**
   * GET /api/playback/party/active
   * Returns the globally active party, if any exists.
   */
  app.get(
    '/party/active',
    { preHandler: verifyJwt },
    async (req: FastifyRequest, reply: FastifyReply) => {
      const activeParty = await PlaybackService.getActiveParty();
      if (!activeParty) {
        return reply.send({ partyId: null });
      }
      return reply.send({ partyId: activeParty.partyId, mediaFileId: activeParty.currentMovieId });
    }
  );

  /**
   * GET /api/playback/:partyId
   * Returns the current playback state for a party.
   */
  app.get<{ Params: { partyId: string } }>(
    '/:partyId',
    { preHandler: verifyJwt },
    async (req: FastifyRequest<{ Params: { partyId: string } }>, reply: FastifyReply) => {
      const state = await PlaybackService.getPartyState(req.params.partyId);
      if (!state) {
        return reply.status(404).send({ error: 'Party not found' });
      }
      return reply.send(state);
    }
  );
};
