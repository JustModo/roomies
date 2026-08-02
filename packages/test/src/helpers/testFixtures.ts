import { createTestDatabase, TestDbContext } from './testDatabase';
import { createTestServer, TestServerContext } from './testServer';
import { createMockMediaDir, MockMediaDir } from './mockMedia';
import type { PrismaClient } from '@prisma/client';
import type { BootstrapOptions } from '@roomies/server/src/bootstrap';

export interface UserAccount {
  username: string;
  token: string;
  user: {
    id: string;
    username: string;
    role: string;
  };
}

export interface SeedingResult {
  library: any;
  movie: any;
  mediaFile: any;
}

export interface TestEnvironmentContext {
  db: TestDbContext;
  server: TestServerContext;
  mockMedia: MockMediaDir;
  admin: UserAccount;
  guest: UserAccount;
  media: SeedingResult;
  cleanup: () => Promise<void>;
}

export async function createAdminAccount(
  baseUrl: string,
  username = 'admin',
  password = 'password123'
): Promise<UserAccount> {
  const res = await fetch(`${baseUrl}/api/auth/setup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });

  if (!res.ok) {
    throw new Error(`Failed to create admin account: ${res.status} ${await res.text()}`);
  }

  const data = await res.json();
  return {
    username,
    token: data.token,
    user: data.user,
  };
}

export async function createGuestAccount(
  baseUrl: string,
  adminToken: string,
  username = 'guestuser',
  password = 'guestpassword123'
): Promise<UserAccount> {
  const createRes = await fetch(`${baseUrl}/api/users/guest`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminToken}`,
    },
    body: JSON.stringify({ username, password }),
  });

  if (!createRes.ok) {
    throw new Error(`Failed to create guest user: ${createRes.status} ${await createRes.text()}`);
  }

  const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });

  if (!loginRes.ok) {
    throw new Error(`Failed to log in guest user: ${loginRes.status} ${await loginRes.text()}`);
  }

  const loginData = await loginRes.json();
  return {
    username,
    token: loginData.token,
    user: loginData.user,
  };
}

export async function seedTestMedia(
  prisma: PrismaClient,
  mockMedia: MockMediaDir,
  title = 'Mock Movie',
  fileName = 'mock.mp4',
  duration = 600
): Promise<SeedingResult> {
  const library = await prisma.library.create({
    data: { name: 'Mock Lib', path: mockMedia.dirPath },
  });

  const movie = await prisma.movie.create({
    data: { name: title, type: 'movie', libraryId: library.id, path: mockMedia.dirPath },
  });

  const mediaFile = await prisma.mediaFile.create({
    data: {
      movieId: movie.id,
      title,
      path: mockMedia.createFile(fileName),
      duration,
    },
  });

  return { library, movie, mediaFile };
}

export async function setupTestEnvironment(
  serverOptions?: BootstrapOptions
): Promise<TestEnvironmentContext> {
  const mockMedia = createMockMediaDir();
  const db = await createTestDatabase();
  const media = await seedTestMedia(db.prisma, mockMedia);

  const server = await createTestServer(serverOptions);

  const admin = await createAdminAccount(server.baseUrl);
  const guest = await createGuestAccount(server.baseUrl, admin.token);

  const cleanup = async () => {
    await server.close();
    await db.cleanup();
    mockMedia.cleanup();
  };

  return {
    db,
    server,
    mockMedia,
    admin,
    guest,
    media,
    cleanup,
  };
}
