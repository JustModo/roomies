import { PrismaClient } from '@prisma/client';
import { UserProfile } from '@roomies/contracts';
import { BadRequestError, NotFoundError } from '../config/errors';

const PROFILE_FIELDS = { id: true, username: true, role: true } as const;

export class UsersService {
  constructor(private readonly prisma: PrismaClient) {}

  async getProfile(userId: string): Promise<UserProfile> {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: PROFILE_FIELDS });
    if (!user) throw new NotFoundError('User not found');
    return user;
  }

  async getUsers(): Promise<UserProfile[]> {
    return this.prisma.user.findMany({ select: PROFILE_FIELDS });
  }

  async deleteUser(userId: string): Promise<void> {
    const user = await this.getProfile(userId);
    if (user.role === 'root') throw new BadRequestError('Cannot delete root user');
    await this.prisma.user.delete({ where: { id: userId } });
  }
}
