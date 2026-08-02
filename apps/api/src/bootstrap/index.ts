import { FastifyInstance } from 'fastify';
import { createApp, CreateAppOptions, BootstrapOptions } from '../app';

export type { BootstrapOptions };

/** Legacy wrapper around createApp factory for backward compatibility. */
export const bootstrap = async (_app?: FastifyInstance, options: CreateAppOptions = {}): Promise<FastifyInstance> => {
  return createApp(options);
};
