import { FastifyInstance } from "fastify";
import { authenticateWebSocket } from "../auth";
import { voiceManager } from "./manager";
import { VOICE_PROTOCOL, VoiceServerControlMessage } from "./config";
import {
  VoicePacketRateLimiter,
  isValidOpusPacket,
  parseVoiceClientControlMessage,
} from "./protocol";

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
    method: "GET",
    url: "/ws/voice",
    handler: (_req, reply) => {
      reply.status(400).send({ error: "WebSocket upgrade required" });
    },
    wsHandler: async (connection, req) => {
      const userPayload = authenticateWebSocket(req);

      if (!userPayload) {
        console.warn("[Voice][Server] WebSocket unauthorized");
        connection.send(
          JSON.stringify({ event: "error", payload: "Unauthorized" }),
        );
        connection.close();
        return;
      }

      const { userId } = userPayload;
      let pingInterval: NodeJS.Timeout | null = null;
      let isInVoiceSession = false;
      const rateLimiter = new VoicePacketRateLimiter();

      const sendControl = (message: VoiceServerControlMessage) => {
        if (connection.readyState === 1) {
          connection.send(JSON.stringify(message));
        }
      };

      const closeWithPolicyViolation = (payload: string) => {
        sendControl({ event: "error", payload });
        connection.close(VOICE_PROTOCOL.closeCodePolicyViolation, payload);
      };

      console.log(`[Voice][Server] user connected: ${userId}`);

      const cleanup = (reason: "leave" | "disconnect") => {
        if (!isInVoiceSession) return;
        isInVoiceSession = false;

        if (pingInterval) {
          clearInterval(pingInterval);
          pingInterval = null;
        }

        voiceManager.leaveRoom(userId);

        // Notify other clients about the user leaving
        for (const client of voiceManager.getRoomClients()) {
          if (client.socket.readyState === 1) {
            client.socket.send(
              JSON.stringify({
                event: "peer_left",
                payload: { userId },
              } satisfies VoiceServerControlMessage),
            );
          }
        }
        console.log(
          `[Voice][Server] session closed for ${userId} (reason: ${reason})`,
        );
      };

      connection.on(
        "message",
        (message: Buffer | ArrayBuffer | Buffer[], isBinary: boolean) => {
          //
          // Control messages (JSON)
          //
          if (!isBinary) {
            let rawText: string;

            if (typeof message === "string") {
              rawText = message;
            } else if (Buffer.isBuffer(message)) {
              rawText = message.toString("utf8");
            } else if (message instanceof ArrayBuffer) {
              rawText = Buffer.from(message).toString("utf8");
            } else if (Array.isArray(message)) {
              rawText = Buffer.concat(message).toString("utf8");
            } else {
              closeWithPolicyViolation("Unsupported voice control frame");
              return;
            }

            const parsed = parseVoiceClientControlMessage(rawText);

            if (!parsed) {
              closeWithPolicyViolation("Invalid voice control message");
              return;
            }

            switch (parsed.event) {
              case "join": {
                if (isInVoiceSession) return;

                const sessionId = voiceManager.joinRoom(userId, connection);
                isInVoiceSession = true;

                console.log(`[Voice][Server] client joined room: ${userId}`);

                const map: Record<string, number> = {};
                for (const client of voiceManager.getRoomClients()) {
                  map[client.userId] = client.sessionId;
                }

                sendControl({
                  event: "session_map",
                  payload: map,
                });

                sendControl({
                  event: "joined",
                });

                for (const client of voiceManager.getRoomClients()) {
                  if (
                    client.userId !== userId &&
                    client.socket.readyState === 1
                  ) {
                    client.socket.send(
                      JSON.stringify({
                        event: "peer_joined",
                        payload: {
                          userId,
                          sessionId,
                        },
                      } satisfies VoiceServerControlMessage),
                    );
                  }
                }

                pingInterval = setInterval(() => {
                  if (isInVoiceSession) {
                    sendControl({ event: "ping" });
                  }
                }, VOICE_PROTOCOL.heartbeatIntervalMs);

                return;
              }

              case "leave": {
                cleanup("leave");
                connection.close();
                return;
              }

              case "pong":
                // Optional heartbeat handling.
                return;

              default:
                return;
            }
          }

          //
          // Binary audio packets
          //
          const packet = Buffer.isBuffer(message)
            ? message
            : message instanceof ArrayBuffer
              ? Buffer.from(message)
              : Array.isArray(message)
                ? Buffer.concat(message)
                : null;

          if (!packet) {
            closeWithPolicyViolation("Unsupported binary frame");
            return;
          }

          if (!isInVoiceSession) {
            console.warn(
              `[Voice][Server] ignoring pre-join audio from ${userId}`,
            );
            return;
          }

          if (!isValidOpusPacket(packet)) {
            closeWithPolicyViolation("Invalid voice packet size");
            return;
          }

          if (!rateLimiter.allow()) {
            closeWithPolicyViolation("Voice packet rate limit exceeded");
            return;
          }

          const sessionId = voiceManager.getClientSessionId(userId);

          if (sessionId === undefined) {
            return;
          }

          // Frame format:
          // [2-byte sessionId][raw Opus]
          const framedMessage = Buffer.allocUnsafe(packet.length + 2);
          framedMessage.writeUInt16BE(sessionId, 0);
          packet.copy(framedMessage, 2);

          voiceManager.broadcastBinary(userId, framedMessage);
        },
      );

      connection.on("close", () => cleanup("disconnect"));
      connection.on("error", () => cleanup("disconnect"));
    },
  });
};
