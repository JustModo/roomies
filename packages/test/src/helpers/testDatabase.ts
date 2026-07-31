import { execSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import os from 'os';

export interface TestDbContext {
  dbPath: string;
  cleanup: () => Promise<void>;
}

export async function createTestDatabase(): Promise<TestDbContext> {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'roomies-test-db-'));
  const dbPath = path.join(tmpDir, 'test.db');
  // Use file:// with 3 slashes for absolute SQLite file path in LibSQL
  const databaseUrl = `file://${dbPath}`;

  process.env.DATABASE_URL = databaseUrl;

  let rootDir = process.cwd();
  while (rootDir !== '/' && !fs.existsSync(path.join(rootDir, 'pnpm-workspace.yaml'))) {
    rootDir = path.dirname(rootDir);
  }
  const apiDir = path.join(rootDir, 'apps/api');

  try {
    execSync(`npx prisma db push --accept-data-loss`, {
      cwd: apiDir,
      env: { ...process.env, DATABASE_URL: databaseUrl },
      stdio: 'pipe',
    });
  } catch (err: any) {
    console.error('[testDb push error]:', err.stderr?.toString() || err.message);
  }

  const { prisma } = await import('@roomies/server/src/database/sqlite');

  try {
    await prisma.$connect();
  } catch {}

  const cleanup = async () => {
    try {
      await prisma.$disconnect();
    } catch {}
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {}
  };

  return { dbPath, cleanup };
}
