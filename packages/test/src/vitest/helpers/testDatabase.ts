import { execSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import os from 'os';
import type { PrismaClient } from '@prisma/client';
import { getPrisma, resetPrismaClient } from '../../../../../apps/api/src/database/sqlite';

export interface TestDatabaseOptions {
  skipPush?: boolean;
}

export interface TestDbContext {
  dbPath: string;
  databaseUrl: string;
  prisma: PrismaClient;
  cleanup: () => Promise<void>;
}

export async function createTestDatabase(options: TestDatabaseOptions = {}): Promise<TestDbContext> {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'roomies-test-db-'));
  const dbPath = path.join(tmpDir, 'test.db');
  const databaseUrl = `file://${dbPath}`;

  process.env.DATABASE_URL = databaseUrl;
  await resetPrismaClient();

  if (!options.skipPush) {
    let rootDir = process.cwd();
    while (rootDir !== '/' && !fs.existsSync(path.join(rootDir, 'pnpm-workspace.yaml'))) {
      rootDir = path.dirname(rootDir);
    }
    const apiDir = path.join(rootDir, 'apps/api');

    const localPrismaJs = path.join(apiDir, 'node_modules', 'prisma', 'build', 'index.js');
    const rootPrismaJs = path.join(rootDir, 'node_modules', 'prisma', 'build', 'index.js');

    let prismaCmd = '';
    if (fs.existsSync(localPrismaJs)) {
      prismaCmd = `"${process.execPath}" "${localPrismaJs}"`;
    } else if (fs.existsSync(rootPrismaJs)) {
      prismaCmd = `"${process.execPath}" "${rootPrismaJs}"`;
    } else {
      const pnpmBin = '/home/modo/.local/share/pnpm/pnpm';
      prismaCmd = fs.existsSync(pnpmBin) ? `"${pnpmBin}" exec prisma` : 'npx prisma';
    }

    try {
      execSync(`${prismaCmd} db push --accept-data-loss`, {
        cwd: apiDir,
        env: {
          ...process.env,
          PATH: `/home/modo/.local/share/pnpm:${process.env.PATH || ''}:/usr/local/bin:/usr/bin:/bin`,
          DATABASE_URL: databaseUrl,
        },
        stdio: 'pipe',
      });
    } catch (err: any) {
      const errMsg = err.stderr?.toString() || err.message;
      console.error('[testDb push error]:', errMsg);
      throw new Error(`Failed to push Prisma schema to test DB: ${errMsg}`);
    }
  }

  const prisma = getPrisma();
  try {
    await prisma.$connect();
  } catch (err) {
    console.error('[testDb connect error]:', err);
  }

  const cleanup = async () => {
    try {
      await resetPrismaClient();
    } catch {}
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
  };

  return { dbPath, databaseUrl, prisma, cleanup };
}
