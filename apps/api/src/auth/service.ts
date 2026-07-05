import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { prisma } from '../database/postgres';
import { SetupRootRequest, CreateGuestRequest, LoginRequest } from '@roomies/contracts';
import { Config } from '../config';

export const AuthService = {
  async setupRoot(data: SetupRootRequest) {
    const userCount = await prisma.user.count();
    if (userCount > 0) {
      throw new Error('Root user already exists. Use the guest endpoint to create additional users.');
    }

    const hashedPassword = await bcrypt.hash(data.password, 10);
    const user = await prisma.user.create({
      data: {
        username: data.username,
        password: hashedPassword,
        role: 'root',
      },
    });

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

    const hashedPassword = await bcrypt.hash(data.password, 10);
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

    if (!user) {
      throw new Error('Invalid credentials');
    }

    const isValid = await bcrypt.compare(data.password, user.password);
    if (!isValid) {
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
