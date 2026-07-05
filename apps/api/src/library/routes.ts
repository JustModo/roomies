import { FastifyInstance } from 'fastify';
import { LibraryController } from './controller';
import { ScanLibraryRequestSchema } from '@roomies/contracts';
import { verifyJwt } from '../common/authMiddleware';

export const libraryRoutes = async (app: FastifyInstance) => {
  // Protect library routes
  app.addHook('preHandler', verifyJwt);

  app.get('/', LibraryController.getLibraries);

  app.post('/scan', async (req, reply) => {
    const parsedBody = ScanLibraryRequestSchema.safeParse(req.body);
    if (!parsedBody.success) {
      return reply.status(400).send({ error: 'Invalid request data', details: parsedBody.error.format() });
    }
    
    req.body = parsedBody.data;
    return LibraryController.scan(req as any, reply);
  });
};
