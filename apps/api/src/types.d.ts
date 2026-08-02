import { RoomSocket } from './websocket/router';
import { WebSocket } from '@fastify/websocket';
import { JWTPayload } from '@roomies/contracts';

declare module 'fastify' {
  interface FastifyInstance {
    room: Set<RoomSocket>;
    voiceRoom: Set<WebSocket>;
  }

  interface FastifyRequest {
    user?: JWTPayload;
  }
}
