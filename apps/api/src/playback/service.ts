import { FastifyInstance } from 'fastify';
import { SocketContext } from '../websocket/router';
import { IncomingSocketMessage } from '@roomies/contracts';
import { roomStore } from '../room/store';
import { SocketEmitter } from '../websocket/emitter';
import { prisma } from '../database/sqlite';
import { TranscodeSessionManager, RESOLUTION_PRESETS, HLS_BASE_URL, Resolution } from '@roomies/transcoding';
import { getTranscodeSettings } from '../config/settings';

/** Builds the API route this app serves the dynamic master.m3u8 from. */
const getMasterPlaylistUrl = (mediaFileId: string) => `/api/playback/hls/${mediaFileId}/master.m3u8`;

type PlayPayload = Extract<IncomingSocketMessage, { event: 'playback.play' }>['payload'];
type PausePayload = Extract<IncomingSocketMessage, { event: 'playback.pause' }>['payload'];
type SeekPayload = Extract<IncomingSocketMessage, { event: 'playback.seek' }>['payload'];
type SetRatePayload = Extract<IncomingSocketMessage, { event: 'playback.set_rate' }>['payload'];

export class PlaybackService {
  /**
   * HTTP: Changes the currently playing media in the room.
   */
  static async changeMedia(mediaFileId: string, server: FastifyInstance) {
    const mediaFile = await prisma.mediaFile.findUnique({
      where: { id: mediaFileId },
    });

    if (!mediaFile) {
      throw new Error('Media file not found');
    }

    const session = TranscodeSessionManager.startSession(mediaFileId, mediaFile.path);
    const hlsUrl = getMasterPlaylistUrl(mediaFileId);

    // Fast-start: pre-warm the lowest-bitrate variant immediately rather than
    // waiting for the client's hls.js to request it, so the first segment is
    // already on disk (or close to it) by the time playback actually starts.
    const { ffmpegPreset, hwAccelMode } = getTranscodeSettings();
    session.ensureVariantReady('360p', 0, ffmpegPreset, hwAccelMode).catch((err) => {
      console.error(`[playback] Failed to pre-warm 360p variant for ${mediaFileId}:`, err);
    });

    roomStore.updateMedia(mediaFileId, mediaFile.title, hlsUrl, mediaFile.duration);
    roomStore.updatePlayback({ state: 'buffering', intendedState: 'paused', anchorPosition: 0, anchorTime: Date.now() });
    roomStore.resetAllMembers();

    SocketEmitter.broadcastToRoom(server, {
      event: 'media.changed',
      payload: { mediaFileId, title: mediaFile.title, hlsUrl, duration: mediaFile.duration },
    });

    SocketEmitter.broadcastToRoom(server, {
      event: 'room.state',
      payload: { room: roomStore.getState() },
    });

    return { hlsUrl, mediaFileId, title: mediaFile.title };
  }

  /**
   * HTTP: Returns the current active playback state.
   */
  static getActivePlayback() {
    const state = roomStore.getState();
    const session = TranscodeSessionManager.getSession();

    return {
      mediaFileId: state.mediaId || undefined,
      mediaTitle: state.mediaTitle || undefined,
      viewersCount: state.members.length,
      state: state.playback.state,
      hlsUrl: session ? getMasterPlaylistUrl(session.mediaFileId) : undefined,
    };
  }

  /**
   * HTTP: Generates the master.m3u8 playlist statically.
   */
  static generateMasterPlaylist(): string {
    const lines = ['#EXTM3U'];
    const resolutions: Resolution[] = ['1080p', '720p', '360p'];

    for (const res of resolutions) {
      const preset = RESOLUTION_PRESETS[res];
      const bandwidth = parseInt(preset.videoBitrate) * 1000 + parseInt(preset.audioBitrate) * 1000;
      lines.push(
        `#EXT-X-STREAM-INF:BANDWIDTH=${bandwidth},RESOLUTION=${preset.width}x${preset.height},NAME="${res}"`,
        `${res}/stream.m3u8`
      );
    }
    return lines.join('\n') + '\n';
  }

  /**
   * HTTP: Ensures a transcoding variant is running and ready, returns the redirect URL.
   */
  static async ensureVariant(mediaId: string, resolution: Resolution): Promise<string> {
    const session = TranscodeSessionManager.getSession();
    if (!session || session.mediaFileId !== mediaId) {
      throw new Error('Session not found');
    }
    
    const position = roomStore.getState().playback.anchorPosition || 0;
    const { ffmpegPreset, hwAccelMode } = getTranscodeSettings();
    await session.ensureVariantReady(resolution, position, ffmpegPreset, hwAccelMode);
    return `${HLS_BASE_URL}/${mediaId}/${resolution}/stream.m3u8`;
  }

  // --- Socket Event Handlers ---

  static async handlePlay(payload: PlayPayload, ctx: SocketContext) {
    roomStore.updatePlayback({ state: 'playing', intendedState: 'playing', anchorTime: Date.now() });
    SocketEmitter.broadcastToRoom(ctx.app, {
      event: 'playback.state',
      payload: roomStore.getState().playback
    });
  }

  static async handlePause(payload: PausePayload, ctx: SocketContext) {
    roomStore.updatePlayback({ state: 'paused', intendedState: 'paused', anchorTime: Date.now() });
    SocketEmitter.broadcastToRoom(ctx.app, {
      event: 'playback.state',
      payload: roomStore.getState().playback
    });
  }

  static async handleSeek(payload: SeekPayload, ctx: SocketContext) {
    const currentState = roomStore.getState().playback;
    const nextIntendedState = currentState.state === 'playing' || currentState.intendedState === 'playing' ? 'playing' : 'paused';
    
    roomStore.updatePlayback({ state: 'buffering', intendedState: nextIntendedState, anchorPosition: payload.position, anchorTime: Date.now() });
    roomStore.resetAllMembers();
    
    const state = roomStore.getState();
    const session = TranscodeSessionManager.getSession();
    if (session && state.mediaId === session.mediaFileId) {
      // Clear current variants and cache so they are regenerated from the new seek position
      session.clearVariants();

      // Pre-warm the lowest-bitrate variant at the new position so re-seeking
      // doesn't reintroduce the cold-start stall.
      const { ffmpegPreset, hwAccelMode } = getTranscodeSettings();
      session.ensureVariantReady('360p', payload.position, ffmpegPreset, hwAccelMode).catch((err) => {
        console.error(`[playback] Failed to pre-warm 360p variant after seek for ${state.mediaId}:`, err);
      });

      // Force clients to rebuild HLS and request the variant from the new position
      SocketEmitter.broadcastToRoom(ctx.app, {
        event: 'media.changed',
        payload: {
          mediaFileId: state.mediaId,
          title: state.mediaTitle || 'Unknown Media',
          hlsUrl: getMasterPlaylistUrl(state.mediaId),
          duration: state.duration,
        }
      });
    }

    SocketEmitter.broadcastToRoom(ctx.app, {
      event: 'playback.state',
      payload: roomStore.getState().playback
    });
  }

  static async handleSetRate(payload: SetRatePayload, ctx: SocketContext) {
    roomStore.updatePlayback({ playbackRate: payload.rate, anchorTime: Date.now() });
    SocketEmitter.broadcastToRoom(ctx.app, {
      event: 'playback.state',
      payload: roomStore.getState().playback
    });
  }
}
