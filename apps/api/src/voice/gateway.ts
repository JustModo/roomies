import { WebSocket } from '@fastify/websocket';
import { FastifyBaseLogger, FastifyInstance, FastifyRequest } from 'fastify';
import { AuthGuard } from '../auth/middleware';
import { RateLimiter } from '../common/rateLimiter';
import { VOICE_PROTOCOL, VoiceClientControlMessage } from './config';
import { VoiceManager, sendControl } from './manager';

type RawMessage = Buffer | ArrayBuffer | Buffer[];

const toBuffer = (message: RawMessage): Buffer =>
  Buffer.isBuffer(message) ? message : Array.isArray(message) ? Buffer.concat(message) : Buffer.from(message);

const parseControlMessage = (raw: string): VoiceClientControlMessage | null => {
  try {
    const parsed: unknown = JSON.parse(raw);
    const event = typeof parsed === 'object' && parsed !== null ? (parsed as { event?: unknown }).event : undefined;
    return event === 'join' || event === 'leave' || event === 'pong' ? { event } : null;
  } catch {
    return null;
  }
};

const isValidOpusPacket = (packet: Buffer): boolean => packet.length > 2 && packet.length <= VOICE_PROTOCOL.maxOpusPacketBytes + 2;

/**
 * Dedicated WebSocket gateway for voice chat at /ws/voice.
 *
 * Implements a pure binary protocol for audio data to maximize bandwidth efficiency:
 *   - Client sends binary frames of a 2-byte sequence number followed by Opus.
 *   - Server prepends 2-byte sender `sessionId` and relays as binary, without reading the rest.
 *   - JSON control frames are still used for channel setup ('join', 'joined', etc.).
 */
export class VoiceGateway {
  constructor(
    private readonly guard: AuthGuard,
    private readonly voice: VoiceManager,
    private readonly log: FastifyBaseLogger,
  ) {}

  register(app: FastifyInstance): void {
    app.route({
      method: 'GET',
      url: '/ws/voice',
      handler: (_req, reply) => {
        reply.status(400).send({ error: 'WebSocket upgrade required' });
      },
      wsHandler: (socket, req) => this.handleConnection(socket, req),
    });
  }

  private async handleConnection(connection: WebSocket, req: FastifyRequest): Promise<void> {
    const user = await this.guard.authenticateWebSocket(req);
    if (!user) {
      this.log.warn('Voice WebSocket unauthorized');
      sendControl(connection, { event: 'error', payload: 'Unauthorized' });
      connection.close();
      return;
    }
    if (connection.readyState !== connection.OPEN) return;

    const { userId } = user;
    const limiter = new RateLimiter(VOICE_PROTOCOL.rateLimitWindowMs, VOICE_PROTOCOL.maxPacketsPerSecond);
    let pingInterval: NodeJS.Timeout | undefined;
    let isInVoiceSession = false;
    let lastPongAt = Date.now();
    let lastPreJoinWarnAt = 0;

    const closeWithPolicyViolation = (reason: string) => {
      sendControl(connection, { event: 'error', payload: reason });
      connection.close(VOICE_PROTOCOL.closeCodePolicyViolation, reason);
    };

    const join = () => {
      if (isInVoiceSession) return;
      const sessionId = this.voice.joinRoom(userId, connection);
      isInVoiceSession = true;

      sendControl(connection, { event: 'session_map', payload: this.voice.sessionMap() });
      sendControl(connection, { event: 'joined' });
      this.voice.broadcastControl({ event: 'peer_joined', payload: { userId, sessionId } }, userId);

      lastPongAt = Date.now();
      pingInterval = setInterval(() => {
        if (Date.now() - lastPongAt > VOICE_PROTOCOL.heartbeatIntervalMs * 2) {
          this.log.warn({ userId }, 'Terminating silent voice peer');
          connection.terminate();
          return;
        }
        sendControl(connection, { event: 'ping' });
      }, VOICE_PROTOCOL.heartbeatIntervalMs);
    };

    const cleanup = (reason: 'leave' | 'disconnect') => {
      if (reason === 'disconnect') this.voice.untrackConnection(userId, connection);
      if (!isInVoiceSession) return;
      isInVoiceSession = false;
      clearInterval(pingInterval);

      // Only a connection that still owns the session may evict it — a superseded
      // one (reconnect race, duplicate tab) must not send a bogus peer_left.
      if (!this.voice.leaveRoom(userId, connection)) return;
      this.voice.broadcastControl({ event: 'peer_left', payload: { userId } });
      this.log.info({ userId, reason }, 'Voice session closed');
    };

    const relayAudio = (packet: Buffer) => {
      if (!isInVoiceSession) {
        const now = Date.now();
        if (now - lastPreJoinWarnAt >= VOICE_PROTOCOL.heartbeatIntervalMs) {
          lastPreJoinWarnAt = now;
          this.log.warn({ userId }, 'Ignoring pre-join audio');
        }
        return;
      }

      const sessionId = this.voice.getClientSessionId(userId);
      if (!isValidOpusPacket(packet) || !limiter.allow() || sessionId === undefined) return;

      // Frame format: [2-byte sessionId][2-byte sequence][raw Opus]
      const framed = Buffer.allocUnsafe(packet.length + 2);
      framed.writeUInt16BE(sessionId, 0);
      packet.copy(framed, 2);
      this.voice.broadcastBinary(userId, framed);
    };

    this.log.info({ userId }, 'Voice user connected');
    this.voice.trackConnection(userId, connection);

    connection.on('message', (message: RawMessage, isBinary: boolean) => {
      const buffer = toBuffer(message);
      if (isBinary) return relayAudio(buffer);

      const control = parseControlMessage(buffer.toString('utf8'));
      if (!control) return closeWithPolicyViolation('Invalid voice control message');

      switch (control.event) {
        case 'join':
          return join();
        case 'leave':
          cleanup('leave');
          return connection.close();
        case 'pong':
          lastPongAt = Date.now();
      }
    });

    connection.on('close', () => cleanup('disconnect'));
    connection.on('error', () => cleanup('disconnect'));
  }
}
