import { createApp } from './app';
import { PORT } from '@roomies/config';

export { createApp } from './app';
export { createAppContext } from './context';
export type { CreateAppOptions } from './app';
export type { AppContext, AppContextOptions } from './context';

const start = async () => {
  try {
    const app = await createApp();
    const port = (app as any).ctx?.config?.PORT || PORT;

    await app.listen({ port, host: '0.0.0.0' });

    console.log(`[system] Server listening at http://localhost:${port}`);

    const shutdown = async (signal: string) => {
      console.log(`[system] Received ${signal}, starting graceful shutdown...`);
      await app.close();
      process.exit(0);
    };

    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
  } catch (err) {
    console.error('[system] Server failed to start:', err);
    process.exit(1);
  }
};

if (process.argv[1] && (process.argv[1].endsWith('index.ts') || process.argv[1].endsWith('index.js'))) {
  start();
}
