import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { prisma } from '../database/postgres';
import { LoginRequest, RegisterRequest, AuthResponse } from '@roomies/contracts';

const JWT_SECRET = process.env.JWT_SECRET || 'secret';
const JWT_EXPIRES_IN = '7d';

export const AuthService = {
  async register(data: RegisterRequest): Promise<AuthResponse> {
    const existingUser = await prisma.user.findFirst({
      where: {
        OR: [{ email: data.email }, { username: data.username }],
      },
    });

    if (existingUser) {
      throw new Error('User already exists');
    }

    const hashedPassword = await bcrypt.hash(data.password, 10);
    const user = await prisma.user.create({
      data: {
        email: data.email,
        username: data.username,
        password: hashedPassword,
      },
    });

    const token = jwt.sign({ userId: user.id, email: user.email }, JWT_SECRET, {
      expiresIn: JWT_EXPIRES_IN,
    });

    return {
      token,
      user: { id: user.id, email: user.email, username: user.username },
    };
  },

  async login(data: LoginRequest): Promise<AuthResponse> {
    const user = await prisma.user.findUnique({
      where: { email: data.email },
    });

    if (!user) {
      throw new Error('Invalid credentials');
    }

    const validPassword = await bcrypt.compare(data.password, user.password);
    if (!validPassword) {
      throw new Error('Invalid credentials');
    }

    const token = jwt.sign({ userId: user.id, email: user.email }, JWT_SECRET, {
      expiresIn: JWT_EXPIRES_IN,
    });

    return {
      token,
      user: { id: user.id, email: user.email, username: user.username },
    };
  },
};
