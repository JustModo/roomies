import { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { ChangeMediaRequestSchema } from '@roomies/contracts';
import { Resolution, isResolution } from '@roomies/transcoding';
import { BadRequestError, NotFoundError } from '../config/errors';
import { RoomStore } from '../room/store';
import { PlaybackService } from './service';

const HlsParamsSchema = z.object({
  mediaId: z.string(),
  sessionId: z.enum(['sync', 'async']),
  resolution: z.custom<Resolution>((value) => typeof value === 'string' && isResolution(value)).optional(),
  trackId: z.string().optional(),
});

const HlsQuerySchema = z.object({
  offset: z.coerce.number().nonnegative().optional(),
});

export type HlsRoute = { Params: z.infer<typeof HlsParamsSchema>; Querystring: z.infer<typeof HlsQuerySchema> };
type HlsRequest = FastifyRequest<HlsRoute>;

const sendPlaylist = (reply: FastifyReply, playlist: string) =>
  reply
    .header('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate')
    .type('application/vnd.apple.mpegurl')
    .send(playlist);

export class PlaybackController {
  constructor(
    private readonly playback: PlaybackService,
    private readonly roomStore: RoomStore,
  ) {}

  /** preHandler: parses HLS params/query and only serves media (and audio tracks) that are currently playing. */
  validateHls = async (req: FastifyRequest) => {
    const params = HlsParamsSchema.safeParse(req.params);
    const query = HlsQuerySchema.safeParse(req.query);
    if (!params.success || !query.success) throw new BadRequestError('Invalid HLS request');

    const room = this.roomStore.getState();
    const { mediaId, trackId } = params.data;
    if (mediaId !== room.mediaId) throw new NotFoundError('Media is not playing');
    if (trackId !== undefined && !room.audioTracks.some((track) => track.id === trackId)) {
      throw new NotFoundError('Audio track not found');
    }

    req.params = params.data;
    req.query = query.data;
  };

  changeMedia = async (req: FastifyRequest, reply: FastifyReply) => {
    const body = ChangeMediaRequestSchema.safeParse(req.body);
    if (!body.success) throw new BadRequestError('Invalid request data', body.error.format());

    return reply.send(await this.playback.changeMedia(body.data.mediaFileId));
  };

  stopMedia = async (_req: FastifyRequest, reply: FastifyReply) => {
    await this.playback.stopMedia();
    return reply.send({ success: true });
  };

  getActive = async (_req: FastifyRequest, reply: FastifyReply) => {
    return reply.send(this.playback.getActivePlayback());
  };

  getMasterPlaylist = async (req: HlsRequest, reply: FastifyReply) => {
    const { mediaId, sessionId } = req.params;
    return sendPlaylist(reply, await this.playback.generateMasterPlaylist(mediaId, req.query.offset, sessionId));
  };

  getVariantStream = async (req: HlsRequest, reply: FastifyReply) => {
    const { mediaId, sessionId, resolution } = req.params;
    return sendPlaylist(reply, await this.playback.getVariantPlaylist(mediaId, sessionId, resolution!, req.query.offset));
  };

  getAudioStream = async (req: HlsRequest, reply: FastifyReply) => {
    const { mediaId, sessionId, trackId } = req.params;
    return sendPlaylist(reply, await this.playback.getAudioPlaylist(mediaId, sessionId, trackId!, req.query.offset));
  };
}
