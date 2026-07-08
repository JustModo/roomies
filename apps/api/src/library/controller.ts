import fs from 'fs';
import path from 'path';
import { FastifyReply, FastifyRequest } from 'fastify';
import { LibraryService } from '@roomies/library';
import { MEDIA_ROOT } from '@roomies/config';
import { ScanLibraryRequest } from '@roomies/contracts';
import { prisma } from '../database/sqlite';

const MIME_TYPES: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
};

export const LibraryController = {
  async getLibraries(req: FastifyRequest, reply: FastifyReply) {
    try {
      const libraries = await LibraryService.getLibraries(prisma);
      return reply.send(libraries);
    } catch (e) {
      return reply.status(500).send({ error: 'Internal Server Error' });
    }
  },

  async scan(req: FastifyRequest<{ Body: ScanLibraryRequest }>, reply: FastifyReply) {
    try {
      const updatedLibrary = await LibraryService.scanLibrary(prisma);
      return reply.send(updatedLibrary);
    } catch (e) {
      req.log.error(e, 'Failed to scan library');
      return reply.status(500).send({ error: 'Failed to scan library' });
    }
  },

  async getCover(req: FastifyRequest<{ Params: { titleId: string } }>, reply: FastifyReply) {
    const title = await prisma.title.findUnique({ where: { id: req.params.titleId } });
    if (!title || !title.coverPath) {
      return reply.status(404).send({ error: 'Cover not found' });
    }

    const resolved = path.resolve(title.coverPath);
    if (resolved !== MEDIA_ROOT && !resolved.startsWith(MEDIA_ROOT + path.sep)) {
      return reply.status(404).send({ error: 'Cover not found' });
    }

    const ext = path.extname(resolved).toLowerCase();
    const mimeType = MIME_TYPES[ext];
    if (!mimeType) {
      return reply.status(404).send({ error: 'Cover not found' });
    }

    try {
      const stream = fs.createReadStream(resolved);
      reply.type(mimeType);
      return reply.send(stream);
    } catch (e) {
      return reply.status(404).send({ error: 'Cover not found' });
    }
  },
};
