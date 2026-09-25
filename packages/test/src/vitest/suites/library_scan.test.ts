import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import { loadConfig } from '@roomies/config';
import { LibraryService, libraryOptionsFrom } from '@roomies/library';
import { silentLogger } from '../helpers/silentLogger';
import { createTestDatabase, TestDbContext } from '../helpers/testDatabase';

describe('Library scan against disk', () => {
  let db: TestDbContext;
  let library: LibraryService;
  const titleDir = path.join(process.env.MEDIA_ROOT!, 'Arrival');
  const video = path.join(titleDir, 'Arrival.mkv');
  const englishSubs = path.join(titleDir, 'Arrival.en.srt');
  const frenchSubs = path.join(titleDir, 'Arrival.fr.srt');

  const mediaFile = () => db.prisma.mediaFile.findFirstOrThrow({ where: { path: video } });
  const sidecars = async () =>
    db.prisma.subtitle.findMany({ where: { mediaFileId: (await mediaFile()).id, streamIndex: null }, orderBy: { path: 'asc' } });
  const probeFailed = () => vi.waitFor(async () => expect((await mediaFile()).sourceMtimeMs).toBe(0), { timeout: 5000 });

  beforeAll(async () => {
    db = await createTestDatabase();
    library = new LibraryService(db.prisma, libraryOptionsFrom(loadConfig()), silentLogger);
    fs.mkdirSync(titleDir, { recursive: true });
    fs.writeFileSync(video, 'video');
    fs.writeFileSync(englishSubs, '1\n00:00:01,000 --> 00:00:02,000\nHi\n');
  });

  afterAll(async () => {
    fs.rmSync(titleDir, { recursive: true, force: true });
    await db.cleanup();
  });

  it('imports a same-basename sidecar subtitle with the language from its filename', async () => {
    await library.scan();

    await vi.waitFor(async () => expect(await sidecars()).toHaveLength(1));
    const [subtitle] = await sidecars();
    expect(subtitle.path).toBe(englishSubs);
    expect(subtitle.language).toBe('en');
  });

  it('resets sourceMtimeMs after a failed audio probe so the next scan retries the file', async () => {
    await probeFailed();
  });

  it('picks up new sidecars on rescan without duplicating existing ones', async () => {
    fs.writeFileSync(frenchSubs, '1\n00:00:01,000 --> 00:00:02,000\nSalut\n');
    await library.scan();

    await vi.waitFor(async () => expect((await sidecars()).map((s) => s.language)).toEqual(['en', 'fr']));
    await probeFailed();
  });

  it('removes the row of a sidecar deleted from disk', async () => {
    fs.rmSync(englishSubs);
    await library.scan();

    await vi.waitFor(async () => expect((await sidecars()).map((s) => s.path)).toEqual([frenchSubs]));
    await probeFailed();
  });

  it('shares one in-flight scan between concurrent callers', async () => {
    const findFirst = vi.spyOn(db.prisma.library, 'findFirst');

    const [a, b] = await Promise.all([library.scan(), library.scan()]);

    expect(findFirst).toHaveBeenCalledTimes(1);
    expect(a).toEqual(b);
    findFirst.mockRestore();
    await probeFailed();
  });
});
