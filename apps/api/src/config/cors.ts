import { CORS_ORIGIN } from '@roomies/config';
import { FastifyCorsOptions } from '@fastify/cors';

export function getCorsOptions(): FastifyCorsOptions {
  // NOTE: The web app and API share one origin behind Caddy, so the auth cookies never need credentialed CORS.
  return {
    origin: CORS_ORIGIN,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    credentials: false,
  };
}
