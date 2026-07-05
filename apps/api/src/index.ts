import fastify from 'fastify';
import { bootstrap } from './bootstrap';

const start = async () => {
  const app = fastify({
    logger: {
      level: process.env.LOG_LEVEL || 'info',
    },
  });

  try {
    await bootstrap(app);
    
    const port = parseInt(process.env.PORT || '3000', 10);
    await app.listen({ port, host: '0.0.0.0' });
    
    app.log.info(`Server listening at http://localhost:${port}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

start();
