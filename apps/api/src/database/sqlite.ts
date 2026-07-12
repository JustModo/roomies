import { PrismaClient } from '@prisma/client';
import { PrismaLibSql } from '@prisma/adapter-libsql';
import { DATABASE_URL, NODE_ENV } from '@roomies/config';

const adapter = new PrismaLibSql({
  url: DATABASE_URL,
});

export const prisma = new PrismaClient({
  adapter,
  log: NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
});
