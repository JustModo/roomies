import fastify from 'fastify';
import { bootstrap } from './bootstrap';
import { PORT } from '@roomies/config';

const start = async () => {
  const app = fastify({
    logger: false,
  });

  try {
    await bootstrap(app);
    
    await app.listen({ port: PORT, host: '0.0.0.0' });
    
    console.log(`[system] Server listening at http://localhost:${PORT}`);

    const shutdown = async (signal: string) => {
      console.log(`[system] Received ${signal}, starting graceful shutdown...`);
      await app.close();
      process.exit(0);
    };

    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  } catch (err) {
    console.error('[system] Server failed to start:', err);
    process.exit(1);
  }
};

start();
