import { spawn, execFileSync } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

const PORT = 3999;
const BASE_URL = `http://localhost:${PORT}`;
const API_ROOT = path.resolve(__dirname, '..');

let passed = 0;
let failed = 0;

const check = (name: string, cond: boolean, detail?: unknown) => {
  if (cond) {
    console.log(`PASS  ${name}`);
    passed++;
  } else {
    console.log(`FAIL  ${name}`, detail !== undefined ? JSON.stringify(detail) : '');
    failed++;
  }
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const waitOpen = (ws: WebSocket) =>
  new Promise((resolve, reject) => {
    ws.addEventListener('open', () => resolve(undefined));
    ws.addEventListener('error', (e) => reject(e));
  });

const waitForServer = async (url: string, timeoutMs: number) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      await fetch(url);
      return;
    } catch {
      await sleep(300);
    }
  }
  throw new Error('server did not become ready in time');
};

async function main() {
  const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'roomies-e2e-'));
  const mediaDir = path.join(tmpRoot, 'media');
  const cacheDir = path.join(tmpRoot, 'cache');
  const dbPath = path.join(tmpRoot, 'test.db');
  await fs.mkdir(mediaDir, { recursive: true });
  await fs.mkdir(cacheDir, { recursive: true });

  console.log(`Working dir: ${tmpRoot}`);

  // Generate a tiny real test video with ffmpeg (2s, video + silent audio).
  const videoPath = path.join(mediaDir, 'sample.mp4');
  execFileSync('ffmpeg', [
    '-y',
    '-f', 'lavfi', '-i', 'testsrc=duration=2:size=320x240:rate=10',
    '-f', 'lavfi', '-i', 'anullsrc=r=8000:cl=mono',
    '-shortest', '-c:v', 'libopenh264', '-pix_fmt', 'yuv420p', '-t', '2',
    videoPath,
  ], { stdio: 'ignore' });

  // Push the Prisma schema to a fresh SQLite file.
  execFileSync('npx', ['prisma', 'db', 'push', '--accept-data-loss'], {
    cwd: API_ROOT,
    env: { ...process.env, DATABASE_URL: `file:${dbPath}` },
    stdio: 'ignore',
  });

  const server = spawn('npx', ['tsx', 'src/index.ts'], {
    cwd: API_ROOT,
    env: {
      ...process.env,
      DATABASE_URL: `file:${dbPath}`,
      MEDIA_ROOT: mediaDir,
      CACHE_DIR: cacheDir,
      HLS_BASE_URL: 'http://localhost/hls',
      CORS_ORIGIN: 'http://localhost',
      PORT: String(PORT),
      LOG_LEVEL: 'warn',
      // This dev machine's ffmpeg build has no libx264 (Fedora ships none by
      // default); libopenh264 is the available software H.264 encoder here,
      // and it expects different -profile:v syntax than libx264.
      FFMPEG_VIDEO_CODEC: 'libopenh264',
      FFMPEG_VIDEO_CODEC_ARGS: '-profile:v constrained_baseline',
    },
  });

  let serverOutput = '';
  server.stdout?.on('data', (d) => { serverOutput += d.toString(); });
  server.stderr?.on('data', (d) => { serverOutput += d.toString(); });
  server.on('exit', (code, signal) => {
    if (code !== null && code !== 0) {
      console.log(`\n[server exited unexpectedly] code=${code} signal=${signal}`);
    }
  });

  try {
    await waitForServer(`${BASE_URL}/api/auth/login`, 15000);

    // 1. Root setup
    const setupRes = await fetch(`${BASE_URL}/api/auth/setup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'root', password: 'password123' }),
    });
    const setupBody: any = await setupRes.json();
    check('1. root setup succeeds', setupRes.status === 200 && !!setupBody.token, setupBody);
    const rootToken = setupBody.token;

    // 2. Guest creation + role gating
    const guestCreateRes = await fetch(`${BASE_URL}/api/users/guest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${rootToken}` },
      body: JSON.stringify({ username: 'guest', password: 'password123' }),
    });
    check('2a. guest creation succeeds', guestCreateRes.status === 201);

    const guestLoginRes = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'guest', password: 'password123' }),
    });
    const guestLoginBody: any = await guestLoginRes.json();
    const guestToken = guestLoginBody.token;

    const guestScanRes = await fetch(`${BASE_URL}/api/library/scan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${guestToken}` },
      body: JSON.stringify({ name: 'lib', path: mediaDir }),
    });
    check('2b. guest denied library scan (403)', guestScanRes.status === 403);

    // 3. Root scans the library
    const scanRes = await fetch(`${BASE_URL}/api/library/scan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${rootToken}` },
      body: JSON.stringify({ name: 'Main', path: mediaDir }),
    });
    const scanBody: any = await scanRes.json();
    check(
      '3. library scan finds media file with real ffprobe duration',
      scanRes.status === 200 && scanBody.mediaFiles?.length === 1 && scanBody.mediaFiles[0].duration > 0,
      scanBody
    );
    const mediaFileId = scanBody.mediaFiles?.[0]?.id;

    const guestStartRes = await fetch(`${BASE_URL}/api/playback/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${guestToken}` },
      body: JSON.stringify({ mediaFileId }),
    });
    check('3b. guest denied playback start (403)', guestStartRes.status === 403);

    // 4. Root starts the party — with live transcoding, no polling needed
    const startRes = await fetch(`${BASE_URL}/api/playback/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${rootToken}` },
      body: JSON.stringify({ mediaFileId }),
    });
    const startBody: any = await startRes.json();
    check('4a. playback start succeeds and returns hlsUrl', startRes.status === 201 && !!startBody.partyId && !!startBody.hlsUrl, startBody);
    const partyId = startBody.partyId;

    // Give FFmpeg a moment to start writing the variant playlists
    await sleep(3000);

    const playlistPath = path.join(cacheDir, partyId, 'master.m3u8');
    const playlistExists = await fs.access(playlistPath).then(() => true).catch(() => false);
    check('4b. HLS master playlist file exists on disk', playlistExists, playlistPath);

    // 5. WebSocket leader-only enforcement
    const rootWs = new WebSocket(`ws://localhost:${PORT}/ws?token=${rootToken}`);
    const guestWs = new WebSocket(`ws://localhost:${PORT}/ws?token=${guestToken}`);
    await Promise.all([waitOpen(rootWs), waitOpen(guestWs)]);

    const rootMessages: any[] = [];
    const guestMessages: any[] = [];
    rootWs.addEventListener('message', (e) => rootMessages.push(JSON.parse(e.data.toString())));
    guestWs.addEventListener('message', (e) => guestMessages.push(JSON.parse(e.data.toString())));

    rootWs.send(JSON.stringify({ event: 'client.join', payload: { partyId } }));
    guestWs.send(JSON.stringify({ event: 'client.join', payload: { partyId } }));
    await sleep(500);

    guestWs.send(JSON.stringify({ event: 'client.play', payload: { position: 5 } }));
    await sleep(500);
    check(
      '5a. guest client.play is ignored (no server.play broadcast)',
      !rootMessages.some((m) => m.event === 'server.play') && !guestMessages.some((m) => m.event === 'server.play')
    );

    rootWs.send(JSON.stringify({ event: 'client.play', payload: { position: 5 } }));
    await sleep(500);
    check(
      '5b. root client.play broadcasts server.play to both sockets',
      rootMessages.some((m) => m.event === 'server.play') && guestMessages.some((m) => m.event === 'server.play')
    );

    // 6. Chat: broadcast + history
    rootWs.send(JSON.stringify({ event: 'client.chat', payload: { partyId, message: 'hello from root' } }));
    guestWs.send(JSON.stringify({ event: 'client.chat', payload: { partyId, message: 'hello from guest' } }));
    await sleep(500);

    const rootChatMsgs = rootMessages.filter((m) => m.event === 'server.chat');
    const guestChatMsgs = guestMessages.filter((m) => m.event === 'server.chat');
    check('6a. both sockets receive both chat broadcasts', rootChatMsgs.length === 2 && guestChatMsgs.length === 2);

    const historyRes = await fetch(`${BASE_URL}/api/chat/history?partyId=${partyId}`, {
      headers: { Authorization: `Bearer ${rootToken}` },
    });
    const historyBody: any = await historyRes.json();
    check(
      '6b. chat history returns both messages in order',
      Array.isArray(historyBody) &&
        historyBody.length === 2 &&
        historyBody[0].message === 'hello from root' &&
        historyBody[1].message === 'hello from guest',
      historyBody
    );

    // 7. Sync Engine: drift correction targets only the drifting socket
    rootMessages.length = 0;
    guestMessages.length = 0;
    guestWs.send(JSON.stringify({ event: 'client.heartbeat', payload: { partyId, position: 999 } }));
    await sleep(500);
    check(
      '7. drifting client gets server.seek correction, other socket does not',
      guestMessages.some((m) => m.event === 'server.seek') && !rootMessages.some((m) => m.event === 'server.seek'),
      { guestMessages, rootMessages }
    );

    rootWs.close();
    guestWs.close();
    await sleep(200);
  } finally {
    server.kill('SIGTERM');
    await sleep(500);
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  if (failed > 0) {
    console.log('\n--- server output tail ---');
    console.log(serverOutput.slice(-4000));
  }
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('E2E test crashed:', err);
  process.exit(1);
});
