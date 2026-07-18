
import { WebSocket } from '@fastify/websocket';

declare module 'fastify' {
  interface FastifyInstance {
    room: Set<WebSocket>;
  }
}
