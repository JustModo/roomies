import { FastifyRequest } from 'fastify';
import jwt from 'jsonwebtoken';
import { JWTPayload } from '@roomies/shared/src/types';

export const authenticateWebSocket = (req: FastifyRequest): JWTPayload | null => {
  // Websockets can authenticate via query parameter or a cookie/header if possible during handshake
  const token = (req.query as { token?: string }).token;
  
  if (!token) return null;

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret') as JWTPayload;
    return decoded;
  } catch (e) {
    return null;
  }
};
