import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../database/sqlite';
import { SetupRootRequest, CreateGuestRequest, LoginRequest } from '@roomies/contracts';
import { Config } from '../config';

const BCRYPT_ROUNDS = 12;

// NOTE: Dummy hash for bcrypt comparisons to prevent user-enumeration timing attacks.
const DUMMY_HASH = '$2b$12$C6UzMDM.H6dfI/f/IKcEeO/pF5X3XG5pXHIe9Rq3z1e6nS3s3z3sK';

export const AuthService = {
  async setupRoot(data: SetupRootRequest) {
    const userCount = await prisma.user.count();
    if (userCount > 0) {
      throw new Error('Root user already exists. Use the guest endpoint to create additional users.');
    }

    const hashedPassword = await bcrypt.hash(data.password, BCRYPT_ROUNDS);

    let user;
    try {
      // NOTE: Transaction handles race conditions on initial root setup via ServerConfig.key uniqueness.
      user = await prisma.$transaction(async (tx) => {
        await tx.serverConfig.create({ data: { key: 'ROOT_INITIALIZED', value: 'true' } });
        return tx.user.create({
          data: {
            username: data.username,
            password: hashedPassword,
            role: 'root',
          },
        });
      });
    } catch (err: any) {
      if (err.code === 'P2002') {
        throw new Error('Root user already exists. Use the guest endpoint to create additional users.');
      }
      throw err;
    }

    const token = jwt.sign(
      { userId: user.id, username: user.username, role: user.role },
      Config.JWT_SECRET,
      { expiresIn: '1h' }
    );
    const refreshToken = jwt.sign(
      { userId: user.id },
      Config.JWT_REFRESH_SECRET,
      { expiresIn: '7d' }
    );

    return { token, refreshToken, user: { id: user.id, username: user.username, role: user.role } };
  },

  async createGuest(data: CreateGuestRequest) {
    const existingUser = await prisma.user.findFirst({
      where: { username: data.username },
    });

    if (existingUser) {
      throw new Error('User already exists');
    }

    const hashedPassword = await bcrypt.hash(data.password, BCRYPT_ROUNDS);
    const user = await prisma.user.create({
      data: {
        username: data.username,
        password: hashedPassword,
        role: 'guest',
      },
    });

    return { id: user.id, username: user.username, role: user.role };
  },

  async login(data: LoginRequest) {
    const user = await prisma.user.findUnique({
      where: { username: data.username },
    });

    // NOTE: Avoid response timing differences for unknown usernames.
    const isValid = await bcrypt.compare(data.password, user?.password ?? DUMMY_HASH);
    if (!user || !isValid) {
      throw new Error('Invalid credentials');
    }

    const token = jwt.sign(
      { userId: user.id, username: user.username, role: user.role },
      Config.JWT_SECRET,
      { expiresIn: '1h' }
    );
    const refreshToken = jwt.sign(
      { userId: user.id },
      Config.JWT_REFRESH_SECRET,
      { expiresIn: '7d' }
    );

    return { token, refreshToken, user: { id: user.id, username: user.username, role: user.role } };
  },
};
