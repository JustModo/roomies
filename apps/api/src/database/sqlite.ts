import { PrismaClient } from '@prisma/client';
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';
import { DATABASE_URL, NODE_ENV } from '@roomies/config';

const adapter = new PrismaBetterSqlite3({ url: DATABASE_URL });

export const prisma = new PrismaClient({
  adapter,
  log: NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
});
