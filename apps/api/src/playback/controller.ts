import { FastifyReply, FastifyRequest } from 'fastify';
import { ChangeMediaRequest } from '@roomies/contracts';
import { prisma } from '../database/sqlite';
import { roomStore } from '../room/store';
import { SocketEmitter } from '../websocket/emitter';
import { TranscodeSessionManager } from '../transcoding';

export const PlaybackController = {
  /**
   * POST /api/playback/change-media
   *
   * Starts playback of a new media file:
   * 1. Looks up the media file by ID
   * 2. Starts a new transcoding session (kills any existing one)
   * 3. Resets all room members to not-ready
   * 4. Broadcasts media.changed + room.state to all clients
   * 5. Returns the HLS URL to the requesting client
   */
  async changeMedia(req: FastifyRequest<{ Body: ChangeMediaRequest }>, reply: FastifyReply) {
    const { mediaFileId } = req.body;

    // 1. Look up the media file
    const mediaFile = await prisma.mediaFile.findUnique({
      where: { id: mediaFileId },
    });

    if (!mediaFile) {
      return reply.status(404).send({ error: 'Media file not found' });
    }

    // 2. Start a new transcoding session
    const session = TranscodeSessionManager.startSession(mediaFileId, mediaFile.path);
    const hlsUrl = session.masterPlaylistUrl;

    // 3. Update room state
    roomStore.updateMedia(mediaFileId, mediaFile.title, hlsUrl, mediaFile.duration);
    roomStore.setPlaybackState('buffering');
    roomStore.updatePlayback({ anchorPosition: 0 });
    roomStore.resetAllMembers();

    // 4. Broadcast to all connected clients
    SocketEmitter.broadcastToRoom(req.server, {
      event: 'media.changed',
      payload: {
        mediaFileId,
        title: mediaFile.title,
        hlsUrl,
      },
    });

    SocketEmitter.broadcastToRoom(req.server, {
      event: 'room.state',
      payload: { room: roomStore.getState() },
    });

    req.log.info({ mediaFileId, title: mediaFile.title }, 'Media changed');

    // 5. Return response to requesting client
    return reply.send({
      hlsUrl,
      mediaFileId,
      title: mediaFile.title,
    });
  },

  /**
   * GET /api/playback/active
   *
   * Returns the current playback state for the lobby/room.
   */
  async getActive(req: FastifyRequest, reply: FastifyReply) {
    const state = roomStore.getState();
    const session = TranscodeSessionManager.getSession();

    return reply.send({
      mediaFileId: state.mediaId || undefined,
      mediaTitle: state.mediaTitle || undefined,
      viewersCount: state.members.length,
      state: state.playback.state,
      hlsUrl: session?.masterPlaylistUrl || undefined,
    });
  },
};
