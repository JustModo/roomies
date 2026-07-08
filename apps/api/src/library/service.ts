import fs from 'fs/promises';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
// @ts-ignore
import ffprobeStatic from 'ffprobe-static';
import { prisma } from '../database/sqlite';
import { Library, MediaFile } from '@roomies/contracts';

const execFileAsync = promisify(execFile);

const getMediaDuration = async (filePath: string): Promise<number> => {
  try {
    const { stdout } = await execFileAsync(ffprobeStatic.path, [
      '-v', 'error',
      '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1',
      filePath
    ]);
    const duration = parseFloat(stdout.trim());
    return isNaN(duration) ? 0 : Math.floor(duration);
  } catch (err) {
    throw err;
  }
};

const SUPPORTED_EXTENSIONS = ['.mp4', '.mkv', '.webm'];

// NOTE: Bounded worker pool to run ffprobe concurrently and speed up scanning.
const SCAN_CONCURRENCY = 4;

const runWithConcurrency = async <T>(items: T[], worker: (item: T) => Promise<void>): Promise<void> => {
  let cursor = 0;
  const runNext = async (): Promise<void> => {
    while (cursor < items.length) {
      const item = items[cursor++];
      await worker(item);
    }
  };
  await Promise.all(Array.from({ length: Math.min(SCAN_CONCURRENCY, items.length) }, runNext));
};

// NOTE: Restricts scans to configured MEDIA_ROOT path.
import { MEDIA_ROOT as CONFIG_MEDIA_ROOT } from '@roomies/config';

const MEDIA_ROOT = CONFIG_MEDIA_ROOT;

/** Resolves the scan path and verifies it stays within MEDIA_ROOT. */
const resolveScanPath = (rootPath: string): string => {
  // NOTE: Rejects directory traversal or absolute escapes outside MEDIA_ROOT.
  const resolved = path.isAbsolute(rootPath)
    ? path.resolve(rootPath)
    : path.resolve(MEDIA_ROOT, rootPath);

  if (resolved !== MEDIA_ROOT && !resolved.startsWith(MEDIA_ROOT + path.sep)) {
    throw new Error('Invalid library path: must be within the configured media root');
  }
  return resolved;
};

export const LibraryService = {
  async getLibraries(): Promise<Library[]> {
    const libs = await prisma.library.findMany({
      include: { mediaFiles: true },
    });

    return libs.map(lib => ({
      id: lib.id,
      name: lib.name,
      path: lib.path,
      mediaFiles: lib.mediaFiles.map(mf => ({
        id: mf.id,
        libraryId: mf.libraryId,
        title: mf.title,
        path: mf.path,
        duration: mf.duration,
        createdAt: mf.createdAt.toISOString(),
      })),
    }));
  },

  async scanLibrary(): Promise<Library> {
    const name = "Library";
    const safeRootPath = MEDIA_ROOT;

    let library = await prisma.library.findFirst({ where: { path: safeRootPath } });
    if (!library) {
      library = await prisma.library.create({
        data: { name, path: safeRootPath },
      });
    }

    // NOTE: Skips symlinks to prevent directory traversal escapes.
    const walk = async (dir: string): Promise<string[]> => {
      let results: string[] = [];
      const list = await fs.readdir(dir, { withFileTypes: true });
      for (const file of list) {
        if (file.isSymbolicLink()) continue;

        const fullPath = path.join(dir, file.name);
        if (file.isDirectory()) {
          results = results.concat(await walk(fullPath));
        } else if (file.isFile()) {
          if (SUPPORTED_EXTENSIONS.includes(path.extname(file.name).toLowerCase())) {
            results.push(fullPath);
          }
        }
      }
      return results;
    };

    const mediaFiles = await walk(safeRootPath);

    const existingDbFiles = await prisma.mediaFile.findMany({ where: { libraryId: library.id } });
    const diskFilesSet = new Set(mediaFiles);
    
    const missingFileIds = existingDbFiles
      .filter(dbFile => !diskFilesSet.has(dbFile.path))
      .map(dbFile => dbFile.id);

    if (missingFileIds.length > 0) {
      await prisma.mediaFile.deleteMany({
        where: { id: { in: missingFileIds } }
      });
      console.log(`Pruned ${missingFileIds.length} missing files from database.`);
    }

    // NOTE: Process files in parallel via bounded concurrency.
    await runWithConcurrency(mediaFiles, async (file) => {
      const existing = await prisma.mediaFile.findFirst({ where: { path: file, libraryId: library.id } });
      if (!existing) {
        try {
          const duration = await getMediaDuration(file);
          await prisma.mediaFile.create({
            data: {
              libraryId: library.id,
              title: path.basename(file, path.extname(file)),
              path: file,
              duration,
            },
          });
        } catch (err) {
          console.error(`Failed to process media file: ${file}`, err);
        }
      }
    });

    const updatedLibrary = await prisma.library.findUniqueOrThrow({
      where: { id: library.id },
      include: { mediaFiles: true },
    });

    return {
      id: updatedLibrary.id,
      name: updatedLibrary.name,
      path: updatedLibrary.path,
      mediaFiles: updatedLibrary.mediaFiles.map(mf => ({
        id: mf.id,
        libraryId: mf.libraryId,
        title: mf.title,
        path: mf.path,
        duration: mf.duration,
        createdAt: mf.createdAt.toISOString(),
      })),
    };
  }
};
