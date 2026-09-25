import { loadConfig } from '@roomies/config';
import { createApp } from './app';

const start = async () => {
  const config = loadConfig();
  const app = await createApp({ config });
  await app.listen({ port: config.PORT, host: '0.0.0.0' });

  const shutdown = async (signal: string) => {
    app.log.info(`Received ${signal}, starting graceful shutdown`);
    await app.close();
    process.exit(0);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
};

start().catch((err) => {
  // eslint-disable-next-line no-console -- the app logger may not exist if startup failed
  console.error('Server failed to start:', err);
  process.exit(1);
});
