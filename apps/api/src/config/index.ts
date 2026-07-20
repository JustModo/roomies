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
  DRIFT_CORRECTION_RATE: 1.10,
  DRIFT_LOG_THRESHOLD_MS: 200,
} as const;

export const PLAYBACK_CONFIG = {
  DEFAULT_PORT: 3000,
  GC_UNUSED_OFFSET_INTERVAL_MS: 10000,
  IDLE_SESSION_TIMEOUT_MS: 30000,
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

export const initializeConfig = async () => {
  console.log('[config] Initializing server configuration.');

  Config.JWT_SECRET = await loadOrCreateSecret('JWT_SECRET');
  Config.JWT_REFRESH_SECRET = await loadOrCreateSecret('JWT_REFRESH_SECRET');

  await initTranscodeSettings();
};
