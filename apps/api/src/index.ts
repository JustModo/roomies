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
  } catch (err) {
    console.error('[system] Server failed to start:', err);
    process.exit(1);
  }
};

start();
