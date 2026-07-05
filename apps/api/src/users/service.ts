import { prisma } from '../database/sqlite';
import { UserProfile } from '@roomies/contracts';

export const UsersService = {
  async getProfile(userId: string): Promise<UserProfile> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new Error('User not found');
    }

    return {
      id: user.id,
      username: user.username,
      role: user.role,
    };
  },

  async getUsers(): Promise<UserProfile[]> {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        username: true,
        role: true,
        createdAt: true,
      }
    });

    return users.map(user => ({
      id: user.id,
      username: user.username,
      role: user.role,
      joined: user.createdAt.toISOString().split('T')[0],
    }));
  },

  async deleteUser(userId: string): Promise<void> {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new Error('User not found');
    if (user.role === 'root') throw new Error('Cannot delete root user');

    await prisma.user.delete({ where: { id: userId } });
  },
};
