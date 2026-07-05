import { prisma } from '../database/postgres';
import { UserProfile, UserSettings } from '@roomies/contracts';

export const UsersService = {
  async getProfile(userId: string): Promise<UserProfile> {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { settings: true },
    });

    if (!user) {
      throw new Error('User not found');
    }

    return {
      id: user.id,
      email: user.email,
      username: user.username,
      settings: user.settings ? { theme: user.settings.theme } : null,
    };
  },

  async updateSettings(userId: string, data: UserSettings): Promise<UserSettings> {
    const settings = await prisma.settings.upsert({
      where: { userId },
      update: { theme: data.theme },
      create: { userId, theme: data.theme },
    });

    return { theme: settings.theme };
  }
};
