import { FastifyReply, FastifyRequest } from 'fastify';
import { AuthService } from './service';
import { SetupRootSchema, LoginSchema } from '@roomies/contracts';
import { prisma } from '../database/sqlite';
import { kickUserConnections } from '../websocket/gateway';
import { clearLoginAttempts } from './middleware';
import { REFRESH_COOKIE, setAuthCookies, clearAuthCookies } from './cookies';

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
      const { refreshToken, ...response } = await AuthService.setupRoot(parsedBody.data);
      setAuthCookies(req, reply, { token: response.token, refreshToken });
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
      const { refreshToken, ...response } = await AuthService.login(parsedBody.data);
      clearLoginAttempts(req.ip);
      kickUserConnections(req.server, response.user.id);
      setAuthCookies(req, reply, { token: response.token, refreshToken });
      return reply.send(response);
    } catch (e: any) {
      if (e.message === 'Invalid credentials') {
        return reply.status(401).send({ error: e.message });
      }
      return reply.status(500).send({ error: 'Internal Server Error' });
    }
  },

  async refresh(req: FastifyRequest, reply: FastifyReply) {
    const currentToken = req.cookies[REFRESH_COOKIE];
    if (!currentToken) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }

    try {
      const { refreshToken, ...response } = await AuthService.refresh(currentToken);
      setAuthCookies(req, reply, { token: response.token, refreshToken });
      return reply.send(response);
    } catch {
      clearAuthCookies(reply);
      return reply.status(401).send({ error: 'Unauthorized' });
    }
  },

  async logout(req: FastifyRequest, reply: FastifyReply) {
    const currentToken = req.cookies[REFRESH_COOKIE];
    if (currentToken) {
      await AuthService.logout(currentToken);
    }
    clearAuthCookies(reply);
    return reply.status(204).send();
  },

  async media(req: FastifyRequest, reply: FastifyReply) {
    return reply.status(200).send();
  },
};
