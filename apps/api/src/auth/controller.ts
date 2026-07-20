import { FastifyReply, FastifyRequest } from 'fastify';
import { AuthService } from './service';
import { SetupRootSchema, LoginSchema, LoginRequest } from '@roomies/contracts';
import { prisma } from '../database/sqlite';
import { kickUserConnections } from '../websocket/gateway';

export const AuthController = {
  async status(req: FastifyRequest, reply: FastifyReply) {
    const userCount = await prisma.user.count();
    return reply.send({ needsBootstrap: userCount === 0, hasRoot: userCount > 0 });
  },
  
  async setupRoot(req: FastifyRequest, reply: FastifyReply) {
    const parsedBody = SetupRootSchema.safeParse(req.body);
    if (!parsedBody.success) {
      return reply.status(400).send({ error: 'Invalid input', details: parsedBody.error.format() });
    }

    try {
      const response = await AuthService.setupRoot(parsedBody.data);
      return reply.send(response);
    } catch (err: any) {
      if (err.message.includes('already exists')) {
        return reply.status(403).send({ error: err.message });
      }
      return reply.status(400).send({ error: err.message });
    }
  },

  async login(req: FastifyRequest, reply: FastifyReply) {
    const parsedBody = LoginSchema.safeParse(req.body);
    if (!parsedBody.success) {
      return reply.status(400).send({ error: 'Invalid input', details: parsedBody.error.format() });
    }

    try {
      const response = await AuthService.login(parsedBody.data);
      kickUserConnections(req.server, response.user.id);
      return reply.send(response);
    } catch (e: any) {
      if (e.message === 'Invalid credentials') {
        return reply.status(401).send({ error: e.message });
      }
      return reply.status(500).send({ error: 'Internal Server Error' });
    }
  },
};
