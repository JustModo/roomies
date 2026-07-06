import { FastifyInstance } from 'fastify';
import { WebSocket } from '@fastify/websocket';
import { OutgoingSocketMessage } from '@roomies/contracts';

export const SocketEmitter = {
  /**
   * Broadcasts a strictly-typed message to all users in the room.
   */
  broadcastToRoom(app: FastifyInstance, message: OutgoingSocketMessage) {
    const room = app.room;
    if (!room) return;

    const serialized = JSON.stringify(message);
    for (const socket of room) {
      if (socket.readyState === 1 /* WebSocket.OPEN */) {
        socket.send(serialized);
      }
    }
  },

  /**
   * Sends a typed message to a specific client.
   */
  sendToClient(socket: WebSocket, message: OutgoingSocketMessage) {
    if (socket.readyState === 1 /* WebSocket.OPEN */) {
      socket.send(JSON.stringify(message));
    }
  }
};
