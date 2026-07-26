import fs from 'fs';
import path from 'path';
import { FastifyReply, FastifyRequest } from 'fastify';
import { LibraryService, convertSubtitleToVtt } from '@roomies/library';
import { MEDIA_ROOT } from '@roomies/config';
import { ScanLibraryRequest } from '@roomies/contracts';
import { prisma } from '../database/sqlite';



const SUBTITLE_EXTENSIONS = ['.srt', '.vtt'];

function decodeSubtitleBuffer(buffer: Buffer): string {
  // UTF-8 BOM
  if (buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
    return buffer.subarray(3).toString('utf-8');
  }
  // UTF-16 LE BOM
  if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) {
    return buffer.subarray(2).toString('utf16le');
  }
  // UTF-16 BE BOM
  if (buffer.length >= 2 && buffer[0] === 0xfe && buffer[1] === 0xff) {
    const swapped = Buffer.allocUnsafe(buffer.length - 2);
    for (let i = 2; i < buffer.length - 1; i += 2) {
      swapped[i - 2] = buffer[i + 1];
      swapped[i - 1] = buffer[i];
    }
    return swapped.toString('utf16le');
  }

  // Try UTF-8 first
  const utf8Text = buffer.toString('utf-8');
  // Fallback to latin1 if invalid UTF-8 replacement chars are found
  if (utf8Text.includes('\uFFFD')) {
    return buffer.toString('latin1');
  }
  return utf8Text;
}

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

  async getSubtitle(req: FastifyRequest<{ Params: { subtitleId: string }; Querystring: { offset?: string } }>, reply: FastifyReply) {
    const subtitle = await prisma.subtitle.findUnique({ where: { id: req.params.subtitleId } });
    if (!subtitle) {
      return reply.status(404).send({ error: 'Subtitle not found' });
    }

    const resolved = path.resolve(subtitle.path);
    if (resolved !== MEDIA_ROOT && !resolved.startsWith(MEDIA_ROOT + path.sep)) {
      return reply.status(404).send({ error: 'Subtitle not found' });
    }

    const ext = path.extname(resolved).toLowerCase();
    if (!SUBTITLE_EXTENSIONS.includes(ext)) {
      return reply.status(404).send({ error: 'Subtitle not found' });
    }

    try {
      const buffer = await fs.promises.readFile(resolved);
      const raw = decodeSubtitleBuffer(buffer);
      const offset = parseFloat(req.query.offset ?? '0') || 0;
      const vtt = convertSubtitleToVtt(raw, offset);
      reply.type('text/vtt');
      return reply.send(vtt);
    } catch (e) {
      return reply.status(404).send({ error: 'Subtitle not found' });
    }
  },
};
