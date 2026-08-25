import fs from 'fs';
import path from 'path';
import os from 'os';

export interface MockMediaDir {
  dirPath: string;
  createFile: (relPath: string, content?: string) => string;
  cleanup: () => void;
}

export function createMockMediaDir(): MockMediaDir {
  const dirPath = fs.mkdtempSync(path.join(os.tmpdir(), 'roomies-mock-media-'));

  const createFile = (relPath: string, content = 'dummy content'): string => {
    const fullPath = path.join(dirPath, relPath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, content);
    return fullPath;
  };

  const cleanup = () => {
    try {
      fs.rmSync(dirPath, { recursive: true, force: true });
    } catch {}
  };

  return { dirPath, createFile, cleanup };
}
