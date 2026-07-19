import { FastifyInstance } from 'fastify';
import { WebSocket } from '@fastify/websocket';
import { OutgoingSocketMessage } from '@roomies/contracts';

export const SocketEmitter = {
  broadcastToRoom(app: FastifyInstance, message: OutgoingSocketMessage) {
    const room = app.room;
    if (!room) return;

    const serialized = JSON.stringify(message);
    for (const socket of room) {
      if (socket.readyState === 1) {
        socket.send(serialized);
      }
    }
  },

  sendToClient(socket: WebSocket, message: OutgoingSocketMessage) {
    if (socket.readyState === 1) {
      socket.send(JSON.stringify(message));
    }
  },

  sendToUser(app: FastifyInstance, userId: string, message: OutgoingSocketMessage) {
    const room = app.room;
    if (!room) return;
    
    const serialized = JSON.stringify(message);
    for (const socket of room) {
      if ((socket as any).userId === userId && socket.readyState === 1) {
        socket.send(serialized);
      }
    }
  },

  /**
   * Broadcast to all sockets in the voice room except the sender.
   * Used by the voice gateway to relay encoded audio chunks.
   */
  broadcastToVoiceRoomExcept(app: FastifyInstance, excludeSocketId: string, message: OutgoingSocketMessage) {
    const voiceRoom: Set<any> = (app as any).voiceRoom;
    if (!voiceRoom) return;

    const serialized = JSON.stringify(message);
    for (const socket of voiceRoom) {
      if (socket.socketId !== excludeSocketId && socket.readyState === 1) {
        socket.send(serialized);
      }
    }
  },
};
