import { RoomSocket } from './websocket/router';
import { JWTPayload } from '@roomies/contracts';

declare module 'fastify' {
  interface FastifyInstance {
    room: Set<RoomSocket>;
  }

  interface FastifyRequest {
    user?: JWTPayload;
  }
}
