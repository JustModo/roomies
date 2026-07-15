import path from 'path';
import { FastifyInstance } from 'fastify';
import { SocketContext } from '../websocket/router';
import { IncomingSocketMessage } from '@roomies/contracts';
import { roomStore } from '../room/store';
import { SocketEmitter } from '../websocket/emitter';
import { prisma } from '../database/sqlite';
import { TranscodeSessionManager, RESOLUTION_PRESETS, HLS_BASE_URL, CACHE_DIR, Resolution, getTranscodeSettings, SEGMENT_DURATION } from '@roomies/transcoding';
import { coordinator } from './coordinator';
import { SessionScope } from './types';

export const getMasterPlaylistUrl = (mediaFileId: string, sessionId: string = 'sync') => `/api/playback/hls/${mediaFileId}/${sessionId}/master.m3u8`;

type PlayPayload = Extract<IncomingSocketMessage, { event: 'playback.play' }>['payload'];
type PausePayload = Extract<IncomingSocketMessage, { event: 'playback.pause' }>['payload'];
type SeekPayload = Extract<IncomingSocketMessage, { event: 'playback.seek' }>['payload'];
type SetRatePayload = Extract<IncomingSocketMessage, { event: 'playback.set_rate' }>['payload'];

export class PlaybackService {
  static async changeMedia(mediaFileId: string, server: FastifyInstance) {
    const mediaFile = await prisma.mediaFile.findUnique({
      where: { id: mediaFileId },
      include: { subtitles: true },
    });

    if (!mediaFile) {
      throw new Error('Media file not found');
    }

    const subtitles = mediaFile.subtitles.map((s) => ({ id: s.id, language: s.language }));

    const session = TranscodeSessionManager.startSession('sync', mediaFileId, mediaFile.path);
    const hlsUrl = getMasterPlaylistUrl(mediaFileId);

    // NOTE: Pre-warm all variants in parallel to ensure immediate availability when requested.
    const { ffmpegPreset, hwAccelMode } = getTranscodeSettings();
    const resolutions: Resolution[] = ['360p', '720p', '1080p'];
    Promise.allSettled(
      resolutions.map(res =>
        session.ensureVariantReady(res, 0, ffmpegPreset, hwAccelMode)
      )
    ).catch((err) => {
      console.error(`[playback] Failed to pre-warm variants for ${mediaFileId}:`, err);
    });

    roomStore.updateMedia(mediaFileId, mediaFile.title, hlsUrl, mediaFile.duration, 0, subtitles);
    roomStore.updatePlayback({ state: 'buffering', intendedState: 'paused', anchorPosition: 0, anchorTime: Date.now() });
    roomStore.resetAllMembers();

    SocketEmitter.broadcastToRoom(server, {
      event: 'media.changed',
      payload: { mediaFileId, title: mediaFile.title, hlsUrl, duration: mediaFile.duration, subtitles },
    });

    SocketEmitter.broadcastToRoom(server, {
      event: 'room.state',
      payload: { room: roomStore.getState() },
    });

    return { hlsUrl, mediaFileId, title: mediaFile.title, subtitles };
  }

  static async stopMedia(server: FastifyInstance) {
    TranscodeSessionManager.stopAll();
    roomStore.updateMedia('', '', '', 0, 0, []);
    roomStore.updatePlayback({ state: 'paused', intendedState: 'paused', anchorPosition: 0, anchorTime: Date.now() });
    roomStore.resetAllMembers();

    SocketEmitter.broadcastToRoom(server, {
      event: 'media.changed',
      payload: { mediaFileId: '', title: '', hlsUrl: '', duration: 0, subtitles: [] },
    });

    SocketEmitter.broadcastToRoom(server, {
      event: 'room.state',
      payload: { room: roomStore.getState() },
    });
  }

  static getActivePlayback() {
    const state = roomStore.getState();
    const session = TranscodeSessionManager.getSession('sync');

    return {
      mediaFileId: state.mediaId || undefined,
      mediaTitle: state.mediaTitle || undefined,
      viewersCount: state.members.length,
      state: state.playback.state,
      hlsUrl: session ? getMasterPlaylistUrl(session.mediaFileId) : undefined,
      subtitles: state.subtitles,
    };
  }

  static generateMasterPlaylist(offset?: number): string {
    const lines = ['#EXTM3U'];
    const resolutions: Resolution[] = ['1080p', '720p', '360p'];

    for (const res of resolutions) {
      const preset = RESOLUTION_PRESETS[res];
      const bandwidth = parseInt(preset.videoBitrate) * 1000 + parseInt(preset.audioBitrate) * 1000;
      const url = offset !== undefined ? `${res}/stream.m3u8?offset=${offset}` : `${res}/stream.m3u8`;
      lines.push(
        `#EXT-X-STREAM-INF:BANDWIDTH=${bandwidth},RESOLUTION=${preset.width}x${preset.height},NAME="${res}"`,
        url
      );
    }
    return lines.join('\n') + '\n';
  }

  static async ensureVariant(mediaId: string, sessionId: string, resolution: Resolution, reqOffset?: number): Promise<string> {
    let session = TranscodeSessionManager.getSession(sessionId);
    if (!session) {
      const mediaFile = await prisma.mediaFile.findUnique({ where: { id: mediaId } });
      if (!mediaFile) throw new Error('Media not found for session creation');
      session = TranscodeSessionManager.startSession(sessionId, mediaId, mediaFile.path);
    }
    if (session.mediaFileId !== mediaId) {
      throw new Error('Session media mismatch');
    }
    
    // NOTE: Align variant startup position with requested offset or room transcode offset.
    const position = reqOffset !== undefined ? reqOffset : (roomStore.getState().transcodeOffset || 0);
    const { ffmpegPreset, hwAccelMode } = getTranscodeSettings();
    await session.ensureVariantReady(resolution, position, ffmpegPreset, hwAccelMode);
    
    const variantDir = session.getVariantOutputDir(resolution, position);
    const relativePath = path.relative(CACHE_DIR, variantDir);
    return `${HLS_BASE_URL}/${relativePath}/stream.m3u8`;
  }

  static async handlePlay(payload: PlayPayload, ctx: SocketContext) {

    roomStore.updatePlayback({ state: 'playing', intendedState: 'playing', anchorTime: Date.now() });
    SocketEmitter.broadcastToRoom(ctx.app, {
      event: 'playback.state',
      payload: {
        ...roomStore.getState().playback,
        username: ctx.username,
        action: 'play',
      }
    });
  }

  static async handlePause(payload: PausePayload, ctx: SocketContext) {

    roomStore.updatePlayback({ state: 'paused', intendedState: 'paused', anchorTime: Date.now() });
    SocketEmitter.broadcastToRoom(ctx.app, {
      event: 'playback.state',
      payload: {
        ...roomStore.getState().playback,
        username: ctx.username,
        action: 'pause',
      }
    });
  }

  /**
   * Unified seek handler for both room (sync) and user (async) scopes.
   *
   * The coordinator makes the coverage/alignment decision identically for
   * both scopes. The only difference is how the result is communicated:
   * - room: broadcast to all clients
   * - user: send only to the requesting client
   */
  static async handleSeek(payload: SeekPayload, ctx: SocketContext) {
    const state = roomStore.getState();
    const scope: SessionScope = payload.scope === 'user'
      ? { type: 'user', userId: ctx.userId }
      : { type: 'room' };

    if (!state.mediaId) return;

    if (scope.type === 'user') {
      await PlaybackService.handleUserSeek(payload, ctx, state);
    } else {
      await PlaybackService.handleRoomSeek(payload, ctx, state);
    }
  }

  // ── Room-scoped seek (sync) ──────────────────────────────────────────

  private static async handleRoomSeek(payload: SeekPayload, ctx: SocketContext, state: ReturnType<typeof roomStore.getState>) {
    const currentState = state.playback;
    const nextIntendedState = currentState.state === 'playing' || currentState.intendedState === 'playing' ? 'playing' : 'paused';

    const { effectiveOffset } = await coordinator.resolveSeek(
      { type: 'room' },
      payload.position,
      state.mediaId,
    );

    roomStore.updatePlayback({ state: 'buffering', intendedState: nextIntendedState, anchorPosition: payload.position, anchorTime: Date.now() });
    roomStore.updateTranscodeOffset(effectiveOffset);
    roomStore.resetAllMembers();

    SocketEmitter.broadcastToRoom(ctx.app, {
      event: 'media.changed',
      payload: {
        mediaFileId: state.mediaId,
        title: state.mediaTitle || 'Unknown Media',
        hlsUrl: getMasterPlaylistUrl(state.mediaId),
        duration: state.duration,
        transcodeOffset: effectiveOffset,
        sessionScope: 'room',
        subtitles: state.subtitles,
      }
    });

    SocketEmitter.broadcastToRoom(ctx.app, {
      event: 'playback.state',
      payload: {
        ...roomStore.getState().playback,
        username: ctx.username,
        action: 'seek',
      }
    });
  }

  // ── User-scoped seek (async) ─────────────────────────────────────────

  private static async handleUserSeek(payload: SeekPayload, ctx: SocketContext, state: ReturnType<typeof roomStore.getState>) {
    const { effectiveOffset, needsReinit } = await coordinator.resolveSeek(
      { type: 'user', userId: ctx.userId },
      payload.position,
      state.mediaId,
    );

    // Persist the user's async offset so cache GC can track it.
    roomStore.updateMember(ctx.userId, {
      asyncSession: { transcodeOffset: effectiveOffset },
    });

    // Only notify the client when the offset actually changed.
    if (needsReinit) {
      SocketEmitter.sendToClient(ctx.socket, {
        event: 'media.changed',
        payload: {
          mediaFileId: state.mediaId,
          title: state.mediaTitle || 'Unknown Media',
          hlsUrl: getMasterPlaylistUrl(state.mediaId, ctx.userId),
          duration: state.duration,
          transcodeOffset: effectiveOffset,
          sessionScope: 'user',
          subtitles: state.subtitles,
        }
      });
    }
  }

  static async handleSetRate(payload: SetRatePayload, ctx: SocketContext) {

    roomStore.updatePlayback({ playbackRate: payload.rate, anchorTime: Date.now() });
    SocketEmitter.broadcastToRoom(ctx.app, {
      event: 'playback.state',
      payload: {
        ...roomStore.getState().playback,
        username: ctx.username,
        action: 'rate',
      }
    });
  }
}
