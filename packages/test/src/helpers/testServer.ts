import { FastifyInstance } from 'fastify';
import { createApp, CreateAppOptions } from '@roomies/server';

export interface TestServerContext {
  app: FastifyInstance;
  port: number;
  baseUrl: string;
  wsUrl: string;
  close: () => Promise<void>;
}

export async function createTestServer(options?: CreateAppOptions): Promise<TestServerContext> {
  const app = await createApp({
    skipLibraryScan: true,
    skipHardwareDetection: true,
    skipTranscodeClean: true,
    ...options,
  });

  const address = await app.listen({ port: 0, host: '127.0.0.1' });
  const urlObj = new URL(address);
  const port = parseInt(urlObj.port, 10);

  const baseUrl = `http://127.0.0.1:${port}`;
  const wsUrl = `ws://127.0.0.1:${port}`;

  const close = async () => {
    await app.close();
  };

  return { app, port, baseUrl, wsUrl, close };
}
