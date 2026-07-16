import { CORS_ORIGIN } from '@roomies/config';
import { FastifyCorsOptions } from '@fastify/cors';

export function getCorsOptions(): FastifyCorsOptions {
  // NOTE: JWT authorization uses headers, so credentialed CORS is not required.
  const allowedOrigins = CORS_ORIGIN.split(',').map((origin) => origin.trim()).filter(Boolean);

  return {
    origin: allowedOrigins,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    credentials: false,
  };
}
