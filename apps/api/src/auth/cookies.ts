import { FastifyReply, FastifyRequest } from 'fastify';
import { ACCESS_TOKEN_TTL_S, REFRESH_TOKEN_TTL_MS } from './service';

export const REFRESH_COOKIE = 'roomies_refresh';
export const MEDIA_COOKIE = 'roomies_media';

const REFRESH_COOKIE_PATH = '/api/auth';

export const setAuthCookies = (req: FastifyRequest, reply: FastifyReply, tokens: { token: string; refreshToken: string }) => {
  const base = { httpOnly: true, sameSite: 'strict', secure: req.protocol === 'https' } as const;
  reply.setCookie(REFRESH_COOKIE, tokens.refreshToken, { ...base, path: REFRESH_COOKIE_PATH, maxAge: REFRESH_TOKEN_TTL_MS / 1000 });
  reply.setCookie(MEDIA_COOKIE, tokens.token, { ...base, path: '/', maxAge: ACCESS_TOKEN_TTL_S });
};

export const clearAuthCookies = (reply: FastifyReply) => {
  reply.clearCookie(REFRESH_COOKIE, { path: REFRESH_COOKIE_PATH });
  reply.clearCookie(MEDIA_COOKIE, { path: '/' });
};
