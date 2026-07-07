import { spawn, execFileSync } from 'child_process';
import fs from 'fs/promises';
import fsSync from 'fs';
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

  // Generate a real test video with ffmpeg (10s, video + silent audio) — long
  // enough to exercise the low-latency rolling HLS window (2s segments, 10
  // segment cap) without the test taking forever.
  const videoPath = path.join(mediaDir, 'sample.mp4');
  execFileSync('ffmpeg', [
    '-y',
    '-f', 'lavfi', '-i', 'testsrc=duration=10:size=320x240:rate=10',
    '-f', 'lavfi', '-i', 'anullsrc=r=8000:cl=mono',
    '-shortest', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-t', '10',
    videoPath,
  ], { stdio: 'ignore' });

  // Push the Prisma schema to a fresh SQLite file.
  execFileSync('npx', ['prisma', 'db', 'push', '--accept-data-loss'], {
    cwd: API_ROOT,
    env: { ...process.env, DATABASE_URL: `file:${dbPath}` },
    stdio: 'ignore',
  });

  // Generate test.conf
  const confPath = path.join(tmpRoot, 'test.conf');
  const confContent = `
PORT=${PORT}
CORS_ORIGIN=http://localhost
FFMPEG_VIDEO_CODEC=libx264
MEDIA_ROOT=${mediaDir}
CACHE_DIR=${cacheDir}
DATABASE_URL=file:${dbPath}
`;
  await fs.writeFile(confPath, confContent);

  const server = spawn('npx', ['tsx', 'src/index.ts'], {
    cwd: API_ROOT,
    env: {
      ...process.env,
      ROOMIES_CONFIG_PATH: confPath,
      LOG_LEVEL: 'warn',
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

    // 3. Root scans the library — POST /api/library/scan returns a single
    // Library object (mediaFiles directly on it), not an array of libraries.
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

    // 3b. Guest denied changing the currently playing media (root-only,
    // still enforced at the HTTP layer via requireRole('root')).
    const guestChangeMediaRes = await fetch(`${BASE_URL}/api/playback/change-media`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${guestToken}` },
      body: JSON.stringify({ mediaFileId }),
    });
    check('3b. guest denied change-media (403)', guestChangeMediaRes.status === 403);

    // 4. Root changes the playing media — single global room, no partyId.
    // The app is single-active-media: this both starts transcoding and
    // becomes "the party" everyone connected is watching.
    const changeMediaRes = await fetch(`${BASE_URL}/api/playback/change-media`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${rootToken}` },
      body: JSON.stringify({ mediaFileId }),
    });
    const changeMediaBody: any = await changeMediaRes.json();
    check(
      '4a. change-media succeeds and returns hlsUrl (no partyId)',
      changeMediaRes.status === 200 &&
        changeMediaBody.mediaFileId === mediaFileId &&
        changeMediaBody.hlsUrl === `/api/playback/hls/${mediaFileId}/master.m3u8`,
      changeMediaBody
    );

    // 4b. Fast-start pre-warm: the 360p variant should already be on disk
    // shortly after change-media returns — nobody has requested it yet.
    const variantPlaylist = path.join(cacheDir, mediaFileId, '360p', 'stream.m3u8');
    let preWarmed = false;
    for (let i = 0; i < 20; i++) {
      if (fsSync.existsSync(variantPlaylist)) { preWarmed = true; break; }
      await sleep(300);
    }
    check('4b. 360p variant pre-warmed on disk without any client request', preWarmed, { variantPlaylist });

    // 4c. Let the session run long enough to exercise the low-latency HLS
    // tuning: 2s segments, bounded rolling window (hls_list_size 10).
    await sleep(8000);
    const playlistContent = fsSync.readFileSync(variantPlaylist, 'utf-8');
    const targetDurationMatch = playlistContent.match(/#EXT-X-TARGETDURATION:(\d+)/);
    check(
      '4c. segment duration is ~2s (low-latency HLS tuning)',
      !!targetDurationMatch && parseInt(targetDurationMatch[1], 10) <= 3,
      playlistContent.slice(0, 300)
    );
    const segmentEntries = playlistContent.match(/seg_\d+\.ts/g) || [];
    check(
      '4d. playlist is bounded to ~10 entries (rolling live window)',
      segmentEntries.length > 0 && segmentEntries.length <= 12,
      { count: segmentEntries.length }
    );

    // 5. WebSocket: connect, join the room, and drive playback/chat/sync.
    const rootWs = new WebSocket(`ws://localhost:${PORT}/ws?token=${rootToken}`);
    const guestWs = new WebSocket(`ws://localhost:${PORT}/ws?token=${guestToken}`);
    await Promise.all([waitOpen(rootWs), waitOpen(guestWs)]);

    const rootMessages: any[] = [];
    const guestMessages: any[] = [];
    rootWs.addEventListener('message', (e) => rootMessages.push(JSON.parse(e.data.toString())));
    guestWs.addEventListener('message', (e) => guestMessages.push(JSON.parse(e.data.toString())));

    rootWs.send(JSON.stringify({ event: 'room.join', payload: {} }));
    guestWs.send(JSON.stringify({ event: 'room.join', payload: {} }));
    await sleep(500);
    check(
      '5a. both sockets receive room.state after joining',
      rootMessages.some((m) => m.event === 'room.state') && guestMessages.some((m) => m.event === 'room.state')
    );

    // Playback control currently has no role check on the socket path (only
    // the HTTP change-media endpoint is root-gated) — assert what's actually
    // true today, not the old (no-longer-accurate) "leader-only" assumption.
    guestWs.send(JSON.stringify({ event: 'playback.play', payload: {} }));
    await sleep(500);
    check(
      '5b. guest client.play IS currently honored (no WS-level role check — see tasks/LOG.md)',
      rootMessages.some((m) => m.event === 'playback.state') && guestMessages.some((m) => m.event === 'playback.state')
    );

    // 6. Chat: broadcast + history
    rootMessages.length = 0;
    guestMessages.length = 0;
    rootWs.send(JSON.stringify({ event: 'chat.send', payload: { message: 'hello from root' } }));
    guestWs.send(JSON.stringify({ event: 'chat.send', payload: { message: 'hello from guest' } }));
    await sleep(500);

    const rootChatMsgs = rootMessages.filter((m) => m.event === 'chat.message');
    const guestChatMsgs = guestMessages.filter((m) => m.event === 'chat.message');
    check('6a. both sockets receive both chat broadcasts', rootChatMsgs.length === 2 && guestChatMsgs.length === 2);

    const historyRes = await fetch(`${BASE_URL}/api/chat/history`, {
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
    guestWs.send(JSON.stringify({ event: 'sync.heartbeat', payload: { position: 999, playing: true, playbackRate: 1 } }));
    await sleep(500);
    check(
      '7. drifting client gets sync.correct, other socket does not',
      guestMessages.some((m) => m.event === 'sync.correct') && !rootMessages.some((m) => m.event === 'sync.correct'),
      { guestMessages, rootMessages }
    );

    rootWs.close();
    guestWs.close();
    await sleep(200);
  } finally {
    server.kill('SIGTERM');
    await sleep(500);
    await fs.rm(tmpRoot, { recursive: true, force: true }).catch(() => {});
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
