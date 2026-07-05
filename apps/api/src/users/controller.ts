import { FastifyReply, FastifyRequest } from 'fastify';
import { UsersService } from './service';
import { UserSettings } from '@roomies/contracts';
import { JWTPayload } from '@roomies/shared/src/types';

export const UsersController = {
  async getMe(req: FastifyRequest, reply: FastifyReply) {
    try {
      const userPayload = (req as any).user as JWTPayload;
      const profile = await UsersService.getProfile(userPayload.userId);
      return reply.send(profile);
    } catch (e: any) {
      if (e.message === 'User not found') {
        return reply.status(404).send({ error: e.message });
      }
      return reply.status(500).send({ error: 'Internal Server Error' });
    }
  },

  async updateSettings(req: FastifyRequest<{ Body: UserSettings }>, reply: FastifyReply) {
    try {
      const userPayload = (req as any).user as JWTPayload;
      const newSettings = await UsersService.updateSettings(userPayload.userId, req.body);
      return reply.send(newSettings);
    } catch (e) {
      return reply.status(500).send({ error: 'Internal Server Error' });
    }
  }
};
