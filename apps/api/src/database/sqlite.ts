import { PrismaClient } from '@prisma/client';
import { PrismaLibSql } from '@prisma/adapter-libsql';

export function createPrismaClient(url: string, logQueries = false): PrismaClient {
  return new PrismaClient({
    adapter: new PrismaLibSql({ url }),
    log: logQueries ? ['query', 'error', 'warn'] : ['error'],
  });
}
