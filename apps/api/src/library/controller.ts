import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { PrismaClient } from '@prisma/client';
import { FastifyReply, FastifyRequest } from 'fastify';
import { ScanLibraryRequestSchema } from '@roomies/contracts';
import { LibraryOptions, LibraryService, convertSubtitleToVtt } from '@roomies/library';
import { BadRequestError, NotFoundError } from '../config/errors';

export type SubtitleRoute = { Params: { subtitleId: string }; Querystring: { offset?: string } };
export type UploadRoute = { Params: { mediaFileId: string } };
type SubtitleRequest = FastifyRequest<SubtitleRoute>;
type UploadRequest = FastifyRequest<UploadRoute>;

const SUBTITLE_EXTENSIONS = ['.srt', '.vtt', '.ass', '.ssa'];
const ASS_EXTENSIONS = ['.ass', '.ssa'];

const realpathOrResolve = (filePath: string) => fs.promises.realpath(filePath).catch(() => path.resolve(filePath));

async function isWithinRoot(resolved: string, root: string): Promise<boolean> {
  const relative = path.relative(await realpathOrResolve(root), resolved);
  return relative !== '..' && !relative.startsWith('..' + path.sep) && !path.isAbsolute(relative);
}

/** Decodes by BOM (UTF-8, UTF-16 LE/BE), falling back to latin1 when the bytes aren't valid UTF-8. */
function decodeSubtitleBuffer(buffer: Buffer): string {
  if (buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) return buffer.subarray(3).toString('utf-8');
  if (buffer[0] === 0xff && buffer[1] === 0xfe) return buffer.subarray(2).toString('utf16le');
  if (buffer[0] === 0xfe && buffer[1] === 0xff) {
    const body = buffer.subarray(2);
    return Buffer.from(body.subarray(0, body.length - (body.length % 2)))
      .swap16()
      .toString('utf16le');
  }

  const utf8Text = buffer.toString('utf-8');
  return utf8Text.includes('\uFFFD') ? buffer.toString('latin1') : utf8Text;
}

const isExternalSubtitle = (language: string | null) => language === 'external' || !!language?.startsWith('external:');

export class LibraryController {
  constructor(
    private readonly library: LibraryService,
    private readonly prisma: PrismaClient,
    private readonly options: LibraryOptions,
  ) {}

  getLibraries = async (_req: FastifyRequest, reply: FastifyReply) => {
    return reply.send(await this.library.getLibraries());
  };

  scan = async (req: FastifyRequest, reply: FastifyReply) => {
    const body = ScanLibraryRequestSchema.safeParse(req.body);
    if (!body.success) throw new BadRequestError('Invalid request data', body.error.format());

    return reply.send(await this.library.scan());
  };

  getSubtitle = async (req: SubtitleRequest, reply: FastifyReply) => {
    const subtitle = await this.prisma.subtitle.findUnique({ where: { id: req.params.subtitleId } });
    if (!subtitle) throw new NotFoundError('Subtitle not found');

    const resolved = await realpathOrResolve(subtitle.path);
    const ext = path.extname(resolved).toLowerCase();
    const inAllowedRoot =
      (await isWithinRoot(resolved, this.options.mediaRoot)) || (await isWithinRoot(resolved, this.options.subtitleDataDir));
    if (!inAllowedRoot || !SUBTITLE_EXTENSIONS.includes(ext)) throw new NotFoundError('Subtitle not found');

    const buffer = await fs.promises.readFile(resolved).catch(() => {
      throw new NotFoundError('Subtitle not found');
    });
    const raw = decodeSubtitleBuffer(buffer);
    if (ASS_EXTENSIONS.includes(ext)) {
      return reply.type('text/x-ssa; charset=utf-8').send(raw);
    }

    const offset = parseFloat(req.query.offset ?? '0') || 0;
    return reply.type('text/vtt').send(convertSubtitleToVtt(raw, offset));
  };

  uploadSubtitle = async (req: UploadRequest, reply: FastifyReply) => {
    const mediaFile = await this.prisma.mediaFile.findUnique({ where: { id: req.params.mediaFileId } });
    if (!mediaFile) throw new NotFoundError('Media file not found');

    const file = await req.file();
    if (!file) throw new BadRequestError('No file uploaded');

    const ext = path.extname(file.filename).toLowerCase();
    if (!SUBTITLE_EXTENSIONS.includes(ext)) throw new BadRequestError(`Unsupported subtitle extension: ${ext}`);

    const field = [file.fields.language].flat()[0];
    const providedLanguage = field?.type === 'field' && typeof field.value === 'string' ? field.value.trim() : '';
    // Format external subtitle language tag (e.g. 'external' or 'external:<lang>').
    const language = providedLanguage ? `external:${providedLanguage}` : 'external';

    const mediaSubtitleDir = path.join(this.options.subtitleDataDir, mediaFile.id);
    const destPath = path.join(mediaSubtitleDir, `${crypto.randomUUID()}${ext}`);
    await fs.promises.mkdir(mediaSubtitleDir, { recursive: true });
    await fs.promises.writeFile(destPath, await file.toBuffer());

    const subtitle = await this.prisma.subtitle.create({ data: { mediaFileId: mediaFile.id, path: destPath, language } });
    return reply.status(201).send({ id: subtitle.id, mediaFileId: subtitle.mediaFileId, language: subtitle.language });
  };

  deleteSubtitle = async (req: SubtitleRequest, reply: FastifyReply) => {
    const subtitle = await this.prisma.subtitle.findUnique({ where: { id: req.params.subtitleId } });
    if (!subtitle) throw new NotFoundError('Subtitle not found');
    if (!isExternalSubtitle(subtitle.language)) {
      throw new BadRequestError('Embedded subtitles extracted from video files cannot be deleted');
    }

    // Only managed subtitles under the subtitle data dir can be deleted from disk.
    const resolved = await realpathOrResolve(subtitle.path);
    if (!(await isWithinRoot(resolved, this.options.subtitleDataDir))) {
      throw new BadRequestError('This subtitle is not managed by the app and cannot be deleted here');
    }

    await this.prisma.subtitle.delete({ where: { id: subtitle.id } });
    await fs.promises.unlink(resolved).catch(() => {});
    return reply.status(204).send();
  };
}
