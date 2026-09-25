import { WebSocket } from '@fastify/websocket';
import { FastifyBaseLogger } from 'fastify';
import { VoiceServerControlMessage } from './config';

export interface VoiceClient {
  userId: string;
  socket: WebSocket;
  sessionId: number;
}

/** Tracks voice sockets and the joined voice room, keyed by userId. */
export class VoiceManager {
  private clients = new Map<string, VoiceClient>();
  private connections = new Map<string, Set<WebSocket>>();
  private nextSessionId = 1;

  constructor(private readonly log: FastifyBaseLogger) {}

  /**
   * Registers a new connection for userId, evicting any previous connection
   * still registered for the same user (e.g. a stale/duplicate-tab socket)
   * so there is only ever one live owner of a userId's session at a time.
   */
  joinRoom(userId: string, socket: WebSocket): number {
    const existing = this.clients.get(userId);
    if (existing && existing.socket !== socket) {
      sendControl(existing.socket, { event: 'error', payload: 'Session replaced by a new connection' });
      existing.socket.close();
    }

    const inUse = new Set([...this.clients.values()].filter((c) => c.userId !== userId).map((c) => c.sessionId));
    while (inUse.has(this.nextSessionId)) this.advanceSessionId();
    const sessionId = this.nextSessionId;
    this.advanceSessionId();

    this.clients.set(userId, { userId, socket, sessionId });
    this.log.info({ userId, sessionId, totalClients: this.clients.size }, 'Client joined voice room');
    return sessionId;
  }

  /**
   * Removes userId's session, but only if `socket` is the connection that
   * currently owns it. Returns true if a removal actually happened, so
   * callers can avoid broadcasting `peer_left` for a stale connection that
   * has already been superseded by a newer one for the same userId.
   */
  leaveRoom(userId: string, socket: WebSocket): boolean {
    const existing = this.clients.get(userId);
    if (!existing || existing.socket !== socket) return false;

    this.clients.delete(userId);
    this.log.info({ userId, totalClients: this.clients.size }, 'Client left voice room');
    return true;
  }

  trackConnection(userId: string, socket: WebSocket): void {
    const sockets = this.connections.get(userId) ?? new Set<WebSocket>();
    sockets.add(socket);
    this.connections.set(userId, sockets);
  }

  untrackConnection(userId: string, socket: WebSocket): void {
    const sockets = this.connections.get(userId);
    if (!sockets) return;
    sockets.delete(socket);
    if (sockets.size === 0) this.connections.delete(userId);
  }

  kickUser(userId: string): void {
    for (const socket of this.connections.get(userId) ?? []) {
      sendControl(socket, { event: 'error', payload: 'Unauthorized' });
      socket.close();
    }
  }

  getClientSessionId(userId: string): number | undefined {
    return this.clients.get(userId)?.sessionId;
  }

  sessionMap(): Record<string, number> {
    return Object.fromEntries([...this.clients.values()].map((c) => [c.userId, c.sessionId]));
  }

  broadcastControl(message: VoiceServerControlMessage, exceptUserId?: string): void {
    for (const client of this.clients.values()) {
      if (client.userId !== exceptUserId) sendControl(client.socket, message);
    }
  }

  broadcastBinary(senderId: string, packet: Buffer): void {
    for (const client of this.clients.values()) {
      if (client.userId !== senderId && client.socket.readyState === client.socket.OPEN) client.socket.send(packet);
    }
  }

  // Keep it within 16-bit unsigned range (1 - 65535)
  private advanceSessionId(): void {
    this.nextSessionId = this.nextSessionId >= 65535 ? 1 : this.nextSessionId + 1;
  }
}

export const sendControl = (socket: WebSocket, message: VoiceServerControlMessage): void => {
  if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(message));
};
