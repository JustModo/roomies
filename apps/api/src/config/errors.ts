import { FastifyError, FastifyReply, FastifyRequest } from 'fastify';

export function errorHandler(err: FastifyError, req: FastifyRequest, reply: FastifyReply) {
  const status = err.statusCode ?? 500;

  // NOTE: Fastify's own logger is disabled, so without this an unhandled error
  // leaves no server-side trace at all.
  if (status >= 500) {
    console.error(`[api] ${req.method} ${req.url} failed:`, err);
    return reply.status(status).send({ error: 'Internal Server Error' });
  }

  return reply.status(status).send({ error: err.message });
}
