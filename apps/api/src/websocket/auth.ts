import { FastifyRequest } from 'fastify';
import jwt from 'jsonwebtoken';
import { JWTPayload } from '@roomies/shared/src/types';
import { Config } from '../config';

export const authenticateWebSocket = (req: FastifyRequest): JWTPayload | null => {
  try {
    const token = (req.query as any).token;
    if (!token) return null;

    const decoded = jwt.verify(token, Config.JWT_SECRET) as JWTPayload;
    return decoded;
  } catch (e) {
    return null;
  }
};
