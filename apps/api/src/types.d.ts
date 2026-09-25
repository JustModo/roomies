import { JWTPayload } from '@roomies/contracts';

declare module 'fastify' {
  interface FastifyRequest {
    user?: JWTPayload;
  }
}
