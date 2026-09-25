import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setupTestEnvironment, TestEnvironmentContext } from '../helpers/testFixtures';

const SRT = '1\n00:00:01,000 --> 00:00:02,500\nHello there\n';
const ASS = '[Script Info]\nScriptType: v4.00+\n\n[Events]\nFormat: Layer, Start, End, Style, Text\nDialogue: 0,0:00:01.00,0:00:02.00,Default,{\\an8}Top line\n';

describe('Subtitle routes', () => {
  let env: TestEnvironmentContext;

  const upload = (token: string, filename: string, content: string, language?: string) => {
    const form = new FormData();
    if (language) form.append('language', language);
    form.append('file', new Blob([content]), filename);
    return fetch(`${env.server.baseUrl}/api/library/media/${env.media.mediaFile.id}/subtitles`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });
  };

  const getSubtitle = (id: string) =>
    fetch(`${env.server.baseUrl}/api/library/subtitles/${id}`, { headers: { Authorization: `Bearer ${env.guest.token}` } });

  const deleteSubtitle = (id: string, token: string) =>
    fetch(`${env.server.baseUrl}/api/library/subtitles/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });

  beforeAll(async () => {
    env = await setupTestEnvironment();
  });

  afterAll(async () => {
    await env.cleanup();
  });

  it('forbids guests from uploading subtitles', async () => {
    expect((await upload(env.guest.token, 'subs.srt', SRT)).status).toBe(403);
  });

  it('rejects an unsupported subtitle extension', async () => {
    expect((await upload(env.admin.token, 'subs.txt', SRT)).status).toBe(400);
  });

  it('uploads an SRT as root and serves it converted to WebVTT', async () => {
    const res = await upload(env.admin.token, 'subs.srt', SRT, 'en');
    expect(res.status).toBe(201);
    const created = await res.json();
    expect(created.language).toBe('external:en');

    const served = await getSubtitle(created.id);
    expect(served.status).toBe(200);
    expect(served.headers.get('content-type')).toContain('text/vtt');
    const body = await served.text();
    expect(body).toMatch(/^WEBVTT/);
    expect(body).toContain('00:00:01.000 --> 00:00:02.500');
  });

  it('serves an uploaded ASS file raw rather than converting it to WebVTT', async () => {
    const created = await (await upload(env.admin.token, 'styled.ass', ASS)).json();

    const served = await getSubtitle(created.id);
    expect(served.status).toBe(200);
    expect(served.headers.get('content-type')).toContain('text/x-ssa');
    const body = await served.text();
    expect(body).toBe(ASS);
    expect(body).not.toContain('WEBVTT');
  });

  it('lets only root delete an uploaded subtitle, which then 404s', async () => {
    const created = await (await upload(env.admin.token, 'gone.srt', SRT)).json();

    expect((await deleteSubtitle(created.id, env.guest.token)).status).toBe(403);
    expect((await deleteSubtitle(created.id, env.admin.token)).status).toBe(204);
    expect((await getSubtitle(created.id)).status).toBe(404);
  });

  it('refuses to delete an embedded (non-external) subtitle', async () => {
    const embedded = await env.db.prisma.subtitle.create({
      data: { mediaFileId: env.media.mediaFile.id, path: '/nowhere/0.vtt', language: 'en', streamIndex: 2 },
    });

    expect((await deleteSubtitle(embedded.id, env.admin.token)).status).toBe(400);
  });
});
