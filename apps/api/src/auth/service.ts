import { randomUUID } from 'crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';
import { CreateGuestRequest, JWTPayload, LoginRequest, SetupRootRequest } from '@roomies/contracts';
import { AuthSecrets } from '../config';
import { ConflictError, ForbiddenError, UnauthorizedError } from '../config/errors';

export const ACCESS_TOKEN_TTL_S = 60 * 60;
export const REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const BCRYPT_ROUNDS = 12;

// NOTE: Dummy hash for bcrypt comparisons to prevent user-enumeration timing attacks.
const DUMMY_HASH = '$2b$12$C6UzMDM.H6dfI/f/IKcEeO/pF5X3XG5pXHIe9Rq3z1e6nS3s3z3sK';

const ROOT_EXISTS = 'Root user already exists. Use the guest endpoint to create additional users.';

type SessionUser = { id: string; username: string; role: string };

const isUniqueViolation = (err: unknown) => (err as { code?: unknown } | null)?.code === 'P2002';

export class AuthService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly secrets: AuthSecrets,
  ) {}

  async hasUsers(): Promise<boolean> {
    return (await this.prisma.user.count()) > 0;
  }

  async setupRoot(data: SetupRootRequest) {
    if (await this.hasUsers()) throw new ForbiddenError(ROOT_EXISTS);

    const password = await bcrypt.hash(data.password, BCRYPT_ROUNDS);
    try {
      // NOTE: Transaction handles race conditions on initial root setup via ServerConfig.key uniqueness.
      const user = await this.prisma.$transaction(async (tx) => {
        await tx.serverConfig.create({ data: { key: 'ROOT_INITIALIZED', value: 'true' } });
        return tx.user.create({ data: { username: data.username, password, role: 'root' } });
      });
      return this.startSession(user);
    } catch (err) {
      if (isUniqueViolation(err)) throw new ForbiddenError(ROOT_EXISTS);
      throw err;
    }
  }

  async createGuest(data: CreateGuestRequest): Promise<SessionUser> {
    const password = await bcrypt.hash(data.password, BCRYPT_ROUNDS);
    try {
      const user = await this.prisma.user.create({ data: { username: data.username, password, role: 'guest' } });
      return { id: user.id, username: user.username, role: user.role };
    } catch (err) {
      if (isUniqueViolation(err)) throw new ConflictError('User already exists');
      throw err;
    }
  }

  async login(data: LoginRequest) {
    const user = await this.prisma.user.findUnique({ where: { username: data.username } });

    // NOTE: Avoid response timing differences for unknown usernames.
    const isValid = await bcrypt.compare(data.password, user?.password ?? DUMMY_HASH);
    if (!user || !isValid) throw new UnauthorizedError('Invalid credentials');

    return this.startSession(user);
  }

  async refresh(refreshToken: string) {
    const userId = this.verifyRefreshToken(refreshToken);

    const session = await this.prisma.refreshToken.findUnique({ where: { token: refreshToken }, include: { user: true } });
    if (!session || session.userId !== userId || session.expiresAt <= new Date()) throw new UnauthorizedError();

    const nextRefreshToken = this.signRefreshToken(userId);
    const rotated = await this.prisma.refreshToken.updateMany({
      where: { id: session.id, token: refreshToken },
      data: { token: nextRefreshToken, expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS) },
    });
    if (rotated.count === 0) throw new UnauthorizedError();

    return { token: this.signAccessToken(session.user, session.id), refreshToken: nextRefreshToken, user: toSessionUser(session.user) };
  }

  async logout(refreshToken: string): Promise<void> {
    await this.prisma.refreshToken.deleteMany({ where: { token: refreshToken } });
  }

  /** Returns the payload, or null when the token is invalid or its session was superseded by a newer login. */
  async verifyAccessToken(token: string): Promise<JWTPayload | null> {
    try {
      const decoded = jwt.verify(token, this.secrets.jwtSecret, { algorithms: ['HS256'] }) as JWTPayload;
      const session = await this.prisma.refreshToken.findUnique({ where: { id: decoded.sessionId } });
      return session?.userId === decoded.userId ? decoded : null;
    } catch {
      return null;
    }
  }

  /**
   * Rotates the user's session: any previously issued RefreshToken row (and thus the
   * sessionId embedded in its access token) is deleted, enforcing single-session-per-account.
   */
  private async startSession(user: SessionUser) {
    const refreshToken = this.signRefreshToken(user.id);
    const session = await this.prisma.$transaction(async (tx) => {
      await tx.refreshToken.deleteMany({ where: { userId: user.id } });
      return tx.refreshToken.create({
        data: { token: refreshToken, userId: user.id, expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS) },
      });
    });
    return { token: this.signAccessToken(user, session.id), refreshToken, user: toSessionUser(user) };
  }

  private verifyRefreshToken(token: string): string {
    try {
      return (jwt.verify(token, this.secrets.refreshSecret, { algorithms: ['HS256'] }) as { userId: string }).userId;
    } catch {
      throw new UnauthorizedError();
    }
  }

  private signRefreshToken(userId: string): string {
    return jwt.sign({ userId }, this.secrets.refreshSecret, { expiresIn: REFRESH_TOKEN_TTL_MS / 1000, jwtid: randomUUID() });
  }

  private signAccessToken(user: SessionUser, sessionId: string): string {
    return jwt.sign({ userId: user.id, username: user.username, role: user.role, sessionId }, this.secrets.jwtSecret, {
      expiresIn: ACCESS_TOKEN_TTL_S,
    });
  }
}

const toSessionUser = (user: SessionUser): SessionUser => ({ id: user.id, username: user.username, role: user.role });
