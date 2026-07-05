import { FastifyReply, FastifyRequest } from 'fastify';
import { AuthService } from './service';
import { LoginRequest, RegisterRequest } from '@roomies/contracts';

export const AuthController = {
  async register(req: FastifyRequest<{ Body: RegisterRequest }>, reply: FastifyReply) {
    try {
      const response = await AuthService.register(req.body);
      return reply.status(201).send(response);
    } catch (e: any) {
      if (e.message === 'User already exists') {
        return reply.status(409).send({ error: e.message });
      }
      return reply.status(500).send({ error: 'Internal Server Error' });
    }
  },

  async login(req: FastifyRequest<{ Body: LoginRequest }>, reply: FastifyReply) {
    try {
      const response = await AuthService.login(req.body);
      return reply.send(response);
    } catch (e: any) {
      if (e.message === 'Invalid credentials') {
        return reply.status(401).send({ error: e.message });
      }
      return reply.status(500).send({ error: 'Internal Server Error' });
    }
  },
};
