import { FastifyReply, FastifyRequest } from 'fastify';
import { TranscodeSettings, UpdateTranscodeSettingsRequest } from '@roomies/contracts';
import { getTranscodeSettings, updateTranscodeSettings } from '../config/settings';

export const SettingsController = {
  async getTranscode(req: FastifyRequest, reply: FastifyReply) {
    const settings: TranscodeSettings = getTranscodeSettings();
    return reply.send(settings);
  },

  async updateTranscode(
    req: FastifyRequest<{ Body: UpdateTranscodeSettingsRequest }>,
    reply: FastifyReply
  ) {
    const settings = await updateTranscodeSettings(req.body);
    return reply.send(settings);
  },
};
