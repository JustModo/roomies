import { FastifyRequest } from 'fastify';
import jwt from 'jsonwebtoken';
import { JWTPayload } from '@roomies/contracts';
import { Config } from '../config';

/**
 * Extracts the JWT for a WS upgrade request.
 * Prefers the `Sec-WebSocket-Protocol` header (`bearer.<token>`) since query
 * strings are commonly captured in proxy/CDN access logs and browser history.
 * Falls back to `?token=` for simpler clients.
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

export const authenticateWebSocket = (req: FastifyRequest): JWTPayload | null => {
  try {
    const token = extractToken(req);
    if (!token) return null;

    const decoded = jwt.verify(token, Config.JWT_SECRET, { algorithms: ['HS256'] }) as JWTPayload;
    return decoded;
  } catch (e) {
    return null;
  }
};
