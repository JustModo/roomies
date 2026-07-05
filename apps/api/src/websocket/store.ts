export interface SocketSession {
  userId: string;
  socketId: string;
  connectedAt: Date;
}

// Single-node, in-memory replacement for the old Redis OM socketSession
// schema. Kept for parity with future presence work; nothing currently reads
// this besides the gateway's own add/remove-on-disconnect.
const sessionsBySocketId = new Map<string, SocketSession>();

export const socketSessionStore = {
  add(session: SocketSession): void {
    sessionsBySocketId.set(session.socketId, session);
  },

  remove(socketId: string): void {
    sessionsBySocketId.delete(socketId);
  },
};
