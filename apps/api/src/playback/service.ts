import path from 'path';
import { FastifyInstance } from 'fastify';
import { SocketContext } from '../websocket/router';
import { IncomingSocketMessage } from '@roomies/contracts';
import { roomStore } from '../room/store';
import { SocketEmitter } from '../websocket/emitter';
import { prisma } from '../database/sqlite';
import { TranscodeSessionManager, RESOLUTION_PRESETS, HLS_BASE_URL, CACHE_DIR, Resolution, getTranscodeSettings } from '@roomies/transcoding';

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

    // Fast-start: pre-warm ALL variants in parallel so that by the time the
    // client's hls.js requests any quality, the first segments are already on
    // disk. Jellyfin does the same — it transcodes all streams immediately
    // rather than waiting for the player to pick a quality.
    const { ffmpegPreset, hwAccelMode } = getTranscodeSettings();
    const resolutions: Resolution[] = ['360p', '720p', '1080p'];
    Promise.allSettled(
      resolutions.map(res =>
        session.ensureVariantReady(res, 0, ffmpegPreset, hwAccelMode)
      )
    ).catch((err) => {
      console.error(`[playback] Failed to pre-warm variants for ${mediaFileId}:`, err);
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
    
    // Align variant startup position with the session's active transcode offset (or 0 if none)
    const position = session.getTranscodeOffset();
    const { ffmpegPreset, hwAccelMode } = getTranscodeSettings();
    await session.ensureVariantReady(resolution, position, ffmpegPreset, hwAccelMode);
    
    const variantDir = session.getVariantOutputDir(resolution);
    const relativePath = path.relative(CACHE_DIR, variantDir);
    return `${HLS_BASE_URL}/${relativePath}/stream.m3u8`;
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
    
    const state = roomStore.getState();
    const session = TranscodeSessionManager.getSession();
    
    let actualOffset = payload.position;
    
    if (session && state.mediaId === session.mediaFileId) {
      const { ffmpegPreset, hwAccelMode } = getTranscodeSettings();
      
      // Perform seek at the session level to coordinate all active variants
      const seekPromise = session.seek(payload.position, ffmpegPreset, hwAccelMode);
      
      actualOffset = session.getTranscodeOffset();
      
      roomStore.updatePlayback({ state: 'buffering', intendedState: nextIntendedState, anchorPosition: payload.position, anchorTime: Date.now() });
      roomStore.updateTranscodeOffset(actualOffset);
      roomStore.resetAllMembers();
      
      seekPromise.catch((err) => {
        console.error(`[playback] session.seek failed for ${state.mediaId}:`, err);
      });

      // Force clients to rebuild HLS from the new position
      SocketEmitter.broadcastToRoom(ctx.app, {
        event: 'media.changed',
        payload: {
          mediaFileId: state.mediaId,
          title: state.mediaTitle || 'Unknown Media',
          hlsUrl: getMasterPlaylistUrl(state.mediaId),
          duration: state.duration,
          transcodeOffset: actualOffset,
        }
      });
    } else {
      roomStore.updatePlayback({ state: 'buffering', intendedState: nextIntendedState, anchorPosition: payload.position, anchorTime: Date.now() });
      roomStore.updateTranscodeOffset(actualOffset);
      roomStore.resetAllMembers();
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
