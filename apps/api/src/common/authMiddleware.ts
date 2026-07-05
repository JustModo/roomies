import { FastifyRequest, FastifyReply } from 'fastify';
import jwt from 'jsonwebtoken';
import { JWTPayload } from '@roomies/shared/src/types';

export const verifyJwt = async (req: FastifyRequest, reply: FastifyReply) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret') as JWTPayload;
    
    // Attach decoded user payload to request for downstream handlers
    (req as any).user = decoded;
  } catch (err) {
    return reply.status(401).send({ error: 'Unauthorized' });
  }
};
