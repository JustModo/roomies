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

// Bound how many ffprobe subprocesses run at once during a scan. A fully
// sequential loop over a large library (thousands of files) can take tens of
// minutes for one scan request; a small worker pool speeds this up without
// spawning an unbounded number of subprocesses at once.
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

// All library scans must stay within this root. Matches the read-only media
// mount configured in docker-compose.yml (/media).
const MEDIA_ROOT = path.resolve(process.env.MEDIA_ROOT || '/media');

/**
 * Resolves a user-supplied scan path and verifies it stays within MEDIA_ROOT.
 * Rejects absolute escapes, `..` traversal, and paths outside the allowed root.
 */
const resolveScanPath = (rootPath: string): string => {
  // Absolute paths (e.g. "/media", matching the container mount) are
  // resolved as-is; relative paths resolve against MEDIA_ROOT. Either way,
  // the result must land inside MEDIA_ROOT — this rejects both an absolute
  // escape like "/etc" and a traversal like "../../etc".
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

    // Upsert the library
    let library = await prisma.library.findFirst({ where: { path: safeRootPath } });
    if (!library) {
      library = await prisma.library.create({
        data: { name, path: safeRootPath },
      });
    }

    // Recursively scan folder. Symlinks are skipped rather than followed so a
    // symlink planted inside an allowed directory can't be used to escape
    // MEDIA_ROOT.
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

    // Process files with a small bounded concurrency so scanning a large
    // library doesn't take one ffprobe-process-at-a-time to complete.
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

    // Fetch updated library
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
