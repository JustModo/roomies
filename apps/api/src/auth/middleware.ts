import { FastifyRequest, FastifyReply } from 'fastify';
import jwt from 'jsonwebtoken';
import { JWTPayload } from '@roomies/contracts';
import { Config } from '../config';
import { prisma } from '../database/sqlite';
import { MEDIA_COOKIE } from './cookies';

export const verifyAccessToken = async (token: string): Promise<JWTPayload | null> => {
  try {
    const decoded = jwt.verify(token, Config.JWT_SECRET, { algorithms: ['HS256'] }) as JWTPayload;

    // Reject tokens from a session that's been superseded by a newer login elsewhere.
    const session = await prisma.refreshToken.findUnique({ where: { id: decoded.sessionId } });
    if (!session || session.userId !== decoded.userId) return null;
    return decoded;
  } catch {
    return null;
  }
};

const bearerToken = (req: FastifyRequest): string | undefined => {
  const authHeader = req.headers.authorization;
  return authHeader?.startsWith('Bearer ') ? authHeader.slice('Bearer '.length) : undefined;
};

const authenticateWith = (extractToken: (req: FastifyRequest) => string | undefined) => {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    const token = extractToken(req);
    const user = token ? await verifyAccessToken(token) : null;
    if (!user) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }
    req.user = user;
  };
};

export const verifyJwt = authenticateWith(bearerToken);

export const verifyMediaAccess = authenticateWith((req) => bearerToken(req) ?? req.cookies[MEDIA_COOKIE]);

const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_ATTEMPTS = 5;

// NOTE: In-memory and per-process is sufficient — this is a single-container app,
// so there is no peer to share counters with, and losing them on restart is fine.
const loginAttempts = new Map<string, { count: number; expiresAt: number }>();

/** Blocks an IP after too many login attempts, so passwords can't be brute forced. */
export const loginRateLimit = async (req: FastifyRequest, reply: FastifyReply) => {
  const now = Date.now();

  // Drop expired entries here so the map stays bounded without a timer.
  for (const [key, value] of loginAttempts) {
    if (value.expiresAt <= now) loginAttempts.delete(key);
  }

  const attempt = loginAttempts.get(req.ip);
  if (attempt && attempt.count >= LOGIN_MAX_ATTEMPTS) {
    return reply.status(429).send({ error: 'Too many login attempts, try again later' });
  }

  if (attempt) {
    attempt.count += 1;
  } else {
    loginAttempts.set(req.ip, { count: 1, expiresAt: now + LOGIN_WINDOW_MS });
  }
};

export const clearLoginAttempts = (ip: string) => {
  loginAttempts.delete(ip);
};

/** NOTE: Requires the user to have one of the specified roles (runs after verifyJwt). */
export const requireRole = (...roles: string[]) => {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    const user = req.user;

    if (!user || !roles.includes(user.role)) {
      return reply.status(403).send({ error: 'Forbidden' });
    }
  };
};
