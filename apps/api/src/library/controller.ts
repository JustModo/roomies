import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { FastifyReply, FastifyRequest } from 'fastify';
import { LibraryService, convertSubtitleToVtt } from '@roomies/library';
import { MEDIA_ROOT, SUBTITLE_DATA_DIR } from '@roomies/config';
import { ScanLibraryRequest } from '@roomies/contracts';
import { prisma } from '../database/sqlite';



const SUBTITLE_EXTENSIONS = ['.srt', '.vtt', '.ass', '.ssa'];

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
    const body = buffer.subarray(2);
    const pairCount = Math.floor(body.length / 2);
    const swapped = Buffer.alloc(pairCount * 2);
    for (let i = 0; i < pairCount; i++) {
      swapped[i * 2] = body[i * 2 + 1];
      swapped[i * 2 + 1] = body[i * 2];
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
    const withinRoot = (root: string) => resolved === root || resolved.startsWith(root + path.sep);
    if (!withinRoot(MEDIA_ROOT) && !withinRoot(SUBTITLE_DATA_DIR)) {
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

  async uploadSubtitle(req: FastifyRequest<{ Params: { mediaFileId: string } }>, reply: FastifyReply) {
    const mediaFile = await prisma.mediaFile.findUnique({ where: { id: req.params.mediaFileId } });
    if (!mediaFile) {
      return reply.status(404).send({ error: 'Media file not found' });
    }

    const file = await req.file();
    if (!file) {
      return reply.status(400).send({ error: 'No file uploaded' });
    }

    const ext = path.extname(file.filename).toLowerCase();
    if (!SUBTITLE_EXTENSIONS.includes(ext)) {
      return reply.status(400).send({ error: `Unsupported subtitle extension: ${ext}` });
    }

    const languageField = file.fields.language;
    let providedLanguage = '';
    if (languageField) {
      if (Array.isArray(languageField)) {
        const first = languageField[0];
        if (first && first.type === 'field' && typeof first.value === 'string') {
          providedLanguage = first.value.trim();
        }
      } else if (languageField.type === 'field' && typeof languageField.value === 'string') {
        providedLanguage = languageField.value.trim();
      }
    }
    // Format external subtitle language tag (e.g. 'external' or 'external:<lang>').
    const language = providedLanguage ? `external:${providedLanguage}` : 'external';
    const mediaSubtitleDir = path.join(SUBTITLE_DATA_DIR, mediaFile.id);
    const destPath = path.join(mediaSubtitleDir, `${crypto.randomUUID()}${ext}`);
    await fs.promises.mkdir(mediaSubtitleDir, { recursive: true });
    await fs.promises.writeFile(destPath, await file.toBuffer());

    const subtitle = await prisma.subtitle.create({
      data: { mediaFileId: mediaFile.id, path: destPath, language },
    });

    return reply.status(201).send(subtitle);
  },

  async deleteSubtitle(req: FastifyRequest<{ Params: { subtitleId: string } }>, reply: FastifyReply) {
    const subtitle = await prisma.subtitle.findUnique({ where: { id: req.params.subtitleId } });
    if (!subtitle) {
      return reply.status(404).send({ error: 'Subtitle not found' });
    }

    const isExternal = subtitle.language && (subtitle.language === 'external' || subtitle.language.startsWith('external:'));
    if (!isExternal) {
      return reply.status(400).send({ error: 'Embedded subtitles extracted from video files cannot be deleted' });
    }

    const resolved = path.resolve(subtitle.path);
    if (resolved !== SUBTITLE_DATA_DIR && !resolved.startsWith(SUBTITLE_DATA_DIR + path.sep)) {
      // Only managed subtitles under SUBTITLE_DATA_DIR can be deleted from disk.
      return reply.status(400).send({ error: 'This subtitle is not managed by the app and cannot be deleted here' });
    }

    await prisma.subtitle.delete({ where: { id: subtitle.id } });
    await fs.promises.unlink(resolved).catch(() => { });

    return reply.status(204).send();
  },
};
