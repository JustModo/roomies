import { FastifyReply, FastifyRequest, preHandlerAsyncHookHandler } from 'fastify';
import { JWTPayload } from '@roomies/contracts';
import { MEDIA_COOKIE } from './cookies';
import { AuthService } from './service';

const bearerToken = (req: FastifyRequest): string | undefined => {
  const header = req.headers.authorization;
  return header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : undefined;
};

/** Extracts the JWT from the `bearer.<jwt>` Sec-WebSocket-Protocol entry. */
const webSocketToken = (req: FastifyRequest): string | undefined => {
  const header = req.headers['sec-websocket-protocol'];
  const entry =
    typeof header === 'string'
      ? header
          .split(',')
          .map((p) => p.trim())
          .find((p) => p.startsWith('bearer.'))
      : undefined;
  return entry?.slice('bearer.'.length);
};

/** Request authentication and authorization for HTTP routes and WebSocket upgrades. */
export class AuthGuard {
  readonly verifyJwt = this.authenticateWith(bearerToken);
  readonly verifyMediaAccess = this.authenticateWith((req) => bearerToken(req) ?? req.cookies[MEDIA_COOKIE]);

  constructor(private readonly auth: AuthService) {}

  /** NOTE: Requires the user to have one of the specified roles (runs after verifyJwt). */
  requireRole(...roles: string[]): preHandlerAsyncHookHandler {
    return async (req: FastifyRequest, reply: FastifyReply) => {
      if (!req.user || !roles.includes(req.user.role)) {
        return reply.status(403).send({ error: 'Forbidden' });
      }
    };
  }

  async authenticateWebSocket(req: FastifyRequest): Promise<JWTPayload | null> {
    const token = webSocketToken(req);
    return token ? this.auth.verifyAccessToken(token) : null;
  }

  private authenticateWith(extractToken: (req: FastifyRequest) => string | undefined): preHandlerAsyncHookHandler {
    return async (req: FastifyRequest, reply: FastifyReply) => {
      const token = extractToken(req);
      const user = token ? await this.auth.verifyAccessToken(token) : null;
      if (!user) {
        return reply.status(401).send({ error: 'Unauthorized' });
      }
      req.user = user;
    };
  }
}
