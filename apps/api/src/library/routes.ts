import { FastifyInstance } from 'fastify';
import { LibraryController } from './controller';
import { ScanLibraryRequestSchema } from '@roomies/contracts';
import { verifyJwt, requireRole } from '../auth/middleware';

export const libraryRoutes = async (app: FastifyInstance) => {
  app.addHook('preHandler', verifyJwt);

  app.get('/', LibraryController.getLibraries);

  // NOTE: Library scanning is restricted to root accounts.
  app.post('/scan', { preHandler: requireRole('root') }, async (req, reply) => {
    const parsedBody = ScanLibraryRequestSchema.safeParse(req.body);
    if (!parsedBody.success) {
      return reply.status(400).send({ error: 'Invalid request data', details: parsedBody.error.format() });
    }

    req.body = parsedBody.data;
    return LibraryController.scan(req as any, reply);
  });
};
