import { FastifyReply, FastifyRequest } from 'fastify';
import { UsersService } from './service';
import { CreateGuestSchema } from '@roomies/contracts';
import { JWTPayload } from '@roomies/contracts';
import { AuthService } from '../auth/service';

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

  async getUsers(req: FastifyRequest, reply: FastifyReply) {
    try {
      const userPayload = (req as any).user as JWTPayload;
      if (userPayload.role !== 'root') {
        return reply.status(403).send({ error: 'Forbidden' });
      }
      const users = await UsersService.getUsers();
      return reply.send(users);
    } catch (e: any) {
      return reply.status(500).send({ error: 'Internal Server Error' });
    }
  },

  async deleteUser(req: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) {
    try {
      const userPayload = (req as any).user as JWTPayload;
      if (userPayload.role !== 'root') {
        return reply.status(403).send({ error: 'Forbidden' });
      }
      await UsersService.deleteUser(req.params.id);
      return reply.status(204).send();
    } catch (e: any) {
      if (e.message === 'User not found') return reply.status(404).send({ error: e.message });
      if (e.message === 'Cannot delete root user') return reply.status(400).send({ error: e.message });
      return reply.status(500).send({ error: 'Internal Server Error' });
    }
  },

  async createGuest(req: FastifyRequest, reply: FastifyReply) {
    const userPayload = (req as any).user as JWTPayload;
    
    // Only root users can create accounts
    if (userPayload.role !== 'root') {
      return reply.status(403).send({ error: 'Forbidden: Only root users can create guest accounts.' });
    }

    const parsedBody = CreateGuestSchema.safeParse(req.body);
    if (!parsedBody.success) {
      return reply.status(400).send({ error: 'Invalid input', details: parsedBody.error.format() });
    }

    try {
      const guest = await AuthService.createGuest(parsedBody.data);
      return reply.status(201).send(guest);
    } catch (e: any) {
      if (e.message.includes('already exists')) {
        return reply.status(409).send({ error: e.message });
      }
      return reply.status(500).send({ error: 'Internal Server Error' });
    }
  }
};
