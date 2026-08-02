#!/usr/bin/env node
/**
 * Prepares .e2e sandbox, then starts Caddy (docker-compose.dev) + API.
 * Sandbox prep lives here because Playwright starts webServer before globalSetup.
 */
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { prepareSandbox } from './prepare-sandbox.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const testPkgRoot = path.resolve(__dirname, '../..');

function findRepoRoot() {
  let rootDir = testPkgRoot;
  while (rootDir !== '/' && !fs.existsSync(path.join(rootDir, 'pnpm-workspace.yaml'))) {
    rootDir = path.dirname(rootDir);
  }
  return rootDir;
}

const envFile = prepareSandbox();
const repoRoot = findRepoRoot();

const childEnv = {
  ...process.env,
  ...envFile,
};

/** @type {import('child_process').ChildProcess[]} */
const children = [];
let shuttingDown = false;

function start(name, command, args) {
  console.log(`[e2e] starting ${name}: ${command} ${args.join(' ')}`);
  const child = spawn(command, args, {
    cwd: repoRoot,
    env: childEnv,
    stdio: 'inherit',
  });
  child.on('exit', (code, signal) => {
    if (shuttingDown) return;
    console.error(`[e2e] ${name} exited (code=${code}, signal=${signal}) — stopping stack`);
    shutdown(signal === 'SIGTERM' ? 'SIGTERM' : 'SIGTERM');
    process.exit(code && code !== 0 ? code : 1);
  });
  children.push(child);
  return child;
}

function shutdown(signal = 'SIGTERM') {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) {
    if (!child.killed) child.kill(signal);
  }
}

process.on('SIGINT', () => {
  shutdown('SIGINT');
  process.exit(130);
});
process.on('SIGTERM', () => {
  shutdown('SIGTERM');
  process.exit(143);
});

start('caddy', 'docker', ['compose', '-f', 'docker-compose.dev.yml', 'up']);
start('api', 'pnpm', [
  '--filter',
  '@roomies/server',
  'exec',
  'tsx',
  'src/index.ts',
]);
