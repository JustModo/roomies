import { FastifyInstance } from 'fastify';
import { SocketContext } from '../websocket/router';
import { IncomingSocketMessage } from '@roomies/contracts';
import { roomStore } from '../room/store';
import { SocketEmitter } from '../websocket/emitter';
import { prisma } from '../database/sqlite';
import {
  TranscodeSessionManager,
  RESOLUTION_PRESETS,
  Resolution,
  getTranscodeSettings,
  AUDIO_BITRATE,
  AudioTrackDescriptor,
  policyForSessionId,
} from '@roomies/transcoding';
import { coordinator } from './coordinator';
import { SessionScope } from './types';
import {
  ensurePlaybackSession,
  serveHlsPlaylist,
  buildMediaChangedPayload,
  getMasterPlaylistUrl,
} from './helpers';

export { getMasterPlaylistUrl } from './urls';

type PlayPayload = Extract<IncomingSocketMessage, { event: 'playback.play' }>['payload'];
type PausePayload = Extract<IncomingSocketMessage, { event: 'playback.pause' }>['payload'];
type SeekPayload = Extract<IncomingSocketMessage, { event: 'playback.seek' }>['payload'];
type SetRatePayload = Extract<IncomingSocketMessage, { event: 'playback.set_rate' }>['payload'];

export class PlaybackService {
  static async changeMedia(mediaFileId: string, server: FastifyInstance) {
    const mediaFile = await prisma.mediaFile.findUnique({
      where: { id: mediaFileId },
      include: { subtitles: true, audioTracks: { orderBy: { streamIndex: 'asc' } } },
    });

    if (!mediaFile) {
      throw new Error('Media file not found');
    }

    const subtitles = mediaFile.subtitles.map((s) => ({ id: s.id, language: s.language }));
    const audioTrackDescriptors: AudioTrackDescriptor[] = mediaFile.audioTracks.map((a) => ({ id: a.id, streamIndex: a.streamIndex }));
    const audioTracks = mediaFile.audioTracks.map((a) => ({ id: a.id, language: a.language, title: a.title, channels: a.channels }));

    const session = TranscodeSessionManager.startSession('sync', mediaFileId, mediaFile.path, audioTrackDescriptors);
    const hlsUrl = getMasterPlaylistUrl(mediaFileId);

    // One worker creation covers every configured resolution together.
    const { ffmpegPreset, hwAccelMode } = getTranscodeSettings();
    session.ensureVariantReady(session.policy.variants[0], 0, ffmpegPreset, hwAccelMode).catch((err) => {
      const error = err instanceof Error ? err : new Error(String(err));
      console.error(`[playback] Failed to pre-warm session for ${mediaFileId}:`, error.message);
      session.reportError(session.policy.variants[0], error);
    });

    roomStore.updateMedia(mediaFileId, mediaFile.title, hlsUrl, mediaFile.duration, 0, subtitles, audioTracks);
    roomStore.updatePlayback({ state: 'buffering', intendedState: 'paused', anchorPosition: 0, anchorTime: Date.now() });
    roomStore.resetAllMembers();

    SocketEmitter.broadcastToRoom(server, {
      event: 'media.changed',
      payload: buildMediaChangedPayload({
        mediaFileId,
        title: mediaFile.title,
        duration: mediaFile.duration,
        sessionId: 'sync',
        subtitles,
        audioTracks,
      }),
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
      payload: buildMediaChangedPayload({
        mediaFileId: '',
        title: '',
        duration: 0,
        sessionId: 'sync',
        subtitles: [],
        audioTracks: [],
      }),
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

  static async generateMasterPlaylist(
    mediaId: string,
    offset?: number,
    sessionId: string = 'sync',
  ): Promise<string> {
    const mediaFile = await prisma.mediaFile.findUnique({
      where: { id: mediaId },
      include: { audioTracks: { orderBy: { streamIndex: 'asc' } } },
    });
    if (!mediaFile) {
      throw new Error('Media file not found');
    }
    const audioTracks = mediaFile.audioTracks;
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
          `DEFAULT=${track.isDefault ? 'YES' : 'NO'}`,
          `URI="${url}"`,
        ];
        lines.push(`#EXT-X-MEDIA:${attrs.join(',')}`);
      });
    }

    // Both sync and async workers carry the full resolution ladder, highest first.
    const resolutions: Resolution[] = [...policyForSessionId(sessionId).variants].reverse();

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

  /** Resolve playlist start offset: prefer query; async must never fall back to room sync offset. */
  private static resolvePlaylistOffset(sessionId: string, reqOffset?: number): number {
    if (reqOffset !== undefined) return reqOffset;
    if (sessionId === 'async') return 0;
    return roomStore.getState().transcodeOffset || 0;
  }

  static async getVariantPlaylist(mediaId: string, sessionId: string, resolution: Resolution, reqOffset?: number): Promise<string> {
    const session = await ensurePlaybackSession(sessionId, mediaId);
    const originalPosition = PlaybackService.resolvePlaylistOffset(sessionId, reqOffset);

    const { ffmpegPreset, hwAccelMode } = getTranscodeSettings();
    await session.ensureVariantReady(resolution, originalPosition, ffmpegPreset, hwAccelMode);

    const variantDir = session.getVariantOutputDir(resolution, originalPosition);
    return serveHlsPlaylist(variantDir, 'stream.m3u8');
  }

  static async getAudioPlaylist(mediaId: string, sessionId: string, trackId: string, reqOffset?: number): Promise<string> {
    const session = await ensurePlaybackSession(sessionId, mediaId);
    const originalPosition = PlaybackService.resolvePlaylistOffset(sessionId, reqOffset);

    const { ffmpegPreset, hwAccelMode } = getTranscodeSettings();
    await session.ensureAudioTrackReady(trackId, originalPosition, ffmpegPreset, hwAccelMode);

    const audioDir = session.getAudioOutputDir(trackId, originalPosition);
    return serveHlsPlaylist(audioDir, 'playlist.m3u8');
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
   * Coverage/alignment lives in the coordinator; applySeekResult owns store + notify.
   */
  static async handleSeek(payload: SeekPayload, ctx: SocketContext) {
    const state = roomStore.getState();
    if (!state.mediaId) return;

    const scope: SessionScope = payload.scope === 'user'
      ? { type: 'user', userId: ctx.userId }
      : { type: 'room' };

    const result = await coordinator.resolveSeek(
      scope,
      payload.position,
      state.mediaId,
      payload.forceNewOffset,
    );

    await PlaybackService.applySeekResult(result, scope, payload, ctx, state);
  }

  /** Apply seek result: room broadcasts + buffering; user unicasts only on needsReinit. */
  private static async applySeekResult(
    result: Awaited<ReturnType<typeof coordinator.resolveSeek>>,
    scope: SessionScope,
    payload: SeekPayload,
    ctx: SocketContext,
    state: ReturnType<typeof roomStore.getState>,
  ) {
    const { effectiveOffset, needsReinit } = result;

    if (scope.type === 'room') {
      const currentState = state.playback;
      const nextIntendedState = currentState.state === 'playing' || currentState.intendedState === 'playing' ? 'playing' : 'paused';

      roomStore.updatePlayback({ state: 'buffering', intendedState: nextIntendedState, anchorPosition: payload.position, anchorTime: Date.now() });
      roomStore.updateTranscodeOffset(effectiveOffset);
      roomStore.resetAllMembers();

      SocketEmitter.broadcastToRoom(ctx.app, {
        event: 'media.changed',
        payload: buildMediaChangedPayload({
          mediaFileId: state.mediaId!,
          title: state.mediaTitle || 'Unknown Media',
          duration: state.duration,
          sessionScope: 'room',
          sessionId: 'sync',
          transcodeOffset: effectiveOffset,
          subtitles: state.subtitles,
          audioTracks: state.audioTracks,
        }),
      });

      SocketEmitter.broadcastToRoom(ctx.app, {
        event: 'playback.state',
        payload: {
          ...roomStore.getState().playback,
          username: ctx.username,
          action: 'seek',
        }
      });
      return;
    }

    roomStore.updateMember(ctx.userId, {
      asyncSession: { transcodeOffset: effectiveOffset },
    });

    if (needsReinit) {
      SocketEmitter.sendToClient(ctx.socket, {
        event: 'media.changed',
        payload: buildMediaChangedPayload({
          mediaFileId: state.mediaId!,
          title: state.mediaTitle || 'Unknown Media',
          duration: state.duration,
          sessionScope: 'user',
          sessionId: 'async',
          transcodeOffset: effectiveOffset,
          subtitles: state.subtitles,
          audioTracks: state.audioTracks,
        }),
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
