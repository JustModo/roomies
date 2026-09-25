type LogFn = {
  (msg: string): void;
  (obj: object, msg: string): void;
};

/** Minimal structured logger the server packages log through; Fastify's pino logger satisfies it. */
export interface Logger {
  info: LogFn;
  warn: LogFn;
  error: LogFn;
}
