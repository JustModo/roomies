import fs from 'fs';
import path from 'path';

export const NODE_ENV = process.env.NODE_ENV || 'development';
export const isDev = NODE_ENV !== 'production';

// NOTE: Searches upwards to locate the project root.
function findProjectRoot(startDir: string): string {
  let dir = startDir;
  while (dir !== path.parse(dir).root) {
    if (fs.existsSync(path.join(dir, 'pnpm-workspace.yaml')) || fs.existsSync(path.join(dir, 'turbo.json'))) {
      return dir;
    }
    dir = path.dirname(dir);
  }
  return startDir;
}

export const projectRoot = isDev ? findProjectRoot(process.cwd()) : process.cwd();
