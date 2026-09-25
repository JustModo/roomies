import { WebSocket } from "@fastify/websocket";

export interface VoiceClient {
  userId: string;
  socket: WebSocket;
  sessionId: number;
}

export class VoiceManager {
  private clients = new Map<string, VoiceClient>();
  private connections = new Map<string, Set<WebSocket>>();
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

    const inUse = new Set<number>();
    for (const client of this.clients.values()) {
      if (client.userId !== userId) inUse.add(client.sessionId);
    }
    while (inUse.has(this.nextSessionId)) this.advanceSessionId();
    const sessionId = this.nextSessionId;
    this.advanceSessionId();

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

  public trackConnection(userId: string, socket: WebSocket) {
    const sockets = this.connections.get(userId) ?? new Set<WebSocket>();
    sockets.add(socket);
    this.connections.set(userId, sockets);
  }

  public untrackConnection(userId: string, socket: WebSocket) {
    const sockets = this.connections.get(userId);
    if (!sockets) return;
    sockets.delete(socket);
    if (sockets.size === 0) this.connections.delete(userId);
  }

  public kickUser(userId: string) {
    for (const socket of this.connections.get(userId) ?? []) {
      if (socket.readyState === 1 /* OPEN */) {
        socket.send(JSON.stringify({ event: "error", payload: "Unauthorized" }));
      }
      socket.close();
    }
  }

  // Keep it within 16-bit unsigned range (1 - 65535)
  private advanceSessionId() {
    this.nextSessionId = this.nextSessionId >= 65535 ? 1 : this.nextSessionId + 1;
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
