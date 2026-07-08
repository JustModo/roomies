import { randomBytes } from 'crypto';
import { prisma } from '../database/sqlite';
import { initTranscodeSettings } from '@roomies/transcoding';

export const Config = {
  JWT_SECRET: '',
  JWT_REFRESH_SECRET: '',
};

/** Idempotently loads, or generates and persists, a secret keyed by key. */
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
