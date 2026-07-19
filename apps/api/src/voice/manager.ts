import { WebSocket } from "@fastify/websocket";

export interface VoiceClient {
  userId: string;
  socket: WebSocket;
  sessionId: number;
}

export class VoiceManager {
  private clients = new Map<string, VoiceClient>();
  private nextSessionId = 1;

  public joinRoom(
    userId: string,
    socket: WebSocket,
  ): number {
    const sessionId = this.nextSessionId++;
    // Keep it within 16-bit unsigned range (1 - 65535)
    if (this.nextSessionId > 65535) this.nextSessionId = 1;

    const client: VoiceClient = { userId, socket, sessionId };
    this.clients.set(userId, client);
    console.log("[voice] client joined room", {
      userId,
      sessionId,
      totalClients: this.clients.size,
    });

    return sessionId;
  }

  public leaveRoom(userId: string) {
    const removed = this.clients.delete(userId);
    if (removed) {
      console.log("[voice] client left room", {
        userId,
        totalClients: this.clients.size,
      });
    }
  }

  public getRoomClients(): IterableIterator<VoiceClient> {
    return this.clients.values();
  }

  public getClientSessionId(userId: string): number | undefined {
    return this.clients.get(userId)?.sessionId;
  }

  public broadcastBinary(senderId: string, packet: Buffer) {
    for (const [userId, client] of this.clients.entries()) {
      if (userId !== senderId && client.socket.readyState === 1 /* OPEN */) {
        client.socket.send(packet);
      }
    }
  }
}

export const voiceManager = new VoiceManager();
