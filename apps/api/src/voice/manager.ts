import { WebSocket } from "@fastify/websocket";

export interface VoiceClient {
  userId: string;
  socket: WebSocket;
  sessionId: number;
}

export class VoiceManager {
  private clients = new Map<string, VoiceClient>();
  private nextSessionId = 1;

  /**
   * Registers a new connection for userId, evicting any previous connection
   * still registered for the same user (e.g. a stale/duplicate-tab socket)
   * so there is only ever one live owner of a userId's session at a time.
   */
  public joinRoom(
    userId: string,
    socket: WebSocket,
  ): number {
    const existing = this.clients.get(userId);
    if (existing && existing.socket !== socket) {
      if (existing.socket.readyState === 1 /* OPEN */) {
        existing.socket.send(
          JSON.stringify({ event: "error", payload: "Session replaced by a new connection" }),
        );
      }
      existing.socket.close();
    }

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

  /**
   * Removes userId's session, but only if `socket` is the connection that
   * currently owns it. Returns true if a removal actually happened, so
   * callers can avoid broadcasting `peer_left` for a stale connection that
   * has already been superseded by a newer one for the same userId.
   */
  public leaveRoom(userId: string, socket: WebSocket): boolean {
    const existing = this.clients.get(userId);
    if (!existing || existing.socket !== socket) return false;

    this.clients.delete(userId);
    console.log("[voice] client left room", {
      userId,
      totalClients: this.clients.size,
    });
    return true;
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
