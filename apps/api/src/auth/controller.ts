import { FastifyReply, FastifyRequest } from 'fastify';
import { LoginSchema, SetupRootSchema } from '@roomies/contracts';
import { RateLimiter } from '../common/rateLimiter';
import { BadRequestError } from '../config/errors';
import { SocketHub } from '../websocket/hub';
import { REFRESH_COOKIE, clearAuthCookies, setAuthCookies } from './cookies';
import { AuthService } from './service';

const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_ATTEMPTS = 5;

export class AuthController {
  // NOTE: In-memory and per-process is sufficient — this is a single-container app,
  // so there is no peer to share counters with, and losing them on restart is fine.
  private loginAttempts = new RateLimiter(LOGIN_WINDOW_MS, LOGIN_MAX_ATTEMPTS);

  constructor(
    private readonly auth: AuthService,
    private readonly hub: SocketHub,
  ) {}

  /** Blocks an IP after too many login attempts, so passwords can't be brute forced. */
  rateLimitLogin = async (req: FastifyRequest, reply: FastifyReply) => {
    if (!this.loginAttempts.allow(req.ip)) {
      return reply.status(429).send({ error: 'Too many login attempts, try again later' });
    }
  };

  status = async (_req: FastifyRequest, reply: FastifyReply) => {
    const hasRoot = await this.auth.hasUsers();
    return reply.send({ needsBootstrap: !hasRoot, hasRoot });
  };

  setupRoot = async (req: FastifyRequest, reply: FastifyReply) => {
    const body = SetupRootSchema.safeParse(req.body);
    if (!body.success) throw new BadRequestError('Invalid input', body.error.format());

    const { refreshToken, ...response } = await this.auth.setupRoot(body.data);
    setAuthCookies(req, reply, { token: response.token, refreshToken });
    return reply.send(response);
  };

  login = async (req: FastifyRequest, reply: FastifyReply) => {
    const body = LoginSchema.safeParse(req.body);
    if (!body.success) throw new BadRequestError('Invalid input', body.error.format());

    const { refreshToken, ...response } = await this.auth.login(body.data);
    this.loginAttempts.reset(req.ip);
    this.hub.kickUser(response.user.id);
    setAuthCookies(req, reply, { token: response.token, refreshToken });
    return reply.send(response);
  };

  refresh = async (req: FastifyRequest, reply: FastifyReply) => {
    const currentToken = req.cookies[REFRESH_COOKIE];
    if (!currentToken) return reply.status(401).send({ error: 'Unauthorized' });

    try {
      const { refreshToken, ...response } = await this.auth.refresh(currentToken);
      setAuthCookies(req, reply, { token: response.token, refreshToken });
      return reply.send(response);
    } catch (err) {
      clearAuthCookies(reply);
      throw err;
    }
  };

  logout = async (req: FastifyRequest, reply: FastifyReply) => {
    const currentToken = req.cookies[REFRESH_COOKIE];
    if (currentToken) await this.auth.logout(currentToken);
    clearAuthCookies(reply);
    return reply.status(204).send();
  };

  media = async (_req: FastifyRequest, reply: FastifyReply) => reply.status(200).send();
}
