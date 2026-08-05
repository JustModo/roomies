import { FastifyInstance } from 'fastify';
import { LibraryController } from './controller';
import { ScanLibraryRequestSchema } from '@roomies/contracts';
import { verifyJwt, requireRole } from '../auth/middleware';

export const libraryRoutes = async (app: FastifyInstance) => {
  app.addHook('preHandler', verifyJwt);

  app.get('/', LibraryController.getLibraries);
  app.get('/subtitles/:subtitleId', LibraryController.getSubtitle);

  // NOTE: Manual subtitle uploads are restricted to root accounts, same as library scanning.
  app.post('/media/:mediaFileId/subtitles', { preHandler: requireRole('root') }, async (req, reply) => {
    return LibraryController.uploadSubtitle(req as any, reply);
  });

  app.delete('/subtitles/:subtitleId', { preHandler: requireRole('root') }, async (req, reply) => {
    return LibraryController.deleteSubtitle(req as any, reply);
  });

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
