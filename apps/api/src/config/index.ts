import { randomBytes } from 'crypto';
import { prisma } from '../database/postgres';

export const Config = {
  JWT_SECRET: '',
  JWT_REFRESH_SECRET: '',
};

export const initializeConfig = async (log: any) => {
  log.info('Initializing server configuration...');

  // 1. Check for JWT_SECRET
  let jwtSecret = await prisma.serverConfig.findUnique({ where: { key: 'JWT_SECRET' } });
  if (!jwtSecret) {
    const generated = randomBytes(64).toString('hex');
    jwtSecret = await prisma.serverConfig.create({
      data: { key: 'JWT_SECRET', value: generated },
    });
    log.info('Generated new JWT_SECRET and saved to database.');
  } else {
    log.info('Loaded JWT_SECRET from database.');
  }
  Config.JWT_SECRET = jwtSecret.value;

  // 2. Check for JWT_REFRESH_SECRET
  let jwtRefreshSecret = await prisma.serverConfig.findUnique({ where: { key: 'JWT_REFRESH_SECRET' } });
  if (!jwtRefreshSecret) {
    const generated = randomBytes(64).toString('hex');
    jwtRefreshSecret = await prisma.serverConfig.create({
      data: { key: 'JWT_REFRESH_SECRET', value: generated },
    });
    log.info('Generated new JWT_REFRESH_SECRET and saved to database.');
  } else {
    log.info('Loaded JWT_REFRESH_SECRET from database.');
  }
  Config.JWT_REFRESH_SECRET = jwtRefreshSecret.value;
};
