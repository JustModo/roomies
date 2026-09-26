import { PrismaClient } from '@prisma/client';
import { FastifyBaseLogger } from 'fastify';
import { AUDIO_BITRATE, GroupStoppedError, RESOLUTION_PRESETS, Resolution, SEGMENT_DURATION, TranscodeSessionManager } from '@roomies/transcoding';
import { NotFoundError } from '../config/errors';
import { RoomStore } from '../room/store';
import { SocketHub } from '../websocket/hub';
import { SocketContext, SocketGuard, SocketPayload } from '../websocket/router';
import { PlaybackCoordinator } from './coordinator';
import { SessionScope, buildMediaChangedPayload, getMasterPlaylistUrl, mediaChangedFor, serveHlsPlaylist } from './helpers';

export type PlaybackEvent = 'playback.play' | 'playback.pause' | 'playback.seek' | 'playback.set_rate';
type PlaybackAction = 'play' | 'pause' | 'seek' | 'rate';

const quoted = (value: string) => `"${value.replace(/["\r\n]/g, '')}"`;
const withOffset = (url: string, offset?: number) => (offset !== undefined ? `${url}?offset=${offset}` : url);
const notFoundIfStopped = (err: unknown): never => {
  throw err instanceof GroupStoppedError ? new NotFoundError('Transcode offset is no longer active') : err;
};

export class PlaybackService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly roomStore: RoomStore,
    private readonly hub: SocketHub,
    private readonly coordinator: PlaybackCoordinator,
    private readonly transcoder: TranscodeSessionManager,
    private readonly log: FastifyBaseLogger,
  ) {}

  /** Blocks commands from users whose controls an admin has locked. */
  controlsUnlocked: SocketGuard<SocketPayload<PlaybackEvent>> = (_payload, ctx) => !this.roomStore.getMember(ctx.userId)?.controlsLocked;

  hasMedia: SocketGuard<SocketPayload<PlaybackEvent>> = () => !!this.roomStore.getState().mediaId;

  async changeMedia(mediaFileId: string) {
    const mediaFile = await this.prisma.mediaFile.findUnique({
      where: { id: mediaFileId },
      include: { subtitles: true, audioTracks: { orderBy: { streamIndex: 'asc' } } },
    });
    if (!mediaFile) throw new NotFoundError('Media file not found');

    const subtitles = mediaFile.subtitles.map((s) => ({ id: s.id, language: s.language }));
    const audioTracks = mediaFile.audioTracks.map((a) => ({ id: a.id, language: a.language, title: a.title, channels: a.channels }));
    const audioTrackDescriptors = mediaFile.audioTracks.map((a) => ({ id: a.id, streamIndex: a.streamIndex }));

    await this.transcoder.stopSession('async');
    const session = this.transcoder.startSession('sync', mediaFileId, mediaFile.path, audioTrackDescriptors);
    const hlsUrl = getMasterPlaylistUrl(mediaFileId);

    // One worker creation covers every configured resolution together.
    session.ensureVariantReady(session.policy.variants[0], 0).catch((err) => {
      if (!(err instanceof GroupStoppedError)) this.log.error({ err, mediaFileId }, 'Failed to pre-warm session');
    });

    this.roomStore.updateMedia(mediaFileId, mediaFile.title, hlsUrl, mediaFile.duration, 0, subtitles, audioTracks);
    this.roomStore.updatePlayback({ state: 'buffering', intendedState: 'paused', anchorPosition: 0, anchorTime: Date.now() });
    this.roomStore.resetAllMembers();
    this.broadcastMediaChanged(
      buildMediaChangedPayload({ mediaFileId, title: mediaFile.title, duration: mediaFile.duration, subtitles, audioTracks }),
    );

    this.log.info({ mediaFileId, title: mediaFile.title }, 'Media changed');
    return { hlsUrl, mediaFileId, title: mediaFile.title, subtitles, audioTracks };
  }

  async stopMedia(): Promise<void> {
    await this.transcoder.stopAll();
    this.roomStore.updateMedia('', '', '', 0, 0, [], []);
    this.roomStore.updatePlayback({ state: 'paused', intendedState: 'paused', anchorPosition: 0, anchorTime: Date.now() });
    this.roomStore.resetAllMembers();
    this.broadcastMediaChanged(buildMediaChangedPayload({ mediaFileId: '', title: '', duration: 0 }));
    this.log.info('Media playback stopped');
  }

  getActivePlayback() {
    const state = this.roomStore.getState();
    const session = this.transcoder.getSession('sync');

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

  async generateMasterPlaylist(mediaId: string, offset?: number, sessionId = 'sync'): Promise<string> {
    const mediaFile = await this.prisma.mediaFile.findUnique({
      where: { id: mediaId },
      include: { audioTracks: { orderBy: { streamIndex: 'asc' } } },
    });
    if (!mediaFile) throw new NotFoundError('Media file not found');

    const hasSeparateAudio = mediaFile.audioTracks.length > 1;
    const lines = ['#EXTM3U'];

    if (hasSeparateAudio) {
      mediaFile.audioTracks.forEach((track, i) => {
        const attrs = [
          'TYPE=AUDIO',
          'GROUP-ID="audio"',
          `NAME=${quoted(track.title || track.language || `Track ${i + 1}`)}`,
          ...(track.language ? [`LANGUAGE=${quoted(track.language)}`] : []),
          'AUTOSELECT=YES',
          `DEFAULT=${track.isDefault ? 'YES' : 'NO'}`,
          `URI="${withOffset(`audio/${track.id}/stream.m3u8`, offset)}"`,
        ];
        lines.push(`#EXT-X-MEDIA:${attrs.join(',')}`);
      });
    }

    // Advertise only the rungs the worker will actually encode. A source shorter than a
    // rung that would enlarge it is pruned by variantsForSource, and listing it anyway makes
    // resolveAvailableResolution serve the next rung down under its URL — two levels that
    // are byte-identical, which hls.js ABR then oscillates between, flushing the audio
    // buffer on every switch. Highest first.
    const session = await this.coordinator.ensureSession(sessionId, mediaId);
    const variants = [...(await session.availableVariants())].reverse();

    for (const { resolution, width, height } of variants) {
      const preset = RESOLUTION_PRESETS[resolution];
      const audioKbps = parseInt(hasSeparateAudio ? AUDIO_BITRATE : preset.audioBitrate, 10);
      const bandwidth = (parseInt(preset.videoBitrate, 10) + audioKbps) * 1000;
      const audioAttr = hasSeparateAudio ? ',AUDIO="audio"' : '';
      // The encoded frame, not the rung's box — they differ for any non-16:9 source.
      lines.push(
        `#EXT-X-STREAM-INF:BANDWIDTH=${bandwidth},RESOLUTION=${width}x${height},NAME="${resolution}"${audioAttr}`,
        withOffset(`${resolution}/stream.m3u8`, offset),
      );
    }
    return lines.join('\n') + '\n';
  }

  async getVariantPlaylist(mediaId: string, sessionId: string, resolution: Resolution, reqOffset?: number): Promise<string> {
    const session = await this.coordinator.ensureSession(sessionId, mediaId);
    const offset = this.resolvePlaylistOffset(sessionId, reqOffset);

    await session.ensureVariantReady(resolution, offset).catch(notFoundIfStopped);
    return serveHlsPlaylist(session.getVariantOutputDir(resolution, offset), 'stream.m3u8', this.transcoder.options.cacheDir);
  }

  async getAudioPlaylist(mediaId: string, sessionId: string, trackId: string, reqOffset?: number): Promise<string> {
    const session = await this.coordinator.ensureSession(sessionId, mediaId);
    const offset = this.resolvePlaylistOffset(sessionId, reqOffset);

    await session.ensureAudioTrackReady(trackId, offset).catch(notFoundIfStopped);
    return serveHlsPlaylist(session.getAudioOutputDir(trackId, offset), 'playlist.m3u8', this.transcoder.options.cacheDir);
  }

  async handlePlay(_payload: SocketPayload<'playback.play'>, ctx: SocketContext) {
    this.setIntendedState('playing');
    this.broadcastPlaybackState(ctx, 'play');
  }

  async handlePause(_payload: SocketPayload<'playback.pause'>, ctx: SocketContext) {
    this.setIntendedState('paused');
    this.broadcastPlaybackState(ctx, 'pause');
  }

  async handleSetRate(payload: SocketPayload<'playback.set_rate'>, ctx: SocketContext) {
    this.roomStore.updatePlayback({ playbackRate: payload.rate, anchorTime: Date.now() });
    this.broadcastPlaybackState(ctx, 'rate');
  }

  /**
   * Unified seek handler for both room (sync) and user (async) scopes.
   * Coverage/alignment lives in the coordinator; this owns store updates and notifications.
   */
  async handleSeek(payload: SocketPayload<'playback.seek'>, ctx: SocketContext) {
    const state = this.roomStore.getState();
    const position = state.duration > 0 ? Math.min(payload.position, Math.max(0, state.duration - SEGMENT_DURATION)) : payload.position;
    const scope: SessionScope = payload.scope === 'user' ? { type: 'user', userId: ctx.userId } : { type: 'room' };
    const { effectiveOffset, needsReinit } = await this.coordinator.resolveSeek(scope, position, state.mediaId, payload.forceNewOffset);

    if (scope.type === 'user') {
      this.roomStore.updateMember(ctx.userId, { asyncSession: { transcodeOffset: effectiveOffset } });
      if (needsReinit) this.hub.sendTo(ctx.socket, { event: 'media.changed', payload: mediaChangedFor(state, 'user', effectiveOffset) });
      return;
    }

    const { playback } = state;
    const intendedState = playback.state === 'playing' || playback.intendedState === 'playing' ? 'playing' : 'paused';
    this.roomStore.updatePlayback({ state: 'buffering', intendedState, anchorPosition: position, anchorTime: Date.now() });
    this.roomStore.updateTranscodeOffset(effectiveOffset);
    this.roomStore.resetAllMembers();

    if (needsReinit) this.hub.broadcast({ event: 'media.changed', payload: mediaChangedFor(state, 'room', effectiveOffset) });
    this.broadcastPlaybackState(ctx, 'seek');
  }

  private setIntendedState(intendedState: 'playing' | 'paused'): void {
    const { state } = this.roomStore.getState().playback;
    const isPending = state === 'buffering' || state === 'waiting';
    this.roomStore.updatePlayback(isPending ? { intendedState } : { state: intendedState, intendedState, anchorTime: Date.now() });
  }

  /** Resolve playlist start offset: prefer query; async must never fall back to room sync offset. */
  private resolvePlaylistOffset(sessionId: string, reqOffset?: number): number {
    if (reqOffset !== undefined) return reqOffset;
    if (sessionId === 'async') return 0;
    return this.roomStore.getState().transcodeOffset || 0;
  }

  private broadcastPlaybackState(ctx: SocketContext, action: PlaybackAction): void {
    this.hub.broadcast({
      event: 'playback.state',
      payload: { ...this.roomStore.getState().playback, username: ctx.username, action },
    });
  }

  private broadcastMediaChanged(payload: ReturnType<typeof buildMediaChangedPayload>): void {
    this.hub.broadcast({ event: 'media.changed', payload });
    this.hub.broadcast({ event: 'room.state', payload: { room: this.roomStore.getState() } });
  }
}
