import fs from 'fs/promises';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import ffprobeStatic from 'ffprobe-static';
import { prisma } from '../database/postgres';
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

  async scanLibrary(name: string, rootPath: string): Promise<Library> {
    // Upsert the library
    let library = await prisma.library.findFirst({ where: { path: rootPath } });
    if (!library) {
      library = await prisma.library.create({
        data: { name, path: rootPath },
      });
    }

    // Recursively scan folder
    const walk = async (dir: string): Promise<string[]> => {
      let results: string[] = [];
      const list = await fs.readdir(dir, { withFileTypes: true });
      for (const file of list) {
        const fullPath = path.join(dir, file.name);
        if (file.isDirectory()) {
          results = results.concat(await walk(fullPath));
        } else {
          if (SUPPORTED_EXTENSIONS.includes(path.extname(file.name).toLowerCase())) {
            results.push(fullPath);
          }
        }
      }
      return results;
    };

    const mediaFiles = await walk(rootPath);

    // Process each file
    for (const file of mediaFiles) {
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
    }

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
