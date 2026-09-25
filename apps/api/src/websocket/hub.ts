import { WebSocket } from '@fastify/websocket';
import { OutgoingSocketMessage } from '@roomies/contracts';
import { VoiceManager } from '../voice/manager';
import { RoomSocket } from './router';

export type KickReason = Extract<OutgoingSocketMessage, { event: 'auth.kicked' }>['payload']['reason'];

/** Registry of connected room sockets and the only way messages reach them. */
export class SocketHub {
  private sockets = new Set<RoomSocket>();

  constructor(private readonly voice: VoiceManager) {}

  get size(): number {
    return this.sockets.size;
  }

  add(socket: RoomSocket): void {
    this.sockets.add(socket);
  }

  remove(socket: RoomSocket): void {
    this.sockets.delete(socket);
  }

  broadcast(message: OutgoingSocketMessage): void {
    const serialized = JSON.stringify(message);
    for (const socket of this.sockets) {
      if (socket.readyState === socket.OPEN) socket.send(serialized);
    }
  }

  sendTo(socket: WebSocket, message: OutgoingSocketMessage): void {
    if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(message));
  }

  sendToUser(userId: string, message: OutgoingSocketMessage): void {
    for (const socket of this.userSockets(userId)) this.sendTo(socket, message);
  }

  /** Force-closes every room and voice socket of a user, e.g. after a new login elsewhere or account deletion. */
  kickUser(userId: string, reason: KickReason = 'logged_in_elsewhere'): void {
    for (const socket of this.userSockets(userId)) {
      this.sendTo(socket, { event: 'auth.kicked', payload: { reason } });
      socket.close();
    }
    this.voice.kickUser(userId);
  }

  private userSockets(userId: string): RoomSocket[] {
    return [...this.sockets].filter((socket) => socket.userId === userId);
  }
}
