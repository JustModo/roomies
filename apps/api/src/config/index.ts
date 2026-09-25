import { randomBytes } from 'crypto';
import { PrismaClient } from '@prisma/client';
import { FastifyBaseLogger } from 'fastify';

export interface AuthSecrets {
  readonly jwtSecret: string;
  readonly refreshSecret: string;
}

/** Idempotently loads, or generates and persists, a secret keyed by key. */
const loadOrCreateSecret = async (prisma: PrismaClient, log: FastifyBaseLogger, key: string): Promise<string> => {
  const generated = randomBytes(64).toString('hex');

  const row = await prisma.serverConfig.upsert({
    where: { key },
    update: {},
    create: { key, value: generated },
  });

  log.info(row.value === generated ? `Generated new ${key} and saved to database` : `Loaded ${key} from database`);
  return row.value;
};

/** Loaded once at startup, before any service that signs or verifies tokens is constructed. */
export const loadSecrets = async (prisma: PrismaClient, log: FastifyBaseLogger): Promise<AuthSecrets> => ({
  jwtSecret: await loadOrCreateSecret(prisma, log, 'JWT_SECRET'),
  refreshSecret: await loadOrCreateSecret(prisma, log, 'JWT_REFRESH_SECRET'),
});
