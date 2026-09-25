import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { roomStore } from '@roomies/server';
import { setupTestEnvironment, TestEnvironmentContext } from '../helpers/testFixtures';

describe('HLS playback routes', () => {
  let env: TestEnvironmentContext;
  let hls: string;

  const get = (path: string, headers: Record<string, string> = { Authorization: `Bearer ${env.admin.token}` }) =>
    fetch(`${hls}${path}`, { headers });

  beforeAll(async () => {
    env = await setupTestEnvironment();
    hls = `${env.server.baseUrl}/api/playback/hls/${env.media.mediaFile.id}`;
  });

  beforeEach(() => {
    roomStore.resetStore();
    roomStore.updateMedia(env.media.mediaFile.id, 'Mock Movie', '', 600, 0, [], [
      { id: 'track-1', language: 'en', title: null, channels: 2 },
    ]);
  });

  afterAll(async () => {
    await env.cleanup();
  });

  it('returns 401 without a bearer token or media cookie', async () => {
    expect((await get('/sync/master.m3u8', {})).status).toBe(401);
    expect((await get('/sync/master.m3u8', { Cookie: 'roomies_media=garbage' })).status).toBe(401);
  });

  it('serves the master playlist to a request carrying only the media cookie', async () => {
    const res = await get('/sync/master.m3u8', { Cookie: `roomies_media=${env.guest.token}` });

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('application/vnd.apple.mpegurl');
    expect(await res.text()).toMatch(/^#EXTM3U/);
  });

  it('rejects a sessionId other than sync or async with 400', async () => {
    expect((await get('/bogus/master.m3u8')).status).toBe(400);
    expect((await get('/user-123/master.m3u8')).status).toBe(400);
  });

  it('rejects a negative or non-numeric offset with 400', async () => {
    expect((await get('/sync/master.m3u8?offset=-5')).status).toBe(400);
    expect((await get('/sync/master.m3u8?offset=abc')).status).toBe(400);
  });

  it('rejects an unsupported resolution with 400', async () => {
    expect((await get('/sync/999p/stream.m3u8')).status).toBe(400);
  });

  it('returns 404 for an audio track that is not on the current media', async () => {
    expect((await get('/sync/audio/unknown-track/stream.m3u8')).status).toBe(404);
  });

  it('returns 404 for media that is not currently playing', async () => {
    const res = await fetch(`${env.server.baseUrl}/api/playback/hls/some-other-media/sync/master.m3u8`, {
      headers: { Authorization: `Bearer ${env.admin.token}` },
    });
    expect(res.status).toBe(404);
  });
});
