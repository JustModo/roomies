import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { detectMediaType, processMovie, processShow } from '@roomies/library';
import { createMockMediaDir, MockMediaDir } from '../helpers/mockMedia';
import { createTestDatabase, TestDbContext } from '../helpers/testDatabase';
import { prisma } from '@roomies/server/src/database/sqlite';

describe('Library Scanner & Media Detection', () => {
  let mockMedia: MockMediaDir;
  let db: TestDbContext;

  beforeAll(async () => {
    mockMedia = createMockMediaDir();
    db = await createTestDatabase();
  });

  afterAll(async () => {
    mockMedia.cleanup();
    await db.cleanup();
  });

  it('classifies a folder containing a single video file as a movie', () => {
    const movieFilePath = mockMedia.createFile('Movies/Inception/Inception.mp4');
    const mediaType = detectMediaType('Inception', [movieFilePath]);
    expect(mediaType).toBe('movie');
  });

  it('classifies a folder containing multiple episode files as a show', () => {
    const ep1 = mockMedia.createFile('Shows/Breaking Bad/S01E01.mp4');
    const ep2 = mockMedia.createFile('Shows/Breaking Bad/S01E02.mp4');
    const ep3 = mockMedia.createFile('Shows/Breaking Bad/S01E03.mp4');

    const mediaType = detectMediaType('Breaking Bad', [ep1, ep2, ep3]);
    expect(mediaType).toBe('show');
  });

  it('extracts metadata and creates a Movie database entry', async () => {
    const library = await prisma.library.create({
      data: { name: 'Test Movies', path: mockMedia.dirPath },
    });

    const movieFilePath = mockMedia.createFile('TestMovie/movie.mp4');
    const movieResult = processMovie(mockMedia.dirPath, 'TestMovie', [movieFilePath], []);

    expect(movieResult).not.toBeNull();
    expect(movieResult!.name).toBe('TestMovie');
    expect(movieResult!.type).toBe('movie');

    // Create database movie record
    const movieRecord = await prisma.movie.create({
      data: {
        libraryId: library.id,
        name: movieResult!.name,
        type: movieResult!.type,
        path: movieResult!.path,
      },
    });

    expect(movieRecord.id).toBeDefined();
  });

  it('groups multiple episodes under a single Show entry', async () => {
    const ep1Path = mockMedia.createFile('TestShow/S01E01.mp4');
    const ep2Path = mockMedia.createFile('TestShow/S01E02.mp4');

    const showResult = processShow(mockMedia.dirPath, 'TestShow', [ep1Path, ep2Path], []);

    expect(showResult).not.toBeNull();
    expect(showResult!.name).toBe('TestShow');
    expect(showResult!.type).toBe('show');
    expect(showResult!.episodes.length).toBe(2);
  });

  it('discovers sidecar subtitle files alongside video files', async () => {
    const moviePath = mockMedia.createFile('SubMovie/film.mp4');
    const subPath = mockMedia.createFile('SubMovie/film.en.srt');

    const movieResult = processMovie(mockMedia.dirPath, 'SubMovie', [moviePath], [subPath]);

    expect(movieResult).not.toBeNull();
    expect(movieResult!.episodes[0].subtitles.length).toBeGreaterThan(0);
    expect(movieResult!.episodes[0].subtitles[0].path).toBe(subPath);
  });
});
