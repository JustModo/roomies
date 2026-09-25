import { FastifyError, FastifyReply, FastifyRequest } from 'fastify';

export class HttpError extends Error {
  constructor(
    readonly statusCode: number,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }
}

export class BadRequestError extends HttpError {
  constructor(message = 'Invalid input', details?: unknown) {
    super(400, message, details);
  }
}

export class UnauthorizedError extends HttpError {
  constructor(message = 'Unauthorized') {
    super(401, message);
  }
}

export class ForbiddenError extends HttpError {
  constructor(message = 'Forbidden') {
    super(403, message);
  }
}

export class NotFoundError extends HttpError {
  constructor(message = 'Not found') {
    super(404, message);
  }
}

export class ConflictError extends HttpError {
  constructor(message: string) {
    super(409, message);
  }
}

/** Single place mapping thrown errors to HTTP responses; anything unexpected is logged and hidden as a 500. */
export function errorHandler(err: FastifyError | HttpError, req: FastifyRequest, reply: FastifyReply) {
  const status = err.statusCode ?? 500;

  if (status >= 500) {
    req.log.error({ err }, `${req.method} ${req.url} failed`);
    return reply.status(status).send({ error: 'Internal Server Error' });
  }

  const details = err instanceof HttpError ? err.details : undefined;
  return reply.status(status).send(details === undefined ? { error: err.message } : { error: err.message, details });
}
