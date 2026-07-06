import fastify from 'fastify';
import { bootstrap } from './bootstrap';

const start = async () => {
  const app = fastify({
    logger: false,
  });

  try {
    await bootstrap(app);
    
    const port = parseInt(process.env.PORT || '3000', 10);
    await app.listen({ port, host: '0.0.0.0' });
    
    console.log(`Server listening at http://localhost:${port}`);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
};

start();
