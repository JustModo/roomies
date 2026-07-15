import { TranscodeSessionManager, getTranscodeSettings, SEGMENT_DURATION } from '@roomies/transcoding';
import { prisma } from '../database/sqlite';
import { roomStore } from '../room/store';
import { SessionScope, sessionScopeToId, OffsetPolicy, defaultOffsetPolicy } from './types';
import { Resolution } from '@roomies/transcoding';

export interface SeekResult {
  /** The transcode start offset to use for HLS streams. */
  effectiveOffset: number;
  /** True when the seek target is outside the current variant coverage and FFmpeg must restart. */
  needsReinit: boolean;
}

/**
 * Single decision point for all seek operations, regardless of session scope.
 *
 * Sync and async sessions go through the same coverage-check → align → recreate
 * pipeline. The only difference is which TranscodeSession is consulted, determined
 * by the SessionScope.
 */
export class SessionPlaybackCoordinator {
  constructor(private offsetPolicy: OffsetPolicy = defaultOffsetPolicy) {}

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
  async resolveSeek(
    scope: SessionScope,
    position: number,
    mediaFileId: string,
  ): Promise<SeekResult> {
    const sessionId = sessionScopeToId(scope);
    const session = TranscodeSessionManager.getSession(sessionId);

    // No existing session → uncovered by definition.
    if (!session || session.mediaFileId !== mediaFileId) {
      const offset = this.offsetPolicy.align(position);
      // Lazily create the session so ensureVariant works on first request.
      await this.ensureSessionExists(sessionId, mediaFileId);
      return { effectiveOffset: offset, needsReinit: true };
    }

    const currentOffset = this.getCurrentOffset(scope);
    const isCovered = session.isPositionCovered(position, currentOffset);

    if (isCovered) {
      return { effectiveOffset: currentOffset, needsReinit: false };
    }

    // Not covered — compute aligned offset and begin recreation.
    const newOffset = this.offsetPolicy.align(position);
    const { ffmpegPreset, hwAccelMode } = getTranscodeSettings();

    // Fire-and-forget: variants spin up in background.
    const resolutionsToPrewarm: Resolution[] = scope.type === 'room' ? ['360p', '720p', '1080p'] : [];
    session.seek(position, currentOffset, ffmpegPreset, hwAccelMode, resolutionsToPrewarm).catch((err) => {
      console.error(`[coordinator] session.seek failed for ${sessionId}/${mediaFileId}:`, err);
    });

    return { effectiveOffset: newOffset, needsReinit: true };
  }

  // ── Helpers ────────────────────────────────────────────────────────

  /** Read the current transcode offset for a given scope from the room store. */
  private getCurrentOffset(scope: SessionScope): number {
    const state = roomStore.getState();
    if (scope.type === 'room') {
      return state.transcodeOffset;
    }
    const member = state.members.find((m) => m.userId === scope.userId);
    return member?.asyncSession?.transcodeOffset ?? state.transcodeOffset;
  }

  /** Ensure a TranscodeSession exists so coverage checks and variant requests work. */
  private async ensureSessionExists(sessionId: string, mediaFileId: string): Promise<void> {
    if (TranscodeSessionManager.getSession(sessionId)) return;
    const mediaFile = await prisma.mediaFile.findUnique({ where: { id: mediaFileId } });
    if (!mediaFile) throw new Error('Media file not found');
    TranscodeSessionManager.startSession(sessionId, mediaFileId, mediaFile.path);
  }
}

/** Singleton coordinator instance. */
export const coordinator = new SessionPlaybackCoordinator();
