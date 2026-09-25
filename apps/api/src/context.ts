import { PrismaClient } from '@prisma/client';
import { Config, config } from '@roomies/config';
import { getPrisma } from './database/sqlite';

export interface AppContext {
  config: Config;
  prisma: PrismaClient;
}

export function createAppContext(): AppContext {
  return { config, prisma: getPrisma() };
}
