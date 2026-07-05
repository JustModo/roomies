import { FastifyReply, FastifyRequest } from 'fastify';
import { LibraryService } from './service';
import { ScanLibraryRequest } from '@roomies/contracts';

export const LibraryController = {
  async getLibraries(req: FastifyRequest, reply: FastifyReply) {
    try {
      const libraries = await LibraryService.getLibraries();
      return reply.send(libraries);
    } catch (e) {
      return reply.status(500).send({ error: 'Internal Server Error' });
    }
  },

  async scan(req: FastifyRequest<{ Body: ScanLibraryRequest }>, reply: FastifyReply) {
    try {
      const { name, path } = req.body;
      const updatedLibrary = await LibraryService.scanLibrary(name, path);
      return reply.send(updatedLibrary);
    } catch (e) {
      req.log.error(e, 'Failed to scan library');
      return reply.status(500).send({ error: 'Failed to scan library' });
    }
  }
};
