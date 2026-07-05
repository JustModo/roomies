import { FastifyInstance } from 'fastify';
import { LibraryController } from './controller';
import { ScanLibraryRequestSchema } from '@roomies/contracts';
import { verifyJwt, requireRole } from '../auth/middleware';

export const libraryRoutes = async (app: FastifyInstance) => {
  // Protect library routes
  app.addHook('preHandler', verifyJwt);

  app.get('/', LibraryController.getLibraries);

  // Root-only: scanning walks the host filesystem, so it must not be
  // reachable by guest accounts.
  app.post('/scan', { preHandler: requireRole('root') }, async (req, reply) => {
    const parsedBody = ScanLibraryRequestSchema.safeParse(req.body);
    if (!parsedBody.success) {
      return reply.status(400).send({ error: 'Invalid request data', details: parsedBody.error.format() });
    }

    req.body = parsedBody.data;
    return LibraryController.scan(req as any, reply);
  });
};
