export interface SocketSession {
  userId: string;
  socketId: string;
  connectedAt: Date;
}

// NOTE: In-memory replacement for the old Redis OM socketSession schema. Kept for future presence work.
const sessionsBySocketId = new Map<string, SocketSession>();

export const socketSessionStore = {
  add(session: SocketSession): void {
    sessionsBySocketId.set(session.socketId, session);
  },

  remove(socketId: string): void {
    sessionsBySocketId.delete(socketId);
  },
};

import { registerSocketEvent, SocketContext } from './router';

export const registerStoreSocketEvents = () => {
  registerSocketEvent('system.connect', (_payload: unknown, ctx: SocketContext) => {
    socketSessionStore.add({
      userId: ctx.userId,
      socketId: ctx.socketId,
      connectedAt: new Date(),
    });
  });
};
