import {
  TranscodeSessionManager,
  getTranscodeSettings,
  getAlignedPosition,
  isResolution,
} from '@roomies/transcoding';
import { roomStore } from '../room/store';
import { SessionScope, sessionScopeToId } from './types';
import { ensurePlaybackSession } from './helpers';

export interface SeekResult {
  /** The transcode start offset to use for HLS streams. */
  effectiveOffset: number;
  /** True when the seek target is outside the current variant coverage and FFmpeg must restart. */
  needsReinit: boolean;
}

/** Unified decision point for seek operations across session scopes. */
export class SessionPlaybackCoordinator {
  /** Last soft-warmed resolution/offset per async user — avoid per-heartbeat spawn/force-resume. */
  private lastAsyncWarm = new Map<string, { resolution: string; offset: number }>();

  updateAsyncPlayhead(userId: string, position: number, resolution?: string): number | null {
    const session = TranscodeSessionManager.getSession('async');
    if (!session) return null;

    const swappedOffset = session.updatePlayhead(userId, position, resolution);

    if (swappedOffset !== null) {
      roomStore.updateMember(userId, { asyncSession: { transcodeOffset: swappedOffset } });
    }

    // Soft warm only when resolution/offset changes.
    if (isResolution(resolution)) {
      const offset =
        swappedOffset
        ?? session.getPlayheadOffset(userId)
        ?? roomStore.getState().members.find((m) => m.userId === userId)?.asyncSession?.transcodeOffset;
      if (offset != null && offset >= 0) {
        const prev = this.lastAsyncWarm.get(userId);
        const changed = !prev || prev.resolution !== resolution || prev.offset !== offset;
        if (changed) {
          this.lastAsyncWarm.set(userId, { resolution, offset });
          const { ffmpegPreset, hwAccelMode } = getTranscodeSettings();
          session.ensureVariantReady(resolution, offset, ffmpegPreset, hwAccelMode).catch((err) => {
            console.error(`[coordinator] soft warm ${resolution}@${offset} failed:`, err);
          });
        }
      }
    }

    return swappedOffset;
  }

  removeAsyncPlayhead(userId: string) {
    this.lastAsyncWarm.delete(userId);
    const session = TranscodeSessionManager.getSession('async');
    if (session) {
      session.removePlayhead(userId);
    }
  }

  updateSyncPlayhead(userId: string, position: number, resolution?: string) {
    const session = TranscodeSessionManager.getSession('sync');
    if (session) {
      session.updatePlayhead(userId, position, resolution);
    }
  }

  removeSyncPlayhead(userId: string) {
    const session = TranscodeSessionManager.getSession('sync');
    if (session) {
      session.removePlayhead(userId);
    }
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
  async resolveSeek(
    scope: SessionScope,
    position: number,
    mediaFileId: string,
    forceNewOffset: boolean = false,
  ): Promise<SeekResult> {
    const sessionId = sessionScopeToId(scope);
    let session = TranscodeSessionManager.getSession(sessionId);

    // No existing session → uncovered by definition.
    if (!session || session.mediaFileId !== mediaFileId) {
      const offset = getAlignedPosition(position);
      session = await ensurePlaybackSession(sessionId, mediaFileId);
      const { ffmpegPreset, hwAccelMode } = getTranscodeSettings();
      session.seek(position, -1, ffmpegPreset, hwAccelMode, session.policy.variants).catch((err) => {
        console.error(`[coordinator] session.seek (bootstrap) failed for ${sessionId}/${mediaFileId}:`, err);
      });
      return { effectiveOffset: offset, needsReinit: true };
    }

    const currentOffset = this.getCurrentOffset(scope);

    if (!forceNewOffset) {
      const isCovered = session.isPositionCovered(position, currentOffset);
      if (isCovered) {
        return { effectiveOffset: currentOffset, needsReinit: false };
      }

      // Is it covered by ANY other active offset in the shared pool?
      const coveringOffset = session.getCoveringOffset(position);
      if (coveringOffset !== null) {
        return { effectiveOffset: coveringOffset, needsReinit: true };
      }
    }

    // Not covered (or forced) — compute aligned offset and begin recreation.
    const newOffset = getAlignedPosition(position);
    const { ffmpegPreset, hwAccelMode } = getTranscodeSettings();

    session.seek(position, currentOffset, ffmpegPreset, hwAccelMode, session.policy.variants).catch((err) => {
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
}

/** Singleton coordinator instance. */
export const coordinator = new SessionPlaybackCoordinator();
