import { FastifyInstance } from 'fastify';
import { authenticateWebSocket } from '../auth';
import { voiceManager } from './manager';

/**
 * Dedicated WebSocket gateway for voice chat at /ws/voice.
 *
 * Implements a pure binary protocol for audio data to maximize bandwidth efficiency:
 *   - Client sends raw binary Opus frames.
 *   - Server prepends 2-byte sender `sessionId` and relays as binary.
 *   - JSON control frames are still used for channel setup ('join', 'joined', etc.).
 */
export const setupVoiceGateway = (app: FastifyInstance) => {
  app.route({
    method: 'GET',
    url: '/ws/voice',
    handler: (_req, reply) => {
      reply.status(400).send({ error: 'WebSocket upgrade required' });
    },
    wsHandler: async (connection, req) => {
      const userPayload = authenticateWebSocket(req);

      if (!userPayload) {
        console.warn('[Voice][Server] WebSocket unauthorized');
        connection.send(JSON.stringify({ event: 'error', payload: 'Unauthorized' }));
        connection.close();
        return;
      }

      const { userId } = userPayload;
      let pingInterval: NodeJS.Timeout | null = null;
      let isInVoiceSession = false;

      console.log(`[Voice][Server] user connected: ${userId}`);

      const cleanup = (reason: 'leave' | 'disconnect') => {
        if (!isInVoiceSession) return;
        isInVoiceSession = false;

        if (pingInterval) {
          clearInterval(pingInterval);
          pingInterval = null;
        }

        voiceManager.leaveRoom(userId);

        // Notify other clients about the user leaving
        for (const client of voiceManager.getRoomClients()) {
          client.socket.send(
            JSON.stringify({
              event: 'peer_left',
              payload: { userId },
            })
          );
        }
        console.log(`[Voice][Server] session closed for ${userId} (reason: ${reason})`);
      };

      connection.on('message', (message: Buffer | string) => {
        // Control channel messages are JSON strings
        const rawText = typeof message === 'string' ? message : message.toString('utf8');

        if (rawText.startsWith('{')) {
          try {
            const parsed = JSON.parse(rawText);

            if (parsed.event === 'join') {
              if (isInVoiceSession) return;

              const sessionId = voiceManager.joinRoom(userId, connection);
              isInVoiceSession = true;

              // Send the current session map of all active room members to the joining client
              const map: Record<string, number> = {};
              for (const client of voiceManager.getRoomClients()) {
                map[client.userId] = client.sessionId;
              }
              connection.send(JSON.stringify({ event: 'session_map', payload: map }));

              // Acknowledge join
              connection.send(JSON.stringify({ event: 'joined' }));

              // Broadcast the new peer join to all other room members
              for (const client of voiceManager.getRoomClients()) {
                if (client.userId !== userId) {
                  client.socket.send(
                    JSON.stringify({
                      event: 'peer_joined',
                      payload: { userId, sessionId },
                    })
                  );
                }
              }

              // Heartbeat check to prevent timeout
              pingInterval = setInterval(() => {
                if (isInVoiceSession && connection.readyState === 1) {
                  connection.send(JSON.stringify({ event: 'ping' }));
                }
              }, 5000);
              return;
            }

            if (parsed.event === 'leave') {
              cleanup('leave');
              connection.close();
              return;
            }

            if (parsed.event === 'pong') {
              return; // Ping ack, ignore
            }
          } catch (e) {
            console.warn('[Voice][Server] failed to parse control frame:', e);
          }
          return;
        }

        // Audio channel is raw binary
        if (Buffer.isBuffer(message)) {
          if (!isInVoiceSession) return;

          const sessionId = voiceManager.getClientSessionId(userId);
          if (sessionId === undefined) return;

          // Frame format: [ 2 bytes: sessionId (big-endian) ] [ raw Opus payload ]
          const framedMessage = Buffer.allocUnsafe(message.length + 2);
          framedMessage.writeUInt16BE(sessionId, 0);
          message.copy(framedMessage, 2);

          // Relay binary message
          voiceManager.broadcastBinary(userId, framedMessage);
        }
      });

      connection.on('close', () => cleanup('disconnect'));
      connection.on('error', () => cleanup('disconnect'));
    },
  });
};
