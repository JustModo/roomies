import { prisma } from '../database/postgres';
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
};
