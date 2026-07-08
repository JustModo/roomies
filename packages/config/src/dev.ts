import fs from 'fs';
import path from 'path';

export const NODE_ENV = process.env.NODE_ENV || 'development';
export const isDev = NODE_ENV !== 'production';

// Helper to find project root by searching upwards for pnpm-workspace.yaml or turbo.json
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
