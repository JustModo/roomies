import { FastifyBaseLogger } from 'fastify';
import { mediaChangedFor } from '../playback/helpers';
import { PlaybackCoordinator } from '../playback/coordinator';
import { MemberState, RoomPlaybackState, RoomStore } from '../room/store';
import { SocketHub } from '../websocket/hub';
import { SocketContext, SocketPayload } from '../websocket/router';
import { SYNC_CONFIG } from './config';

type HeartbeatPayload = SocketPayload<'sync.heartbeat'>;
type StatusPayload = SocketPayload<'sync.status'>;
type PositionedHeartbeat = HeartbeatPayload & { position: number };

/** Keeps every member's playhead aligned with the room and owns member status transitions. */
export class SyncService {
  private userStatusLocks = new Map<string, Promise<void>>();

  constructor(
    private readonly roomStore: RoomStore,
    private readonly hub: SocketHub,
    private readonly coordinator: PlaybackCoordinator,
    private readonly log: FastifyBaseLogger,
  ) {}

  async handleHeartbeat(rawPayload: HeartbeatPayload, ctx: SocketContext) {
    if (rawPayload.timestamp !== undefined) {
      this.hub.sendTo(ctx.socket, { event: 'sync.heartbeat_ack', payload: { timestamp: rawPayload.timestamp } });
    }

    const payload = { ...rawPayload, playbackRate: rawPayload.playbackRate ?? this.roomStore.getState().playback.playbackRate };
    const member = this.roomStore.getMember(ctx.userId);
    const statusChanged = !!member && payload.status !== undefined && payload.status !== member.status;
    const pingChanged = !!member && payload.pingQuality !== undefined && payload.pingQuality !== member.pingQuality;

    if (member && pingChanged) {
      this.roomStore.updateMember(ctx.userId, { pingQuality: payload.pingQuality });
      if (!statusChanged) {
        this.hub.broadcast({
          event: 'user.status_changed',
          payload: { userId: ctx.userId, status: member.status, pingQuality: payload.pingQuality },
        });
      }
    }

    if (statusChanged) await this.handleStatus({ status: payload.status! }, ctx);

    if (payload.position === undefined) return;
    const positioned = { ...payload, position: payload.position };
    if (this.roomStore.getMember(ctx.userId)?.status === 'async') {
      this.handleAsyncHeartbeat(positioned, ctx);
    } else {
      this.handleSyncHeartbeat(positioned, ctx);
    }
  }

  /** Serialized per user so rapid status flips can't interleave async enter/exit. */
  async handleStatus(payload: StatusPayload, ctx: SocketContext) {
    const previous = this.userStatusLocks.get(ctx.userId) ?? Promise.resolve();
    const next = previous.then(() =>
      this.applyStatus(payload, ctx).catch((err) => this.log.error({ err, userId: ctx.userId }, 'Error handling status')),
    );
    this.userStatusLocks.set(ctx.userId, next);
    await next;
    if (this.userStatusLocks.get(ctx.userId) === next) this.userStatusLocks.delete(ctx.userId);
  }

  /** Pauses when every member went async, and moves the room between buffering and its intended state. */
  reconcileRoomBufferingState(): void {
    const { members, playback } = this.roomStore.getState();
    const activeMembers = members.filter((m) => m.status !== 'async');

    if (activeMembers.length === 0 && (playback.state === 'playing' || playback.intendedState === 'playing')) {
      return this.updatePlayback({ state: 'paused', intendedState: 'paused', anchorTime: Date.now() });
    }

    const anyoneBuffering = members.some((m) => m.status === 'buffering');
    if (anyoneBuffering && playback.state === 'playing') {
      this.updatePlayback({ state: 'buffering', anchorTime: Date.now() });
    }
    if (!anyoneBuffering && (playback.state === 'waiting' || playback.state === 'buffering') && activeMembers.length > 0) {
      this.updatePlayback({ state: playback.intendedState, anchorTime: Date.now() });
    }
  }

  private handleAsyncHeartbeat(payload: PositionedHeartbeat, ctx: SocketContext) {
    this.roomStore.updateMember(ctx.userId, { position: payload.position, activeResolution: payload.resolution });
    const swappedOffset = this.coordinator.updateAsyncPlayhead(ctx.userId, payload.position, payload.resolution);

    // Client HLS must reinit when the server playhead jumps to another covering offset.
    const state = this.roomStore.getState();
    if (swappedOffset !== null && state.mediaId) {
      this.hub.sendTo(ctx.socket, { event: 'media.changed', payload: mediaChangedFor(state, 'user', swappedOffset) });
    }
  }

  private handleSyncHeartbeat(payload: PositionedHeartbeat, ctx: SocketContext) {
    const { playback } = this.roomStore.getState();

    // NOTE: If the room is buffering, wait for it to resume before enforcing sync.
    if (playback.state !== 'buffering') {
      const expectedPosition = this.roomStore.getCurrentPosition();
      const driftMs = Math.abs(expectedPosition - payload.position) * 1000;
      // NOTE: Cooldown check for hard seeks to prevent feedback loops.
      const now = Date.now();
      const inSeekCooldown = now - (ctx.socket.lastSeekTime ?? 0) < SYNC_CONFIG.HARD_SEEK_COOLDOWN_MS;

      if (driftMs > SYNC_CONFIG.HARD_THRESHOLD_MS && !inSeekCooldown && playback.state === 'playing') {
        ctx.socket.lastSeekTime = now;
        this.log.warn({ userId: ctx.userId, driftMs: Math.round(driftMs), seekTo: expectedPosition }, 'Hard seek correction');
        this.hub.sendTo(ctx.socket, { event: 'sync.correct', payload: { position: expectedPosition, seek: true } });
      } else if (driftMs > SYNC_CONFIG.SOFT_THRESHOLD_MS && playback.state === 'playing') {
        this.applySoftCorrection(ctx, payload, playback, expectedPosition, driftMs);
      } else if (payload.playbackRate !== playback.playbackRate) {
        this.log.info({ userId: ctx.userId, playbackRate: playback.playbackRate }, 'User back in sync, resetting playback rate');
        this.hub.sendTo(ctx.socket, {
          event: 'sync.correct',
          payload: { position: expectedPosition, playbackRate: playback.playbackRate },
        });
      }
    }

    this.roomStore.updateMember(ctx.userId, { position: payload.position, activeResolution: payload.resolution });
    this.coordinator.updateSyncPlayhead(ctx.userId, payload.position);
  }

  /** Nudges the client's rate relative to the room rate; skipped while a correction is already running. */
  private applySoftCorrection(
    ctx: SocketContext,
    payload: PositionedHeartbeat,
    playback: RoomPlaybackState,
    expectedPosition: number,
    driftMs: number,
  ) {
    if (payload.playbackRate !== playback.playbackRate) return;

    const delta = SYNC_CONFIG.SOFT_CORRECTION_RATE_DELTA;
    const correctionRate = playback.playbackRate * (payload.position < expectedPosition ? 1 + delta : 1 - delta);
    const correctionDurationMs = Math.round(driftMs / Math.abs(correctionRate - playback.playbackRate));

    this.log.warn({ userId: ctx.userId, driftMs: Math.round(driftMs), correctionRate, correctionDurationMs }, 'Soft rate correction');
    this.hub.sendTo(ctx.socket, {
      event: 'sync.correct',
      payload: { position: expectedPosition, playbackRate: correctionRate, correctionDurationMs },
    });
  }

  private async applyStatus(payload: StatusPayload, ctx: SocketContext) {
    const state = this.roomStore.getState();
    const member = this.roomStore.getMember(ctx.userId);
    const wasAsync = member?.status === 'async';

    let status = payload.status;
    if (status === 'async' && !state.settings.allowAsyncMode) {
      this.log.warn({ userId: ctx.userId }, 'Rejected async mode while allowAsyncMode is false');
      status = 'ready';
    }

    if (status === 'async' && !wasAsync) {
      await this.enterAsyncMode(ctx, member);
    } else if (status !== 'async' && wasAsync) {
      this.exitAsyncMode(ctx, status);
    } else {
      this.roomStore.updateMember(ctx.userId, { status });
    }

    this.hub.broadcast({ event: 'user.status_changed', payload: { userId: ctx.userId, status, pingQuality: member?.pingQuality } });
    this.reconcileRoomBufferingState();
  }

  /** Starts a user-scoped transcode at the member's current playhead and points their player at it. */
  private async enterAsyncMode(ctx: SocketContext, member: MemberState | undefined) {
    const state = this.roomStore.getState();
    const position = member?.position ?? state.playback.anchorPosition;
    const { effectiveOffset } = await this.coordinator.resolveSeek({ type: 'user', userId: ctx.userId }, position, state.mediaId);

    this.roomStore.updateMember(ctx.userId, { status: 'async', asyncSession: { transcodeOffset: effectiveOffset } });
    this.hub.sendTo(ctx.socket, { event: 'media.changed', payload: mediaChangedFor(state, 'user', effectiveOffset) });
  }

  /** Drops the async session (the transcode GC reclaims it) and points the player back at the room stream. */
  private exitAsyncMode(ctx: SocketContext, status: MemberState['status']) {
    this.roomStore.updateMember(ctx.userId, { status, asyncSession: undefined });
    this.coordinator.removeAsyncPlayhead(ctx.userId);

    const state = this.roomStore.getState();
    this.hub.sendTo(ctx.socket, { event: 'media.changed', payload: mediaChangedFor(state, 'room', state.transcodeOffset) });
  }

  private updatePlayback(updates: Partial<RoomPlaybackState>): void {
    this.roomStore.updatePlayback(updates);
    this.hub.broadcast({ event: 'playback.state', payload: this.roomStore.getState().playback });
  }
}
