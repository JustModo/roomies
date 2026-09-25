import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import WebSocket from 'ws';
import { setupTestEnvironment, TestEnvironmentContext } from '../helpers/testFixtures';

interface VoiceClient {
  ws: WebSocket;
  control: any[];
  audio: Buffer[];
  closed: Promise<number>;
  waitForControl: (event: string) => Promise<any>;
  waitForAudio: (count: number) => Promise<Buffer[]>;
}

const connectVoice = async (url: string, token: string): Promise<VoiceClient> => {
  const ws = new WebSocket(`${url}/ws/voice`, [`bearer.${token}`]);
  const control: any[] = [];
  const audio: Buffer[] = [];
  const closed = new Promise<number>((resolve) => ws.once('close', (code) => resolve(code)));
  ws.on('message', (data: Buffer, isBinary) => {
    if (isBinary) audio.push(data);
    else control.push(JSON.parse(data.toString()));
  });
  await new Promise((resolve, reject) => {
    ws.once('open', resolve);
    ws.once('error', reject);
  });
  return {
    ws,
    control,
    audio,
    closed,
    waitForControl: async (event) => {
      await vi.waitFor(() => expect(control.some((m) => m.event === event)).toBe(true));
      return control.find((m) => m.event === event);
    },
    waitForAudio: async (count) => {
      await vi.waitFor(() => expect(audio.length).toBeGreaterThanOrEqual(count));
      return audio;
    },
  };
};

const clientFrame = (seq: number, opusBytes: number) => {
  const frame = Buffer.alloc(2 + opusBytes, 0xab);
  frame.writeUInt16BE(seq, 0);
  return frame;
};

describe('Voice gateway', () => {
  let env: TestEnvironmentContext;
  const open: VoiceClient[] = [];

  const joinVoice = async (token: string) => {
    const client = await connectVoice(env.server.wsUrl, token);
    open.push(client);
    client.ws.send(JSON.stringify({ event: 'join' }));
    await client.waitForControl('joined');
    return client;
  };

  beforeAll(async () => {
    env = await setupTestEnvironment();
  });

  afterEach(async () => {
    vi.useRealTimers();
    for (const client of open.splice(0)) {
      if (client.ws.readyState !== WebSocket.CLOSED) client.ws.close();
      await client.closed;
    }
  });

  afterAll(async () => {
    await env.cleanup();
  });

  it('rejects an unauthenticated connection', async () => {
    const client = await connectVoice(env.server.wsUrl, 'not-a-jwt');
    await client.closed;
    expect(client.control).toContainEqual({ event: 'error', payload: 'Unauthorized' });
  });

  it('assigns session ids on join and announces new peers', async () => {
    const admin = await joinVoice(env.admin.token);
    const adminMap = admin.control.find((m) => m.event === 'session_map').payload;
    expect(Object.keys(adminMap)).toEqual([env.admin.user.id]);

    const guest = await joinVoice(env.guest.token);
    const guestMap = guest.control.find((m) => m.event === 'session_map').payload;
    expect(Object.keys(guestMap).sort()).toEqual([env.admin.user.id, env.guest.user.id].sort());
    expect(guestMap[env.admin.user.id]).not.toBe(guestMap[env.guest.user.id]);

    const announced = await admin.waitForControl('peer_joined');
    expect(announced.payload).toEqual({ userId: env.guest.user.id, sessionId: guestMap[env.guest.user.id] });
  });

  it('relays audio to other peers prefixed with the sender session id, never echoing it back', async () => {
    const admin = await joinVoice(env.admin.token);
    const guest = await joinVoice(env.guest.token);
    const guestMap = guest.control.find((m) => m.event === 'session_map').payload;

    const frame = clientFrame(4242, 40);
    admin.ws.send(frame);

    const [relayed] = await guest.waitForAudio(1);
    expect(relayed.readUInt16BE(0)).toBe(guestMap[env.admin.user.id]);
    expect(relayed.readUInt16BE(2)).toBe(4242);
    expect(relayed.subarray(2).equals(frame)).toBe(true);

    guest.ws.send(clientFrame(1, 40));
    await admin.waitForAudio(1);
    expect(guest.audio).toHaveLength(1);
  });

  it('drops oversized and truncated packets without closing the connection', async () => {
    const admin = await joinVoice(env.admin.token);
    const guest = await joinVoice(env.guest.token);

    admin.ws.send(clientFrame(1, 1276));
    admin.ws.send(Buffer.from([0, 2]));
    admin.ws.send(clientFrame(3, 1275));

    const [relayed] = await guest.waitForAudio(1);
    expect(relayed.readUInt16BE(2)).toBe(3);
    expect(guest.audio).toHaveLength(1);
    expect(admin.ws.readyState).toBe(WebSocket.OPEN);
  });

  it('ignores audio sent before joining', async () => {
    const guest = await joinVoice(env.guest.token);
    const lurker = await connectVoice(env.server.wsUrl, env.admin.token);
    open.push(lurker);

    lurker.ws.send(clientFrame(9, 40));
    lurker.ws.send(JSON.stringify({ event: 'join' }));
    await lurker.waitForControl('joined');
    lurker.ws.send(clientFrame(10, 40));

    const [relayed] = await guest.waitForAudio(1);
    expect(relayed.readUInt16BE(2)).toBe(10);
  });

  it('closes with a policy violation on an invalid control message', async () => {
    const admin = await joinVoice(env.admin.token);
    admin.ws.send('{"event":"bogus"}');
    expect(await admin.closed).toBe(1008);
  });

  it('pings joined peers and terminates one that stays silent past two heartbeats', async () => {
    const guest = await connectVoice(env.server.wsUrl, env.guest.token);
    open.push(guest);

    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
    guest.ws.send(JSON.stringify({ event: 'join' }));
    await guest.waitForControl('joined');

    vi.advanceTimersByTime(5000);
    await guest.waitForControl('ping');
    expect(guest.ws.readyState).toBe(WebSocket.OPEN);

    vi.advanceTimersByTime(10000);
    expect(await guest.closed).toBe(1006);
  });
});
