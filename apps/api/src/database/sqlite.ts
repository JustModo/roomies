import { PrismaClient } from '@prisma/client';
import { PrismaLibSql } from '@prisma/adapter-libsql';
import { DATABASE_URL, NODE_ENV } from '@roomies/config';

let clientInstance: PrismaClient | null = null;
let clientUrl: string | null = null;

export function getPrisma(): PrismaClient {
  const currentUrl = process.env.DATABASE_URL || DATABASE_URL;
  if (!clientInstance || clientUrl !== currentUrl) {
    if (clientInstance) {
      clientInstance.$disconnect().catch(() => {});
    }
    clientUrl = currentUrl;
    const adapter = new PrismaLibSql({ url: currentUrl });
    clientInstance = new PrismaClient({
      adapter,
      log: NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
    });
  }
  return clientInstance;
}

export const prisma = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    const client = getPrisma();
    const val = (client as any)[prop];
    if (typeof val === 'function') {
      return val.bind(client);
    }
    return val;
  },
});
