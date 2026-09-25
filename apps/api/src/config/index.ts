import { randomBytes } from 'crypto';
import { prisma } from '../database/sqlite';
import { initTranscodeSettings } from '@roomies/transcoding';

export const Config = {
  JWT_SECRET: '',
  JWT_REFRESH_SECRET: '',
};

export const SYNC_CONFIG = {
  SOFT_THRESHOLD_MS: 500,
  HARD_THRESHOLD_MS: 4000,
  HARD_SEEK_COOLDOWN_MS: 8000,
  SOFT_CORRECTION_RATE_DELTA: 0.1,
} as const;

/** Idempotently loads, or generates and persists, a secret keyed by key. */
const loadOrCreateSecret = async (key: string): Promise<string> => {
  const generated = randomBytes(64).toString('hex');

  const config = await prisma.serverConfig.upsert({
    where: { key },
    update: {},
    create: { key, value: generated },
  });

  console.log(`[config] ${config.value === generated ? 'Generated new ' + key + ' and saved to database.' : 'Loaded ' + key + ' from database.'}`);
  return config.value;
};

export interface InitConfigOptions {
  skipHardwareDetection?: boolean;
}

export const initializeConfig = async (options: InitConfigOptions = {}) => {
  console.log('[config] Initializing server configuration.');

  Config.JWT_SECRET = await loadOrCreateSecret('JWT_SECRET');
  Config.JWT_REFRESH_SECRET = await loadOrCreateSecret('JWT_REFRESH_SECRET');

  if (!options.skipHardwareDetection) {
    await initTranscodeSettings();
  }
};
