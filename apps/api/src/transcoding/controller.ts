import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { TranscodeStatusResponse } from '@roomies/contracts/src/api';
import { redis } from '../database/redis';
import { transcodeStatusKey, TranscodeStatus } from './queue';

interface PartyParams {
  partyId: string;
}

const HLS_BASE_URL = process.env.HLS_BASE_URL || 'http://localhost:80/hls';

export const transcodingRoutes = async (app: FastifyInstance) => {
  /**
   * GET /api/transcoding/:partyId/status
   * Returns the current transcode status for a party.
   * Frontend polls this until status === 'ready', then starts the Shaka player.
   */
  app.get<{ Params: PartyParams }>(
    '/:partyId/status',
    async (req: FastifyRequest<{ Params: PartyParams }>, reply: FastifyReply) => {
      const { partyId } = req.params;

      const rawStatus = await redis.get(transcodeStatusKey(partyId));

      if (!rawStatus) {
        const response: TranscodeStatusResponse = { status: 'pending' };
        return reply.send(response);
      }

      const status = rawStatus as TranscodeStatus;

      const response: TranscodeStatusResponse = {
        status,
        hlsUrl: status === 'ready' ? `${HLS_BASE_URL}/${partyId}/index.m3u8` : undefined,
      };

      return reply.send(response);
    }
  );
};
