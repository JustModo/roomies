import { FastifyRequest, FastifyReply } from 'fastify';
import jwt from 'jsonwebtoken';
import { JWTPayload } from '@roomies/contracts';
import { Config } from '../config';
import { prisma } from '../database/sqlite';

export const verifyJwt = async (req: FastifyRequest, reply: FastifyReply) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, Config.JWT_SECRET, { algorithms: ['HS256'] }) as JWTPayload;

    // Reject tokens from a session that's been superseded by a newer login elsewhere.
    const currentSession = await prisma.refreshToken.findFirst({
      where: { userId: decoded.userId },
      orderBy: { createdAt: 'desc' },
    });
    if (!currentSession || currentSession.id !== decoded.sessionId) {
      return reply.status(401).send({ error: 'Unauthorized' });
    }

    req.user = decoded;
  } catch (err) {
    return reply.status(401).send({ error: 'Unauthorized' });
  }
};

const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_ATTEMPTS = 5;

// NOTE: In-memory and per-process is sufficient — this is a single-container app,
// so there is no peer to share counters with, and losing them on restart is fine.
const loginAttempts = new Map<string, { count: number; expiresAt: number }>();

/** Blocks an IP after too many failed logins, so passwords can't be brute forced. */
export const loginRateLimit = async (req: FastifyRequest, reply: FastifyReply) => {
  const attempt = loginAttempts.get(req.ip);

  if (attempt && attempt.expiresAt > Date.now() && attempt.count >= LOGIN_MAX_ATTEMPTS) {
    return reply.status(429).send({ error: 'Too many login attempts, try again later' });
  }
};

export const recordLoginFailure = (ip: string) => {
  const now = Date.now();

  // Drop expired entries here so the map stays bounded without a timer.
  for (const [key, value] of loginAttempts) {
    if (value.expiresAt <= now) loginAttempts.delete(key);
  }

  const attempt = loginAttempts.get(ip);
  if (attempt && attempt.expiresAt > now) {
    attempt.count += 1;
  } else {
    loginAttempts.set(ip, { count: 1, expiresAt: now + LOGIN_WINDOW_MS });
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
