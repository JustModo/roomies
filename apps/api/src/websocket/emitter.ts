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
  }
};
