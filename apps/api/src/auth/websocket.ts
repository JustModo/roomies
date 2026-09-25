import { FastifyRequest } from 'fastify';
import { JWTPayload } from '@roomies/contracts';
import { verifyAccessToken } from './middleware';

/** Extracts the JWT from the `bearer.<jwt>` Sec-WebSocket-Protocol entry. */
const extractToken = (req: FastifyRequest): string | undefined => {
  const protocolHeader = req.headers['sec-websocket-protocol'];
  if (typeof protocolHeader === 'string') {
    const match = protocolHeader
      .split(',')
      .map((p) => p.trim())
      .find((p) => p.startsWith('bearer.'));
    if (match) return match.slice('bearer.'.length);
  }
};

export const authenticateWebSocket = async (req: FastifyRequest): Promise<JWTPayload | null> => {
  const token = extractToken(req);
  return token ? verifyAccessToken(token) : null;
};
