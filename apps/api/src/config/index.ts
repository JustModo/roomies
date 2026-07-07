import { randomBytes } from 'crypto';
import { prisma } from '../database/sqlite';
import { initTranscodeSettings } from '@roomies/transcoding';

export const Config = {
  JWT_SECRET: '',
  JWT_REFRESH_SECRET: '',
};

/**
 * Idempotently loads (or generates and persists) a secret keyed by `key`.
 * Uses an upsert so concurrent API instances starting against a fresh DB
 * race safely: only one write wins, and every instance reads back the same
 * persisted value instead of each generating its own.
 */
const loadOrCreateSecret = async (key: string): Promise<string> => {
  const generated = randomBytes(64).toString('hex');

  const config = await prisma.serverConfig.upsert({
    where: { key },
    update: {},
    create: { key, value: generated },
  });

  console.log(config.value === generated ? `Generated new ${key} and saved to database.` : `Loaded ${key} from database.`);
  return config.value;
};

export const initializeConfig = async () => {
  console.log('Initializing server configuration...');

  Config.JWT_SECRET = await loadOrCreateSecret('JWT_SECRET');
  Config.JWT_REFRESH_SECRET = await loadOrCreateSecret('JWT_REFRESH_SECRET');

  await initTranscodeSettings();
};
