import { FastifyRequest, FastifyReply } from 'fastify';
import jwt from 'jsonwebtoken';
import { JWTPayload } from '@roomies/contracts';
import { Config } from '../config';

export const verifyJwt = async (req: FastifyRequest, reply: FastifyReply) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, Config.JWT_SECRET, { algorithms: ['HS256'] }) as JWTPayload;

    (req as any).user = decoded;
  } catch (err) {
    return reply.status(401).send({ error: 'Unauthorized' });
  }
};

/** NOTE: Requires the user to have one of the specified roles (runs after verifyJwt). */
export const requireRole = (...roles: string[]) => {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    const user = (req as any).user as JWTPayload | undefined;
    if (!user || !roles.includes(user.role)) {
      return reply.status(403).send({ error: 'Forbidden' });
    }
  };
};
