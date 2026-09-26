import { PrismaClient } from '@prisma/client';
import { FastifyBaseLogger } from 'fastify';
import { TranscodeSessionManager, getAlignedPosition, isResolution } from '@roomies/transcoding';
import { NotFoundError } from '../config/errors';
import { RoomStore } from '../room/store';
import { SessionScope, sessionScopeToId } from './helpers';

export interface SeekResult {
  /** The transcode start offset to use for HLS streams. */
  effectiveOffset: number;
  /** True when the seek target is outside the current variant coverage and FFmpeg must restart. */
  needsReinit: boolean;
}

/** Unified decision point for transcode sessions and seek operations across session scopes. */
export class PlaybackCoordinator {
  /** Last soft-warmed resolution/offset per async user — avoid per-heartbeat spawn/force-resume. */
  private lastAsyncWarm = new Map<string, { resolution: string; offset: number }>();

  constructor(
    private readonly prisma: PrismaClient,
    private readonly roomStore: RoomStore,
    private readonly transcoder: TranscodeSessionManager,
    private readonly log: FastifyBaseLogger,
  ) {}

  /** Ensure a TranscodeSession exists for playlist/seek paths (loads audio track descriptors). */
  async ensureSession(sessionId: string, mediaFileId: string) {
    const existing = this.transcoder.getSession(sessionId);
    if (existing) {
      if (existing.mediaFileId !== mediaFileId) throw new NotFoundError('Session media mismatch');
      return existing;
    }

    const mediaFile = await this.prisma.mediaFile.findUnique({
      where: { id: mediaFileId },
      include: { audioTracks: { orderBy: { streamIndex: 'asc' } } },
    });
    if (!mediaFile) throw new NotFoundError('Media file not found');

    const audioTracks = mediaFile.audioTracks.map((a) => ({ id: a.id, streamIndex: a.streamIndex }));
    return this.transcoder.startSession(sessionId, mediaFileId, mediaFile.path, audioTracks);
  }

  updateAsyncPlayhead(userId: string, position: number, resolution?: string): number | null {
    const session = this.transcoder.getSession('async');
    if (!session) return null;

    const swappedOffset = session.updatePlayhead(userId, position);
    if (swappedOffset !== null) {
      this.roomStore.updateMember(userId, { asyncSession: { transcodeOffset: swappedOffset } });
    }

    // Soft warm only when resolution/offset changes.
    if (!isResolution(resolution)) return swappedOffset;
    const offset = swappedOffset ?? session.getPlayheadOffset(userId) ?? this.roomStore.getMember(userId)?.asyncSession?.transcodeOffset;
    if (offset == null || offset < 0) return swappedOffset;

    const prev = this.lastAsyncWarm.get(userId);
    if (!prev || prev.resolution !== resolution || prev.offset !== offset) {
      this.lastAsyncWarm.set(userId, { resolution, offset });
      session.ensureVariantReady(resolution, offset).catch((err) => {
        this.log.error({ err, resolution, offset }, 'Async soft warm failed');
      });
    }
    return swappedOffset;
  }

  removeAsyncPlayhead(userId: string): void {
    this.lastAsyncWarm.delete(userId);
    this.transcoder.getSession('async')?.removePlayhead(userId);
  }

  updateSyncPlayhead(userId: string, position: number): void {
    this.transcoder.getSession('sync')?.updatePlayhead(userId, position);
  }

  removeSyncPlayhead(userId: string): void {
    this.transcoder.getSession('sync')?.removePlayhead(userId);
  }

  /**
   * Resolve a seek request for the given session.
   *
   * 1. Look up the existing TranscodeSession (by scope).
   * 2. If it exists and covers the requested position, reuse the current offset.
   * 3. Otherwise compute a new aligned offset and kick off variant recreation.
   *
   * The variant recreation is fire-and-forget: the caller can return the new
   * offset immediately while FFmpeg spins up in the background.
   */
  async resolveSeek(scope: SessionScope, position: number, mediaFileId: string, forceNewOffset = false): Promise<SeekResult> {
    const sessionId = sessionScopeToId(scope);
    const existing = this.transcoder.getSession(sessionId);
    const isFreshSession = !existing || existing.mediaFileId !== mediaFileId;
    const session = isFreshSession ? await this.ensureSession(sessionId, mediaFileId) : existing;
    const currentOffset = isFreshSession ? -1 : this.getCurrentOffset(scope);

    if (!isFreshSession && !forceNewOffset) {
      if (session.isPositionCovered(position, currentOffset)) {
        return { effectiveOffset: currentOffset, needsReinit: false };
      }
      // Is it covered by ANY other active offset in the shared pool?
      const coveringOffset = session.getCoveringOffset(position);
      if (coveringOffset !== null) {
        return { effectiveOffset: coveringOffset, needsReinit: true };
      }
    }

    // Not covered, forced, or no session yet — compute aligned offset and begin recreation.
    const effectiveOffset = getAlignedPosition(position);
    if (scope.type === 'room') session.stopIdleGroups(effectiveOffset);
    session.seek(position, currentOffset).catch((err) => {
      this.log.error({ err, sessionId, mediaFileId }, 'Session seek failed');
    });
    return { effectiveOffset, needsReinit: true };
  }

  /** Read the current transcode offset for a given scope from the room store. */
  private getCurrentOffset(scope: SessionScope): number {
    const state = this.roomStore.getState();
    if (scope.type === 'room') return state.transcodeOffset;
    return this.roomStore.getMember(scope.userId)?.asyncSession?.transcodeOffset ?? state.transcodeOffset;
  }
}
