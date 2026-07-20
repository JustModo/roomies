import { FastifyRequest } from 'fastify';
import jwt from 'jsonwebtoken';
import { JWTPayload } from '@roomies/contracts';
import { Config } from '../config';
import { prisma } from '../database/sqlite';

/**
 * Extracts the JWT from Sec-WebSocket-Protocol header or ?token= query parameter.
 * NOTE: Prefer header to avoid tokens leaking into access logs.
 */
const extractToken = (req: FastifyRequest): string | undefined => {
  const protocolHeader = req.headers['sec-websocket-protocol'];
  if (typeof protocolHeader === 'string') {
    const match = protocolHeader
      .split(',')
      .map((p) => p.trim())
      .find((p) => p.startsWith('bearer.'));
    if (match) return match.slice('bearer.'.length);
  }

  return (req.query as any)?.token;
};

export const authenticateWebSocket = async (req: FastifyRequest): Promise<JWTPayload | null> => {
  try {
    const token = extractToken(req);
    if (!token) return null;

    const decoded = jwt.verify(token, Config.JWT_SECRET, { algorithms: ['HS256'] }) as JWTPayload;

    // Reject tokens from a session that's been superseded by a newer login elsewhere.
    const currentSession = await prisma.refreshToken.findFirst({ where: { userId: decoded.userId } });
    if (!currentSession || currentSession.id !== decoded.sessionId) return null;

    return decoded;
  } catch (e) {
    return null;
  }
};
