import fs from 'fs';
import path from 'path';
import { FastifyInstance } from 'fastify';
import { SocketContext } from '../websocket/router';
import { IncomingSocketMessage } from '@roomies/contracts';
import { roomStore } from '../room/store';
import { SocketEmitter } from '../websocket/emitter';
import { prisma } from '../database/sqlite';
import { TranscodeSessionManager, RESOLUTION_PRESETS, HLS_BASE_URL, CACHE_DIR, Resolution, getTranscodeSettings, SEGMENT_DURATION, AUDIO_BITRATE, AudioTrackDescriptor } from '@roomies/transcoding';
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
      include: { subtitles: true, audioTracks: true },
    });

    if (!mediaFile) {
      throw new Error('Media file not found');
    }

    const subtitles = mediaFile.subtitles.map((s) => ({ id: s.id, language: s.language }));
    const audioTrackDescriptors: AudioTrackDescriptor[] = mediaFile.audioTracks.map((a) => ({ id: a.id, streamIndex: a.streamIndex }));
    const audioTracks = mediaFile.audioTracks.map((a) => ({ id: a.id, language: a.language, title: a.title, channels: a.channels }));

    const session = TranscodeSessionManager.startSession('sync', mediaFileId, mediaFile.path, audioTrackDescriptors);
    const hlsUrl = getMasterPlaylistUrl(mediaFileId);

    // NOTE: Pre-warm all variants in parallel to ensure immediate availability when requested.
    const { ffmpegPreset, hwAccelMode } = getTranscodeSettings();
    const resolutions: Resolution[] = ['360p', '720p', '1080p'];
    Promise.allSettled(
      resolutions.map(res =>
        session.ensureVariantReady(res, 0, ffmpegPreset, hwAccelMode)
      )
    ).then((results) => {
      results.forEach((result, i) => {
        if (result.status === 'rejected') {
          const resolution = resolutions[i];
          const error = result.reason instanceof Error ? result.reason : new Error(String(result.reason));
          console.error(`[playback] Failed to pre-warm ${resolution} for ${mediaFileId}:`, error.message);
          session.reportError(resolution, error);
        }
      });
    });

    roomStore.updateMedia(mediaFileId, mediaFile.title, hlsUrl, mediaFile.duration, 0, subtitles, audioTracks);
    roomStore.updatePlayback({ state: 'buffering', intendedState: 'paused', anchorPosition: 0, anchorTime: Date.now() });
    roomStore.resetAllMembers();

    SocketEmitter.broadcastToRoom(server, {
      event: 'media.changed',
      payload: { mediaFileId, title: mediaFile.title, hlsUrl, duration: mediaFile.duration, subtitles, audioTracks },
    });

    SocketEmitter.broadcastToRoom(server, {
      event: 'room.state',
      payload: { room: roomStore.getState() },
    });

    return { hlsUrl, mediaFileId, title: mediaFile.title, subtitles, audioTracks };
  }

  static async stopMedia(server: FastifyInstance) {
    TranscodeSessionManager.stopAll();
    roomStore.updateMedia('', '', '', 0, 0, [], []);
    roomStore.updatePlayback({ state: 'paused', intendedState: 'paused', anchorPosition: 0, anchorTime: Date.now() });
    roomStore.resetAllMembers();

    SocketEmitter.broadcastToRoom(server, {
      event: 'media.changed',
      payload: { mediaFileId: '', title: '', hlsUrl: '', duration: 0, subtitles: [], audioTracks: [] },
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
      audioTracks: state.audioTracks,
    };
  }

  static async generateMasterPlaylist(mediaId: string, offset?: number): Promise<string> {
    const mediaFile = await prisma.mediaFile.findUnique({ where: { id: mediaId }, include: { audioTracks: true } });
    const audioTracks = mediaFile?.audioTracks ?? [];
    const hasSeparateAudio = audioTracks.length > 1;

    const lines = ['#EXTM3U'];

    if (hasSeparateAudio) {
      audioTracks.forEach((track, i) => {
        const label = track.title || track.language || `Track ${i + 1}`;
        const url = offset !== undefined ? `audio/${track.id}/stream.m3u8?offset=${offset}` : `audio/${track.id}/stream.m3u8`;
        const attrs = [
          'TYPE=AUDIO',
          'GROUP-ID="audio"',
          `NAME="${label}"`,
          ...(track.language ? [`LANGUAGE="${track.language}"`] : []),
          'AUTOSELECT=YES',
          `DEFAULT=${i === 0 ? 'YES' : 'NO'}`,
          `URI="${url}"`,
        ];
        lines.push(`#EXT-X-MEDIA:${attrs.join(',')}`);
      });
    }

    const resolutions: Resolution[] = ['1080p', '720p', '360p'];
    const sharedAudioKbps = parseInt(AUDIO_BITRATE, 10);

    for (const res of resolutions) {
      const preset = RESOLUTION_PRESETS[res];
      const audioKbps = hasSeparateAudio ? sharedAudioKbps : parseInt(preset.audioBitrate, 10);
      const bandwidth = parseInt(preset.videoBitrate, 10) * 1000 + audioKbps * 1000;
      const url = offset !== undefined ? `${res}/stream.m3u8?offset=${offset}` : `${res}/stream.m3u8`;
      const audioAttr = hasSeparateAudio ? ',AUDIO="audio"' : '';
      lines.push(
        `#EXT-X-STREAM-INF:BANDWIDTH=${bandwidth},RESOLUTION=${preset.width}x${preset.height},NAME="${res}"${audioAttr}`,
        url
      );
    }
    return lines.join('\n') + '\n';
  }

  static async getVariantPlaylist(mediaId: string, sessionId: string, resolution: Resolution, reqOffset?: number): Promise<string> {
    let session = TranscodeSessionManager.getSession(sessionId);
    if (!session) {
      const mediaFile = await prisma.mediaFile.findUnique({ where: { id: mediaId }, include: { audioTracks: true } });
      if (!mediaFile) throw new Error('Media not found for session creation');
      const audioTrackDescriptors: AudioTrackDescriptor[] = mediaFile.audioTracks.map((a) => ({ id: a.id, streamIndex: a.streamIndex }));
      session = TranscodeSessionManager.startSession(sessionId, mediaId, mediaFile.path, audioTrackDescriptors);
    }
    if (session.mediaFileId !== mediaId) {
      throw new Error('Session media mismatch');
    }

    // NOTE: Align variant startup position with requested offset or room transcode offset.
    const originalPosition = reqOffset !== undefined ? reqOffset : (roomStore.getState().transcodeOffset || 0);

    const { ffmpegPreset, hwAccelMode } = getTranscodeSettings();
    await session.ensureVariantReady(resolution, originalPosition, ffmpegPreset, hwAccelMode);

    const variantDir = session.getVariantOutputDir(resolution, originalPosition);
    const playlistPath = path.join(variantDir, 'stream.m3u8');

    let content = await fs.promises.readFile(playlistPath, 'utf8');

    // NOTE: Rewrite segment URIs to point to Caddy absolute paths
    const relativeDir = path.relative(CACHE_DIR, variantDir);
    const baseUrl = `${HLS_BASE_URL}/${relativeDir}/`;

    content = content.replace(/^(?!#)(.+)$/gm, `${baseUrl}$1`);

    return content;
  }

  static async getAudioPlaylist(mediaId: string, sessionId: string, trackId: string, reqOffset?: number): Promise<string> {
    let session = TranscodeSessionManager.getSession(sessionId);
    if (!session) {
      const mediaFile = await prisma.mediaFile.findUnique({ where: { id: mediaId }, include: { audioTracks: true } });
      if (!mediaFile) throw new Error('Media not found for session creation');
      const audioTrackDescriptors: AudioTrackDescriptor[] = mediaFile.audioTracks.map((a) => ({ id: a.id, streamIndex: a.streamIndex }));
      session = TranscodeSessionManager.startSession(sessionId, mediaId, mediaFile.path, audioTrackDescriptors);
    }
    if (session.mediaFileId !== mediaId) {
      throw new Error('Session media mismatch');
    }

    const originalPosition = reqOffset !== undefined ? reqOffset : (roomStore.getState().transcodeOffset || 0);

    const { ffmpegPreset, hwAccelMode } = getTranscodeSettings();
    await session.ensureAudioTrackReady(trackId, originalPosition, ffmpegPreset, hwAccelMode);

    const audioDir = session.getAudioOutputDir(trackId, originalPosition);
    const playlistPath = path.join(audioDir, 'playlist.m3u8');

    let content = await fs.promises.readFile(playlistPath, 'utf8');

    const relativeDir = path.relative(CACHE_DIR, audioDir);
    const baseUrl = `${HLS_BASE_URL}/${relativeDir}/`;

    content = content.replace(/^(?!#)(.+)$/gm, `${baseUrl}$1`);

    return content;
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
      payload.forceNewOffset,
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
        audioTracks: state.audioTracks,
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
      payload.forceNewOffset,
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
          hlsUrl: getMasterPlaylistUrl(state.mediaId, 'async'),
          duration: state.duration,
          transcodeOffset: effectiveOffset,
          sessionScope: 'user',
          subtitles: state.subtitles,
          audioTracks: state.audioTracks,
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
