
import { WebSocket } from '@fastify/websocket';

declare module 'fastify' {
  interface FastifyInstance {
    room: Set<WebSocket>;
    /** Separate registry for voice-chat WebSocket connections. */
    voiceRoom: Set<any>;
  }
}
